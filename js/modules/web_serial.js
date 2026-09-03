/**
 * ============================================================================
 * CAN-SAT WEB SERIAL SERVICE & HARDWARE HANDSHAKE (HITL)
 * Manages physical connection to ESP32 / LoRa transceiver via Web Serial API.
 * Asynchronously reads chunked streams, buffers complete JSON lines,
 * and passes them to the telemetry parsing pipeline.
 * ============================================================================
 */

class WebSerialManager {
  constructor(options = {}) {
    this.baudRate = options.baudRate || 115200;
    this.onLineReceived = options.onLineReceived || (() => {});
    this.onStatusChange = options.onStatusChange || (() => {});
    this.onError = options.onError || (() => {});

    this.port = null;
    this.reader = null;
    this.readableStreamClosed = null;
    this.writer = null;
    this.writableStreamClosed = null;
    this.isConnected = false;
    this.keepReading = false;

    // Buffer for assembling fragmented stream chunks into newline-terminated JSON
    this.lineBuffer = '';

    // Auto-listen for physical disconnects
    if (this.isSupported()) {
      navigator.serial.addEventListener('disconnect', (e) => {
        if (e.target === this.port) {
          console.warn('[WebSerial] Microcontroller physically unplugged!');
          this.disconnect(true);
        }
      });
    }
  }

  isSupported() {
    return 'serial' in navigator;
  }

  /**
   * Request user permission to connect to an ESP32 / USB Serial device.
   */
  async connect(requestedBaudRate) {
    if (!this.isSupported()) {
      const err = new Error('Web Serial API is not supported in this browser. Please use Chrome, Edge, or Opera.');
      this.onError(err);
      throw err;
    }

    if (requestedBaudRate) {
      this.baudRate = Number(requestedBaudRate);
    }

    try {
      this.onStatusChange('CONNECTING');
      // Prompt user to pick serial COM port
      this.port = await navigator.serial.requestPort({
        filters: [
          // Common ESP32 USB-to-UART bridge chips (CP210x, CH340, FTDI)
          { usbVendorId: 0x10c4 }, // Silicon Labs CP210x
          { usbVendorId: 0x1a86 }, // QinHeng CH340
          { usbVendorId: 0x0403 }, // FTDI
          { usbVendorId: 0x303a }, // Espressif native USB (ESP32-S2/S3)
        ]
      }).catch(async (e) => {
        // Fallback: If filtered picker was cancelled or empty, try unfiltered request
        return await navigator.serial.requestPort();
      });

      // Open the port at specified baud rate
      await this.port.open({
        baudRate: this.baudRate,
        dataBits: 8,
        stopBits: 1,
        parity: 'none',
        bufferSize: 8192,
      });

      this.isConnected = true;
      this.keepReading = true;
      this.onStatusChange('CONNECTED', { port: this.port.getInfo() });

      // Start asynchronous read loop
      this.readStreamLoop();
      return true;
    } catch (err) {
      this.isConnected = false;
      this.onStatusChange('DISCONNECTED');
      this.onError(err);
      throw err;
    }
  }

  /**
   * Asynchronous stream reader with TextDecoderStream
   */
  async readStreamLoop() {
    const textDecoder = new TextDecoderStream();
    this.readableStreamClosed = this.port.readable.pipeTo(textDecoder.writable);
    this.reader = textDecoder.readable.getReader();

    try {
      while (this.keepReading) {
        const { value, done } = await this.reader.read();
        if (done) {
          // Reader has been cancelled
          break;
        }

        if (value) {
          this.processStreamChunk(value);
        }
      }
    } catch (err) {
      if (this.keepReading) {
        console.error('[WebSerial] Stream Read Error:', err);
        this.onError(err);
      }
    } finally {
      this.reader?.releaseLock();
    }
  }

  /**
   * Chunks incoming text and splits by newline into complete JSON lines
   */
  processStreamChunk(chunk) {
    this.lineBuffer += chunk;

    // Search for newline boundaries
    const lines = this.lineBuffer.split(/\r?\n/);
    // Keep the last incomplete fragment in the buffer
    this.lineBuffer = lines.pop();

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.length > 0) {
        this.onLineReceived(trimmed);
      }
    }
  }

  /**
   * Transmit command line to ESP32
   */
  async send(data) {
    if (!this.isConnected || !this.port?.writable) {
      throw new Error('Cannot write: Web Serial is not connected.');
    }

    const textEncoder = new TextEncoderStream();
    this.writableStreamClosed = textEncoder.readable.pipeTo(this.port.writable);
    const writer = textEncoder.writable.getWriter();

    await writer.write(data.endsWith('\n') ? data : data + '\n');
    writer.releaseLock();
  }

  /**
   * Gracefully close and release port
   */
  async disconnect(wasUnexpected = false) {
    this.keepReading = false;

    if (this.reader) {
      try {
        await this.reader.cancel();
      } catch (_) {}
    }

    if (this.port) {
      try {
        await this.port.close();
      } catch (e) {
        console.warn('[WebSerial] Port close warning:', e);
      }
      this.port = null;
    }

    this.isConnected = false;
    this.onStatusChange('DISCONNECTED', { unexpected: wasUnexpected });
  }
}

window.WebSerialManager = WebSerialManager;
