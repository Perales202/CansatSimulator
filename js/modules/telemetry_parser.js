/**
 * ============================================================================
 * CAN-SAT TELEMETRY PARSER (ISOLATED MODULE)
 * Strict JSON Validator & Telemetry Deserializer.
 * In compliance with PRD Data Integrity rules:
 * "El motor de físicas y el parser de telemetría deben ser módulos completamente
 * aislados de la capa de renderizado visual (UI). No habrá asistencias que
 * corrijan lecturas erróneas."
 * ============================================================================
 */

class TelemetryParser {
  constructor() {
    this.totalPacketsParsed = 0;
    this.malformedPackets = 0;
    this.anomalyCount = 0;
    this.lastTimestamp = null;
  }

  /**
   * Parse and strictly validate an incoming JSON or ASCII CSV telemetry string.
   * Format CSV: TeamID, Mission_time, Packet_count, Altitude, Temperature, Voltage, Accel_X, Accel_Y, Accel_Z, State
   * @param {string|object} rawInput - Raw serial line or object
   * @returns {{ success: boolean, packet: object|null, error: string|null, isAnomaly: boolean }}
   */
  parse(rawInput) {
    let packetObj = null;

    if (typeof rawInput === 'string') {
      const trimmed = rawInput.trim();
      if (trimmed.startsWith('{')) {
        try {
          packetObj = JSON.parse(trimmed);
        } catch (err) {
          this.malformedPackets++;
          return {
            success: false,
            packet: null,
            error: `JSON Deserialization Failure: ${err.message}`,
            raw: rawInput,
            isAnomaly: true
          };
        }
      } else if (trimmed.includes(',')) {
        return this.parseCSV(trimmed);
      } else {
        try {
          packetObj = JSON.parse(trimmed);
        } catch (err) {
          this.malformedPackets++;
          return {
            success: false,
            packet: null,
            error: `Deserialization Failure: Input is neither valid JSON nor CSV format: ${err.message}`,
            raw: rawInput,
            isAnomaly: true
          };
        }
      }
    } else if (typeof rawInput === 'object' && rawInput !== null) {
      packetObj = rawInput;
    } else {
      this.malformedPackets++;
      return {
        success: false,
        packet: null,
        error: 'Invalid input type: Expected JSON string, CSV string or object',
        raw: rawInput,
        isAnomaly: true
      };
    }

    // Strict schema validation per PRD Section 4
    const validation = this.validateSchema(packetObj);
    if (!validation.valid) {
      this.malformedPackets++;
      return {
        success: false,
        packet: packetObj,
        error: `Schema Violation: ${validation.reason}`,
        raw: rawInput,
        isAnomaly: true
      };
    }

    this.totalPacketsParsed++;

    // Check for operational status or physical anomalies
    // Note: We detect and flag anomalies, but we do NOT modify or "correct" any values!
    let isAnomaly = false;
    let anomalyReasons = [];

    if (packetObj.status !== 'NOMINAL') {
      isAnomaly = true;
      anomalyReasons.push(`Status flag is '${packetObj.status}'`);
    }

    // Check RF link degradation
    const rssi = packetObj.sensors.telemetry.rssi_lora;
    const snr = packetObj.sensors.telemetry.snr;
    if (rssi < -115) {
      isAnomaly = true;
      anomalyReasons.push(`Critical RSSI (${rssi} dBm)`);
    }
    if (snr < -10) {
      isAnomaly = true;
      anomalyReasons.push(`Critical SNR (${snr} dB)`);
    }

    // Check barometric extremes (e.g. sensor disconnect or impossible pressure)
    const press = packetObj.sensors.bmp280.pressure_hpa;
    if (press <= 0 || press > 1200 || isNaN(press)) {
      isAnomaly = true;
      anomalyReasons.push(`Unrealistic pressure reading (${press} hPa)`);
    }

    if (isAnomaly) {
      this.anomalyCount++;
    }

    // Calculate packet jitter/delta
    const currentTs = packetObj.timestamp;
    const deltaTs = this.lastTimestamp ? (currentTs - this.lastTimestamp) : null;
    this.lastTimestamp = currentTs;

    return {
      success: true,
      packet: packetObj,
      error: null,
      isAnomaly: isAnomaly,
      anomalyReasons: anomalyReasons,
      deltaTimestamp: deltaTs
    };
  }

  /**
   * Validate that the object strictly conforms to the CanSat Telemetry Schema.
   */
  validateSchema(obj) {
    if (typeof obj.timestamp !== 'number') {
      return { valid: false, reason: 'Field "timestamp" must be a number' };
    }
    if (typeof obj.status !== 'string') {
      return { valid: false, reason: 'Field "status" must be a string' };
    }
    if (!obj.sensors || typeof obj.sensors !== 'object') {
      return { valid: false, reason: 'Field "sensors" must be an object' };
    }

    // Check bmp280 sub-object
    const bmp = obj.sensors.bmp280;
    if (!bmp || typeof bmp !== 'object') {
      return { valid: false, reason: 'Field "sensors.bmp280" missing or invalid' };
    }
    if (typeof bmp.temp_c !== 'number') {
      return { valid: false, reason: 'Field "sensors.bmp280.temp_c" must be a number' };
    }
    if (typeof bmp.pressure_hpa !== 'number') {
      return { valid: false, reason: 'Field "sensors.bmp280.pressure_hpa" must be a number' };
    }
    if (typeof bmp.altitude_m !== 'number') {
      return { valid: false, reason: 'Field "sensors.bmp280.altitude_m" must be a number' };
    }

    // Check telemetry sub-object
    const telem = obj.sensors.telemetry;
    if (!telem || typeof telem !== 'object') {
      return { valid: false, reason: 'Field "sensors.telemetry" missing or invalid' };
    }
    if (typeof telem.rssi_lora !== 'number') {
      return { valid: false, reason: 'Field "sensors.telemetry.rssi_lora" must be a number' };
    }
    if (typeof telem.snr !== 'number') {
      return { valid: false, reason: 'Field "sensors.telemetry.snr" must be a number' };
    }
    if (typeof telem.grid_ref !== 'string') {
      return { valid: false, reason: 'Field "sensors.telemetry.grid_ref" must be a string' };
    }

    return { valid: true };
  }

  /**
   * Parse an incoming 10-field ASCII CSV telemetry line.
   * Format: TeamID, Mission_time, Packet_count, Altitude, Temperature, Voltage, Accel_X, Accel_Y, Accel_Z, State
   * Precision: 4-digit int, HH:MM:SS, int, float 1 dec, float 1 dec, float 2 dec, float 2 dec, float 2 dec, float 2 dec, 4-char string
   * @param {string} csvLine
   * @returns {{ success: boolean, packet: object|null, error: string|null, isAnomaly: boolean }}
   */
  parseCSV(csvLine) {
    const raw = csvLine.trim();
    const parts = raw.split(',').map(s => s.trim());

    if (parts.length !== 10) {
      this.malformedPackets++;
      return {
        success: false,
        packet: null,
        error: `CSV Format Violation: Expected 10 fields, received ${parts.length}`,
        raw: raw,
        isAnomaly: true
      };
    }

    // 1. TeamID (4-digit integer)
    const teamId = parseInt(parts[0], 10);
    if (isNaN(teamId) || teamId < 0) {
      this.malformedPackets++;
      return {
        success: false,
        packet: null,
        error: `Invalid TeamID: '${parts[0]}' (expected 4-digit integer)`,
        raw: raw,
        isAnomaly: true
      };
    }

    // 2. Mission_time (HH:MM:SS)
    const missionTime = parts[1];
    const timeMatch = missionTime.match(/^(\d{1,2}):(\d{2}):(\d{2})$/);
    if (!timeMatch) {
      this.malformedPackets++;
      return {
        success: false,
        packet: null,
        error: `Invalid Mission_time: '${parts[1]}' (expected HH:MM:SS)`,
        raw: raw,
        isAnomaly: true
      };
    }

    // 3. Packet_count (integer)
    const packetCount = parseInt(parts[2], 10);
    if (isNaN(packetCount)) {
      this.malformedPackets++;
      return {
        success: false,
        packet: null,
        error: `Invalid Packet_count: '${parts[2]}' (expected integer)`,
        raw: raw,
        isAnomaly: true
      };
    }

    // 4. Altitude (float 1 decimal)
    const altitude = parseFloat(parts[3]);
    if (isNaN(altitude)) {
      this.malformedPackets++;
      return {
        success: false,
        packet: null,
        error: `Invalid Altitude: '${parts[3]}' (expected float)`,
        raw: raw,
        isAnomaly: true
      };
    }

    // 5. Temperature (float 1 decimal)
    const temperature = parseFloat(parts[4]);
    if (isNaN(temperature)) {
      this.malformedPackets++;
      return {
        success: false,
        packet: null,
        error: `Invalid Temperature: '${parts[4]}' (expected float)`,
        raw: raw,
        isAnomaly: true
      };
    }

    // 6. Voltage (float 2 decimals)
    const voltage = parseFloat(parts[5]);
    if (isNaN(voltage)) {
      this.malformedPackets++;
      return {
        success: false,
        packet: null,
        error: `Invalid Voltage: '${parts[5]}' (expected float)`,
        raw: raw,
        isAnomaly: true
      };
    }

    // 7, 8, 9. Accel_X, Accel_Y, Accel_Z (float 2 decimals)
    const accelX = parseFloat(parts[6]);
    const accelY = parseFloat(parts[7]);
    const accelZ = parseFloat(parts[8]);
    if (isNaN(accelX) || isNaN(accelY) || isNaN(accelZ)) {
      this.malformedPackets++;
      return {
        success: false,
        packet: null,
        error: `Invalid Accelerometer values: (${parts[6]}, ${parts[7]}, ${parts[8]})`,
        raw: raw,
        isAnomaly: true
      };
    }

    // 10. State (4-character string)
    const stateStr = parts[9].slice(0, 4).toUpperCase();
    if (stateStr.length === 0) {
      this.malformedPackets++;
      return {
        success: false,
        packet: null,
        error: `Invalid State: empty string`,
        raw: raw,
        isAnomaly: true
      };
    }

    // Determine acceleration units:
    // Standard CanSat accelerometers are configured to +-16g full scale.
    // If raw readings are already in G (e.g. ~1.0 on pad Z axis, or magnitude <= 16.5):
    const rawHypot = Math.hypot(accelX, accelY, accelZ);
    let accelG, accelMps2;
    if (rawHypot > 16.5 || Math.abs(accelZ) > 6.0) {
      // Readings in m/s^2
      accelMps2 = { x: accelX, y: accelY, z: accelZ };
      accelG = {
        x: Number((accelX / 9.80665).toFixed(2)),
        y: Number((accelY / 9.80665).toFixed(2)),
        z: Number((accelZ / 9.80665).toFixed(2))
      };
    } else {
      // Readings in G
      accelG = { x: accelX, y: accelY, z: accelZ };
      accelMps2 = {
        x: Number((accelX * 9.80665).toFixed(2)),
        y: Number((accelY * 9.80665).toFixed(2)),
        z: Number((accelZ * 9.80665).toFixed(2))
      };
    }

    // Estimate barometric pressure from altitude using standard ISA formula
    const p0 = 1013.25;
    const t0 = 288.15;
    const lapse = 0.0065;
    const estimatedPress = p0 * Math.pow(Math.max(0.001, 1 - (lapse * altitude) / t0), 5.25588);

    // Map 4-character State to flight phase
    const phaseMap = {
      'IDLE': 'PAD',
      'PAD_': 'PAD',
      'ASC_': 'ASCENT',
      'ASCT': 'ASCENT',
      'HOVR': 'DRONE_HOVER',
      'APOG': 'APOGEE',
      'DESC': 'FREEFALL',
      'FALL': 'FREEFALL',
      'CHUT': 'PARACHUTE',
      'PARA': 'PARACHUTE',
      'LAND': 'LANDED',
      'GRND': 'LANDED'
    };
    const flightPhase = phaseMap[stateStr] || 'EN_VUELO';

    let isAnomaly = false;
    let anomalyReasons = [];

    // Check battery voltage bounds (nominal LiPo 3.30V to 4.30V)
    if (voltage < 3.30) {
      isAnomaly = true;
      anomalyReasons.push(`Batería Crítica (${voltage.toFixed(2)}V)`);
    } else if (voltage > 4.35) {
      isAnomaly = true;
      anomalyReasons.push(`Sobrevoltaje de Batería (${voltage.toFixed(2)}V)`);
    }

    // Check accelerometer saturation (+-16g range)
    const totalG = Math.hypot(accelG.x, accelG.y, accelG.z);
    if (totalG > 16.0) {
      isAnomaly = true;
      anomalyReasons.push(`Saturación Acelerómetro (${totalG.toFixed(2)}G > 16.0G)`);
    }

    // Check temperature bounds (-30 to +65 C)
    if (temperature < -30 || temperature > 65) {
      isAnomaly = true;
      anomalyReasons.push(`Temperatura Extrema (${temperature.toFixed(1)}°C)`);
    }

    if (isAnomaly) {
      this.anomalyCount++;
    }
    this.totalPacketsParsed++;

    const timestamp = Number((Date.now() / 1000).toFixed(2));
    const deltaTs = this.lastTimestamp ? (timestamp - this.lastTimestamp) : null;
    this.lastTimestamp = timestamp;

    const packetObj = {
      timestamp: timestamp,
      status: isAnomaly ? 'ANOMALY_TELEMETRY' : 'NOMINAL',
      teamId: teamId,
      missionTime: missionTime,
      packetCount: packetCount,
      voltage: Number(voltage.toFixed(2)),
      flightState: stateStr,
      rawCSV: raw,
      sensors: {
        bmp280: {
          temp_c: Number(temperature.toFixed(1)),
          pressure_hpa: Number(estimatedPress.toFixed(1)),
          altitude_m: Number(altitude.toFixed(1))
        },
        battery: {
          voltage_v: Number(voltage.toFixed(2))
        },
        telemetry: {
          team_id: teamId,
          mission_time: missionTime,
          packet_count: packetCount,
          state: stateStr,
          rssi_lora: -60,
          snr: 10.0,
          grid_ref: '0N 0E',
          launch_method: 'DRONE',
          flight_phase: flightPhase
        },
        imu: {
          accel_mps2: accelMps2,
          accel_g: accelG,
          gyro_rads: { x: 0, y: 0, z: 0 },
          quaternion: { w: 1, x: 0, y: 0, z: 0 },
          euler_deg: { roll: 0, pitch: 0, yaw: 0 }
        },
        kalman: {
          filteredAltitude_m: Number(altitude.toFixed(1)),
          filteredVelocity_mps: 0
        }
      }
    };

    return {
      success: true,
      packet: packetObj,
      error: null,
      isAnomaly: isAnomaly,
      anomalyReasons: anomalyReasons,
      deltaTimestamp: deltaTs
    };
  }

  /**
   * Format any packet into the official CanSat ASCII CSV format:
   * TeamID,Mission_time,Packet_count,Altitude,Temperature,Voltage,Accel_X,Accel_Y,Accel_Z,State\n
   * Precision: 4-digit int, HH:MM:SS, int, float 1 dec, float 1 dec, float 2 dec, float 2 dec, float 2 dec, float 2 dec, 4-char string
   */
  static formatCSV(packet) {
    if (!packet) return '';
    const bmp = packet.sensors?.bmp280 || {};
    const telem = packet.sensors?.telemetry || {};
    const imu = packet.sensors?.imu || {};
    const batt = packet.sensors?.battery || {};

    // 1. TeamID (4-digit int)
    const teamIdVal = packet.teamId ?? telem.team_id ?? 1024;
    const teamIdStr = String(Math.max(0, parseInt(teamIdVal, 10) || 1024)).padStart(4, '0');

    // 2. Mission_time (HH:MM:SS)
    let missionTimeStr = packet.missionTime || telem.mission_time;
    if (!missionTimeStr || !missionTimeStr.includes(':')) {
      const ts = packet.timestamp || 0;
      const d = new Date(ts * 1000);
      missionTimeStr = d.toISOString().substr(11, 8);
    }

    // 3. Packet_count (int)
    const pktCount = packet.packetCount ?? telem.packet_count ?? 0;

    // 4. Altitude (float 1 dec)
    const alt = Number((bmp.altitude_m ?? packet.altitude ?? 0)).toFixed(1);

    // 5. Temperature (float 1 dec)
    const temp = Number((bmp.temp_c ?? packet.temperature ?? 0)).toFixed(1);

    // 6. Voltage (float 2 dec)
    const volt = Number((batt.voltage_v ?? packet.voltage ?? 4.10)).toFixed(2);

    // 7, 8, 9. Accel_X, Accel_Y, Accel_Z (float 2 dec in G)
    let ax = 0, ay = 0, az = 1.0;
    if (imu.accel_g) {
      ax = imu.accel_g.x ?? 0;
      ay = imu.accel_g.y ?? 0;
      az = imu.accel_g.z ?? 1.0;
    } else if (imu.accel_mps2) {
      ax = (imu.accel_mps2.x ?? 0) / 9.80665;
      ay = (imu.accel_mps2.y ?? 0) / 9.80665;
      az = (imu.accel_mps2.z ?? 9.80665) / 9.80665;
    }

    // 10. State (4-character string)
    let stateStr = packet.flightState || telem.state;
    if (!stateStr) {
      const phase = telem.flight_phase || packet.status || 'PAD';
      const stateMap = {
        'PAD': 'IDLE',
        'PRE-LAUNCH': 'IDLE',
        'ASCENT': 'ASC_',
        'DRONE_ASCENT': 'ASC_',
        'DRONE_HOVER': 'HOVR',
        'HOVER': 'HOVR',
        'APOGEE': 'APOG',
        'DRONE_RELEASE': 'APOG',
        'FREEFALL': 'DESC',
        'PARACHUTE': 'CHUT',
        'LANDED': 'LAND'
      };
      stateStr = stateMap[phase] || phase.padEnd(4, '_').slice(0, 4);
    }
    stateStr = stateStr.padEnd(4, '_').slice(0, 4).toUpperCase();

    return `${teamIdStr},${missionTimeStr},${pktCount},${alt},${temp},${volt},${Number(ax).toFixed(2)},${Number(ay).toFixed(2)},${Number(az).toFixed(2)},${stateStr}\n`;
  }

  /**
   * Parse grid reference string (e.g., "34N 56E") into polar & cartesian coordinates relative to ground station.
   */
  static parseGridRef(gridRefStr) {
    // Format: "34N 56E" or similar
    if (!gridRefStr || typeof gridRefStr !== 'string') {
      return { x: 0, y: 0, azimuth_deg: 0, distance_m: 0, valid: false };
    }

    const match = gridRefStr.trim().match(/^(\d+(?:\.\d+)?)\s*([NS])\s+(\d+(?:\.\d+)?)\s*([EW])$/i);
    if (!match) {
      return { x: 0, y: 0, azimuth_deg: 0, distance_m: 0, valid: false };
    }

    const val1 = parseFloat(match[1]);
    const dir1 = match[2].toUpperCase();
    const val2 = parseFloat(match[3]);
    const dir2 = match[4].toUpperCase();

    // Ground Station coordinate origin (0, 0)
    // Scale: 1 unit approx 10 meters relative offset for CanSat range
    const y = (dir1 === 'N' ? val1 : -val1) * 10;
    const x = (dir2 === 'E' ? val2 : -val2) * 10;

    const distance = Math.hypot(x, y);
    let azimuth = (Math.atan2(x, y) * (180 / Math.PI)); // 0 deg is North, clockwise
    if (azimuth < 0) azimuth += 360;

    return {
      x: Number(x.toFixed(1)),
      y: Number(y.toFixed(1)),
      azimuth_deg: Number(azimuth.toFixed(1)),
      distance_m: Number(distance.toFixed(1)),
      valid: true
    };
  }
}

// Attach to window
window.TelemetryParser = TelemetryParser;
