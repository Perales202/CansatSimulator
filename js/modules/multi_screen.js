/**
 * ============================================================================
 * CAN-SAT MULTI-SCREEN & DETACHABLE WINDOW MANAGER
 * Enables high-performance multi-monitor 4K setups by detaching tactical
 * panels into separate browser windows synchronized via BroadcastChannel.
 * ============================================================================
 */

class MultiScreenManager {
  constructor() {
    this.channelName = 'cansat_ground_station_bus';
    this.channel = null;
    this.openWindows = new Map(); // moduleName -> windowReference

    if ('BroadcastChannel' in window) {
      this.channel = new BroadcastChannel(this.channelName);
      this.channel.onmessage = (event) => this.handleChannelMessage(event);
    }
  }

  /**
   * Broadcast telemetry packet to all detached 4K windows
   */
  broadcastTelemetry(packet, metrics) {
    if (!this.channel) return;
    this.channel.postMessage({
      type: 'TELEMETRY_UPDATE',
      payload: { packet, metrics }
    });
  }

  /**
   * Detach a specific panel into a separate native window.
   */
  popoutModule(moduleId, title) {
    if (this.openWindows.has(moduleId)) {
      const existingWin = this.openWindows.get(moduleId);
      if (existingWin && !existingWin.closed) {
        existingWin.focus();
        return;
      }
    }

    const width = 850;
    const height = 650;
    const left = window.screenX + 50;
    const top = window.screenY + 50;

    const url = `popout.html?module=${encodeURIComponent(moduleId)}&title=${encodeURIComponent(title)}`;
    const win = window.open(
      url,
      `CanSat_${moduleId}`,
      `width=${width},height=${height},left=${left},top=${top},menubar=no,toolbar=no,location=no,status=no,resizable=yes`
    );

    if (!win) {
      alert('Pop-up bloqueado por el navegador. Por favor permite pop-ups para desacoplar paneles a monitores secundarios.');
      return;
    }

    this.openWindows.set(moduleId, win);

    // Update parent panel UI to show it's detached
    const panelEl = document.querySelector(`[data-module-id="${moduleId}"]`);
    if (panelEl) {
      panelEl.classList.add('is-popped-out');
    }

    // Monitor for close event to re-dock
    const timer = setInterval(() => {
      if (win.closed) {
        clearInterval(timer);
        this.openWindows.delete(moduleId);
        if (panelEl) {
          panelEl.classList.remove('is-popped-out');
        }
      }
    }, 500);
  }

  /**
   * Handle incoming messages from secondary popout windows
   */
  handleChannelMessage(event) {
    const { type, payload } = event.data || {};
    if (type === 'REQUEST_STATE') {
      // Send current state to newly opened secondary window
      if (window.GroundStationState?.currentPacket) {
        this.broadcastTelemetry(
          window.GroundStationState.currentPacket,
          window.GroundStationState.metrics
        );
      }
    }
  }
}

window.MultiScreenManager = new MultiScreenManager();
