# 냉정 리뷰: main 직접 발행 구조 (2026-11-05)

범위: 후보 브랜치, `promote-daily-brief.yml`, main 보호를 없애고 로컬 `publish`가 사용자 자격 증명으로 main에 바로 푸시하는 변경 하나. 결정 자체는 다시 따지지 않았다. 코드는 고치지 않았다.

목표 줄(설계 문서 9~22행 그대로): 1 정보력, 2 Claude 작업·완료=공개 사이트 최신 날짜 오늘, 3 기존 수집 범위·경계 유지, 4 공모전·지원사업만 한국, 5 레딧 제외, 6 실패 메일 줄이되 고장은 알림(오후 3시), 7 크롤러 로컬, 8 끝까지 확인 뒤 포털 추가.

등급: 기록 = 저장소 기록(git, API 응답), 코드 = 파일·줄 확인, 추정 = 확인 안 함.

## 깨지는 목표가 있는 발견

### 발견 1. 지표 수집(`collect-github-metrics.yml`)이 시작할 길이 사라진다
- 무슨 문제인가: 이 워크플로의 시작 조건은 두 가지뿐이다. `workflow_run`으로 "Crawl daily-brief source inventories" 또는 "Promote daily brief staging snapshot"이 끝났을 때, 그리고 수동 실행이다(`collect-github-metrics.yml:3-7`). 설계는 크롤 예약을 없애 수동만 남기고(항목 12) 승격 워크플로를 지운다(항목 9). 그러면 매일 자동으로 도는 시작 조건이 하나도 없다. 이 작업은 `data/latest.json`을 읽어 그날 브리핑의 저장소 별·포크 수를 모은다(`scripts/collect_github_metrics.mjs:54`). 새로 올라간 AI Discovery 저장소의 지표가 영영 비고, 사이트에 지표 데이터가 낡는다. 설계 문서 62행은 "GitHub은 ... 지표 수집을 맡는다"고 쓰지만 시작시킬 장치가 없다. 설계 문서의 어느 항목도 이 워크플로를 다루지 않는다.
- 근거 등급: 코드(`collect-github-metrics.yml:3-7`, `collect_github_metrics.mjs:54`, 설계 문서 62·163행). `data/github-metrics.json` 최근 갱신이 모두 워크플로가 만든 커밋이라는 점은 기록(`git log -- data/github-metrics.json`)이다.
- 깨지는 목표: 3(기존 수집 범위 유지).
- 고치는 방법: 시작 조건을 `push: branches: [main], paths: ['data/latest.json']`로 바꾼다. 사용자 푸시가 시작시키고, 이 워크플로 자신의 푸시는 `data/github-metrics.json`만 바꾸는 봇 푸시라 되풀이되지 않는다. 열한 줄 안팎의 변경이다. 대안은 09:30 KST 쯤의 `schedule`이다. 둘 중 하나는 반드시 넣어야 한다. 대안으로 `workflow_run`에 "Deploy daily-brief to GitHub Pages"를 쓰면 지표 작업이 Pages를 다시 띄워 한 번 더 돌게 되므로 쓰지 않는다.

### 발견 2. `publish` 설계에는 승격 워크플로가 하던 검사 중 다섯 가지가 없고, 다른 곳도 대신하지 않는다
설계 항목 9의 `publish` 목록(`design.md:144-145`)은 `validate_data.py`, `validate_research_audit.py`(baseline), 허용 파일 검사, 푸시, Pages·날짜 확인이다. 승격 워크플로(`promote-daily-brief.yml`)와 하나씩 대면 다음이 빠진다.

| 사라지는 기능 | 승격 워크플로 위치 | 대신하는 곳 | 등급 |
|---|---|---|---|
| 최신 날짜 후퇴 거부 (스냅샷 날짜 < main의 날짜) | `:64-68`, `:115-119` | 없음. `validate_research_audit.py`의 baseline 분기는 `baseline.get("date") == snapshot_date`인 경우와 아닌 경우를 나눌 뿐 날짜 크기를 비교하지 않는다(`:296,312`). | 코드 |
| 스냅샷 날짜 == 오늘(브랜치 날짜 일치) | `:77-85` | 없음. 감사기는 `latest.json`의 날짜를 스스로 기준으로 삼는다(`:15,17,25`). 엉뚱한 날짜로 일관되게 만든 파일 세 개는 통과한다. | 코드 |
| `latest.json`과 `archive/DATE.json` 바이트 동일(`cmp`) | `:74`, `:122` | 푸시 이벤트로 시작되는 `pages.yml`은 `expected_date`가 없으면 이 검사를 건너뛴다(`pages.yml:39-42`). 3시 상태 점검의 `assessPublicationArtifacts`가 뒤늦게 잡을 뿐이다(`pipeline_health.mjs:6`, 이미 공개된 뒤). | 코드 |
| `archive/DATE.json` 존재 확인 | `:72` | 감사기는 이 파일을 보지 않는다. `publish`가 `git add`로 올리는 5개 중 하나일 뿐이다. | 코드 |
| `test_research_rules.py`, `test_publication_bundle.py` 실행 | `:69-70` | 두 파일을 실행하는 곳이 이 워크플로뿐이다(`grep -rn test_research_rules .github package.json`에서 승격 워크플로만 나옴). 항목 6~8이 바로 이 규칙 파일(`research_rules.py`)을 고친다. | 기록(grep) |

- 무슨 문제인가: 검사를 로컬로 옮기면서 목록에 옮겨 적지 않았다. 후퇴 거부와 `cmp`는 "공개 사이트 최신 날짜 = 오늘"을 지키는 마지막 문이다. 동일성 검사가 없어도 날짜만 맞으면 공개는 되지만, `latest.json`이 아카이브와 다르면 `pipeline_health`가 3시에 INCOMPLETE로 실패시켜 같은 날 안에 오탐 메일이 간다.
- 깨지는 목표: 2 (그날 공개 스냅샷이 오늘로 확정되는 조건이 약해짐). 규칙 테스트 누락은 4·5를 지키는 코드의 회귀를 막지 못하므로 4·5에도 걸린다. 다만 후자는 간접이다.
- 고치는 방법: `publish`에 아래를 모두 넣는다. 승격 워크플로 `:64-85`를 거의 그대로 옮기면 된다.
  1. `date == 오늘(KST)` 그리고 `date >= origin/main의 latest.json 날짜`.
  2. `test -f data/archive/DATE.json`, `cmp latest.json archive/DATE.json`.
  3. `python scripts/test_research_rules.py`.
  4. 아래 발견 4의 `workflow_dispatch(expected_date)`.
  `test_publication_bundle.py`는 복구 묶음 코드를 범위 밖으로 둔 설계(`design.md:230`)와 같이 계속 돌리거나 함께 지운다. 이 테스트는 파일이 남아 있는 한 로컬에서 통과한다(검사한 것은 아니다: 추정).

### 발견 3. 푸시가 시작시키는 `pages.yml`은 날짜 검증 없이 돈다
- 무슨 문제인가: 승격 워크플로는 `workflow_dispatch`로 `expected_date`를 넣어 Pages를 불렀다(`promote-daily-brief.yml:148-153`). `pages.yml`의 날짜·감사 증거·`cmp` 검증은 `EXPECTED_DATE`가 비어 있으면 "no new editorial publication claimed"로 건너뛴다(`pages.yml:39-42`). 사용자 푸시는 `push` 이벤트라 입력이 없다. 즉 `pages.yml:47-58`의 날짜 검증 블록은 새 구조에서 아무도 부르지 않는 죽은 코드가 된다. 푸시 이벤트는 오직 `validate_data.py`(`pages.yml:32`)만 돈다.
- 또 `publish`가 "Pages 성공"을 확인하려면 푸시가 만든 실행을 찾아야 한다. 승격은 `return_run_details=true`로 정확한 실행 번호를 받았다(`:148-155`). 푸시 이벤트에서는 커밋 SHA로 검색해야 하는데 실행이 생기기 전에 조회하면 비어 있다. 또 지표 작업이 `gh workflow run pages.yml`을 부르면(`collect-github-metrics.yml:47`) 대기 중이던 Pages 실행이 `concurrency: pages`(`pages.yml:20-23`)에서 밀려 cancelled가 될 수 있다. 승격은 이 경우 한 번 재실행했다(`:165-174`). 새 구조에서는 `publish`가 취소를 실패로 오판한다. 반대로 그 뒤 실행이 최신 main을 배포하므로 사이트는 정상일 수 있다(추정).
- 등급: 코드. 취소 시나리오는 코드 경로 추정이다(실제 발생 기록 없음).
- 깨지는 목표: 2. 사이트가 오늘 날짜가 되었는데도 `publish`가 실패로 보고하거나, 반대로 날짜 증거 없이 성공으로 보고하는 경우가 생긴다.
- 고치는 방법: `publish`가 푸시 직후 사용자 자격으로 `gh api POST .../workflows/pages.yml/dispatches -f ref=main -f inputs[expected_date]=DATE -F return_run_details=true`를 부른다(승격 `:148-155`을 복사). 푸시 이벤트의 중복 실행이 하나 생기지만 `concurrency`로 순서대로 돈다. 성공 판정은 실행 상태가 아니라 공개 `latest.json`의 날짜와 해시 일치를 최종 기준으로 한다(승격 `:176-210`). `cancelled`이면 같은 실행을 한 번 재실행한다(`:165-174`).

### 발견 4. 같은 날 재시도에서 공개 날짜 확인만으로는 새 내용이 올라갔는지 모른다
- 무슨 문제인가: 설계는 공개 날짜 확인만 적었다(`design.md:144`). 같은 날 재시도를 허용하므로(`:147`) 첫 발행이 이미 오늘 날짜로 공개된 상태에서 재시도가 푸시되면, 이전 배포가 아직 서비스 중이어도 날짜 확인이 통과한다. 승격은 로컬 `latest.json`의 SHA256과 공개 파일을 비교했다(`promote-daily-brief.yml:191-201`).
- 등급: 코드.
- 깨지는 목표: 없음(목표 2는 날짜만 요구한다). 재시도하는 날에만 확인이 약해진다.
- 고치는 방법: `publish`의 마지막 확인에 해시 비교를 같이 넣는다. 승격 코드 복사. 발견 3의 고침에 포함된다.

## 깨지는 목표가 없는 발견 (한 줄씩)

- `pipeline_health.mjs:91`의 "ChatGPT ... 후보 브랜치 ... 승격 워크플로" 문구와 `:89-90`, 그리고 `test_pipeline.mjs:74-88`의 기대값(`sources FAILED → healthExitCode 1`, `collection STALE`)은 항목 12를 적용하면 함께 바뀌어야 한다. 바꾸지 않으면 `pipeline-health.yml:22`와 `collect-github-metrics.yml:28`의 `test_pipeline.mjs` 단계가 먼저 실패해 상태 점검과 지표 수집이 같이 막힌다. 설계가 이미 적었으므로 순서만 확인하면 된다(코드).
- `pipeline_health.mjs`는 승격 실행이나 `automation/` 브랜치를 읽지 않는다. 읽는 것은 `data/source-cache/latest.json`, `data/crawler-sources.json`, `data/latest.json`, 날짜별 archive·research뿐이다(`:64,71-75`). 새 구조에서도 `publish`가 이 파일들을 모두 main에 올리므로 INCOMPLETE가 상시로 나지는 않는다(코드).
- `hour<10`이 두 곳이다(`:41,42`). 설계에 적힌 대로 `15`로 바꾸고 `pipeline-health.yml:6`의 cron(`37 1`)도 06:00 UTC 이후로 옮겨야 한다. cron 하나만 바꾸면 10시대 점검이 PENDING으로 끝난다(코드).
- main 보호는 이미 없다. `gh api branches/main/protection`은 404 "Branch not protected", `rulesets`는 `[]`이다. 푸시를 막는 설정이 없으므로 "보호를 푼다"는 작업은 불필요하다(기록, 2026-11-05 조회). 사용자의 계정에 저장소 쓰기 권한이 있는지는 조회하지 않았다(미확인).
- 캐시 두 파일(`data/source-cache/latest.json`, `DATE.json`)과 데이터 파일을 한 커밋으로 푸시하면 `pages.yml`의 `paths-ignore`와 충돌하지 않는다. `paths-ignore`는 변경된 모든 파일이 무시 대상일 때만 건너뛰고, `latest.json`이 섞여 있으므로 실행된다(`pages.yml:6-9`; GitHub 규칙에 대한 판단이라 실행 확인은 안 했다: 추정). 캐시만 단독 푸시하면 Pages가 안 도는데, 설계는 단독 푸시를 만들지 않는다.
- 사용자 푸시는 `evolve-crawler-sources.yml`을 실제로 시작한다. 시작 조건이 `push` + `data/research/*.json`(`:3-7`)이다. 같은 날 재시도는 `state.lastDate == date`에서 정상 종료한다(`evolve_crawler_sources.py:35-37`). 다만 이 워크플로는 이제 Pages 확인과 동시에 돌고(승격은 확인 뒤 `continue-on-error`로 불렀다, `promote:214-222`), 실패하면 실패 메일이 간다. 목표 6의 소음 요소지만 이 변경이 새로 만든 건 아니다(코드).
- 지표·소스 수명주기 봇과 동시 푸시: 둘 다 `git pull --rebase` 뒤 푸시한다(`collect-github-metrics.yml:45-46`, `evolve:86-87`). 사용자 `publish`도 거부되면 재베이스하도록 설계됐다(`design.md:147`). 이 봇들은 `latest.json`·research·archive를 건드리지 않으므로 baseline이 바뀌지 않는다. 다만 `publish`는 작업 폴더에서 `latest.json` 등이 수정된 상태에서 `git pull --rebase`를 하면 "unstaged changes"로 실패하므로, 5개 파일을 먼저 커밋한 뒤 재베이스하거나 `fetch` + 상류가 이 5개를 바꾸지 않았는지 확인하는 순서로 짜야 한다(구현 세부, 코드 지식에 따른 판단).
- `prepare`의 "의존성 확인"이 `npm install`이면 `package-lock.json`(추적 파일)이 바뀌어 `publish`의 "허용 파일 외 변경 거부"에 걸린다. `git ls-files`에 `package-lock.json`이 있다(기록). `npm ci`를 쓰면 피한다.
- `crawl-sources.yml`이 CI에서 돌리던 크롤러 테스트(`:43-53`)는 예약이 없어지면 수동 실행 때만 돈다. 설계가 이미 범위 밖으로 둔 항목이다(`design.md:230`).
- 빌드 산출물 검사: 승격 워크플로에는 그런 단계가 없었다(`validate_data.py`와 감사기뿐). 사라지는 것이 아니다(코드).

## 맞다고 확인한 것
- 승격 워크플로의 baseline 비교는 `publish`가 받은 main의 `latest.json`을 감사기에 주면 그대로 유지된다(`validate_research_audit.py:265-315`, 설계 항목 9). 삭제 방지(`:269-270`), `firstSeenDate` 변조 방지(`:271-275`)도 같은 인자에 달려 있다.
- 허용 파일 외 변경 거부는 로컬로 옮겨도 동치다. 승격은 `git diff --name-only origin/main...HEAD`로 3개 경로만 허용했고(`:95-104`), 설계의 5개 허용(캐시 2개 추가)은 감사기가 `data/source-cache/DATE.json`을 읽으므로(`validate_research_audit.py:25-27`) 필요한 확장이다.
- 크롤러가 쓰는 추적 파일은 `data/source-cache/DATE.json`, `latest.json` 둘뿐이다(`crawl_sources.mjs:665-666`). `crawler-source-state.json`, `crawler-sources.json`은 크롤러가 쓰지 않으므로 허용 5개 밖 변경 거부와 충돌하지 않는다.
- `pipeline_health.mjs`는 `assessPublicationArtifacts`가 archive와 research 존재를 요구하지만(`:5`) `publish`가 둘 다 올리므로 정상 날에는 OK다.
- 사용자 자격 증명 푸시는 GITHUB_TOKEN 푸시와 달리 `push` 트리거를 시작한다(`pages.yml:3-9`, `evolve:3-7`). 이 점이 오히려 구 구조에서 별도 디스패치가 필요했던 이유다.
- 자체 토큰 푸시가 워크플로를 시작하지 않는 GitHub 규칙은 코드로 확인한 사실이 아니라 일반 지식이다(추정). 기존 `collect-github-metrics.yml:47`, `promote:141-155`이 모두 명시적 `gh workflow run`으로 Pages를 부르는 점은 그 규칙과 맞다(코드).

## 사용자만 답할 질문
1. 지표 수집 시작 조건을 "main에 `data/latest.json`이 올라올 때(푸시 트리거)"로 할까, "매일 정해진 시각(예약)"으로 할까. 푸시 트리거를 권한다. 발행이 없는 날은 지표 갱신도 필요 없기 때문이다. [목표 3]
2. `publish`가 사용자 컴퓨터에서 `gh` 로그인이 필요한 디스패치를 부르는 것을 허용할까(발견 3의 고침). 허용하지 않으면 `publish`는 푸시 실행을 SHA로 찾는 방식이 된다. [목표 2]

## 요약
깨지는 목표가 있는 발견은 1(지표 수집 중단, 목표 3), 2(검사 5종 누락, 목표 2·간접 4·5), 3(Pages 날짜 검증 무력화·run 식별, 목표 2). 4는 목표를 깨지 않는다. `publish` 설계는 승격 워크플로 `:64-85`, `:148-210`을 옮겨 적는 방식으로 고치는 것이 가장 짧다.
