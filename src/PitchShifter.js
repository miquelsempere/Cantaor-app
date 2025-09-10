/*
 * SoundTouch JS audio processing library
 * Copyright (c) Olli Parviainen
 * Copyright (c) Ryan Berdeen
 * Copyright (c) Jakub Fiala
 * Copyright (c) Steve 'Cutter' Blades
 *
 * This library is free software; you can redistribute it and/or
 * modify it under the terms of the GNU Lesser General Public
 * License as published by the Free Software Foundation; either
 * version 2.1 of the License, or (at your option) any later version.
 *
 * This library is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU
 * Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public
 * License along with this library; if not, write to the Free Software
 * Foundation, Inc., 59 Temple Place, Suite 330, Boston, MA  02111-1307  USA
 */

import WebAudioBufferSource from './WebAudioBufferSource.js';
import SoundTouch from './SoundTouch.js';
import SimpleFilter from './SimpleFilter.js';
import minsSecs from './minsSecs.js';
import noop from './noop.js';

const onUpdate = function (sourcePosition) {
  const currentTimePlayed = this.timePlayed;
  const sampleRate = this.sampleRate;
  this.sourcePosition = sourcePosition;
  this.timePlayed = sourcePosition / sampleRate;
  if (currentTimePlayed !== this.timePlayed) {
    const timePlayed = new CustomEvent('play', {
      detail: {
        timePlayed: this.timePlayed,
        formattedTimePlayed: this.formattedTimePlayed,
        percentagePlayed: this.percentagePlayed,
      },
    });
    this._node.dispatchEvent(timePlayed);
  }
};

export default class PitchShifter {
  constructor(context, buffer, bufferSize) {
    this.context = context;
    this.buffer = buffer;
    this.timePlayed = 0;
    this.sourcePosition = 0;
    
    // Create AudioWorkletNode
    this._node = new AudioWorkletNode(context, 'soundtouch-processor');
    
    // Set up communication with the worklet
    this._node.port.onmessage = (event) => {
      this.handleWorkletMessage(event.data);
    };
    
    // Initialize the worklet with audio buffer data
    this.initializeWorklet();
    
    this.tempo = 1;
    this.rate = 1;
    this.duration = buffer.duration;
    this.sampleRate = context.sampleRate;
    this.listeners = [];
  }

  /**
   * Initialize the AudioWorklet with buffer data
   */
  initializeWorklet() {
    // Transfer AudioBuffer data to the worklet
    const channelData = [];
    for (let i = 0; i < this.buffer.numberOfChannels; i++) {
      const channel = this.buffer.getChannelData(i);
      // Transfer the ArrayBuffer to avoid copying
      channelData.push(channel.buffer.slice());
    }
    
    this._node.port.postMessage({
      type: 'initialize',
      data: {
        channelData: channelData,
        numberOfChannels: this.buffer.numberOfChannels,
        sampleRate: this.buffer.sampleRate,
        length: this.buffer.length
      }
    });
  }

  /**
   * Handle messages from the AudioWorklet
   */
  handleWorkletMessage(message) {
    const { type, data } = message;
    
    switch (type) {
      case 'processor-ready':
        console.log('[PitchShifter] AudioWorklet processor is ready');
        break;
        
      case 'initialized':
        console.log('[PitchShifter] AudioWorklet initialized successfully');
        break;
        
      case 'track-ended':
        console.log('[PitchShifter] Track finished - dispatching end event');
        const endEvent = new CustomEvent('end', {
          detail: {
            timePlayed: this.timePlayed,
            sourcePosition: this.sourcePosition
          }
        });
        this._node.dispatchEvent(endEvent);
        break;
        
      case 'source-position-update':
        this.sourcePosition = data.sourcePosition;
        const currentTimePlayed = this.timePlayed;
        this.timePlayed = this.sourcePosition / this.sampleRate;
        
        if (currentTimePlayed !== this.timePlayed) {
          const playEvent = new CustomEvent('play', {
            detail: {
              timePlayed: this.timePlayed,
              formattedTimePlayed: this.formattedTimePlayed,
              percentagePlayed: this.percentagePlayed,
            },
          });
          this._node.dispatchEvent(playEvent);
        }
        break;
        
      case 'error':
        console.error('[PitchShifter] AudioWorklet error:', data.message);
        break;
        
      default:
        console.warn('[PitchShifter] Unknown message from worklet:', type);
    }
  }

  get formattedDuration() {
    return minsSecs(this.duration);
  }

  get formattedTimePlayed() {
    return minsSecs(this.timePlayed);
  }

  get percentagePlayed() {
    return (100 * this.sourcePosition) / (this.duration * this.sampleRate);
  }

  set percentagePlayed(perc) {
    const newPosition = parseInt(perc * this.duration * this.sampleRate);
    this.sourcePosition = newPosition;
    this.timePlayed = this.sourcePosition / this.sampleRate;
    
    // Send reset message to worklet with new position
    this._node.port.postMessage({
      type: 'reset',
      data: { sourcePosition: newPosition }
    });
  }

  get node() {
    return this._node;
  }

  set pitch(pitch) {
    this._node.port.postMessage({
      type: 'set-pitch',
      data: { pitch: pitch }
    });
  }

  set pitchSemitones(semitone) {
    this._node.port.postMessage({
      type: 'set-pitch-semitones',
      data: { semitones: semitone }
    });
  }

  set rate(rate) {
    this._node.port.postMessage({
      type: 'set-rate',
      data: { rate: rate }
    });
  }

  set tempo(tempo) {
    this._node.port.postMessage({
      type: 'set-tempo',
      data: { tempo: tempo }
    });
  }

  connect(toNode) {
    this._node.connect(toNode);
  }

  disconnect() {
    this._node.disconnect();
  }

  on(eventName, cb) {
    this.listeners.push({ name: eventName, cb: cb });
    this._node.addEventListener(eventName, (event) => cb(event.detail));
  }

  off(eventName = null) {
    let listeners = this.listeners;
    if (eventName) {
      listeners = listeners.filter((e) => e.name === eventName);
    }
    listeners.forEach((e) => {
      this._node.removeEventListener(e.name, (event) => e.cb(event.detail));
    });
  }
}
