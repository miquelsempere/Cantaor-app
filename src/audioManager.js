/*
 * Audio Manager completo — scheduling preciso y preload del siguiente track
 */

import { PitchShifter } from './index.js';
import { canteTracksAPI } from './supabaseClient.js';

export default class AudioManager {
  constructor() {
    // WebAudio
    this.audioContext = null;
    this.gainNode = null;

    // Estado de reproducción
    this.isPlaying = false;
    this.currentPalo = null;

    // Pistas y cola
    this.tracks = [];           // array de objetos track { id, title, audio_url, ... }
    this.playQueue = [];        // array de índices dentro de this.tracks (barajada)
    this.currentQueuePosition = 0; // posición (0..N-1) dentro de playQueue que corresponde a la pista "actual programada"

    // Caching y scheduling
    this.audioBuffers = new Map();  // track.id -> AudioBuffer
    this.scheduled = new Map();     // queuePos -> { startTime, endTime, pitchShifter, source, timers... }

    // Preferencias de timing
    this.startLatency = 0.05;    // segundos: pequeña latencia inicial para poder programar en el futuro
    this.preloadLeadTime = 0.6;  // segundos: tiempo mínimo antes del fin del track para asegurarnos de preload+crear siguiente

    // Pitch/tempo global (si usas PitchShifter debes aplicarlo cuando crees la instancia)
    this.globalTempo = 1.0;
    this.globalPitchSemitones = 0;

    // Listeners
    this.onTrackChangeListeners = [];
    this.onPlayStateChangeListeners = [];

    // Volumen
    this.currentVolume = 0.8;

    // Inicializar contexto
    this.initializeAudioContext();
  }

  /* --------------- Inicialización --------------- */
  initializeAudioContext() {
    try {
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      this.gainNode = this.audioContext.createGain();
      this.gainNode.connect(this.audioContext.destination);
      this.gainNode.gain.setValueAtTime(this.currentVolume, this.audioContext.currentTime);
      console.log('Audio context inicializado');
    } catch (err) {
      console.error('No se pudo inicializar AudioContext:', err);
      throw err;
    }
  }

  /* --------------- Carga de pistas --------------- */
  async loadPalo(palo) {
    try {
      console.log(`Loading tracks for palo: ${palo}`);
      this.tracks = await canteTracksAPI.getTracksByPalo(palo); // espera que devuelva [{id, title, audio_url}, ...]
      if (!this.tracks || this.tracks.length === 0) {
        throw new Error(`No tracks found for palo: ${palo}`);
      }
      this.currentPalo = palo;
      this.createPlayQueue();
      this.currentQueuePosition = 0;

      // Preload first two tracks for seguridad
      await this.preloadTrack(this.playQueue[0]);
      const second = (this.playQueue.length > 1) ? this.playQueue[1] : this.playQueue[0];
      this.preloadTrack(second).catch(() => {/* no bloquee si falla aquí */});

      console.log(`Loaded ${this.tracks.length} tracks for ${palo}`);
      return this.tracks.length;
    } catch (err) {
      console.error('Error loadPalo:', err);
      throw err;
    }
  }

  createPlayQueue() {
    const indices = Array.from({ length: this.tracks.length }, (_, i) => i);
    for (let i = indices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }
    this.playQueue = indices;
    this.currentQueuePosition = 0;
    console.log('Play queue creada:', this.playQueue);
  }

  /* --------------- Preload / Decodificado --------------- */
  async preloadTrack(trackIndex) {
    // trackIndex es índice dentro de this.tracks (no queuePos)
    if (trackIndex == null || trackIndex < 0 || trackIndex >= this.tracks.length) return;
    const track = this.tracks[trackIndex];
    if (!track) return;
    if (this.audioBuffers.has(track.id)) return; // ya cached

    try {
      console.log('Preloading:', track.title || track.id);
      const resp = await fetch(track.audio_url);
      if (!resp.ok) throw new Error('fetch failed: ' + resp.status);
      const arrayBuffer = await resp.arrayBuffer();
      const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
      this.audioBuffers.set(track.id, audioBuffer);
      console.log('Preloaded:', track.title || track.id);
      return audioBuffer;
    } catch (err) {
      console.warn('Error preloading track', track.title, err);
      throw err;
    }
  }

  preloadNextTrack() {
    // Intenta precargar la siguiente pista en la cola
    const nextQueuePos = (this.currentQueuePosition + 1) % this.playQueue.length;
    const nextTrackIndex = this.playQueue[nextQueuePos];
    return this.preloadTrack(nextTrackIndex).catch(err => {
      console.warn('preloadNextTrack failed:', err);
    });
  }

  /* --------------- Reproducción --------------- */
  async play() {
    if (!this.currentPalo || !this.tracks.length) {
      throw new Error('No palo loaded. Call loadPalo() first.');
    }
    if (this.isPlaying) {
      console.log('Already playing');
      return;
    }

    // resume context si está suspendido
    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }

    this.isPlaying = true;
    this.notifyPlayStateChange(true);

    // timelineCursor: momento del audioContext en que programaremos el primer track
    const timelineStart = Math.max(this.audioContext.currentTime + this.startLatency, this.audioContext.currentTime + 0.02);
    // programar actual (currentQueuePosition)
    try {
      await this._scheduleTrackByQueuePos(this.currentQueuePosition, timelineStart);
    } catch (err) {
      console.error('Error scheduling first track:', err);
      this.stop();
    }
  }

  stop() {
    if (!this.isPlaying) return;
    this.isPlaying = false;

    // Parar y limpiar todas las fuentes programadas
    for (const [qpos, entry] of this.scheduled.entries()) {
      try {
        if (entry.source && typeof entry.source.stop === 'function') {
          // solo intentar stop si está antes de endTime y la fuente existe
          try { entry.source.stop(); } catch (e) { /* puede lanzar si ya terminó */ }
        }
      } catch (err) {
        // ignore
      }
      // clear timers
      if (entry._startTimer) clearTimeout(entry._startTimer);
      if (entry._endTimer) clearTimeout(entry._endTimer);
      if (entry._preloadTimeout) clearTimeout(entry._preloadTimeout);
      // desconectar pitchShifter si tiene disconnect
      if (entry.pitchShifter && typeof entry.pitchShifter.disconnect === 'function') {
        try { entry.pitchShifter.disconnect(); } catch (e) {}
      }
    }
    this.scheduled.clear();

    // don't close audioContext (we keep it) — if quieres cerrarlo, descomenta la siguiente linea:
    // this.audioContext.close();

    this.notifyPlayStateChange(false);
    console.log('Playback stopped and cleaned scheduled sources');
  }

  /* --------------- Scheduling interno (solo current + next) --------------- */

  /**
   * schedule a track given its queue position to start at startTime (audioContext time)
   * This function ensures the buffer is loaded, creates a PitchShifter (or BufferSource),
   * schedules start(end) exactly, and tries to prepare the next track so it can be scheduled
   * to start exactly at endTime (no milis anticipados).
   */
  async _scheduleTrackByQueuePos(queuePos, startTime) {
    if (!this.isPlaying) return;

    // si ya está scheduled (por si se llamó dos veces), no re-schedule
    if (this.scheduled.has(queuePos)) {
      console.warn('Queue position already scheduled:', queuePos);
      return;
    }

    // Obtener track real
    const trackIndex = this.playQueue[queuePos];
    const track = this.tracks[trackIndex];
    if (!track) throw new Error('Track not found for queuePos ' + queuePos);

    // Asegurar que el buffer esté decodificado
    if (!this.audioBuffers.has(track.id)) {
      // Si el startTime está muy cerca, esto podría no terminar a tiempo; aún así intentamos
      await this.preloadTrack(trackIndex);
    }
    const audioBuffer = this.audioBuffers.get(track.id);
    if (!audioBuffer) throw new Error('No audioBuffer available after preload for ' + track.title);

    // Crear PitchShifter (o BufferSource) — adapta si tu PitchShifter tiene otra API
    // Se espera que PitchShifter cree internamente `source` (AudioBufferSourceNode) que soporta start(when)
    let pitchShifterInstance = null;
    try {
      // Si tu PitchShifter constructor admite callback cuando termina, no lo usamos para timing primario
      pitchShifterInstance = new PitchShifter(this.audioContext, audioBuffer, 4096);
      // aplicar ajustes globales (si aplica a tu clase)
      if (typeof pitchShifterInstance.setTempo === 'function') pitchShifterInstance.setTempo(this.globalTempo);
      if (typeof pitchShifterInstance.setPitchSemitones === 'function') pitchShifterInstance.setPitchSemitones(this.globalPitchSemitones);
      // conectar a la ganancia principal
      if (typeof pitchShifterInstance.connect === 'function') {
        pitchShifterInstance.connect(this.gainNode);
      } else if (pitchShifterInstance.source) {
        pitchShifterInstance.source.connect(this.gainNode);
      }
    } catch (err) {
      console.warn('PitchShifter creation failed, falling back to plain BufferSource:', err);
      pitchShifterInstance = null;
    }

    // Si no tenemos una instancia de pitchShifter que nos exponga `.source`, creamos manualmente un bufferSource
    let sourceNode = null;
    if (pitchShifterInstance && pitchShifterInstance.source) {
      sourceNode = pitchShifterInstance.source;
    } else {
      sourceNode = this.audioContext.createBufferSource();
      sourceNode.buffer = audioBuffer;
      sourceNode.connect(this.gainNode);
      // si hay ajuste de tempo/pitch simple: sourceNode.playbackRate.value = this.globalTempo;  // opcional
      try { sourceNode.playbackRate.setValueAtTime(this.globalTempo, this.audioContext.currentTime); } catch(e) {}
    }

    // Calcular duración de reproducción (si PitchShifter modifica la duración debes obtenerlo de ahí)
    let playbackDuration = audioBuffer.duration;
    // intentar inferir tempo de pitchShifterInstance
    if (pitchShifterInstance && typeof pitchShifterInstance.tempo === 'number' && pitchShifterInstance.tempo > 0) {
      playbackDuration = audioBuffer.duration / pitchShifterInstance.tempo;
    } else {
      // fallback: considerar globalTempo
      playbackDuration = audioBuffer.duration / Math.max(0.0001, this.globalTempo);
    }

    const endTime = startTime + playbackDuration;

    // Programar inicio y fin exactos
    try {
      sourceNode.start(startTime);
      if (typeof sourceNode.stop === 'function') {
        sourceNode.stop(endTime);
      }
    } catch (err) {
      console.error('Error scheduling source start/stop:', err);
      throw err;
    }

    // Bookkeeping: timers para notificaciones de start/end (no controlan el audio, solo UI)
    const now = this.audioContext.currentTime;
    const startDelayMs = Math.max(0, (startTime - now) * 1000);
    const endDelayMs = Math.max(0, (endTime - now) * 1000);

    const startTimer = setTimeout(() => {
      // marcar como "esta empezando" -> actualizar currentQueuePosition y notificar cambio
      this.currentQueuePosition = queuePos;
      this.notifyTrackChange(track);
    }, startDelayMs);

    const endTimer = setTimeout(() => {
      // limpiar entrada scheduled y programar siguiente en su momento
      const entry = this.scheduled.get(queuePos);
      if (entry) {
        // desconectar/limpiar pitchShifter
        try {
          if (entry.pitchShifter && typeof entry.pitchShifter.disconnect === 'function') {
            entry.pitchShifter.disconnect();
          } else if (entry.source) {
            try { entry.source.disconnect(); } catch (e) {}
          }
        } catch (e) {}
        // quitar del map
        this.scheduled.delete(queuePos);
      }
      // Cuando termina, planificamos el siguiente (pero lo hacemos usando el endTime calculado para evitar adelantos)
      if (this.isPlaying) {
        const nextQueuePos = (queuePos + 1) % this.playQueue.length;
        // Intentamos programar el siguiente ahora mismo si ya está precargado
        const nextTrackIndex = this.playQueue[nextQueuePos];
        const nextTrack = this.tracks[nextTrackIndex];
        const nextAudioBuffer = nextTrack && this.audioBuffers.get(nextTrack.id);
        if (nextAudioBuffer) {
          // Si ya está listo, lo programamos exactamente para endTime
          this._scheduleTrackByQueuePos(nextQueuePos, endTime).catch(err => {
            console.error('Error scheduling next track (already cached):', err);
          });
        } else {
          // Si no está listo aún, intentamos pre-cargar con timeout (esperamos hasta preloadLeadTime antes de endTime)
          const timeLeftMs = Math.max(0, (endTime - this.audioContext.currentTime) * 1000 - 120);
          // race preload with timeout
          const preloadPromise = this.preloadTrack(nextTrackIndex).then(buf => buf).catch(() => null);
          const timeoutPromise = new Promise(resolve => setTimeout(() => resolve(null), timeLeftMs));
          Promise.race([preloadPromise, timeoutPromise]).then(buf => {
            if (buf) {
              // buffer listo antes de deadline -> schedule at endTime
              this._scheduleTrackByQueuePos(nextQueuePos, endTime).catch(err => {
                console.error('Error scheduling next after preload:', err);
              });
            } else {
              // no pudimos pre-cargar a tiempo -> fallback: programar "on demand" para que empiece inmediatamente después
              // (esto puede introducir un pequeño gap si el buffer aún no está listo)
              console.warn('Next track was not ready in time; will attempt on-demand playback at endTime');
              // Intentamos programar en cuanto tengamos buffer (sin garantizar start exacto)
              this.preloadTrack(nextTrackIndex).then(() => {
                // schedule with startTime = Math.max(endTime, audioContext.currentTime + small offset)
                const now2 = this.audioContext.currentTime;
                const fallbackStart = Math.max(endTime, now2 + 0.02);
                this._scheduleTrackByQueuePos(nextQueuePos, fallbackStart).catch(err => {
                  console.error('Fallback scheduling failed:', err);
                });
              }).catch(err => {
                console.error('Fallback preload failed:', err);
              });
            }
          });
        }
      }
    }, endDelayMs);

    // Guardar en scheduled
    this.scheduled.set(queuePos, {
      queuePos,
      trackIndex,
      startTime,
      endTime,
      source: sourceNode,
      pitchShifter: pitchShifterInstance,
      _startTimer: startTimer,
      _endTimer: endTimer
    });

    // asegurar precarga del siguiente lo antes posible (optimización)
    try {
      const nextQueuePos = (queuePos + 1) % this.playQueue.length;
      const nextTrackIndex = this.playQueue[nextQueuePos];
      // start preload async, no await acá (se maneja arriba)
      this.preloadTrack(nextTrackIndex).catch(() => {});
    } catch (e) {}

    console.log(`Scheduled queuePos ${queuePos} (track: ${track.title}) start:${startTime.toFixed(3)} end:${endTime.toFixed(3)}`);
  }

  /* --------------- Métodos públicos de control --------------- */

  setTempo(tempo) {
    this.globalTempo = tempo;
    // si hay pitchShifters activos, actualizar (no garantizado que todas las implementaciones lo soporten en caliente)
    for (const entry of this.scheduled.values()) {
      if (entry.pitchShifter && typeof entry.pitchShifter.setTempo === 'function') {
        entry.pitchShifter.setTempo(tempo);
      } else if (entry.source && entry.source.playbackRate) {
        try { entry.source.playbackRate.setValueAtTime(tempo, this.audioContext.currentTime); } catch(e){}
      }
    }
    console.log('Tempo set to', tempo);
  }

  setPitchSemitones(semitones) {
    this.globalPitchSemitones = semitones;
    for (const entry of this.scheduled.values()) {
      if (entry.pitchShifter && typeof entry.pitchShifter.setPitchSemitones === 'function') {
        entry.pitchShifter.setPitchSemitones(semitones);
      }
    }
    console.log('Pitch semitones set to', semitones);
  }

  setVolume(volume) {
    this.currentVolume = Math.max(0, Math.min(1, volume));
    if (this.gainNode && this.audioContext) {
      this.gainNode.gain.setValueAtTime(this.currentVolume, this.audioContext.currentTime);
    }
  }

  pause() {
    if (this.audioContext && this.isPlaying) {
      this.audioContext.suspend();
      this.isPlaying = false;
      this.notifyPlayStateChange(false);
    }
  }

  resume() {
    if (this.audioContext && !this.isPlaying) {
      this.audioContext.resume();
      this.isPlaying = true;
      this.notifyPlayStateChange(true);
    }
  }

  getCurrentTrack() {
    if (!this.tracks.length) return null;
    const qpos = this.currentQueuePosition % this.playQueue.length;
    const trackIndex = this.playQueue[qpos];
    return this.tracks[trackIndex] || null;
  }

  async getAvailablePalos() {
    try {
      return await canteTracksAPI.getAvailablePalos();
    } catch (err) {
      console.error('Error fetching palos:', err);
      throw err;
    }
  }

  // listeners
  onTrackChange(cb) { this.onTrackChangeListeners.push(cb); }
  onPlayStateChange(cb) { this.onPlayStateChangeListeners.push(cb); }
  notifyTrackChange(track) {
    this.onTrackChangeListeners.forEach(cb => { try { cb(track); } catch(e){} });
  }
  notifyPlayStateChange(isPlaying) {
    this.onPlayStateChangeListeners.forEach(cb => { try { cb(isPlaying); } catch(e){} });
  }

  destroy() {
    this.stop();
    if (this.audioContext) {
      try { this.audioContext.close(); } catch (e) {}
      this.audioContext = null;
    }
    this.audioBuffers.clear();
    this.onTrackChangeListeners = [];
    this.onPlayStateChangeListeners = [];
    console.log('AudioManager destroyed');
  }
}
