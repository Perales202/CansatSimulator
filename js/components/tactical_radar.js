/**
 * ============================================================================
 * CAN-SAT TACTICAL RADAR & COORDINATE GRID CALCULATOR
 * Displays 2D polar/cartesian tracking, sweeping radar beam, target reticle,
 * drift vectors, projected landing zone, and mini attitude indicator.
 * ============================================================================
 */

class TacticalRadarComponent {
  constructor(containerEl) {
    this.container = containerEl;
    this.sweepAngle = 0;
    this.target = { x: 0, y: 0, altitude: 0, distance: 0, azimuth: 0, elevation: 0, valid: false };
    this.trajectoryHistory = [];
    this.maxTrail = 30;

    this.renderSkeleton();
    this.initCanvas();
    this.startAnimationLoop();
  }

  renderSkeleton() {
    this.container.innerHTML = `
      <div class="radar-wrapper">
        <!-- Main Tactical Radar Screen -->
        <div class="radar-canvas-container">
          <canvas class="radar-canvas" id="canvas-tactical-radar"></canvas>
        </div>

        <!-- Grid Reference Coordinate Calculator Readouts -->
        <div class="radar-telemetry-strip">
          <div class="radar-stat-box">
            <span class="radar-stat-label">AZIMUT (RBO)</span>
            <span class="radar-stat-val" id="radar-azimuth">000.0°</span>
          </div>
          <div class="radar-stat-box">
            <span class="radar-stat-label">DISTANCIA HORIZ.</span>
            <span class="radar-stat-val" id="radar-dist">0.0 m</span>
          </div>
          <div class="radar-stat-box">
            <span class="radar-stat-label">ELEVACIÓN</span>
            <span class="radar-stat-val" id="radar-elev">00.0°</span>
          </div>
        </div>

        <!-- Raw Grid Reference & Ground Station Relative Cartesian Offset -->
        <div class="grid-calc-card">
          <div>
            <div style="font-size:8.5px; color:var(--text-muted); text-transform:uppercase;">CUADRÍCULA LORA (GRID REF)</div>
            <div class="grid-ref-display" style="margin-top:2px;">
              <span class="grid-ref-pill" id="grid-ref-text">--N --E</span>
            </div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:8.5px; color:var(--text-muted); text-transform:uppercase;">OFFSET CARTESIANO (ESTACIÓN)</div>
            <div class="font-mono" style="font-size:11px; color:var(--c-cyan); font-weight:700;" id="cartesian-offset">
              X: +0.0m | Y: +0.0m
            </div>
          </div>
        </div>

        <!-- Attitude & Horizon Mini HUD -->
        <div class="attitude-hud-mini">
          <canvas class="attitude-canvas" id="canvas-attitude-hud"></canvas>
        </div>

        <div style="display:flex; justify-content:space-between; align-items:center; font-size:9.5px; font-family:var(--font-mono); padding:1px 2px 0 2px;">
          <span style="color:var(--text-muted);">ACTITUD: <strong id="attitude-euler-val" style="color:var(--c-cyan);">R: 0.0° | P: 0.0° | Y: 0.0°</strong></span>
          <span style="color:var(--text-muted);">ALT KALMAN: <strong id="attitude-kalman-val" style="color:var(--c-nominal);">0.0 m</strong></span>
        </div>
      </div>
    `;
  }

  initCanvas() {
    this.attitudeEuler = { roll_deg: 0, pitch_deg: 0, yaw_deg: 0 };
    this.kalmanAlt = 0;

    this.canvas = document.getElementById('canvas-tactical-radar');
    this.ctx = this.canvas ? this.canvas.getContext('2d') : null;

    this.attitudeCanvas = document.getElementById('canvas-attitude-hud');
    this.attitudeCtx = this.attitudeCanvas ? this.attitudeCanvas.getContext('2d') : null;

    this.readouts = {
      azimuth: document.getElementById('radar-azimuth'),
      dist: document.getElementById('radar-dist'),
      elev: document.getElementById('radar-elev'),
      gridRef: document.getElementById('grid-ref-text'),
      cartesian: document.getElementById('cartesian-offset'),
      attitude: document.getElementById('attitude-euler-val'),
      kalman: document.getElementById('attitude-kalman-val')
    };

    window.addEventListener('resize', () => this.resizeCanvas());
    setTimeout(() => this.resizeCanvas(), 50);
  }

  resizeCanvas() {
    const dpr = window.devicePixelRatio || 1;
    if (this.canvas) {
      const rect = this.canvas.getBoundingClientRect();
      this.canvas.width = Math.max(150, Math.floor(rect.width * dpr));
      this.canvas.height = Math.max(150, Math.floor(rect.height * dpr));
    }
    if (this.attitudeCanvas) {
      const rect = this.attitudeCanvas.getBoundingClientRect();
      this.attitudeCanvas.width = Math.max(150, Math.floor(rect.width * dpr));
      this.attitudeCanvas.height = Math.max(50, Math.floor(rect.height * dpr));
    }
  }

  updateTelemetry(packet) {
    if (!packet || !packet.sensors) return;

    const telem = packet.sensors.telemetry || {};
    const bmp = packet.sensors.bmp280 || {};
    const gridRefStr = telem.grid_ref || '00N 00E';
    const alt = bmp.altitude_m || 0;

    // Use isolated mathematical parser for grid reference
    const parsed = window.TelemetryParser.parseGridRef(gridRefStr);

    // Calculate elevation angle: atan2(altitude, horizontal_distance)
    let elevDeg = 0;
    if (parsed.distance_m > 0 || alt > 0) {
      elevDeg = (Math.atan2(alt, Math.max(1, parsed.distance_m)) * (180 / Math.PI));
    }

    this.target = {
      x: parsed.x,
      y: parsed.y,
      altitude: alt,
      distance: parsed.distance_m,
      azimuth: parsed.azimuth_deg,
      elevation: Number(elevDeg.toFixed(1)),
      gridRef: gridRefStr,
      valid: parsed.valid
    };

    // Store trail
    this.trajectoryHistory.push({ x: parsed.x, y: parsed.y, alt });
    if (this.trajectoryHistory.length > this.maxTrail) {
      this.trajectoryHistory.shift();
    }

    // Update textual indicators
    if (this.readouts.azimuth) this.readouts.azimuth.textContent = `${this.target.azimuth.toFixed(1).padStart(5, '0')}°`;
    if (this.readouts.dist) this.readouts.dist.textContent = `${this.target.distance.toFixed(1)} m`;
    if (this.readouts.elev) this.readouts.elev.textContent = `${this.target.elevation.toFixed(1).padStart(4, '0')}°`;
    if (this.readouts.gridRef) this.readouts.gridRef.textContent = gridRefStr;
    if (this.readouts.cartesian) {
      const sx = parsed.x >= 0 ? `+${parsed.x.toFixed(1)}` : parsed.x.toFixed(1);
      const sy = parsed.y >= 0 ? `+${parsed.y.toFixed(1)}` : parsed.y.toFixed(1);
      this.readouts.cartesian.textContent = `X: ${sx}m | Y: ${sy}m`;
    }
    // Extract 6-DOF Attitude & Kalman Filter data if available
    if (packet.sensors?.imu?.euler_deg) {
      this.attitudeEuler = packet.sensors.imu.euler_deg;
      if (this.readouts.attitude) {
        this.readouts.attitude.textContent = `R: ${this.attitudeEuler.roll_deg}° | P: ${this.attitudeEuler.pitch_deg}° | Y: ${this.attitudeEuler.yaw_deg}°`;
      }
    }
    if (packet.sensors?.kalman) {
      this.kalmanAlt = packet.sensors.kalman.filteredAltitude_m;
      if (this.readouts.kalman) {
        this.readouts.kalman.textContent = `${this.kalmanAlt.toFixed(1)} m`;
      }
    }
  }

  startAnimationLoop() {
    const loop = () => {
      this.sweepAngle = (this.sweepAngle + 0.035) % (Math.PI * 2);
      this.drawRadar();
      this.drawAttitudeHorizon();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  drawRadar() {
    const ctx = this.ctx;
    const canvas = this.canvas;
    if (!ctx || !canvas) return;

    const w = canvas.width;
    const h = canvas.height;
    const cx = w / 2;
    const cy = h / 2;
    const maxRadius = Math.min(cx, cy) - 16;

    ctx.clearRect(0, 0, w, h);

    // Radar scale: Max radius corresponds to 1000m
    const radarRangeMeters = 1000;
    const scale = maxRadius / radarRangeMeters;

    // 1. Draw Range Rings
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(0, 229, 255, 0.18)';
    const rings = [0.25, 0.5, 0.75, 1.0];
    rings.forEach((frac) => {
      const r = maxRadius * frac;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();

      // Distance tag
      ctx.fillStyle = 'rgba(0, 229, 255, 0.45)';
      ctx.font = `${9 * (window.devicePixelRatio || 1)}px monospace`;
      ctx.fillText(`${(radarRangeMeters * frac).toFixed(0)}m`, cx + 4, cy - r + 10);
    });

    // 2. Crosshairs & Cardinal Headings
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(0, 229, 255, 0.25)';
    ctx.moveTo(cx, cy - maxRadius);
    ctx.lineTo(cx, cy + maxRadius);
    ctx.moveTo(cx - maxRadius, cy);
    ctx.lineTo(cx + maxRadius, cy);
    ctx.stroke();

    ctx.fillStyle = '#00e5ff';
    ctx.font = `bold ${10 * (window.devicePixelRatio || 1)}px monospace`;
    ctx.textAlign = 'center';
    ctx.fillText('N', cx, cy - maxRadius - 4);
    ctx.fillText('S', cx, cy + maxRadius + 12);
    ctx.fillText('E', cx + maxRadius + 10, cy + 4);
    ctx.fillText('W', cx - maxRadius - 10, cy + 4);

    // 3. Sweeping Radar Beam with Gradient
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(this.sweepAngle);
    const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, maxRadius);
    grad.addColorStop(0, 'rgba(0, 229, 255, 0.0)');
    grad.addColorStop(1, 'rgba(0, 229, 255, 0.22)');

    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, maxRadius, -0.28, 0);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    // Leading line
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(maxRadius, 0);
    ctx.strokeStyle = 'rgba(0, 229, 255, 0.8)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();

    // 4. Ground Station Antenna Marker (Origin)
    ctx.beginPath();
    ctx.arc(cx, cy, 3, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = '#00e5ff';
    ctx.shadowBlur = 6;
    ctx.fill();
    ctx.shadowBlur = 0;

    // 5. Historical Trajectory Trail
    if (this.trajectoryHistory.length > 1) {
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(0, 229, 255, 0.35)';
      ctx.lineWidth = 1.5;
      this.trajectoryHistory.forEach((pt, i) => {
        const px = cx + (pt.x * scale);
        const py = cy - (pt.y * scale); // Invert Y for North
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.stroke();
    }

    // 6. Target CanSat Blip & Reticle
    const tx = cx + (this.target.x * scale);
    const ty = cy - (this.target.y * scale);

    // Target pulsing ring
    const pulseRadius = 6 + (Math.sin(Date.now() / 150) * 3);
    ctx.beginPath();
    ctx.arc(tx, ty, pulseRadius, 0, Math.PI * 2);
    ctx.strokeStyle = '#00ff66';
    ctx.lineWidth = 1.5;
    ctx.shadowColor = '#00ff66';
    ctx.shadowBlur = 8;
    ctx.stroke();

    // Target core dot
    ctx.beginPath();
    ctx.arc(tx, ty, 3.5, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.shadowBlur = 0;

    // Target label
    ctx.fillStyle = '#00ff66';
    ctx.font = `${9 * (window.devicePixelRatio || 1)}px monospace`;
    ctx.textAlign = 'left';
    ctx.fillText(`CANSAT [Alt: ${this.target.altitude.toFixed(0)}m]`, tx + 9, ty - 4);

    // Projected Landing Zone Ellipse if descending
    if (this.target.altitude > 10) {
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(tx + 15, ty - 15, 22, 14, Math.PI / 4, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255, 183, 0, 0.6)';
      ctx.setLineDash([3, 3]);
      ctx.stroke();
      ctx.restore();
    }
  }

  drawAttitudeHorizon() {
    const ctx = this.attitudeCtx;
    const canvas = this.attitudeCanvas;
    if (!ctx || !canvas) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const dpr = window.devicePixelRatio || 1;

    // Split view: Left = 60% Horizon, Right = 40% 3D Wireframe CanSat
    const horizonWidth = w * 0.62;
    const wireframeWidth = w - horizonWidth;

    // --- 1. Artificial Horizon (Left Side) ---
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, horizonWidth, h);
    ctx.clip();

    const hcx = horizonWidth / 2;
    const hcy = h / 2;

    const rollRad = (this.attitudeEuler.roll_deg * Math.PI) / 180;
    const pitchOffset = (this.attitudeEuler.pitch_deg / 90) * (h * 0.7);

    ctx.translate(hcx, hcy + pitchOffset);
    ctx.rotate(rollRad);

    // Horizon line
    ctx.strokeStyle = 'rgba(0, 229, 255, 0.85)';
    ctx.lineWidth = 1.5 * dpr;
    ctx.beginPath();
    ctx.moveTo(-horizonWidth, 0);
    ctx.lineTo(horizonWidth, 0);
    ctx.stroke();

    // Pitch ladder ticks
    const tickStep = 18 * dpr;
    [-2, -1, 1, 2].forEach((level) => {
      const y = level * tickStep;
      const len = (Math.abs(level) === 1 ? 16 : 28) * dpr;
      ctx.beginPath();
      ctx.moveTo(-len / 2, y);
      ctx.lineTo(len / 2, y);
      ctx.stroke();

      ctx.fillStyle = 'rgba(0, 229, 255, 0.6)';
      ctx.font = `${7 * dpr}px monospace`;
      ctx.fillText(`${level * 10}°`, len / 2 + 4, y + 2.5);
    });
    ctx.restore();

    // Fixed Aircraft / CanSat Crosshair
    ctx.strokeStyle = '#ffd166';
    ctx.lineWidth = 2 * dpr;
    ctx.beginPath();
    ctx.moveTo(hcx - 14 * dpr, hcy);
    ctx.lineTo(hcx - 4 * dpr, hcy);
    ctx.moveTo(hcx + 4 * dpr, hcy);
    ctx.lineTo(hcx + 14 * dpr, hcy);
    ctx.moveTo(hcx, hcy - 4 * dpr);
    ctx.lineTo(hcx, hcy + 4 * dpr);
    ctx.stroke();

    // Divider Line between Horizon and 3D Model
    ctx.strokeStyle = 'rgba(30, 41, 59, 0.8)';
    ctx.lineWidth = 1 * dpr;
    ctx.beginPath();
    ctx.moveTo(horizonWidth, 0);
    ctx.lineTo(horizonWidth, h);
    ctx.stroke();

    // Horizon Label
    ctx.fillStyle = '#64748b';
    ctx.font = `${7.5 * dpr}px monospace`;
    ctx.textAlign = 'left';
    ctx.fillText('HORIZONTE 6-DOF', 6 * dpr, 11 * dpr);

    // --- 2. 3D Wireframe CanSat Cylinder (Right Side) ---
    const wcx = horizonWidth + wireframeWidth / 2;
    const wcy = h / 2;

    this.draw3DCanSatWireframe(ctx, wcx, wcy, dpr);
  }

  draw3DCanSatWireframe(ctx, cx, cy, dpr) {
    const roll = (this.attitudeEuler.roll_deg * Math.PI) / 180;
    const pitch = (this.attitudeEuler.pitch_deg * Math.PI) / 180;
    const yaw = (this.attitudeEuler.yaw_deg * Math.PI) / 180;

    const r = 16 * dpr;
    const halfH = 24 * dpr;
    const numPoints = 10;

    // 3D Rotation function (Yaw * Pitch * Roll)
    const rotate3D = (x, y, z) => {
      // Roll around X
      let y1 = y * Math.cos(roll) - z * Math.sin(roll);
      let z1 = y * Math.sin(roll) + z * Math.cos(roll);
      let x1 = x;

      // Pitch around Y
      let x2 = x1 * Math.cos(pitch) + z1 * Math.sin(pitch);
      let z2 = -x1 * Math.sin(pitch) + z1 * Math.cos(pitch);
      let y2 = y1;

      // Yaw around Z
      let x3 = x2 * Math.cos(yaw) - y2 * Math.sin(yaw);
      let y3 = x2 * Math.sin(yaw) + y2 * Math.cos(yaw);
      let z3 = z2;

      // Perspective projection
      const dist = 180 * dpr;
      const fov = dist / (dist + z3);
      return {
        px: cx + x3 * fov,
        py: cy - y3 * fov, // Invert Y for screen
        z: z3
      };
    };

    const topPoints = [];
    const bottomPoints = [];

    for (let i = 0; i < numPoints; i++) {
      const theta = (i / numPoints) * Math.PI * 2;
      const x = r * Math.cos(theta);
      const z = r * Math.sin(theta);
      topPoints.push(rotate3D(x, halfH, z));
      bottomPoints.push(rotate3D(x, -halfH, z));
    }

    // Draw Cylinder Body Wireframe
    ctx.save();
    ctx.lineWidth = 1.2 * dpr;
    ctx.strokeStyle = '#00e5ff';
    ctx.shadowColor = 'rgba(0, 229, 255, 0.4)';
    ctx.shadowBlur = 4;

    // Top Circle
    ctx.beginPath();
    topPoints.forEach((p, i) => {
      if (i === 0) ctx.moveTo(p.px, p.py);
      else ctx.lineTo(p.px, p.py);
    });
    ctx.closePath();
    ctx.stroke();

    // Bottom Circle
    ctx.strokeStyle = 'rgba(0, 229, 255, 0.6)';
    ctx.beginPath();
    bottomPoints.forEach((p, i) => {
      if (i === 0) ctx.moveTo(p.px, p.py);
      else ctx.lineTo(p.px, p.py);
    });
    ctx.closePath();
    ctx.stroke();

    // Vertical Ribs / Struts
    ctx.strokeStyle = 'rgba(0, 229, 255, 0.4)';
    for (let i = 0; i < numPoints; i += 2) {
      ctx.beginPath();
      ctx.moveTo(topPoints[i].px, topPoints[i].py);
      ctx.lineTo(bottomPoints[i].px, bottomPoints[i].py);
      ctx.stroke();
    }

    // Top Center Antenna Indicator
    const antennaTop = rotate3D(0, halfH + 12 * dpr, 0);
    const antennaBase = rotate3D(0, halfH, 0);
    ctx.strokeStyle = '#ffd166';
    ctx.beginPath();
    ctx.moveTo(antennaBase.px, antennaBase.py);
    ctx.lineTo(antennaTop.px, antennaTop.py);
    ctx.stroke();

    // Label
    ctx.fillStyle = '#64748b';
    ctx.font = `${7 * dpr}px monospace`;
    ctx.textAlign = 'center';
    ctx.fillText('3D CANSAT', cx, cy + halfH + 14 * dpr);

    ctx.restore();
  }
}

window.TacticalRadarComponent = TacticalRadarComponent;
