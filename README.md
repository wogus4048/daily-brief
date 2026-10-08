# daily-brief

개인 자동화 결과를 모아보는 초소형 정적 정보 허브입니다.

## 카테고리
- 공모전 · 해커톤
- AI 뉴스
- 지원사업
- 날짜별 아카이브

## 구조
- `index.html`: 단일 페이지 UI
- `assets/`: 스타일/스크립트/아이콘
- `data/latest.json`: 홈에 표시되는 최신 브리핑
- `data/archive/YYYY-MM-DD.json`: 날짜별 브리핑 스냅샷
- `scripts/validate_data.py`: 배포 전 데이터 검증
- `.github/workflows/pages.yml`: GitHub Pages 자동 배포

## 매일 갱신 방식
사이트 코드는 고정하고 매일 `data/latest.json`과 당일 archive JSON만 갱신합니다.
GitHub에 push되면 Pages가 자동 재배포됩니다. 사용자의 PC가 켜져 있을 필요가 없습니다.

향후 ChatGPT 예약 작업은 다음 순서로 동작하도록 연결합니다.
1. 공식 출처를 검색해 오늘 브리핑 생성
2. `data/archive/YYYY-MM-DD.json` 생성/갱신
3. `data/latest.json`을 같은 내용으로 갱신
4. GitHub commit/push
5. GitHub Pages 자동 배포

## 로컬 실행
정적 파일이므로 간단한 HTTP 서버만 필요합니다.

```bash
python -m http.server 8080
```

`http://localhost:8080` 접속.

## GitHub Pages
Repository Settings → Pages → Source를 `GitHub Actions`로 선택하면 됩니다.

## UI 개발 및 검증

Ionic Core의 실제 iOS 모드 Web Components와 Ionicons를 사용합니다. 스타일 규칙은 `DESIGN.md`, 구현은 `assets/styles.css`에 있습니다. 별도 프런트엔드 빌드 없이 JSON 갱신만으로 새 브리핑이 표시됩니다.

```bash
npm ci
npm run test:ui
npm run capture:ui
```

테스트와 캡처는 임시 로컬 서버를 자동으로 실행합니다. Windows는 설치된 Edge를 사용하며, 다른 환경에서는 `npx playwright install chromium`으로 테스트용 브라우저를 준비합니다. 캡처 결과는 `artifacts/ui-final/index.html`에서 볼 수 있습니다.

GitHub 저장소 카드의 별·포크 수는 공개 GitHub API에서 조회하며, 조회 시점과 함께 표시합니다. 15분간 캐시하고, 조회 제한·실패 시에는 수치를 0으로 표시하지 않습니다. 과거 아카이브에는 현재 수치를 섞지 않습니다.
