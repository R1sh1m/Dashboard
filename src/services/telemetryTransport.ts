import type { TelemetryPacket, GpsData } from '../types/telemetry';

export type SerialConnectionStatus = 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED' | 'ERROR';

export interface WebSerialCallbacks {
  onPacket: (packet: TelemetryPacket) => void;
  onGps?: (gps: GpsData) => void;
  onRawLine: (line: string) => void;
  onStatusChange: (status: SerialConnectionStatus, error?: string) => void;
}

/**
 * Unified telemetry transport interface.
 *
 * Implementations:
 *  - WebSerialManager (src/services/webSerial.ts) — direct USB-CDC to ESP32
 *  - WsSerialService (src/services/wsSerial.ts) — WebSocket bridge to laptop host
 *
 * The React UI depends only on this interface, so it works identically
 * whether the ESP32 is plugged into the local laptop or reached via the
 * WebSocket bridge from a tablet/phone on the same Wi-Fi.
 */
export interface ITelemetryService {
  /** Open the transport (serial port or WebSocket). Returns true on success. */
  connect(): Promise<boolean>;
  /** Close the transport. */
  disconnect(): Promise<void>;
  /** Send a text command (e.g. "ESTOP", "RADAR_SENS 8 8") to the ESP32. */
  sendCommand(cmd: string): Promise<boolean>;
  /** Register callbacks for incoming packets, GPS, raw lines, and status. */
  setCallbacks(cb: WebSerialCallbacks): void;
  /** Set the serial baud rate (no-op for WebSocket transport). */
  setBaudRate(baud: number): void;
  /** Whether this transport is available in the current browser/environment. */
  isSupported(): boolean;
}
