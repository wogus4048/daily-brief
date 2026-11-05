# `fix/crawler-resilience`(99a82e1) 냉정 리뷰

리뷰어: Claude Fable (작성자와 다른 모델). 비용: 154,549 토큰, 도구 20회, 405초. 아래는 리뷰어 보고 원문이다.

검증 방법: `git diff main...HEAD` 전체, 관련 스크립트·워크플로·문서 원문, `data/source-cache/` 28개 파일, `gh run list`(60건)와 실패 실행 8건의 로그, 로컬 테스트 실행. 저장소는 수정하지 않았고 실제 사이트 크롤링도 하지 않았다.

## 발견

### 발견 1. 합친 뒤 필수 소스 실패가 어디에도 "실패"로 울리지 않는다 (작성자 장부 1번과 같음, 원본으로 확인)
- 파일:줄: `scripts/pipeline_health.mjs:49` (`if (sourcesOnly) return 0;`), `scripts/crawl_sources.mjs:246-251` (`assertAnySourceSucceeded`: 전체 실패만 throw), `.github/workflows/crawl-sources.yml:91` (필수 assert 제거), `gh workflow list` → `pipeline-health.yml`=`disabled_manually`.
- 시나리오: 합친 뒤 크롤링을 켜면 DACON이 계속 0건이어도 작업은 초록, 부분 캐시가 main에 커밋된다. 경보를 맡긴 `pipeline-health.yml`은 꺼져 있어 아무도 모른다. 켜더라도 발행이 멈춘 상태라 `publication STALE`로 매일 실패하므로 "필수 소스 실패"와 "발행 없음"을 메일로 구분할 수 없다(`healthExitCode` 두 조건 모두 exit 1).
- 깨지는 목표: 3("실패는 여전히 알려져야 한다").
- 등급: 코드(위 줄들), 기록(`gh workflow list` 상태).
- 제안: 근본안은 "경보 책임을 어디에 둘지"를 사용자 결정으로 받는 것. 코드로는 `crawl-sources.yml`의 마지막 예약 시도(06:17)나 `--sources-only`에 `--fail-on-required` 플래그를 두어 하루 1회만 실패시키는 방법이 가장 작다(`pipeline_health.mjs` 2~3줄 + 워크플로 1줄). 발행 중단 중에는 `pipeline-health.yml`의 publication 검사와 sources 검사를 분리해 돌릴 수 있게 하는 것도 같은 크기다. 이 선택은 "사용자만 답할 질문"에 둔다.

### 발견 2. 문서가 새 동작과 어긋난다 (ChatGPT가 읽는 AUTOMATION.md 포함)
- 파일:줄: `AUTOMATION.md:220` "Active machine-crawled sources currently include ... Devpost open hackathons" — Devpost는 이제 `degraded`. `docs/data-pipeline.md:7` "Required source failures stop cache promotion" — 이제 부분 캐시가 커밋된다. `docs/BACKLOG.md:7` "전체 크롤러 로컬 실행 ... 남았다" vs 작업 기록 "17:33 실행함"(작성자 장부 3번).
- 시나리오: 09:00 예약(ChatGPT)이 AUTOMATION.md를 읽고 Devpost를 active 소스로 취급해 `machineSources.devpostOpen`를 찾거나 소스 갭으로 적는다. 검증 스크립트는 `sources`에 없는 키를 요구하지 않으므로 발행이 막히지는 않는다.
- 깨지는 목표: 없음(절차 혼선만).
- 등급: 코드/문서(위 줄들).
- 제안: 같은 커밋에서 세 줄 수정.

### 발견 3. "새 테스트가 수정 전 코드에서 운영과 같은 오류로 실패했다"는 주장은 그대로는 성립하지 않는다
- 파일:줄: `scripts/test_crawl_navigation.mjs:4`는 `crawlDacon`, `gotoWithRetry`, `assertAnySourceSucceeded`를 import한다. main의 `scripts/crawl_sources.mjs:235`는 `crawlDacon`을 export하지 않고, `:567`에서 import 시점에 `main()`을 무조건 실행한다.
- 시나리오: main 코드에 이 테스트를 그대로 돌리면 "does not provide an export named 'crawlDacon'"로 import 단계에서 실패한다. 설령 export만 붙였다면 import 시 실제 크롤러가 돈다. 따라서 "운영과 같은 오류(zero competition items)"는 export·진입 보호를 추가한 중간 상태에서 본 것이다(추정).
- 테스트의 목표 적합성 자체는 맞다: 202 인터스티셜 → 300ms 뒤 reload → 2600ms 뒤 링크. 옛 코드(고정 1.8초 대기)라면 0건으로 끝나는 타이밍이다(코드로 판단, 실행으로는 미확인). 로컬 실행 결과 PASS.
- 깨지는 목표: 없음.
- 등급: 코드(main 파일 줄 번호), 추정(중간 상태에서 확인했을 것).
- 제안: 작업 기록 문구를 "export·진입 보호를 추가한 상태에서 대기 로직만 옛것으로 두고 실패를 확인"처럼 정확히 적는다.

### 발견 4. 전체 실패 시 "이전 캐시를 유지한다"는 메시지가 로컬에서는 거짓이다
- 파일:줄: `scripts/crawl_sources.mjs:573-574`(파일 먼저 씀) → `:585`(그 뒤 throw, 메시지 "keeping the previous cache").
- 시나리오: 러너에서는 커밋 단계가 건너뛰어지므로 main은 보존된다. 로컬 실행에서는 `latest.json`·`YYYY-MM-DD.json`이 전부 실패 결과로 덮인다.
- 깨지는 목표: 없음.
- 등급: 코드.
- 제안: 메시지를 "not committing"으로 바꾸거나, 쓰기 전에 검사해 전체 실패면 쓰지 않는다(2줄 이동).

### 발견 5. 수동 실행이 정상 캐시를 부분 캐시로 덮어쓸 수 있다 (작성자 장부 2번, 확인)
- 파일:줄: `scripts/crawl_sources.mjs:514`(`GITHUB_EVENT_NAME === "schedule"`일 때만 재사용), `.github/workflows/crawl-sources.yml:117-133`(diff 있으면 커밋).
- 시나리오: 09:00 조사가 정상 캐시로 진행 중, 누군가 Run workflow → DACON 실패 → 부분 캐시 커밋 → 조사가 staging 브랜치를 만들 때 그 캐시가 들어가 `validate_research_audit.py:43`에서 막힌다. 잘못 발행되지는 않지만 그날 발행이 날아간다.
- 깨지는 목표: 없음(수동 실행 한정). 4는 지켜진다.
- 등급: 코드.
- 제안: 커밋 단계에서 "기존 캐시가 `hasUsableCache` true이고 새 캐시가 false이면 커밋하지 않음"을 넣으면 4~6줄. 임시로는 수동 실행 금지 문구.

### 발견 6. 테스트가 한 가지를 빠뜨림
- 파일:줄: `scripts/test_pipeline.mjs:65-73`에 "필수 소스가 형식은 정상이고 status=FAILED일 때 `hasUsableCache`가 false"인 검사가 없다(`:69`의 `optional`은 items 배열이 없어 형식 오류로 false가 나는 경우다).
- 직접 실행: `hasUsableCache` 에 필수 `{status:'FAILED',items:[],count:0,actionableItems:[],actionableCount:0}` → `false`, 비필수 같은 값 → `true`. 동작은 맞다.
- 깨지는 목표: 없음(동작은 맞고, 목표 2·4를 지키는 바로 그 분기에 테스트가 없을 뿐). 전역 지침 14-④에 따르면 "목표가 요구하는 동작마다 하나"이므로 추가 정당.
- 등급: 코드, 실행 기록.
- 제안: `test_pipeline.mjs`에 assert 2줄.

### 발견 7. 작업 기록에 없는 것: `gh run list`에 10-16~10-21, 10-30~11-01 실행이 없다
- `gh run list --workflow crawl-sources.yml --limit 60`과 `--created 2026-10-16..2026-10-21`(0건) 모두 그 구간이 비어 있으나 `data/source-cache/2026-10-17.json`~`2026-10-22.json`과 `2026-10-31.json`·`2026-11-01.json`은 존재한다. 실행 기록이 지워졌는지 API 누락인지 모른다.
- 깨지는 목표: 없음.
- 등급: 기록(파일 generatedAt), 모름(원인).
- 제안: GitHub 웹 Actions 화면에서 해당 날짜 조회.

## 특히 검증하라고 한 항목의 결론
- Devpost 28일 중 26일 실패: 맞음. 캐시 28개 파일의 `sources.devpostOpen.status` 집계 → OK 2(10-06, 10-07), FAILED 26.
- sotong24 28일 중 3일: 맞음. FAILED 10-07, 10-18, 10-27. 최근 8회 중 2회 시간 초과: 맞음(41753565849, 41717642156, `page.goto: Timeout 60000ms exceeded`). 이 오류는 `gotoWithRetry`의 재시도 조건에 해당한다.
- 필수 소스 실패 시 발행 차단 경로: 막힌다. `hasUsableCache`(재사용 안 함) → `research_worklist.py`의 `requiredFailures`는 보고용 → 기계적 차단은 `validate_research_audit.py:38-44`이고 `promote-daily-brief.yml`의 두 단계에서 실행된다. staging 브랜치는 캐시 파일을 바꿀 수 없다. 막히지 않는 경로: 없음(코드).
- 부분 캐시 커밋 뒤 흐름: 예약 재시도는 재크롤, 수동 실행은 덮어씀(발견 5), 지표 수집은 변경 없음, Pages는 캐시 커밋으로 배포되지 않음, ChatGPT 절차는 필수 실패 캐시를 "없음"과 같이 취급해 일관됨.
- `waitForListing` 시간: 소스당 최악 약 3~4분, 소스는 병렬이라 더해지지 않음. 작업 제한과 충돌 없음(코드). `gotoWithRetry`는 `TimeoutError`에서만 재시도.
- Devpost `degraded` 형식: `evolve_crawler_sources.py`가 만드는 형식과 같다. 복구는 evolve가 도는 발행 재개 뒤에만 가능하다(작업 기록과 일치).
- 진입 판별: `pipeline_health.mjs:92`가 같은 방식이고 러너 로그에서 실행이 확인됨.
- 봇 우회 여부: 위장·챌린지 자동 풀기 없음. 목표 5 충족(코드).

## 맞다고 확인한 주장
- Devpost 26/28, sotong24 3/28, 최근 8회 중 2회 시간 초과.
- DACON 첫 실패 11-03 08:06 KST = 실행 41542827982. 마지막 성공 "11-02 09:45"는 캐시를 재사용했을 가능성이 크다. 커밋된 11-02 캐시의 generatedAt은 11-01T19:41Z(11-02 04:41 KST)이므로 마지막 실제 수집 성공은 04:41 KST다.
- 11-04 10:22 실행에서 DACON·sotong24·섀도 bizinfo 실패.
- 필수 실패 시 커밋되지 않고 메일이 갔다.
- 테스트: `test_pipeline.mjs`, `test_crawl_navigation.mjs`, `test_evolve_crawler_sources.py` PASS.
- 작성자 장부 1·2·3번은 원본과 맞는다.

## 확인하지 못한 것
- `test_research_rules.py`: 이 PC에서 `ZoneInfoNotFoundError: Asia/Seoul`로 실행 불가.
- 러너에서 DACON이 실제로 수집되는지. 로컬 "4.5~5.7초", "4회 모두 0건" 수치는 기록이 없어 재집계 불가.
- DACON 검토 대상 0건 vs 1건 차이.
- 발견 7의 원인.
- 새 테스트가 옛 대기 로직에서 실제로 실패하는지(코드로만 판단).

## 사용자만 답할 질문
1. 발행이 멈춘 동안 수집만 계속할 때, 필수 소스 실패를 어디서 알고 싶은가 — (a) 하루 1회 크롤 작업 실패 메일, (b) 상태 점검을 sources 검사만 켜서 실행, (c) 당분간 메일 없이 요약만.
2. 수동 실행이 정상 캐시를 부분 캐시로 덮는 것(발견 5)을 코드로 막을지, 운영 규칙으로 둘지.
3. 목표 줄 자체: 사용자 말은 "실패 메일을 멈춰 달라"뿐이다. 목표 1·2·4·5는 작성자 정리이고 코드와 맞지만, 목표 3의 "일일 점검 하나로 모은다"는 발행 재개 전에는 성립하지 않는 설계(발견 1)이므로 사용자 확인이 필요하다.
