/**
 * ============================================================================
 * CAN-SAT DIEGETIC SENSORY AUDIO SYSTEM (WEB AUDIO API)
 * Synthesizes procedural acoustic feedback and directional spatial audio
 * for telemetry reception, altitude triggers, and critical anomaly alerts.
 * In full compliance with PRD Section 2: "Fidelidad Sensorial: Retroalimentación
 * de audio direccional ante anomalías en los paquetes de datos."
 * ============================================================================
 */

class AudioSystem {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.enabled = true;
    this.volume = 0.4;
    this.lastAlarmTime = 0;
  }

  /**
   * Initializes or unlocks Web Audio Context on user gesture.
   */
  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') {
        this.ctx.resume();
      }
      return;
    }

    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(this.volume, this.ctx.currentTime);
      this.masterGain.connect(this.ctx.destination);
    } catch (e) {
      console.warn('[AudioSystem] Web Audio API init failed:', e);
    }
  }

  setVolume(vol) {
    this.volume = Math.max(0, Math.min(1, vol));
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(this.volume, this.ctx.currentTime);
    }
  }

  setEnabled(bool) {
    this.enabled = Boolean(bool);
  }

  /**
   * Calculate stereo panning (-1.0 to +1.0) from CanSat azimuth (0 deg = North, 90 = East, 270 = West).
   */
  calculatePanFromAzimuth(azimuthDeg) {
    if (typeof azimuthDeg !== 'number' || isNaN(azimuthDeg)) return 0;
    // Map: 0 deg (North / Ahead) -> 0.0 pan
    // 90 deg (East / Right) -> +1.0 pan
    // 270 deg (West / Left) -> -1.0 pan
    // 180 deg (South / Behind) -> 0.0 pan
    const rad = (azimuthDeg * Math.PI) / 180;
    return Math.sin(rad); // sin(90) = +1, sin(270) = -1, sin(0) = 0
  }

  /**
   * Subtle tactical telemetry chirp with directional stereo pan
   */
  playTelemetryChirp(azimuthDeg = 0) {
    if (!this.enabled || !this.ctx) return;
    if (this.ctx.state === 'suspended') return;

    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const panner = this.ctx.createStereoPanner ? this.ctx.createStereoPanner() : null;

      osc.type = 'sine';
      osc.frequency.setValueAtTime(1400, now);
      osc.frequency.exponentialRampToValueAtTime(800, now + 0.04);

      gain.gain.setValueAtTime(0.04 * this.volume, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);

      if (panner) {
        panner.pan.setValueAtTime(this.calculatePanFromAzimuth(azimuthDeg), now);
        osc.connect(gain);
        gain.connect(panner);
        panner.connect(this.masterGain);
      } else {
        osc.connect(gain);
        gain.connect(this.masterGain);
      }

      osc.start(now);
      osc.stop(now + 0.045);
    } catch (_) {}
  }

  /**
   * Warning audio alert (dual-tone frequency shift)
   */
  playWarningTone(azimuthDeg = 0) {
    if (!this.enabled || !this.ctx) return;
    if (this.ctx.state === 'suspended') return;

    // Rate-limit alarms to once per 1.5s
    const nowMs = Date.now();
    if (nowMs - this.lastAlarmTime < 1500) return;
    this.lastAlarmTime = nowMs;

    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const panner = this.ctx.createStereoPanner ? this.ctx.createStereoPanner() : null;

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(650, now);
      osc.frequency.setValueAtTime(880, now + 0.12);
      osc.frequency.setValueAtTime(650, now + 0.24);

      gain.gain.setValueAtTime(0.25 * this.volume, now);
      gain.gain.linearRampToValueAtTime(0.01, now + 0.35);

      if (panner) {
        panner.pan.setValueAtTime(this.calculatePanFromAzimuth(azimuthDeg), now);
        osc.connect(gain);
        gain.connect(panner);
        panner.connect(this.masterGain);
      } else {
        osc.connect(gain);
        gain.connect(this.masterGain);
      }

      osc.start(now);
      osc.stop(now + 0.36);
    } catch (_) {}
  }

  /**
   * Critical hazard alarm (urgent pulsed siren with directional cues)
   */
  playCriticalAlarm(azimuthDeg = 0) {
    if (!this.enabled || !this.ctx) return;
    if (this.ctx.state === 'suspended') return;

    const nowMs = Date.now();
    if (nowMs - this.lastAlarmTime < 1200) return;
    this.lastAlarmTime = nowMs;

    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const panner = this.ctx.createStereoPanner ? this.ctx.createStereoPanner() : null;

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(950, now);
      osc.frequency.linearRampToValueAtTime(450, now + 0.2);
      osc.frequency.linearRampToValueAtTime(950, now + 0.4);

      gain.gain.setValueAtTime(0.35 * this.volume, now);
      gain.gain.linearRampToValueAtTime(0.01, now + 0.45);

      if (panner) {
        panner.pan.setValueAtTime(this.calculatePanFromAzimuth(azimuthDeg), now);
        osc.connect(gain);
        gain.connect(panner);
        panner.connect(this.masterGain);
      } else {
        osc.connect(gain);
        gain.connect(this.masterGain);
      }

      osc.start(now);
      osc.stop(now + 0.46);
    } catch (_) {}
  }
}

window.AudioSystem = new AudioSystem();
