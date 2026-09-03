/**
 * ============================================================================
 * CAN-SAT GROUND STATION & SIMULATOR - MASTER APPLICATION CONTROLLER
 * Integrates all modules (SITL Physics, Web Serial HITL, Telemetry Parser,
 * Sensory Audio, 4K Multi-Screen, and Tactical UI Components).
 * ============================================================================
 */

document.addEventListener('DOMContentLoaded', () => {
  // Initialize Master State
  const state = window.GroundStationState;
  const parser = new window.TelemetryParser();
  const audio = window.AudioSystem;
  const multiScreen = window.MultiScreenManager;

  // Initialize UI Components
  const gaugesContainer = document.getElementById('panel-instruments-body');
  const chartsContainer = document.getElementById('panel-charts-body');
  const radarContainer = document.getElementById('panel-radar-body');
  const rawTableContainer = document.getElementById('panel-raw-body');

  const gauges = new window.AnalogGaugesComponent(gaugesContainer);
  const charts = new window.ChartsEngine(chartsContainer);
  const radar = new window.TacticalRadarComponent(radarContainer);
  const rawTable = new window.RawTableComponent(rawTableContainer);

  // Initialize Isolated Physics SITL Engine
  const sitl = new window.PhysicsSITL((rawPacket) => {
    // Pipeline: Raw synthetic packet -> Parser -> State Ingestion
    handleIncomingTelemetry(rawPacket);
  });

  // Initialize Isolated Web Serial Manager (HITL)
  const serial = new window.WebSerialManager({
    baudRate: 115200,
    onLineReceived: (line) => {
      // Direct raw line from ESP32 -> Log to Serial Console -> Parser
      logToSerialConsole(line);
      const parsed = parser.parse(line);
      if (parsed.success) {
        handleIncomingTelemetry(parsed.packet, parsed.isAnomaly);
      } else {
        console.warn('[Parser] Corrupted serial frame:', parsed.error);
        appendConsoleError(`[ERROR] Frame descartado: ${parsed.error}`);
      }
    },
    onStatusChange: (status, details) => {
      updateSerialUIStatus(status, details);
    },
    onError: (err) => {
      console.error('[WebSerial Error]', err);
      appendConsoleError(`[SERIAL ERROR] ${err.message}`);
    }
  });

  // Master Telemetry Ingestion Pipeline
  function handleIncomingTelemetry(rawPacket, forceAnomaly = false) {
    // 1. Strict parsing & integrity check (isolated)
    const result = parser.parse(rawPacket);
    if (!result.success && !result.packet) return;

    const packet = result.packet;
    const isAnomaly = forceAnomaly || result.isAnomaly;

    // 2. Ingest into reactive state
    state.ingestPacket(packet);

    // 3. Audio sensory directional feedback
    const parsedCoords = window.TelemetryParser.parseGridRef(packet.sensors?.telemetry?.grid_ref);
    const azimuth = parsedCoords.azimuth_deg || 0;

    if (isAnomaly) {
      state.metrics.anomaliesDetected++;
      if (packet.status.includes('ANOMALY') || result.anomalyReasons?.length > 1) {
        audio.playCriticalAlarm(azimuth);
      } else {
        audio.playWarningTone(azimuth);
      }
    } else {
      audio.playTelemetryChirp(azimuth);
    }

    // 4. Update UI Components
    gauges.update(packet, state.metrics);
    charts.addPoint(packet);
    radar.updateTelemetry(packet);
    rawTable.addPacket(packet);

    // 5. Broadcast to any open secondary 4K popout windows
    multiScreen.broadcastTelemetry(packet, state.metrics);

    // 6. Update master header telemetry pills
    updateHeaderTelemetryPills(packet, state.metrics);
  }

  // Clocks: Mission Elapsed Time (MET) and Ground Station UTC
  let missionStartTime = Date.now();
  setInterval(() => {
    // UTC Clock
    const now = new Date();
    const utcStr = now.toISOString().substr(11, 8);
    const utcEl = document.getElementById('clock-utc-val');
    if (utcEl) utcEl.textContent = `${utcStr} UTC`;

    // MET Clock
    const elapsedSec = Math.floor((Date.now() - missionStartTime) / 1000);
    state.metrics.missionElapsedSeconds = elapsedSec;
    const hrs = String(Math.floor(elapsedSec / 3600)).padStart(2, '0');
    const mins = String(Math.floor((elapsedSec % 3600) / 60)).padStart(2, '0');
    const secs = String(elapsedSec % 60).padStart(2, '0');
    const metEl = document.getElementById('clock-met-val');
    if (metEl) metEl.textContent = `T+${hrs}:${mins}:${secs}`;
  }, 1000);

  // Update Header Telemetry Status
  function updateHeaderTelemetryPills(packet, metrics) {
    const statusDot = document.getElementById('master-status-dot');
    const statusText = document.getElementById('master-status-text');
    const pktCountEl = document.getElementById('header-pkt-count');
    const loraBadge = document.getElementById('header-lora-badge');

    if (pktCountEl) pktCountEl.textContent = `${metrics.packetCount} PKTS`;

    if (statusDot && statusText) {
      if (packet.status === 'NOMINAL') {
        statusDot.className = 'status-dot';
        statusText.textContent = 'TELEMETRÍA NOMINAL';
        statusText.style.color = 'var(--c-nominal)';
      } else if (packet.status.includes('WARNING')) {
        statusDot.className = 'status-dot warning';
        statusText.textContent = packet.status;
        statusText.style.color = 'var(--c-warning)';
      } else {
        statusDot.className = 'status-dot critical';
        statusText.textContent = packet.status;
        statusText.style.color = 'var(--c-critical)';
      }
    }

    if (loraBadge && packet.sensors?.telemetry) {
      loraBadge.textContent = `LoRa: ${packet.sensors.telemetry.rssi_lora}dBm`;
    }
  }

  // Mode Switcher: SITL vs HITL
  const modeBtnSitl = document.getElementById('mode-btn-sitl');
  const modeBtnHitl = document.getElementById('mode-btn-hitl');
  const sitlControlsStrip = document.getElementById('sitl-controls-strip');
  const hitlControlsStrip = document.getElementById('hitl-controls-strip');

  function setAppMode(mode) {
    state.setMode(mode);
    if (mode === 'SITL') {
      modeBtnSitl.className = 'mode-btn active';
      modeBtnHitl.className = 'mode-btn';
      sitlControlsStrip.style.display = 'flex';
      hitlControlsStrip.style.display = 'none';
      sitl.start();
    } else {
      modeBtnSitl.className = 'mode-btn';
      modeBtnHitl.className = 'mode-btn active hitl';
      sitlControlsStrip.style.display = 'none';
      hitlControlsStrip.style.display = 'flex';
      sitl.stop();
    }
  }

  if (modeBtnSitl) modeBtnSitl.addEventListener('click', () => setAppMode('SITL'));
  if (modeBtnHitl) modeBtnHitl.addEventListener('click', () => setAppMode('HITL'));

  // Start in SITL mode by default as per Phase 1
  setAppMode('SITL');

  // SITL Simulation Controls
  const btnSitlPlay = document.getElementById('sitl-btn-play');
  const btnSitlPause = document.getElementById('sitl-btn-pause');
  const btnSitlReset = document.getElementById('sitl-btn-reset');
  const anomalySelect = document.getElementById('sitl-anomaly-select');

  if (btnSitlPlay) {
    btnSitlPlay.addEventListener('click', () => {
      sitl.start();
      btnSitlPlay.classList.add('primary');
      btnSitlPause.classList.remove('primary');
    });
  }

  if (btnSitlPause) {
    btnSitlPause.addEventListener('click', () => {
      sitl.stop();
      btnSitlPause.classList.add('primary');
      btnSitlPlay.classList.remove('primary');
    });
  }

  if (btnSitlReset) {
    btnSitlReset.addEventListener('click', () => {
      sitl.reset();
      missionStartTime = Date.now();
      state.resetMission();
    });
  }

  if (anomalySelect) {
    anomalySelect.addEventListener('change', (e) => {
      const val = e.target.value;
      if (val === 'NONE') {
        sitl.clearAnomaly();
      } else {
        sitl.setAnomaly(val);
      }
    });
  }

  // Web Serial HITL Controls
  const btnSerialConnect = document.getElementById('btn-serial-connect');
  const baudSelect = document.getElementById('serial-baud-select');
  const btnOpenConsole = document.getElementById('btn-open-serial-console');
  const consoleOverlay = document.getElementById('serial-console-modal');
  const btnCloseConsole = document.getElementById('btn-close-serial-console');
  const serialLogContent = document.getElementById('serial-log-pre');
  const btnSendSerial = document.getElementById('btn-send-serial-cmd');
  const inputSerialCmd = document.getElementById('input-serial-cmd');

  if (btnSerialConnect) {
    btnSerialConnect.addEventListener('click', async () => {
      if (serial.isConnected) {
        await serial.disconnect();
      } else {
        audio.init(); // unlock audio context on click
        const baud = baudSelect ? baudSelect.value : 115200;
        try {
          await serial.connect(baud);
        } catch (err) {
          alert(`No se pudo conectar al puerto Serial: ${err.message}`);
        }
      }
    });
  }

  function updateSerialUIStatus(status, details) {
    if (status === 'CONNECTED') {
      btnSerialConnect.textContent = 'DESCONECTAR ESP32';
      btnSerialConnect.className = 'btn-tactical danger';
      document.getElementById('serial-port-indicator').textContent = 'ESP32 CONECTADO';
      document.getElementById('serial-port-indicator').className = 'badge badge-nominal';
    } else if (status === 'CONNECTING') {
      btnSerialConnect.textContent = 'CONECTANDO...';
      btnSerialConnect.disabled = true;
    } else {
      btnSerialConnect.textContent = 'CONECTAR ESP32 (WEB SERIAL)';
      btnSerialConnect.className = 'btn-tactical success';
      btnSerialConnect.disabled = false;
      document.getElementById('serial-port-indicator').textContent = 'SIN DISPOSITIVO';
      document.getElementById('serial-port-indicator').className = 'badge';
    }
  }

  function logToSerialConsole(line) {
    if (!serialLogContent) return;
    serialLogContent.textContent += `${line}\n`;
    serialLogContent.scrollTop = serialLogContent.scrollHeight;
  }

  function appendConsoleError(errMsg) {
    if (!serialLogContent) return;
    serialLogContent.textContent += `[!] ${errMsg}\n`;
    serialLogContent.scrollTop = serialLogContent.scrollHeight;
  }

  if (btnOpenConsole && consoleOverlay) {
    btnOpenConsole.addEventListener('click', () => consoleOverlay.classList.add('active'));
  }
  if (btnCloseConsole && consoleOverlay) {
    btnCloseConsole.addEventListener('click', () => consoleOverlay.classList.remove('active'));
  }
  if (btnSendSerial && inputSerialCmd) {
    btnSendSerial.addEventListener('click', async () => {
      const val = inputSerialCmd.value.trim();
      if (val) {
        try {
          await serial.send(val);
          logToSerialConsole(`> ${val}`);
          inputSerialCmd.value = '';
        } catch (e) {
          alert(`Error enviando comando: ${e.message}`);
        }
      }
    });
  }

  // Audio Toggle
  const btnAudioToggle = document.getElementById('btn-audio-toggle');
  if (btnAudioToggle) {
    btnAudioToggle.addEventListener('click', () => {
      audio.init();
      audio.setEnabled(!audio.enabled);
      btnAudioToggle.textContent = audio.enabled ? 'AUDIO: ACTIVO' : 'AUDIO: SILENCIO';
      btnAudioToggle.className = audio.enabled ? 'btn-tactical primary' : 'btn-tactical';
    });
  }

  // CRT Scanline Toggle
  const btnScanlinesToggle = document.getElementById('btn-scanlines-toggle');
  if (btnScanlinesToggle) {
    btnScanlinesToggle.addEventListener('click', () => {
      document.body.classList.toggle('scanlines-disabled');
      const isDisabled = document.body.classList.contains('scanlines-disabled');
      btnScanlinesToggle.textContent = isDisabled ? 'CRT: OFF' : 'CRT: ON';
    });
  }

  // Popout Detach Buttons for 4K Multi-Monitor
  document.querySelectorAll('.popout-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const panel = e.target.closest('.tactical-panel');
      if (panel) {
        const moduleId = panel.getAttribute('data-module-id');
        const title = panel.querySelector('.panel-title')?.textContent?.trim() || moduleId;
        multiScreen.popoutModule(moduleId, title);
      }
    });
  });

  // Enable Audio Context on first user click anywhere
  window.addEventListener('click', () => audio.init(), { once: true });
});
