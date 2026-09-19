// 문서 4절의 벽 전달함수 H(f): 질량법칙에서 유도한 단순화 모델.
// f <= fc(차단주파수)는 그대로 통과(H=1), 그 위는 fc/f로 감쇠한다.
export function wallTransfer(f, fc) {
  if (f <= 0) return 1;
  return f <= fc ? 1 : fc / f;
}
