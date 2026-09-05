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
    const now = Date.now();
    const dtReal = this.metrics.lastPacketTime ? Math.max(0.01, (now - this.metrics.lastPacketTime) / 1000) : 0.5;
    this.metrics.lastPacketTime = now;

    // Ring buffer maintenance
    this.telemetryHistory.push(packet);
    if (this.telemetryHistory.length > this.config.maxBufferLength) {
      this.telemetryHistory.shift();
    }

    // Recording check
    if (this.recording.active) {
      this.recording.recordedPackets.push(packet);
    }

    // Calculate vertical speed (descent rate)
    // Priority 1: NASA 42 / cFS Kalman filter fused vertical velocity
    if (packet.sensors?.kalman?.filteredVelocity_mps !== undefined) {
      this.metrics.descentRate_mps = Number(packet.sensors.kalman.filteredVelocity_mps.toFixed(2));
    } else if (this.previousPacket && this.previousPacket.sensors?.bmp280 && packet.sensors?.bmp280) {
      // Priority 2: Precise barometric delta over elapsed time
      const dt = (packet.timestamp - this.previousPacket.timestamp);
      const effectiveDt = (dt && dt > 0.02 && dt < 10) ? dt : dtReal;
      const dAlt = packet.sensors.bmp280.altitude_m - this.previousPacket.sensors.bmp280.altitude_m;
      this.metrics.descentRate_mps = Number((dAlt / effectiveDt).toFixed(2));
    }

    // Track max altitude
    const alt = packet.sensors?.bmp280?.altitude_m || 0;
    if (alt > this.metrics.maxAltitude_m) {
      this.metrics.maxAltitude_m = alt;
    }

    // Comprehensive Flight Phase Detection State Machine
    const vz = this.metrics.descentRate_mps;
    const maxAlt = this.metrics.maxAltitude_m;
    const status = packet.status || '';
    const telem = packet.sensors?.telemetry || {};
    const isDrone = telem.launch_method === 'DRONE' || packet.launch_method === 'DRONE';
    const packetPhase = telem.flight_phase || packet.flight_phase || '';

    if (packetPhase === 'DRONE_HOVER') {
      this.metrics.flightPhase = 'ESTACIONARIO (DRON)';
    } else if (packetPhase === 'DRONE_RELEASE') {
      this.metrics.flightPhase = 'DESENGANCHE / SUELTA';
    } else if (maxAlt < 5 && alt <= 3 && Math.abs(vz) < 1.0) {
      this.metrics.flightPhase = 'PRE-LANZAMIENTO';
    } else if (vz > 1.0) {
      this.metrics.flightPhase = isDrone ? 'ELEVACIÓN CON DRON' : 'ASCENSO / PROPULSIÓN';
    } else if (maxAlt > 30 && alt >= (maxAlt - 25) && Math.abs(vz) <= 2.5) {
      this.metrics.flightPhase = isDrone ? 'ESTACIONARIO / SUELTA' : 'APOGEO';
    } else if (status.includes('CHUTE_FAIL') || (maxAlt > 50 && vz < -18.0)) {
      this.metrics.flightPhase = 'CAÍDA LIBRE (FALLO PARACAÍDAS)';
    } else if (vz < -1.0) {
      this.metrics.flightPhase = 'DESCENSO CONTROLADO';
    } else if (maxAlt > 30 && alt <= 3 && Math.abs(vz) < 1.0) {
      this.metrics.flightPhase = 'ATERRIZAJE / EN TIERRA';
    } else {
      this.metrics.flightPhase = 'TRANSMITIENDO';
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
