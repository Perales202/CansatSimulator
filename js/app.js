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

  // Centralized Global Status Manager (En linea, Sin conexion, Simulando, Error)
  function setGlobalStatus(status) {
    const statusDot = document.getElementById('master-status-dot');
    const statusText = document.getElementById('master-status-text');
    if (!statusDot || !statusText) return;

    switch (status) {
      case 'Simulando':
        statusDot.className = 'status-dot';
        statusText.textContent = 'Simulando';
        statusText.style.color = 'var(--c-cyan)';
        break;
      case 'En linea':
        statusDot.className = 'status-dot';
        statusText.textContent = 'En linea';
        statusText.style.color = 'var(--c-nominal)';
        break;
      case 'Sin conexion':
        statusDot.className = 'status-dot offline';
        statusText.textContent = 'Sin conexion';
        statusText.style.color = 'var(--text-muted)';
        break;
      case 'Error':
        statusDot.className = 'status-dot critical';
        statusText.textContent = 'Error';
        statusText.style.color = 'var(--c-critical)';
        break;
    }
  }

  // Update Header Telemetry Status
  function updateHeaderTelemetryPills(packet, metrics) {
    if (packet.status && (packet.status.includes('ANOMALY') || packet.status.includes('WARNING') || packet.status !== 'NOMINAL')) {
      setGlobalStatus('Error');
    } else if (state.config.mode === 'SITL') {
      setGlobalStatus(sitl.running ? 'Simulando' : 'Sin conexion');
    } else if (state.config.mode === 'HITL') {
      setGlobalStatus(serial.isConnected ? 'En linea' : 'Sin conexion');
    }
  }

  // Mode Switcher Dropdown (SITL vs HITL)
  const modeSelectDropdown = document.getElementById('mode-select-dropdown');
  const sitlControlsStrip = document.getElementById('sitl-controls-strip');
  const hitlControlsStrip = document.getElementById('hitl-controls-strip');

  function setAppMode(mode, triggerModal = false) {
    state.setMode(mode);
    if (modeSelectDropdown) modeSelectDropdown.value = mode;

    if (mode === 'SITL') {
      sitlControlsStrip.style.display = 'flex';
      hitlControlsStrip.style.display = 'none';
      if (triggerModal) {
        openSitlConfigModal();
      } else {
        sitl.start();
        setGlobalStatus('Simulando');
      }
    } else {
      sitlControlsStrip.style.display = 'none';
      hitlControlsStrip.style.display = 'flex';
      sitl.stop();
      closeSitlConfigModal();
      setGlobalStatus(serial.isConnected ? 'En linea' : 'Sin conexion');
    }
  }

  if (modeSelectDropdown) {
    modeSelectDropdown.addEventListener('change', (e) => {
      const selected = e.target.value;
      setAppMode(selected, selected === 'SITL');
    });
  }

  // SITL Configuration Modal Elements
  const modalConfig = document.getElementById('sitl-config-modal');
  const btnCloseModalX = document.getElementById('btn-modal-close-x');
  const btnCancelModal = document.getElementById('btn-modal-cancel');
  const btnApplyModal = document.getElementById('btn-modal-apply');
  const btnConfigToolbar = document.getElementById('sitl-btn-config');

  const inputApogee = document.getElementById('cfg-apogee');
  const inputChute = document.getElementById('cfg-chute-alt');
  const inputMass = document.getElementById('cfg-mass');
  const inputWindSpeed = document.getElementById('cfg-wind-speed');
  const inputWindDir = document.getElementById('cfg-wind-dir');
  const selectFreq = document.getElementById('cfg-freq');
  const selectModalAnomaly = document.getElementById('cfg-anomaly');
  const chkResetClock = document.getElementById('cfg-reset-clock');

  function openSitlConfigModal() {
    if (modalConfig) modalConfig.classList.add('active');
  }

  function closeSitlConfigModal() {
    if (modalConfig) modalConfig.classList.remove('active');
  }

  if (btnConfigToolbar) btnConfigToolbar.addEventListener('click', openSitlConfigModal);
  if (btnCloseModalX) btnCloseModalX.addEventListener('click', closeSitlConfigModal);
  if (btnCancelModal) btnCancelModal.addEventListener('click', closeSitlConfigModal);

  // Quick Preset Handlers
  const presetStandard = document.getElementById('preset-btn-standard');
  const presetLow = document.getElementById('preset-btn-low');
  const presetWindy = document.getElementById('preset-btn-windy');
  const presetHigh = document.getElementById('preset-btn-high');

  if (presetStandard) {
    presetStandard.addEventListener('click', () => {
      if (inputApogee) inputApogee.value = 850;
      if (inputChute) inputChute.value = 500;
      if (inputMass) inputMass.value = 350;
      if (inputWindSpeed) inputWindSpeed.value = 3.2;
      if (inputWindDir) {
        inputWindDir.value = 45;
        updateWindCardinalLabel(45);
      }
      if (selectFreq) selectFreq.value = '2';
      if (selectModalAnomaly) selectModalAnomaly.value = 'NONE';
    });
  }

  if (presetLow) {
    presetLow.addEventListener('click', () => {
      if (inputApogee) inputApogee.value = 400;
      if (inputChute) inputChute.value = 250;
      if (inputMass) inputMass.value = 350;
      if (inputWindSpeed) inputWindSpeed.value = 2.0;
      if (inputWindDir) {
        inputWindDir.value = 90;
        updateWindCardinalLabel(90);
      }
      if (selectFreq) selectFreq.value = '2';
      if (selectModalAnomaly) selectModalAnomaly.value = 'NONE';
    });
  }

  if (presetWindy) {
    presetWindy.addEventListener('click', () => {
      if (inputApogee) inputApogee.value = 850;
      if (inputChute) inputChute.value = 500;
      if (inputMass) inputMass.value = 350;
      if (inputWindSpeed) inputWindSpeed.value = 7.0;
      if (inputWindDir) {
        inputWindDir.value = 180;
        updateWindCardinalLabel(180);
      }
      if (selectFreq) selectFreq.value = '2';
      if (selectModalAnomaly) selectModalAnomaly.value = 'NONE';
    });
  }

  if (presetHigh) {
    presetHigh.addEventListener('click', () => {
      if (inputApogee) inputApogee.value = 1200;
      if (inputChute) inputChute.value = 700;
      if (inputMass) inputMass.value = 320;
      if (inputWindSpeed) inputWindSpeed.value = 4.5;
      if (inputWindDir) {
        inputWindDir.value = 315;
        updateWindCardinalLabel(315);
      }
      if (selectFreq) selectFreq.value = '4';
      if (selectModalAnomaly) selectModalAnomaly.value = 'NONE';
    });
  }

  // Real-time GPS Weather Service Integration
  const btnFetchWeather = document.getElementById('btn-fetch-weather');
  const weatherFeedback = document.getElementById('weather-feedback-strip');
  const windCardinalLabel = document.getElementById('cfg-wind-cardinal');

  function updateWindCardinalLabel(deg) {
    if (!windCardinalLabel) return;
    const cardinal = window.WeatherService ? window.WeatherService.constructor.degreesToCardinal(deg) : '';
    windCardinalLabel.textContent = `${deg}° (${cardinal})`;
  }

  if (inputWindDir) {
    inputWindDir.addEventListener('input', (e) => {
      updateWindCardinalLabel(Number(e.target.value) || 0);
    });
  }

  if (btnFetchWeather) {
    btnFetchWeather.addEventListener('click', async () => {
      btnFetchWeather.disabled = true;
      btnFetchWeather.textContent = '⏳ CONSULTANDO GPS & METEO...';
      if (weatherFeedback) {
        weatherFeedback.style.display = 'block';
        weatherFeedback.style.color = 'var(--c-cyan)';
        weatherFeedback.textContent = 'Solicitando coordenadas GPS del dispositivo y consultando servicio meteorológico...';
      }

      try {
        const weather = await window.WeatherService.getLocalWeather();
        if (inputWindSpeed) inputWindSpeed.value = weather.windSpeed_mps;
        if (inputWindDir) inputWindDir.value = weather.windDirection_deg;
        updateWindCardinalLabel(weather.windDirection_deg);

        const cardinal = window.WeatherService.constructor.degreesToCardinal(weather.windDirection_deg);
        if (weatherFeedback) {
          weatherFeedback.style.display = 'block';
          weatherFeedback.style.color = 'var(--c-nominal)';
          weatherFeedback.innerHTML = `✓ <strong>METEO LOCAL RECUPERADA:</strong> [Lat: ${weather.latitude}°, Lon: ${weather.longitude}°] &bull; Viento: <strong>${weather.windSpeed_mps} m/s</strong> hacia <strong>${weather.windDirection_deg}° (${cardinal})</strong> &bull; Temp: ${weather.temperature_c}°C &bull; Presión: ${weather.surfacePressure_hpa} hPa`;
        }
      } catch (err) {
        if (weatherFeedback) {
          weatherFeedback.style.display = 'block';
          weatherFeedback.style.color = 'var(--c-warning)';
          weatherFeedback.textContent = `⚠ ${err.message} (Puedes ingresar la velocidad y dirección manualmente).`;
        }
      } finally {
        btnFetchWeather.disabled = false;
        btnFetchWeather.textContent = '📍 CONSULTAR VIENTO LOCAL (GPS)';
      }
    });
  }

  // Apply Modal Parameters and Start Simulation
  if (btnApplyModal) {
    btnApplyModal.addEventListener('click', () => {
      const apogee = Number(inputApogee?.value || 850);
      const chuteAlt = Number(inputChute?.value || 500);
      const mass = Number(inputMass?.value || 350);
      const windSpeed = Number(inputWindSpeed?.value || 3.2);
      const windDir = Number(inputWindDir?.value || 45);
      const freq = Number(selectFreq?.value || 2);
      const anomaly = selectModalAnomaly?.value || 'NONE';

      sitl.configure({
        apogeeTarget_m: apogee,
        chuteDeployAlt_m: chuteAlt,
        massGrams: mass,
        windSpeed_mps: windSpeed,
        windDirection_deg: windDir,
        frequencyHz: freq,
        anomaly: anomaly
      });

      // Synchronize anomaly dropdown in toolbar
      if (anomalySelect) {
        anomalySelect.value = anomaly;
      }

      // Reset mission state and timer if checked
      if (chkResetClock && chkResetClock.checked) {
        sitl.reset();
        missionStartTime = Date.now();
        state.resetMission();
      }

      setAppMode('SITL', false);
      sitl.start();
      closeSitlConfigModal();
    });
  }

  // Start in SITL mode by default as per Phase 1
  setAppMode('SITL', false);

  // 4. SITL Action Dropdown Control
  const sitlActionSelect = document.getElementById('sitl-action-select');
  const anomalySelect = document.getElementById('sitl-anomaly-select');

  if (sitlActionSelect) {
    sitlActionSelect.addEventListener('change', (e) => {
      const val = e.target.value;
      if (val === 'PLAY') {
        sitl.start();
        setGlobalStatus('Simulando');
      } else if (val === 'PAUSE') {
        sitl.stop();
        setGlobalStatus('Sin conexion');
      } else if (val === 'RESET') {
        sitl.reset();
        missionStartTime = Date.now();
        state.resetMission();
        sitl.start();
        sitlActionSelect.value = 'PLAY';
        setGlobalStatus('Simulando');
      }
    });
  }

  if (anomalySelect) {
    anomalySelect.addEventListener('change', (e) => {
      const val = e.target.value;
      if (val === 'NONE') {
        sitl.clearAnomaly();
        setGlobalStatus(sitl.running ? 'Simulando' : 'Sin conexion');
      } else {
        sitl.setAnomaly(val);
        setGlobalStatus('Error');
      }
    });
  }

  // 4. Web Serial HITL Dropdown Controls
  const hitlActionSelect = document.getElementById('hitl-action-select');
  const baudSelect = document.getElementById('serial-baud-select');
  const consoleOverlay = document.getElementById('serial-console-modal');
  const btnCloseConsole = document.getElementById('btn-close-serial-console');
  const serialLogContent = document.getElementById('serial-log-pre');
  const btnSendSerial = document.getElementById('btn-send-serial-cmd');
  const inputSerialCmd = document.getElementById('input-serial-cmd');

  if (hitlActionSelect) {
    hitlActionSelect.addEventListener('change', async (e) => {
      const action = e.target.value;
      if (action === 'CONNECT') {
        audio.init(); // unlock audio context on click
        const baud = baudSelect ? baudSelect.value : 115200;
        try {
          await serial.connect(baud);
        } catch (err) {
          alert(`No se pudo conectar al puerto Serial: ${err.message}`);
          hitlActionSelect.value = 'CONNECT';
        }
      } else if (action === 'DISCONNECT') {
        await serial.disconnect();
      } else if (action === 'CONSOLE') {
        if (consoleOverlay) consoleOverlay.classList.add('active');
        hitlActionSelect.value = serial.isConnected ? 'DISCONNECT' : 'CONNECT';
      }
    });
  }

  function updateSerialUIStatus(status, details) {
    if (!hitlActionSelect) return;
    const connectOpt = hitlActionSelect.querySelector('option[value="CONNECT"]');
    const disconnectOpt = hitlActionSelect.querySelector('option[value="DISCONNECT"]');

    if (status === 'CONNECTED') {
      if (connectOpt) connectOpt.disabled = true;
      if (disconnectOpt) {
        disconnectOpt.disabled = false;
        disconnectOpt.selected = true;
      }
      hitlActionSelect.style.color = 'var(--c-critical)';
      setGlobalStatus('En linea');
    } else if (status === 'CONNECTING') {
      setGlobalStatus('Sin conexion');
    } else {
      if (connectOpt) {
        connectOpt.disabled = false;
        connectOpt.selected = true;
      }
      if (disconnectOpt) disconnectOpt.disabled = true;
      hitlActionSelect.style.color = 'var(--c-nominal)';
      setGlobalStatus('Sin conexion');
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
