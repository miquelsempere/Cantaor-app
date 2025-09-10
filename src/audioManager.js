/*
 * Audio Manager with precise scheduling using AudioBufferSourceNode
 * Based on the correct approach for seamless audio playback
 */

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
    this.currentTrackIndex = 0; // posición dentro de playQueue

    // Caching
    this.audioBuffers = new Map();  // track.id -> AudioBuffer
    this.activeSources = new Set();

    // Controles de audio
    this.globalTempo = 1.0;
    this.globalPitchSemitones = 0;
    this.currentVolume = 0.8;

    // Listeners
    this.onTrackChangeListeners = [];
    this.onPlayStateChangeListeners = [];
  }

  /* --------------- Inicialización --------------- */
  async initializeAudioContext() {
    if (!this.audioContext) {
      try {
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        
        if (!this.audioContext) {
          throw new Error('Failed to create AudioContext - returned null');
        }
        
        this.gainNode = this.audioContext.createGain();
        this.gainNode.connect(this.audioContext.destination);
        this.gainNode.gain.setValueAtTime(this.currentVolume, this.audioContext.currentTime);
        console.log('Audio context inicializado');
      } catch (error) {
        console.error('Error initializing AudioContext:', error);
        this.audioContext = null;
        this.gainNode = null;
        throw error;
      }
    }
  }

  /* --------------- Carga de pistas --------------- */
  async loadPalo(palo) {
    try {
      await this.initializeAudioContext();
      
      if (!this.audioContext) {
        throw new Error('Failed to initialize AudioContext');
      }
      
      console.log(`Loading tracks for palo: ${palo}`);
      this.tracks = await canteTracksAPI.getTracksByPalo(palo);
      if (!this.tracks || this.tracks.length === 0) {
        throw new Error(`No tracks found for palo: ${palo}`);
      }
      this.currentPalo = palo;
      this.createPlayQueue();
      
      // Preload first track
      await this.preloadTrack(this.playQueue[this.currentTrackIndex]);

      console.log(`Loaded ${this.tracks.length} tracks for ${palo}`);
      return this.tracks.length;
    } catch (err) {
      console.error('Error loadPalo:', err);
      throw err;
    }
  }

  createPlayQueue() {
    const indices = Array.from(this.tracks.keys());
    for (let i = indices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }
    this.playQueue = indices;
    this.currentTrackIndex = 0;
    console.log('Play queue creada:', this.playQueue);
  }

  /* --------------- Preload / Decodificado --------------- */
  async preloadTrack(trackIndex) {
    if (trackIndex == null || trackIndex < 0 || trackIndex >= this.tracks.length) return;
    const track = this.tracks[trackIndex];
    if (!track || this.audioBuffers.has(track.id)) return;

    if (!this.audioContext) {
      throw new Error('AudioContext not initialized. Cannot decode audio data.');
    }

    try {
      console.log('Preloading:', track.title || track.id);
      console.log('Fetching audio from URL:', track.audio_url);
      const response = await fetch(track.audio_url);
      if (!response.ok) {
        const errorMsg = `Failed to fetch audio file: ${response.status} ${response.statusText} for URL: ${track.audio_url}`;
        console.error(errorMsg);
        throw new Error(errorMsg);
      }
      console.log('Successfully fetched audio file, converting to ArrayBuffer...');
      const arrayBuffer = await response.arrayBuffer();
      console.log('ArrayBuffer created, size:', arrayBuffer.byteLength, 'bytes');
      
      // Check again after async operations in case audioContext was destroyed
      if (!this.audioContext) {
        throw new Error('AudioContext became null during preload operation');
      }
      
      console.log('About to decode audio data. AudioContext:', this.audioContext);
      console.log('AudioContext state:', this.audioContext ? this.audioContext.state : 'null');
      
      console.log('Decoding audio data...');
      const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
      console.log('Audio decoded successfully. Duration:', audioBuffer.duration, 'seconds');
      this.audioBuffers.set(track.id, audioBuffer);
      console.log('Preloaded:', track.title || track.id);
      return audioBuffer;
    } catch (err) {
      console.error('Error preloading track:', track.title || track.id);
      console.error('Error details:', err.message);
      console.error('Full error:', err);
      throw err;
    }
  }

  /* --------------- Reproducción --------------- */
  async play() {
    console.log('AudioManager.play() called');
    if (!this.currentPalo || !this.tracks.length) {
      throw new Error('No palo loaded. Call loadPalo() first.');
    }
    if (this.isPlaying) {
      console.log('Already playing');
      return;
    }

    await this.initializeAudioContext();

    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }

    this.isPlaying = true;
    console.log('AudioManager.play() - isPlaying set to true');
    this.notifyPlayStateChange(true);
    this.scheduleTrack(this.currentTrackIndex, this.audioContext.currentTime);
  }

  scheduleTrack(trackIndex, startTime) {
    console.log('AudioManager.scheduleTrack() called for track:', this.tracks[this.playQueue[trackIndex]].title, 'at time:', startTime);
    if (!this.isPlaying) return;

    const trackId = this.playQueue[trackIndex];
    const track = this.tracks[trackId];
    const buffer = this.audioBuffers.get(track.id);

    if (!buffer) {
      console.error('No buffer loaded for', track.title);
      return;
    }

    const source = this.audioContext.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.setValueAtTime(this.globalTempo, this.audioContext.currentTime);
    source.connect(this.gainNode);
    source.start(startTime);

    this.activeSources.add(source);
    source.onended = () => {
      this.activeSources.delete(source);
    };
    this.notifyTrackChange(track);

    // programamos la siguiente pista
    const nextIndex = (trackIndex + 1) % this.playQueue.length;
    const adjustedDuration = buffer.duration / this.globalTempo;
    const nextStart = startTime + adjustedDuration;

    this.preloadTrack(this.playQueue[nextIndex]).then(() => {
      console.log('preloadTrack.then() callback for track:', this.tracks[this.playQueue[nextIndex]].title, ' - checking isPlaying:', this.isPlaying);
      if (this.isPlaying) {
        console.log('preloadTrack.then() callback for track:', this.tracks[this.playQueue[nextIndex]].title, ' - isPlaying is true, scheduling next track');
        this.scheduleTrack(nextIndex, nextStart);
      }
    }).catch(err => {
      console.error('Error preloading next track:', err);
    });

    // avanzamos el índice
    this.currentTrackIndex = nextIndex;
    console.log('AudioManager.scheduleTrack() - currentTrackIndex updated to:', this.currentTrackIndex);
  }

  stop() {
    console.log('AudioManager.stop() called');
    if (!this.isPlaying) return;
    
    this.isPlaying = false;
    console.log('AudioManager.stop() - isPlaying set to false');
    
    // Detener todas las fuentes de audio activas
    this.activeSources.forEach(source => {
      try {
        console.log('AudioManager.stop() - stopping source:', source);
        source.stop();
        source.disconnect();
      } catch (e) {
        // La fuente podría ya estar detenida o desconectada
        console.warn('Error al detener la fuente:', e);
      }
    });
    this.activeSources.clear(); // Limpiar el conjunto después de detener todas las fuentes
    console.log('AudioManager.stop() - activeSources cleared');

    this.notifyPlayStateChange(false);
    console.log('Playback stopped');
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

  /* --------------- Controles de audio --------------- */
  setTempo(tempo) {
    this.globalTempo = tempo;
    // Aplicar el tempo a todas las fuentes activas
    this.activeSources.forEach(source => {
      if (source.playbackRate) {
        try {
          source.playbackRate.setValueAtTime(tempo, this.audioContext.currentTime);
        } catch (e) {
          // La fuente podría estar detenida
          console.warn('Error al cambiar el tempo:', e);
        }
      }
    });
    console.log('Tempo set to', tempo);
  }

  setPitchSemitones(semitones) {
    this.globalPitchSemitones = semitones;
    // Note: AudioBufferSourceNode doesn't support pitch shifting without tempo change
    // For real pitch shifting, we'd need to use a more complex approach
    console.log('Pitch semitones set to', semitones, '(tempo-based approximation)');
  }

  setVolume(volume) {
    this.currentVolume = Math.max(0, Math.min(1, volume));
    if (this.gainNode && this.audioContext) {
      this.gainNode.gain.setValueAtTime(this.currentVolume, this.audioContext.currentTime);
    }
  }

  /* --------------- Getters --------------- */
  getCurrentTrack() {
    if (!this.tracks.length) return null;
    const queueIndex = this.playQueue[this.currentTrackIndex];
    return this.tracks[queueIndex] || null;
  }

  async getAvailablePalos() {
    try {
      return await canteTracksAPI.getAvailablePalos();
    } catch (err) {
      console.error('Error fetching palos:', err);
      throw err;
    }
  }

  /* --------------- Event listeners --------------- */
  onTrackChange(cb) { 
    this.onTrackChangeListeners.push(cb); 
  }
  
  onPlayStateChange(cb) { 
    this.onPlayStateChangeListeners.push(cb); 
  }
  
  notifyTrackChange(track) {
    console.log(`Now playing: ${track.title}`);
    this.onTrackChangeListeners.forEach(cb => { 
      try { cb(track); } catch(e) { console.error('Track change listener error:', e); } 
    });
  }
  
  notifyPlayStateChange(isPlaying) {
    this.onPlayStateChangeListeners.forEach(cb => { 
      try { cb(isPlaying); } catch(e) { console.error('Play state listener error:', e); } 
    });
  }

  /* --------------- Cleanup --------------- */
  destroy() {
    this.stop();
    if (this.audioContext) {
      try { 
        this.audioContext.close(); 
      } catch (e) {
        console.warn('Error closing audio context:', e);
      }
      this.audioContext = null;
      this.gainNode = null;
    }
    this.audioBuffers.clear();
    this.activeSources.clear();
    this.onTrackChangeListeners = [];
    this.onPlayStateChangeListeners = [];
    console.log('AudioManager destroyed');
  }
}