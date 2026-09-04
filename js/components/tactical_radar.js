/**
 * ============================================================================
 * CAN-SAT 3D SPACECRAFT ATTITUDE & TACTICAL TRACKING VISUALIZER (6-DOF)
 * High-fidelity 3D spacecraft viewport with Lambertian shaded polygonal model,
 * deployable parachute, 3-axis gimbal reference rings, spacecraft HUD,
 * gyro rate telemetry, and compact tactical radar compass.
 * ============================================================================
 */

class TacticalRadarComponent {
  constructor(containerEl) {
    this.container = containerEl;

    // 3D Spacecraft Attitude Vector
    this.attitudeEuler = { roll_deg: 0, pitch_deg: 0, yaw_deg: 0 };
    this.gyroRads = { x: 0, y: 0, z: 0 };
    this.kalmanAlt = 0;
    this.flightPhase = 'PRE-LANZAMIENTO';

    // Interactive Camera State
    this.camera = {
      rotX: 20,          // Camera elevation angle (deg)
      rotY: -35,         // Camera azimuth angle (deg)
      targetRotX: 20,
      targetRotY: -35,
      zoom: 1.0,
      targetZoom: 1.0,
      isDragging: false,
      lastMouseX: 0,
      lastMouseY: 0,
      autoRotate: false
    };

    // Tactical Navigation Tracking
    this.target = {
      x: 0,
      y: 0,
      altitude: 0,
      distance: 0,
      azimuth: 0,
      elevation: 0,
      gridRef: '00N 00E',
      valid: false
    };
    this.trajectoryHistory = [];
    this.maxTrail = 25;
    this.miniRadarSweep = 0;

    this.renderSkeleton();
    this.initCanvas();
    this.startAnimationLoop();
  }

  renderSkeleton() {
    this.container.innerHTML = `
      <div class="cansat-3d-wrapper">
        <!-- 1. Floating Top HUD Toolbar -->
        <div class="cansat-3d-toolbar">
          <div class="cansat-status-badge" id="attitude-status-badge">
            <span class="status-indicator-dot"></span>
            <span id="attitude-status-text">6-DOF: ESTABLE</span>
          </div>
          <div class="cansat-view-actions">
            <button type="button" class="btn-tactical" id="btn-3d-autorotate" title="Alternar Rotación Automática">⟳ GIRO AUTO</button>
            <button type="button" class="btn-tactical" id="btn-3d-topview" title="Vista Cenital Superior">👁 SUPERIOR</button>
            <button type="button" class="btn-tactical primary" id="btn-3d-reset" title="Restablecer Vista Isométrica">↺ RESET</button>
          </div>
        </div>

        <!-- 2. Main High-Fidelity 3D CanSat Viewport -->
        <div class="cansat-3d-viewport" id="cansat-3d-viewport-container">
          <canvas class="cansat-3d-canvas" id="canvas-cansat-3d"></canvas>
          <div class="cansat-drag-hint">ARRRASTRA PARA ROTAR 3D • RUEDA PARA ZOOM</div>
        </div>

        <!-- 3. Spacecraft Attitude & Gyro Rates Strip -->
        <div class="attitude-euler-strip">
          <div class="euler-card">
            <div class="euler-card-header">
              <span>ALABEO (ROLL)</span>
              <span class="euler-axis-tag roll">EJE X</span>
            </div>
            <div class="euler-card-val font-mono" id="val-roll">+00.0°</div>
            <div class="euler-bar-track">
              <div class="euler-bar-thumb" id="bar-roll" style="left:50%;"></div>
            </div>
          </div>

          <div class="euler-card">
            <div class="euler-card-header">
              <span>CABECEO (PITCH)</span>
              <span class="euler-axis-tag pitch">EJE Y</span>
            </div>
            <div class="euler-card-val font-mono" id="val-pitch">+00.0°</div>
            <div class="euler-bar-track">
              <div class="euler-bar-thumb" id="bar-pitch" style="left:50%;"></div>
            </div>
          </div>

          <div class="euler-card">
            <div class="euler-card-header">
              <span>GUIÑADA (YAW)</span>
              <span class="euler-axis-tag yaw">EJE Z</span>
            </div>
            <div class="euler-card-val font-mono" id="val-yaw">000.0°</div>
            <div class="euler-bar-track">
              <div class="euler-bar-thumb" id="bar-yaw" style="left:50%;"></div>
            </div>
          </div>
        </div>

        <!-- 4. Angular Velocities (Gyro Rates) -->
        <div class="gyro-rates-bar">
          <span style="color:var(--text-muted);">GIROSCOPIO:</span>
          <span class="font-mono" style="color:var(--c-cyan);" id="val-gyro-rates">ωX: 0.0°/s | ωY: 0.0°/s | ωZ: 0.0°/s</span>
          <span style="margin-left:auto; color:var(--text-muted);">ALT KALMAN: <strong id="nav-kalman-alt" style="color:var(--c-nominal);">0.0 m</strong></span>
        </div>

        <!-- 5. Compact Tactical Navigation & Position Strip -->
        <div class="tactical-nav-card">
          <!-- Mini Tactical Radar Compass -->
          <div class="mini-radar-container">
            <canvas class="mini-radar-canvas" id="canvas-mini-radar" width="70" height="70"></canvas>
          </div>

          <!-- Position & Distance Coordinates -->
          <div class="nav-metrics-grid">
            <div class="nav-metric-col">
              <span class="nav-metric-label">AZIMUT (RBO)</span>
              <span class="nav-metric-val font-mono" id="nav-azimuth">000.0°</span>
            </div>
            <div class="nav-metric-col">
              <span class="nav-metric-label">DIST. HORIZ.</span>
              <span class="nav-metric-val font-mono" id="nav-distance">0.0 m</span>
            </div>
            <div class="nav-metric-col">
              <span class="nav-metric-label">ELEVACIÓN</span>
              <span class="nav-metric-val font-mono" id="nav-elevation">00.0°</span>
            </div>
            <div class="nav-metric-col span-full" style="display:flex; justify-content:space-between; align-items:center; border-top:1px solid rgba(255,255,255,0.06); padding-top:3px; margin-top:2px;">
              <span style="font-size:9px; color:var(--text-muted);">CUADRÍCULA LORA: <strong class="font-mono" style="color:#fff;" id="nav-grid-ref">00N 00E</strong></span>
              <span class="font-mono" style="font-size:9.5px; color:var(--c-cyan); font-weight:700;" id="nav-cartesian">X: +0.0m | Y: +0.0m</span>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  initCanvas() {
    this.viewportCanvas = document.getElementById('canvas-cansat-3d');
    this.ctx = this.viewportCanvas ? this.viewportCanvas.getContext('2d') : null;

    this.miniRadarCanvas = document.getElementById('canvas-mini-radar');
    this.miniRadarCtx = this.miniRadarCanvas ? this.miniRadarCanvas.getContext('2d') : null;

    this.elements = {
      statusText: document.getElementById('attitude-status-text'),
      statusBadge: document.getElementById('attitude-status-badge'),
      valRoll: document.getElementById('val-roll'),
      valPitch: document.getElementById('val-pitch'),
      valYaw: document.getElementById('val-yaw'),
      barRoll: document.getElementById('bar-roll'),
      barPitch: document.getElementById('bar-pitch'),
      barYaw: document.getElementById('bar-yaw'),
      gyroRates: document.getElementById('val-gyro-rates'),
      kalmanAlt: document.getElementById('nav-kalman-alt'),
      azimuth: document.getElementById('nav-azimuth'),
      distance: document.getElementById('nav-distance'),
      elevation: document.getElementById('nav-elevation'),
      gridRef: document.getElementById('nav-grid-ref'),
      cartesian: document.getElementById('nav-cartesian'),
      btnReset: document.getElementById('btn-3d-reset'),
      btnAutoRotate: document.getElementById('btn-3d-autorotate'),
      btnTopView: document.getElementById('btn-3d-topview')
    };

    // Bind Interactive Camera Controls
    this.initCameraControls();

    window.addEventListener('resize', () => this.resizeCanvas());
    setTimeout(() => this.resizeCanvas(), 50);
  }

  initCameraControls() {
    const canvas = this.viewportCanvas;
    if (!canvas) return;

    // Mouse drag rotation
    canvas.addEventListener('mousedown', (e) => {
      this.camera.isDragging = true;
      this.camera.lastMouseX = e.clientX;
      this.camera.lastMouseY = e.clientY;
      this.camera.autoRotate = false;
      if (this.elements.btnAutoRotate) this.elements.btnAutoRotate.classList.remove('active');
    });

    window.addEventListener('mousemove', (e) => {
      if (!this.camera.isDragging) return;
      const dx = e.clientX - this.camera.lastMouseX;
      const dy = e.clientY - this.camera.lastMouseY;
      this.camera.lastMouseX = e.clientX;
      this.camera.lastMouseY = e.clientY;

      this.camera.targetRotY += dx * 0.6;
      this.camera.targetRotX = Math.max(-85, Math.min(85, this.camera.targetRotX + dy * 0.6));
    });

    window.addEventListener('mouseup', () => {
      this.camera.isDragging = false;
    });

    // Mouse wheel zoom
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const zoomDelta = e.deltaY > 0 ? -0.1 : 0.1;
      this.camera.targetZoom = Math.max(0.6, Math.min(2.2, this.camera.targetZoom + zoomDelta));
    }, { passive: false });

    // Touch support for tablets / touch screens
    canvas.addEventListener('touchstart', (e) => {
      if (e.touches.length === 1) {
        this.camera.isDragging = true;
        this.camera.lastMouseX = e.touches[0].clientX;
        this.camera.lastMouseY = e.touches[0].clientY;
      }
    }, { passive: true });

    canvas.addEventListener('touchmove', (e) => {
      if (this.camera.isDragging && e.touches.length === 1) {
        const dx = e.touches[0].clientX - this.camera.lastMouseX;
        const dy = e.touches[0].clientY - this.camera.lastMouseY;
        this.camera.lastMouseX = e.touches[0].clientX;
        this.camera.lastMouseY = e.touches[0].clientY;

        this.camera.targetRotY += dx * 0.6;
        this.camera.targetRotX = Math.max(-85, Math.min(85, this.camera.targetRotX + dy * 0.6));
      }
    }, { passive: true });

    canvas.addEventListener('touchend', () => {
      this.camera.isDragging = false;
    });

    // Button controls
    if (this.elements.btnReset) {
      this.elements.btnReset.addEventListener('click', () => {
        this.camera.targetRotX = 20;
        this.camera.targetRotY = -35;
        this.camera.targetZoom = 1.0;
        this.camera.autoRotate = false;
        if (this.elements.btnAutoRotate) this.elements.btnAutoRotate.classList.remove('active');
      });
    }

    if (this.elements.btnTopView) {
      this.elements.btnTopView.addEventListener('click', () => {
        this.camera.targetRotX = 85;
        this.camera.targetRotY = 0;
        this.camera.targetZoom = 1.0;
        this.camera.autoRotate = false;
        if (this.elements.btnAutoRotate) this.elements.btnAutoRotate.classList.remove('active');
      });
    }

    if (this.elements.btnAutoRotate) {
      this.elements.btnAutoRotate.addEventListener('click', () => {
        this.camera.autoRotate = !this.camera.autoRotate;
        this.elements.btnAutoRotate.classList.toggle('active', this.camera.autoRotate);
      });
    }
  }

  resizeCanvas() {
    const dpr = window.devicePixelRatio || 1;
    if (this.viewportCanvas) {
      const rect = this.viewportCanvas.getBoundingClientRect();
      this.viewportCanvas.width = Math.max(150, Math.floor(rect.width * dpr));
      this.viewportCanvas.height = Math.max(150, Math.floor(rect.height * dpr));
    }
    if (this.miniRadarCanvas) {
      const rect = this.miniRadarCanvas.getBoundingClientRect();
      this.miniRadarCanvas.width = Math.max(60, Math.floor(rect.width * dpr));
      this.miniRadarCanvas.height = Math.max(60, Math.floor(rect.height * dpr));
    }
  }

  updateTelemetry(packet, metrics) {
    if (!packet || !packet.sensors) return;

    const telem = packet.sensors.telemetry || {};
    const bmp = packet.sensors.bmp280 || {};
    const gridRefStr = telem.grid_ref || '00N 00E';
    const alt = bmp.altitude_m || 0;

    // Ingest 6-DOF Attitude & Angular Velocities
    if (packet.sensors.imu?.euler_deg) {
      this.attitudeEuler = packet.sensors.imu.euler_deg;
    }
    if (packet.sensors.imu?.gyro_rads) {
      this.gyroRads = packet.sensors.imu.gyro_rads;
    }
    if (packet.sensors.kalman) {
      this.kalmanAlt = packet.sensors.kalman.filteredAltitude_m;
    }

    // Ingest Flight Phase
    if (metrics?.flightPhase) {
      this.flightPhase = metrics.flightPhase;
    }

    // Parse Grid Reference
    const parsed = window.TelemetryParser ? window.TelemetryParser.parseGridRef(gridRefStr) : { x: 0, y: 0, distance_m: 0, azimuth_deg: 0, valid: true };

    let elevDeg = 0;
    if (parsed.distance_m > 0 || alt > 0) {
      elevDeg = Math.atan2(alt, Math.max(1, parsed.distance_m)) * (180 / Math.PI);
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

    // Update Textual Readouts
    this.updateReadouts();
  }

  update(packet, metrics) {
    this.updateTelemetry(packet, metrics);
  }

  updateReadouts() {
    const el = this.elements;
    const { roll_deg, pitch_deg, yaw_deg } = this.attitudeEuler;

    // 1. Euler angles
    if (el.valRoll) el.valRoll.textContent = `${roll_deg >= 0 ? '+' : ''}${roll_deg.toFixed(1)}°`;
    if (el.valPitch) el.valPitch.textContent = `${pitch_deg >= 0 ? '+' : ''}${pitch_deg.toFixed(1)}°`;
    if (el.valYaw) el.valYaw.textContent = `${yaw_deg.toFixed(1).padStart(5, '0')}°`;

    // Balance visual bar thumbs (-45 to +45 deg mapped to 0-100%)
    if (el.barRoll) {
      const rollFrac = Math.max(0, Math.min(100, 50 + (roll_deg / 45) * 50));
      el.barRoll.style.left = `${rollFrac}%`;
    }
    if (el.barPitch) {
      const pitchFrac = Math.max(0, Math.min(100, 50 + (pitch_deg / 45) * 50));
      el.barPitch.style.left = `${pitchFrac}%`;
    }
    if (el.barYaw) {
      const yawFrac = ((yaw_deg % 360) / 360) * 100;
      el.barYaw.style.left = `${yawFrac}%`;
    }

    // 2. Gyro rates (convert rad/s to deg/s)
    if (el.gyroRates && this.gyroRads) {
      const gx = (this.gyroRads.x * (180 / Math.PI)).toFixed(1);
      const gy = (this.gyroRads.y * (180 / Math.PI)).toFixed(1);
      const gz = (this.gyroRads.z * (180 / Math.PI)).toFixed(1);
      el.gyroRates.textContent = `ωX: ${gx}°/s | ωY: ${gy}°/s | ωZ: ${gz}°/s`;
    }

    // 3. Kalman alt
    if (el.kalmanAlt) {
      el.kalmanAlt.textContent = `${this.kalmanAlt.toFixed(1)} m`;
    }

    // 4. Tactical navigation metrics
    if (el.azimuth) el.azimuth.textContent = `${this.target.azimuth.toFixed(1).padStart(5, '0')}°`;
    if (el.distance) el.distance.textContent = `${this.target.distance.toFixed(1)} m`;
    if (el.elevation) el.elevation.textContent = `${this.target.elevation.toFixed(1).padStart(4, '0')}°`;
    if (el.gridRef) el.gridRef.textContent = this.target.gridRef;
    if (el.cartesian) {
      const sx = this.target.x >= 0 ? `+${this.target.x.toFixed(1)}` : this.target.x.toFixed(1);
      const sy = this.target.y >= 0 ? `+${this.target.y.toFixed(1)}` : this.target.y.toFixed(1);
      el.cartesian.textContent = `X: ${sx}m | Y: ${sy}m`;
    }

    // 5. Dynamic stability status badge
    if (el.statusText && el.statusBadge) {
      const absRoll = Math.abs(roll_deg);
      const absPitch = Math.abs(pitch_deg);
      if (this.flightPhase.includes('CAÍDA LIBRE') || this.flightPhase.includes('FALLO')) {
        el.statusText.textContent = 'ESTABILIDAD: VOLTEO CRÍTICO';
        el.statusBadge.className = 'cansat-status-badge critical';
      } else if (absRoll > 30 || absPitch > 30) {
        el.statusText.textContent = 'ESTABILIDAD: ALTA OSCILACIÓN';
        el.statusBadge.className = 'cansat-status-badge warning';
      } else if (this.flightPhase.includes('PARACHUTE') || this.flightPhase.includes('DESCENSO')) {
        el.statusText.textContent = 'PARACAÍDAS: DESPLEGADO (6-DOF)';
        el.statusBadge.className = 'cansat-status-badge nominal';
      } else {
        el.statusText.textContent = 'ESTABILIDAD: NOMINAL (6-DOF)';
        el.statusBadge.className = 'cansat-status-badge nominal';
      }
    }
  }

  startAnimationLoop() {
    const loop = () => {
      // Smooth Camera Interpolation (Damping)
      this.camera.rotX += (this.camera.targetRotX - this.camera.rotX) * 0.12;
      this.camera.rotY += (this.camera.targetRotY - this.camera.rotY) * 0.12;
      this.camera.zoom += (this.camera.targetZoom - this.camera.zoom) * 0.12;

      if (this.camera.autoRotate) {
        this.camera.targetRotY = (this.camera.targetRotY + 0.4) % 360;
      }

      this.miniRadarSweep = (this.miniRadarSweep + 0.04) % (Math.PI * 2);

      // Render 3D Spacecraft Viewport
      this.draw3DViewport();

      // Render Mini Tactical Radar
      this.drawMiniRadar();

      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  /**
   * Main High-Fidelity 3D CanSat Viewport Rendering Engine
   */
  draw3DViewport() {
    const ctx = this.ctx;
    const canvas = this.viewportCanvas;
    if (!ctx || !canvas) return;

    const w = canvas.width;
    const h = canvas.height;
    const dpr = window.devicePixelRatio || 1;

    ctx.clearRect(0, 0, w, h);

    const cx = w / 2;
    const cy = h / 2 + 10 * dpr;

    // --- Background Aerospace Grid & Celestial Horizon ---
    this.drawCelestialGrid(ctx, cx, cy, w, h, dpr);

    // --- 3D Projection Setup ---
    const camPitch = (this.camera.rotX * Math.PI) / 180;
    const camYaw = (this.camera.rotY * Math.PI) / 180;

    const satRoll = (this.attitudeEuler.roll_deg * Math.PI) / 180;
    const satPitch = (this.attitudeEuler.pitch_deg * Math.PI) / 180;
    const satYaw = (this.attitudeEuler.yaw_deg * Math.PI) / 180;

    // 3D Rotation Function (Spacecraft Orientation -> Camera View -> Perspective)
    const project3D = (x, y, z) => {
      // 1. Rotate by Spacecraft Attitude (Roll around X, Pitch around Y, Yaw around Z)
      // Roll
      let y1 = y * Math.cos(satRoll) - z * Math.sin(satRoll);
      let z1 = y * Math.sin(satRoll) + z * Math.cos(satRoll);
      let x1 = x;
      // Pitch
      let x2 = x1 * Math.cos(satPitch) + z1 * Math.sin(satPitch);
      let z2 = -x1 * Math.sin(satPitch) + z1 * Math.cos(satPitch);
      let y2 = y1;
      // Yaw
      let x3 = x2 * Math.cos(satYaw) - y2 * Math.sin(satYaw);
      let y3 = x2 * Math.sin(satYaw) + y2 * Math.cos(satYaw);
      let z3 = z2;

      // 2. Rotate by Camera View (Yaw around World Y, Pitch around Camera X)
      let xc1 = x3 * Math.cos(camYaw) + z3 * Math.sin(camYaw);
      let zc1 = -x3 * Math.sin(camYaw) + z3 * Math.cos(camYaw);
      let yc1 = y3;

      let yc2 = yc1 * Math.cos(camPitch) - zc1 * Math.sin(camPitch);
      let zc2 = yc1 * Math.sin(camPitch) + zc1 * Math.cos(camPitch);
      let xc2 = xc1;

      // 3. Perspective Projection
      const fov = 400 * dpr;
      const cameraDist = 340 * dpr / this.camera.zoom;
      const scale = fov / (cameraDist + zc2);

      return {
        px: cx + xc2 * scale,
        py: cy - yc2 * scale, // Invert Y for screen coordinates
        z: zc2,
        worldX: x3,
        worldY: y3,
        worldZ: z3
      };
    };

    // --- 3D Geometry: CanSat Dimensions ---
    const R = 34 * dpr;       // Radius (approx 66mm diameter)
    const halfH = 55 * dpr;   // Half height (approx 115mm height)
    const numSides = 16;      // 16-faceted cylinder

    // Generate Vertices
    const topRim = [];
    const botRim = [];
    for (let i = 0; i < numSides; i++) {
      const theta = (i / numSides) * Math.PI * 2;
      const vx = R * Math.cos(theta);
      const vz = R * Math.sin(theta);
      topRim.push({ x: vx, y: halfH, z: vz, ...project3D(vx, halfH, vz) });
      botRim.push({ x: vx, y: -halfH, z: vz, ...project3D(vx, -halfH, vz) });
    }

    const topCenter = project3D(0, halfH, 0);
    const botCenter = project3D(0, -halfH, 0);

    // Assemble Faces for Painter's Depth Sorting
    const faces = [];

    // Light direction vector in camera space
    const light = { x: 0.35, y: 0.75, z: 0.55 };

    // 1. Cylindrical Facet Quads
    for (let i = 0; i < numSides; i++) {
      const next = (i + 1) % numSides;
      const p0 = topRim[i];
      const p1 = topRim[next];
      const p2 = botRim[next];
      const p3 = botRim[i];

      const avgZ = (p0.z + p1.z + p2.z + p3.z) / 4;

      // Calculate 2D normal cross product for lighting / backface calculation
      const v1x = p1.px - p0.px;
      const v1y = p1.py - p0.py;
      const v2x = p3.px - p0.px;
      const v2y = p3.py - p0.py;
      const cross = v1x * v2y - v1y * v2x;

      const isFacing = cross < 0;

      // Facet lighting
      const midTheta = ((i + 0.5) / numSides) * Math.PI * 2;
      const normX = Math.cos(midTheta);
      const normZ = Math.sin(midTheta);
      const normProj = project3D(normX, 0, normZ);
      const normLength = Math.hypot(normProj.worldX, normProj.worldY, normProj.worldZ) || 1;
      const lDot = Math.max(0.2, (normProj.worldX * light.x + normProj.worldY * light.y + normProj.worldZ * light.z) / normLength);

      faces.push({
        type: 'side',
        index: i,
        z: avgZ,
        points: [p0, p1, p2, p3],
        isFacing,
        light: lDot
      });
    }

    // 2. Top and Bottom Bulkheads
    const topAvgZ = topRim.reduce((acc, p) => acc + p.z, 0) / numSides;
    const botAvgZ = botRim.reduce((acc, p) => acc + p.z, 0) / numSides;

    faces.push({ type: 'top', z: topAvgZ, points: topRim, center: topCenter });
    faces.push({ type: 'bottom', z: botAvgZ, points: botRim, center: botCenter });

    // 3. Deployable Parachute (When Active)
    const isParachuteActive = this.flightPhase.includes('PARACHUTE') || (this.flightPhase.includes('DESCENSO') && !this.flightPhase.includes('FALLO'));
    if (isParachuteActive) {
      const chuteH = halfH + 85 * dpr;
      const chuteApexH = chuteH + 35 * dpr;
      const chuteR = 54 * dpr;
      const chutePoints = [];
      const numChuteGores = 12;

      // Subtle aerodynamic wave
      const billow = Math.sin(Date.now() / 250) * 3 * dpr;

      for (let i = 0; i < numChuteGores; i++) {
        const theta = (i / numChuteGores) * Math.PI * 2;
        const cx = chuteR * Math.cos(theta);
        const cz = chuteR * Math.sin(theta);
        chutePoints.push({ x: cx, y: chuteH + billow, z: cz, ...project3D(cx, chuteH + billow, cz) });
      }

      const chuteApex = project3D(0, chuteApexH + billow, 0);

      // Parachute Gore Triangular Faces
      for (let i = 0; i < numChuteGores; i++) {
        const next = (i + 1) % numChuteGores;
        const avgZ = (chuteApex.z + chutePoints[i].z + chutePoints[next].z) / 3;
        faces.push({
          type: 'chute_gore',
          index: i,
          z: avgZ,
          points: [chuteApex, chutePoints[i], chutePoints[next]],
          harnessPoint: topCenter
        });
      }
    }

    // Sort Faces Back-to-Front (Painter's Algorithm)
    faces.sort((a, b) => a.z - b.z);

    // --- Render Sorted 3D Elements ---
    faces.forEach((f) => {
      if (f.type === 'side') {
        if (!f.isFacing) return; // Backface culling

        ctx.beginPath();
        ctx.moveTo(f.points[0].px, f.points[0].py);
        for (let j = 1; j < 4; j++) ctx.lineTo(f.points[j].px, f.points[j].py);
        ctx.closePath();

        // Alternating Panels: Solar Cells (Indigo) & Tactical Gold/Graphite
        const isSolar = f.index % 2 === 0;
        const kd = f.light;

        if (isSolar) {
          // Photovoltaic solar cells with metallic reflection
          const rCol = Math.round(10 + 20 * kd);
          const gCol = Math.round(35 + 50 * kd);
          const bCol = Math.round(85 + 130 * kd);
          ctx.fillStyle = `rgb(${rCol}, ${gCol}, ${bCol})`;
        } else {
          // Tactical metallic chassis / gold foil
          const rCol = Math.round(40 + 130 * kd);
          const gCol = Math.round(38 + 110 * kd);
          const bCol = Math.round(20 + 40 * kd);
          ctx.fillStyle = `rgb(${rCol}, ${gCol}, ${bCol})`;
        }
        ctx.fill();

        // Edge wireframe accent
        ctx.strokeStyle = isSolar ? 'rgba(0, 229, 255, 0.45)' : 'rgba(255, 215, 0, 0.4)';
        ctx.lineWidth = 1 * dpr;
        ctx.stroke();

      } else if (f.type === 'top') {
        // Top Bulkhead Cap (Avionics Bay & Antenna Plate)
        ctx.beginPath();
        ctx.moveTo(f.points[0].px, f.points[0].py);
        f.points.forEach((p) => ctx.lineTo(p.px, p.py));
        ctx.closePath();
        ctx.fillStyle = '#1e293b';
        ctx.fill();
        ctx.strokeStyle = '#00e5ff';
        ctx.lineWidth = 1.2 * dpr;
        ctx.stroke();

        // Antenna Mast and Beacon LED
        const antennaTip = project3D(0, halfH + 28 * dpr, 0);
        ctx.beginPath();
        ctx.moveTo(f.center.px, f.center.py);
        ctx.lineTo(antennaTip.px, antennaTip.py);
        ctx.strokeStyle = '#cbd5e1';
        ctx.lineWidth = 2 * dpr;
        ctx.stroke();

        // Blinking Beacon LED
        const isBlink = Math.sin(Date.now() / 180) > 0;
        ctx.beginPath();
        ctx.arc(antennaTip.px, antennaTip.py, 3.5 * dpr, 0, Math.PI * 2);
        ctx.fillStyle = isBlink ? '#ff1744' : '#00e5ff';
        ctx.shadowColor = isBlink ? '#ff1744' : '#00e5ff';
        ctx.shadowBlur = 8 * dpr;
        ctx.fill();
        ctx.shadowBlur = 0;

      } else if (f.type === 'bottom') {
        // Bottom Heatshield / Battery Base Ring
        ctx.beginPath();
        ctx.moveTo(f.points[0].px, f.points[0].py);
        f.points.forEach((p) => ctx.lineTo(p.px, p.py));
        ctx.closePath();
        ctx.fillStyle = '#0f172a';
        ctx.fill();
        ctx.strokeStyle = 'rgba(100, 116, 139, 0.6)';
        ctx.lineWidth = 1 * dpr;
        ctx.stroke();

      } else if (f.type === 'chute_gore') {
        // Parachute Shroud Suspension Line
        ctx.beginPath();
        ctx.moveTo(f.harnessPoint.px, f.harnessPoint.py);
        ctx.lineTo(f.points[1].px, f.points[1].py);
        ctx.strokeStyle = 'rgba(255, 215, 0, 0.35)';
        ctx.lineWidth = 0.8 * dpr;
        ctx.stroke();

        // Parachute Canopy Triangular Gore
        ctx.beginPath();
        ctx.moveTo(f.points[0].px, f.points[0].py);
        ctx.lineTo(f.points[1].px, f.points[1].py);
        ctx.lineTo(f.points[2].px, f.points[2].py);
        ctx.closePath();

        // Alternating Safety Orange and White Gore Striping
        const isOrange = f.index % 2 === 0;
        ctx.fillStyle = isOrange ? '#ff5722' : '#f8fafc';
        ctx.fill();
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
        ctx.lineWidth = 0.75 * dpr;
        ctx.stroke();
      }
    });

    // --- 3D Coordinate Gimbal Axes (Body Reference) ---
    this.draw3DGimbalAxes(ctx, project3D, dpr);

    // --- Spacecraft HUD Overlay (Pitch Ladder & Bank Arc) ---
    this.drawSpacecraftHUD(ctx, cx, cy, w, h, dpr);
  }

  drawCelestialGrid(ctx, cx, cy, w, h, dpr) {
    // Subtle circular orbital horizon grid
    ctx.save();
    ctx.strokeStyle = 'rgba(0, 229, 255, 0.06)';
    ctx.lineWidth = 1;
    [100, 180, 260].forEach((r) => {
      ctx.beginPath();
      ctx.arc(cx, cy, r * dpr, 0, Math.PI * 2);
      ctx.stroke();
    });

    // Crosshairs
    ctx.beginPath();
    ctx.moveTo(cx - 280 * dpr, cy);
    ctx.lineTo(cx + 280 * dpr, cy);
    ctx.moveTo(cx, cy - 280 * dpr);
    ctx.lineTo(cx, cy + 280 * dpr);
    ctx.stroke();
    ctx.restore();
  }

  draw3DGimbalAxes(ctx, project3D, dpr) {
    const axisLen = 58 * dpr;
    const origin = project3D(0, 0, 0);
    const xAxis = project3D(axisLen, 0, 0);   // +X (Roll) -> Red
    const yAxis = project3D(0, axisLen, 0);   // +Y (Pitch) -> Green
    const zAxis = project3D(0, 0, axisLen);   // +Z (Yaw) -> Cyan

    ctx.save();
    ctx.lineWidth = 2 * dpr;

    // +X (Roll) - Red Neon
    ctx.strokeStyle = '#ff1744';
    ctx.beginPath();
    ctx.moveTo(origin.px, origin.py);
    ctx.lineTo(xAxis.px, xAxis.py);
    ctx.stroke();
    ctx.fillStyle = '#ff1744';
    ctx.font = `bold ${8.5 * dpr}px monospace`;
    ctx.fillText('+X (ROLL)', xAxis.px + 4, xAxis.py + 3);

    // +Y (Pitch/Thrust) - Green Neon
    ctx.strokeStyle = '#00e676';
    ctx.beginPath();
    ctx.moveTo(origin.px, origin.py);
    ctx.lineTo(yAxis.px, yAxis.py);
    ctx.stroke();
    ctx.fillStyle = '#00e676';
    ctx.fillText('+Y (CABECEO)', yAxis.px + 4, yAxis.py + 3);

    // +Z (Yaw) - Cyan Neon
    ctx.strokeStyle = '#00e5ff';
    ctx.beginPath();
    ctx.moveTo(origin.px, origin.py);
    ctx.lineTo(zAxis.px, zAxis.py);
    ctx.stroke();
    ctx.fillStyle = '#00e5ff';
    ctx.fillText('+Z (GUIÑADA)', zAxis.px + 4, zAxis.py + 3);

    ctx.restore();
  }

  drawSpacecraftHUD(ctx, cx, cy, w, h, dpr) {
    ctx.save();
    const rollRad = (this.attitudeEuler.roll_deg * Math.PI) / 180;

    // Top Roll Bank Angle Arc
    const bankR = 120 * dpr;
    ctx.beginPath();
    ctx.arc(cx, cy - 40 * dpr, bankR, (120 * Math.PI) / 180, (60 * Math.PI) / 180, true);
    ctx.strokeStyle = 'rgba(0, 229, 255, 0.25)';
    ctx.lineWidth = 1.5 * dpr;
    ctx.stroke();

    // Bank angle index marks (-45, -30, -15, 0, 15, 30, 45)
    [-45, -30, -15, 0, 15, 30, 45].forEach((deg) => {
      const a = ((deg - 90) * Math.PI) / 180;
      const x1 = cx + (bankR - 6 * dpr) * Math.cos(a);
      const y1 = (cy - 40 * dpr) + (bankR - 6 * dpr) * Math.sin(a);
      const x2 = cx + (bankR + 2 * dpr) * Math.cos(a);
      const y2 = (cy - 40 * dpr) + (bankR + 2 * dpr) * Math.sin(a);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.strokeStyle = deg === 0 ? 'rgba(0, 229, 255, 0.8)' : 'rgba(0, 229, 255, 0.4)';
      ctx.stroke();
    });

    // Roll pointer (Inverted triangle)
    const rollPtrAngle = ((this.attitudeEuler.roll_deg - 90) * Math.PI) / 180;
    const px = cx + (bankR - 2 * dpr) * Math.cos(rollPtrAngle);
    const py = (cy - 40 * dpr) + (bankR - 2 * dpr) * Math.sin(rollPtrAngle);
    ctx.beginPath();
    ctx.arc(px, py, 3 * dpr, 0, Math.PI * 2);
    ctx.fillStyle = '#ffd166';
    ctx.fill();

    // Center Tactical Reticle
    ctx.strokeStyle = 'rgba(255, 209, 102, 0.7)';
    ctx.lineWidth = 1.5 * dpr;
    ctx.beginPath();
    ctx.arc(cx, cy, 5 * dpr, 0, Math.PI * 2);
    ctx.stroke();

    ctx.restore();
  }

  /**
   * Mini Tactical Radar & Bearing Compass in Footer Card
   */
  drawMiniRadar() {
    const ctx = this.miniRadarCtx;
    const canvas = this.miniRadarCanvas;
    if (!ctx || !canvas) return;

    const w = canvas.width;
    const h = canvas.height;
    const cx = w / 2;
    const cy = h / 2;
    const rMax = Math.min(cx, cy) - 4;

    ctx.clearRect(0, 0, w, h);

    // Dark Radar Compass Background
    ctx.beginPath();
    ctx.arc(cx, cy, rMax, 0, Math.PI * 2);
    ctx.fillStyle = '#060b14';
    ctx.fill();
    ctx.strokeStyle = 'rgba(0, 229, 255, 0.35)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Range Rings (500m, 1000m)
    [0.5, 1.0].forEach((frac) => {
      ctx.beginPath();
      ctx.arc(cx, cy, rMax * frac, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(0, 229, 255, 0.18)';
      ctx.stroke();
    });

    // Crosshairs & Headings
    ctx.beginPath();
    ctx.moveTo(cx, cy - rMax);
    ctx.lineTo(cx, cy + rMax);
    ctx.moveTo(cx - rMax, cy);
    ctx.lineTo(cx + rMax, cy);
    ctx.strokeStyle = 'rgba(0, 229, 255, 0.2)';
    ctx.stroke();

    ctx.fillStyle = 'rgba(0, 229, 255, 0.9)';
    ctx.font = `bold 7px monospace`;
    ctx.textAlign = 'center';
    ctx.fillText('N', cx, cy - rMax + 8);

    // Rotating Sweep Beam
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(this.miniRadarSweep);
    const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, rMax);
    grad.addColorStop(0, 'rgba(0, 229, 255, 0.0)');
    grad.addColorStop(1, 'rgba(0, 229, 255, 0.35)');
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, rMax, -0.3, 0);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.restore();

    // Ground Station Center Pin
    ctx.beginPath();
    ctx.arc(cx, cy, 2, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();

    // CanSat Blip and Vector
    const maxRangeMeters = 800;
    const scale = rMax / maxRangeMeters;
    const bx = cx + this.target.x * scale;
    const by = cy - this.target.y * scale;

    // Blip pulse
    ctx.beginPath();
    ctx.arc(bx, by, 3, 0, Math.PI * 2);
    ctx.fillStyle = '#00ff66';
    ctx.shadowColor = '#00ff66';
    ctx.shadowBlur = 4;
    ctx.fill();
    ctx.shadowBlur = 0;
  }
}

window.TacticalRadarComponent = TacticalRadarComponent;
