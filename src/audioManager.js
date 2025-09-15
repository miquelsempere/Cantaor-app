/*
 * Audio Manager for Flamenco Cante Practice App
 * Handles audio loading, playback queue management, and PitchShifter integration
 * Now with track concatenation for smoother playback
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
    
    // Track management
    this.tracks = [];
    this.playQueue = [];
    this.audioBuffers = new Map(); // Cache for decoded audio buffers
    
    // Concatenated cycle management
    this.currentCycleAudioBuffer = null;
    this.currentCycle = 1;
    this.totalTracksInCycle = 0;
    
    // Track timing for UI updates (optional for future enhancement)
    this.trackTimings = []; // Array of {startTime, endTime, trackIndex}
    
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
   * Concatenate multiple AudioBuffers into a single AudioBuffer
   * @param {AudioBuffer[]} buffers - Array of AudioBuffers to concatenate
   * @returns {AudioBuffer} Single concatenated AudioBuffer
   */
  _concatenateAudioBuffers(buffers) {
    if (!buffers || buffers.length === 0) {
      throw new Error('No buffers provided for concatenation');
    }

    // Calculate total duration and validate buffers
    let totalLength = 0;
    const sampleRate = buffers[0].sampleRate;
    const numberOfChannels = buffers[0].numberOfChannels;

    for (const buffer of buffers) {
      if (buffer.sampleRate !== sampleRate) {
        throw new Error('All buffers must have the same sample rate');
      }
      if (buffer.numberOfChannels !== numberOfChannels) {
        throw new Error('All buffers must have the same number of channels');
      }
      totalLength += buffer.length;
    }

    // Create the concatenated buffer
    const concatenatedBuffer = this.audioContext.createBuffer(
      numberOfChannels,
      totalLength,
      sampleRate
    );

    // Copy data from each buffer
    let offset = 0;
    this.trackTimings = []; // Reset track timings

    for (let i = 0; i < buffers.length; i++) {
      const buffer = buffers[i];
      const startTime = offset / sampleRate;
      const endTime = (offset + buffer.length) / sampleRate;
      
      // Store timing information for this track
      this.trackTimings.push({
        startTime,
        endTime,
        trackIndex: this.playQueue[i], // Original track index
        duration: buffer.duration
      });

      // Copy each channel
      for (let channel = 0; channel < numberOfChannels; channel++) {
        const sourceData = buffer.getChannelData(channel);
        const destData = concatenatedBuffer.getChannelData(channel);
        destData.set(sourceData, offset);
      }

      offset += buffer.length;
    }

    console.log(`Concatenated ${buffers.length} tracks into single buffer (${concatenatedBuffer.duration.toFixed(2)}s)`);
    return concatenatedBuffer;
  }

  /**
   * Prepare the current cycle buffer by concatenating tracks in playQueue order
   */
  async _prepareCurrentCycleBuffer() {
    if (this.playQueue.length === 0) {
      throw new Error('No play queue available for cycle preparation');
    }

    console.log('Preparando buffer de reproducción...');

    // Get buffers in playQueue order
    const orderedBuffers = this.playQueue.map(trackIndex => {
      const track = this.tracks[trackIndex];
      const buffer = this.audioBuffers.get(track.id);
      if (!buffer) {
        throw new Error(`Buffer not found for track: ${track.title}`);
      }
      return buffer;
    });

    // Concatenate all buffers
    this.currentCycleAudioBuffer = this._concatenateAudioBuffers(orderedBuffers);
    
    console.log(`Buffer listo: ${this.currentCycleAudioBuffer.duration.toFixed(2)}s`);
  }

  /**
   * Load tracks for a specific palo from Supabase and prepare first cycle
   * @param {string} palo - The flamenco palo to load tracks for
   */
  async loadPalo(palo) {
    try {
      console.log(`Cargando pistas para el palo: ${palo}`);
      
      // Fetch tracks from Supabase
      this.tracks = await canteTracksAPI.getTracksByPalo(palo);
      
      if (this.tracks.length === 0) {
        throw new Error(`No tracks found for palo: ${palo}`);
      }
      
      this.currentPalo = palo;
      
      // Decode all audio buffers
      console.log('Decodificando archivos de audio...');
      await this._decodeAllTracks();
      
      // Create shuffled play queue and prepare first cycle
      this.createPlayQueue();
      await this._prepareCurrentCycleBuffer();
      
      console.log(`Cargadas ${this.tracks.length} pistas para ${palo}`);
      return this.tracks.length;
      
    } catch (error) {
      console.error('Error loading palo:', error);
      throw error;
    }
  }

  /**
   * Decode all tracks and store in audioBuffers cache
   */
  async _decodeAllTracks() {
    const decodePromises = this.tracks.map(async (track, index) => {
      try {
        console.log(`Decoding track ${index + 1}/${this.tracks.length}: ${track.title}`);
        
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
        
        console.log(`Successfully decoded: ${track.title} (${audioBuffer.duration.toFixed(2)}s)`);
        
      } catch (error) {
        console.error(`Error decoding track ${track.title}:`, error);
        throw error;
      }
    });

    await Promise.all(decodePromises);
    console.log('All tracks decoded successfully');
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
    this.totalTracksInCycle = this.tracks.length;
    
    console.log('Lista de reproducción creada:', this.playQueue);
  }

  /**
   * Start playback of the current cycle
   */
  async play() {
    if (!this.currentPalo || !this.currentCycleAudioBuffer) {
      throw new Error('No cycle buffer ready. Call loadPalo() first.');
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
      
      // Start playing current cycle
      await this.playCurrentCycle();
      
      this.isPlaying = true;
      this.notifyPlayStateChange(true);
      
      console.log('Reproducción iniciada');
      
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
    
    console.log('Reproducción detenida');
  }

  /**
   * Play the current concatenated cycle
   */
  async playCurrentCycle() {
    if (!this.currentCycleAudioBuffer) {
      throw new Error('No cycle buffer available');
    }
    
    console.log(`Reproduciendo (${this.currentCycleAudioBuffer.duration.toFixed(2)}s)`);
    
    // Disconnect any existing PitchShifter to ensure clean transition
    if (this.pitchShifter) {
      this.pitchShifter.disconnect();
      this.pitchShifter = null;
    }
    
    // Create new PitchShifter instance with concatenated buffer
    this.pitchShifter = new PitchShifter(
      this.audioContext,
      this.currentCycleAudioBuffer,
      4096,
      () => this.onCycleEnd() // Callback when cycle ends
    );
    
    // Apply current audio settings to the new PitchShifter
    if (this.currentTempo !== undefined) {
      this.pitchShifter.tempo = this.currentTempo;
    }
    if (this.currentPitchSemitones !== undefined) {
      this.pitchShifter.pitchSemitones = this.currentPitchSemitones;
    }
    
    // Connect to audio output
    this.pitchShifter.connect(this.gainNode);
    
    // Notify cycle start (using first track info for UI)
    const firstTrackIndex = this.playQueue[0];
    const firstTrack = this.tracks[firstTrackIndex];
    this.notifyTrackChange(firstTrack);
  }

  /**
   * Handle cycle end - prepare and start next cycle
   */
  onCycleEnd() {
    console.log('Reproducción completada, iniciando siguiente ciclo...');
    
    if (!this.isPlaying) {
      console.log('Reproducción detenida');
      return;
    }
    
    // Small delay to ensure clean audio transition
    setTimeout(async () => {
      if (!this.isPlaying) {
        console.log('Reproducción detenida durante la transición');
        return;
      }
      
      try {
        // Create new play queue and prepare next cycle
        this.createPlayQueue();
        await this._prepareCurrentCycleBuffer();
        
        // Start next cycle
        await this.playCurrentCycle();
        
      } catch (error) {
        console.error('Error iniciando siguiente ciclo:', error);
        this.stop();
      }
    }, 100); // Slightly longer delay for cycle preparation
  }

  /**
   * Get current track information (first track of current cycle)
   * @returns {Object|null} Current track object or null
   */
  getCurrentTrack() {
    if (!this.tracks.length || !this.playQueue.length) {
      return null;
    }
    
    const firstTrackIndex = this.playQueue[0];
    return this.tracks[firstTrackIndex];
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
    if (this.gainNode) {
      this.gainNode.gain.value = Math.max(0, Math.min(1, volume));
      console.log(`Volume set to: ${volume}`);
    }
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
    this.currentCycleAudioBuffer = null;
    this.onTrackChangeListeners = [];
    this.onPlayStateChangeListeners = [];
    
    this.trackTimings = [];
    
    console.log('AudioManager destroyed');
  }
}