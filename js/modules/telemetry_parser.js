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
   * Parse and strictly validate an incoming JSON telemetry string.
   * @param {string|object} rawInput - Raw serial line or object
   * @returns {{ success: boolean, packet: object|null, error: string|null, isAnomaly: boolean }}
   */
  parse(rawInput) {
    let packetObj = null;

    if (typeof rawInput === 'string') {
      try {
        packetObj = JSON.parse(rawInput.trim());
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
    } else if (typeof rawInput === 'object' && rawInput !== null) {
      packetObj = rawInput;
    } else {
      this.malformedPackets++;
      return {
        success: false,
        packet: null,
        error: 'Invalid input type: Expected JSON string or object',
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
