/**
 * ============================================================================
 * CAN-SAT GROUND STATION - GLOBAL STATE & EVENT BUS
 * Manages reactive state, event subscriptions, and telemetry ring buffers.
 * ============================================================================
 */

class EventBus {
  constructor() {
    this.listeners = new Map();
  }

  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event).add(callback);
    return () => this.off(event, callback);
  }

  off(event, callback) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).delete(callback);
    }
  }

  emit(event, data) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).forEach(cb => {
        try {
          cb(data);
        } catch (err) {
          console.error(`[EventBus] Error in listener for "${event}":`, err);
        }
      });
    }
  }
}

class GroundStationState {
  constructor() {
    this.events = new EventBus();

    // Mission configuration
    this.config = {
      mode: 'SITL', // 'SITL' | 'HITL'
      baudRate: 115200,
      soundEnabled: true,
      soundVolume: 0.5,
      scanlinesEnabled: true,
      maxBufferLength: 2000,
      chartWindowSeconds: 60,
    };

    // Telemetry storage (Ring Buffer)
    this.telemetryHistory = [];
    this.currentPacket = null;
    this.previousPacket = null;

    // Derived Flight & Radio Metrics
    this.metrics = {
      packetCount: 0,
      packetsPerSecond: 0,
      lastPacketTime: null,
      descentRate_mps: 0, // Vertical speed m/s
      maxAltitude_m: 0,
      flightPhase: 'PRE-LAUNCH', // PRE-LAUNCH, ASCENT, APOGEE, DESCENT, TOUCHDOWN
      linkQuality: 'EXCELLENT', // EXCELLENT, DEGRADED, CRITICAL, LOST
      anomaliesDetected: 0,
      missionElapsedSeconds: 0,
    };

    // Serial Connection State
    this.serial = {
      connected: false,
      portInfo: null,
      bytesReceived: 0,
      errorCount: 0,
    };

    // SITL Physics Engine State
    this.sitl = {
      running: true,
      frequencyHz: 2, // Default 2 packets per sec
      activeAnomaly: null, // null | 'PARACHUTE_FAILURE' | 'BARO_GLITCH' | 'SIGNAL_BLACKOUT'
    };

    // Session Recording Buffer
    this.recording = {
      active: false,
      startTime: null,
      recordedPackets: [],
    };
  }

  /**
   * Injects a newly parsed telemetry packet into the station state.
   */
  ingestPacket(packet) {
    this.previousPacket = this.currentPacket;
    this.currentPacket = packet;
    this.metrics.packetCount++;
    this.metrics.lastPacketTime = Date.now();

    // Ring buffer maintenance
    this.telemetryHistory.push(packet);
    if (this.telemetryHistory.length > this.config.maxBufferLength) {
      this.telemetryHistory.shift();
    }

    // Recording check
    if (this.recording.active) {
      this.recording.recordedPackets.push(packet);
    }

    // Calculate vertical speed (descent rate) if previous packet exists
    if (this.previousPacket && this.previousPacket.sensors?.bmp280 && packet.sensors?.bmp280) {
      const dt = (packet.timestamp - this.previousPacket.timestamp) || 0.5;
      const dAlt = packet.sensors.bmp280.altitude_m - this.previousPacket.sensors.bmp280.altitude_m;
      this.metrics.descentRate_mps = Number((dAlt / dt).toFixed(2));
    }

    // Track max altitude
    const alt = packet.sensors?.bmp280?.altitude_m || 0;
    if (alt > this.metrics.maxAltitude_m) {
      this.metrics.maxAltitude_m = alt;
    }

    // Check link quality based on RSSI
    const rssi = packet.sensors?.telemetry?.rssi_lora ?? -100;
    if (rssi >= -60) this.metrics.linkQuality = 'EXCELLENT';
    else if (rssi >= -85) this.metrics.linkQuality = 'GOOD';
    else if (rssi >= -105) this.metrics.linkQuality = 'DEGRADED';
    else this.metrics.linkQuality = 'CRITICAL';

    // Broadcast update
    this.events.emit('packet:ingested', { packet, metrics: this.metrics });
  }

  setMode(mode) {
    if (mode !== 'SITL' && mode !== 'HITL') return;
    this.config.mode = mode;
    this.events.emit('config:mode_changed', mode);
  }

  startRecording() {
    this.recording.active = true;
    this.recording.startTime = Date.now();
    this.recording.recordedPackets = [];
    this.events.emit('recording:started');
  }

  stopRecording() {
    this.recording.active = false;
    this.events.emit('recording:stopped', this.recording.recordedPackets);
    return this.recording.recordedPackets;
  }

  resetMission() {
    this.telemetryHistory = [];
    this.currentPacket = null;
    this.previousPacket = null;
    this.metrics.packetCount = 0;
    this.metrics.maxAltitude_m = 0;
    this.metrics.descentRate_mps = 0;
    this.metrics.anomaliesDetected = 0;
    this.metrics.missionElapsedSeconds = 0;
    this.events.emit('mission:reset');
  }
}

// Global singleton instance
window.GroundStationState = new GroundStationState();
