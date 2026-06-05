/*
 * PalmasSampler - Motor de palmas basado en samples individuales
 *
 * Cada palo define un compas con hits en posiciones absolutas (offset en beats
 * dentro del compas). Esto permite subdivisiones irregulares como el 2.5 de Tangos.
 *
 * beatInterval = segundos por beat (60/bpm/tempo)
 * Cada hit se programa en: compassStartTime + offset * beatInterval
 *
 * Hay 4 tipos de golpe: fuerte1, fuerte2, floja1, floja2.
 * Si una variante no esta subida, el sampler hace fallback automatico.
 *
 * Uso:
 *   const sampler = new PalmasSampler(audioContext, masterGainNode);
 *   sampler.loadSamples({ fuerte1: AudioBuffer, fuerte2: AudioBuffer, ... });
 *   sampler.configure('Tangos', bpm, tempo);
 *   sampler.start();
 *   sampler.stop();
 */

// Cada palo define compassBeats (duracion total del compas en beats) y un array
// de hits con { offset, hitType }. offset es 0-indexed en beats desde el inicio
// del compas; puede ser decimal para subdivisiones.
const PATTERNS = {
  Tangos: {
    compassBeats: 4,
    hits: [
      { offset: 1,   hitType: 'fuerte1' },
      { offset: 1.5, hitType: 'floja1'  },
      { offset: 2,   hitType: 'floja2'  },
      { offset: 3,   hitType: 'fuerte2' },
    ],
  },
  Bulerias: {
    compassBeats: 12,
    hits: [
      { offset: 0,  hitType: 'fuerte1' },
      { offset: 2,  hitType: 'floja1'  },
      { offset: 3,  hitType: 'fuerte2' },
      { offset: 5,  hitType: 'floja2'  },
      { offset: 6,  hitType: 'fuerte1' },
      { offset: 8,  hitType: 'floja1'  },
      { offset: 9,  hitType: 'fuerte2' },
      { offset: 11, hitType: 'floja2'  },
    ],
  },
  Rumba: {
    compassBeats: 4,
    hits: [
      { offset: 0, hitType: 'fuerte1' },
      { offset: 1, hitType: 'floja1'  },
      { offset: 2, hitType: 'fuerte2' },
      { offset: 3, hitType: 'floja2'  },
    ],
  },
};

// Orden de fallback: si un tipo no tiene sample, usar el siguiente de esta lista
const FALLBACK_ORDER = ['fuerte1', 'fuerte2', 'floja1', 'floja2'];

// Cuantos segundos por delante programamos compases
const LOOK_AHEAD_SEC = 0.25;
// Con que frecuencia revisamos si hay que programar mas compases (ms)
const SCHEDULE_INTERVAL_MS = 100;

export default class PalmasSampler {
  constructor(audioContext, outputNode) {
    this.audioContext = audioContext;
    this.outputNode = outputNode;

    this.samples = {};         // hit_type -> AudioBuffer
    this.hits = [];            // array de { offset, hitType }
    this.compassBeats = 4;     // duracion del compas en beats
    this.beatInterval = 0;     // segundos por beat

    this.isPlaying = false;
    this._scheduledSources = [];
    this._scheduleTimer = null;
    this._nextCompasTime = 0;
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
    const pattern = PATTERNS[palo] || PATTERNS.Tangos;
    this.hits = pattern.hits;
    this.compassBeats = pattern.compassBeats;
    this.beatInterval = (60 / bpm) / tempo;
  }

  /**
   * Devuelve true si hay al menos fuerte1 disponible para arrancar el sampler.
   */
  static hasMinimumSamples(samples) {
    return samples && samples.fuerte1 instanceof AudioBuffer;
  }

  start() {
    if (this.isPlaying || this.hits.length === 0 || !this.samples.fuerte1) return;
    this.isPlaying = true;
    this.startedAt = this.audioContext.currentTime;
    this._nextCompasTime = this.startedAt;
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
    while (this._nextCompasTime < horizon) {
      const compassStart = this._nextCompasTime;
      this.hits.forEach(({ offset, hitType }) => {
        this._scheduleBeat(compassStart + offset * this.beatInterval, hitType);
      });
      this._nextCompasTime += this.compassBeats * this.beatInterval;
    }

    this._scheduleTimer = setTimeout(() => this._scheduleAhead(), SCHEDULE_INTERVAL_MS);
  }

  _scheduleBeat(time, hitType) {
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
    const start = FALLBACK_ORDER.indexOf(hitType);
    for (let i = start + 1; i < FALLBACK_ORDER.length; i++) {
      if (this.samples[FALLBACK_ORDER[i]]) return this.samples[FALLBACK_ORDER[i]];
    }
    return this.samples.fuerte1 || null;
  }
}
