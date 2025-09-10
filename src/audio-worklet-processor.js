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

// Import SoundTouch classes - these need to be available in the AudioWorklet scope
// Note: We'll need to ensure these are properly imported or bundled for the worklet

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
        
      case 'reset':
        this.hasEnded = false;
        this.sourcePosition = 0;
        if (this.filter) {
          this.filter.clear();
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
      
      // Create a worklet-compatible AudioBuffer representation
      this.audioBuffer = {
        numberOfChannels: numberOfChannels,
        sampleRate: sampleRate,
        length: length,
        duration: length / sampleRate,
        channelData: channelData.map(data => new Float32Array(data))
      };
      
      // Create WebAudioBufferSource equivalent for the worklet
      this.bufferSource = new WorkletAudioBufferSource(audioBuffer);
      
      // Create SoundTouch instance
      this.soundTouch = new WorkletSoundTouch();
      
      // Create SimpleFilter equivalent
      this.filter = new WorkletSimpleFilter(this.bufferSource, this.soundTouch, () => {
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
        this.sourcePosition = this.filter.sourcePosition || 0;
        
        // Send source position update to main thread
        this.port.postMessage({
          type: 'source-position-update',
          data: { sourcePosition: this.sourcePosition }
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
}

/**
 * Worklet-compatible version of WebAudioBufferSource
 */
class WorkletAudioBufferSource {
  constructor(buffer) {
    this.buffer = buffer;
    this._position = 0;
  }

  get dualChannel() {
    return this.buffer.numberOfChannels > 1;
  }

  get position() {
    return this._position;
  }

  set position(value) {
    this._position = value;
  }

  extract(target, numFrames = 0, position = 0) {
    this.position = position;
    
    // Get channel data from our worklet AudioBuffer representation
    const left = this.buffer.channelData[0];
    const right = this.dualChannel ? 
      this.buffer.channelData[1] : 
      this.buffer.channelData[0];
    
    let i = 0;
    for (; i < numFrames && (i + position) < left.length; i++) {
      target[i * 2] = left[i + position];
      target[i * 2 + 1] = right[i + position];
    }
    
    return Math.min(numFrames, left.length - position);
  }
}

/**
 * Worklet-compatible version of SoundTouch
 * This is a simplified version that would need the full SoundTouch implementation
 */
class WorkletSoundTouch {
  constructor() {
    // Initialize SoundTouch components
    // This would need the actual SoundTouch, RateTransposer, Stretch classes
    // For now, we'll create a placeholder that passes audio through
    this._tempo = 1.0;
    this._pitch = 1.0;
    this._rate = 1.0;
    
    // TODO: Initialize actual SoundTouch components
    // this.transposer = new RateTransposer(false);
    // this.stretch = new Stretch(false);
    // etc.
  }

  get tempo() {
    return this._tempo;
  }

  set tempo(tempo) {
    this._tempo = tempo;
    // TODO: Apply to actual SoundTouch components
  }

  get pitch() {
    return this._pitch;
  }

  set pitch(pitch) {
    this._pitch = pitch;
    // TODO: Apply to actual SoundTouch components
  }

  set pitchSemitones(semitones) {
    this.pitch = Math.pow(2, semitones / 12);
  }

  get inputBuffer() {
    // TODO: Return actual input buffer
    return null;
  }

  get outputBuffer() {
    // TODO: Return actual output buffer
    return null;
  }

  process() {
    // TODO: Implement actual SoundTouch processing
  }

  clear() {
    // TODO: Clear SoundTouch buffers
  }
}

/**
 * Worklet-compatible version of SimpleFilter
 */
class WorkletSimpleFilter {
  constructor(sourceSound, pipe, callback) {
    this.sourceSound = sourceSound;
    this.pipe = pipe;
    this.callback = callback;
    this.historyBufferSize = 22050;
    this._sourcePosition = 0;
    this.outputBufferPosition = 0;
    this._position = 0;
  }

  get sourcePosition() {
    return this._sourcePosition;
  }

  set sourcePosition(sourcePosition) {
    this.clear();
    this._sourcePosition = sourcePosition;
  }

  onEnd() {
    if (this.callback) {
      this.callback();
    }
  }

  extract(target, numFrames = 0) {
    // For now, we'll pass through the audio without SoundTouch processing
    // This is a placeholder until we implement the full SoundTouch chain in the worklet
    
    const numFramesExtracted = this.sourceSound.extract(
      target,
      numFrames,
      this._sourcePosition
    );
    
    this._sourcePosition += numFramesExtracted;
    this._position += numFramesExtracted;
    
    // Check if we've reached the end
    if (numFramesExtracted === 0 || this._sourcePosition >= this.sourceSound.buffer.length) {
      this.onEnd();
    }
    
    return numFramesExtracted;
  }

  clear() {
    // TODO: Clear filter state
    this.outputBufferPosition = 0;
    if (this.pipe) {
      this.pipe.clear();
    }
  }

  fillInputBuffer(numFrames = 0) {
    // TODO: Implement input buffer filling for SoundTouch processing
  }

  fillOutputBuffer(numFrames = 0) {
    // TODO: Implement output buffer filling for SoundTouch processing
  }
}

// Register the processor
registerProcessor('soundtouch-processor', SoundTouchProcessor);