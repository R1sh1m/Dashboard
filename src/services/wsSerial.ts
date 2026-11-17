import type { TelemetryPacket } from '../types/telemetry';
import type { GpsData } from '../types/telemetry';
import type { WebSerialCallbacks, SerialConnectionStatus } from './telemetryTransport';

/**
 * WebSocket client transport for the Artemis Ground Station Dashboard.
 * Connects to the Web Serial -> WebSocket bridge running on the laptop host
 * (ws://<host>:<port>, where port defaults to 3001 with auto-fallback to 3002–3010),
 * forwarding serial telemetry and commands over Wi-Fi.
 *
 * Implements ITelemetryService so the React UI works identically whether the
 * ESP32 is connected via direct USB WebSerial or through the bridge.
 *
 * Features:
 * - Automatic exponential backoff reconnect (1s, 2s, 4s, max 10s)
 * - 3s ping/pong heartbeat for field Wi-Fi resilience
 * - Maps incoming WebSocket frames (TELEMETRY, GPS, RAW, STATUS, HYDRATE)
 *   to the WebSerialCallbacks interface
 */
export class WsSerialService {
  private ws: WebSocket | null = null;
  private callbacks: WebSerialCallbacks | null = null;
  private reconnectAttempts = 0;
  private reconnectTimer: number | null = null;
  private heartbeatTimer: number | null = null;
  private wsUrl: string;
  private connected = false;

  constructor(host?: string) {
    // When served from the laptop host, window.location.host is the WS address.
    // During local Vite dev (localhost), the bridge port is window.location.port
    // when served by the bridge; otherwise fall back to 3001.
    if (host) {
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      this.wsUrl = `${proto}//${host}/ws`;
    } else if (typeof window !== 'undefined' && window.location.host) {
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const port = window.location.port ? `:${window.location.port}` : '';
      this.wsUrl = `${proto}//${window.location.hostname}${port}/ws`;
    } else {
      this.wsUrl = 'ws://localhost:3001/ws';
    }
  }

  public isSupported(): boolean {
    return typeof window !== 'undefined' && typeof WebSocket !== 'undefined';
  }

  public setCallbacks(cb: WebSerialCallbacks): void {
    this.callbacks = cb;
  }

  public setBaudRate(_baud: number): void {
    // No-op for WebSocket transport; baud rate is fixed at 115200 on the bridge.
  }

  public async connect(): Promise<boolean> {
    if (!this.isSupported()) {
      this.callbacks?.onStatusChange('ERROR', 'WebSocket is not supported in this browser.');
      return false;
    }
    if (this.connected || this.ws?.readyState === WebSocket.OPEN) return true;
    this.connected = false;
    this.callbacks?.onStatusChange('CONNECTING');
    this.openSocket();
    // Return true immediately; actual connection state is tracked via callbacks
    return true;
  }

  public async disconnect(): Promise<void> {
    this.stopReconnectTimer();
    this.stopHeartbeat();
    this.connected = false;
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.callbacks?.onStatusChange('DISCONNECTED');
  }

  public async sendCommand(cmd: string): Promise<boolean> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.callbacks?.onStatusChange('ERROR', 'WebSocket not connected; command not sent.');
      return false;
    }
    try {
      const frame = JSON.stringify({ type: 'COMMAND', cmd });
      this.ws.send(frame);
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to send command';
      console.error('Failed to send WebSocket command:', err);
      this.callbacks?.onStatusChange('ERROR', message);
      return false;
    }
  }

  private openSocket(): void {
    this.ws = new WebSocket(this.wsUrl);

    this.ws.onopen = () => {
      this.connected = true;
      this.reconnectAttempts = 0;
      this.callbacks?.onStatusChange('CONNECTED');
      this.startHeartbeat();
    };

    this.ws.onclose = () => {
      this.stopHeartbeat();
      this.connected = false;
      this.ws = null;
      this.callbacks?.onStatusChange('DISCONNECTED');
      this.scheduleReconnect();
    };

    this.ws.onerror = (event: Event) => {
      console.error('WebSocket error:', event);
      this.callbacks?.onStatusChange('ERROR', 'WebSocket connection error');
      this.ws?.close();
    };

    this.ws.onmessage = (event: MessageEvent<string>) => {
      let data: { type: string; packet?: TelemetryPacket; gps?: GpsData; line?: string; status?: SerialConnectionStatus; message?: string; port?: string; bridgeStatus?: string };
      try {
        data = JSON.parse(event.data);
      } catch {
        return; // Ignore non-JSON frames
      }

      switch (data.type) {
        case 'TELEMETRY':
          if (data.packet) this.callbacks?.onPacket(data.packet);
          break;
        case 'GPS':
          if (data.gps) this.callbacks?.onGps?.(data.gps);
          break;
        case 'RAW':
          if (data.line !== undefined) this.callbacks?.onRawLine(data.line);
          break;
        case 'STATUS':
          this.callbacks?.onStatusChange(data.status ?? 'CONNECTED', data.message);
          break;
        case 'HYDRATE':
          // Hydrate UI with last known telemetry on late join / reconnect
          if (data.packet) this.callbacks?.onPacket(data.packet);
          break;
        default:
          // Unknown frame type — ignore gracefully
          break;
      }
    };
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer !== null) return; // Already scheduled
    const delayMs = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 10000);
    this.reconnectAttempts++;
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      if (this.connected || this.ws?.readyState === WebSocket.OPEN) return;
      console.log(`WebSocket reconnect attempt ${this.reconnectAttempts} after ${delayMs}ms`);
      this.openSocket();
    }, delayMs);
  }

  private stopReconnectTimer(): void {
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = window.setInterval(() => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
      const now = Date.now();
      const payload = JSON.stringify({ type: 'PING', ts: now });
      try {
        this.ws.send(payload);
      } catch {
        // Ignore send failures; onclose/onerror will handle reconnect
      }
    }, 3000);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer !== null) {
      window.clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }
}

export const wsSerialService = new WsSerialService();
