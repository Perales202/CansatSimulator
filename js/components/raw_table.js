/**
 * ============================================================================
 * CAN-SAT RAW TELEMETRY DATA TABLE & EXPORT SYSTEM
 * Real-time high-contrast table displaying raw packet logs,
 * filtering, CSV/JSON session export, and JSON inspector.
 * ============================================================================
 */

class RawTableComponent {
  constructor(containerEl) {
    this.container = containerEl;
    this.autoScroll = true;
    this.filterText = '';
    this.rows = [];
    this.maxDisplayRows = 150;

    this.renderSkeleton();
    this.bindEvents();
  }

  renderSkeleton() {
    this.container.innerHTML = `
      <div class="raw-table-wrapper">
        <!-- Toolbar Strip -->
        <div class="raw-table-toolbar">
          <div class="table-filter-group">
            <input type="text" id="table-search-input" class="table-input" placeholder="Filtrar telemetría..." style="width:140px;">
            <label style="display:flex; align-items:center; gap:4px; font-size:10px; color:var(--text-secondary); cursor:pointer;">
              <input type="checkbox" id="table-autoscroll-chk" checked>
              <span>Auto-scroll</span>
            </label>
            <span id="packet-counter-badge" class="badge" style="font-size:10px;">0 PKTS</span>
          </div>

          <div style="display:flex; align-items:center; gap:6px;">
            <button class="btn-tactical" id="btn-export-csv" title="Exportar telemetría a formato CSV">
              <span>CSV</span>
            </button>
            <button class="btn-tactical" id="btn-export-json" title="Exportar telemetría a formato JSON">
              <span>JSON</span>
            </button>
            <button class="btn-tactical danger" id="btn-clear-table" title="Limpiar historial">
              <span>LIMPIAR</span>
            </button>
          </div>
        </div>

        <!-- Scrollable Table -->
        <div class="raw-table-scroll" id="raw-table-scroll-container">
          <table class="raw-data-table">
            <thead>
              <tr>
                <th>MET (HH:MM:SS)</th>
                <th>EQUIPO</th>
                <th>PKT #</th>
                <th>ESTADO</th>
                <th>ALTITUD (m)</th>
                <th>TEMP (°C)</th>
                <th>VOLT (V)</th>
                <th>ACCEL X (g)</th>
                <th>ACCEL Y (g)</th>
                <th>ACCEL Z (g)</th>
              </tr>
            </thead>
            <tbody id="raw-table-tbody">
              <!-- Dynamically populated -->
            </tbody>
          </table>
        </div>
      </div>
    `;

    this.tbody = document.getElementById('raw-table-tbody');
    this.scrollContainer = document.getElementById('raw-table-scroll-container');
    this.counterBadge = document.getElementById('packet-counter-badge');
  }

  bindEvents() {
    const searchInput = document.getElementById('table-search-input');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.filterText = e.target.value.toLowerCase().trim();
        this.applyFilter();
      });
    }

    const autoScrollChk = document.getElementById('table-autoscroll-chk');
    if (autoScrollChk) {
      autoScrollChk.addEventListener('change', (e) => {
        this.autoScroll = e.target.checked;
      });
    }

    const btnCsv = document.getElementById('btn-export-csv');
    if (btnCsv) {
      btnCsv.addEventListener('click', () => this.exportCSV());
    }

    const btnJson = document.getElementById('btn-export-json');
    if (btnJson) {
      btnJson.addEventListener('click', () => this.exportJSON());
    }

    const btnClear = document.getElementById('btn-clear-table');
    if (btnClear) {
      btnClear.addEventListener('click', () => {
        this.rows = [];
        this.tbody.innerHTML = '';
        if (this.counterBadge) this.counterBadge.textContent = '0 PKTS';
      });
    }
  }

  addPacket(packet) {
    if (!packet || !packet.sensors) return;

    this.rows.push(packet);
    if (this.rows.length > 500) {
      this.rows.shift();
    }

    if (this.counterBadge) {
      this.counterBadge.textContent = `${this.rows.length} PKTS`;
    }

    // Check filter match
    if (!this.matchesFilter(packet)) return;

    const tr = document.createElement('tr');

    let statusClass = 'badge-nominal';
    let rowClass = '';
    if (packet.status !== 'NOMINAL') {
      statusClass = packet.status.includes('ANOMALY') ? 'badge-critical' : 'badge-warning';
      rowClass = packet.status.includes('ANOMALY') ? 'row-anomaly' : 'row-warning';
    }
    if (rowClass) tr.className = rowClass;

    const bmp = packet.sensors?.bmp280 || {};
    const telem = packet.sensors?.telemetry || {};
    const imu = packet.sensors?.imu || {};
    const batt = packet.sensors?.battery || {};

    const metStr = packet.missionTime || telem.mission_time || (packet.timestamp ? new Date(packet.timestamp * 1000).toISOString().substr(11, 8) : '00:00:00');
    const teamIdStr = String(packet.teamId ?? telem.team_id ?? 1024).padStart(4, '0');
    const pktCountStr = packet.packetCount ?? telem.packet_count ?? 0;
    const stateStr = packet.flightState || telem.state || packet.status || 'NOMN';
    const altStr = (bmp.altitude_m ?? packet.altitude ?? 0).toFixed(1);
    const tempStr = (bmp.temp_c ?? packet.temperature ?? 0).toFixed(1);
    const voltStr = (batt.voltage_v ?? packet.voltage ?? 4.10).toFixed(2);

    let ax = 0, ay = 0, az = 1.0;
    if (imu.accel_g) {
      ax = imu.accel_g.x ?? 0;
      ay = imu.accel_g.y ?? 0;
      az = imu.accel_g.z ?? 1.0;
    } else if (imu.accel_mps2) {
      ax = (imu.accel_mps2.x ?? 0) / 9.80665;
      ay = (imu.accel_mps2.y ?? 0) / 9.80665;
      az = (imu.accel_mps2.z ?? 9.80665) / 9.80665;
    }

    tr.innerHTML = `
      <td class="font-mono" style="color:var(--c-cyan);">${metStr}</td>
      <td class="font-mono">${teamIdStr}</td>
      <td class="font-mono">${pktCountStr}</td>
      <td><span class="badge ${statusClass}">${stateStr}</span></td>
      <td class="font-mono" style="color:var(--c-cyan); font-weight:700;">${altStr}</td>
      <td class="font-mono">${tempStr}</td>
      <td class="font-mono" style="color:var(--c-gold);">${voltStr}</td>
      <td class="font-mono">${Number(ax).toFixed(2)}</td>
      <td class="font-mono">${Number(ay).toFixed(2)}</td>
      <td class="font-mono">${Number(az).toFixed(2)}</td>
    `;

    // Tooltip inspection on row click
    tr.style.cursor = 'pointer';
    tr.title = 'Clic para ver telemetría raw (CSV y JSON)';
    tr.addEventListener('click', () => {
      const csv = window.TelemetryParser ? window.TelemetryParser.formatCSV(packet).trim() : '';
      alert(`PAQUETE TELEMETRÍA (ASCII CSV):\n${csv}\n\nOBJETO JSON COMPLETO:\n${JSON.stringify(packet, null, 2)}`);
    });

    this.tbody.appendChild(tr);

    // Limit DOM rows
    while (this.tbody.children.length > this.maxDisplayRows) {
      this.tbody.removeChild(this.tbody.firstChild);
    }

    if (this.autoScroll && this.scrollContainer) {
      this.scrollContainer.scrollTop = this.scrollContainer.scrollHeight;
    }
  }

  matchesFilter(p) {
    if (!this.filterText) return true;
    const str = `${p.status} ${p.flightState} ${p.teamId} ${p.missionTime} ${p.sensors?.telemetry?.grid_ref} ${p.timestamp}`.toLowerCase();
    return str.includes(this.filterText);
  }

  applyFilter() {
    this.tbody.innerHTML = '';
    const filtered = this.rows.filter(p => this.matchesFilter(p)).slice(-this.maxDisplayRows);
    filtered.forEach(p => {
      this.addPacket(p);
    });
  }

  exportCSV() {
    if (this.rows.length === 0) {
      alert('No hay paquetes de telemetría registrados para exportar.');
      return;
    }

    const header = 'TeamID,Mission_time,Packet_count,Altitude,Temperature,Voltage,Accel_X,Accel_Y,Accel_Z,State';
    const lines = [header];

    this.rows.forEach(p => {
      if (window.TelemetryParser && window.TelemetryParser.formatCSV) {
        lines.push(window.TelemetryParser.formatCSV(p).trim());
      }
    });

    this.downloadFile(lines.join('\n') + '\n', `telemetry_cansat_${Date.now()}.csv`, 'text/csv');
  }

  exportJSON() {
    if (this.rows.length === 0) {
      alert('No hay paquetes de telemetría registrados para exportar.');
      return;
    }

    const jsonStr = JSON.stringify(this.rows, null, 2);
    this.downloadFile(jsonStr, `telemetry_cansat_${Date.now()}.json`, 'application/json');
  }

  downloadFile(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}

window.RawTableComponent = RawTableComponent;
