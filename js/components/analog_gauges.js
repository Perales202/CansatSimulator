/**
 * ============================================================================
 * CAN-SAT ANALOG INSTRUMENT CLUSTER
 * Aviation-grade dial instruments: Dual-needle Altimeter, Barometer,
 * Temperature thermometer, LoRa Link quality bars, Variometer, and G-Force.
 * ============================================================================
 */

class AnalogGaugesComponent {
  constructor(containerEl) {
    this.container = containerEl;
    this.elements = {};
    this.renderSkeleton();
  }

  renderSkeleton() {
    // Generate aviation altimeter tick marks & dial numbers (0 through 9)
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
      return `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${isMajor ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.25)'}" stroke-width="${isMajor ? 1.5 : 0.8}" />`;
    }).join('');

    const dialNumbers = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => {
      const rad = (num * 36 - 90) * Math.PI / 180;
      const tx = 60 + 38 * Math.cos(rad);
      const ty = 60 + 38 * Math.sin(rad) + 3;
      return `<text x="${tx.toFixed(1)}" y="${ty.toFixed(1)}" font-family="var(--font-mono)" font-size="8.5" font-weight="700" fill="rgba(255,255,255,0.85)" text-anchor="middle">${num}</text>`;
    }).join('');

    this.container.innerHTML = `
      <div class="instruments-grid">
        <!-- Flight Status Banner -->
        <div class="flight-state-banner">
          <div>
            <span class="gauge-unit">ESTADO DE VUELO:</span>
            <span id="flight-phase-val" class="flight-phase-tag">PRE-LANZAMIENTO</span>
          </div>
          <div style="display:flex; align-items:center; gap:12px;">
            <div class="descent-rate-indicator">
              <span class="gauge-unit">CARGA G:</span>
              <span id="gforce-val" class="font-mono" style="font-weight:700; color:var(--c-nominal);">1.00 G</span>
            </div>
            <div class="descent-rate-indicator">
              <span class="gauge-unit">V. VERTICAL:</span>
              <span id="vspeed-val" class="font-mono" style="font-weight:700; color:var(--c-cyan);">+0.0 m/s</span>
            </div>
          </div>
        </div>

        <!-- 1. Altimeter Dial (Dual-needle Aviation Altimeter) -->
        <div class="gauge-container">
          <div class="gauge-title-badge">
            <span>ALTÍMETRO BAROMÉTRICO</span>
            <span class="gauge-unit">METROS</span>
          </div>
          <div class="analog-dial" id="altimeter-dial">
            <!-- Authentic Aviation Dial Face with Graduation Ring -->
            <svg class="dial-face-svg" viewBox="0 0 120 120" style="position:absolute; width:100%; height:100%; pointer-events:none;">
              <circle cx="60" cy="60" r="56" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="1.5" />
              <circle cx="60" cy="60" r="48" fill="none" stroke="rgba(255,255,255,0.05)" stroke-width="0.75" />
              ${dialTicks}
              ${dialNumbers}
            </svg>
            <!-- Center pin -->
            <div class="dial-center-pin"></div>
            <!-- Secondary needle (1000s meters) -->
            <div class="dial-needle secondary" id="altimeter-needle-slow" title="Aguja de 1000 metros"></div>
            <!-- Primary needle (100s meters) -->
            <div class="dial-needle" id="altimeter-needle-fast" title="Aguja de 100 metros"></div>
            <!-- Numeric Readout Overlay (Kollsman sub-window style) -->
            <div class="gauge-readout altimeter-readout">
              <span class="readout-primary" id="alt-num-val">0.0</span>
              <span class="readout-sub">M.S.N.M.</span>
            </div>
          </div>
          <div style="margin-top:4px; font-size:9.5px; color:var(--text-muted);">
            APOGEO: <span id="alt-max-val" style="color:var(--c-gold); font-weight:700;">0.0 m</span>
          </div>
        </div>

        <!-- 2. Barometer Gauge (Pressure Dial in hPa) -->
        <div class="gauge-container">
          <div class="gauge-title-badge">
            <span>PRESIÓN ATMOSFÉRICA</span>
            <span class="gauge-unit">hPa</span>
          </div>
          <div class="gauge-svg-wrap">
            <svg class="gauge-svg" viewBox="0 0 100 100">
              <circle class="gauge-meter-track" cx="50" cy="50" r="40"></circle>
              <circle class="gauge-meter-val" id="pressure-circle" cx="50" cy="50" r="40" stroke-dasharray="251.2" stroke-dashoffset="50"></circle>
            </svg>
            <div class="gauge-readout">
              <span class="readout-primary" id="press-num-val">1013.2</span>
              <span class="readout-sub">BMP280</span>
            </div>
          </div>
          <div class="gauge-limits-row">
            <span>700</span>
            <span>1050</span>
          </div>
          <div style="font-size:9.5px; color:var(--text-muted);">
            NIVEL DEL MAR: <span style="color:var(--text-secondary);">1013.2 hPa</span>
          </div>
        </div>

        <!-- 3. Ambient Temperature Gauge -->
        <div class="gauge-container">
          <div class="gauge-title-badge">
            <span>TEMPERATURA AMBIENTE</span>
            <span class="gauge-unit">°C</span>
          </div>
          <div class="gauge-svg-wrap">
            <svg class="gauge-svg" viewBox="0 0 100 100">
              <circle class="gauge-meter-track" cx="50" cy="50" r="40"></circle>
              <circle class="gauge-meter-val" id="temp-circle" cx="50" cy="50" r="40" stroke-dasharray="251.2" stroke-dashoffset="100"></circle>
            </svg>
            <div class="gauge-readout">
              <span class="readout-primary" id="temp-num-val">22.4</span>
              <span class="readout-sub">CELSIUS</span>
            </div>
          </div>
          <div class="gauge-limits-row">
            <span>-20°</span>
            <span>+50°</span>
          </div>
          <div style="font-size:9.5px; color:var(--text-muted);">
            GRADIENTE: <span style="color:var(--text-secondary);">-6.5°C/km</span>
          </div>
        </div>

        <!-- 4. RF Link & Signal Telemetry (RSSI & SNR) -->
        <div class="gauge-container">
          <div class="gauge-title-badge">
            <span>ENLACE LoRa RF</span>
            <span class="gauge-unit">TELEMETRÍA</span>
          </div>
          <div style="width:100%; display:flex; flex-direction:column; gap:8px; margin-top:6px;">
            <div>
              <div style="display:flex; justify-content:space-between; font-size:10px; margin-bottom:2px;">
                <span style="color:var(--text-secondary);">RSSI (POTENCIA):</span>
                <span id="rssi-num-val" class="font-mono" style="color:var(--c-cyan); font-weight:700;">-45 dBm</span>
              </div>
              <div class="linear-bar-track">
                <div class="linear-bar-fill" id="rssi-bar" style="width: 80%;"></div>
              </div>
            </div>

            <div>
              <div style="display:flex; justify-content:space-between; font-size:10px; margin-bottom:2px;">
                <span style="color:var(--text-secondary);">SNR (RELACIÓN S/R):</span>
                <span id="snr-num-val" class="font-mono" style="color:var(--c-cyan); font-weight:700;">+9.2 dB</span>
              </div>
              <div class="linear-bar-track">
                <div class="linear-bar-fill" id="snr-bar" style="width: 85%;"></div>
              </div>
            </div>

            <div style="display:flex; justify-content:space-between; font-size:9.5px; margin-top:2px;">
              <span style="color:var(--text-muted);">ESTADO DE ENLACE:</span>
              <span id="rf-status-badge" class="badge badge-nominal" style="font-size:9px; padding:1px 5px;">NOMINAL</span>
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
      vspeed: document.getElementById('vspeed-val'),
      gforce: document.getElementById('gforce-val'),
      needleFast: document.getElementById('altimeter-needle-fast'),
      needleSlow: document.getElementById('altimeter-needle-slow'),
      altNum: document.getElementById('alt-num-val'),
      altMax: document.getElementById('alt-max-val'),
      pressureCircle: document.getElementById('pressure-circle'),
      pressNum: document.getElementById('press-num-val'),
      tempCircle: document.getElementById('temp-circle'),
      tempNum: document.getElementById('temp-num-val'),
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

    const alt = bmp.altitude_m ?? 0;
    const press = bmp.pressure_hpa ?? 1013.25;
    const temp = bmp.temp_c ?? 20.0;
    const rssi = telem.rssi_lora ?? -80;
    const snr = telem.snr ?? 5.0;

    // 1. Update Altimeter
    if (this.elements.altNum) {
      this.elements.altNum.textContent = alt.toFixed(1);
    }
    if (this.elements.altMax && metrics?.maxAltitude_m !== undefined) {
      this.elements.altMax.textContent = `${metrics.maxAltitude_m.toFixed(1)} m`;
    }

    // Needle rotation (Aviation style: 1 full rotation of fast needle = 100m, slow needle = 1000m)
    const degFast = (alt % 100) * 3.6;
    const degSlow = (alt % 1000) * 0.36;
    if (this.elements.needleFast) this.elements.needleFast.style.transform = `rotate(${degFast}deg)`;
    if (this.elements.needleSlow) this.elements.needleSlow.style.transform = `rotate(${degSlow}deg)`;

    // 2. Update Barometer (Standard atmospheric range: 700 to 1050 hPa)
    if (this.elements.pressNum) {
      this.elements.pressNum.textContent = press.toFixed(1);
    }
    if (this.elements.pressureCircle) {
      const pressClamped = Math.max(700, Math.min(1050, press));
      const pressFrac = (pressClamped - 700) / (1050 - 700); // 0 to 1
      const circumference = 251.2;
      const offset = circumference * (1 - (pressFrac * 0.75));
      this.elements.pressureCircle.style.strokeDashoffset = offset;

      // Dynamic status color coding
      if (press < 780 || press > 1060 || packet.status?.includes('BARO')) {
        this.elements.pressureCircle.setAttribute('class', 'gauge-meter-val warning');
      } else {
        this.elements.pressureCircle.setAttribute('class', 'gauge-meter-val nominal');
      }
    }

    // 3. Update Temperature (-20°C to +50°C)
    if (this.elements.tempNum) {
      this.elements.tempNum.textContent = temp.toFixed(1);
    }
    if (this.elements.tempCircle) {
      const tempClamped = Math.max(-20, Math.min(50, temp));
      const tempFrac = (tempClamped - (-20)) / (50 - (-20));
      const circumference = 251.2;
      const offset = circumference * (1 - (tempFrac * 0.75));
      this.elements.tempCircle.style.strokeDashoffset = offset;

      if (temp < 0) {
        this.elements.tempCircle.setAttribute('class', 'gauge-meter-val warning'); // Freeze alert
      } else if (temp > 45) {
        this.elements.tempCircle.setAttribute('class', 'gauge-meter-val critical'); // Overheat alert
      } else {
        this.elements.tempCircle.setAttribute('class', 'gauge-meter-val nominal');
      }
    }

    // 4. Update LoRa RSSI (-125 dBm to -30 dBm)
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

    // 5. Update LoRa SNR (-10 dB to +15 dB)
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

    // 6. Update RF status badge (Translated to Spanish)
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

    // 7. Update G-Force (From 6-DOF IMU Accelerometer)
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

    // 8. Update Vertical Speed (Variometer)
    if (this.elements.vspeed && metrics) {
      const vz = metrics.descentRate_mps || 0;
      this.elements.vspeed.textContent = `${vz >= 0 ? '+' : ''}${vz.toFixed(1)} m/s`;
      this.elements.vspeed.style.color = vz < -15 ? 'var(--c-critical)' : (vz < -5 ? 'var(--c-warning)' : 'var(--c-cyan)');
    }

    // 9. Update Flight Phase Tag
    if (this.elements.flightPhase && metrics) {
      const phase = metrics.flightPhase || 'TRANSMITIENDO';
      this.elements.flightPhase.textContent = phase;

      // Dynamic phase coloring
      if (phase.includes('ASCENSO')) {
        this.elements.flightPhase.style.color = 'var(--c-cyan)';
        this.elements.flightPhase.style.textShadow = '0 0 8px rgba(0,229,255,0.6)';
      } else if (phase.includes('APOGEO')) {
        this.elements.flightPhase.style.color = 'var(--c-gold)';
        this.elements.flightPhase.style.textShadow = '0 0 8px rgba(255,215,0,0.6)';
      } else if (phase.includes('CAÍDA LIBRE') || phase.includes('FALLO')) {
        this.elements.flightPhase.style.color = 'var(--c-critical)';
        this.elements.flightPhase.style.textShadow = '0 0 8px rgba(255,23,68,0.7)';
      } else if (phase.includes('DESCENSO') || phase.includes('TIERRA')) {
        this.elements.flightPhase.style.color = 'var(--c-nominal)';
        this.elements.flightPhase.style.textShadow = '0 0 8px rgba(0,230,118,0.5)';
      } else {
        this.elements.flightPhase.style.color = 'var(--text-secondary)';
        this.elements.flightPhase.style.textShadow = 'none';
      }
    }
  }
}

window.AnalogGaugesComponent = AnalogGaugesComponent;
