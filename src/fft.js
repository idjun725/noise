// 반복형(iterative) radix-2 Cooley-Tukey FFT.
// X_k = sum_n x_n * e^{-2*pi*i*k*n/N} (정방향 DFT)와 동일한 결과를 재/허수 배열에 in-place로 채운다.
export function fft(re, im) {
  const n = re.length;
  if (n !== im.length) throw new Error('re/im 배열 길이가 다릅니다');
  if (n <= 1) return;
  if ((n & (n - 1)) !== 0) throw new Error('FFT 크기는 2의 거듭제곱이어야 합니다');

  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }

  for (let len = 2; len <= n; len <<= 1) {
    const half = len >> 1;
    const ang = (-2 * Math.PI) / len;
    const wRe = Math.cos(ang);
    const wIm = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let curRe = 1;
      let curIm = 0;
      for (let j = 0; j < half; j++) {
        const aIdx = i + j;
        const bIdx = aIdx + half;
        const uRe = re[aIdx];
        const uIm = im[aIdx];
        const vRe = re[bIdx] * curRe - im[bIdx] * curIm;
        const vIm = re[bIdx] * curIm + im[bIdx] * curRe;

        re[aIdx] = uRe + vRe;
        im[aIdx] = uIm + vIm;
        re[bIdx] = uRe - vRe;
        im[bIdx] = uIm - vIm;

        const nextRe = curRe * wRe - curIm * wIm;
        const nextIm = curRe * wIm + curIm * wRe;
        curRe = nextRe;
        curIm = nextIm;
      }
    }
  }
}

// Hann 윈도우: 스펙트럼 누설(leakage)을 줄이기 위해 DFT 전에 곱한다.
export function hannWindow(n) {
  const w = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    w[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (n - 1)));
  }
  return w;
}

// 실수 시계열 samples(길이 N, N은 2의 거듭제곱)에 Hann 윈도우를 적용한 뒤 FFT를 수행한다.
export function windowedDft(samples) {
  const n = samples.length;
  const window = hannWindow(n);
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  for (let i = 0; i < n; i++) re[i] = samples[i] * window[i];
  fft(re, im);
  return { re, im };
}
