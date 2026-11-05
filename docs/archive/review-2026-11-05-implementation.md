# 구현 냉정 리뷰 (2026-11-05)

대상: 커밋되지 않은 변경 전부(`git diff HEAD`, 스테이징 포함)와 미추적 `scripts/daily_run.py`, `scripts/test_daily_run.py`. 설계 `docs/superpowers/specs/2026-11-04-claude-daily-brief-design.md` 항목 6~9 기준.
목표 줄: 1 정보력, 2 Claude 작업·완료=공개 사이트 최신 날짜 오늘, 3 기존 수집 범위·누적 자료 보존, 4 공모전·지원사업만 한국, 5 레딧 제외, 6 실패 메일 줄이되 고장은 알림, 7 크롤러 로컬, 8 끝까지 확인 뒤 포털 추가.
검증 방법: 원본 읽기, `python -m unittest test_research_rules test_daily_run`(36건 통과), 임시 폴더 복사본에서 재현. 저장소 파일은 이 보고서 외에 바꾸지 않았다. 크롤러 실행·푸시 없음.
주의: 작업 폴더의 `data/latest.json`은 날짜가 2026-10-13이다(마지막 발행). 설계 문서가 말하는 Devpost 11건·61건과 일치한다.

## 깨지는 목표가 있는 발견

없음. 아래 발견은 모두 "깨지는 목표 없음" 또는 "좁은 조건에서만 1·3·4가 약하게 깨짐"이다. 사용자 결정이 필요한 막힘도 찾지 못했다.

## 발견

### F1. 연도 없는 1월 마감일이 11월에 "지난 날짜"로 읽혀 자동 마감된다 (등급: 코드+재현)
- 위치: `scripts/research_rules.py` `_dates_in` (연도 보정은 12월에 1월일 때만), `all_deadlines_passed`, `close_expired_out_of_scope`.
- 재현: 오늘 2026-11-05, 범위 밖 호스트 항목의 `deadlineText="01.10 12:00 KST"` -> `all_deadlines_passed == True`(2026-01-10으로 해석). `2027.01.10`은 False, 오늘 12-20의 `01.10`은 False(보정됨), 오늘 1-03의 `12.28`은 False.
- 영향: 가을에 열린 Devpost 같은 해외 해커톤 중 마감이 다음 해 1월인 항목을 공식 확인 없이 CLOSED로 만든다. 검사기도 같은 함수를 쓰므로 통과시킨다. 이 항목들은 목표 4로 범위 밖이라 피해는 "누적 자료로 남는 과거 항목의 상태 오류"에 그친다(목표 3·1에 약하게 해당).
- 실제 `latest.json` 11건에는 해당 없음(마감 모두 10~11월, 아래 계산 참고).
- 고치는 방법: `all_deadlines_passed`에서만, 연도 없는 날짜가 오늘보다 6개월 넘게 과거면 다음 해로 보거나(그러면 닫지 않음) 그런 항목은 닫지 않고 둔다. 3~5줄. 공용 `_dates_in`을 바꾸면 재확인 주기 동작이 바뀌므로 `all_deadlines_passed` 안에서 처리할 것.
- 깨지는 목표: 없음(범위 밖 항목에 한정). 한 줄로만 보고.

### F2. 범위 밖 판정이 "링크 중 하나라도 devpost.com"이라 한국 공고도 걸릴 수 있다 (등급: 코드)
- 위치: `research_rules.py` `is_out_of_scope`. 설계 131행이 의도한 동작("링크 중 하나라도")이다.
- 영향: 한국 주최 공모전이 제출처로 Devpost 링크를 달고 있으면 재확인 대상에서 빠지고 마감일이 지나면 공식 확인 없이 닫힌다. 현재 `latest.json`에서 Devpost 호스트 링크를 가진 항목은 정확히 11건이고 그 중 한국 공고는 확인하지 못했다(제목·주최 미점검: 추정). `kuln-kuk-virtual-hackathon-2026`이 이름상 한국 대학 행사인데 Devpost 링크가 있어 범위 밖으로 잡히고 있다.
- 고치는 방법: 판정을 "첫 링크 또는 공식 링크가 devpost"로 좁힐지 사용자에게 묻는다(질문 Q1).
- 깨지는 목표: 없음(설계가 승인한 동작). 한 줄 보고.

### F3. 푸시가 아닌 곳에서는 문제 없음, 그러나 `changed_paths`는 미추적 파일을 보지 않는다 (등급: 코드)
- 위치: `daily_run.py` 151~154행. `git diff --name-only HEAD`와 `origin/main...HEAD`는 미추적 파일을 포함하지 않는다.
- 영향: 미추적 새 파일(예: `docs/…`)은 금지 목록에 안 걸린다. 하지만 `push_main`이 허용 경로만 `git add`하므로 푸시에 실리지 않는다. 즉 오판은 있으나 잘못된 푸시로 이어지지 않는다. 탐지 목적(알림)으로는 약하다.
- 깨지는 목표: 없음. 한 줄 보고.

### F4. 재확인 실패 면제는 사유 없는 항목을 통과시키지 않는다 — 단, 상한이 없다 (등급: 코드)
- 위치: `validate_research_audit.py` 504~521행 근처. `failures[i]`는 `id in effective_due`, 중복 금지, `primarySourceUrl` 필수, `reason`이 공백 아닌 문자열 필수(이 세 검사는 기존 코드이고 면제 이후에도 그대로 실행된다). 실패로 적힌 항목이 내용을 바꾸면 `changed_opportunities` 검사(`unverified_changes`)가 그대로 잡는다.
- 남는 약점: 사유 문자열 내용·`primarySourceUrl`이 그 항목 링크와 같은지는 검사하지 않는다. 하루치 전체를 "열 수 없음"으로 적어도 통과한다. 설계 126행("사유가 있으면 통과")과 일치하므로 결함이 아니라 설계 한계다.
- 깨지는 목표: 1(정보력)이 약해질 수 있으나 설계가 승인함. 없음으로 처리.

### F5. 범위 밖 자동 마감 면제는 다른 필드 변경을 숨기지 않는다 (확인됨)
- 위치: `validate_research_audit.py` 480~492행. 면제 조건 = `can_close_without_verification`(범위 밖, 이전 OPEN/UPCOMING, 현재 CLOSED, 마감일 모두 지남) AND `status`를 뺀 나머지 `same_day_material_fields` 전부 동일. 다른 필드가 하나라도 바뀌면 면제되지 않는다. `lastUpdatedDate`는 기존 `missing_update_dates` 검사가 계속 강제한다. `lastVerifiedDate`를 올리면 `falsely_advanced`가 잡는다.
- 단위 테스트가 이 경로를 덮는지는 `test_research_rules.py`에서 일부 확인(전체 36건 통과). 면제 + 다른 필드 변경 조합은 임시 폴더에서 직접 돌리지 못했다(시간): 미확인, 코드 읽기로는 거절됨.

### F6. DACON·DAKER 0건 처리 (확인됨)
- 위치: `validate_research_audit.py` 197~216행. 조건은 `cached_source.status == "OK"` 그리고 `items` 비어 있지 않음(원본 목록이 있음)이다. `actionableItems`가 0이면 감사 쪽 재고도 빈 목록이 허용되고, `actionableItems`가 있는데 감사 재고가 비면 실패한다. 이후 `cache_urls`가 `audit_urls`에 포함되는지 검사는 그대로다.
- 실측 대조: `data/source-cache/latest.json`(2026-11-02) DACON items 289 / actionable 1, DAKER items 25 / actionable 3. 두 소스 모두 매니페스트에서 `required: true`. 즉 정상 날 오탐 없음, 빈 목록(차단·파싱 실패)이면 막힘.
- 주의: DAKER 원본 목록이 실제로 0건인 날(대회 없음)은 발행이 막힌다. 25건이 쌓여 있는 소스라 가능성은 낮지만 0이 정상값일 수 있는지 기록 없음(모름). 확인 방법: 최근 `data/source-cache/*.json`의 DAKER `items` 길이를 날짜별로 센다.

### F7. 실제 `latest.json`에 `close_expired_out_of_scope`를 2026-11-05로 적용 (재현, 기록 등급)
- 복사본에서 `daily_run.close_expired` 실행: 9건 닫힘(nebius-nvidia, amazon-developer, opencv-ai, build-with-ai-basics, gitlab-life-after-code, qloo-agentic, hack-apertus, youcam-api, galuxium-nexus). 남는 2건: `paypal-ai-hackathon-2026`(11.13), `kuln-kuk-virtual-hackathon-2026`(날짜 10.31과 11.22 중 마지막인 11.22 기준). 설계 132행의 "11건 중 9건, PayPal 11-13, KUK 11-22"와 일치.
- 9건 모두 마감 날짜가 10-16~11-03이라 오늘보다 과거. 오닫힘 없음.
- JSON 재직렬화(`indent=2`, `ensure_ascii=False`)는 원본과 줄바꿈만 다르고(LF 기준) 동일해서 diff 소음 없음. 닫은 뒤 `validate_data.py`: OK (61 contests…).
- 잔여: 이 두 건과 "마감일 파싱 불가" 범위 밖 항목은 재확인 대상에서도 빠져 상태가 영원히 OPEN으로 남을 수 있다(`is_reverification_due`가 False). 파싱 불가 항목이 있는지는 11건 중 0건. 이후 새 Devpost 항목은 수집하지 않으므로 늘지 않는다.

### F8. 연도 규칙 외 날짜 해석 (확인됨)
- 연말: 12월에 `01.10` -> 다음 해로 보정, 아직 열림. 1월에 `12.28`(작년) -> 올해 12-28로 읽혀 닫지 않음(안전한 쪽). 마감일이 오늘이면 `max < today`가 아니라서 닫지 않음(안전).
- 시간대: `11.05 02:00 KST`가 이미 지났어도 당일은 닫지 않는다(안전). 지연 하루뿐.
- `deadlineText`가 비어 있고 `period`에 접수 키워드가 있으면 `period`의 최대 날짜(심사·발표일 포함 가능)를 쓴다 -> 더 늦게 닫는 쪽(안전).

### F9. `daily_run.py` 안전성 (코드 읽기 + 단위 테스트)
- 확인됨: `sync_main`은 `.daily-brief-runner` 없으면 `StepFailed`, 테스트가 편집 내용 보존을 검증. 이 개발 폴더에는 마커가 없다(`ls` 실패 확인). `git clean -fd data`는 `data` 밑만.
- 확인됨: 실패 경로는 모두 `StepFailed` -> 보고서 기록 -> 종료코드 1이고 푸시 코드(`push_main`)는 검사 통과 뒤에만 실행. `date_problem`이 오래된 날짜·오늘 아닌 날짜를 막는다. 즉 prepare가 닫은 `latest.json`을 Claude가 갱신하지 않고 publish를 불러도 날짜(`!= today`)에서 막힌다.
- 주의(좁음): `sync_main`은 조사 중인 작업도 지운다. 같은 날 `prepare`를 두 번 돌리면 Claude의 미발행 `latest.json` 작업이 사라진다. 마커가 있는 전용 폴더에서만 일어나고 설계상 의도에 가깝다. 런북에 "조사 시작 뒤 prepare 재실행 금지"를 한 줄 적는 것을 권한다. 깨지는 목표: 없음.
- `prepare`가 닫은 `latest.json`을 조사 단계가 이어받나: `close_expired`는 작업 트리의 `data/latest.json`을 직접 고치므로 파일을 읽는 한 이어받는다(`research_worklist.py`도 같은 파일). 단 Claude가 git에서 새로 받으면 사라진다. 런북 쪽 서술은 이 문서에서 확인하지 못함(미확인: `docs/daily-runbook.md` 해당 단계 읽기).
- 푸시 뒤 재시도: 푸시가 성공했는데 응답만 실패한 경우 다음 반복에서 fetch·rebase는 무변경, `push`는 "up to date"로 returncode 0이라 정상 종료한다. 확인됨(코드).
- 푸시 후 `wait_for_public` 실패 시 보고서는 FAILED지만 이미 main에 올라가 있다. 재실행하면 같은 날짜 `snapshot_date == main_date`는 허용되고 푸시는 무변경으로 통과하며 공개 확인만 다시 한다. 의도대로.
- 리베이스 뒤 재검사 없음: 검사는 리베이스 전 기준(`origin/main` 받은 시점)으로 한 번만 한다. 그 사이 main에 `data/latest.json` 변경이 들어오면 충돌로 중단되고, 다른 파일(`data/github-metrics.json`)이 들어오면 무해. 깨지는 목표: 없음.
- Windows: `npm`은 `shutil.which`로 `npm.cmd` 전체 경로를 받아 `subprocess.run([경로,"ci"])`를 쓴다. 리스트 인자로 .cmd 실행은 동작한다(이 컴퓨터에서 직접 실행해 보지 않음: 미확인). `check_dependencies`는 `node_modules/playwright`만 보고 브라우저 설치는 확인하지 않는다. 브라우저가 없으면 크롤러가 실패하고 `crawlerExitCode`와 "no cache"로 드러난다.
- 줄바꿈(autocrlf): 이 개발 폴더는 `core.autocrlf=true`, `git ls-files --eol`이 `i/lf w/crlf`. 공개 해시 비교는 `git show HEAD:…`(LF 바이트)와 비교하므로 CRLF 오판 없음 -- 올바른 설계. `changed_paths`는 `git diff`가 줄바꿈을 정규화해 오판 없음. 반면 `check_files`는 작업 트리 바이트로 `latest.json`과 `archive/{date}.json`을 비교한다. CRLF 체크아웃 파일을 Claude가 Edit으로 고치고 아카이브는 새로 만든 LF 파일이면 "dated archive differs"로 거짓 실패한다(추정: 재현 못 함). 안전한 방향(발행 막힘)의 실패이고, 러너 폴더에서 `core.autocrlf=false`로 두면 사라진다. 고치는 방법: `check_files`를 `git`이 보는 정규화 내용(`\r\n`->`\n`)으로 비교하거나 러너 설정을 문서화. 깨지는 목표: 2(가끔 발행 지연), 약함 -- 사용자 환경이 autocrlf인지 모름(Q2).

### F10. `collect-github-metrics.yml` push 시작 (코드 읽기)
- 반복 실행 우려: 이 워크플로가 커밋하는 파일은 `data/github-metrics.json`뿐이고 시작 조건은 `data/latest.json` 경로 변경이므로 자기 자신을 다시 부르지 않는다. 게다가 기본 토큰(`github.token`) 푸시는 다른 워크플로를 트리거하지 않는다(GitHub 동작: 코드 외 지식, 추정).
- `test_pipeline.mjs`: `latest.json`을 읽지 않는다(grep 결과 없음). 이전 `workflow_run` 시작에서도 같은 단계가 있었다. 이 컴퓨터에서 실행해 통과를 확인하지는 않았다(미확인).
- 부작용: 이전 트리거였던 크롤 워크플로 완료 후 지표 수집이 사라졌다. 일일 발행 푸시 때만 돈다. 목표 7과 일치.
- 메모: 지표 수집이 `gh workflow run pages.yml`을 부르고 발행 푸시도 pages를 트리거해, 같은 날 pages 배포가 두 번 직렬로 돈다. 무해.
- 주의: `evolve-crawler-sources.yml`은 `data/research/*.json` 푸시로 시작하며 `contents: write`다. 매일 발행 푸시 뒤 main에 커밋을 더할 수 있고, 다음 날 `sync_main`이 받는다. 이 변경에서 확인하지 않은 범위.
- 삭제된 `promote-daily-brief.yml`의 검사(테스트 2개, `validate_data`, 아카이브 일치, 감사 검증, 날짜 일치, 허용 경로)는 `run_checks`/`run_publish`에 모두 옮겨져 있음을 대조로 확인. 다만 허용 경로가 늘었다(`data/source-cache/…` 포함). 날짜 일치도 `date_problem`에서.

### F11. 문서·검증 규칙 불일치 (등급: 코드/문서)
- `validate_research_audit.py`의 `KOREAN_ONLY_TRACKS`가 5개 트랙으로 넓어졌지만 `docs/daily-runbook.md` 37행은 아직 "`publicIdea`는 한국어만"이라고 쓴다. 검증이 느슨해진 쪽이라 막히진 않으나 문서가 틀리다. 고치는 방법: 한 줄 수정. 깨지는 목표: 4(작업자가 영어 검색을 계속 할 수 있어 낭비), 약함.
- `AUTOMATION.md`의 Reddit 문구는 제거됨(목표 5 충족). 코드·크롤러 매니페스트에는 reddit 언급 없음(grep).
- `docs/BACKLOG.md`가 "AUTOMATION.md, data-pipeline.md, README.md는 아직 옛 구조"라고 이미 적고 있다. 알려진 부채.

## 맞다고 확인한 것
- 테스트 36건 통과(`test_research_rules`, `test_daily_run`).
- NOT_RELEVANT 사유 요구는 후보·재고·machineSources 세 곳에 모두 걸림(`assert_not_relevant_has_reason` 호출 3곳). 공백 사유는 막힘.
- Devpost를 필수 출처 목록에서 뺀 변경과 `crawler-sources.json`의 `degraded: []`는 일치(크롤러 `crawlDevpost` 코드는 남아 있으나 매니페스트에서 안 부름).
- 푸시 시도 3회, 리베이스 충돌 시 `--abort` 후 실패, 브랜치가 `main`이 아니면 중단.
- 허용 경로 밖 변경은 푸시 전에 막히고, `--no-push`일 때만 기록으로 남김.

## 사용자만 답할 질문
- Q1 (목표 4·3): 범위 밖 판정을 "링크 중 하나라도 devpost.com"으로 유지할까, 첫(공식) 링크만으로 좁힐까? `kuln-kuk-virtual-hackathon-2026`처럼 한국 행사가 Devpost 링크를 가진 경우가 이미 있다.
- Q2 (목표 2): 러너 폴더의 `core.autocrlf`는 어느 값인가? true면 F9의 거짓 실패 가능성이 있다.

## 시간 메모
요청 15분 내 수행. 단위 테스트 실행과 복사본 재현 포함. 미확인 항목은 본문에 "미확인"으로 표시했다.
