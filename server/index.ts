import express from 'express';
import { createServer as createHttpServer, type Server as HttpServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { SerialPort } from 'serialport';
import cors from 'cors';
import os from 'os';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { findEsp32Port, watchEsp32Port } from './portDetector.js';
import type { TelemetryPacket } from '../src/types/telemetry.js';
import type { ServerToClientFrame } from './types.js';

const app = express();
const port = parseInt(process.env.PORT ?? '3001');

// Resolve dist directory robustly on Windows (file:// URL pathname handling)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Resolve the `dist/` directory for serving static files.
 * Handles Electron ASAR packaging where `__dirname` may point inside
 * an `.asar` archive and the real `dist/` lives alongside the app.
 */
function resolveDistDir(): string {
  // 1. Standard path: server/../dist (works in dev and unbundled builds)
  const standardDist = path.resolve(__dirname, '..', 'dist');
  if (fs.existsSync(path.join(standardDist, 'index.html'))) {
    return standardDist;
  }

  // 2. Electron ASAR: process.resourcesPath/app/dist
  const resourcesPath = (process as { resourcesPath?: string }).resourcesPath;
  if (typeof resourcesPath === 'string') {
    const asarDist = path.join(resourcesPath, 'app', 'dist');
    if (fs.existsSync(path.join(asarDist, 'index.html'))) {
      return asarDist;
    }
  }

  // 3. Fallback: two levels up from __dirname (covers nested packaging)
  const fallbackDist = path.resolve(__dirname, '..', '..', 'dist');
  if (fs.existsSync(path.join(fallbackDist, 'index.html'))) {
    return fallbackDist;
  }

  // 4. Last resort: return the standard path so express.static logs a clear error
  console.warn(
    `[dist] Could not locate dist/index.html. Checked: ${standardDist}, ${fallbackDist}. ` +
    'Serving from ' + standardDist + ' (files may not be found).'
  );
  return standardDist;
}

const distDir = resolveDistDir();

// CORS enabled for LAN access
app.use(cors({ origin: true }));

// Serve static files from dist on port 3001
app.use(express.static(distDir));

let httpServer: HttpServer;
let wss: WebSocketServer;
let serialPort: SerialPort | null = null;
let lastKnownTelemetry: TelemetryPacket | null = null;
let commandQueue: string[] = [];
let isProcessingCommand = false;
let estopInFlight = false;

// Network interface IP for LAN addressing
const lanIp = (() => {
  const ifaces = os.networkInterfaces();
  for (const iface of Object.values(ifaces)) {
    if (!iface) continue;
    for (const fig of iface) {
      if (fig.family === 'IPv4' && !fig.internal) return fig.address;
    }
  }
  return '127.0.0.1';
})();

// --- Telemetry packet parsing ---

function parseEsp32Line(line: string): TelemetryPacket | null {
  try {
    const data = JSON.parse(line);
    // Validate it's a telemetry frame with required top-level fields
    if (!data.seq || !data.timestamp || !data.bot_status) return null;
    lastKnownTelemetry = data as TelemetryPacket;
    return data as TelemetryPacket;
  } catch {
    return null;
  }
}

// --- WebSocket broadcast helpers ---

const clients = new Set<WebSocket>();

function sendToAll(frame: ServerToClientFrame) {
  const message = JSON.stringify(frame);
  const toRemove: WebSocket[] = [];
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    } else {
      toRemove.push(client);
    }
  }
  for (const client of toRemove) {
    clients.delete(client);
  }
}

function broadcastTelemetry(packet: TelemetryPacket) {
  sendToAll({ type: 'TELEMETRY', packet });
}

function broadcastRawLine(line: string) {
  sendToAll({ type: 'RAW', line });
}

function broadcastStatus(
  status: 'CONNECTED' | 'DISCONNECTED' | 'ERROR',
  message?: string,
  port?: string,
) {
  sendToAll({ type: 'STATUS', status, message, port });
}

function broadcastHydrate(packet: TelemetryPacket | null, bridgeStatus: string) {
  sendToAll({ type: 'HYDRATE', packet: packet ?? null, bridgeStatus });
}

// --- Command queue with 50ms inter-command pacing ---

async function processCommandQueue() {
  if (isProcessingCommand || commandQueue.length === 0) return;
  isProcessingCommand = true;
  const cmd = commandQueue.shift()!;
  try {
    if (estopInFlight && cmd !== 'ESTOP') {
      // Re-queue non-ESTOP commands after ESTOP finishes
      commandQueue.unshift(cmd);
      isProcessingCommand = false;
      return;
    }
    if (serialPort && serialPort.isOpen) {
      const cmdStr = cmd.endsWith('\n') ? cmd : cmd + '\n';
      await new Promise<void>((resolve, reject) => {
        serialPort!.write(cmdStr, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    }
    // ESTOP: immediate high-priority flush + broadcast alert
    if (cmd === 'ESTOP') {
      estopInFlight = true;
      broadcastStatus('CONNECTED', 'ESTOP command sent to ESP32');
      // After a short delay, sever the connection
      setTimeout(() => {
        estopInFlight = false;
        processCommandQueue();
      }, 100);
      return;
    }
  } catch (err) {
    console.error('Failed to send command to serial port:', err);
  }
  isProcessingCommand = false;
  // Process next command after 50ms inter-command pacing
  setTimeout(processCommandQueue, 50);
}

function queueCommand(cmd: string) {
  commandQueue.push(cmd);
  if (!isProcessingCommand) {
    processCommandQueue();
  }
}

// --- Serial port event handlers ---

let serialBuffer = '';

function onSerialData(data: Buffer) {
  const text = data.toString('utf8');
  serialBuffer += text;
  const lines = serialBuffer.split('\n');
  serialBuffer = lines.pop() ?? '';

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const packet = parseEsp32Line(trimmed);
    if (packet) {
      broadcastTelemetry(packet);
    } else {
      broadcastRawLine(trimmed);
    }
  }
}

function onSerialConnect() {
  broadcastStatus('CONNECTED', 'Connected to ESP32 ground bridge');
}

function onSerialDisconnect() {
  broadcastStatus('DISCONNECTED', 'Disconnected from ESP32 ground bridge');
  // Attempt auto-reconnect
  attemptReconnect();
}

function onSerialError(error: Error) {
  broadcastStatus('ERROR', error.message);
}

// --- Auto-reconnect via port watcher ---

function attemptReconnect() {
  watchEsp32Port(async (portPath: string | null) => {
    if (portPath && !serialPort) {
      try {
        await openSerialPort(portPath);
      } catch (err) {
        console.error('Failed to reconnect to serial port:', err);
      }
    } else if (!portPath && serialPort) {
      try { serialPort.close(); } catch { /* ignore */ }
      serialPort = null;
      broadcastStatus('DISCONNECTED', 'ESP32 port lost; reconnection attempted');
    }
  }, { pollIntervalMs: 2000 });
}

// --- Open serial port ---

async function openSerialPort(portPath: string) {
  if (serialPort) {
    try { await serialPort.close(); } catch { /* ignore */ }
  }
  serialPort = new SerialPort({ path: portPath, baudRate: 115200 });
  serialBuffer = '';

  serialPort.on('open', onSerialConnect);
  serialPort.on('close', onSerialDisconnect);
  serialPort.on('data', onSerialData);
  serialPort.on('error', onSerialError);
}

// --- Server setup ---

/**
 * Start the HTTP server with port-in-use protection.
 * If the configured port is already bound, logs an error and tries an alternate port.
 */
function startHttpServer(): Promise<void> {
  return new Promise((resolve, reject) => {
    httpServer = createHttpServer(app);

    const tryListen = (listenPort: number) => {
      httpServer
        .listen(listenPort, () => {
          console.log('=== Artemis Ground Bridge Server ===');
          console.log(`Listening on http://localhost:${listenPort}`);
          console.log(`Listening on http://${lanIp}:${listenPort}`);
          console.log(`API status at http://localhost:${listenPort}/api/status`);
          console.log(`WebSocket at ws://localhost:${listenPort}/ws`);
          // Send initial HYDRATE status
          broadcastHydrate(lastKnownTelemetry, 'BRIDGE_READY');
          resolve();
        })
        .on('error', (err: NodeJS.ErrnoException) => {
          if (err.code === 'EADDRINUSE') {
            console.warn(`[server] Port ${listenPort} is in use. Trying alternate port...`);
            if (listenPort === port) {
              // First failure: try the next port
              tryListen(port + 1);
            } else {
              // Second failure: give up
              console.error(`[server] Could not bind to port ${port} or ${port + 1}. Exiting.`);
              reject(err);
            }
          } else {
            reject(err);
          }
        });
    };

    tryListen(port);
  });
}

export function createServer(): HttpServer {
  void startHttpServer().catch((err) => {
    console.error('[server] Failed to start HTTP server:', err);
  });

  // HTTP health check at /api/status returning bridge connection state
  app.get('/api/status', (_req, res) => {
    const bridgeStatus = serialPort && serialPort.isOpen ? 'CONNECTED' : 'DISCONNECTED';
    const portName = serialPort?.path ?? null;
    res.json({
      bridgeStatus,
      port: portName,
      lanIp,
      serverPort: port,
      lastKnownTelemetrySeq: lastKnownTelemetry?.seq ?? null,
      clientsConnected: clients.size,
    });
  });

  // WebSocket upgrade on the same HTTP port
  wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  wss.on('connection', (ws: WebSocket) => {
    clients.add(ws);
    console.log(`WebSocket client connected. Total clients: ${clients.size}`);
    // Send HYDRATE immediately to late-joining clients
    broadcastHydrate(lastKnownTelemetry, 'BRIDGE_READY');
    // Send current status on connect
    const bs = serialPort && serialPort.isOpen ? 'CONNECTED' : 'DISCONNECTED';
    ws.send(JSON.stringify({
      type: 'STATUS',
      status: bs,
      message: 'Bridge status update',
      port: serialPort?.path,
    }));

    ws.on('close', () => {
      clients.delete(ws);
      console.log(`WebSocket client disconnected. Remaining: ${clients.size}`);
    });

    ws.on('message', async (message: string | Buffer) => {
      let data: { type: string; cmd?: string };
      try {
        data = JSON.parse(message.toString() as string);
      } catch {
        return; // Ignore non-JSON messages
      }
      if (data.type === 'COMMAND' && data.cmd) {
        // Forward command to serial with queue pacing and ESTOP priority
        queueCommand(data.cmd);
      }
    });
  });

  return httpServer;
}

// --- Startup: find port and open ---

void (async () => {
  const portPath = await findEsp32Port();
  if (portPath) {
    await openSerialPort(portPath);
  } else {
    console.log('No ESP32 serial port found on startup; waiting for plug-in...');
    // Start watching for port changes
    watchEsp32Port(async (path: string | null) => {
      if (path && !serialPort) {
        try { await openSerialPort(path); } catch (err) { console.error('Reconnect failed:', err); }
      }
    }, { pollIntervalMs: 2000 });
  }
})();

createServer();
