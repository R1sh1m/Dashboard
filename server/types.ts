import type { TelemetryPacket, GpsData } from '../src/types/telemetry.js';

/**
 * WebSocket JSON wire protocol between the laptop bridge (server) and
 * tablet/phone/laptop clients (clients).
 *
 * Server -> Client frames:
 *   TELEMETRY   full TelemetryPacket (broadcast on every ESP32 frame)
 *   GPS         standalone GpsData update
 *   RAW         raw serial line from the ESP32
 *   STATUS      bridge connection state change
 *   HYDRATE     sent immediately to late-joining clients with last known state
 *
 * Client -> Server frames:
 *   COMMAND     text command forwarded to the ESP32 serial port
 */

export type ServerToClientFrame =
  | { type: 'TELEMETRY'; packet: TelemetryPacket }
  | { type: 'GPS'; gps: GpsData }
  | { type: 'RAW'; line: string }
  | { type: 'STATUS'; status: 'CONNECTED' | 'DISCONNECTED' | 'ERROR'; message?: string; port?: string }
  | { type: 'HYDRATE'; packet: TelemetryPacket | null; bridgeStatus: string };

export type ClientToServerFrame = { type: 'COMMAND'; cmd: string };

export type WsFrame = ServerToClientFrame | ClientToServerFrame;
