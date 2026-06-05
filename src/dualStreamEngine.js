/*
 * DualStreamEngine - Motor de audio dual para el Modo Ensayo
 *
 * Gestiona dos streams de audio simultaneos y sincronizados:
 *   1. Palmas: pista larga en loop continuo (base ritmica)
 *   2. Cante: pistas de voz cortas que entran en sync points calculados matematicamente
 *
 * Los sync points son puntos exactos en el tiempo donde el cante puede entrar
 * alineado con el compas. Se calculan como:
 *   intervalo = (beats_per_compas / bpm) * 60  [segundos]
 *
 * Ejemplo Tangos a 140 BPM, 8 tiempos:
 *   intervalo = (8 / 140) * 60 = 3.4286 seg
 *
 * La precision de scheduling usa audioContext.currentTime, que es sample-accurate.
 * Ambos streams comparten el mismo AudioContext y GainNode de salida.
 *
 * Modo falseta: se cancela la proxima entrada de cante. Las palmas siguen sonando.
 * Modo vamos alla: se reactiva la cola de cante en el siguiente sync point.
 *
 * Tempo y tono se configuran ANTES de iniciar la reproduccion y quedan bloqueados.
 * Esto garantiza que los sync points sean precisos durante toda la sesion.
 */

import { PitchShifter } from './index.js';
import PalmasSampler from './palmasSampler.js';

export default class DualStreamEngine {
  constructor() {
    this.audioContext = null;
    this.masterGain = null;

    // Palmas stream
    this.palmasBuffer = null;
    this.palmasShifter = null;
    this.palmasMeta = null; // { bpm, beats_per_compas, duration }

    // Sampler (reemplaza palmasShifter cuando hay samples disponibles)
    this.palmasSampler = null;
    this.useSampler = false;

    // Cante stream
    this.canteVoices = []; // Metadatos de pistas de voz
    this.canteBuffers = new Map(); // id -> AudioBuffer
    this.canteQueue = []; // Indices barajados de canteVoices
    this.canteQueuePos = 0;
    this.canteShifter = null;
    this.nextCanteScheduledAt = null; // audioContext.currentTime cuando entra la proxima pista
    this.canteScheduleTimer = null;

    // Sync points
    this.syncInterval = 0; // Segundos entre puntos de entrada (ajustados por tempo)
    this.palmasStartContextTime = null; // audioContext.currentTime cuando arranco palmas

    // Estado
    this.isPlaying = false;
    this.falseta = false; // true = no entrar cante
    this.tempo = 1.0;
    this.pitchSemitones = 0;

    // Callbacks
    this.onCanteEnterListeners = [];
    this.onStateChangeListeners = [];

    this._initAudioContext();
  }

  _initAudioContext() {
    this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    this.masterGain = this.audioContext.createGain();
    this.masterGain.connect(this.audioContext.destination);
  }

  // ─── Carga ───────────────────────────────────────────────────────────────────

  /**
   * Carga y decodifica la pista de palmas y todas las voces del palo.
   * Acepta opcionalmente samplesMeta ({ fuerte, suave, sorda } con audio_url) para
   * activar el motor sampler en lugar del PitchShifter.
   * Llama a esto antes de play(). Devuelve { palmasOk, voicesCount, usingsampler }.
   */
  async load(palmasMeta, palmasUrl, canteVoicesMeta, samplesMeta) {
    this.palmasMeta = palmasMeta;
    this.canteVoices = canteVoicesMeta;
    this.useSampler = false;

    // Calcular intervalo de sync points aplicando el ratio de tempo
    const rawInterval = (palmasMeta.beats_per_compas / palmasMeta.bpm) * 60;
    this.syncInterval = rawInterval / this.tempo;

    // Decodificar voces y palmas base en paralelo
    const [palmasBuffer, ...voiceBuffers] = await Promise.all([
      this._fetchAndDecode(palmasUrl),
      ...canteVoicesMeta.map(v => this._fetchAndDecode(v.audio_url)),
    ]);

    this.palmasBuffer = palmasBuffer;
    canteVoicesMeta.forEach((v, i) => {
      this.canteBuffers.set(v.id, voiceBuffers[i]);
    });

    // Intentar cargar sampler si se proporcionaron samples
    if (samplesMeta && samplesMeta.fuerte1) {
      try {
        const entries = Object.entries(samplesMeta).filter(([, v]) => v);
        const decoded = await Promise.all(entries.map(([, url]) => this._fetchAndDecode(url)));
        const sampleBuffers = {};
        entries.forEach(([hitType], i) => { sampleBuffers[hitType] = decoded[i]; });

        if (!this.palmasSampler) {
          this.palmasSampler = new PalmasSampler(this.audioContext, this.masterGain);
        }
        this.palmasSampler.loadSamples(sampleBuffers);
        this.palmasSampler.configure(palmasMeta.palo || palmasMeta.title, palmasMeta.bpm, this.tempo);
        this.useSampler = PalmasSampler.hasMinimumSamples(sampleBuffers);
      } catch (e) {
        console.warn('PalmasSampler: error cargando samples, usando audio base:', e);
        this.useSampler = false;
      }
    }

    // Crear cola barajada de voces
    this._reshuffleQueue();

    return { palmasOk: !!palmasBuffer, voicesCount: canteVoicesMeta.length, usingSampler: this.useSampler };
  }

  async _fetchAndDecode(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Error cargando audio: ${res.statusText} (${url})`);
    const arrayBuffer = await res.arrayBuffer();
    return this.audioContext.decodeAudioData(arrayBuffer);
  }

  _reshuffleQueue() {
    const indices = this.canteVoices.map((_, i) => i);
    for (let i = indices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }
    this.canteQueue = indices;
    this.canteQueuePos = 0;
  }

  // ─── Playback ────────────────────────────────────────────────────────────────

  async play() {
    if (this.isPlaying) return;
    if (!this.palmasBuffer) throw new Error('Carga el audio antes de reproducir.');

    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }

    this.isPlaying = true;
    this.falseta = false;
    this.palmasStartContextTime = this.audioContext.currentTime;

    // Arrancar palmas en loop
    this._startPalmasLoop();

    // Con el sampler, anclar palmasStartContextTime al instante exacto que
    // registró el sampler, para que los sync points del cante estén alineados
    // con los compases generados.
    if (this.useSampler && this.palmasSampler) {
      this.palmasStartContextTime = this.palmasSampler.startedAt;
    }

    // Programar primera entrada de cante
    if (this.canteVoices.length > 0) {
      this._scheduleNextCante(this.palmasStartContextTime + this.syncInterval);
    }

    this._notifyState();
  }

  stop() {
    if (!this.isPlaying) return;
    this.isPlaying = false;

    clearTimeout(this.canteScheduleTimer);
    this.canteScheduleTimer = null;

    if (this.palmasSampler) {
      this.palmasSampler.stop();
    }
    if (this.palmasShifter) {
      this.palmasShifter.disconnect();
      this.palmasShifter = null;
    }
    if (this.canteShifter) {
      this.canteShifter.disconnect();
      this.canteShifter = null;
    }

    this.nextCanteScheduledAt = null;
    this.palmasStartContextTime = null;
    this._notifyState();
  }

  // ─── Palmas loop ─────────────────────────────────────────────────────────────

  _startPalmasLoop() {
    if (this.useSampler && this.palmasSampler) {
      this.palmasSampler.start();
      return;
    }

    if (this.palmasShifter) {
      this.palmasShifter.disconnect();
    }

    this.palmasShifter = new PitchShifter(
      this.audioContext,
      this.palmasBuffer,
      4096,
      () => {
        if (!this.isPlaying) return;
        // Al terminar la pista de palmas, volver a empezar inmediatamente
        this.palmasStartContextTime = this.audioContext.currentTime;
        this._startPalmasLoop();
      }
    );

    this.palmasShifter.tempo = this.tempo;
    this.palmasShifter.pitchSemitones = this.pitchSemitones;
    this.palmasShifter.connect(this.masterGain);
  }

  // ─── Scheduler de cante ──────────────────────────────────────────────────────

  /**
   * Programa la entrada del siguiente bloque de cante en whenContextTime.
   * Si falseta esta activo, salta esa entrada y programa la siguiente.
   */
  _scheduleNextCante(whenContextTime) {
    if (!this.isPlaying) return;

    // Tiempo de anticipacion: empezamos a reproducir el cante 50ms antes para
    // que el PitchShifter haya procesado suficientes frames.
    const PRELOAD_SEC = 0.05;
    const now = this.audioContext.currentTime;
    const delay = (whenContextTime - PRELOAD_SEC - now) * 1000;

    this.nextCanteScheduledAt = whenContextTime;
    this.canteScheduleTimer = setTimeout(() => {
      if (!this.isPlaying) return;

      if (this.falseta) {
        // Modo falseta: no entra cante, programar el siguiente sync point
        const next = whenContextTime + this.syncInterval;
        this._scheduleNextCante(next);
        return;
      }

      this._playCantePista(whenContextTime);
    }, Math.max(0, delay));
  }

  _playCantePista(startContextTime) {
    // Obtener siguiente voz de la cola
    if (this.canteQueuePos >= this.canteQueue.length) {
      this._reshuffleQueue();
    }
    const voiceIdx = this.canteQueue[this.canteQueuePos++];
    const voice = this.canteVoices[voiceIdx];
    const buffer = this.canteBuffers.get(voice.id);

    if (!buffer) {
      // Buffer no disponible, saltar al siguiente sync point
      const next = startContextTime + this.syncInterval;
      this._scheduleNextCante(next);
      return;
    }

    // Desconectar cante anterior si aun estaba sonando (crossfade instantaneo)
    if (this.canteShifter) {
      this.canteShifter.disconnect();
      this.canteShifter = null;
    }

    // Crear nuevo PitchShifter para esta voz
    // La duracion real de la pista en tiempo ajustado por tempo
    const adjustedDuration = buffer.duration / this.tempo;

    this.canteShifter = new PitchShifter(
      this.audioContext,
      buffer,
      4096,
      () => {
        // La pista ha terminado. Programar la siguiente en el proximo sync point
        // que venga despues de que acabe esta pista.
        if (!this.isPlaying) return;
        const endTime = startContextTime + adjustedDuration;
        const next = this._nextSyncPointAfter(endTime);
        this._scheduleNextCante(next);
      }
    );

    this.canteShifter.tempo = this.tempo;
    this.canteShifter.pitchSemitones = this.pitchSemitones;
    this.canteShifter.connect(this.masterGain);

    this._notifyCanteEnter(voice);
  }

  /**
   * Calcula el proximo sync point (en audioContext.currentTime) despues de afterTime.
   * Los sync points son multiples enteros del intervalo desde que arrancaron las palmas.
   */
  _nextSyncPointAfter(afterTime) {
    if (!this.palmasStartContextTime) return afterTime + this.syncInterval;
    const elapsed = afterTime - this.palmasStartContextTime;
    const nextMultiple = Math.ceil(elapsed / this.syncInterval);
    return this.palmasStartContextTime + nextMultiple * this.syncInterval;
  }

  // ─── Comandos de voz ─────────────────────────────────────────────────────────

  /** Activar modo falseta: el cante no entra hasta que se llame a reanudarCante() */
  activarFalseta() {
    this.falseta = true;
    this._notifyState();
  }

  /** Desactivar modo falseta: el cante vuelve a entrar en el siguiente sync point */
  reanudarCante() {
    if (!this.falseta) return;
    this.falseta = false;

    // Cancelar el timer anterior y reprogramar inmediatamente al siguiente punto
    clearTimeout(this.canteScheduleTimer);
    const next = this._nextSyncPointAfter(this.audioContext.currentTime);
    this._scheduleNextCante(next);

    this._notifyState();
  }

  // ─── Configuracion (antes de play) ───────────────────────────────────────────

  setTempo(tempo) {
    this.tempo = tempo;
    if (this.palmasMeta) {
      const rawInterval = (this.palmasMeta.beats_per_compas / this.palmasMeta.bpm) * 60;
      this.syncInterval = rawInterval / tempo;
    }
    if (this.useSampler && this.palmasSampler && this.palmasMeta) {
      this.palmasSampler.beatInterval = (60 / this.palmasMeta.bpm) / tempo;
    }
  }

  setPitchSemitones(semitones) {
    this.pitchSemitones = semitones;
  }

  setVolume(vol) {
    if (this.masterGain) {
      this.masterGain.gain.value = Math.max(0, Math.min(1, vol));
    }
  }

  // ─── Eventos ─────────────────────────────────────────────────────────────────

  onCanteEnter(cb) { this.onCanteEnterListeners.push(cb); }
  onStateChange(cb) { this.onStateChangeListeners.push(cb); }

  _notifyCanteEnter(voice) {
    this.onCanteEnterListeners.forEach(cb => {
      try { cb(voice); } catch (e) { /* silencio */ }
    });
  }

  _notifyState() {
    const state = { isPlaying: this.isPlaying, falseta: this.falseta };
    this.onStateChangeListeners.forEach(cb => {
      try { cb(state); } catch (e) { /* silencio */ }
    });
  }

  // ─── Info ─────────────────────────────────────────────────────────────────────

  getState() {
    return { isPlaying: this.isPlaying, falseta: this.falseta };
  }

  destroy() {
    this.stop();
    if (this.palmasSampler) {
      this.palmasSampler.destroy();
      this.palmasSampler = null;
    }
    if (this.audioContext) this.audioContext.close();
    this.canteBuffers.clear();
    this.onCanteEnterListeners = [];
    this.onStateChangeListeners = [];
  }
}
