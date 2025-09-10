/*
 * SoundTouch AudioWorklet Processor
 * Handles audio processing in a dedicated audio thread for gapless playback
 * Copyright (c) Steve 'Cutter' Blades
 *
 * This library is free software; you can redistribute it and/or
 * modify it under the terms of the GNU Lesser General Public
 * License as published by the Free Software Foundation; either
 * version 2.1 of the License, or (at your option) any later version.
 */

class SoundTouchProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    
    // Audio processing state
    this.filter = null;
    this.samples = new Float32Array(128 * 2); // Default quantum size * 2 channels
    this.hasEnded = false;
    this.isInitialized = false;
    
    // Communication with main thread
    this.port.onmessage = this.handleMessage.bind(this);
    
    // Send ready signal to main thread
    this.port.postMessage({
      type: 'processor-ready'
    });
  }

  /**
   * Handle messages from the main thread
   */
  handleMessage(event) {
    const { type, data } = event.data;
    
    switch (type) {
      case 'initialize':
        this.initializeFilter(data);
        break;
        
      case 'set-tempo':
        if (this.filter && this.filter.pipe) {
          this.filter.pipe.tempo = data.tempo;
        }
        break;
        
      case 'set-pitch':
        if (this.filter && this.filter.pipe) {
          this.filter.pipe.pitch = data.pitch;
        }
        break;
        
      case 'set-pitch-semitones':
        if (this.filter && this.filter.pipe) {
          this.filter.pipe.pitchSemitones = data.semitones;
        }
        break;
        
      case 'reset':
        this.hasEnded = false;
        if (this.filter) {
          this.filter.clear();
        }
        break;
        
      default:
        console.warn('Unknown message type in SoundTouchProcessor:', type);
    }
  }

  /**
   * Initialize the filter with the provided data
   */
  initializeFilter(data) {
    try {
      // We'll receive the filter instance data and reconstruct it here
      // For now, we'll set a flag that we're ready to process
      this.isInitialized = true;
      
      // Notify main thread that initialization is complete
      this.port.postMessage({
        type: 'initialized'
      });
      
    } catch (error) {
      console.error('Error initializing filter in AudioWorklet:', error);
      this.port.postMessage({
        type: 'error',
        data: { message: error.message }
      });
    }
  }

  /**
   * Process audio samples - called by the audio system
   */
  process(inputs, outputs, parameters) {
    // If not initialized or has ended, output silence
    if (!this.isInitialized || this.hasEnded) {
      const output = outputs[0];
      if (output && output.length >= 2) {
        // Fill with silence
        output[0].fill(0);
        output[1].fill(0);
      }
      return !this.hasEnded; // Keep processor alive until ended
    }

    const output = outputs[0];
    if (!output || output.length < 2) {
      return true;
    }

    const outputLeft = output[0];
    const outputRight = output[1];
    const frameCount = outputLeft.length;

    try {
      // Extract audio samples from the filter
      let framesExtracted = 0;
      
      if (this.filter && typeof this.filter.extract === 'function') {
        // Ensure samples buffer is large enough
        if (this.samples.length < frameCount * 2) {
          this.samples = new Float32Array(frameCount * 2);
        }
        
        framesExtracted = this.filter.extract(this.samples, frameCount);
        
        // Send source position update to main thread
        this.port.postMessage({
          type: 'source-position-update',
          data: { sourcePosition: this.filter.sourcePosition || 0 }
        });
      }

      if (framesExtracted === 0) {
        // No more audio data - signal end
        if (!this.hasEnded) {
          this.hasEnded = true;
          this.port.postMessage({
            type: 'track-ended'
          });
        }
        
        // Fill remaining buffer with silence
        outputLeft.fill(0);
        outputRight.fill(0);
        
        return false; // Signal that processing should stop
      }

      // Copy extracted samples to output buffers
      for (let i = 0; i < framesExtracted; i++) {
        outputLeft[i] = this.samples[i * 2];
        outputRight[i] = this.samples[i * 2 + 1];
      }

      // Fill remaining buffer with silence if we extracted fewer frames
      for (let i = framesExtracted; i < frameCount; i++) {
        outputLeft[i] = 0;
        outputRight[i] = 0;
      }

    } catch (error) {
      console.error('Error in SoundTouchProcessor.process:', error);
      
      // Fill with silence on error
      outputLeft.fill(0);
      outputRight.fill(0);
      
      // Send error to main thread
      this.port.postMessage({
        type: 'error',
        data: { message: error.message }
      });
    }

    return true; // Keep processor alive
  }

  /**
   * Set the filter instance for processing
   * This will be called from the main thread with the filter data
   */
  setFilter(filter) {
    this.filter = filter;
    this.hasEnded = false;
  }
}

// Register the processor
registerProcessor('soundtouch-processor', SoundTouchProcessor);