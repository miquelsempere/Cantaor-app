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
    this.canteQueue = []; // Indices barajados de canteVoices (filtrados por seleccion)
    this.canteQueuePos = 0;
    this.selectedVoiceIds = null; // null = todas; Set<id> = subconjunto elegido
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
    this.traste_groups = new Map(); // traste_number -> voice_id[]
    this.has_recorded_tempos = false;

    // Carga en background
    this._onVoiceLoadedCb = null;
    this._loadGen = 0;
    this.loadedVoicesCount = 0;

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
   * Carga en dos fases:
   *   Fase 1 (critica): decodifica solo los samples (o la base de palmas si no hay samples).
   *                     Devuelve en cuanto el play puede habilitarse.
   *   Fase 2 (fondo):   carga las voces de cante una a una; llama _onVoiceLoadedCb por progreso.
   */
  async load(palmasMeta, palmasUrl, canteVoicesMeta, samplesMeta) {
    this._loadGen += 1;
    const gen = this._loadGen;

    this.palmasMeta = palmasMeta;
    this.canteVoices = canteVoicesMeta;
    this.selectedVoiceIds = null;
    this.useSampler = false;
    this.canteBuffers.clear();
    this.loadedVoicesCount = 0;

    const rawInterval = (palmasMeta.beats_per_compas / palmasMeta.bpm) * 60;
    this.syncInterval = rawInterval / this.tempo;

    // Agrupar voces por traste/tempo (solo metadatos, sin buffers aun)
    this.traste_groups = new Map();
    this.has_recorded_tempos = false;
    canteVoicesMeta.forEach(v => {
      if (v.traste != null) {
        if (!this.traste_groups.has(v.traste)) this.traste_groups.set(v.traste, []);
        this.traste_groups.get(v.traste).push(v.id);
      }
      if (v.recorded_tempo != null) this.has_recorded_tempos = true;
    });

    // ── Fase critica ──────────────────────────────────────────────────────────
    if (samplesMeta && samplesMeta.fuerte1) {
      try {
        const entries = Object.entries(samplesMeta).filter(([, v]) => v);
        const decoded = await Promise.all(entries.map(([, url]) => this._fetchAndDecode(url)));
        if (gen !== this._loadGen) return { palmasOk: false, voicesCount: 0, usingSampler: false };
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

    if (!this.useSampler) {
      this.palmasBuffer = await this._fetchAndDecode(palmasUrl);
      if (gen !== this._loadGen) return { palmasOk: false, voicesCount: 0, usingSampler: false };
    }

    this._reshuffleQueue();

    // ── Fase fondo ────────────────────────────────────────────────────────────
    this._loadInBackground(this.useSampler ? null : palmasUrl, canteVoicesMeta, gen);

    return { palmasOk: true, voicesCount: 0, usingSampler: this.useSampler };
  }

  async _loadInBackground(palmasUrl, canteVoicesMeta, gen) {
    for (let i = 0; i < canteVoicesMeta.length; i++) {
      if (gen !== this._loadGen) return;
      const v = canteVoicesMeta[i];
      try {
        const buf = await this._fetchAndDecode(v.audio_url);
        if (gen !== this._loadGen) return;
        this.canteBuffers.set(v.id, buf);
        this.loadedVoicesCount++;
        if (this._onVoiceLoadedCb) {
          this._onVoiceLoadedCb(this.loadedVoicesCount, canteVoicesMeta.length);
        }
      } catch (e) {
        console.warn(`Voz ${v.id} no pudo cargarse:`, e);
      }
    }
  }

  onVoiceLoadProgress(cb) {
    this._onVoiceLoadedCb = cb;
  }

  async _fetchAndDecode(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Error cargando audio: ${res.statusText} (${url})`);
    const arrayBuffer = await res.arrayBuffer();
    return this.audioContext.decodeAudioData(arrayBuffer);
  }

  _reshuffleQueue() {
    const activeIndices = this._getActiveVoicePool();

    const indices = activeIndices.slice();
    for (let i = indices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }
    this.canteQueue = indices;
    this.canteQueuePos = 0;
  }

  _getActiveVoicePool() {
    if (this.traste_groups.size === 0) {
      return this.selectedVoiceIds
        ? this.canteVoices
            .map((v, i) => ({ v, i }))
            .filter(({ v }) => this.selectedVoiceIds.has(v.id))
            .map(({ i }) => i)
        : this.canteVoices.map((_, i) => i);
    }

    const targetTraste = this.pitchSemitones + 5;
    const available = Array.from(this.traste_groups.keys()).sort((a, b) => a - b);
    const nearest = available.reduce((prev, curr) =>
      Math.abs(curr - targetTraste) < Math.abs(prev - targetTraste) ? curr : prev
    );
    const groupIds = this.traste_groups.get(nearest);
    const groupVoices = this.canteVoices
      .map((v, i) => ({ v, i }))
      .filter(({ v }) => groupIds.includes(v.id));

    if (this.has_recorded_tempos) {
      const tempos = [...new Set(groupVoices.map(({ v }) => v.recorded_tempo).filter(t => t != null))];
      if (tempos.length > 0) {
        const nearestTempo = tempos.reduce((prev, curr) =>
          Math.abs(curr - this.tempo) < Math.abs(prev - this.tempo) ? curr : prev
        );
        return groupVoices
          .filter(({ v }) => v.recorded_tempo === nearestTempo)
          .map(({ i }) => i);
      }
    }

    return groupVoices.map(({ i }) => i);
  }

  // ─── Playback ────────────────────────────────────────────────────────────────

  async play() {
    if (this.isPlaying) return;
    if (!this.useSampler && !this.palmasBuffer) throw new Error('Carga el audio antes de reproducir.');

    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }

    this.isPlaying = true;
    this.falseta = false;
    this.palmasStartContextTime = this.audioContext.currentTime;

    // Arrancar palmas en loop
    this._startPalmasLoop();

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

    // Tiempo de anticipacion: compensa la latencia del ScriptProcessorNode (bufferSize=4096)
    // que introduce ~2-3 frames antes de que salga audio = ~279ms a 44100Hz.
    const PRELOAD_SEC = 0.15;
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
    if (this.canteQueue.length === 0) {
      // Ninguna voz seleccionada: solo palmas, reprogramar siguiente entrada
      const next = startContextTime + this.syncInterval;
      this._scheduleNextCante(next);
      return;
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
    // tempoRatio: velocidad real a aplicar al buffer para alcanzar this.tempo
    const tempoRatio = voice.recorded_tempo != null ? this.tempo / voice.recorded_tempo : this.tempo;
    const adjustedDuration = buffer.duration / tempoRatio;

    this.canteShifter = new PitchShifter(
      this.audioContext,
      buffer,
      4096,
      () => {
        // La pista ha terminado. Programar la siguiente en el proximo sync point
        // que venga despues de que acabe esta pista.
        if (!this.isPlaying || this.falseta) return;
        const endTime = startContextTime + adjustedDuration;
        const next = this._nextSyncPointAfter(endTime);
        this._scheduleNextCante(next);
      }
    );

    this.canteShifter.tempo = tempoRatio;
    this.canteShifter.pitchSemitones = voice.traste != null
      ? (this.pitchSemitones + 5) - voice.traste
      : this.pitchSemitones;
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

  /** Activar modo falseta: para el cante inmediatamente y no entra hasta reanudarCante() */
  activarFalseta() {
    this.falseta = true;
    if (this.canteShifter) {
      this.canteShifter.disconnect();
      this.canteShifter = null;
    }
    clearTimeout(this.canteScheduleTimer);
    const next = this._nextSyncPointAfter(this.audioContext.currentTime);
    this._scheduleNextCante(next);
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
    if (this.has_recorded_tempos) {
      this._reshuffleQueue();
    }
  }

  setPitchSemitones(semitones) {
    this.pitchSemitones = semitones;
    if (this.traste_groups.size > 0) {
      this._reshuffleQueue();
    }
  }

  /**
   * Restringe la rotacion de cante a los IDs indicados.
   * Pasar null restaura "todas las pistas"; un array vacio significa
   * ninguna voz (solo palmas).
   */
  setSelectedVoices(ids) {
    if (ids === null) {
      this.selectedVoiceIds = null;
    } else {
      this.selectedVoiceIds = new Set(ids);
    }
    this._reshuffleQueue();
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

  getDebugInfo() {
    return {
      currentTime: this.audioContext ? this.audioContext.currentTime : 0,
      nextSyncAt: this.nextCanteScheduledAt,
      syncInterval: this.syncInterval,
      palmasStartTime: this.palmasStartContextTime,
      bpm: this.palmasMeta ? this.palmasMeta.bpm : 0,
      beatsPerCompas: this.palmasMeta ? this.palmasMeta.beats_per_compas : 0,
      compassBeats: (this.useSampler && this.palmasSampler) ? this.palmasSampler.compassBeats : null,
      tempo: this.tempo,
      usingSampler: this.useSampler,
    };
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
