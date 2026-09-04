/**
 * ============================================================================
 * CAN-SAT ATTITUDE DYNAMICS & SENSOR FUSION MATHEMATICS
 * Inspired by NASA 42 and cFS (core Flight System) algorithms:
 * - 6-DOF Quaternion kinematics (non-singular 3D orientation)
 * - Euler's Equations for Rigid Body Rotational Dynamics
 * - Parachute Pendulum Restoring Torque & Aerodynamic Damping
 * - Allan Variance / IMU Drift & Bias Models
 * - 1D Kalman Filter for Baro-Inertial Altitude & Vertical Speed Fusion
 * ============================================================================
 */

class Quaternion {
  constructor(w = 1, x = 0, y = 0, z = 0) {
    this.w = w;
    this.x = x;
    this.y = y;
    this.z = z;
  }

  normalize() {
    const mag = Math.hypot(this.w, this.x, this.y, this.z);
    if (mag > 0.00001) {
      this.w /= mag;
      this.x /= mag;
      this.y /= mag;
      this.z /= mag;
    } else {
      this.w = 1; this.x = 0; this.y = 0; this.z = 0;
    }
    return this;
  }

  /**
   * Quaternion multiplication (Hamilton product): q1 * q2
   */
  multiply(q) {
    return new Quaternion(
      this.w * q.w - this.x * q.x - this.y * q.y - this.z * q.z,
      this.w * q.x + this.x * q.w + this.y * q.z - this.z * q.y,
      this.w * q.y - this.x * q.z + this.y * q.w + this.z * q.x,
      this.w * q.z + this.x * q.y - this.y * q.x + this.z * q.w
    );
  }

  /**
   * Propagate quaternion by angular velocity vector [wx, wy, wz] over time dt
   * (NASA 42 kinematic propagation algorithm)
   */
  integrateAngularVelocity(omega, dt) {
    const [wx, wy, wz] = omega;
    const omegaMag = Math.hypot(wx, wy, wz);

    if (omegaMag < 1e-7) return this;

    const halfAngle = 0.5 * omegaMag * dt;
    const sinHalf = Math.sin(halfAngle) / omegaMag;
    const cosHalf = Math.cos(halfAngle);

    // Delta quaternion representing rotation over dt
    const dq = new Quaternion(cosHalf, wx * sinHalf, wy * sinHalf, wz * sinHalf);
    const updated = this.multiply(dq);
    this.w = updated.w;
    this.x = updated.x;
    this.y = updated.y;
    this.z = updated.z;
    return this.normalize();
  }

  /**
   * Convert Quaternion to Euler angles (Roll, Pitch, Yaw) in degrees
   * Aerospace standard (Tait-Bryan Z-Y-X rotation sequence)
   */
  toEulerDegrees() {
    const { w, x, y, z } = this;

    // Roll (x-axis rotation)
    const sinr_cosp = 2 * (w * x + y * z);
    const cosr_cosp = 1 - 2 * (x * x + y * y);
    const roll = Math.atan2(sinr_cosp, cosr_cosp);

    // Pitch (y-axis rotation)
    const sinp = 2 * (w * y - z * x);
    let pitch = 0;
    if (Math.abs(sinp) >= 1) {
      pitch = Math.sign(sinp) * (Math.PI / 2); // use 90 degrees if out of range
    } else {
      pitch = Math.asin(sinp);
    }

    // Yaw (z-axis rotation)
    const siny_cosp = 2 * (w * z + x * y);
    const cosy_cosp = 1 - 2 * (y * y + z * z);
    const yaw = Math.atan2(siny_cosp, cosy_cosp);

    return {
      roll_deg: Number(((roll * 180) / Math.PI).toFixed(1)),
      pitch_deg: Number(((pitch * 180) / Math.PI).toFixed(1)),
      yaw_deg: Number((((yaw * 180) / Math.PI + 360) % 360).toFixed(1))
    };
  }

  /**
   * Rotate a 3D vector [x, y, z] by this quaternion
   */
  rotateVector(v) {
    const qv = new Quaternion(0, v[0], v[1], v[2]);
    const qConj = new Quaternion(this.w, -this.x, -this.y, -this.z);
    const res = this.multiply(qv).multiply(qConj);
    return [res.x, res.y, res.z];
  }
}

/**
 * 6-DOF Rigid Body Attitude Dynamics Solver
 */
class AttitudeDynamics {
  constructor(massKg = 0.350, radiusM = 0.033, heightM = 0.115) {
    this.mass = massKg;
    this.radius = radiusM;
    this.height = heightM;

    // Moments of Inertia for a solid cylinder (CanSat standard shape)
    // Ixx = Iyy = (1/12) * m * (3*r^2 + h^2)
    // Izz = (1/2) * m * r^2
    this.Ixx = (1 / 12) * this.mass * (3 * Math.pow(this.radius, 2) + Math.pow(this.height, 2));
    this.Iyy = this.Ixx;
    this.Izz = 0.5 * this.mass * Math.pow(this.radius, 2);

    this.q = new Quaternion(1, 0, 0, 0);
    this.omega = [0, 0, 0]; // Angular rates [rad/s]

    // IMU Sensor Error Model (Allan Variance & Bias Drift)
    this.gyroBias = [0.008, -0.012, 0.005]; // rad/s
    this.accelBias = [0.03, -0.02, 0.05];   // m/s^2
  }

  /**
   * Update attitude dynamics using Euler's Equations of motion
   * I * dw/dt + w x (I * w) = Tau
   */
  step(dt, flightPhase, windSpeedMps = 0) {
    if (flightPhase === 'LANDED') {
      this.omega = [0, 0, 0];
      return;
    }

    if (flightPhase === 'PAD') {
      this.omega = [0, 0, 0];
      this.q = new Quaternion(1, 0, 0, 0);
      return;
    }

    // Sub-stepping for unconditional numerical stability:
    // With small spacecraft moments of inertia (I ~ 0.0004 kg*m^2), dt must be <= 5ms
    // to prevent stiffness-induced Euler divergence.
    const subSteps = Math.max(1, Math.ceil(dt / 0.005));
    const dtSub = dt / subSteps;

    for (let s = 0; s < subSteps; s++) {
      let torque = [0, 0, 0];
      const euler = this.q.toEulerDegrees();
      const rollRad = (euler.roll_deg * Math.PI) / 180;
      const pitchRad = (euler.pitch_deg * Math.PI) / 180;

      switch (flightPhase) {
        case 'ASCENT':
          // Rocket fin aerodynamic restoring torque: aligns nose with ascent velocity vector
          // + spin-stabilization along longitudinal Z-axis with aerodynamic drag limiting spin to ~1 rev/sec
          const kAscent = 0.012;
          const bAscent = 0.004;
          torque[0] = -kAscent * rollRad - bAscent * this.omega[0] + (Math.random() - 0.5) * 0.0002;
          torque[1] = -kAscent * pitchRad - bAscent * this.omega[1] + (Math.random() - 0.5) * 0.0002;
          // Spin torque with aerodynamic drag ceiling: Tau_z = k_spin * (targetOmega - wz)
          const targetSpinWz = 6.28; // ~1 rev/sec = 6.28 rad/s
          torque[2] = 0.0012 * (targetSpinWz - this.omega[2]);
          break;

        case 'APOGEE':
          // Separation transition: mild tumble
          torque[0] = (Math.random() - 0.5) * 0.001 - 0.001 * this.omega[0];
          torque[1] = (Math.random() - 0.5) * 0.001 - 0.001 * this.omega[1];
          torque[2] = -0.0005 * this.omega[2];
          break;

        case 'FREEFALL':
          // Uncontrolled tumble in free fall without parachute, air drag dampens extreme rates
          const tumbleTorque = 0.002;
          torque[0] = (Math.random() - 0.5) * tumbleTorque - 0.001 * this.omega[0];
          torque[1] = (Math.random() - 0.5) * tumbleTorque - 0.001 * this.omega[1];
          torque[2] = (Math.random() - 0.5) * tumbleTorque * 0.5 - 0.0008 * this.omega[2];
          break;

        case 'PARACHUTE':
          // Spherical pendulum with aerodynamic restoring torque & wind drift offset
          // Restoring stiffness from parachute riser: pulls CanSat upright (Roll -> 0, Pitch -> 0)
          const kChute = 0.008;  // Natural frequency ~ 4 rad/s (~0.65 Hz pendulum)
          const bChute = 0.0045; // Critical damping ratio ~ 0.73 (well-damped upright settling)

          // Wind induced steady tilt and gentle harmonic swaying
          const windDriftTilt = (windSpeedMps / 12) * 0.08; // ~3 to 5 deg steady tilt in wind
          const gustOscillation = Math.sin(Date.now() / 900 + s * dtSub) * 0.0004;

          torque[0] = -kChute * (rollRad - windDriftTilt) - bChute * this.omega[0] + gustOscillation;
          torque[1] = -kChute * pitchRad - bChute * this.omega[1] + gustOscillation * 0.6;
          torque[2] = -0.002 * this.omega[2]; // Gentle yaw spin damping
          break;
      }

      // Euler's rotational equations of motion:
      // I * dw/dt + w x (I * w) = Tau
      const [wx, wy, wz] = this.omega;

      const alphaX = (torque[0] - (this.Izz - this.Iyy) * wy * wz) / this.Ixx;
      const alphaY = (torque[1] - (this.Ixx - this.Izz) * wx * wz) / this.Iyy;
      const alphaZ = (torque[2] - (this.Iyy - this.Ixx) * wx * wy) / this.Izz;

      // Integrate angular velocity with physical limits
      this.omega[0] += Math.max(-120, Math.min(120, alphaX)) * dtSub;
      this.omega[1] += Math.max(-120, Math.min(120, alphaY)) * dtSub;
      this.omega[2] += Math.max(-120, Math.min(120, alphaZ)) * dtSub;

      // Realistic physical angular rate clamps: max 6 rad/s (~340 deg/s) for pitch/roll
      this.omega[0] = Math.max(-6.0, Math.min(6.0, this.omega[0]));
      this.omega[1] = Math.max(-6.0, Math.min(6.0, this.omega[1]));
      this.omega[2] = Math.max(-15.0, Math.min(15.0, this.omega[2]));

      // Kinematic propagation of orientation quaternion
      this.q.integrateAngularVelocity(this.omega, dtSub);
    }

    // Random walk of IMU bias (Allan variance model from NASA 42)
    for (let i = 0; i < 3; i++) {
      this.gyroBias[i] += (Math.random() - 0.5) * 0.00001;
    }
  }

  /**
   * Generates synthetic 6-DOF IMU sensor reading (Accelerometer + Gyroscope)
   * in the CanSat body frame, with bias and white noise.
   */
  getSyntheticIMU(inertialLinearAccZ, gravity = 9.80665) {
    // Total acceleration in world frame: a_world = [0, 0, a_z] - [0, 0, -g] = [0, 0, a_z + g]
    const aWorld = [0, 0, inertialLinearAccZ + gravity];

    // Transform world acceleration into CanSat body frame via conjugate rotation
    const aBody = new Quaternion(this.q.w, -this.q.x, -this.q.y, -this.q.z).rotateVector(aWorld);

    // Add white noise + sensor bias
    const noise = () => (Math.random() - 0.5) * 0.15;
    const gyroNoise = () => (Math.random() - 0.5) * 0.02;

    const euler = this.q.toEulerDegrees();

    return {
      accel_mps2: {
        x: Number((aBody[0] + this.accelBias[0] + noise()).toFixed(2)),
        y: Number((aBody[1] + this.accelBias[1] + noise()).toFixed(2)),
        z: Number((aBody[2] + this.accelBias[2] + noise()).toFixed(2))
      },
      gyro_rads: {
        x: Number((this.omega[0] + this.gyroBias[0] + gyroNoise()).toFixed(3)),
        y: Number((this.omega[1] + this.gyroBias[1] + gyroNoise()).toFixed(3)),
        z: Number((this.omega[2] + this.gyroBias[2] + gyroNoise()).toFixed(3))
      },
      quaternion: {
        w: Number(this.q.w.toFixed(4)),
        x: Number(this.q.x.toFixed(4)),
        y: Number(this.q.y.toFixed(4)),
        z: Number(this.q.z.toFixed(4))
      },
      euler_deg: euler
    };
  }

  reset() {
    this.q = new Quaternion(1, 0, 0, 0);
    this.omega = [0, 0, 0];
  }
}

/**
 * 1D Kalman Filter (Altitude & Vertical Speed Baro-Inertial Fusion)
 */
class BaroInertialKalmanFilter {
  constructor() {
    // State: [altitude_m, vertical_velocity_mps]
    this.x = [0, 0];

    // Covariance matrix P
    this.P = [
      [10, 0],
      [0, 10]
    ];

    // Process noise Q
    this.Q = [
      [0.05, 0.02],
      [0.02, 0.1]
    ];

    // Measurement noise R (BMP280 altitude variance)
    this.R = 0.85;
  }

  predict(dt, accelZ_mps2) {
    // State transition: x_new = x + v*dt + 0.5*a*dt^2, v_new = v + a*dt
    this.x[0] += this.x[1] * dt + 0.5 * accelZ_mps2 * dt * dt;
    this.x[1] += accelZ_mps2 * dt;

    // Covariance prediction: P = F * P * F^T + Q
    const p00 = this.P[0][0] + dt * (this.P[1][0] + this.P[0][1]) + dt * dt * this.P[1][1] + this.Q[0][0];
    const p01 = this.P[0][1] + dt * this.P[1][1] + this.Q[0][1];
    const p10 = this.P[1][0] + dt * this.P[1][1] + this.Q[1][0];
    const p11 = this.P[1][1] + this.Q[1][1];

    this.P[0][0] = p00;
    this.P[0][1] = p01;
    this.P[1][0] = p10;
    this.P[1][1] = p11;
  }

  update(measuredAlt_m) {
    // Innovation: y = z - H*x (H = [1, 0])
    const y = measuredAlt_m - this.x[0];
    const S = this.P[0][0] + this.R; // Innovation covariance

    // Kalman Gain: K = P * H^T / S
    const K0 = this.P[0][0] / S;
    const K1 = this.P[1][0] / S;

    // Updated state
    this.x[0] += K0 * y;
    this.x[1] += K1 * y;

    // Updated covariance: P = (I - K*H) * P
    const p00 = (1 - K0) * this.P[0][0];
    const p01 = (1 - K0) * this.P[0][1];
    const p10 = this.P[1][0] - K1 * this.P[0][0];
    const p11 = this.P[1][1] - K1 * this.P[0][1];

    this.P[0][0] = p00;
    this.P[0][1] = p01;
    this.P[1][0] = p10;
    this.P[1][1] = p11;

    return {
      filteredAltitude_m: Number(this.x[0].toFixed(2)),
      filteredVelocity_mps: Number(this.x[1].toFixed(2))
    };
  }

  reset(initialAlt = 0) {
    this.x = [initialAlt, 0];
    this.P = [[10, 0], [0, 10]];
  }
}

// Global exports
window.Quaternion = Quaternion;
window.AttitudeDynamics = AttitudeDynamics;
window.BaroInertialKalmanFilter = BaroInertialKalmanFilter;
