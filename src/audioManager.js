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
    this.currentSource = null;

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
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      this.gainNode = this.audioContext.createGain();
      this.gainNode.connect(this.audioContext.destination);
      this.gainNode.gain.setValueAtTime(this.currentVolume, this.audioContext.currentTime);
      console.log('Audio context inicializado');
    }
  }

  /* --------------- Carga de pistas --------------- */
  async loadPalo(palo) {
    try {
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

    try {
      console.log('Preloading:', track.title || track.id);
      const response = await fetch(track.audio_url);
      if (!response.ok) throw new Error('fetch failed: ' + response.status);
      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
      this.audioBuffers.set(track.id, audioBuffer);
      console.log('Preloaded:', track.title || track.id);
      return audioBuffer;
    } catch (err) {
      console.warn('Error preloading track', track.title, err);
      throw err;
    }
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

    await this.initializeAudioContext();

    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }

    this.isPlaying = true;
    this.notifyPlayStateChange(true);
    this.playCurrentTrack();
  }

  playCurrentTrack() {
    if (!this.isPlaying) return;

    const queueIndex = this.playQueue[this.currentTrackIndex];
    const track = this.tracks[queueIndex];
    const buffer = this.audioBuffers.get(track.id);

    if (!buffer) {
      console.error('No buffer loaded for', track.title);
      return;
    }

    // Crear y configurar la fuente actual
    const source = this.audioContext.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.setValueAtTime(this.globalTempo, this.audioContext.currentTime);
    source.connect(this.gainNode);

    // Programar el inicio justo ahora
    const startTime = this.audioContext.currentTime;
    source.start(startTime);

    // Programar la siguiente canción EXACTAMENTE al acabar
    const nextTrackIndex = (this.currentTrackIndex + 1) % this.playQueue.length;
    const nextQueueIndex = this.playQueue[nextTrackIndex];
    const nextTrack = this.tracks[nextQueueIndex];
    
    // Preload y programar la siguiente pista
    this.preloadTrack(nextQueueIndex).then(() => {
      if (!this.isPlaying) return; // Check if still playing
      
      const nextBuffer = this.audioBuffers.get(nextTrack.id);
      if (nextBuffer) {
        const nextSource = this.audioContext.createBufferSource();
        nextSource.buffer = nextBuffer;
        nextSource.playbackRate.setValueAtTime(this.globalTempo, this.audioContext.currentTime);
        nextSource.connect(this.gainNode);
        
        // Calcular duración con tempo aplicado
        const adjustedDuration = buffer.duration / this.globalTempo;
        nextSource.start(startTime + adjustedDuration); // ← empieza en el mismo timeline
        
        // Configurar para que programe la siguiente cuando termine
        nextSource.onended = () => {
          if (this.isPlaying) {
            this.currentTrackIndex = nextTrackIndex;
            this.playCurrentTrack(); // Recursivamente programa la siguiente
          }
        };
        
        this.currentSource = nextSource;
        
        // Programar el cambio de pista para cuando empiece la siguiente
        setTimeout(() => {
          if (this.isPlaying) {
            this.currentTrackIndex = nextTrackIndex;
            this.notifyTrackChange(nextTrack);
          }
        }, adjustedDuration * 1000);
      }
    }).catch(err => {
      console.error('Error preloading next track:', err);
    });

    this.currentSource = source;
    this.notifyTrackChange(track);
  }

  stop() {
    if (!this.isPlaying) return;
    
    this.isPlaying = false;
    
    if (this.currentSource) {
      try {
        this.currentSource.stop();
        this.currentSource.disconnect();
      } catch (e) {
        // Source might already be stopped
      }
      this.currentSource = null;
    }

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
    if (this.currentSource && this.currentSource.playbackRate) {
      try {
        this.currentSource.playbackRate.setValueAtTime(tempo, this.audioContext.currentTime);
      } catch (e) {
        // Source might be stopped
      }
    }
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
    this.onTrackChangeListeners = [];
    this.onPlayStateChangeListeners = [];
    console.log('AudioManager destroyed');
  }
}