import express from 'express';
import { createServer as createHttpServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { SerialPort } from 'serialport';
import cors from 'cors';
import os from 'os';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { findEsp32Port, watchEsp32Port } from './portDetector.js';
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
function resolveDistDir() {
    // 1. Standard path: server/../dist (works in dev and unbundled builds)
    const standardDist = path.resolve(__dirname, '..', 'dist');
    if (fs.existsSync(path.join(standardDist, 'index.html'))) {
        return standardDist;
    }
    // 2. Electron ASAR: process.resourcesPath/app/dist
    const resourcesPath = process.resourcesPath;
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
    console.warn(`[dist] Could not locate dist/index.html. Checked: ${standardDist}, ${fallbackDist}. ` +
        'Serving from ' + standardDist + ' (files may not be found).');
    return standardDist;
}
const distDir = resolveDistDir();
// CORS enabled for LAN access
app.use(cors({ origin: true }));
// Serve static files from dist (port determined at listen time)
app.use(express.static(distDir));
let httpServer;
let wss;
let serialPort = null;
let lastKnownTelemetry = null;
let commandQueue = [];
let isProcessingCommand = false;
let estopInFlight = false;
// Network interface IP for LAN addressing
const lanIp = (() => {
    const ifaces = os.networkInterfaces();
    for (const iface of Object.values(ifaces)) {
        if (!iface)
            continue;
        for (const fig of iface) {
            if (fig.family === 'IPv4' && !fig.internal)
                return fig.address;
        }
    }
    return '127.0.0.1';
})();
// --- Telemetry packet parsing ---
function parseEsp32Line(line) {
    try {
        const data = JSON.parse(line);
        // Validate it's a telemetry frame with required top-level fields
        if (!data.seq || !data.timestamp || !data.bot_status)
            return null;
        lastKnownTelemetry = data;
        return data;
    }
    catch {
        return null;
    }
}
// --- WebSocket broadcast helpers ---
const clients = new Set();
function sendToAll(frame) {
    const message = JSON.stringify(frame);
    const toRemove = [];
    for (const client of clients) {
        if (client.readyState === WebSocket.OPEN) {
            client.send(message);
        }
        else {
            toRemove.push(client);
        }
    }
    for (const client of toRemove) {
        clients.delete(client);
    }
}
function broadcastTelemetry(packet) {
    sendToAll({ type: 'TELEMETRY', packet });
}
function broadcastRawLine(line) {
    sendToAll({ type: 'RAW', line });
}
function broadcastStatus(status, message, port) {
    sendToAll({ type: 'STATUS', status, message, port });
}
function broadcastHydrate(packet, bridgeStatus) {
    sendToAll({ type: 'HYDRATE', packet: packet ?? null, bridgeStatus });
}
// --- Command queue with 50ms inter-command pacing ---
async function processCommandQueue() {
    if (isProcessingCommand || commandQueue.length === 0)
        return;
    isProcessingCommand = true;
    const cmd = commandQueue.shift();
    try {
        if (estopInFlight && cmd !== 'ESTOP') {
            // Re-queue non-ESTOP commands after ESTOP finishes
            commandQueue.unshift(cmd);
            isProcessingCommand = false;
            return;
        }
        if (serialPort && serialPort.isOpen) {
            const cmdStr = cmd.endsWith('\n') ? cmd : cmd + '\n';
            await new Promise((resolve, reject) => {
                serialPort.write(cmdStr, (err) => {
                    if (err)
                        reject(err);
                    else
                        resolve();
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
    }
    catch (err) {
        console.error('Failed to send command to serial port:', err);
    }
    isProcessingCommand = false;
    // Process next command after 50ms inter-command pacing
    setTimeout(processCommandQueue, 50);
}
function queueCommand(cmd) {
    commandQueue.push(cmd);
    if (!isProcessingCommand) {
        processCommandQueue();
    }
}
// --- Serial port event handlers ---
let serialBuffer = '';
function onSerialData(data) {
    const text = data.toString('utf8');
    serialBuffer += text;
    const lines = serialBuffer.split('\n');
    serialBuffer = lines.pop() ?? '';
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed)
            continue;
        const packet = parseEsp32Line(trimmed);
        if (packet) {
            broadcastTelemetry(packet);
        }
        else {
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
function onSerialError(error) {
    broadcastStatus('ERROR', error.message);
}
// --- Auto-reconnect via port watcher ---
function attemptReconnect() {
    watchEsp32Port(async (portPath) => {
        if (portPath && !serialPort) {
            try {
                await openSerialPort(portPath);
            }
            catch (err) {
                console.error('Failed to reconnect to serial port:', err);
            }
        }
        else if (!portPath && serialPort) {
            try {
                serialPort.close();
            }
            catch { /* ignore */ }
            serialPort = null;
            broadcastStatus('DISCONNECTED', 'ESP32 port lost; reconnection attempted');
        }
    }, { pollIntervalMs: 2000 });
}
// --- Open serial port ---
async function openSerialPort(portPath) {
    if (serialPort) {
        try {
            await serialPort.close();
        }
        catch { /* ignore */ }
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
 * Start the HTTP server with dynamic port selection.
 * Tries the configured port, then a range of alternates (port+1 … port+9)
 * if each is already in use. Resolves with the port actually bound.
 */
function startHttpServer() {
    return new Promise((resolve, reject) => {
        httpServer = createHttpServer(app);
        const tryListen = (listenPort) => {
            httpServer
                .listen(listenPort, () => {
                console.log('=== Artemis Ground Bridge Server ===');
                console.log(`Listening on http://localhost:${listenPort}`);
                console.log(`Listening on http://${lanIp}:${listenPort}`);
                console.log(`API status at http://localhost:${listenPort}/api/status`);
                console.log(`WebSocket at ws://localhost:${listenPort}/ws`);
                // Send initial HYDRATE status
                broadcastHydrate(lastKnownTelemetry, 'BRIDGE_READY');
                resolve(listenPort);
            })
                .on('error', (err) => {
                if (err.code === 'EADDRINUSE') {
                    console.warn(`[server] Port ${listenPort} is in use. Trying alternate port...`);
                    const nextPort = listenPort + 1;
                    if (nextPort <= port + 9) {
                        tryListen(nextPort);
                    }
                    else {
                        console.error(`[server] Could not bind to any port from ${port} to ${port + 9}. Exiting.`);
                        reject(err);
                    }
                }
                else {
                    reject(err);
                }
            });
        };
        tryListen(port);
    });
}
export async function createServer() {
    const boundPort = await startHttpServer().catch((err) => {
        console.error('[server] Failed to start HTTP server:', err);
        throw err;
    });
    // HTTP health check at /api/status returning bridge connection state
    app.get('/api/status', (_req, res) => {
        const bridgeStatus = serialPort && serialPort.isOpen ? 'CONNECTED' : 'DISCONNECTED';
        const portName = serialPort?.path ?? null;
        res.json({
            bridgeStatus,
            port: portName,
            lanIp,
            serverPort: boundPort,
            lastKnownTelemetrySeq: lastKnownTelemetry?.seq ?? null,
            clientsConnected: clients.size,
        });
    });
    // WebSocket upgrade on the same HTTP port
    wss = new WebSocketServer({ server: httpServer, path: '/ws' });
    wss.on('connection', (ws) => {
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
        ws.on('message', async (message) => {
            let data;
            try {
                data = JSON.parse(message.toString());
            }
            catch {
                return; // Ignore non-JSON messages
            }
            if (data.type === 'COMMAND' && data.cmd) {
                // Forward command to serial with queue pacing and ESTOP priority
                queueCommand(data.cmd);
            }
        });
    });
    return { server: httpServer, port: boundPort };
}
// --- Startup: find port and open ---
void (async () => {
    const portPath = await findEsp32Port();
    if (portPath) {
        await openSerialPort(portPath);
    }
    else {
        console.log('No ESP32 serial port found on startup; waiting for plug-in...');
        // Start watching for port changes
        watchEsp32Port(async (path) => {
            if (path && !serialPort) {
                try {
                    await openSerialPort(path);
                }
                catch (err) {
                    console.error('Reconnect failed:', err);
                }
            }
        }, { pollIntervalMs: 2000 });
    }
})();
createServer().catch((err) => {
    console.error('[server] Failed to start HTTP server:', err);
});
