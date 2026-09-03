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
                <th>TIMESTAMP</th>
                <th>ESTADO</th>
                <th>ALTITUD (m)</th>
                <th>PRESIÓN (hPa)</th>
                <th>TEMP (°C)</th>
                <th>RSSI (dBm)</th>
                <th>SNR (dB)</th>
                <th>GRID REF</th>
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

    const bmp = packet.sensors.bmp280 || {};
    const telem = packet.sensors.telemetry || {};

    const dateStr = new Date(packet.timestamp * 1000).toISOString().substr(11, 8);

    tr.innerHTML = `
      <td class="font-mono">${dateStr} (${packet.timestamp})</td>
      <td><span class="badge ${statusClass}">${packet.status}</span></td>
      <td class="font-mono" style="color:var(--c-cyan); font-weight:700;">${(bmp.altitude_m ?? 0).toFixed(1)}</td>
      <td class="font-mono">${(bmp.pressure_hpa ?? 0).toFixed(1)}</td>
      <td class="font-mono">${(bmp.temp_c ?? 0).toFixed(1)}</td>
      <td class="font-mono" style="color:${(telem.rssi_lora ?? -100) < -100 ? 'var(--c-critical)' : 'inherit'}">${telem.rssi_lora ?? '--'}</td>
      <td class="font-mono">${(telem.snr ?? 0).toFixed(1)}</td>
      <td class="font-mono" style="color:var(--c-gold);">${telem.grid_ref ?? '--'}</td>
    `;

    // Tooltip inspection on row click
    tr.style.cursor = 'pointer';
    tr.title = 'Clic para ver JSON crudo';
    tr.addEventListener('click', () => {
      alert(`PAQUETE TELEMETRÍA RAW (JSON):\n\n${JSON.stringify(packet, null, 2)}`);
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
    const str = `${p.status} ${p.sensors?.telemetry?.grid_ref} ${p.timestamp}`.toLowerCase();
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

    const headers = ['timestamp', 'iso_time', 'status', 'altitude_m', 'pressure_hpa', 'temp_c', 'rssi_lora', 'snr', 'grid_ref'];
    const lines = [headers.join(',')];

    this.rows.forEach(p => {
      const bmp = p.sensors?.bmp280 || {};
      const telem = p.sensors?.telemetry || {};
      const iso = new Date(p.timestamp * 1000).toISOString();
      const row = [
        p.timestamp,
        `"${iso}"`,
        `"${p.status}"`,
        bmp.altitude_m ?? '',
        bmp.pressure_hpa ?? '',
        bmp.temp_c ?? '',
        telem.rssi_lora ?? '',
        telem.snr ?? '',
        `"${telem.grid_ref ?? ''}"`
      ];
      lines.push(row.join(','));
    });

    this.downloadFile(lines.join('\n'), `telemetry_cansat_${Date.now()}.csv`, 'text/csv');
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
