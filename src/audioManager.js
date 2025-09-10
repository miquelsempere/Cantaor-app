/*
 * Audio Manager for Flamenco Cante Practice App
 * Handles audio loading, playback queue management, and PitchShifter integration
 */

import { PitchShifter } from './index.js';
import { canteTracksAPI } from './supabaseClient.js';

export default class AudioManager {
  constructor() {
    this.audioContext = null;
    this.pitchShifter = null;
    this.gainNode = null;

    // Playback state
    this.isPlaying = false;
    this.currentPalo = null;
    this.currentTrackIndex = 0;

    // Track management
    this.tracks = [];
    this.playQueue = [];
    this.audioBuffers = new Map(); // Cache for decoded audio buffers

    // Preloading
    this.nextTrackBuffer = null;
    this.isPreloading = false;

    // Event listeners
    this.onTrackChangeListeners = [];
    this.onPlayStateChangeListeners = [];

    // Volume management
    this.currentVolume = 0.8; // Default volume

    this.initializeAudioContext();
  }

  /**
   * Initialize Web Audio API context and gain node
   */
  initializeAudioContext() {
    try {
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      this.gainNode = this.audioContext.createGain();
      this.gainNode.connect(this.audioContext.destination);
      console.log('Audio context initialized successfully');
    } catch (error) {
      console.error('Failed to initialize audio context:', error);
      throw new Error('Web Audio API not supported in this browser');
    }
  }

  /**
   * Load tracks for a specific palo from Supabase
   * @param {string} palo - The flamenco palo to load tracks for
   */
  async loadPalo(palo) {
    try {
      console.log(`Loading tracks for palo: ${palo}`);

      this.tracks = await canteTracksAPI.getTracksByPalo(palo);

      if (this.tracks.length === 0) {
        throw new Error(`No tracks found for palo: ${palo}`);
      }

      this.currentPalo = palo;
      this.currentTrackIndex = 0;

      // Create shuffled play queue
      this.createPlayQueue();

      // Preload first track
      await this.preloadTrack(this.playQueue[0]);

      console.log(`Loaded ${this.tracks.length} tracks for ${palo}`);
      return this.tracks.length;

    } catch (error) {
      console.error('Error loading palo:', error);
      throw error;
    }
  }

  /**
   * Create a shuffled play queue without repeats
   */
  createPlayQueue() {
    const indices = Array.from({ length: this.tracks.length }, (_, i) => i);

    for (let i = indices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }

    this.playQueue = indices;
    this.currentTrackIndex = 0;

    console.log('Play queue created:', this.playQueue);
  }

  /**
   * Preload an audio track by downloading and decoding it
   * @param {number} trackIndex - Index of track to preload
   */
  async preloadTrack(trackIndex) {
    if (this.isPreloading || trackIndex >= this.tracks.length) {
      return;
    }

    const track = this.tracks[trackIndex];

    if (this.audioBuffers.has(track.id)) {
      this.nextTrackBuffer = this.audioBuffers.get(track.id);
      return;
    }

    try {
      this.isPreloading = true;
      console.log(`Preloading track: ${track.title}`);

      const response = await fetch(track.audio_url);
      if (!response.ok) {
        throw new Error(`Failed to fetch audio: ${response.statusText}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);

      this.audioBuffers.set(track.id, audioBuffer);
      this.nextTrackBuffer = audioBuffer;

      console.log(`Successfully preloaded: ${track.title}`);
    } catch (error) {
      console.error(`Error preloading track ${track.title}:`, error);
      throw error;
    } finally {
      this.isPreloading = false;
    }
  }

  /**
   * Start playback of the current palo
   */
  async play() {
    if (!this.currentPalo || this.tracks.length === 0) {
      throw new Error('No palo loaded. Call loadPalo() first.');
    }

    if (this.isPlaying) {
      console.log('Already playing');
      return;
    }

    try {
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }

      await this.playCurrentTrack();

      this.isPlaying = true;
      this.notifyPlayStateChange(true);

      console.log('Playback started');
    } catch (error) {
      console.error('Error starting playback:', error);
      throw error;
    }
  }

  /**
   * Stop playback
   */
  stop() {
    if (!this.isPlaying) {
      return;
    }

    if (this.pitchShifter) {
      this.pitchShifter.disconnect();
      this.pitchShifter = null;
    }

    this.isPlaying = false;
    this.notifyPlayStateChange(false);

    console.log('Playback stopped');
  }

  /**
   * Play the current track in the queue
   */
  async playCurrentTrack() {
    const currentQueueIndex = this.playQueue[this.currentTrackIndex];
    const currentTrack = this.tracks[currentQueueIndex];

    console.log(`Playing track: ${currentTrack.title}`);

    let audioBuffer = this.audioBuffers.get(currentTrack.id);
    if (!audioBuffer) {
      await this.preloadTrack(currentQueueIndex);
      audioBuffer = this.audioBuffers.get(currentTrack.id);
    }
    if (!audioBuffer) {
      throw new Error('Failed to load audio buffer');
    }

    if (this.pitchShifter) {
      this.pitchShifter.disconnect();
      this.pitchShifter = null;
    }

    this.pitchShifter = new PitchShifter(
      this.audioContext,
      audioBuffer,
      4096
    );
    this.pitchShifter.connect(this.gainNode);

    this.setVolume(this.currentVolume);
    this.notifyTrackChange(currentTrack);

    // Preload siguiente
    this.preloadNextTrack();

    // Encadenar siguiente track cuando acabe este
    this.pitchShifter.source.onended = () => {
      if (this.isPlaying) {
        this.onTrackEnd();
      }
    };

    // Iniciar inmediatamente
    this.pitchShifter.source.start();
  }

  /**
   * Handle track end - move to next track
   */
  onTrackEnd() {
    console.log('Track ended, moving to next');

    this.currentTrackIndex++;
    if (this.currentTrackIndex >= this.playQueue.length) {
      console.log('All tracks played, reshuffling queue');
      this.createPlayQueue();
    }

    if (this.isPlaying) {
      this.playCurrentTrack().catch(error => {
        console.error('Error playing next track:', error);
        this.stop();
      });
    }
  }

  /**
   * Preload the next track in the queue
   */
  preloadNextTrack() {
    const nextIndex = (this.currentTrackIndex + 1) % this.playQueue.length;
    const nextQueueIndex = this.playQueue[nextIndex];

    this.preloadTrack(nextQueueIndex).catch(error => {
      console.warn('Failed to preload next track:', error);
    });
  }

  setTempo(tempo) {
    if (this.pitchShifter) {
      this.pitchShifter.tempo = tempo;
      console.log(`Tempo set to: ${tempo}`);
    }
  }

  setPitch(pitch) {
    if (this.pitchShifter) {
      this.pitchShifter.pitch = pitch;
      console.log(`Pitch set to: ${pitch}`);
    }
  }

  setPitchSemitones(semitones) {
    if (this.pitchShifter) {
      this.pitchShifter.pitchSemitones = semitones;
      console.log(`Pitch set to: ${semitones} semitones`);
    }
  }

  setVolume(volume) {
    if (this.gainNode) {
      this.gainNode.gain.value = Math.max(0, Math.min(1, volume));
      this.currentVolume = volume;
      console.log(`Volume set to: ${volume}`);
    }
  }

  getCurrentTrack() {
    if (!this.tracks.length || this.currentTrackIndex >= this.playQueue.length) {
      return null;
    }
    const currentQueueIndex = this.playQueue[this.currentTrackIndex];
    return this.tracks[currentQueueIndex];
  }

  async getAvailablePalos() {
    try {
      return await canteTracksAPI.getAvailablePalos();
    } catch (error) {
      console.error('Error fetching available palos:', error);
      throw error;
    }
  }

  onTrackChange(callback) {
    this.onTrackChangeListeners.push(callback);
  }

  onPlayStateChange(callback) {
    this.onPlayStateChangeListeners.push(callback);
  }

  notifyTrackChange(track) {
    this.onTrackChangeListeners.forEach(callback => {
      try {
        callback(track);
      } catch (error) {
        console.error('Error in track change listener:', error);
      }
    });
  }

  notifyPlayStateChange(isPlaying) {
    this.onPlayStateChangeListeners.forEach(callback => {
      try {
        callback(isPlaying);
      } catch (error) {
        console.error('Error in play state change listener:', error);
      }
    });
  }

  destroy() {
    this.stop();

    if (this.audioContext) {
      this.audioContext.close();
    }

    this.audioBuffers.clear();
    this.onTrackChangeListeners = [];
    this.onPlayStateChangeListeners = [];

    console.log('AudioManager destroyed');
  }
}
