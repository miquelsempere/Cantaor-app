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
      this.gainNode.connect(this.audioContext.destination); // Conectar una sola vez
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

  /* --------------- Limpieza de pistas programadas --------------- */
  clearScheduledTracks() {
    for (const [qpos, entry] of this.scheduled.entries()) {
      if (entry.source) {
        try { entry.source.stop(); } catch (e) {} // Detener cualquier fuente activa
        try { entry.source.disconnect(); } catch (e) {}
      }
      if (entry.pitchShifter) {
        try { entry.pitchShifter.disconnect(); } catch (e) {}
      }
      if (entry._endTimer) clearTimeout(entry._endTimer); // Limpiar timers si existen
      if (entry._preloadTimeout) clearTimeout(entry._preloadTimeout);
    }
    this.scheduled.clear();
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

    this.clearScheduledTracks(); // Limpiar cualquier programación anterior

    // Conectar el gainNode al destino si no lo está
    try {
      this.gainNode.connect(this.audioContext.destination);
    } catch (e) {
      // Ya está conectado, ignorar error
    }

    // Tiempo de inicio para la primera pista
    let currentScheduleTime = Math.max(this.audioContext.currentTime + this.startLatency, this.audioContext.currentTime + 0.02);

    // Programar la primera pista
    await this._scheduleTrackByQueuePos(this.currentQueuePosition, currentScheduleTime);

    // Iniciar el bucle de programación continua
    this._scheduleNextTracks();
  }

  stop() {
    if (!this.isPlaying) return;
    this.isPlaying = false;

    this.clearScheduledTracks(); // Limpiar todos los elementos programados

    // Desconectar el gainNode principal del destino
    if (this.gainNode && this.audioContext.destination) {
      try {
        this.gainNode.disconnect(this.audioContext.destination);
      } catch (e) {
        // Ya está desconectado, ignorar error
      }
    }

    this.notifyPlayStateChange(false);
    console.log('Playback stopped and cleaned scheduled sources');
  }

  /* --------------- Scheduling interno (solo current + next) --------------- */

  /**
   * Programa una pista en una posición específica de la cola para comenzar en startTime
   * Devuelve el endTime de la pista programada
   */
  async _scheduleTrackByQueuePos(queuePos, startTime) {
    if (!this.isPlaying) return; // Detener si la reproducción fue detenida externamente

    // Si ya está programada, devolver su endTime
    if (this.scheduled.has(queuePos)) {
      console.warn('Queue position already scheduled:', queuePos);
      return this.scheduled.get(queuePos).endTime;
    }

    const trackIndex = this.playQueue[queuePos];
    const track = this.tracks[trackIndex];
    if (!track) throw new Error('Track not found for queuePos ' + queuePos);

    // Asegurar que el buffer esté decodificado
    if (!this.audioBuffers.has(track.id)) {
      await this.preloadTrack(trackIndex);
    }
    const audioBuffer = this.audioBuffers.get(track.id);
    if (!audioBuffer) throw new Error('No audioBuffer available after preload for ' + track.title);

    let pitchShifterInstance = null;
    let sourceNode = null;

    try {
      pitchShifterInstance = new PitchShifter(this.audioContext, audioBuffer, 4096);
      if (typeof pitchShifterInstance.setTempo === 'function') pitchShifterInstance.setTempo(this.globalTempo);
      if (typeof pitchShifterInstance.setPitchSemitones === 'function') pitchShifterInstance.setPitchSemitones(this.globalPitchSemitones);
      
      // Conectar pitchShifter al gainNode
      if (typeof pitchShifterInstance.connect === 'function') {
        pitchShifterInstance.connect(this.gainNode);
      } else if (pitchShifterInstance.node) {
        pitchShifterInstance.node.connect(this.gainNode);
      }
      sourceNode = pitchShifterInstance.node || pitchShifterInstance._node;
    } catch (err) {
      console.warn('PitchShifter creation failed, falling back to plain BufferSource:', err);
      pitchShifterInstance = null;
      sourceNode = this.audioContext.createBufferSource();
      sourceNode.buffer = audioBuffer;
      sourceNode.connect(this.gainNode);
      sourceNode.playbackRate.setValueAtTime(this.globalTempo, this.audioContext.currentTime);
    }

    let playbackDuration = audioBuffer.duration / Math.max(0.0001, this.globalTempo);
    // Si PitchShifter modifica la duración, recalcularla en base al tempo
    if (pitchShifterInstance && typeof pitchShifterInstance.tempo === 'number' && pitchShifterInstance.tempo > 0) {
      playbackDuration = audioBuffer.duration / pitchShifterInstance.tempo;
    }

    const endTime = startTime + playbackDuration;

    // Programar inicio y fin exactos
    try {
      sourceNode.start(startTime);
      sourceNode.stop(endTime);
    } catch (err) {
      console.error('Error scheduling source start/stop:', err);
      throw err;
    }

    // Almacenar información de la pista programada
    const scheduledEntry = {
      queuePos,
      trackIndex,
      startTime,
      endTime,
      source: sourceNode,
      pitchShifter: pitchShifterInstance,
    };
    this.scheduled.set(queuePos, scheduledEntry);

    // Configurar callback onended para limpieza y actualización de estado
    sourceNode.onended = () => {
      console.log(`Track ${track.title} (queuePos ${queuePos}) ended at ${this.audioContext.currentTime.toFixed(3)}`);
      // Limpiar recursos para esta pista
      if (scheduledEntry.pitchShifter) {
        try { scheduledEntry.pitchShifter.disconnect(); } catch (e) {}
      }
      if (scheduledEntry.source) {
        try { scheduledEntry.source.disconnect(); } catch (e) {}
      }
      this.scheduled.delete(queuePos); // Eliminar del mapa de programadas

      // Avanzar currentQueuePosition y notificar cambio de pista
      // Solo avanzar si esta era la pista que se estaba reproduciendo actualmente
      if (this.currentQueuePosition === queuePos) {
        this.currentQueuePosition = (queuePos + 1) % this.playQueue.length;
        const nextTrackInQueue = this.tracks[this.playQueue[this.currentQueuePosition]];
        this.notifyTrackChange(nextTrackInQueue);
      }

      // Disparar la programación de las siguientes pistas si la reproducción sigue activa
      if (this.isPlaying) {
        this._scheduleNextTracks();
      }
    };

    // Notificar cambio de pista si es la pista actual
    if (queuePos === this.currentQueuePosition) {
      this.notifyTrackChange(track);
    }

    console.log(`Scheduled queuePos ${queuePos} (track: ${track.title}) start:${startTime.toFixed(3)} end:${endTime.toFixed(3)}`);
    return endTime;
  }

  /* --------------- Programación continua --------------- */
  _scheduleNextTracks() {
    if (!this.isPlaying) return;

    // Encontrar el tiempo de finalización de la última pista programada
    let lastScheduledEndTime = this.audioContext.currentTime;
    let lastScheduledQueuePos = -1;

    // Iterar sobre el mapa de programadas para encontrar la pista más tardía
    for (const [qpos, entry] of this.scheduled.entries()) {
      if (entry.endTime > lastScheduledEndTime) {
        lastScheduledEndTime = entry.endTime;
        lastScheduledQueuePos = qpos;
      }
    }

    // Determinar la siguiente posición en la cola a programar
    let nextQueuePosToSchedule;
    if (lastScheduledQueuePos === -1) {
      // No hay pistas programadas, empezar desde la posición actual
      nextQueuePosToSchedule = this.currentQueuePosition;
    } else {
      nextQueuePosToSchedule = (lastScheduledQueuePos + 1) % this.playQueue.length;
    }

    // Programar un número de pistas por adelantado
    const numTracksToScheduleAhead = 2;
    
    // Programar pistas secuencialmente
    this._scheduleTracksSequentially(nextQueuePosToSchedule, lastScheduledEndTime, numTracksToScheduleAhead);
  }

  async _scheduleTracksSequentially(startQueuePos, startTime, numTracks) {
    let currentScheduleTime = startTime;
    
    for (let i = 0; i < numTracks; i++) {
      const currentTrackIndexInQueue = (startQueuePos + i) % this.playQueue.length;
      
      // Comprobar si esta pista ya está programada
      if (this.scheduled.has(currentTrackIndexInQueue)) {
        continue;
      }
      
      if (!this.isPlaying) {
        break;
      }
      
      try {
        // Precargar la pista primero
        const trackIndex = this.playQueue[currentTrackIndexInQueue];
        await this.preloadTrack(trackIndex);
        
        // Programar la pista para que empiece cuando la anterior termine
        const endTime = await this._scheduleTrackByQueuePos(currentTrackIndexInQueue, currentScheduleTime);
        
        // La siguiente pista empezará cuando esta termine
        currentScheduleTime = endTime;
        
      } catch (err) {
        console.error('Error scheduling track sequentially:', err);
        break;
      }
    }
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
