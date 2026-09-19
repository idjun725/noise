import { windowedDft } from './fft.js';
import { perceptualWeight } from './weighting.js';
import { wallTransfer } from './wallTransfer.js';

export const DEFAULT_PARAMS = {
  fc: 200, // 벽 차단 주파수(Hz) - 문서 6절, 벽 종류별로 조정 필요
  f0: 200, // 저주파 보정 경계(Hz) - 문서 6절, 실험으로 결정 필요
  gamma: 1.0, // 저주파 영향의 비선형 지수 - 문서 6, 8절
};

// 문서 2절: I = sum_k w(f_k) * |H(f_k) * X(f_k)|^2
// samples: 시간영역 실수 샘플(길이는 2의 거듭제곱), sampleRate: Hz
export function computeDisturbanceIndex(samples, sampleRate, params = {}) {
  const { fc, f0, gamma } = { ...DEFAULT_PARAMS, ...params };
  const n = samples.length;
  const { re, im } = windowedDft(samples);

  const half = n / 2;
  const bins = new Array(half + 1);
  let total = 0;

  for (let k = 0; k <= half; k++) {
    const freq = (k * sampleRate) / n;
    const magX = Math.hypot(re[k], im[k]);
    const h = wallTransfer(freq, fc);
    const w = perceptualWeight(freq, { f0, gamma });
    const contribution = w * (h * magX) ** 2;
    total += contribution;
    bins[k] = { freq, magnitude: magX, h, w, contribution };
  }

  return { I: total, bins, dominant: findDominantBin(bins) };
}

// DC(0Hz) 성분은 제외하고 가장 에너지가 큰 주파수 성분을 찾는다.
function findDominantBin(bins) {
  let best = null;
  for (let k = 1; k < bins.length; k++) {
    if (best === null || bins[k].magnitude > best.magnitude) best = bins[k];
  }
  return best ?? bins[0];
}

// 지표를 사용자에게 보여주기 위한 보조 변환.
// I는 문서 7절대로 "성가심 예측을 위한 지표"일 뿐 절대 기준이 아니므로,
// 여기서의 dB/score 변환은 화면 표시용 근사치이며 문서 8절 실험을 통한 보정이 필요하다.
export function indexToDb(I) {
  return 10 * Math.log10(I + 1e-12);
}

export function indexToScore(I, { refDb = -60, spanDb = 90 } = {}) {
  const db = indexToDb(I);
  const score = ((db - refDb) / spanDb) * 100;
  return Math.min(100, Math.max(0, score));
}
