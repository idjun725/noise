import { computeDisturbanceIndex, indexToDb, indexToScore, DEFAULT_PARAMS } from './indexCalculator.js';
import { classifyNoise } from './noiseClassifier.js';

// computeDisturbanceIndex()는 2의 거듭제곱 길이의 프레임 하나만 처리하므로,
// 임의 길이의 녹음 전체를 이 크기로 잘라 프레임별로 계산한 뒤 집계한다.
export const FRAME_SIZE = 4096;

// samples: 모노 PCM 실수 샘플(길이 제한 없음), sampleRate: Hz
export function analyzeRecording(samples, sampleRate, params = {}) {
  const frameCount = Math.floor(samples.length / FRAME_SIZE);
  if (frameCount === 0) {
    throw new Error(`샘플 길이가 프레임 크기(${FRAME_SIZE})보다 짧습니다`);
  }

  let sumI = 0;
  const magnitudeByFreq = new Map();

  for (let f = 0; f < frameCount; f++) {
    const frame = samples.subarray(f * FRAME_SIZE, (f + 1) * FRAME_SIZE);
    const { I, bins } = computeDisturbanceIndex(frame, sampleRate, params);
    sumI += I;
    for (const bin of bins) {
      if (bin.freq <= 0) continue;
      magnitudeByFreq.set(bin.freq, (magnitudeByFreq.get(bin.freq) ?? 0) + bin.magnitude);
    }
  }

  const avgI = sumI / frameCount;

  let dominantFreq = 0;
  let maxMagnitude = -1;
  for (const [freq, magnitude] of magnitudeByFreq) {
    if (magnitude > maxMagnitude) {
      maxMagnitude = magnitude;
      dominantFreq = freq;
    }
  }

  return {
    I: avgI,
    iDb: indexToDb(avgI),
    score: indexToScore(avgI),
    dominantFreq,
    noiseSource: classifyNoise(dominantFreq),
    durationSec: samples.length / sampleRate,
    frameCount,
    params: { ...DEFAULT_PARAMS, ...params },
  };
}
