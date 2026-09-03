# CanSat Ground Station & Tactical Simulator (Web-Sim)

Plataforma táctica de telemetría y simulación de alta fidelidad para misiones **CanSat**, ejecutable directamente en el navegador web con arquitectura de **cero fricción** (Vanilla HTML5 / CSS3 / JavaScript ES6+ sin compiladores externos ni dependencias pesadas).

Optimizado para monitores **4K**, estaciones multimonitor y entornos de alta demanda analítica.

---

## 🚀 Modalidades de Operación

### 1. SITL (Software-in-the-Loop) - Simulación Virtual
- **Motor de Físicas Aislado:** Simulación de mecánica de vuelo bajo gravedad controlada ($g = 9.80665 \text{ m/s}^2$).
- **Modelo Atmosférico:** Cálculo barométrico exponencial y gradiente térmico de temperatura (-6.5 °C / km).
- **Aerodinámica y Paracaídas:** Fases de rampa, ascenso, apogeo, caída libre y desaceleración aerodinámica a velocidad terminal tras el despliegue del paracaídas.
- **Inyección de Varianza y Ruido Gaussiano:** Simulación de fluctuaciones y jitter realistas en sensores BMP280 y atenuación de enlace LoRa RF.
- **Inyección Manual de Anomalías:** Prueba la respuesta de la estación ante fallo de despliegue de paracaídas, picos de presión barométrica o pérdida de enlace RF.

### 2. HITL (Hardware-in-the-Loop) - Telemetría Real ESP32
- **Conexión Directa Web Serial API:** Enlace directo por USB Serial a 115200 baudios con microcontrolador **ESP32** (o receptores LoRa SX1276/SX1278).
- **Decodificación Asíncrona:** Streaming de texto por chunks con ensamblado de líneas y parsing estricto de paquetes JSON.
- **Integridad de Datos:** Aislamiento total entre telemetría y UI; los datos erróneos o anómalos se visualizan tal cual sin asistencias artificiales.
- **Consola Serial Integrada:** Monitor interactivo para inspeccionar tramas crudas y enviar comandos al hardware.

---

## 📡 Especificación del Paquete de Telemetría (JSON)

El sistema espera el siguiente esquema de datos estructurado por cada paquete recibido:

```json
{
  "timestamp": 1725324500,
  "status": "NOMINAL",
  "sensors": {
    "bmp280": {
      "temp_c": 22.4,
      "pressure_hpa": 1012.5,
      "altitude_m": 254.3
    },
    "telemetry": {
      "rssi_lora": -45,
      "snr": 9.2,
      "grid_ref": "34N 56E"
    }
  }
}
```

---

## 🖥️ Módulos de la Estación Terrena

| Módulo | Descripción |
|---|---|
| **Instrumentos Analógicos** | Altímetro barométrico de aviación (doble aguja de 100m y 1000m), manómetro barométrico en hPa, termómetro y barras de calidad de señal LoRa (RSSI / SNR). |
| **Osciloscopio / Gráficos 60 FPS** | Strip charts renderizados en Canvas 2D nativo con autoescalado dinámico de altitud y presión ambiental. |
| **Radar Táctico 2D & Grilla** | Pantalla de barrido polar/cartesiano, tracking de deriva por viento, elipse de aterrizaje calculada y horizonte artificial de inercia. |
| **Tabla de Datos en Bruto** | Visualizador de paquetes en tiempo real con filtrado, detector de anomalías, inspección JSON e importador/exportador a formatos **CSV** y **JSON**. |
| **Audio Sensorial Diegético** | Sintetizador de audio con Web Audio API: blips de telemetría y alarmas de anomalía con paneo espacial direccional según el azimut del CanSat. |
| **Soporte Multipantalla 4K** | Botón de desacople (`⧉`) en cada panel para abrir ventanas independientes nativas sincronizadas a 60 FPS mediante `BroadcastChannel API`. |

---

## 🛠️ Código de Ejemplo para ESP32 (Arduino / PlatformIO)

Puedes flashear el siguiente sketch en tu microcontrolador ESP32 para transmitir paquetes compatibles por el puerto serial:

```cpp
#include <Arduino.h>

void setup() {
  Serial.begin(115200);
  while (!Serial) { delay(10); }
}

void loop() {
  static unsigned long lastSend = 0;
  if (millis() - lastSend >= 500) { // 2 Hz
    lastSend = millis();

    // Ejemplo de telemetría:
    unsigned long ts = millis() / 1000;
    float temp = 22.4 + ((random(-5, 5)) * 0.1);
    float press = 1012.5 + ((random(-10, 10)) * 0.1);
    float alt = 250.0 + ((random(-20, 20)) * 0.1);
    int rssi = -45 + random(-3, 3);
    float snr = 9.2 + ((random(-5, 5)) * 0.1);

    // Formato JSON riguroso en una sola línea terminada en \n:
    Serial.printf(
      "{\"timestamp\":%lu,\"status\":\"NOMINAL\",\"sensors\":{\"bmp280\":{\"temp_c\":%.1f,\"pressure_hpa\":%.1f,\"altitude_m\":%.1f},\"telemetry\":{\"rssi_lora\":%d,\"snr\":%.1f,\"grid_ref\":\"34N 56E\"}}}\n",
      ts, temp, press, alt, rssi, snr
    );
  }
}
```

---

## ⚡ Ejecución Rápida

1. Abre `index.html` en cualquier navegador moderno (recomendado **Google Chrome** o **Microsoft Edge** para soporte completo de la Web Serial API).
2. El sistema iniciará automáticamente en modo **SITL** para simular un vuelo virtual.
3. Para conectar tu hardware real, cambia al modo **MODO HITL (ESP32)** y presiona **CONECTAR ESP32 (SERIAL)**.
