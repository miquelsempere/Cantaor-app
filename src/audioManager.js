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
    
    // Continuous playback state
    this.currentCycle = 1;
    this.totalTracksInCycle = 0;
    this.tracksPlayedInCycle = 0;
    
    // Event listeners
    this.onTrackChangeListeners = [];
    this.onPlayStateChangeListeners = [];
    
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
      
      // Fetch tracks from Supabase
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
    // Create array of indices
    const indices = Array.from({ length: this.tracks.length }, (_, i) => i);
    
    // Shuffle using Fisher-Yates algorithm
    for (let i = indices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }
    
    this.playQueue = indices;
    this.currentTrackIndex = 0;
    this.totalTracksInCycle = this.tracks.length;
    this.tracksPlayedInCycle = 0;
    
    console.log(`Play queue created for cycle ${this.currentCycle}:`, this.playQueue);
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
    
    // Check if already cached
    if (this.audioBuffers.has(track.id)) {
      this.nextTrackBuffer = this.audioBuffers.get(track.id);
      return;
    }
    
    try {
      this.isPreloading = true;
      console.log(`Preloading track: ${track.title}`);
      
      // Fetch audio file
      const response = await fetch(track.audio_url);
      if (!response.ok) {
        throw new Error(`Failed to fetch audio: ${response.statusText}`);
      }
      
      const arrayBuffer = await response.arrayBuffer();
      
      // Decode audio data
      const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
      
      // Cache the buffer
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
      // Resume audio context if suspended (required by some browsers)
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }
      
      // Start playing current track
      await this.playCurrentTrack();
      
      this.isPlaying = true;
      this.notifyPlayStateChange(true);
      
      console.log(`Playback started - Cycle ${this.currentCycle}, Track ${this.tracksPlayedInCycle + 1}/${this.totalTracksInCycle}`);
      
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
    
    // Disconnect PitchShifter to stop audio
    if (this.pitchShifter) {
      this.pitchShifter.disconnect();
      this.pitchShifter = null;
    }
    
    this.isPlaying = false;
    this.notifyPlayStateChange(false);
    
    console.log(`Playback stopped - Was in cycle ${this.currentCycle}, track ${this.tracksPlayedInCycle}/${this.totalTracksInCycle}`);
  }

  /**
   * Play the current track in the queue
   */
  async playCurrentTrack() {
    const currentQueueIndex = this.playQueue[this.currentTrackIndex];
    const currentTrack = this.tracks[currentQueueIndex];
    
    console.log(`Playing track: ${currentTrack.title} (${this.tracksPlayedInCycle + 1}/${this.totalTracksInCycle} in cycle ${this.currentCycle})`);
    
    // Disconnect any existing PitchShifter to ensure clean transition
    if (this.pitchShifter) {
      this.pitchShifter.disconnect();
      this.pitchShifter = null;
    }
    
    // Use preloaded buffer or load on demand
    let audioBuffer = this.nextTrackBuffer;
    if (!audioBuffer) {
      await this.preloadTrack(currentQueueIndex);
      audioBuffer = this.nextTrackBuffer;
    }
    
    if (!audioBuffer) {
      throw new Error('Failed to load audio buffer');
    }
    
    // Create new PitchShifter instance (now asynchronous)
    this.pitchShifter = new PitchShifter(
      this.audioContext,
      audioBuffer
    );
    
    // Set up event listeners for the new PitchShifter
    this.pitchShifter.on('play', (detail) => {
      // Handle play events if needed
      // This replaces the old onUpdate callback mechanism
    });
    
    this.pitchShifter.on('end', () => {
      this.onTrackEnd();
    });
    
    // Wait for PitchShifter to be fully initialized
    // Since PitchShifter initialization is now asynchronous, we need to wait
    await this.waitForPitchShifterReady();
    
    // Apply current audio settings to the new PitchShifter
    // These values are maintained by the UI controls
    if (this.currentTempo !== undefined) {
      this.pitchShifter.tempo = this.currentTempo;
    }
    if (this.currentPitchSemitones !== undefined) {
      this.pitchShifter.pitchSemitones = this.currentPitchSemitones;
    }
    
    // Connect to audio output
    this.pitchShifter.connect(this.gainNode);
    
    // Notify track change
    this.notifyTrackChange(currentTrack);
    
    // Preload next track
    this.preloadNextTrack();
    
    // Update cycle tracking
    this.tracksPlayedInCycle++;
  }

  /**
   * Wait for PitchShifter to be fully initialized
   * This is needed because AudioWorkletNode initialization is asynchronous
   */
  async waitForPitchShifterReady() {
    if (!this.pitchShifter) {
      throw new Error('PitchShifter not created');
    }
    
    // Wait for the AudioWorkletNode to be ready
    // We'll check if the node exists and is properly initialized
    let attempts = 0;
    const maxAttempts = 50; // 5 seconds maximum wait time
    
    while (attempts < maxAttempts) {
      if (this.pitchShifter.node && this.pitchShifter.port) {
        console.log('PitchShifter is ready');
        return;
      }
      
      // Wait 100ms before checking again
      await new Promise(resolve => setTimeout(resolve, 100));
      attempts++;
    }
    
    throw new Error('PitchShifter failed to initialize within timeout period');
  }

  /**
   * Handle track end - move to next track
   */
  onTrackEnd() {
    console.log(`Track ended - ${this.tracksPlayedInCycle}/${this.totalTracksInCycle} completed in cycle ${this.currentCycle}`);
    
    if (!this.isPlaying) {
      console.log('Playback stopped, not advancing to next track');
      return;
    }
    
    // Move to next track in queue
    this.currentTrackIndex++;
    
    // If we've played all tracks, restart the cycle with a new shuffle
    if (this.currentTrackIndex >= this.playQueue.length) {
      console.log(`Cycle ${this.currentCycle} completed! Starting new cycle...`);
      this.currentCycle++;
      this.createPlayQueue();
    }
    
    // 1 second delay between tracks for clean transition
    console.log('Waiting 4 seconds before next track...');
    setTimeout(() => {
      if (!this.isPlaying) {
        console.log('Playback was stopped during 4-second transition delay');
        return;
      }
      
      console.log('Starting next track after 4-second delay');
      // Play next track
      this.playCurrentTrack().catch(error => {
        console.error('Error playing next track:', error);
        this.stop();
      });
    }, 4000); // 4 seconds delay between tracks
  }

  /**
   * Preload the next track in the queue
   */
  preloadNextTrack() {
    const nextIndex = (this.currentTrackIndex + 1) % this.playQueue.length;
    const nextQueueIndex = this.playQueue[nextIndex];
    
    // Preload asynchronously
    this.preloadTrack(nextQueueIndex).catch(error => {
      console.warn('Failed to preload next track:', error);
    });
  }

  /**
   * Set playback tempo
   * @param {number} tempo - Tempo value (1.0 = normal speed)
   */
  setTempo(tempo) {
    this.currentTempo = tempo;
    if (this.pitchShifter) {
      this.pitchShifter.tempo = tempo;
      console.log(`Tempo set to: ${tempo}`);
    }
  }

  /**
   * Set pitch
   * @param {number} pitch - Pitch value (1.0 = normal pitch)
   */
  setPitch(pitch) {
    this.currentPitch = pitch;
    if (this.pitchShifter) {
      this.pitchShifter.pitch = pitch;
      console.log(`Pitch set to: ${pitch}`);
    }
  }

  /**
   * Set pitch in semitones
   * @param {number} semitones - Semitones to shift (-12 to +12)
   */
  setPitchSemitones(semitones) {
    this.currentPitchSemitones = semitones;
    if (this.pitchShifter) {
      this.pitchShifter.pitchSemitones = semitones;
      console.log(`Pitch set to: ${semitones} semitones`);
    }
  }

  /**
   * Set volume
   * @param {number} volume - Volume level (0.0 to 1.0)
   */
  setVolume(volume) {
    this.currentVolume = volume;
    if (this.gainNode) {
      this.gainNode.gain.value = Math.max(0, Math.min(1, volume));
      console.log(`Volume set to: ${volume}`);
    }
  }

  /**
   * Get current track information
   * @returns {Object|null} Current track object or null
   */
  getCurrentTrack() {
    if (!this.tracks.length || this.currentTrackIndex >= this.playQueue.length) {
      return null;
    }
    
    const currentQueueIndex = this.playQueue[this.currentTrackIndex];
    return this.tracks[currentQueueIndex];
  }

  /**
   * Get current playback status information
   * @returns {Object} Status information including cycle and track progress
   */
  getPlaybackStatus() {
    return {
      isPlaying: this.isPlaying,
      currentPalo: this.currentPalo,
      currentCycle: this.currentCycle,
      tracksPlayedInCycle: this.tracksPlayedInCycle,
      totalTracksInCycle: this.totalTracksInCycle,
      currentTrack: this.getCurrentTrack(),
      queueLength: this.playQueue.length - this.currentTrackIndex
    };
  }

  /**
   * Get available palos from Supabase
   * @returns {Promise<Array>} Array of available palo names
   */
  async getAvailablePalos() {
    try {
      return await canteTracksAPI.getAvailablePalos();
    } catch (error) {
      console.error('Error fetching available palos:', error);
      throw error;
    }
  }

  /**
   * Add listener for track changes
   * @param {Function} callback - Callback function to call when track changes
   */
  onTrackChange(callback) {
    this.onTrackChangeListeners.push(callback);
  }

  /**
   * Add listener for play state changes
   * @param {Function} callback - Callback function to call when play state changes
   */
  onPlayStateChange(callback) {
    this.onPlayStateChangeListeners.push(callback);
  }

  /**
   * Notify all track change listeners
   * @param {Object} track - Current track object
   */
  notifyTrackChange(track) {
    this.onTrackChangeListeners.forEach(callback => {
      try {
        callback(track);
      } catch (error) {
        console.error('Error in track change listener:', error);
      }
    });
  }

  /**
   * Notify all play state change listeners
   * @param {boolean} isPlaying - Current play state
   */
  notifyPlayStateChange(isPlaying) {
    this.onPlayStateChangeListeners.forEach(callback => {
      try {
        callback(isPlaying);
      } catch (error) {
        console.error('Error in play state change listener:', error);
      }
    });
  }

  /**
   * Clean up resources
   */
  destroy() {
    this.stop();
    
    if (this.audioContext) {
      this.audioContext.close();
    }
    
    this.audioBuffers.clear();
    this.onTrackChangeListeners = [];
    this.onPlayStateChangeListeners = [];
    
    // Reset cycle tracking
    this.currentCycle = 1;
    this.totalTracksInCycle = 0;
    this.tracksPlayedInCycle = 0;
    
    console.log('AudioManager destroyed');
  }
}