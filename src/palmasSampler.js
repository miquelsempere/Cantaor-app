/*
 * PalmasSampler - Motor de palmas basado en samples individuales
 *
 * Reemplaza el PitchShifter para la pista de palmas. En lugar de estirar
 * un audio largo (que distorsiona los ataques percusivos), dispara samples
 * cortos de golpes individuales usando AudioBufferSourceNode nativo.
 *
 * Cada golpe se programa con audioContext.currentTime + offset para precision
 * sample-accurate, sin necesidad de SoundTouch.
 *
 * Hay 4 tipos de golpe: fuerte1, fuerte2, floja1, floja2.
 * El patron alterna entre variantes del mismo tipo para evitar el efecto
 * "metrónomo de muñeca" (mismo sample dos veces seguidas).
 *
 * Si una variante no esta subida, el sampler hace fallback automatico:
 *   fuerte2 -> fuerte1 | floja1 -> fuerte1 | floja2 -> floja1 ?? fuerte1
 *
 * Uso:
 *   const sampler = new PalmasSampler(audioContext, masterGainNode);
 *   sampler.loadSamples({ fuerte1: AudioBuffer, fuerte2: AudioBuffer, ... });
 *   sampler.configure('Tangos', bpm, tempo);
 *   sampler.start();
 *   sampler.stop();
 */

// Patron de tiempos por palo. Cada elemento es un hit_type o null (silencio).
// La alternancia fuerte1/fuerte2 y floja1/floja2 humaniza el ritmo.
const PATTERNS = {
  Tangos:   ['fuerte1', 'floja1', 'fuerte2', 'floja2', 'fuerte1', 'floja1', 'fuerte2', 'floja2'],
  Bulerias: ['fuerte1', null, 'floja1', 'fuerte2', null, 'floja2', 'fuerte1', null, 'floja1', 'fuerte2', null, 'floja2'],
  Rumba:    ['fuerte1', 'floja1', 'fuerte2', 'floja2'],
};

// Orden de fallback: si un tipo no tiene sample, usar el siguiente de esta lista
const FALLBACK_ORDER = ['fuerte1', 'fuerte2', 'floja1', 'floja2'];

// Cuantos segundos por delante programamos golpes
const LOOK_AHEAD_SEC = 0.25;
// Con que frecuencia revisamos si hay que programar mas golpes (ms)
const SCHEDULE_INTERVAL_MS = 100;

export default class PalmasSampler {
  constructor(audioContext, outputNode) {
    this.audioContext = audioContext;
    this.outputNode = outputNode;

    this.samples = {};        // hit_type -> AudioBuffer
    this.pattern = [];        // array de hit_type strings o null
    this.beatInterval = 0;    // segundos entre golpes

    this.isPlaying = false;
    this._scheduledSources = [];
    this._scheduleTimer = null;
    this._nextBeatTime = 0;
    this._beatIndex = 0;
  }

  /**
   * Carga los AudioBuffers decodificados de los samples.
   * @param {Object} samples  { fuerte1: AudioBuffer, fuerte2: AudioBuffer, floja1: AudioBuffer, floja2: AudioBuffer }
   */
  loadSamples(samples) {
    this.samples = samples;
  }

  /**
   * Configura el palo, BPM y ratio de tempo antes de arrancar.
   * @param {string} palo    Nombre del palo (debe coincidir con las claves de PATTERNS)
   * @param {number} bpm     Pulsos por minuto de la pista de palmas
   * @param {number} tempo   Ratio de velocidad (1.0 = normal, 0.8 = 20% mas lento)
   */
  configure(palo, bpm, tempo) {
    this.pattern = PATTERNS[palo] || PATTERNS.Tangos;
    this.beatInterval = (60 / bpm) / tempo;
  }

  /**
   * Devuelve true si hay al menos fuerte1 disponible para arrancar el sampler.
   */
  static hasMinimumSamples(samples) {
    return samples && samples.fuerte1 instanceof AudioBuffer;
  }

  start() {
    if (this.isPlaying || this.pattern.length === 0 || !this.samples.fuerte1) return;
    this.isPlaying = true;
    this._beatIndex = 0;
    this._nextBeatTime = this.audioContext.currentTime;
    this._scheduleAhead();
  }

  stop() {
    this.isPlaying = false;
    clearTimeout(this._scheduleTimer);
    this._scheduledSources.forEach(src => {
      try { src.stop(); src.disconnect(); } catch (_) {}
    });
    this._scheduledSources = [];
  }

  destroy() {
    this.stop();
  }

  // ─── Scheduler interno ────────────────────────────────────────────────────

  _scheduleAhead() {
    if (!this.isPlaying) return;

    const horizon = this.audioContext.currentTime + LOOK_AHEAD_SEC;
    while (this._nextBeatTime < horizon) {
      this._scheduleBeat(this._nextBeatTime, this.pattern[this._beatIndex]);
      this._beatIndex = (this._beatIndex + 1) % this.pattern.length;
      this._nextBeatTime += this.beatInterval;
    }

    this._scheduleTimer = setTimeout(() => this._scheduleAhead(), SCHEDULE_INTERVAL_MS);
  }

  _scheduleBeat(time, hitType) {
    if (!hitType) return;
    const buffer = this._resolveBuffer(hitType);
    if (!buffer) return;

    const src = this.audioContext.createBufferSource();
    src.buffer = buffer;
    src.connect(this.outputNode);
    src.start(time);

    this._scheduledSources.push(src);
    src.onended = () => {
      const idx = this._scheduledSources.indexOf(src);
      if (idx !== -1) this._scheduledSources.splice(idx, 1);
      src.disconnect();
    };
  }

  // Resuelve el buffer con fallback: busca el primer tipo disponible en FALLBACK_ORDER
  // a partir del tipo pedido.
  _resolveBuffer(hitType) {
    if (this.samples[hitType]) return this.samples[hitType];
    // Fallback: recorrer el orden de fallback desde la posicion del tipo pedido
    const start = FALLBACK_ORDER.indexOf(hitType);
    for (let i = start + 1; i < FALLBACK_ORDER.length; i++) {
      if (this.samples[FALLBACK_ORDER[i]]) return this.samples[FALLBACK_ORDER[i]];
    }
    // Ultimo recurso: fuerte1
    return this.samples.fuerte1 || null;
  }
}
