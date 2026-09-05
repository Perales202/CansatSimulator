/**
 * ============================================================================
 * CAN-SAT HIGH-PERFORMANCE 60FPS CANVAS CHARTS ENGINE (ADVANCED TACTICAL SUITE)
 * Multi-channel oscilloscope and trajectory analysis for real-time mission streams.
 * Supports:
 * - 4 Selectable channels (Flight Profile, Kinematics/G, Environment, RF Link)
 * - Dual-trace Barometric vs. Kalman Filtered Altitude Fusion
 * - Mission reference lines (Target Apogee/Release & Parachute Deployment)
 * - Temporal Flight Phase Landmark Event Flags (Liftoff, Release, Chute, Landing)
 * - Interactive Crosshair Scrubbing & Diegetic Tooltip Inspection
 * - Time-window scaling (30s, 60s, 120s, Complete Flight) & Live Freeze Mode
 * ============================================================================
 */

class ChartsEngine {
  constructor(containerEl) {
    this.container = containerEl;
    this.canvases = {};
    this.contexts = {};

    // Data buffers (supports full mission recording up to 2000 points)
    this.history = [];
    this.maxBufferPoints = 2000;
    this.phaseLandmarks = [];
    this.lastPhase = null;

    // View State
    this.activeChannel = 'PROFILE'; // 'PROFILE' | 'KINEMATICS' | 'ENVIRONMENT' | 'RF_LINK'
    this.timeWindowSeconds = 60;    // 30 | 60 | 120 | 0 (0 = complete flight)
    this.isPaused = false;
    this.inspectPoint = null;       // { index, pt, screenX }

    // Mission reference lines
    this.missionLimits = {
      apogeeTarget_m: 850,
      chuteDeployAlt_m: 500
    };

    this.renderSkeleton();
    this.initElements();
    this.bindEvents();

    window.addEventListener('resize', () => this.resizeCanvases());
  }

  renderSkeleton() {
    this.container.innerHTML = `
      <div class="charts-wrapper">
        <!-- Top Tactical Control & Channel Strip -->
        <div class="charts-top-bar">
          <!-- Channel Selectors -->
          <div class="chart-channel-tabs">
            <button class="chart-channel-btn active" data-channel="PROFILE" id="tab-chart-profile">
              <span class="tab-icon">📊</span>
              <span>Perfil de Vuelo</span>
            </button>
            <button class="chart-channel-btn" data-channel="KINEMATICS" id="tab-chart-kinematics">
              <span class="tab-icon">⚡</span>
              <span>Cinemática & G</span>
            </button>
            <button class="chart-channel-btn" data-channel="ENVIRONMENT" id="tab-chart-env">
              <span class="tab-icon">🌡</span>
              <span>Termodinámica</span>
            </button>
            <button class="chart-channel-btn" data-channel="RF_LINK" id="tab-chart-rf">
              <span class="tab-icon">📡</span>
              <span>Enlace LoRa</span>
            </button>
          </div>

          <!-- Time Window and Freeze Controls -->
          <div class="chart-tools-strip">
            <span style="font-size:9px; color:var(--text-muted); font-family:var(--font-display);">ESCALA:</span>
            <button class="chart-ctrl-btn" data-window="30">30s</button>
            <button class="chart-ctrl-btn active" data-window="60">60s</button>
            <button class="chart-ctrl-btn" data-window="120">120s</button>
            <button class="chart-ctrl-btn" data-window="0">TODO</button>
            <button class="chart-ctrl-btn pause-btn" id="btn-chart-pause" title="Pausar visualización para inspección táctica">⏸ PAUSAR</button>
          </div>

          <!-- Instant Metric Badges -->
          <div class="chart-metrics-strip">
            <div class="chart-metric-pill">
              <span>ALT:</span>
              <span class="metric-val" id="chart-pill-alt">0.0m</span>
            </div>
            <div class="chart-metric-pill">
              <span>V.VERT:</span>
              <span class="metric-val" id="chart-pill-vz">+0.0m/s</span>
            </div>
            <div class="chart-metric-pill">
              <span>APOGEO:</span>
              <span class="metric-val gold" id="chart-pill-maxalt">0.0m</span>
            </div>
            <div class="chart-metric-pill" id="chart-pill-eta-box">
              <span>ETA:</span>
              <span class="metric-val warning" id="chart-pill-eta">--</span>
            </div>
          </div>
        </div>

        <!-- Dual Oscilloscope Viewport -->
        <div class="charts-grid" id="charts-canvas-grid">
          <!-- Primary Canvas (Altitude / G-Force / Pressure / RSSI) -->
          <div class="chart-box" id="box-primary">
            <div class="chart-header-bar">
              <span class="chart-header-title" id="title-primary">
                <span>PERFIL DE ALTITUD (FUSIÓN KALMAN VS BARÓMETRO)</span>
              </span>
              <span class="chart-header-value" id="readout-primary">0.0 m</span>
            </div>
            <canvas class="chart-canvas" id="canvas-chart-primary"></canvas>
          </div>

          <!-- Secondary Canvas (Vertical Speed / Gyro / Temp / SNR) -->
          <div class="chart-box" id="box-secondary">
            <div class="chart-header-bar">
              <span class="chart-header-title" id="title-secondary">
                <span>VARIÓMETRO / TASA DE ASCENSO Y DESCENSO (m/s)</span>
              </span>
              <span class="chart-header-value" id="readout-secondary">+0.0 m/s</span>
            </div>
            <canvas class="chart-canvas" id="canvas-chart-secondary"></canvas>
          </div>

          <!-- Interactive Diegetic Inspection Tooltip -->
          <div class="chart-inspect-tooltip" id="chart-tooltip">
            <!-- Populated on mousemove -->
          </div>
        </div>
      </div>
    `;
  }

  initElements() {
    this.canvases.primary = document.getElementById('canvas-chart-primary');
    this.canvases.secondary = document.getElementById('canvas-chart-secondary');

    if (this.canvases.primary) this.contexts.primary = this.canvases.primary.getContext('2d');
    if (this.canvases.secondary) this.contexts.secondary = this.canvases.secondary.getContext('2d');

    this.elements = {
      titlePrimary: document.getElementById('title-primary'),
      readoutPrimary: document.getElementById('readout-primary'),
      titleSecondary: document.getElementById('title-secondary'),
      readoutSecondary: document.getElementById('readout-secondary'),
      pillAlt: document.getElementById('chart-pill-alt'),
      pillVz: document.getElementById('chart-pill-vz'),
      pillMaxAlt: document.getElementById('chart-pill-maxalt'),
      pillEta: document.getElementById('chart-pill-eta'),
      tooltip: document.getElementById('chart-tooltip'),
      btnPause: document.getElementById('btn-chart-pause'),
      grid: document.getElementById('charts-canvas-grid')
    };

    setTimeout(() => this.resizeCanvases(), 40);
  }

  bindEvents() {
    // Channel Tabs
    const tabBtns = this.container.querySelectorAll('.chart-channel-btn');
    tabBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        tabBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.activeChannel = btn.getAttribute('data-channel');
        this.updateTitles();
        this.redrawAll();
      });
    });

    // Time-Window Buttons
    const winBtns = this.container.querySelectorAll('.chart-ctrl-btn[data-window]');
    winBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        winBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.timeWindowSeconds = Number(btn.getAttribute('data-window'));
        this.redrawAll();
      });
    });

    // Pause / Freeze Button
    if (this.elements.btnPause) {
      this.elements.btnPause.addEventListener('click', () => {
        this.isPaused = !this.isPaused;
        this.elements.btnPause.classList.toggle('paused', this.isPaused);
        this.elements.btnPause.textContent = this.isPaused ? '▶ REANUDAR' : '⏸ PAUSAR';
      });
    }

    // Crosshair & Tooltip Interaction on both canvases
    const handleMouseMove = (e) => {
      const rect = this.canvases.primary?.getBoundingClientRect();
      if (!rect || this.history.length < 2) return;

      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      const visibleData = this.getVisiblePoints();

      if (visibleData.length < 2) return;

      const dpr = window.devicePixelRatio || 1;
      const w = this.canvases.primary.width / dpr;
      const frac = Math.max(0, Math.min(1, mouseX / w));
      const targetIndex = Math.round(frac * (visibleData.length - 1));
      const pt = visibleData[targetIndex];

      if (!pt) return;

      this.inspectPoint = {
        point: pt,
        screenX: mouseX * dpr,
        mouseY: mouseY * dpr,
        rawX: e.clientX,
        rawY: e.clientY,
        gridRect: this.elements.grid ? this.elements.grid.getBoundingClientRect() : rect
      };

      this.updateTooltip();
      this.redrawAll();
    };

    const handleMouseLeave = () => {
      this.inspectPoint = null;
      if (this.elements.tooltip) this.elements.tooltip.style.display = 'none';
      this.redrawAll();
    };

    ['primary', 'secondary'].forEach(key => {
      const c = this.canvases[key];
      if (c) {
        c.addEventListener('mousemove', handleMouseMove);
        c.addEventListener('mouseleave', handleMouseLeave);
      }
    });
  }

  resizeCanvases() {
    const dpr = window.devicePixelRatio || 1;
    for (const key in this.canvases) {
      const canvas = this.canvases[key];
      if (!canvas) continue;
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.max(100, Math.floor(rect.width * dpr));
      canvas.height = Math.max(60, Math.floor(rect.height * dpr));
    }
    this.redrawAll();
  }

  setMissionLimits(apogee_m, chute_m) {
    if (apogee_m) this.missionLimits.apogeeTarget_m = Number(apogee_m);
    if (chute_m) this.missionLimits.chuteDeployAlt_m = Number(chute_m);
    this.redrawAll();
  }

  reset() {
    this.history = [];
    this.phaseLandmarks = [];
    this.lastPhase = null;
    this.inspectPoint = null;
    this.redrawAll();
  }

  addPoint(packet) {
    if (!packet || !packet.sensors) return;

    const bmp = packet.sensors.bmp280 || {};
    const telem = packet.sensors.telemetry || {};
    const imu = packet.sensors.imu || {};
    const kalman = packet.sensors.kalman || {};

    const altBaro = bmp.altitude_m ?? 0;
    const altKalman = kalman.filteredAltitude_m ?? altBaro;
    const vz = kalman.filteredVelocity_mps ?? 0;
    const press = bmp.pressure_hpa ?? 1013.25;
    const temp = bmp.temp_c ?? 15.0;
    const rssi = telem.rssi_lora ?? -80;
    const snr = telem.snr ?? 10.0;
    const phase = telem.flight_phase || packet.status || 'NOMINAL';

    // IMU G-Force
    let totalG = 1.0;
    let accel = { x: 0, y: 0, z: 9.8 };
    let gyro = { x: 0, y: 0, z: 0 };
    if (imu.accel_mps2) {
      accel = imu.accel_mps2;
      totalG = Math.hypot(accel.x, accel.y, accel.z) / 9.80665;
    }
    if (imu.gyro_rads) {
      gyro = {
        x: Number((imu.gyro_rads.x * (180 / Math.PI)).toFixed(1)),
        y: Number((imu.gyro_rads.y * (180 / Math.PI)).toFixed(1)),
        z: Number((imu.gyro_rads.z * (180 / Math.PI)).toFixed(1))
      };
    }

    const t = packet.timestamp || (Date.now() / 1000);

    // Track Phase Landmark Transitions
    if (phase !== this.lastPhase) {
      const landmark = this.createPhaseLandmark(phase, t, altKalman);
      if (landmark) {
        this.phaseLandmarks.push(landmark);
      }
      this.lastPhase = phase;
    }

    this.history.push({
      t,
      altBaro,
      altKalman,
      vz,
      press,
      temp,
      rssi,
      snr,
      totalG,
      accel,
      gyro,
      phase
    });

    if (this.history.length > this.maxBufferPoints) {
      this.history.shift();
    }

    // Update Top Metric Pills
    this.updateMetricPills(altKalman, vz);

    if (!this.isPaused) {
      this.redrawAll();
    }
  }

  createPhaseLandmark(phase, time, alt) {
    const p = String(phase).toUpperCase();
    if (p.includes('DRON') || p.includes('ASCENSO')) {
      return { time, label: p.includes('DRON') ? '▲ DRON' : '▲ ASCENSO', color: '#00e5ff' };
    }
    if (p.includes('HOVER') || p.includes('ESTACIONARIO')) {
      return { time, label: '⏸ HOVER', color: '#ffd166' };
    }
    if (p.includes('RELEASE') || p.includes('SUELTA') || p.includes('APOGEE') || p.includes('APOGEO')) {
      return { time, label: '★ SUELTA', color: '#ffd166' };
    }
    if (p.includes('PARACHUTE') || p.includes('PARACAÍDAS')) {
      return { time, label: '▼ PARACAÍDAS', color: '#00e676' };
    }
    if (p.includes('LANDED') || p.includes('TIERRA')) {
      return { time, label: '● IMPACTO', color: '#64748b' };
    }
    return null;
  }

  updateMetricPills(alt, vz) {
    const el = this.elements;
    if (el.pillAlt) {
      const arrow = vz > 0.5 ? '▲' : (vz < -0.5 ? '▼' : '━');
      el.pillAlt.textContent = `${alt.toFixed(1)}m ${arrow}`;
    }
    if (el.pillVz) {
      el.pillVz.textContent = `${vz >= 0 ? '+' : ''}${vz.toFixed(1)}m/s`;
      el.pillVz.className = `metric-val ${vz < -15 ? 'critical' : (vz < -5 ? 'warning' : '')}`;
    }
    if (el.pillMaxAlt) {
      let maxA = 0;
      for (const p of this.history) if (p.altKalman > maxA) maxA = p.altKalman;
      el.pillMaxAlt.textContent = `${maxA.toFixed(1)}m`;
    }
    if (el.pillEta) {
      // Calculate ETA to target apogee or landing
      const apogee = this.missionLimits.apogeeTarget_m;
      if (vz > 1.0 && alt < apogee) {
        const etaSec = Math.max(0, Math.round((apogee - alt) / vz));
        el.pillEta.textContent = `${etaSec}s (SUELTA)`;
        el.pillEta.className = 'metric-val warning';
      } else if (vz < -1.0 && alt > 0) {
        const etaLanding = Math.max(0, Math.round(alt / Math.abs(vz)));
        el.pillEta.textContent = `${etaLanding}s (TIERRA)`;
        el.pillEta.className = 'metric-val';
      } else {
        el.pillEta.textContent = 'ESTABLE';
        el.pillEta.className = 'metric-val';
      }
    }
  }

  updateTitles() {
    const titles = {
      PROFILE: {
        pTitle: 'PERFIL DE ALTITUD (FUSIÓN KALMAN VS BARÓMETRO)',
        sTitle: 'VARIÓMETRO / TASA DE ASCENSO Y DESCENSO (m/s)'
      },
      KINEMATICS: {
        pTitle: 'CARGA G TOTAL / SOBRECARGA DINÁMICA (G)',
        sTitle: 'VELOCIDADES ANGULARES GIROSCOPIO (°/s)'
      },
      ENVIRONMENT: {
        pTitle: 'PRESIÓN ATMOSFÉRICA AMBIENTE (hPa)',
        sTitle: 'GRADIENTE TÉRMICO / TEMPERATURA (°C)'
      },
      RF_LINK: {
        pTitle: 'POTENCIA DE RECEPCIÓN LoRa (RSSI dBm)',
        sTitle: 'RELACIÓN SEÑAL-RUIDO RF (SNR dB)'
      }
    };
    const t = titles[this.activeChannel] || titles.PROFILE;
    if (this.elements.titlePrimary) this.elements.titlePrimary.textContent = t.pTitle;
    if (this.elements.titleSecondary) this.elements.titleSecondary.textContent = t.sTitle;
  }

  getVisiblePoints() {
    if (this.history.length === 0) return [];
    if (this.timeWindowSeconds === 0) return this.history;

    const lastTime = this.history[this.history.length - 1].t;
    const cutoff = lastTime - this.timeWindowSeconds;
    return this.history.filter(pt => pt.t >= cutoff);
  }

  redrawAll() {
    const pts = this.getVisiblePoints();
    if (pts.length === 0) return;

    const dpr = window.devicePixelRatio || 1;
    const last = pts[pts.length - 1];

    switch (this.activeChannel) {
      case 'PROFILE':
        this.drawProfileChannel(pts, dpr, last);
        break;
      case 'KINEMATICS':
        this.drawKinematicsChannel(pts, dpr, last);
        break;
      case 'ENVIRONMENT':
        this.drawEnvironmentChannel(pts, dpr, last);
        break;
      case 'RF_LINK':
        this.drawRFChannel(pts, dpr, last);
        break;
    }

    // Draw Crosshairs if inspecting
    if (this.inspectPoint) {
      this.drawCrosshairLine(this.contexts.primary, this.canvases.primary, this.inspectPoint.screenX);
      this.drawCrosshairLine(this.contexts.secondary, this.canvases.secondary, this.inspectPoint.screenX);
    }
  }

  // ==========================================================================
  // CHANNEL 1: PROFILE (Altitude & Vertical Speed)
  // ==========================================================================
  drawProfileChannel(pts, dpr, last) {
    // 1. Primary: Altitude
    const ctxP = this.contexts.primary;
    const canP = this.canvases.primary;
    if (ctxP && canP) {
      const w = canP.width;
      const h = canP.height;
      ctxP.clearRect(0, 0, w, h);

      let maxAlt = Math.max(this.missionLimits.apogeeTarget_m * 1.08, 100);
      pts.forEach(p => {
        if (p.altBaro > maxAlt) maxAlt = p.altBaro * 1.1;
        if (p.altKalman > maxAlt) maxAlt = p.altKalman * 1.1;
      });
      maxAlt = Math.ceil(maxAlt / 50) * 50;

      // Tactical Grid
      this.drawTacticalGrid(ctxP, w, h, 0, maxAlt, 'm', dpr);

      // Horizontal Mission References (Apogee & Parachute)
      this.drawReferenceLine(ctxP, w, h, this.missionLimits.apogeeTarget_m, 0, maxAlt, 
        `APOGEO / SUELTA: ${this.missionLimits.apogeeTarget_m}m`, '#ffd166', dpr);
      this.drawReferenceLine(ctxP, w, h, this.missionLimits.chuteDeployAlt_m, 0, maxAlt, 
        `PARACAÍDAS: ${this.missionLimits.chuteDeployAlt_m}m`, '#00e676', dpr);

      // Raw Barometric Trace (Dotted White/Gray)
      this.drawDataCurve(ctxP, pts, p => p.altBaro, 0, maxAlt, w, h, {
        stroke: 'rgba(255, 255, 255, 0.45)',
        lineWidth: 1.2 * dpr,
        dashed: [3 * dpr, 3 * dpr]
      });

      // Kalman Filtered Trace (Solid Neon Cyan + Volumetric Gradient)
      this.drawDataCurve(ctxP, pts, p => p.altKalman, 0, maxAlt, w, h, {
        stroke: '#00e5ff',
        lineWidth: 2.2 * dpr,
        glowColor: 'rgba(0, 229, 255, 0.6)',
        glowBlur: 8 * dpr,
        fillGradient: ['rgba(0, 229, 255, 0.25)', 'rgba(0, 229, 255, 0.0)'],
        drawCurrentDot: true
      });

      // Temporal Phase Event Landmark Flags
      this.drawPhaseLandmarks(ctxP, pts, w, h, dpr);

      if (this.elements.readoutPrimary) {
        this.elements.readoutPrimary.textContent = `${last.altKalman.toFixed(1)} m`;
      }
    }

    // 2. Secondary: Vertical Speed
    const ctxS = this.contexts.secondary;
    const canS = this.canvases.secondary;
    if (ctxS && canS) {
      const w = canS.width;
      const h = canS.height;
      ctxS.clearRect(0, 0, w, h);

      let maxV = 10;
      let minV = -10;
      pts.forEach(p => {
        if (p.vz > maxV) maxV = p.vz * 1.15;
        if (p.vz < minV) minV = p.vz * 1.15;
      });
      const bound = Math.max(Math.abs(maxV), Math.abs(minV), 8);
      maxV = bound;
      minV = -bound;

      this.drawTacticalGrid(ctxS, w, h, minV, maxV, 'm/s', dpr);

      // Center zero line
      const zeroY = h - ((0 - minV) / (maxV - minV)) * (h - 24 * dpr) - 12 * dpr;
      ctxS.save();
      ctxS.strokeStyle = 'rgba(255, 255, 255, 0.25)';
      ctxS.lineWidth = 1 * dpr;
      ctxS.beginPath();
      ctxS.moveTo(0, zeroY);
      ctxS.lineTo(w, zeroY);
      ctxS.stroke();
      ctxS.restore();

      // Vertical speed curve (positive cyan, negative amber)
      const isAscending = last.vz >= 0;
      this.drawDataCurve(ctxS, pts, p => p.vz, minV, maxV, w, h, {
        stroke: isAscending ? '#00e5ff' : '#ffd166',
        lineWidth: 2.0 * dpr,
        glowColor: isAscending ? 'rgba(0, 229, 255, 0.5)' : 'rgba(255, 209, 102, 0.5)',
        glowBlur: 6 * dpr,
        drawCurrentDot: true
      });

      if (this.elements.readoutSecondary) {
        this.elements.readoutSecondary.textContent = `${last.vz >= 0 ? '+' : ''}${last.vz.toFixed(1)} m/s`;
      }
    }
  }

  // ==========================================================================
  // CHANNEL 2: KINEMATICS (G-Force & Gyroscope Rates)
  // ==========================================================================
  drawKinematicsChannel(pts, dpr, last) {
    const ctxP = this.contexts.primary;
    const canP = this.canvases.primary;
    if (ctxP && canP) {
      const w = canP.width;
      const h = canP.height;
      ctxP.clearRect(0, 0, w, h);

      let maxG = 3.0;
      pts.forEach(p => { if (p.totalG > maxG) maxG = p.totalG * 1.2; });
      maxG = Math.ceil(maxG);

      this.drawTacticalGrid(ctxP, w, h, 0, maxG, 'G', dpr);
      this.drawReferenceLine(ctxP, w, h, 1.0, 0, maxG, '1.0G NOMINAL', '#00e676', dpr);
      this.drawReferenceLine(ctxP, w, h, 3.0, 0, maxG, '3.0G UMBRAL', '#ff1744', dpr);

      this.drawDataCurve(ctxP, pts, p => p.totalG, 0, maxG, w, h, {
        stroke: '#ffd166',
        lineWidth: 2.2 * dpr,
        glowColor: 'rgba(255, 209, 102, 0.5)',
        glowBlur: 6 * dpr,
        drawCurrentDot: true
      });

      if (this.elements.readoutPrimary) {
        this.elements.readoutPrimary.textContent = `${last.totalG.toFixed(2)} G`;
      }
    }

    const ctxS = this.contexts.secondary;
    const canS = this.canvases.secondary;
    if (ctxS && canS) {
      const w = canS.width;
      const h = canS.height;
      ctxS.clearRect(0, 0, w, h);

      let maxGyro = 20;
      pts.forEach(p => {
        const m = Math.max(Math.abs(p.gyro.x), Math.abs(p.gyro.y), Math.abs(p.gyro.z));
        if (m > maxGyro) maxGyro = m * 1.2;
      });
      maxGyro = Math.ceil(maxGyro / 10) * 10;

      this.drawTacticalGrid(ctxS, w, h, -maxGyro, maxGyro, '°/s', dpr);

      // 3 Axes Curves: wx (Red), wy (Green), wz (Cyan)
      this.drawDataCurve(ctxS, pts, p => p.gyro.x, -maxGyro, maxGyro, w, h, { stroke: '#ff1744', lineWidth: 1.5 * dpr });
      this.drawDataCurve(ctxS, pts, p => p.gyro.y, -maxGyro, maxGyro, w, h, { stroke: '#00e676', lineWidth: 1.5 * dpr });
      this.drawDataCurve(ctxS, pts, p => p.gyro.z, -maxGyro, maxGyro, w, h, { stroke: '#00e5ff', lineWidth: 1.5 * dpr });

      if (this.elements.readoutSecondary) {
        this.elements.readoutSecondary.textContent = `ωX: ${last.gyro.x}°/s | ωY: ${last.gyro.y}°/s | ωZ: ${last.gyro.z}°/s`;
      }
    }
  }

  // ==========================================================================
  // CHANNEL 3: ENVIRONMENT (Pressure & Temperature)
  // ==========================================================================
  drawEnvironmentChannel(pts, dpr, last) {
    const ctxP = this.contexts.primary;
    const canP = this.canvases.primary;
    if (ctxP && canP) {
      const w = canP.width;
      const h = canP.height;
      ctxP.clearRect(0, 0, w, h);

      let maxP = 1030;
      let minP = 700;
      pts.forEach(p => {
        if (p.press > maxP) maxP = p.press + 10;
        if (p.press < minP) minP = Math.max(0, p.press - 10);
      });

      this.drawTacticalGrid(ctxP, w, h, minP, maxP, 'hPa', dpr);

      this.drawDataCurve(ctxP, pts, p => p.press, minP, maxP, w, h, {
        stroke: '#ffd166',
        lineWidth: 2.2 * dpr,
        glowColor: 'rgba(255, 209, 102, 0.5)',
        glowBlur: 6 * dpr,
        fillGradient: ['rgba(255, 209, 102, 0.2)', 'rgba(255, 209, 102, 0.0)'],
        drawCurrentDot: true
      });

      if (this.elements.readoutPrimary) {
        this.elements.readoutPrimary.textContent = `${last.press.toFixed(1)} hPa`;
      }
    }

    const ctxS = this.contexts.secondary;
    const canS = this.canvases.secondary;
    if (ctxS && canS) {
      const w = canS.width;
      const h = canS.height;
      ctxS.clearRect(0, 0, w, h);

      let maxT = 30;
      let minT = 0;
      pts.forEach(p => {
        if (p.temp > maxT) maxT = p.temp + 5;
        if (p.temp < minT) minT = p.temp - 5;
      });

      this.drawTacticalGrid(ctxS, w, h, minT, maxT, '°C', dpr);

      this.drawDataCurve(ctxS, pts, p => p.temp, minT, maxT, w, h, {
        stroke: '#00e5ff',
        lineWidth: 2.0 * dpr,
        glowColor: 'rgba(0, 229, 255, 0.5)',
        glowBlur: 6 * dpr,
        drawCurrentDot: true
      });

      if (this.elements.readoutSecondary) {
        this.elements.readoutSecondary.textContent = `${last.temp.toFixed(1)} °C`;
      }
    }
  }

  // ==========================================================================
  // CHANNEL 4: RF LINK (RSSI & SNR)
  // ==========================================================================
  drawRFChannel(pts, dpr, last) {
    const ctxP = this.contexts.primary;
    const canP = this.canvases.primary;
    if (ctxP && canP) {
      const w = canP.width;
      const h = canP.height;
      ctxP.clearRect(0, 0, w, h);

      const minRSSI = -125;
      const maxRSSI = -30;

      this.drawTacticalGrid(ctxP, w, h, minRSSI, maxRSSI, 'dBm', dpr);
      this.drawReferenceLine(ctxP, w, h, -110, minRSSI, maxRSSI, 'LÍMITE SENSIBILIDAD (-110 dBm)', '#ff1744', dpr);

      this.drawDataCurve(ctxP, pts, p => p.rssi, minRSSI, maxRSSI, w, h, {
        stroke: last.rssi < -110 ? '#ff1744' : '#00e676',
        lineWidth: 2.2 * dpr,
        glowColor: 'rgba(0, 230, 118, 0.5)',
        glowBlur: 6 * dpr,
        drawCurrentDot: true
      });

      if (this.elements.readoutPrimary) {
        this.elements.readoutPrimary.textContent = `${last.rssi} dBm`;
      }
    }

    const ctxS = this.contexts.secondary;
    const canS = this.canvases.secondary;
    if (ctxS && canS) {
      const w = canS.width;
      const h = canS.height;
      ctxS.clearRect(0, 0, w, h);

      const minSNR = -12;
      const maxSNR = 15;

      this.drawTacticalGrid(ctxS, w, h, minSNR, maxSNR, 'dB', dpr);
      this.drawReferenceLine(ctxS, w, h, 0, minSNR, maxSNR, '0 dB NOISE FLOOR', 'rgba(255,255,255,0.3)', dpr);

      this.drawDataCurve(ctxS, pts, p => p.snr, minSNR, maxSNR, w, h, {
        stroke: '#00e5ff',
        lineWidth: 2.0 * dpr,
        drawCurrentDot: true
      });

      if (this.elements.readoutSecondary) {
        this.elements.readoutSecondary.textContent = `${last.snr >= 0 ? '+' : ''}${last.snr.toFixed(1)} dB`;
      }
    }
  }

  // ==========================================================================
  // SHARED RENDERING PRIMITIVES
  // ==========================================================================
  drawTacticalGrid(ctx, w, h, minVal, maxVal, unit, dpr) {
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 1;
    ctx.fillStyle = '#64748b';
    ctx.font = `bold ${8.5 * dpr}px monospace`;

    const marginY = 12 * dpr;
    const innerH = h - marginY * 2;

    // 4 Horizontal level lines
    for (let i = 0; i <= 4; i++) {
      const y = marginY + innerH * (i / 4);
      const val = maxVal - (i / 4) * (maxVal - minVal);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();

      ctx.fillText(`${val.toFixed(0)} ${unit}`, 8 * dpr, y - 3 * dpr);
    }

    // 5 Vertical time division lines
    for (let j = 1; j < 5; j++) {
      const x = w * (j / 5);
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    ctx.restore();
  }

  drawReferenceLine(ctx, w, h, targetVal, minVal, maxVal, label, color, dpr) {
    if (targetVal < minVal || targetVal > maxVal) return;

    const marginY = 12 * dpr;
    const innerH = h - marginY * 2;
    const y = h - ((targetVal - minVal) / (maxVal - minVal)) * innerH - marginY;

    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1 * dpr;
    ctx.setLineDash([4 * dpr, 4 * dpr]);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
    ctx.setLineDash([]);

    // Reference Badge Label
    ctx.fillStyle = color;
    ctx.font = `bold ${8 * dpr}px monospace`;
    ctx.textAlign = 'right';
    ctx.fillText(`╌ ${label}`, w - 10 * dpr, y - 3 * dpr);
    ctx.restore();
  }

  drawDataCurve(ctx, pts, valFn, minVal, maxVal, w, h, opts = {}) {
    if (pts.length < 2) return;

    const dpr = window.devicePixelRatio || 1;
    const marginY = 12 * dpr;
    const innerH = h - marginY * 2;
    const n = pts.length;
    const stepX = w / Math.max(1, n - 1);

    ctx.save();
    ctx.beginPath();
    ctx.lineWidth = opts.lineWidth || (2 * dpr);
    ctx.strokeStyle = opts.stroke || '#00e5ff';

    if (opts.dashed) ctx.setLineDash(opts.dashed);

    if (opts.glowColor) {
      ctx.shadowColor = opts.glowColor;
      ctx.shadowBlur = opts.glowBlur || (6 * dpr);
    }

    pts.forEach((pt, i) => {
      const v = Math.max(minVal, Math.min(maxVal, valFn(pt)));
      const x = i * stepX;
      const y = h - ((v - minVal) / (maxVal - minVal)) * innerH - marginY;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Fill gradient under curve
    if (opts.fillGradient) {
      ctx.shadowBlur = 0;
      ctx.lineTo(w, h);
      ctx.lineTo(0, h);
      ctx.closePath();
      const grad = ctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, opts.fillGradient[0]);
      grad.addColorStop(1, opts.fillGradient[1]);
      ctx.fillStyle = grad;
      ctx.fill();
    }

    // Dot at current point
    if (opts.drawCurrentDot) {
      const lastPt = pts[n - 1];
      const lastV = Math.max(minVal, Math.min(maxVal, valFn(lastPt)));
      const lastX = (n - 1) * stepX;
      const lastY = h - ((lastV - minVal) / (maxVal - minVal)) * innerH - marginY;

      ctx.beginPath();
      ctx.arc(lastX, lastY, 4.5 * dpr, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = opts.stroke;
      ctx.shadowBlur = 10 * dpr;
      ctx.fill();
    }
    ctx.restore();
  }

  drawPhaseLandmarks(ctx, pts, w, h, dpr) {
    if (pts.length < 2 || this.phaseLandmarks.length === 0) return;

    const tMin = pts[0].t;
    const tMax = pts[pts.length - 1].t;
    const tRange = Math.max(1, tMax - tMin);

    ctx.save();
    this.phaseLandmarks.forEach(lm => {
      if (lm.time < tMin || lm.time > tMax) return;

      const frac = (lm.time - tMin) / tRange;
      const x = frac * w;

      // Vertical marker line
      ctx.strokeStyle = lm.color;
      ctx.lineWidth = 1.2 * dpr;
      ctx.setLineDash([2 * dpr, 2 * dpr]);
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
      ctx.setLineDash([]);

      // Tag Label at top
      ctx.fillStyle = lm.color;
      ctx.font = `bold ${8 * dpr}px monospace`;
      ctx.textAlign = 'center';
      ctx.fillText(lm.label, x, 14 * dpr);
    });
    ctx.restore();
  }

  drawCrosshairLine(ctx, canvas, screenX) {
    if (!ctx || !canvas) return;
    const h = canvas.height;
    ctx.save();
    ctx.strokeStyle = '#00e5ff';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(screenX, 0);
    ctx.lineTo(screenX, h);
    ctx.stroke();
    ctx.restore();
  }

  updateTooltip() {
    const el = this.elements;
    if (!el.tooltip || !this.inspectPoint) return;

    const pt = this.inspectPoint.point;
    const gridRect = this.inspectPoint.gridRect;
    const localX = this.inspectPoint.rawX - gridRect.left;
    const localY = this.inspectPoint.rawY - gridRect.top;

    el.tooltip.style.display = 'block';
    el.tooltip.style.left = `${localX}px`;
    el.tooltip.style.top = `${localY}px`;

    const nowSec = pt.t ? Math.round(pt.t % 3600) : 0;
    const mins = String(Math.floor(nowSec / 60)).padStart(2, '0');
    const secs = String(nowSec % 60).padStart(2, '0');

    let rowsHTML = '';
    if (this.activeChannel === 'PROFILE') {
      rowsHTML = `
        <div class="tt-row"><span class="tt-label">Alt. Kalman:</span><span class="tt-val" style="color:var(--c-cyan);">${pt.altKalman.toFixed(1)} m</span></div>
        <div class="tt-row"><span class="tt-label">Alt. Baro:</span><span class="tt-val">${pt.altBaro.toFixed(1)} m</span></div>
        <div class="tt-row"><span class="tt-label">V. Vertical:</span><span class="tt-val" style="color:${pt.vz >= 0 ? 'var(--c-cyan)' : 'var(--c-warning)'};">${pt.vz >= 0 ? '+' : ''}${pt.vz.toFixed(1)} m/s</span></div>
        <div class="tt-row"><span class="tt-label">Fase:</span><span class="tt-val" style="color:var(--c-gold);">${pt.phase}</span></div>
      `;
    } else if (this.activeChannel === 'KINEMATICS') {
      rowsHTML = `
        <div class="tt-row"><span class="tt-label">Carga G:</span><span class="tt-val" style="color:var(--c-gold);">${pt.totalG.toFixed(2)} G</span></div>
        <div class="tt-row"><span class="tt-label">Giroscopio ωZ:</span><span class="tt-val" style="color:var(--c-cyan);">${pt.gyro.z}°/s</span></div>
      `;
    } else if (this.activeChannel === 'ENVIRONMENT') {
      rowsHTML = `
        <div class="tt-row"><span class="tt-label">Presión:</span><span class="tt-val" style="color:var(--c-gold);">${pt.press.toFixed(1)} hPa</span></div>
        <div class="tt-row"><span class="tt-label">Temperatura:</span><span class="tt-val" style="color:var(--c-cyan);">${pt.temp.toFixed(1)} °C</span></div>
      `;
    } else if (this.activeChannel === 'RF_LINK') {
      rowsHTML = `
        <div class="tt-row"><span class="tt-label">RSSI LoRa:</span><span class="tt-val" style="color:${pt.rssi < -110 ? 'var(--c-critical)' : 'var(--c-nominal)'};">${pt.rssi} dBm</span></div>
        <div class="tt-row"><span class="tt-label">SNR:</span><span class="tt-val" style="color:var(--c-cyan);">${pt.snr.toFixed(1)} dB</span></div>
      `;
    }

    el.tooltip.innerHTML = `
      <div class="tt-time">⏱ T+${mins}:${secs} // TELEMETRÍA INSPECCIÓN</div>
      ${rowsHTML}
    `;
  }
}

window.ChartsEngine = ChartsEngine;
