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

// Since AudioWorklets have limited import support, we need to include the SoundTouch classes inline

// FifoSampleBuffer class
class FifoSampleBuffer {
  constructor() {
    this._vector = new Float32Array();
    this._position = 0;
    this._frameCount = 0;
  }

  get vector() {
    return this._vector;
  }

  get position() {
    return this._position;
  }

  get startIndex() {
    return this._position * 2;
  }

  get frameCount() {
    return this._frameCount;
  }

  get endIndex() {
    return (this._position + this._frameCount) * 2;
  }

  clear() {
    this.receive(this._frameCount);
    this.rewind();
  }

  put(numFrames) {
    this._frameCount += numFrames;
  }

  putSamples(samples, position, numFrames = 0) {
    position = position || 0;
    const sourceOffset = position * 2;
    if (!(numFrames >= 0)) {
      numFrames = (samples.length - sourceOffset) / 2;
    }
    const numSamples = numFrames * 2;

    this.ensureCapacity(numFrames + this._frameCount);

    const destOffset = this.endIndex;
    this.vector.set(
      samples.subarray(sourceOffset, sourceOffset + numSamples),
      destOffset
    );

    this._frameCount += numFrames;
  }

  putBuffer(buffer, position, numFrames = 0) {
    position = position || 0;
    if (!(numFrames >= 0)) {
      numFrames = buffer.frameCount - position;
    }
    this.putSamples(buffer.vector, buffer.position + position, numFrames);
  }

  receive(numFrames) {
    if (!(numFrames >= 0) || numFrames > this._frameCount) {
      numFrames = this.frameCount;
    }
    this._frameCount -= numFrames;
    this._position += numFrames;
  }

  receiveSamples(output, numFrames = 0) {
    const numSamples = numFrames * 2;
    const sourceOffset = this.startIndex;
    output.set(this._vector.subarray(sourceOffset, sourceOffset + numSamples));
    this.receive(numFrames);
  }

  extract(output, position = 0, numFrames = 0) {
    const sourceOffset = this.startIndex + position * 2;
    const numSamples = numFrames * 2;
    output.set(this._vector.subarray(sourceOffset, sourceOffset + numSamples));
  }

  ensureCapacity(numFrames = 0) {
    const minLength = parseInt(numFrames * 2);
    if (this._vector.length < minLength) {
      const newVector = new Float32Array(minLength);
      newVector.set(this._vector.subarray(this.startIndex, this.endIndex));
      this._vector = newVector;
      this._position = 0;
    } else {
      this.rewind();
    }
  }

  ensureAdditionalCapacity(numFrames = 0) {
    this.ensureCapacity(this._frameCount + numFrames);
  }

  rewind() {
    if (this._position > 0) {
      this._vector.set(this._vector.subarray(this.startIndex, this.endIndex));
      this._position = 0;
    }
  }
}

// AbstractFifoSamplePipe class
class AbstractFifoSamplePipe {
  constructor(createBuffers) {
    if (createBuffers) {
      this._inputBuffer = new FifoSampleBuffer();
      this._outputBuffer = new FifoSampleBuffer();
    } else {
      this._inputBuffer = this._outputBuffer = null;
    }
  }

  get inputBuffer() {
    return this._inputBuffer;
  }

  set inputBuffer(inputBuffer) {
    this._inputBuffer = inputBuffer;
  }

  get outputBuffer() {
    return this._outputBuffer;
  }

  set outputBuffer(outputBuffer) {
    this._outputBuffer = outputBuffer;
  }

  clear() {
    this._inputBuffer.clear();
    this._outputBuffer.clear();
  }
}

// RateTransposer class
class RateTransposer extends AbstractFifoSamplePipe {
  constructor(createBuffers) {
    super(createBuffers);
    this.reset();
    this._rate = 1;
  }

  set rate(rate) {
    this._rate = rate;
  }

  reset() {
    this.slopeCount = 0;
    this.prevSampleL = 0;
    this.prevSampleR = 0;
  }

  clone() {
    const result = new RateTransposer();
    result.rate = this._rate;
    return result;
  }

  process() {
    const numFrames = this._inputBuffer.frameCount;
    this._outputBuffer.ensureAdditionalCapacity(numFrames / this._rate + 1);
    const numFramesOutput = this.transpose(numFrames);
    this._inputBuffer.receive();
    this._outputBuffer.put(numFramesOutput);
  }

  transpose(numFrames = 0) {
    if (numFrames === 0) {
      return 0;
    }

    const src = this._inputBuffer.vector;
    const srcOffset = this._inputBuffer.startIndex;

    const dest = this._outputBuffer.vector;
    const destOffset = this._outputBuffer.endIndex;

    let used = 0;
    let i = 0;

    while (this.slopeCount < 1.0) {
      dest[destOffset + 2 * i] =
        (1.0 - this.slopeCount) * this.prevSampleL +
        this.slopeCount * src[srcOffset];
      dest[destOffset + 2 * i + 1] =
        (1.0 - this.slopeCount) * this.prevSampleR +
        this.slopeCount * src[srcOffset + 1];
      i = i + 1;
      this.slopeCount += this._rate;
    }

    this.slopeCount -= 1.0;

    if (numFrames !== 1) {
      out: while (true) {
        while (this.slopeCount > 1.0) {
          this.slopeCount -= 1.0;
          used = used + 1;
          if (used >= numFrames - 1) {
            break out;
          }
        }

        const srcIndex = srcOffset + 2 * used;
        dest[destOffset + 2 * i] =
          (1.0 - this.slopeCount) * src[srcIndex] +
          this.slopeCount * src[srcIndex + 2];
        dest[destOffset + 2 * i + 1] =
          (1.0 - this.slopeCount) * src[srcIndex + 1] +
          this.slopeCount * src[srcIndex + 3];

        i = i + 1;
        this.slopeCount += this._rate;
      }
    }

    this.prevSampleL = src[srcOffset + 2 * numFrames - 2];
    this.prevSampleR = src[srcOffset + 2 * numFrames - 1];

    return i;
  }
}

// Stretch class (simplified version)
class Stretch extends AbstractFifoSamplePipe {
  constructor(createBuffers) {
    super(createBuffers);
    this._quickSeek = true;
    this.midBufferDirty = false;
    this.midBuffer = null;
    this.overlapLength = 0;
    this.autoSeqSetting = true;
    this.autoSeekSetting = true;
    this._tempo = 1;
    this.setParameters(44100, 0, 0, 8);
  }

  clear() {
    super.clear();
    this.clearMidBuffer();
  }

  clearMidBuffer() {
    if (this.midBufferDirty) {
      this.midBufferDirty = false;
      this.midBuffer = null;
    }
  }

  setParameters(sampleRate, sequenceMs, seekWindowMs, overlapMs) {
    if (sampleRate > 0) {
      this.sampleRate = sampleRate;
    }
    if (overlapMs > 0) {
      this.overlapMs = overlapMs;
    }
    if (sequenceMs > 0) {
      this.sequenceMs = sequenceMs;
      this.autoSeqSetting = false;
    } else {
      this.autoSeqSetting = true;
    }
    if (seekWindowMs > 0) {
      this.seekWindowMs = seekWindowMs;
      this.autoSeekSetting = false;
    } else {
      this.autoSeekSetting = true;
    }

    this.calculateSequenceParameters();
    this.calculateOverlapLength(this.overlapMs);
    this.tempo = this._tempo;
  }

  set tempo(newTempo) {
    this._tempo = newTempo;
    this.calculateSequenceParameters();
    this.nominalSkip = this._tempo * (this.seekWindowLength - this.overlapLength);
    this.skipFract = 0;
    const intskip = Math.floor(this.nominalSkip + 0.5);
    this.sampleReq = Math.max(intskip + this.overlapLength, this.seekWindowLength) + this.seekLength;
  }

  get tempo() {
    return this._tempo;
  }

  calculateOverlapLength(overlapInMsec = 0) {
    let newOvl = (this.sampleRate * overlapInMsec) / 1000;
    newOvl = newOvl < 16 ? 16 : newOvl;
    newOvl -= newOvl % 8;
    this.overlapLength = newOvl;
    this.refMidBuffer = new Float32Array(this.overlapLength * 2);
    this.midBuffer = new Float32Array(this.overlapLength * 2);
  }

  calculateSequenceParameters() {
    const AUTOSEQ_TEMPO_LOW = 0.25;
    const AUTOSEQ_TEMPO_TOP = 4.0;
    const AUTOSEQ_AT_MIN = 125.0;
    const AUTOSEQ_AT_MAX = 50.0;
    const AUTOSEQ_K = (AUTOSEQ_AT_MAX - AUTOSEQ_AT_MIN) / (AUTOSEQ_TEMPO_TOP - AUTOSEQ_TEMPO_LOW);
    const AUTOSEQ_C = AUTOSEQ_AT_MIN - AUTOSEQ_K * AUTOSEQ_TEMPO_LOW;

    const AUTOSEEK_AT_MIN = 25.0;
    const AUTOSEEK_AT_MAX = 15.0;
    const AUTOSEEK_K = (AUTOSEEK_AT_MAX - AUTOSEEK_AT_MIN) / (AUTOSEQ_TEMPO_TOP - AUTOSEQ_TEMPO_LOW);
    const AUTOSEEK_C = AUTOSEEK_AT_MIN - AUTOSEEK_K * AUTOSEQ_TEMPO_LOW;

    if (this.autoSeqSetting) {
      let seq = AUTOSEQ_C + AUTOSEQ_K * this._tempo;
      seq = seq < AUTOSEQ_AT_MAX ? AUTOSEQ_AT_MAX : seq > AUTOSEQ_AT_MIN ? AUTOSEQ_AT_MIN : seq;
      this.sequenceMs = Math.floor(seq + 0.5);
    }

    if (this.autoSeekSetting) {
      let seek = AUTOSEEK_C + AUTOSEEK_K * this._tempo;
      seek = seek < AUTOSEEK_AT_MAX ? AUTOSEEK_AT_MAX : seek > AUTOSEEK_AT_MIN ? AUTOSEEK_AT_MIN : seek;
      this.seekWindowMs = Math.floor(seek + 0.5);
    }

    this.seekWindowLength = Math.floor((this.sampleRate * this.sequenceMs) / 1000);
    this.seekLength = Math.floor((this.sampleRate * this.seekWindowMs) / 1000);
  }

  process() {
    if (this.midBuffer === null) {
      if (this._inputBuffer.frameCount < this.overlapLength) {
        return;
      }
      this.midBuffer = new Float32Array(this.overlapLength * 2);
      this._inputBuffer.receiveSamples(this.midBuffer, this.overlapLength);
    }

    while (this._inputBuffer.frameCount >= this.sampleReq) {
      const offset = this.seekBestOverlapPosition();
      this._outputBuffer.ensureAdditionalCapacity(this.overlapLength);
      this.overlap(Math.floor(offset));
      this._outputBuffer.put(this.overlapLength);

      const temp = this.seekWindowLength - 2 * this.overlapLength;
      if (temp > 0) {
        this._outputBuffer.putBuffer(this._inputBuffer, offset + this.overlapLength, temp);
      }

      const start = this._inputBuffer.startIndex + 2 * (offset + this.seekWindowLength - this.overlapLength);
      this.midBuffer.set(this._inputBuffer.vector.subarray(start, start + 2 * this.overlapLength));

      this.skipFract += this.nominalSkip;
      const overlapSkip = Math.floor(this.skipFract);
      this.skipFract -= overlapSkip;
      this._inputBuffer.receive(overlapSkip);
    }
  }

  seekBestOverlapPosition() {
    return 0; // Simplified implementation
  }

  overlap(overlapPosition) {
    this.overlapStereo(2 * overlapPosition);
  }

  overlapStereo(inputPosition) {
    const input = this._inputBuffer.vector;
    inputPosition += this._inputBuffer.startIndex;
    const output = this._outputBuffer.vector;
    const outputPosition = this._outputBuffer.endIndex;

    for (let i = 0; i < this.overlapLength; i++) {
      const tempFrame = (this.overlapLength - i) / this.overlapLength;
      const fi = i / this.overlapLength;
      const context = 2 * i;
      const inputOffset = context + inputPosition;
      const outputOffset = context + outputPosition;
      output[outputOffset + 0] = input[inputOffset + 0] * fi + this.midBuffer[context + 0] * tempFrame;
      output[outputOffset + 1] = input[inputOffset + 1] * fi + this.midBuffer[context + 1] * tempFrame;
    }
  }
}

// testFloatEqual function
function testFloatEqual(a, b) {
  return (a > b ? a - b : b - a) > 1e-10;
}

// SoundTouch class
class SoundTouch {
  constructor() {
    this.transposer = new RateTransposer(false);
    this.stretch = new Stretch(false);

    this._inputBuffer = new FifoSampleBuffer();
    this._intermediateBuffer = new FifoSampleBuffer();
    this._outputBuffer = new FifoSampleBuffer();

    this._rate = 0;
    this._tempo = 0;

    this.virtualPitch = 1.0;
    this.virtualRate = 1.0;
    this.virtualTempo = 1.0;

    this.calculateEffectiveRateAndTempo();
  }

  clear() {
    this.transposer.clear();
    this.stretch.clear();
  }

  get rate() {
    return this._rate;
  }

  set rate(rate) {
    this.virtualRate = rate;
    this.calculateEffectiveRateAndTempo();
  }

  get tempo() {
    return this._tempo;
  }

  set tempo(tempo) {
    this.virtualTempo = tempo;
    this.calculateEffectiveRateAndTempo();
  }

  set pitch(pitch) {
    this.virtualPitch = pitch;
    this.calculateEffectiveRateAndTempo();
  }

  set pitchSemitones(pitchSemitones) {
    this.pitchOctaves = pitchSemitones / 12.0;
  }

  set pitchOctaves(pitchOctaves) {
    this.pitch = Math.exp(0.69314718056 * pitchOctaves);
    this.calculateEffectiveRateAndTempo();
  }

  get inputBuffer() {
    return this._inputBuffer;
  }

  get outputBuffer() {
    return this._outputBuffer;
  }

  calculateEffectiveRateAndTempo() {
    const previousTempo = this._tempo;
    const previousRate = this._rate;

    this._tempo = this.virtualTempo / this.virtualPitch;
    this._rate = this.virtualRate * this.virtualPitch;

    if (testFloatEqual(this._tempo, previousTempo)) {
      this.stretch.tempo = this._tempo;
    }
    if (testFloatEqual(this._rate, previousRate)) {
      this.transposer.rate = this._rate;
    }

    if (this._rate > 1.0) {
      if (this._outputBuffer != this.transposer.outputBuffer) {
        this.stretch.inputBuffer = this._inputBuffer;
        this.stretch.outputBuffer = this._intermediateBuffer;

        this.transposer.inputBuffer = this._intermediateBuffer;
        this.transposer.outputBuffer = this._outputBuffer;
      }
    } else {
      if (this._outputBuffer != this.stretch.outputBuffer) {
        this.transposer.inputBuffer = this._inputBuffer;
        this.transposer.outputBuffer = this._intermediateBuffer;

        this.stretch.inputBuffer = this._intermediateBuffer;
        this.stretch.outputBuffer = this._outputBuffer;
      }
    }
  }

  process() {
    if (this._rate > 1.0) {
      this.stretch.process();
      this.transposer.process();
    } else {
      this.transposer.process();
      this.stretch.process();
    }
  }
}

// WebAudioBufferSource class
class WebAudioBufferSource {
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
    
    let left, right;
    if (this.buffer.getChannelData) {
      left = this.buffer.getChannelData(0);
      right = this.dualChannel ? this.buffer.getChannelData(1) : this.buffer.getChannelData(0);
    } else if (this.buffer.channelData) {
      left = this.buffer.channelData[0];
      right = this.dualChannel ? this.buffer.channelData[1] : this.buffer.channelData[0];
    } else {
      throw new Error('Invalid buffer format');
    }
    
    let i = 0;
    for (; i < numFrames; i++) {
      target[i * 2] = left[i + position];
      target[i * 2 + 1] = right[i + position];
    }
    return Math.min(numFrames, left.length - position);
  }
}

// FilterSupport class
class FilterSupport {
  constructor(pipe) {
    this._pipe = pipe;
  }

  get pipe() {
    return this._pipe;
  }

  get inputBuffer() {
    return this._pipe.inputBuffer;
  }

  get outputBuffer() {
    return this._pipe.outputBuffer;
  }

  fillInputBuffer(numFrames) {
    throw new Error('fillInputBuffer() not overridden');
  }

  fillOutputBuffer(numFrames = 0) {
    while (this.outputBuffer.frameCount < numFrames) {
      const numInputFrames = 8192 * 2 - this.inputBuffer.frameCount;
      this.fillInputBuffer(numInputFrames);
      if (this.inputBuffer.frameCount < 8192 * 2) {
        break;
      }
      this._pipe.process();
    }
  }

  clear() {
    this._pipe.clear();
  }
}

// SimpleFilter class
class SimpleFilter extends FilterSupport {
  constructor(sourceSound, pipe, callback) {
    super(pipe);
    this.callback = callback || (() => {});
    this.sourceSound = sourceSound;
    this.historyBufferSize = 22050;
    this._sourcePosition = 0;
    this.outputBufferPosition = 0;
    this._position = 0;
  }

  get position() {
    return this._position;
  }

  set position(position) {
    if (position > this._position) {
      throw new RangeError('New position may not be greater than current position');
    }
    const newOutputBufferPosition = this.outputBufferPosition - (this._position - position);
    if (newOutputBufferPosition < 0) {
      throw new RangeError('New position falls outside of history buffer');
    }
    this.outputBufferPosition = newOutputBufferPosition;
    this._position = position;
  }

  get sourcePosition() {
    return this._sourcePosition;
  }

  set sourcePosition(sourcePosition) {
    this.clear();
    this._sourcePosition = sourcePosition;
  }

  onEnd() {
    console.log('[SimpleFilter] onEnd() called in AudioWorklet - executing callback');
    this.callback();
  }

  fillInputBuffer(numFrames = 0) {
    const samples = new Float32Array(numFrames * 2);
    const numFramesExtracted = this.sourceSound.extract(samples, numFrames, this._sourcePosition);
    this._sourcePosition += numFramesExtracted;
    this.inputBuffer.putSamples(samples, 0, numFramesExtracted);
  }

  extract(target, numFrames = 0) {
    this.fillOutputBuffer(this.outputBufferPosition + numFrames);

    const numFramesExtracted = Math.min(
      numFrames,
      this.outputBuffer.frameCount - this.outputBufferPosition
    );
    this.outputBuffer.extract(target, this.outputBufferPosition, numFramesExtracted);

    const currentFrames = this.outputBufferPosition + numFramesExtracted;
    this.outputBufferPosition = Math.min(this.historyBufferSize, currentFrames);
    this.outputBuffer.receive(Math.max(currentFrames - this.historyBufferSize, 0));

    this._position += numFramesExtracted;
    return numFramesExtracted;
  }

  clear() {
    super.clear();
    this.outputBufferPosition = 0;
  }
}

// Main AudioWorklet Processor
class SoundTouchProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    
    // Audio processing components
    this.audioBuffer = null;
    this.bufferSource = null;
    this.soundTouch = null;
    this.filter = null;
    
    // Processing state
    this.samples = new Float32Array(128 * 2);
    this.hasEnded = false;
    this.isInitialized = false;
    this.sourcePosition = 0;
    
    // Communication with main thread
    this.port.onmessage = this.handleMessage.bind(this);
    
    console.log('[AudioWorklet] SoundTouchProcessor created');
    
    // Send ready signal to main thread
    this.port.postMessage({
      type: 'processor-ready'
    });
  }

  handleMessage(event) {
    const { type, data } = event.data;
    
    console.log(`[AudioWorklet] Received message: ${type}`);
    
    switch (type) {
      case 'initialize':
        this.initializeAudioProcessing(data);
        break;
        
      case 'set-tempo':
        if (this.soundTouch) {
          console.log(`[AudioWorklet] Setting tempo to: ${data.tempo}`);
          this.soundTouch.tempo = data.tempo;
        }
        break;
        
      case 'set-pitch':
        if (this.soundTouch) {
          console.log(`[AudioWorklet] Setting pitch to: ${data.pitch}`);
          this.soundTouch.pitch = data.pitch;
        }
        break;
        
      case 'set-pitch-semitones':
        if (this.soundTouch) {
          console.log(`[AudioWorklet] Setting pitch semitones to: ${data.semitones}`);
          this.soundTouch.pitchSemitones = data.semitones;
        }
        break;
        
      case 'set-rate':
        if (this.soundTouch) {
          console.log(`[AudioWorklet] Setting rate to: ${data.rate}`);
          this.soundTouch.rate = data.rate;
        }
        break;
        
      case 'reset':
        console.log(`[AudioWorklet] Resetting to position: ${data.sourcePosition || 0}`);
        this.hasEnded = false;
        this.sourcePosition = data.sourcePosition || 0;
        if (this.filter) {
          this.filter.clear();
          this.filter.sourcePosition = this.sourcePosition;
        }
        break;
        
      default:
        console.warn('[AudioWorklet] Unknown message type:', type);
    }
  }

  initializeAudioProcessing(data) {
    try {
      console.log('[AudioWorklet] Initializing audio processing...');
      
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
      
      console.log(`[AudioWorklet] AudioBuffer created: ${numberOfChannels} channels, ${length} frames, ${sampleRate} Hz`);
      
      // Create WebAudioBufferSource for the worklet
      this.bufferSource = new WebAudioBufferSource(this.audioBuffer);
      
      // Create SoundTouch instance  
      this.soundTouch = new SoundTouch();
      
      // Create SimpleFilter with callback for track end
      this.filter = new SimpleFilter(this.bufferSource, this.soundTouch, () => {
        console.log('[AudioWorklet] Track ended callback triggered');
        this.hasEnded = true;
        this.port.postMessage({
          type: 'track-ended'
        });
      });
      
      this.isInitialized = true;
      this.hasEnded = false;
      this.sourcePosition = 0;
      
      console.log('[AudioWorklet] Audio processing chain initialized successfully');
      
      // Notify main thread that initialization is complete
      this.port.postMessage({
        type: 'initialized'
      });
      
    } catch (error) {
      console.error('[AudioWorklet] Error initializing filter:', error);
      this.port.postMessage({
        type: 'error',
        data: { message: error.message }
      });
    }
  }

  process(inputs, outputs, parameters) {
    // If not initialized or has ended, output silence
    if (!this.isInitialized || this.hasEnded) {
      const output = outputs[0];
      if (output && output.length >= 2) {
        output[0].fill(0);
        output[1].fill(0);
      }
      return !this.hasEnded;
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
          console.log('[AudioWorklet] No more frames extracted - track ended');
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
      console.error('[AudioWorklet] Error in process:', error);
      
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