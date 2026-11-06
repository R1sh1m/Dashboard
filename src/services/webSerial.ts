import type { TelemetryPacket } from '../types/telemetry';
import type { GpsData } from '../types/telemetry';
import { parseNmeaSentence } from './gpsParser';

export type SerialConnectionStatus = 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED' | 'ERROR';

export interface WebSerialCallbacks {
  onPacket: (packet: TelemetryPacket) => void;
  onGps?: (gps: GpsData) => void;
  onRawLine: (line: string) => void;
  onStatusChange: (status: SerialConnectionStatus, error?: string) => void;
}

export class WebSerialManager {
  private port: any = null;
  private reader: any = null;
  private keepReading = false;
  private callbacks: WebSerialCallbacks | null = null;
  private baudRate = 115200;

  public isSupported(): boolean {
    return typeof navigator !== 'undefined' && 'serial' in navigator;
  }

  public setCallbacks(callbacks: WebSerialCallbacks) {
    this.callbacks = callbacks;
  }

  public setBaudRate(baud: number) {
    this.baudRate = baud;
  }

  public async connect(): Promise<boolean> {
    if (!this.isSupported()) {
      this.callbacks?.onStatusChange('ERROR', 'WebSerial is not supported in this browser. Use Chrome, Edge, or Opera.');
      return false;
    }

    try {
      this.callbacks?.onStatusChange('CONNECTING');
      this.port = await (navigator as any).serial.requestPort({
        filters: [
          { usbVendorId: 0x303a }, // Espressif Systems
          { usbVendorId: 0x10c4 }, // Silicon Labs CP210x
          { usbVendorId: 0x1a86 }, // CH340
          { usbVendorId: 0x0403 }, // FTDI
        ]
      });

      await this.port.open({ baudRate: this.baudRate });
      this.keepReading = true;
      this.callbacks?.onStatusChange('CONNECTED');
      this.readLoop();
      return true;
    } catch (err: any) {
      if (err.name === 'NotFoundError') {
        this.callbacks?.onStatusChange('DISCONNECTED');
      } else {
        this.callbacks?.onStatusChange('ERROR', err.message || 'Failed to open serial port');
      }
      return false;
    }
  }

  public async disconnect(): Promise<void> {
    this.keepReading = false;
    try {
      if (this.reader) {
        await this.reader.cancel();
        this.reader.releaseLock();
        this.reader = null;
      }
      if (this.port) {
        await this.port.close();
        this.port = null;
      }
    } catch (err: any) {
      console.warn('Error during serial port close:', err);
    }
    this.callbacks?.onStatusChange('DISCONNECTED');
  }

  public async sendCommand(cmd: string): Promise<boolean> {
    if (!this.port || !this.port.writable) return false;
    try {
      const encoder = new TextEncoder();
      const writer = this.port.writable.getWriter();
      await writer.write(encoder.encode(cmd.endsWith('\n') ? cmd : cmd + '\n'));
      writer.releaseLock();
      return true;
    } catch (err) {
      console.error('Failed to send serial command:', err);
      return false;
    }
  }

  private async readLoop() {
    let buffer = '';
    const textDecoder = new TextDecoder();

    while (this.port && this.keepReading && this.port.readable) {
      try {
        this.reader = this.port.readable.getReader();
        while (this.keepReading) {
          const { value, done } = await this.reader.read();
          if (done) break;
          if (value) {
            const chunk = textDecoder.decode(value, { stream: true });
            buffer += chunk;
            const lines = buffer.split('\n');
            buffer = lines.pop() ?? '';

            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed) continue;
              this.callbacks?.onRawLine(trimmed);
              const gps = parseNmeaSentence(trimmed);
              if (gps) this.callbacks?.onGps?.(gps);
              if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
                try {
                  const packet: TelemetryPacket = JSON.parse(trimmed);
                  this.callbacks?.onPacket(packet);
                } catch {
                  // Ignore partial frames
                }
              }
            }
          }
        }
      } catch (err: any) {
        if (this.keepReading) {
          console.error('Serial read loop error:', err);
          this.callbacks?.onStatusChange('ERROR', err.message || 'Serial stream disrupted');
        }
      } finally {
        if (this.reader) {
          try {
            this.reader.releaseLock();
          } catch {
            // Already released
          }
          this.reader = null;
        }
      }
    }
    if (this.callbacks && !this.keepReading) {
      this.callbacks.onStatusChange('DISCONNECTED');
    }
  }
}

export const serialService = new WebSerialManager();
