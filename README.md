# V-스파이크 매니저 (웹앱 v0.1)

여자배구 3부 리그 × 8팀 커리어 모드. 모바일 우선 React + Vite PWA. 설계는 `../design/GDD.md`, 엔진 원본은 `../engine-prototype`.

```bash
npm install
npm run dev            # 개발 서버
npm run build          # 타입 검사 + dist/ (PWA: manifest, sw.js)
npm run build:single   # dist-single/index.html 한 파일 (미리보기 공유용)
npm run test:engine    # 커리어 루프 2시즌 헤드리스 실행
```

| 폴더 | 내용 |
|---|---|
| `src/engine/` | engine-prototype 복사본. 바꾼 곳: id 카운터를 `ID_SEQ`로 (세이브 복원), `Rng.state`, season.ts 함수 export, match.ts 점수 마커 `§a:b:w` (문자 중계용), skills.ts `process.env` 제거 |
| `src/game/career.ts` | 턴 루프 (GDD 3): 시즌 준비 → 전지훈련 → 자유 턴 3 → 스폰서 → 정규리그 (올스타) → 포스트시즌 → 결산 → 시상식 → 은퇴 → 내부 FA → 외부 FA → 용병 → 드래프트 → 다음 시즌 |
| `src/game/rookie.ts` | 신인감독모드 (`../design/ROOKIE-MODE.md`): 63일 · 트라이아웃 · 공식전 7경기 · 시청률 · 기업 매칭 엔딩. 화면은 `src/ui/Rookie*.tsx`, 밸런스는 `scripts/rookie-sim.ts` |
| `src/game/storage.ts` | 세이브 슬롯 3개 (localStorage, 게스트) |
| `src/game/names.ts` | 가상 구단 24개, 한국 이름 생성 |
| `src/ui/` | 화면: 홈(이번 턴) · 선수단 · 작전 · 순위 · 구단, 경기 중계, FA 시장, 선수 카드 |

엔진 수치를 바꿀 땐 engine-prototype에서 밸런스 시뮬로 확인한 뒤 `src/engine/`에 같은 변경을 옮깁니다.

## 아직 없는 것 (다음 단계)
- 경기 중 직접 개입 (작전 타임 선택지): 지금은 "자동 대응" 코치만. 엔진을 랠리 단위로 멈출 수 있게 바꿔야 함
- 구글 로그인 · 서버 저장 (Supabase), 남자부
- 이벤트(GDD 8), 스태프(13), 전술 숙련도, 1군/2군 수동 이동, 하위 리그 선수 이적 제안, 해임 후 재취업
