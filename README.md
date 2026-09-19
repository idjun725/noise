# 소음 방해지수(I) 측정기

첨부된 연구 노트(`벽을 통과한 저주파 소음의 실내 영향 예측 지표 I`)의 수식을 구현한
클라이언트-서버 구조의 웹 앱입니다. 화면은 4개로 구성됩니다.

- **메인 화면**: 아래 3개 화면으로 이동하는 버튼
- **화면 1 (실시간 녹음 분석)**: 마이크로 녹음 → 백엔드에 분석 요청
- **화면 2 (파일 업로드 분석)**: 오디오 파일 업로드 → 백엔드에 분석 요청
- **화면 3 (분석 결과)**: 그동안의 분석 결과를 리스트로 표시(녹음 길이, 소음 데시벨, 소음 원인),
  결과별로 선택 입력을 받아 신고에 참고할 정보를 저장

현재는 기능 구현에 집중한 상태이며, UI 디자인은 추후 다듬을 예정입니다.

## 실행 방법

마이크 접근(`getUserMedia`)은 보안 컨텍스트(HTTPS 또는 localhost)에서만 동작하므로,
백엔드 서버를 띄운 뒤 그 주소로 접속해야 합니다.

```bash
npm start
# http://localhost:3000 에서 확인 (PORT 환경변수로 변경 가능)
```

## 아키텍처

```
브라우저(src/app.js)
  ├─ 화면1/2: 마이크 녹음 또는 파일 업로드
  ├─ Web Audio API(decodeAudioData)로 모노 PCM 샘플·길이 추출
  ├─ 길이가 너무 짧으면 백엔드 호출 없이 "분석 불가능" 메시지 표시
  └─ POST /api/analyze 로 PCM 샘플 전송(raw Float32 바이너리)
        │
        ▼
백엔드(server.js, Node 내장 http 모듈만 사용, 외부 의존성 없음)
  ├─ 길이 재검증(서버 측 방어)
  ├─ src/recordingAnalyzer.js → src/indexCalculator.js 로 I, dB, 지배주파수, 소음원인 계산
  ├─ data/results.json 에 결과 저장(파일 기반, 별도 DB 없음)
  └─ GET /api/results, POST /api/results/:id/report 로 조회·신고정보 추가
```

## 수식 ↔ 코드 매핑

| 문서 | 코드 |
|------|------|
| $X_k = \sum_n x_n e^{-2\pi i kn/N}$ (2절, 3절) | `src/fft.js`의 `fft()` (radix-2 iterative FFT), `windowedDft()` |
| $H(f)$ 벽 전달함수 (4절) | `src/wallTransfer.js` |
| $w(f)$ 인간 영향 가중 (5절) | `src/weighting.js` (`aWeightingDb`, `aWeightingLinear`, `perceptualWeight`) |
| $I = \sum_k w(f_k)\,|H(f_k)X(f_k)|^2$ (2절, 프레임 1개) | `src/indexCalculator.js`의 `computeDisturbanceIndex()` |
| 임의 길이 녹음 전체에 대한 집계 | `src/recordingAnalyzer.js`의 `analyzeRecording()` (4096샘플 프레임 단위로 나눠 계산 후 평균/지배주파수 집계) |
| 소음 원인 추정 | `src/noiseClassifier.js` (지배 주파수 대역 기반 휴리스틱) |
| API·정적 파일 서빙 | `server.js` |
| 화면 전환·녹음/업로드·결과 목록 UI | `src/app.js`, `index.html`, `style.css` |

## 주요 결정 사항과 한계 (추정/미검증 부분 명시)

- **최소 분석 가능 길이**: `src/config.js`의 `MIN_ANALYSIS_DURATION_SEC = 3`(초). 문서/요구사항에
  정확한 값이 없어 **제가 임의로 정한 기본값**입니다. 프론트엔드(업로드 전 차단)와 백엔드(방어적 재검증)
  양쪽에서 이 값을 사용합니다.
- **분석 단위**: `computeDisturbanceIndex()`는 2의 거듭제곱 길이 프레임 하나만 처리하므로, 녹음 전체를
  4096샘플 프레임으로 나눠 각각 계산한 뒤 $I$는 평균, 지배 주파수는 프레임 전체의 크기 합이 가장 큰
  주파수로 집계합니다. 프레임 크기로 나누어떨어지지 않는 마지막 자투리 구간은 버립니다.
- **I(dB 환산)**: raw $I$ 값은 사람이 읽기 어려워 로그 스케일로 변환했습니다. 이 변환은 표시용이며
  문서 7절대로 $I$ 자체는 절대적인 dBA 단위가 아닙니다.
- **소음 원인 추정**: 지배 주파수 대역만 보는 단순 휴리스틱으로, 실제 음원 분리 기술이 아닙니다.
- **마이크/업로드 음압은 dB SPL로 보정(calibration)되지 않았습니다.** 절대 음압레벨과 직접 비교할
  수 없고, 동일 기기·환경에서의 상대 비교 용도입니다.
- **저장소**: 결과는 `data/results.json` 파일에 저장됩니다(별도 DB 없음, git에는 포함되지 않음).
  다중 사용자·동시 접속을 고려한 설계가 아니라 개인용 MVP 수준입니다.
- **"신고 도움" 기능은 실제 지자체/기관 신고 시스템에 접수하지 않습니다.** 위치·발생 시각·설명·연락처
  등 선택 정보를 결과에 붙여 저장할 뿐입니다(연동할 실제 신고 API가 없기 때문입니다).

## 테스트

```bash
npm test
```

Node 내장 테스트 러너로 다음을 검증합니다.

- 핵심 수식: FFT, A-weighting, 벽 전달함수, 단일 프레임 지표 계산 (기존)
- `analyzeRecording()`: 여러 프레임에 걸친 녹음의 지배 주파수/길이 집계, 프레임 미만 입력 예외 처리
- `server.js`: `/api/analyze`(정상/너무 짧음), `/api/results` 조회, `/api/results/:id/report` 저장/404,
  정적 파일 서빙 — 실제 서버를 임시 포트에 띄워 fetch로 검증

마이크 녹음/파일 업로드 UI(`src/app.js`, MediaRecorder·decodeAudioData 등 브라우저 전용 API)는 실제
브라우저가 필요해 이 환경에서 자동 테스트하지 못했습니다. 문법 검사(`node --check`)만 확인했으며,
`npm start` 후 브라우저에서 직접 확인해 주세요.
