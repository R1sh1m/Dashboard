import type { ITelemetryService, WebSerialCallbacks } from './telemetryTransport';
import { WebSerialManager } from './webSerial';
import { WsSerialService } from './wsSerial';

/**
 * TelemetryClient: Factory/Facade providing active transport.
 *
 * Defaults to WebSocket bridge (`WsSerialService`) for LAN access.
 * If running on local desktop Chrome without bridge available, allows
 * instant toggle to direct `WebSerialManager` via `switchToDirectSerial()`.
 *
 * Exports a single `telemetryClient` instance implementing `ITelemetryService`.
 */
export class TelemetryClient implements ITelemetryService {
  private wsTransport: WsSerialService;
  private directTransport: WebSerialManager;
  private isDirect = false;
  private callbacks: WebSerialCallbacks | null = null;

  constructor(wsService?: WsSerialService, directService?: WebSerialManager) {
    this.wsTransport = wsService ?? new WsSerialService();
    this.directTransport = directService ?? new WebSerialManager();
  }

  /** Switch to direct WebSerial transport (desktop, USB-CDC). */
  public switchToDirectSerial(): void {
    this.isDirect = true;
    this.propagateCallbacks();
  }

  /** Switch back to WebSocket bridge transport. */
  public switchToWebSocket(): void {
    this.isDirect = false;
    this.propagateCallbacks();
  }

  /** Returns true when the active transport is the direct WebSerial path. */
  public isDirectMode(): boolean {
    return this.isDirect;
  }

  private get active(): ITelemetryService {
    return this.isDirect ? this.directTransport as ITelemetryService : this.wsTransport;
  }

  public setCallbacks(cb: WebSerialCallbacks): void {
    this.callbacks = cb;
    this.propagateCallbacks();
  }

  public setBaudRate(baud: number): void {
    this.active.setBaudRate(baud);
  }

  public isSupported(): boolean {
    // Support either transport
    return this.wsTransport.isSupported() || this.directTransport.isSupported();
  }

  public async connect(): Promise<boolean> {
    return await this.active.connect();
  }

  public async disconnect(): Promise<void> {
    await this.active.disconnect();
  }

  public async sendCommand(cmd: string): Promise<boolean> {
    return await this.active.sendCommand(cmd);
  }

  private propagateCallbacks(): void {
    if (!this.callbacks) return;
    this.active.setCallbacks(this.callbacks);
  }
}

/**
 * Global telemetry client instance.
 *
 * Defaults to WebSocket bridge transport.
 * Call `telemetryClient.switchToDirectSerial()` to use direct WebSerial.
 */
export const telemetryClient = new TelemetryClient();
