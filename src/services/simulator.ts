import type { TelemetryPacket, ServoStatus } from '../types/telemetry';

export class TelemetrySimulator {
  private timer: number | null = null;
  private seq = 1000;
  private uptime = 120;
  private lat = 12.971598;
  private lng = 77.594566;
  private alt = 920.4;
  private heading = 45;
  private batteryVoltage = 12.4;
  private batteryPercent = 95;
  private step = 0;
  private onPacketCallback: ((packet: TelemetryPacket) => void) | null = null;

  public start(callback: (packet: TelemetryPacket) => void, intervalMs = 250) {
    this.onPacketCallback = callback;
    if (this.timer !== null) clearInterval(this.timer);

    this.timer = window.setInterval(() => {
      this.tick();
    }, intervalMs);
  }

  public stop() {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private tick() {
    this.seq++;
    this.step++;
    this.uptime += 0.25;

    const speed = 0.35 + Math.sin(this.step * 0.1) * 0.1;
    this.heading = (this.heading + Math.sin(this.step * 0.05) * 2) % 360;
    const rad = (this.heading * Math.PI) / 180;
    const dLat = (Math.cos(rad) * speed * 0.25) / 111320;
    const dLng = (Math.sin(rad) * speed * 0.25) / (111320 * Math.cos((this.lat * Math.PI) / 180));
    this.lat += dLat;
    this.lng += dLng;

    this.batteryVoltage = Math.max(10.5, this.batteryVoltage - 0.00005);
    this.batteryPercent = Math.max(10, Math.round(((this.batteryVoltage - 10.5) / (12.6 - 10.5)) * 100));
    const cellV = +(this.batteryVoltage / 3).toFixed(2);

    const isHumanDetected = (this.step % 70) > 55;
    const radarDistance = isHumanDetected ? Math.round(140 + Math.sin(this.step * 0.3) * 60) : 0;
    const radarEnergy = isHumanDetected ? Math.round(65 + Math.random() * 25) : 0;

    const isEnvDisturbed = (this.step % 120) > 95;
    const gasResistance = isEnvDisturbed ? 14.2 + Math.random() * 5 : 42.5 + Math.random() * 4;
    const iaq = isEnvDisturbed ? Math.round(135 + Math.random() * 40) : Math.round(35 + Math.random() * 15);

    const servos: ServoStatus[] = [];
    const gaitPhase = this.step * 0.4;
    for (let i = 1; i <= 18; i++) {
      const legIndex = Math.floor((i - 1) / 3);
      const jointIndex = (i - 1) % 3;
      const phaseOffset = (legIndex % 2 === 0 ? 0 : Math.PI);
      const angleOsc = Math.sin(gaitPhase + phaseOffset) * (jointIndex === 0 ? 150 : 300);
      servos.push({
        id: i,
        pos: Math.round(2048 + angleOsc),
        load: Math.round(15 + Math.abs(Math.sin(gaitPhase + i)) * 45),
        temp: Math.round(34 + Math.sin(i * 0.5) * 4),
        err: 0
      });
    }

    const packet: TelemetryPacket = {
      seq: this.seq,
      timestamp: Date.now(),
      bot_status: {
        state: 'WALKING',
        uptime_sec: Math.floor(this.uptime),
        mode: 'AUTONOMOUS',
        loop_hz: 50.0 + (Math.random() - 0.5) * 1.5
      },
      gps: {
        lat: +this.lat.toFixed(7),
        lng: +this.lng.toFixed(7),
        alt_m: +(this.alt + Math.sin(this.step * 0.05) * 0.8).toFixed(1),
        fix: 3,
        sats: 11,
        speed_mps: +speed.toFixed(2),
        hdop: 0.85,
        valid: true,
        heading_deg: Math.round(this.heading)
      },
      env: {
        temp_c: +(26.8 + Math.sin(this.step * 0.02) * 1.5).toFixed(1),
        humidity_pct: +(54.2 + Math.cos(this.step * 0.02) * 2.0).toFixed(1),
        pressure_hpa: +(1013.2 + Math.sin(this.step * 0.01) * 0.4).toFixed(1),
        gas_resistance_kohm: +gasResistance.toFixed(1),
        iaq: iaq,
        anomaly_flag: isEnvDisturbed
      },
      radar: {
        human_detected: isHumanDetected,
        target_state: isHumanDetected ? (this.step % 2 === 0 ? 'MOVING' : 'COMBINED') : 'NO_TARGET',
        distance_cm: radarDistance,
        energy: radarEnergy
      },
      power: {
        voltage_v: +this.batteryVoltage.toFixed(2),
        current_a: +(2.8 + Math.abs(Math.sin(gaitPhase)) * 1.6).toFixed(2),
        percent: this.batteryPercent,
        cell_voltages: [cellV, cellV, cellV]
      },
      motors: {
        active_count: 18,
        avg_temp_c: 35.8,
        max_temp_c: 39.2,
        fault_mask: 0,
        servos
      },
      link: {
        rssi_dbm: Math.round(-68 + Math.sin(this.step * 0.1) * 6),
        snr_db: +(9.8 + Math.cos(this.step * 0.1) * 1.5).toFixed(1),
        packet_loss_pct: +(0.2 + (this.step % 50 === 0 ? 0.8 : 0)).toFixed(1),
        latency_ms: Math.round(38 + Math.random() * 8)
      }
    };

    this.onPacketCallback?.(packet);
  }
}

export const simulatorService = new TelemetrySimulator();
