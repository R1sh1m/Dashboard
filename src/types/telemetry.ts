export type BotOperatingState = 'STANDBY' | 'WALKING' | 'HOMING' | 'EMERGENCY_STOP' | 'EXPLORING' | 'CALIBRATING';
export type BotControlMode = 'AUTONOMOUS' | 'TELEOPERATED' | 'FAILSAFE';

export interface BotStatus {
  state: BotOperatingState;
  uptime_sec: number;
  mode: BotControlMode;
  loop_hz: number;
}

export interface GpsData {
  lat: number;
  lng: number;
  alt_m: number;
  fix: number; // 0=No fix, 1=2D, 2=3D, 3=DGPS/RTK
  sats: number;
  speed_mps: number;
  hdop: number;
  valid: boolean;
  heading_deg?: number;
}

export interface EnvData {
  temp_c: number;
  humidity_pct: number;
  pressure_hpa: number;
  gas_resistance_kohm: number;
  iaq: number; // 0-50 Good, 51-100 Moderate, 101-150 Unhealthy Sensitive, 151+ Unhealthy
  anomaly_flag: boolean;
}

export interface RadarData {
  human_detected: boolean;
  target_state: 'NO_TARGET' | 'MOVING' | 'STATIONARY' | 'COMBINED';
  distance_cm: number;
  energy: number; // 0-100
}

export interface PowerData {
  voltage_v: number;
  current_a: number;
  percent: number;
  cell_voltages: [number, number, number]; // 3S LiPo: Cell 1, 2, 3
}

export interface ServoStatus {
  id: number;
  pos: number;
  load: number;
  temp: number;
  err: number;
}

export interface MotorData {
  active_count: number;
  avg_temp_c: number;
  max_temp_c: number;
  fault_mask: number;
  servos: ServoStatus[];
}

export interface LinkData {
  rssi_dbm: number;
  snr_db: number;
  packet_loss_pct: number;
  latency_ms: number;
  packet_rate_hz?: number;
}

export interface TelemetryPacket {
  seq: number;
  timestamp: number;
  bot_status: BotStatus;
  gps: GpsData;
  env: EnvData;
  radar: RadarData;
  power: PowerData;
  motors: MotorData;
  link: LinkData;
}

export type PoiCategory = 'HUMAN_RADAR' | 'ENV_ANOMALY' | 'MANUAL_MARK' | 'BASE_HOME';

export interface PointOfInterest {
  id: string;
  category: PoiCategory;
  lat: number;
  lng: number;
  title: string;
  notes?: string;
  timestamp: number;
  meta?: {
    distance_cm?: number;
    energy?: number;
    gas_kohm?: number;
    iaq?: number;
  };
}

export type LogLevel = 'INFO' | 'WARN' | 'ERR' | 'RAW';

export interface LogEntry {
  id: string;
  timestamp: number;
  level: LogLevel;
  subsystem: string;
  message: string;
  rawPayload?: string;
}
