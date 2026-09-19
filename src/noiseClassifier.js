// 지배 주파수(dominant frequency) 대역에 따른 소음 원인 추정.
// 실제 음원 분리 기법이 아닌 단순 휴리스틱이므로 어디까지나 "추정"으로 표시해야 한다.
const BANDS = [
  { max: 100, label: '초저주파 진동/교통 소음', description: '차량 통행, 공사장 저주파 진동, 실외기 등에서 흔히 나타나는 대역입니다.' },
  { max: 250, label: '저주파 기계음', description: '실외기, 환풍기, 보일러 등 회전 기계의 저음 성분일 가능성이 있습니다.' },
  { max: 1000, label: '중저음 생활 소음', description: 'TV/음악 저음, 발걸음, 가구 이동음 등에서 나타날 수 있습니다.' },
  { max: 4000, label: '중고음 생활/음성 소음', description: '대화, TV/라디오, 일반 생활 소음대입니다.' },
  { max: Infinity, label: '고주파 소음', description: '알람, 마찰음, 전자기기 고음 등에서 나타날 수 있습니다.' },
];

export function classifyNoise(dominantFreq) {
  const band = BANDS.find((b) => dominantFreq < b.max) ?? BANDS[BANDS.length - 1];
  return { label: band.label, description: band.description };
}
