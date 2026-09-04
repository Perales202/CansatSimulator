/**
 * ============================================================================
 * CAN-SAT SITL (SOFTWARE-IN-THE-LOOP) PHYSICS ENGINE
 * Pure mathematical simulation modeling gravity, atmospheric mechanics,
 * barometric pressure, thermodynamic lapse rates, parachute drag,
 * radio-link attenuation, and Gaussian variance.
 * ============================================================================
 */

class PhysicsSITL {
  constructor(onPacketCallback) {
    this.onPacket = onPacketCallback || (() => {});
    this.intervalId = null;
    this.running = false;
    this.frequencyHz = 2; // Default: 2 updates per second

    // Physical Constants
    this.GRAVITY = 9.80665;       // m/s^2
    this.P0 = 1013.25;            // Sea-level standard pressure (hPa)
    this.T0_KELVIN = 288.15;      // Sea-level standard temp (15.0 C in Kelvin)
    this.LAPSE_RATE = 0.0065;     // K/m
    this.GAS_CONST_AIR = 287.05;  // J / (kg * K)
    this.AIR_MOLAR_MASS = 0.0289644; // kg/mol
    this.UNIVERSAL_GAS = 8.3144598; // J/(mol*K)

    // CanSat Physical Specs
    this.CANSAT_MASS = 0.350;     // 350 grams standard CanSat
    this.CHUTE_DRAG_COEFF = 1.35; // Standard hemispherical chute Cd
    this.CHUTE_AREA = 0.125;      // m^2
    this.BODY_DRAG_COEFF = 0.45;  // Body alone without chute
    this.BODY_AREA = 0.0045;      // m^2 (approx 66mm diameter cylinder)

    // Current State Vector
    this.state = {
      altitude_m: 0,
      velocity_mps: 0,
      acceleration_mps2: 0,
      posX_m: 0,                  // Grid relative coordinates
      posY_m: 0,
      windSpeed_mps: 3.2,
      windDirection_deg: 45,     // Blowing towards North-East
      phase: 'PAD',               // PAD -> ASCENT -> APOGEE -> FREEFALL -> PARACHUTE -> LANDED
      elapsedTime_s: 0,
      apogeeTarget_m: 850,        // Simulated apogee
      chuteDeployAlt_m: 500,      // Parachute deployment altitude
      parachuteDeployed: false,
      anomaly: null               // null, 'PARACHUTE_FAILURE', 'BARO_SPIKE', 'SIGNAL_DROP'
    };

    // Random Number Generator with Box-Muller Gaussian Noise
    this.gaussianNoise = (mean = 0, stdev = 1) => {
      let u1 = Math.random();
      let u2 = Math.random();
      while (u1 === 0) u1 = Math.random(); // avoid log(0)
      const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
      return z0 * stdev + mean;
    };

    // NASA 42 / cFS Attitude Dynamics & Kalman Filter Modules
    this.attitude = window.AttitudeDynamics ? new window.AttitudeDynamics(this.CANSAT_MASS) : null;
    this.kalman = window.BaroInertialKalmanFilter ? new window.BaroInertialKalmanFilter() : null;
  }

  /**
   * Configure physical mission parameters from the SITL popup dialog
   */
  configure(params = {}) {
    if (params.apogeeTarget_m !== undefined) this.state.apogeeTarget_m = Number(params.apogeeTarget_m);
    if (params.chuteDeployAlt_m !== undefined) this.state.chuteDeployAlt_m = Number(params.chuteDeployAlt_m);
    if (params.massGrams !== undefined) this.CANSAT_MASS = Number(params.massGrams) / 1000;
    if (params.windSpeed_mps !== undefined) this.state.windSpeed_mps = Number(params.windSpeed_mps);
    if (params.windDirection_deg !== undefined) this.state.windDirection_deg = Number(params.windDirection_deg);
    if (params.frequencyHz !== undefined) this.setFrequency(Number(params.frequencyHz));
    if (params.anomaly !== undefined) {
      this.state.anomaly = (params.anomaly === 'NONE' || !params.anomaly) ? null : params.anomaly;
    }
  }

  start() {
    if (this.running) return;
    this.running = true;
    const intervalMs = 1000 / this.frequencyHz;
    this.intervalId = setInterval(() => this.step(), intervalMs);
  }

  stop() {
    this.running = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  setFrequency(hz) {
    this.frequencyHz = Math.max(1, Math.min(10, hz));
    if (this.running) {
      this.stop();
      this.start();
    }
  }

  setAnomaly(type) {
    this.state.anomaly = type;
  }

  clearAnomaly() {
    this.state.anomaly = null;
  }

  reset() {
    this.state.altitude_m = 0;
    this.state.velocity_mps = 0;
    this.state.acceleration_mps2 = 0;
    this.state.posX_m = 0;
    this.state.posY_m = 0;
    this.state.phase = 'PAD';
    this.state.elapsedTime_s = 0;
    this.state.parachuteDeployed = false;
    this.state.anomaly = null;

    if (this.attitude) this.attitude.reset();
    if (this.kalman) this.kalman.reset(0);
  }

  /**
   * Main Physics Step Iteration
   */
  step() {
    const dt = 1 / this.frequencyHz;
    this.state.elapsedTime_s += dt;

    // State Machine update (linear aerodynamics & gravity)
    this.updateFlightMechanics(dt);

    // 6-DOF Rotational Dynamics propagation (Euler Equations + Quaternions)
    if (this.attitude) {
      this.attitude.step(dt, this.state.phase, this.state.windSpeed_mps);
    }

    // Calculate synthetic sensor readouts from physical state
    const packet = this.generateSyntheticTelemetry();

    // Transmit synthesized packet
    this.onPacket(packet);
  }

  updateFlightMechanics(dt) {
    const s = this.state;

    switch (s.phase) {
      case 'PAD':
        s.altitude_m = 0;
        s.velocity_mps = 0;
        s.acceleration_mps2 = 0;
        // Auto-launch after 3 seconds in PAD
        if (s.elapsedTime_s >= 3) {
          s.phase = 'ASCENT';
        }
        break;

      case 'ASCENT':
        // Simulated rocket propulsion curve
        const ascentThrustAcc = 45; // ~4.5G ascent
        s.acceleration_mps2 = ascentThrustAcc - this.GRAVITY;
        s.velocity_mps += s.acceleration_mps2 * dt;
        s.altitude_m += s.velocity_mps * dt;

        // Check for apogee condition
        if (s.altitude_m >= s.apogeeTarget_m) {
          s.phase = 'APOGEE';
          s.velocity_mps = 0;
          s.acceleration_mps2 = 0;
        }
        break;

      case 'APOGEE':
        s.phase = 'FREEFALL';
        break;

      case 'FREEFALL':
        // Gravitational descent with body drag
        const rho = this.calculateAirDensity(s.altitude_m);
        const bodyDrag = 0.5 * rho * Math.pow(s.velocity_mps, 2) * this.BODY_DRAG_COEFF * this.BODY_AREA;
        const dragAcc = bodyDrag / this.CANSAT_MASS;

        s.acceleration_mps2 = -this.GRAVITY + (s.velocity_mps < 0 ? dragAcc : -dragAcc);
        s.velocity_mps += s.acceleration_mps2 * dt;
        s.altitude_m += s.velocity_mps * dt;

        // Check parachute deployment condition
        if (s.altitude_m <= s.chuteDeployAlt_m && s.anomaly !== 'PARACHUTE_FAILURE') {
          s.phase = 'PARACHUTE';
          s.parachuteDeployed = true;
        }

        if (s.altitude_m <= 0) {
          s.altitude_m = 0;
          s.velocity_mps = 0;
          s.phase = 'LANDED';
        }
        break;

      case 'PARACHUTE':
        // Controlled descent with parachute (Sub-stepped to prevent integration overshoot)
        const subSteps = Math.max(1, Math.ceil(dt / 0.01));
        const dtSub = dt / subSteps;

        for (let i = 0; i < subSteps; i++) {
          const airRho = this.calculateAirDensity(s.altitude_m);
          const v = s.velocity_mps;
          const chuteDrag = 0.5 * airRho * (v * v) * this.CHUTE_DRAG_COEFF * this.CHUTE_AREA;
          const dragAcc = chuteDrag / this.CANSAT_MASS;

          // Drag opposes motion direction
          const netAcc = -this.GRAVITY + (v < 0 ? dragAcc : -dragAcc);
          s.acceleration_mps2 = netAcc;
          s.velocity_mps += netAcc * dtSub;
          s.altitude_m += s.velocity_mps * dtSub;
        }

        // Wind drift translation
        const windRad = (s.windDirection_deg * Math.PI) / 180;
        s.posX_m += Math.sin(windRad) * s.windSpeed_mps * dt;
        s.posY_m += Math.cos(windRad) * s.windSpeed_mps * dt;

        if (s.altitude_m <= 0) {
          s.altitude_m = 0;
          s.velocity_mps = 0;
          s.phase = 'LANDED';
        }
        break;

      case 'LANDED':
        s.altitude_m = 0;
        s.velocity_mps = 0;
        s.acceleration_mps2 = 0;
        break;
    }
  }

  calculateAirDensity(alt) {
    const tempK = this.T0_KELVIN - (this.LAPSE_RATE * alt);
    const pressPa = this.calculateAtmosphericPressure(alt) * 100;
    return pressPa / (this.GAS_CONST_AIR * Math.max(150, tempK));
  }

  calculateAtmosphericPressure(alt) {
    // Barometric formula
    const exponent = (this.GRAVITY * this.AIR_MOLAR_MASS) / (this.UNIVERSAL_GAS * this.LAPSE_RATE);
    const ratio = 1 - (this.LAPSE_RATE * alt) / this.T0_KELVIN;
    return this.P0 * Math.pow(Math.max(0.001, ratio), exponent);
  }

  calculateTemperatureCelsius(alt) {
    return (this.T0_KELVIN - 273.15) - (this.LAPSE_RATE * alt);
  }

  /**
   * Convert X/Y meters to PRD Grid Reference string (e.g. "34N 56E")
   */
  formatGridRef(xMeters, yMeters) {
    const n = Math.abs(yMeters / 10);
    const e = Math.abs(xMeters / 10);
    const latDir = yMeters >= 0 ? 'N' : 'S';
    const lonDir = xMeters >= 0 ? 'E' : 'W';
    return `${Math.round(n)}${latDir} ${Math.round(e)}${lonDir}`;
  }

  /**
   * Assemble synthetic JSON packet with realistic sensor variance and noise.
   */
  generateSyntheticTelemetry() {
    const s = this.state;

    // Physical base variables
    const baseTemp = this.calculateTemperatureCelsius(s.altitude_m);
    const basePress = this.calculateAtmosphericPressure(s.altitude_m);
    const baseAlt = s.altitude_m;

    // Inject realistic Gaussian sensor jitter
    let measuredTemp = baseTemp + this.gaussianNoise(0, 0.12);
    let measuredPress = basePress + this.gaussianNoise(0, 0.35);
    let measuredAlt = baseAlt + this.gaussianNoise(0, 0.6);

    // Handle Active Anomalies
    let packetStatus = 'NOMINAL';
    if (s.anomaly === 'BARO_SPIKE') {
      measuredPress += 150.0; // Sudden barometric pressure shock
      measuredAlt = Math.max(0, measuredAlt - 800.0);
      packetStatus = 'ANOMALY_BARO_CORRUPT';
    } else if (s.anomaly === 'PARACHUTE_FAILURE') {
      packetStatus = 'WARNING_CHUTE_FAIL';
    }

    // Radio RF model: RSSI attenuation with distance
    const distance3D = Math.hypot(s.posX_m, s.posY_m, s.altitude_m);
    // Free space path loss approximation
    let baseRssi = -38 - (20 * Math.log10(Math.max(10, distance3D) / 10));
    baseRssi += this.gaussianNoise(0, 2.5); // RF fading

    let baseSnr = 11.5 - (distance3D / 300);
    baseSnr += this.gaussianNoise(0, 0.8);

    if (s.anomaly === 'SIGNAL_DROP') {
      baseRssi = -118 + this.gaussianNoise(0, 4.0);
      baseSnr = -8.5 + this.gaussianNoise(0, 1.2);
      packetStatus = 'ANOMALY_RF_DEGRADED';
    }

    const gridRefStr = this.formatGridRef(s.posX_m, s.posY_m);

    // 6-DOF IMU Sensor Data (Euler angles, Quaternions, Accelerometer, Gyroscope)
    const imuData = this.attitude 
      ? this.attitude.getSyntheticIMU(s.acceleration_mps2, this.GRAVITY)
      : null;

    // Baro-Inertial Kalman Filter Fusion (Altitude & Vertical Speed)
    let kalmanData = null;
    if (this.kalman && imuData) {
      this.kalman.predict(1 / this.frequencyHz, imuData.accel_mps2.z - this.GRAVITY);
      kalmanData = this.kalman.update(measuredAlt);
    }

    // Return exact PRD JSON format + extended attitude/inertial sensors
    return {
      timestamp: Number((Date.now() / 1000).toFixed(2)),
      status: packetStatus,
      sensors: {
        bmp280: {
          temp_c: Number(measuredTemp.toFixed(1)),
          pressure_hpa: Number(measuredPress.toFixed(1)),
          altitude_m: Number(Math.max(0, measuredAlt).toFixed(1))
        },
        telemetry: {
          rssi_lora: Math.round(baseRssi),
          snr: Number(baseSnr.toFixed(1)),
          grid_ref: gridRefStr
        },
        imu: imuData,
        kalman: kalmanData
      }
    };
  }
}

window.PhysicsSITL = PhysicsSITL;
