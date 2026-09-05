/**
 * ============================================================================
 * CAN-SAT ANALOG INSTRUMENT CLUSTER
 * Aviation-grade cockpit instruments:
 * - Altimeter: Classic circular 3-needle aviation dial with 10,000m scale,
 *   thousands odometer sub-window and dynamic flight-level indicators.
 * - Variometer: 180° Half-dial (-20 m/s to +20 m/s with center-zero).
 * - Barometer: 180° Half-dial (700 to 1050 hPa with MSL sea-level indicator).
 * - Temperature: 180° Half-dial (-20°C to +50°C with freeze & thermal limits).
 * - LoRa RF Link: Linear tactical bars for signal strength & SNR.
 * ============================================================================
 */

class AnalogGaugesComponent {
  constructor(containerEl) {
    this.container = containerEl;
    this.elements = {};
    this.renderSkeleton();
  }

  renderSkeleton() {
    // 1. Generate aviation circular altimeter tick marks & dial numbers (0 through 9)
    const dialTicks = Array.from({ length: 50 }).map((_, i) => {
      const angle = i * 7.2;
      const isMajor = i % 5 === 0;
      const r1 = isMajor ? 46 : 50;
      const r2 = 54;
      const rad = (angle - 90) * Math.PI / 180;
      const x1 = 60 + r1 * Math.cos(rad);
      const y1 = 60 + r1 * Math.sin(rad);
      const x2 = 60 + r2 * Math.cos(rad);
      const y2 = 60 + r2 * Math.sin(rad);
      return `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${isMajor ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.25)'}" stroke-width="${isMajor ? 1.5 : 0.8}" />`;
    }).join('');

    const dialNumbers = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => {
      const rad = (num * 36 - 90) * Math.PI / 180;
      const tx = 60 + 38 * Math.cos(rad);
      const ty = 60 + 38 * Math.sin(rad) + 3;
      return `<text x="${tx.toFixed(1)}" y="${ty.toFixed(1)}" font-family="var(--font-mono)" font-size="8.5" font-weight="700" fill="rgba(255,255,255,0.85)" text-anchor="middle">${num}</text>`;
    }).join('');

    // 2. Helper to generate Half-Dial (Medio Dial) radial tick marks and labels
    const generateHalfDialTicks = (ticksConfig) => {
      return ticksConfig.map(t => {
        const angleDeg = 180 - t.frac * 180;
        const rad = angleDeg * Math.PI / 180;
        const rOuter = 46;
        const rInner = t.isMajor ? 37 : 41;
        const x1 = 60 + rInner * Math.cos(rad);
        const y1 = 60 - rInner * Math.sin(rad);
        const x2 = 60 + rOuter * Math.cos(rad);
        const y2 = 60 - rOuter * Math.sin(rad);

        let labelEl = '';
        if (t.label) {
          const rText = 29;
          const lx = 60 + rText * Math.cos(rad);
          const ly = 60 - rText * Math.sin(rad) + 2.5;
          labelEl = `<text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" font-family="var(--font-mono)" font-size="6.8" font-weight="700" fill="${t.color || 'rgba(255,255,255,0.7)'}" text-anchor="middle">${t.label}</text>`;
        }
        return `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${t.color || (t.isMajor ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.22)')}" stroke-width="${t.isMajor ? 1.4 : 0.8}" />${labelEl}`;
      }).join('');
    };

    // Half-dial tick configurations
    const vspeedTicks = generateHalfDialTicks([
      { frac: 0.0, isMajor: true, label: '-50' },
      { frac: 0.125, isMajor: false },
      { frac: 0.25, isMajor: true, label: '-25' },
      { frac: 0.375, isMajor: false },
      { frac: 0.5, isMajor: true, label: '0', color: 'var(--c-cyan)' },
      { frac: 0.625, isMajor: false },
      { frac: 0.75, isMajor: true, label: '+25' },
      { frac: 0.875, isMajor: false },
      { frac: 1.0, isMajor: true, label: '+50' }
    ]);

    const baroTicks = generateHalfDialTicks([
      { frac: 0.0, isMajor: true, label: '700' },
      { frac: 0.143, isMajor: false },
      { frac: 0.286, isMajor: true },
      { frac: 0.429, isMajor: false },
      { frac: 0.571, isMajor: true, label: '900' },
      { frac: 0.714, isMajor: false },
      { frac: 0.857, isMajor: true },
      { frac: 0.895, isMajor: true, label: 'MSL', color: 'var(--c-gold)' },
      { frac: 1.0, isMajor: true, label: '1050' }
    ]);

    const tempTicks = generateHalfDialTicks([
      { frac: 0.0, isMajor: true, label: '-20' },
      { frac: 0.143, isMajor: false },
      { frac: 0.286, isMajor: true, label: '0°', color: 'var(--c-cyan)' },
      { frac: 0.429, isMajor: false },
      { frac: 0.571, isMajor: true, label: '20' },
      { frac: 0.714, isMajor: false },
      { frac: 0.857, isMajor: true },
      { frac: 1.0, isMajor: true, label: '50' }
    ]);

    this.container.innerHTML = `
      <div class="instruments-grid">
        <!-- Flight Status & Vector Dynamics Banner -->
        <div class="flight-state-banner">
          <div class="flight-state-primary">
            <div class="flight-state-label-wrap">
              <span class="flight-beacon-indicator" id="flight-beacon-indicator"></span>
              <span class="flight-banner-label">ESTADO DE VUELO:</span>
            </div>
            <span id="flight-phase-val" class="flight-phase-tag">PRE-LANZAMIENTO</span>
          </div>
          <div class="flight-state-telemetry">
            <div class="flight-telemetry-cell">
              <span class="flight-sub-label">CARGA G:</span>
              <span id="gforce-val" class="flight-stat-value font-mono" style="color:var(--c-nominal);">1.00 G</span>
            </div>
            <div class="flight-telemetry-separator"></div>
            <div class="flight-telemetry-cell">
              <span class="flight-sub-label">V. VERTICAL:</span>
              <span id="vspeed-val" class="flight-stat-value font-mono" style="color:var(--c-cyan);">+0.0 m/s</span>
            </div>
          </div>
        </div>

        <!-- 1. Altimeter Dial (Classic Aviation Circular Dial with 3 Needles + 10,000m Capacity) -->
        <div class="gauge-container">
          <div class="gauge-title-badge">
            <span>ALTÍMETRO BAROMÉTRICO</span>
            <span class="gauge-unit">0-10.000m</span>
          </div>
          <div class="analog-dial" id="altimeter-dial">
            <!-- Background Dial Face Ring -->
            <svg class="dial-face-svg" viewBox="0 0 120 120" style="position:absolute; width:100%; height:100%; pointer-events:none;">
              <circle cx="60" cy="60" r="56" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="1.5" />
              <circle cx="60" cy="60" r="48" fill="none" stroke="rgba(255,255,255,0.05)" stroke-width="0.75" />
            </svg>

            <!-- Needles Layer (Sweeps freely across dial face) -->
            <div class="dial-needle tenk" id="altimeter-needle-tenk" title="Aguja de 10.000 metros"></div>
            <div class="dial-needle secondary" id="altimeter-needle-slow" title="Aguja de 1.000 metros"></div>
            <div class="dial-needle" id="altimeter-needle-fast" title="Aguja de 100 metros"></div>

            <!-- Foreground Dial Face Ticks & Numbers (Over Needles, pointer-events: none) -->
            <svg class="dial-face-svg dial-overlay-svg" viewBox="0 0 120 120" style="position:absolute; width:100%; height:100%; pointer-events:none;">
              ${dialTicks}
              ${dialNumbers}
            </svg>

            <!-- Center pin -->
            <div class="dial-center-pin"></div>

            <!-- Thousands Odometer Counter Sub-Window (Kollsman Style) -->
            <div class="altimeter-k-window" id="altimeter-k-box">
              <span style="font-size:7px; opacity:0.7;">FL</span>
              <span id="alt-k-val" style="color:#ffd166; font-weight:800;">0</span>
              <span style="font-size:7px; opacity:0.7;">km</span>
            </div>
          </div>
          <div class="gauge-footer-bar">
            <div class="gauge-footer-val">
              <span class="gauge-footer-label">ACTUAL:</span>
              <span id="alt-num-val" class="font-mono" style="font-weight:700; color:var(--c-cyan);">0.0</span> <span style="font-size:8px; color:var(--text-muted);">m</span>
            </div>
            <div class="gauge-footer-val">
              <span class="gauge-footer-label">APOGEO:</span>
              <span id="alt-max-val" class="font-mono" style="font-weight:700; color:var(--c-gold);">0.0 m</span>
            </div>
          </div>
        </div>

        <!-- 2. Variometer Gauge (Half-Dial: -50 m/s to +50 m/s with Center Zero) -->
        <div class="gauge-container">
          <div class="gauge-title-badge">
            <span>VARIÓMETRO / TASA V.</span>
            <span class="gauge-unit">±50 m/s</span>
          </div>
          <div class="half-dial-wrap">
            <!-- Background Track & Value Arc (Under Needle) -->
            <svg class="half-dial-svg half-dial-bg" viewBox="0 0 120 72">
              <path class="half-dial-track" d="M 14,60 A 46,46 0 0,1 106,60" />
              <path class="half-dial-val" id="vspeed-arc" d="M 14,60 A 46,46 0 0,1 106,60" stroke-dasharray="144.5" stroke-dashoffset="72.2" />
            </svg>
            <!-- Rotating Needle -->
            <div class="half-dial-needle" id="vspeed-needle" style="transform: rotate(0deg);"></div>
            <!-- Foreground Ticks & Scale Numbers (Over Needle) -->
            <svg class="half-dial-overlay-svg" viewBox="0 0 120 72">
              ${vspeedTicks}
            </svg>
            <!-- Center Hub -->
            <div class="half-dial-hub"></div>
          </div>
          <div class="half-dial-limits">
            <span>-50</span>
            <span style="color:var(--c-cyan);">0</span>
            <span>+50</span>
          </div>
          <div class="gauge-footer-bar">
            <div class="gauge-footer-val">
              <span class="gauge-footer-label">TASA:</span>
              <span id="vspeed-num-val" class="font-mono" style="font-weight:700; color:var(--c-cyan);">+0.0</span> <span style="font-size:8px; color:var(--text-muted);">m/s</span>
            </div>
            <div class="gauge-footer-val">
              <span class="gauge-footer-label">EST:</span>
              <span id="vspeed-sub-tag" class="font-mono" style="color:var(--text-secondary); font-weight:700;">ESTABLE</span>
            </div>
          </div>
        </div>

        <!-- 3. Barometer Gauge (Half-Dial: 700 to 1050 hPa) -->
        <div class="gauge-container">
          <div class="gauge-title-badge">
            <span>PRESIÓN ATMOSFÉRICA</span>
            <span class="gauge-unit">hPa</span>
          </div>
          <div class="half-dial-wrap">
            <!-- Background Track & Value Arc (Under Needle) -->
            <svg class="half-dial-svg half-dial-bg" viewBox="0 0 120 72">
              <path class="half-dial-track" d="M 14,60 A 46,46 0 0,1 106,60" />
              <path class="half-dial-val" id="pressure-arc" d="M 14,60 A 46,46 0 0,1 106,60" stroke-dasharray="144.5" stroke-dashoffset="15" />
            </svg>
            <!-- Rotating Needle -->
            <div class="half-dial-needle" id="pressure-needle" style="transform: rotate(71deg);"></div>
            <!-- Foreground Ticks & Scale Numbers (Over Needle) -->
            <svg class="half-dial-overlay-svg" viewBox="0 0 120 72">
              ${baroTicks}
            </svg>
            <!-- Center Hub -->
            <div class="half-dial-hub"></div>
          </div>
          <div class="half-dial-limits">
            <span>700</span>
            <span style="color:var(--text-muted); font-size:7px;">MSL: 1013</span>
            <span>1050</span>
          </div>
          <div class="gauge-footer-bar">
            <div class="gauge-footer-val">
              <span class="gauge-footer-label">PRES:</span>
              <span id="press-num-val" class="font-mono" style="font-weight:700; color:var(--c-cyan);">1013.2</span> <span style="font-size:8px; color:var(--text-muted);">hPa</span>
            </div>
            <div class="gauge-footer-val">
              <span class="gauge-footer-label">MSL:</span>
              <span style="color:var(--text-secondary); font-weight:700;">1013.2</span>
            </div>
          </div>
        </div>

        <!-- 4. Ambient Temperature Gauge (Half-Dial: -20°C to +50°C) -->
        <div class="gauge-container">
          <div class="gauge-title-badge">
            <span>TEMPERATURA AMBIENTE</span>
            <span class="gauge-unit">°C</span>
          </div>
          <div class="half-dial-wrap">
            <!-- Background Track & Value Arc (Under Needle) -->
            <svg class="half-dial-svg half-dial-bg" viewBox="0 0 120 72">
              <path class="half-dial-track" d="M 14,60 A 46,46 0 0,1 106,60" />
              <path class="half-dial-val" id="temp-arc" d="M 14,60 A 46,46 0 0,1 106,60" stroke-dasharray="144.5" stroke-dashoffset="62" />
            </svg>
            <!-- Rotating Needle -->
            <div class="half-dial-needle" id="temp-needle" style="transform: rotate(13deg);"></div>
            <!-- Foreground Ticks & Scale Numbers (Over Needle) -->
            <svg class="half-dial-overlay-svg" viewBox="0 0 120 72">
              ${tempTicks}
            </svg>
            <!-- Center Hub -->
            <div class="half-dial-hub"></div>
          </div>
          <div class="half-dial-limits">
            <span>-20°</span>
            <span style="color:rgba(0,229,255,0.7); font-size:7px;">0° HIELO</span>
            <span>+50°</span>
          </div>
          <div class="gauge-footer-bar">
            <div class="gauge-footer-val">
              <span class="gauge-footer-label">TEMP:</span>
              <span id="temp-num-val" class="font-mono" style="font-weight:700; color:var(--c-cyan);">20.0</span> <span style="font-size:8px; color:var(--text-muted);">°C</span>
            </div>
            <div class="gauge-footer-val">
              <span class="gauge-footer-label">GRAD:</span>
              <span style="color:var(--text-secondary); font-weight:700;">-6.5°</span>
            </div>
          </div>
        </div>

        <!-- 5. RF Link & Signal Telemetry (RSSI & SNR) -->
        <div class="linear-gauge-group">
          <div class="gauge-title-badge" style="margin-bottom:2px;">
            <span>ENLACE LoRa RF // TELEMETRÍA</span>
            <span id="rf-status-badge" class="badge badge-nominal" style="font-size:9px; padding:1px 5px;">NOMINAL</span>
          </div>

          <div class="linear-meter-row">
            <div class="meter-label-col">
              <span class="meter-label-title">RSSI POTENCIA</span>
              <span id="rssi-num-val" class="meter-label-val">-45 dBm</span>
            </div>
            <div class="linear-bar-track">
              <div class="linear-bar-fill" id="rssi-bar" style="width: 80%;"></div>
            </div>
          </div>

          <div class="linear-meter-row">
            <div class="meter-label-col">
              <span class="meter-label-title">SNR SEÑAL/RUIDO</span>
              <span id="snr-num-val" class="meter-label-val">+9.2 dB</span>
            </div>
            <div class="linear-bar-track">
              <div class="linear-bar-fill" id="snr-bar" style="width: 85%;"></div>
            </div>
          </div>
        </div>
      </div>
    `;

    this.cacheElements();
  }

  cacheElements() {
    this.elements = {
      flightPhase: document.getElementById('flight-phase-val'),
      flightBeacon: document.getElementById('flight-beacon-indicator'),
      vspeedTop: document.getElementById('vspeed-val'),
      gforce: document.getElementById('gforce-val'),

      // Altimeter Elements
      needleFast: document.getElementById('altimeter-needle-fast'),
      needleSlow: document.getElementById('altimeter-needle-slow'),
      needleTenK: document.getElementById('altimeter-needle-tenk'),
      altKBox: document.getElementById('altimeter-k-box'),
      altKVal: document.getElementById('alt-k-val'),
      altNum: document.getElementById('alt-num-val'),
      altMax: document.getElementById('alt-max-val'),

      // Variometer (Half-Dial)
      vspeedArc: document.getElementById('vspeed-arc'),
      vspeedNeedle: document.getElementById('vspeed-needle'),
      vspeedNum: document.getElementById('vspeed-num-val'),
      vspeedSubTag: document.getElementById('vspeed-sub-tag'),

      // Barometer (Half-Dial)
      pressureArc: document.getElementById('pressure-arc'),
      pressureNeedle: document.getElementById('pressure-needle'),
      pressNum: document.getElementById('press-num-val'),

      // Temperature (Half-Dial)
      tempArc: document.getElementById('temp-arc'),
      tempNeedle: document.getElementById('temp-needle'),
      tempNum: document.getElementById('temp-num-val'),

      // RF Link
      rssiNum: document.getElementById('rssi-num-val'),
      rssiBar: document.getElementById('rssi-bar'),
      snrNum: document.getElementById('snr-num-val'),
      snrBar: document.getElementById('snr-bar'),
      rfStatus: document.getElementById('rf-status-badge')
    };
  }

  update(packet, metrics) {
    if (!packet || !packet.sensors) return;

    const bmp = packet.sensors.bmp280 || {};
    const telem = packet.sensors.telemetry || {};
    const kalman = packet.sensors.kalman || {};

    const alt = bmp.altitude_m ?? 0;
    const press = bmp.pressure_hpa ?? 1013.25;
    const temp = bmp.temp_c ?? 20.0;
    const rssi = telem.rssi_lora ?? -80;
    const snr = telem.snr ?? 5.0;

    // 1. UPDATE ALTIMETER (Classic Circular 3-Pointer + Odometer, supports up to 10,000m)
    if (this.elements.altNum) {
      this.elements.altNum.textContent = alt.toFixed(1);
    }
    if (this.elements.altMax) {
      const maxA = metrics?.maxAltitude_m !== undefined ? metrics.maxAltitude_m : alt;
      this.elements.altMax.textContent = `${maxA.toFixed(1)} m`;
    }

    // Needle 1: Fast (1 full turn = 100m)
    const degFast = (alt % 100) * 3.6;
    // Needle 2: Medium (1 full turn = 1,000m)
    const degSlow = (alt % 1000) * 0.36;
    // Needle 3: Ten-K Pointer (1 full turn = 10,000m) -> At 1,200m points to 1.2, at 2,500m points to 2.5
    const degTenK = ((alt % 10000) / 10000) * 360;

    if (this.elements.needleFast) this.elements.needleFast.style.transform = `rotate(${degFast.toFixed(1)}deg)`;
    if (this.elements.needleSlow) this.elements.needleSlow.style.transform = `rotate(${degSlow.toFixed(1)}deg)`;
    if (this.elements.needleTenK) this.elements.needleTenK.style.transform = `rotate(${degTenK.toFixed(1)}deg)`;

    // Mechanical Thousands Odometer Counter Sub-Window
    const thousandsK = Math.floor(Math.max(0, alt) / 1000);
    if (this.elements.altKVal) {
      this.elements.altKVal.textContent = thousandsK;
    }
    if (this.elements.altKBox) {
      if (thousandsK >= 1) {
        this.elements.altKBox.classList.add('active-high');
      } else {
        this.elements.altKBox.classList.remove('active-high');
      }
    }

    // 2. UPDATE VARIOMETER (Half-Dial: -50 m/s to +50 m/s)
    const vz = (kalman.filteredVelocity_mps !== undefined) 
      ? kalman.filteredVelocity_mps 
      : (metrics?.descentRate_mps || 0);

    if (this.elements.vspeedTop) {
      this.elements.vspeedTop.textContent = `${vz >= 0 ? '+' : ''}${vz.toFixed(1)} m/s`;
      this.elements.vspeedTop.style.color = vz < -25 ? 'var(--c-critical)' : (vz < -8 ? 'var(--c-warning)' : 'var(--c-cyan)');
    }
    if (this.elements.vspeedNum) {
      this.elements.vspeedNum.textContent = `${vz >= 0 ? '+' : ''}${vz.toFixed(1)}`;
      this.elements.vspeedNum.style.color = vz < -25 ? 'var(--c-critical)' : (vz < -8 ? 'var(--c-warning)' : 'var(--c-cyan)');
    }
    if (this.elements.vspeedNeedle && this.elements.vspeedArc) {
      const vzClamped = Math.max(-50, Math.min(50, vz));
      const vzFrac = (vzClamped - (-50)) / (50 - (-50)); // 0.5 at 0 m/s
      const needleDeg = -90 + vzFrac * 180;
      this.elements.vspeedNeedle.style.transform = `rotate(${needleDeg.toFixed(1)}deg)`;

      const arcOffset = 144.5 * (1 - vzFrac);
      this.elements.vspeedArc.style.strokeDashoffset = arcOffset.toFixed(1);

      if (vz <= -12) {
        this.elements.vspeedArc.setAttribute('class', 'half-dial-val critical');
        this.elements.vspeedNeedle.className = 'half-dial-needle amber';
        if (this.elements.vspeedSubTag) {
          this.elements.vspeedSubTag.textContent = 'CAÍDA RÁPIDA';
          this.elements.vspeedSubTag.style.color = 'var(--c-critical)';
        }
      } else if (vz < -2) {
        this.elements.vspeedArc.setAttribute('class', 'half-dial-val warning');
        this.elements.vspeedNeedle.className = 'half-dial-needle amber';
        if (this.elements.vspeedSubTag) {
          this.elements.vspeedSubTag.textContent = 'DESCENSO';
          this.elements.vspeedSubTag.style.color = 'var(--c-warning)';
        }
      } else if (vz > 2) {
        this.elements.vspeedArc.setAttribute('class', 'half-dial-val nominal');
        this.elements.vspeedNeedle.className = 'half-dial-needle';
        if (this.elements.vspeedSubTag) {
          this.elements.vspeedSubTag.textContent = 'ASCENSO';
          this.elements.vspeedSubTag.style.color = 'var(--c-cyan)';
        }
      } else {
        this.elements.vspeedArc.setAttribute('class', 'half-dial-val nominal');
        this.elements.vspeedNeedle.className = 'half-dial-needle';
        if (this.elements.vspeedSubTag) {
          this.elements.vspeedSubTag.textContent = 'ESTABLE';
          this.elements.vspeedSubTag.style.color = 'var(--text-secondary)';
        }
      }
    }

    // 3. UPDATE BAROMETER (Half-Dial: 700 to 1050 hPa)
    if (this.elements.pressNum) {
      this.elements.pressNum.textContent = press.toFixed(1);
    }
    if (this.elements.pressureNeedle && this.elements.pressureArc) {
      const pressClamped = Math.max(700, Math.min(1050, press));
      const pressFrac = (pressClamped - 700) / (1050 - 700);
      const needleDeg = -90 + pressFrac * 180;
      this.elements.pressureNeedle.style.transform = `rotate(${needleDeg.toFixed(1)}deg)`;

      const arcOffset = 144.5 * (1 - pressFrac);
      this.elements.pressureArc.style.strokeDashoffset = arcOffset.toFixed(1);

      if (press < 780 || press > 1060 || packet.status?.includes('BARO')) {
        this.elements.pressureArc.setAttribute('class', 'half-dial-val warning');
      } else {
        this.elements.pressureArc.setAttribute('class', 'half-dial-val nominal');
      }
    }

    // 4. UPDATE TEMPERATURE (Half-Dial: -20°C to +50°C)
    if (this.elements.tempNum) {
      this.elements.tempNum.textContent = temp.toFixed(1);
    }
    if (this.elements.tempNeedle && this.elements.tempArc) {
      const tempClamped = Math.max(-20, Math.min(50, temp));
      const tempFrac = (tempClamped - (-20)) / (50 - (-20));
      const needleDeg = -90 + tempFrac * 180;
      this.elements.tempNeedle.style.transform = `rotate(${needleDeg.toFixed(1)}deg)`;

      const arcOffset = 144.5 * (1 - tempFrac);
      this.elements.tempArc.style.strokeDashoffset = arcOffset.toFixed(1);

      if (temp < 0) {
        this.elements.tempArc.setAttribute('class', 'half-dial-val warning');
      } else if (temp > 45) {
        this.elements.tempArc.setAttribute('class', 'half-dial-val critical');
      } else {
        this.elements.tempArc.setAttribute('class', 'half-dial-val nominal');
      }
    }

    // 5. UPDATE LORA RSSI (-125 dBm to -30 dBm)
    if (this.elements.rssiNum) {
      this.elements.rssiNum.textContent = `${rssi} dBm`;
    }
    if (this.elements.rssiBar) {
      const rssiPct = Math.max(0, Math.min(100, ((rssi - (-125)) / ((-30) - (-125))) * 100));
      this.elements.rssiBar.style.width = `${rssiPct}%`;

      if (rssi < -110) {
        this.elements.rssiBar.className = 'linear-bar-fill critical';
      } else if (rssi < -85) {
        this.elements.rssiBar.className = 'linear-bar-fill warning';
      } else {
        this.elements.rssiBar.className = 'linear-bar-fill';
      }
    }

    // 6. UPDATE LORA SNR (-10 dB to +15 dB)
    if (this.elements.snrNum) {
      this.elements.snrNum.textContent = `${snr >= 0 ? '+' : ''}${snr.toFixed(1)} dB`;
    }
    if (this.elements.snrBar) {
      const snrPct = Math.max(0, Math.min(100, ((snr - (-10)) / (15 - (-10))) * 100));
      this.elements.snrBar.style.width = `${snrPct}%`;

      if (snr < 0) {
        this.elements.snrBar.className = 'linear-bar-fill critical';
      } else if (snr < 4) {
        this.elements.snrBar.className = 'linear-bar-fill warning';
      } else {
        this.elements.snrBar.className = 'linear-bar-fill';
      }
    }

    // 7. UPDATE RF STATUS BADGE
    if (this.elements.rfStatus && metrics) {
      const qualityMap = {
        'EXCELLENT': { label: 'EXCELENTE', cls: 'badge badge-nominal' },
        'GOOD': { label: 'BUENO', cls: 'badge badge-nominal' },
        'DEGRADED': { label: 'DEGRADADO', cls: 'badge badge-warning' },
        'CRITICAL': { label: 'CRÍTICO', cls: 'badge badge-critical' },
        'LOST': { label: 'PERDIDO', cls: 'badge badge-critical' }
      };
      const q = qualityMap[metrics.linkQuality] || { label: metrics.linkQuality, cls: 'badge badge-nominal' };
      this.elements.rfStatus.textContent = q.label;
      this.elements.rfStatus.className = q.cls;
    }

    // 8. UPDATE G-FORCE (From 6-DOF IMU Accelerometer)
    if (this.elements.gforce) {
      if (packet.sensors?.imu?.accel_mps2) {
        const a = packet.sensors.imu.accel_mps2;
        const totalA = Math.hypot(a.x, a.y, a.z);
        const g = totalA / 9.80665;
        this.elements.gforce.textContent = `${g.toFixed(2)} G`;
        this.elements.gforce.style.color = g > 3.5 ? 'var(--c-warning)' : (g < 0.3 ? 'var(--c-cyan)' : 'var(--c-nominal)');
      } else {
        this.elements.gforce.textContent = '1.00 G';
        this.elements.gforce.style.color = 'var(--c-nominal)';
      }
    }

    // 9. UPDATE FLIGHT PHASE TAG & TACTICAL BEACON
    if (this.elements.flightPhase && metrics) {
      const phase = metrics.flightPhase || 'TRANSMITIENDO';
      this.elements.flightPhase.textContent = phase;

      if (phase.includes('ASCENSO') || phase.includes('DRON') || phase.includes('ELEVACIÓN')) {
        this.elements.flightPhase.style.color = 'var(--c-cyan)';
        this.elements.flightPhase.style.borderColor = 'rgba(0, 229, 255, 0.4)';
        this.elements.flightPhase.style.textShadow = '0 0 8px rgba(0,229,255,0.6)';
        if (this.elements.flightBeacon) {
          this.elements.flightBeacon.style.background = 'var(--c-cyan)';
          this.elements.flightBeacon.style.boxShadow = '0 0 8px var(--c-cyan)';
        }
      } else if (phase.includes('APOGEO') || phase.includes('ESTACIONARIO') || phase.includes('SUELTA') || phase.includes('DESENGANCHE')) {
        this.elements.flightPhase.style.color = 'var(--c-gold)';
        this.elements.flightPhase.style.borderColor = 'rgba(255, 215, 0, 0.4)';
        this.elements.flightPhase.style.textShadow = '0 0 8px rgba(255,215,0,0.6)';
        if (this.elements.flightBeacon) {
          this.elements.flightBeacon.style.background = 'var(--c-gold)';
          this.elements.flightBeacon.style.boxShadow = '0 0 8px var(--c-gold)';
        }
      } else if (phase.includes('CAÍDA LIBRE') || phase.includes('FALLO')) {
        this.elements.flightPhase.style.color = 'var(--c-critical)';
        this.elements.flightPhase.style.borderColor = 'rgba(255, 23, 68, 0.5)';
        this.elements.flightPhase.style.textShadow = '0 0 8px rgba(255,23,68,0.7)';
        if (this.elements.flightBeacon) {
          this.elements.flightBeacon.style.background = 'var(--c-critical)';
          this.elements.flightBeacon.style.boxShadow = '0 0 8px var(--c-critical)';
        }
      } else if (phase.includes('DESCENSO') || phase.includes('TIERRA')) {
        this.elements.flightPhase.style.color = 'var(--c-nominal)';
        this.elements.flightPhase.style.borderColor = 'rgba(0, 230, 118, 0.4)';
        this.elements.flightPhase.style.textShadow = '0 0 8px rgba(0,230,118,0.5)';
        if (this.elements.flightBeacon) {
          this.elements.flightBeacon.style.background = 'var(--c-nominal)';
          this.elements.flightBeacon.style.boxShadow = '0 0 8px var(--c-nominal)';
        }
      } else {
        this.elements.flightPhase.style.color = 'var(--text-secondary)';
        this.elements.flightPhase.style.borderColor = 'rgba(255, 255, 255, 0.15)';
        this.elements.flightPhase.style.textShadow = 'none';
        if (this.elements.flightBeacon) {
          this.elements.flightBeacon.style.background = 'var(--text-secondary)';
          this.elements.flightBeacon.style.boxShadow = 'none';
        }
      }
    }
  }
}

window.AnalogGaugesComponent = AnalogGaugesComponent;
