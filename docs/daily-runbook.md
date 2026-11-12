# Daily Brief 일일 실행 절차

2026-11-10 기준이다. 서비스는 "공모전 · 해커톤"과 "창업 · 지원사업" 두 분야만 다룬다. 설계는 `docs/superpowers/specs/2026-11-09-gpt-research-design.md`이다.

## 새 PC 준비

어느 PC든 이 저장소를 받은 폴더에서 한 번 돌린다. 다시 돌려도 안전하고, 남은 일이 없으면 0으로 끝난다.

```
python scripts/daily_run.py setup
```

- 미리 깔려 있어야 하는 것: Git(발행용 user.name·user.email과 push 권한 포함), Python 3.12와 `tzdata`, Node·npm, Chrome, Titan 앱.
- setup이 하는 일: 실행 폴더를 main으로 새로 받고(D 드라이브가 있으면 `D:\Dev\daily-brief-runner`, 없으면 사용자 폴더 아래), 표시 파일 `.daily-brief-runner`에 이 PC의 전용 크롬 프로필 경로를 적는다(D 드라이브가 있으면 `D:\daily-brief-ops\chrome-titan`, 없으면 `%LOCALAPPDATA%\daily-brief-ops\chrome-titan`). npm 패키지와 크롤러용 Chromium을 설치하고, Titan과 전용 크롬을 켠다. 경로는 `--runner`, `--chrome-profile`로 바꿀 수 있다.
- 사람이 하는 일: setup이 연 전용 크롬에서 Titan 확장을 로드하고(setup이 폴더를 알려 준다) ChatGPT에 로그인한다. 그다음 setup을 다시 돌려 확장과 Titan 연결을 확인한다. ChatGPT 로그인은 프로그램이 확인하지 못한다.
- 표시 파일이 없는 기존 폴더(개발 폴더 등)는 실행 폴더로 쓰지 않는다. 일일 실행이 그 폴더의 변경을 버리기 때문이다.

## 실행

실행 폴더(위 setup이 만든 곳)에서 한 번에 돌린다. 한 시간 가까이 걸릴 수 있으므로 백그라운드로 돌리고 완료 알림을 기다린다.

```
python scripts/daily_run.py all
```

`all`은 아래 순서로 돈다. 어느 단계든 실패하면 거기서 멈추고, 그 이유를 `artifacts/daily/날짜.json`에 남긴다.

1. **prepare (프로그램):** 최신 main을 받고 크롤러를 돌린다. 크롤러는 콘테스트코리아, 위비티, K-Startup 진행 중 목록 전체, 링커리어, 캠퍼스픽, AI팩토리, 그랜틀리, 소통24, 해커톤코리아, DACON, DAKER를 읽는다. 콘테스트코리아와 위비티는 상세 페이지까지 읽는다.
2. **research (GPT 자유 탐색과 코드):**
   - 시작 점검: Titan 앱과 이 프로젝트 전용 크롬(표시 파일에 적힌 프로필, 첫 PC는 `D:\daily-brief-ops\chrome-titan`)이 꺼져 있으면 켠다.
   - 대회 채팅(find-annual): 정기 대회 목록(`data/annual-contests.json`, AI TOP 100·모두의 창업 등)의 공식 주소를 열어 이번 회차를 보고, 그다음 목록에 없는 AI·개발 대회, 해커톤, 창업 경진대회를 검색한다(사용자 2026-11-10).
   - 자유 탐색(find-free): 크롤러가 보지 않는 곳에서 공고와 새 목록 페이지를 찾는다.
   - 두 채팅은 하나씩 차례로 돌고 worker 2개를 함께 쓴다. 실패해도 다음 단계로 간다.
   - 후보 고르기: 프로그램이 이미 있는 공고와 최근 14일 안에 처분한 공고를 뺀다.
   - 카드 만들기(코드): 크롤러와 자유 탐색이 가져온 칸만 적고, 보이지 않는 칸은 "확인 필요"라고 적는다. 범위 밖 단어와 제목이 97% 이상 같은 중복은 뺀다.
   - 조립: 프로그램이 `data/latest.json`, 그날 보관본, 조사 기록을 쓴다.
3. **publish (프로그램):** 마감이 지난 공고를 날짜로 닫는다. 검사기를 돌리고 main에 올린 뒤, 공개 사이트 파일이 올린 파일과 같은지 확인한다.

## 결과 보고

`artifacts/daily/날짜.json`과 `날짜.log.jsonl`을 읽고 다음을 보고한다.
- 단계별 걸린 시간
- 새로 올린 공고 수
- 분야별 접수 중 건수(`openContestsByCategory`: 개발·AI, 아이디어, 기타)
- 실패한 기록과 그 사유

데이터를 손으로 고치지 않는다. 실패하면 원인을 `docs/system/findings.md`에 적는다.

## 하지 않는 것 (사용자 결정 2026-11-09, 11-10)

- 공고 페이지를 열어 하는 공식 확인과 기존 공고 재확인
- AI 뉴스와 AI Discovery 수집
- GPT 채팅을 동시에 여러 개 여는 것
