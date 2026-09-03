/**
 * ============================================================================
 * CAN-SAT HIGH-PERFORMANCE 60FPS CANVAS CHARTS ENGINE
 * Zero-dependency, lightweight oscilloscope strip charts for real-time
 * mission telemetry streams (Altitude, Pressure, Velocity, RSSI).
 * Optimized for high-DPI and 4K displays.
 * ============================================================================
 */

class ChartsEngine {
  constructor(containerEl) {
    this.container = containerEl;
    this.canvases = {};
    this.contexts = {};
    this.history = [];
    this.maxPoints = 120; // Show last ~60 seconds of telemetry

    this.renderSkeleton();
    this.initCanvases();
    window.addEventListener('resize', () => this.resizeCanvases());
  }

  renderSkeleton() {
    this.container.innerHTML = `
      <div class="charts-grid">
        <!-- Chart 1: Perfil de Altitud y Descenso -->
        <div class="chart-box">
          <div class="chart-header-bar">
            <span class="chart-header-title">PERFIL DE ALTITUD (METROS M.S.N.M.)</span>
            <span class="chart-header-value" id="chart-alt-readout">0.0 m</span>
          </div>
          <canvas class="chart-canvas" id="canvas-altitude"></canvas>
        </div>

        <!-- Chart 2: Presión Barométrica y Temperatura -->
        <div class="chart-box">
          <div class="chart-header-bar">
            <span class="chart-header-title">PRESIÓN AMBIENTE (hPa) & TEMP (°C)</span>
            <span class="chart-header-value" id="chart-env-readout">1013.2 hPa / 22.4°C</span>
          </div>
          <canvas class="chart-canvas" id="canvas-pressure"></canvas>
        </div>
      </div>
    `;
  }

  initCanvases() {
    this.canvases.alt = document.getElementById('canvas-altitude');
    this.canvases.press = document.getElementById('canvas-pressure');

    if (this.canvases.alt) this.contexts.alt = this.canvases.alt.getContext('2d');
    if (this.canvases.press) this.contexts.press = this.canvases.press.getContext('2d');

    this.readouts = {
      alt: document.getElementById('chart-alt-readout'),
      env: document.getElementById('chart-env-readout')
    };

    setTimeout(() => this.resizeCanvases(), 50);
  }

  resizeCanvases() {
    const dpr = window.devicePixelRatio || 1;
    for (const key in this.canvases) {
      const canvas = this.canvases[key];
      if (!canvas) continue;
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.max(100, Math.floor(rect.width * dpr));
      canvas.height = Math.max(80, Math.floor(rect.height * dpr));
    }
    this.redrawAll();
  }

  addPoint(packet) {
    if (!packet || !packet.sensors) return;

    this.history.push({
      timestamp: packet.timestamp || Date.now() / 1000,
      altitude: packet.sensors.bmp280?.altitude_m ?? 0,
      pressure: packet.sensors.bmp280?.pressure_hpa ?? 1013.25,
      temp: packet.sensors.bmp280?.temp_c ?? 20.0,
      rssi: packet.sensors.telemetry?.rssi_lora ?? -80
    });

    if (this.history.length > this.maxPoints) {
      this.history.shift();
    }

    // Update readouts
    const last = this.history[this.history.length - 1];
    if (this.readouts.alt) this.readouts.alt.textContent = `${last.altitude.toFixed(1)} m`;
    if (this.readouts.env) this.readouts.env.textContent = `${last.pressure.toFixed(1)} hPa / ${last.temp.toFixed(1)}°C`;

    this.redrawAll();
  }

  redrawAll() {
    this.drawAltitudeChart();
    this.drawPressureChart();
  }

  drawAltitudeChart() {
    const ctx = this.contexts.alt;
    const canvas = this.canvases.alt;
    if (!ctx || !canvas || this.history.length < 2) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    // Dynamic scale
    let maxAlt = 50;
    let minAlt = 0;
    for (const pt of this.history) {
      if (pt.altitude > maxAlt) maxAlt = pt.altitude;
    }
    maxAlt = Math.ceil((maxAlt * 1.15) / 50) * 50;

    // Draw tactical grid
    this.drawGrid(ctx, w, h, minAlt, maxAlt, 'm');

    // Draw Line
    ctx.beginPath();
    ctx.lineWidth = 2.5 * (window.devicePixelRatio || 1);
    ctx.strokeStyle = '#00e5ff';
    ctx.shadowColor = 'rgba(0, 229, 255, 0.6)';
    ctx.shadowBlur = 8;

    const stepX = w / (this.maxPoints - 1);
    const startOffset = (this.maxPoints - this.history.length) * stepX;

    this.history.forEach((pt, i) => {
      const x = startOffset + (i * stepX);
      const y = h - ((pt.altitude - minAlt) / (maxAlt - minAlt)) * (h - 20) - 10;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Area fill gradient
    ctx.lineTo(w, h);
    ctx.lineTo(startOffset, h);
    ctx.closePath();
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, 'rgba(0, 229, 255, 0.25)');
    grad.addColorStop(1, 'rgba(0, 229, 255, 0.0)');
    ctx.fillStyle = grad;
    ctx.shadowBlur = 0;
    ctx.fill();

    // Dot at current point
    const lastIndex = this.history.length - 1;
    const lastX = startOffset + (lastIndex * stepX);
    const lastY = h - ((this.history[lastIndex].altitude - minAlt) / (maxAlt - minAlt)) * (h - 20) - 10;
    ctx.beginPath();
    ctx.arc(lastX, lastY, 4 * (window.devicePixelRatio || 1), 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = '#00e5ff';
    ctx.shadowBlur = 10;
    ctx.fill();
  }

  drawPressureChart() {
    const ctx = this.contexts.press;
    const canvas = this.canvases.press;
    if (!ctx || !canvas || this.history.length < 2) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    let maxP = 1030;
    let minP = 700;
    for (const pt of this.history) {
      if (pt.pressure > maxP) maxP = pt.pressure + 10;
      if (pt.pressure < minP) minP = Math.max(0, pt.pressure - 10);
    }

    this.drawGrid(ctx, w, h, minP, maxP, 'hPa');

    const stepX = w / (this.maxPoints - 1);
    const startOffset = (this.maxPoints - this.history.length) * stepX;

    // Line for Pressure (Amber / Gold)
    ctx.beginPath();
    ctx.lineWidth = 2 * (window.devicePixelRatio || 1);
    ctx.strokeStyle = '#ffd166';
    ctx.shadowColor = 'rgba(255, 209, 102, 0.5)';
    ctx.shadowBlur = 6;

    this.history.forEach((pt, i) => {
      const x = startOffset + (i * stepX);
      const y = h - ((pt.pressure - minP) / (maxP - minP)) * (h - 20) - 10;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  drawGrid(ctx, w, h, minVal, maxVal, unit) {
    ctx.save();
    ctx.strokeStyle = 'rgba(30, 41, 59, 0.5)';
    ctx.lineWidth = 1;
    ctx.fillStyle = '#64748b';
    ctx.font = `${9 * (window.devicePixelRatio || 1)}px monospace`;

    // 4 Horizontal lines
    for (let i = 0; i <= 4; i++) {
      const y = (h - 20) * (i / 4) + 10;
      const val = maxVal - (i / 4) * (maxVal - minVal);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();

      ctx.fillText(`${val.toFixed(0)} ${unit}`, 6, y - 3);
    }

    // 5 Vertical time divisions
    for (let j = 1; j < 5; j++) {
      const x = w * (j / 5);
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    ctx.restore();
  }
}

window.ChartsEngine = ChartsEngine;
