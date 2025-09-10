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

export default class WebAudioBufferSource {
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
    
    // Handle both regular AudioBuffer and worklet buffer representation
    let left, right;
    if (this.buffer.getChannelData) {
      // Regular AudioBuffer
      left = this.buffer.getChannelData(0);
      right = this.dualChannel
        ? this.buffer.getChannelData(1)
        : this.buffer.getChannelData(0);
    } else if (this.buffer.channelData) {
      // Worklet buffer representation
      left = this.buffer.channelData[0];
      right = this.dualChannel
        ? this.buffer.channelData[1]
        : this.buffer.channelData[0];
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
