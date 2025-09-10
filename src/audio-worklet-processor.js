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

// Import SoundTouch classes for audio processing
import SoundTouch from './SoundTouch.js';
import SimpleFilter from './SimpleFilter.js';
import WebAudioBufferSource from './WebAudioBufferSource.js';
import FifoSampleBuffer from './FifoSampleBuffer.js';
import RateTransposer from './RateTransposer.js';
import Stretch from './Stretch.js';
import testFloatEqual from './testFloatEqual.js';
import minsSecs from './minsSecs.js';

class SoundTouchProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    
    // Audio processing components
    this.audioBuffer = null;
    this.bufferSource = null;
    this.soundTouch = null;
    this.filter = null;
    
    // Processing state
    this.samples = new Float32Array(128 * 2); // Default quantum size * 2 channels
    this.hasEnded = false;
    this.isInitialized = false;
    this.sourcePosition = 0;
    
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
        this.initializeAudioProcessing(data);
        break;
        
      case 'set-tempo':
        if (this.soundTouch) {
          this.soundTouch.tempo = data.tempo;
        }
        break;
        
      case 'set-pitch':
        if (this.soundTouch) {
          this.soundTouch.pitch = data.pitch;
        }
        break;
        
      case 'set-pitch-semitones':
        if (this.soundTouch) {
          this.soundTouch.pitchSemitones = data.semitones;
        }
        break;
        
      case 'set-rate':
        if (this.soundTouch) {
          this.soundTouch.rate = data.rate;
        }
        break;
        
      case 'reset':
        this.hasEnded = false;
        this.sourcePosition = data.sourcePosition || 0;
        if (this.filter) {
          this.filter.clear();
          this.filter.sourcePosition = this.sourcePosition;
        }
        break;
        
      default:
        console.warn('Unknown message type in SoundTouchProcessor:', type);
    }
  }

  /**
   * Initialize the complete audio processing chain
   */
  initializeAudioProcessing(data) {
    try {
      const { channelData, numberOfChannels, sampleRate, length } = data;
      
      if (!channelData || !numberOfChannels || !sampleRate || !length) {
        throw new Error('Incomplete AudioBuffer data provided for initialization');
      }
      
      // Convert transferred ArrayBuffers back to Float32Arrays
      const processedChannelData = channelData.map(arrayBuffer => {
        if (arrayBuffer instanceof ArrayBuffer) {
          return new Float32Array(arrayBuffer);
        } else if (arrayBuffer instanceof Float32Array) {
          return arrayBuffer;
        } else {
          throw new Error('Invalid channel data format');
        }
      });
      
      // Create a worklet-compatible AudioBuffer representation
      this.audioBuffer = {
        numberOfChannels: numberOfChannels,
        sampleRate: sampleRate,
        length: length,
        duration: length / sampleRate,
        channelData: processedChannelData
      };
      
      // Create WebAudioBufferSource for the worklet
      this.bufferSource = new WebAudioBufferSource(this.audioBuffer);
      
      // Create SoundTouch instance  
      this.soundTouch = new SoundTouch();
      
      // Create SimpleFilter
      this.filter = new SimpleFilter(this.bufferSource, this.soundTouch, () => {
        // onEnd callback
        this.hasEnded = true;
        this.port.postMessage({
          type: 'track-ended'
        });
      });
      
      this.isInitialized = true;
      this.hasEnded = false;
      this.sourcePosition = 0;
      
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
        
        // Update source position
        if (this.filter.sourcePosition !== this.sourcePosition) {
          this.sourcePosition = this.filter.sourcePosition || 0;
        
          // Send source position update to main thread
          this.port.postMessage({
            type: 'source-position-update',
            data: { sourcePosition: this.sourcePosition }
          });
        }
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
}

// Register the processor
registerProcessor('soundtouch-processor', SoundTouchProcessor);