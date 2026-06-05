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
 * El patron de cada palo define que tipo de golpe va en cada tiempo del compas.
 * El intervalo entre golpes se calcula como: (60 / bpm) / tempo
 *
 * Uso:
 *   const sampler = new PalmasSampler(audioContext, masterGainNode);
 *   sampler.loadSamples({ fuerte: AudioBuffer, suave: AudioBuffer });
 *   sampler.configure('Tangos', bpm, tempo);
 *   sampler.start();
 *   sampler.stop();
 */

// Patron de tiempos por palo. Cada elemento es un hit_type o null (silencio).
const PATTERNS = {
  Tangos:   ['fuerte', 'suave', 'fuerte', 'suave', 'fuerte', 'suave', 'fuerte', 'suave'],
  Bulerias: ['fuerte', null,    'suave',  'fuerte', null,    'suave',  'fuerte', null,   'suave', 'fuerte', null, 'suave'],
  Rumba:    ['fuerte', 'suave', 'fuerte', 'suave'],
};

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
   * @param {Object} samples  { fuerte: AudioBuffer, suave: AudioBuffer, sorda: AudioBuffer }
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
   * Devuelve true si este sampler tiene los samples minimos para el palo dado.
   * Se necesita al menos el sample 'fuerte'. Suave y sorda son opcionales
   * (si faltan, se usa 'fuerte' como fallback para ese tiempo).
   */
  static hasMinimumSamples(samples, palo) {
    return samples && samples.fuerte instanceof AudioBuffer;
  }

  start() {
    if (this.isPlaying || this.pattern.length === 0 || !this.samples.fuerte) return;
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
    // Fallback: si el sample especifico no esta disponible, usar 'fuerte'
    const buffer = this.samples[hitType] || this.samples.fuerte;
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
}
