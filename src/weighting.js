// 표준 A-weighting (IEC 61672-1 Annex E)의 dB 보정값 A(f).
// 1kHz 부근에서 0dB, 저주파로 갈수록 큰 음수(감쇠)를 갖는다.
export function aWeightingDb(f) {
  if (f <= 0) return -Infinity;
  const f2 = f * f;
  const num = 12194 ** 2 * f2 * f2;
  const den =
    (f2 + 20.6 ** 2) *
    Math.sqrt((f2 + 107.7 ** 2) * (f2 + 737.9 ** 2)) *
    (f2 + 12194 ** 2);
  return 2.0 + 20 * Math.log10(num / den);
}

// A(f)(dB)를 진폭 배율로 환산한 w_A(f) = 10^(A(f)/20).
export function aWeightingLinear(f) {
  if (f <= 0) return 0;
  return 10 ** (aWeightingDb(f) / 20);
}

// 문서 5절의 w(f): f0 아래는 w_A(f0)*(f0/f)^gamma로 보정, f0 이상은 A-weighting 그대로 유지.
// f=f0에서 두 식이 w_A(f0)로 일치하므로 경계에서 연속이다.
export function perceptualWeight(f, { f0, gamma }) {
  if (f <= 0) return 0;
  if (f < f0) {
    return aWeightingLinear(f0) * (f0 / f) ** gamma;
  }
  return aWeightingLinear(f);
}
