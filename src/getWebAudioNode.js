import noop from './noop.js';
/**
 * getWebAudioNode
 *
 * A wrapper to create an AudioNode and apply a filter for frame extraction
 * Copyright (c) Adrian Holovary https://github.com/adrianholovaty
 *
 * @param context - AudioContext
 * @param filter - Object containing an 'extract()' method
 * @param bufferSize - units of sample frames (256, 512, 1024, 2048, 4096, 8192, 16384)
 * @returns {ScriptProcessorNode}
 */
const getWebAudioNode = function (
  context,
  filter,
  sourcePositionCallback = noop,
  bufferSize = 4096
) {
  const node = context.createScriptProcessor(bufferSize, 2, 2);
  const samples = new Float32Array(bufferSize * 2);
  let hasEnded = false;
  let disconnectScheduled = false;

  node.onaudioprocess = (event) => {
    // If disconnection is scheduled, disconnect and stop processing
    if (disconnectScheduled) {
      node.disconnect();
      return;
    }

    // If the track has already ended, fill with silence and return
    if (hasEnded) {
      let left = event.outputBuffer.getChannelData(0);
      let right = event.outputBuffer.getChannelData(1);
      left.fill(0);
      right.fill(0);
      // Schedule disconnection for the next audio process cycle
      disconnectScheduled = true;
      return;
    }

    let left = event.outputBuffer.getChannelData(0);
    let right = event.outputBuffer.getChannelData(1);
    let framesExtracted = filter.extract(samples, bufferSize);
    sourcePositionCallback(filter.sourcePosition);
    
    if (framesExtracted === 0) {
      if (!hasEnded) {
        hasEnded = true;
        filter.onEnd();
        // Don't disconnect immediately - let one more buffer of silence play
      }
    }
    
    let i = 0;
    for (; i < framesExtracted; i++) {
      left[i] = samples[i * 2];
      right[i] = samples[i * 2 + 1];
    }
    
    // Fill remaining buffer with silence if we extracted fewer frames than buffer size
    for (; i < bufferSize; i++) {
      left[i] = 0;
      right[i] = 0;
    }
  };
  return node;
};

export default getWebAudioNode;
