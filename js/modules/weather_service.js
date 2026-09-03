/**
 * ============================================================================
 * CAN-SAT WEATHER SERVICE (OPEN-METEO API & W3C GEOLOCATION)
 * Queries real-world meteorological data (wind speed, wind direction,
 * ambient temperature, and barometric surface pressure) based on the
 * user's physical GPS location or launch site.
 * ============================================================================
 */

class WeatherService {
  constructor() {
    this.cachedWeather = null;
  }

  /**
   * Request device latitude and longitude via browser Geolocation API
   * @returns {Promise<{ latitude: number, longitude: number }>}
   */
  async getCurrentPosition() {
    if (!('geolocation' in navigator)) {
      throw new Error('La API de Geolocalización no está soportada en este navegador.');
    }

    return new Promise((resolve, reject) => {
      const options = {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 60000
      };

      navigator.geolocation.getCurrentPosition(
        (position) => {
          resolve({
            latitude: Number(position.coords.latitude.toFixed(4)),
            longitude: Number(position.coords.longitude.toFixed(4))
          });
        },
        (error) => {
          let msg = 'Error desconocido al obtener ubicación.';
          switch (error.code) {
            case error.PERMISSION_DENIED:
              msg = 'Permiso de ubicación denegado por el usuario o navegador.';
              break;
            case error.POSITION_UNAVAILABLE:
              msg = 'La señal de ubicación GPS no está disponible.';
              break;
            case error.TIMEOUT:
              msg = 'Tiempo de espera agotado al consultar el GPS.';
              break;
          }
          reject(new Error(msg));
        },
        options
      );
    });
  }

  /**
   * Query Open-Meteo free API for real-time wind speed (m/s) and direction (deg)
   * @param {number} latitude
   * @param {number} longitude
   */
  async fetchWeatherData(latitude, longitude) {
    // Open-Meteo provides free, keyless, CORS-enabled WMO meteorological data
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=wind_speed_10m,wind_direction_10m,temperature_2m,surface_pressure&wind_speed_unit=ms`;

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Error en el servidor meteorológico: HTTP ${response.status}`);
    }

    const data = await response.json();
    const current = data.current;

    if (!current) {
      throw new Error('Respuesta meteorológica incompleta o no disponible.');
    }

    const result = {
      latitude: latitude,
      longitude: longitude,
      windSpeed_mps: Number((current.wind_speed_10m || 0).toFixed(1)),
      windDirection_deg: Math.round(current.wind_direction_10m || 0),
      temperature_c: Number((current.temperature_2m || 15.0).toFixed(1)),
      surfacePressure_hpa: Number((current.surface_pressure || 1013.25).toFixed(1)),
      timestamp: current.time
    };

    this.cachedWeather = result;
    return result;
  }

  /**
   * Helper to fetch both position and current weather in one single call
   */
  async getLocalWeather() {
    const coords = await this.getCurrentPosition();
    return await this.fetchWeatherData(coords.latitude, coords.longitude);
  }

  /**
   * Convert wind direction degrees into Cardinal point (N, NE, E, SE, S, SW, W, NW)
   */
  static degreesToCardinal(deg) {
    const cardinals = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
    const idx = Math.round((deg % 360) / 22.5) % 16;
    return cardinals[idx];
  }
}

window.WeatherService = new WeatherService();
