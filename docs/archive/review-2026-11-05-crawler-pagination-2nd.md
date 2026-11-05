# 크롤러 페이지 읽기 2차 냉정 리뷰 (2026-11-05)

리뷰어: Claude Sonnet 새 하위 에이전트(사용자 지시 "리뷰한번더 보고"). 18분 38초, 170,667 토큰. 앞선 리뷰와 처분은 주지 않았다. 보고 원문을 옮겼다.

## 독립 리뷰 결과 (fix/crawler-resilience, 커밋 전 변경)

저장소 파일은 하나도 고치지 않았고 git 상태도 바꾸지 않았다. 실행한 것은 아래뿐이다.
- 기존 테스트 4종: 모두 PASS
- ContestKorea와 위비티 실제 목록 열람(읽기 전용, 임시 폴더에서 `crawlContestKorea`·`crawlGeneric` 직접 호출)
- 코드를 임시 복사본에서 망가뜨리는 변이 테스트 10종

목표 줄 1~3을 깨는 결함은 확인된 것 1건과 확인 필요 1건이다. 나머지는 점검한 대로 정상이다.

### 발견

**F1. 빈 페이지를 "끝에 도달"로 기록한다 (`reachedEnd: true`)**
- 내용: `closedRunLimit`이 없는 목록(위비티)에서는 행이 0개인 페이지를 곧바로 `stoppedBy:"empty"`, `reachedEnd:true`로 기록한다. 봇 확인 화면, 일시적 빈 응답, 렌더 지연이 모두 같은 값이 된다. 1번째 페이지가 비어도 마찬가지다.
- 근거(코드): `scripts/crawl_sources.mjs` 약 446~452행 `if (!rows.length) { stoppedBy = closedRunLimit ? "blank" : "empty"; break; }`. `reachedEnd = ["empty","repeated","closedRun"]`. 코드 주석도 "빈 페이지는 읽기 실패"라는 판단을 긴 목록에만 적용한다. 페이지 대기는 `waitForListing(..., 5000)`으로 5초뿐이다. 앞선 커밋은 봇 확인 화면 때문에 30초를 기다리게 했는데, 여기서는 그 대기가 줄었다.
- 등급: 코드, 재현됨.
- 재현: `list.example`을 `page.route`로 흉내 냈다. 한 목록은 2쪽부터, 다른 목록은 1쪽부터 "Checking your browser..."(200, 행 없음)를 돌려준다. 결과는 `[{pagesRead:2, reachedEnd:true, stoppedBy:"empty"}, {pagesRead:1, reachedEnd:true, stoppedBy:"empty", lastOpenPage:0}]`, `count:1`이다.
- 깨지는 목표: 2번(어디까지 읽었는지 기록)과 1번. 잘린 목록이 "끝까지 읽음"으로 남는다. 위비티는 5개 목록 중 어느 것이 이렇게 잘려도 소스 상태는 OK다.
- 권고:
  - 빈 페이지를 끝으로 인정하려면 같은 URL을 한 번 다시 열어 확인한다. 또는 1쪽이 비면 `blank`(`reachedEnd:false`)로 기록한다.
  - 2쪽 이후 빈 페이지는 앞선 페이지에 행이 있었다는 조건에서만 `empty`로 인정한다.
  - 위비티에서 마지막 쪽 다음이 실제로 빈 페이지임은 실측으로 확인했다(`cidx=1`은 3쪽에서 비고, 나머지는 2쪽에서 빈다). 위 조건을 넣어도 정상 동작은 유지된다.

**F2. `coverage`를 읽는 곳이 어디에도 없다**
- 내용: `coverage`를 읽는 코드가 없다. `pipeline_health.mjs`, `validate_research_audit.py`, `crawl-sources.yml`의 검증 단계, `docs/daily-runbook.md`를 찾아봤고, 문서는 `AUTOMATION.md` 228행뿐이다.
- 근거(코드): 저장소 전체에서 `coverage`·`reachedEnd`를 검색했다(`node_modules`와 `data/research`, `data/source-cache` 제외). `.claude/worktrees` 아래 사본과 `AUTOMATION.md`의 일반 문장만 나왔다.
- 등급: 코드.
- 시나리오: 중간 페이지가 HTTP 오류나 `maxPages`로 끊겨도 소스는 `status:"OK"`다. 오류 시 `byUrl`에 이미 항목이 있으면 예외를 던지지 않고 `stoppedBy:"error"`로 끝낸다. 상태 점검과 편집 단계는 이를 알리지 않는다. "기록"은 되지만 놓침이 드러나지는 않는다.
- 깨지는 목표: 1번, 2번(기록의 목적이 놓침 감소인 경우).
- 권고: 최소한 `docs/daily-runbook.md` 5단계에 "`coverage[].reachedEnd:false`인 목록은 `sourceGaps`에 기록한다"를 한 줄 넣는다. 더 근본적으로는 `pipeline_health.mjs`의 `--sources-only` 요약에 `reachedEnd:false` 목록을 경고로 출력한다. 경고만 하고 실패 처리는 하지 않으므로 사용자 결정은 건드리지 않는다. 어디까지 할지는 사용자 질문 Q1로 남긴다.

**F3. 일부 테스트가 코드를 망가뜨려도 통과한다 (`repeated` 분기)**
- 내용: `rows.every(item => seen.has(item.url))` 분기를 `if (false)`로 바꿔도 `test_crawl_navigation.mjs`가 PASS한다. `repeated` 분기를 거치는 테스트가 없다. 범위를 벗어난 페이지가 마지막 쪽을 되풀이하는 사이트에서는 이 분기가 유일한 종료 수단이다. 없으면 `maxPages`까지(ContestKorea는 100쪽까지) 읽는다.
- 근거: 변이 테스트 `noRepeated`가 통과했다. 실제 두 사이트는 범위 밖 페이지에서 빈 페이지를 주므로, 지금 사이트에서는 이 분기가 실행되지 않는다.
- 등급: 기록(변이 실행).
- 깨지는 목표: 2번(종료 지점 기록)에 약하게. 지금 사이트에는 영향이 없다.
- 권고: `/loop` 같은 목록 한 줄(마지막 쪽 반복)을 테스트에 추가한다. 기존 `list.example` 라우트에 분기 하나만 붙이면 된다.
- 나머지 변이 9종은 모두 테스트가 잡았다. 변이 내용은 `keepUrlParams` 제거, 한도 `>=`를 `>`로, `blank` 구분 제거, `empty`를 끝에서 제외, 열린 행 필터 제거, HTTP 검사 제거, `longestClosedRun` 제거, `urls[0]` 대체, 카테고리 1개만 사용이다.
- 테스트 한계: 합성 HTML이다. 실제 사이트 선택자(`.list_style_2 a[href*='view.php']`, `.ms-list ul.list a[href*='gbn=view']`)는 아래 실제 실행으로만 확인했다.

**F4. 새 위비티가 active가 된 첫날의 승격 검증 깨짐 가능성**
- 내용: `validate_research_audit.py` 37~39행은 매니페스트 `active`의 모든 키가 같은 날짜 소스 캐시에 있어야 한다고 단언한다(`source cache missing active source {key}`). 위비티가 main에 합쳐지는 시점에 그날의 `data/source-cache/<오늘>.json`에 위비티가 없으면, 그날 후보의 승격 검증이 실패한다.
- 근거(코드): 위 줄. `hasUsableCache`는 위비티가 없는 캐시를 "재사용 불가"로 판정해, 예약 크롤은 다시 실행된다(`pipeline_health.mjs` `hasUsableCache`). 그러나 그날 크롤이 이미 끝난 뒤 합치면 다음 크롤(`17 15 * * *`, 자정 이후)까지 위비티 없는 캐시가 남는다.
- 등급: 코드(줄 확인). 합치는 시각에 따라 실제 발생 여부가 갈리므로 발생은 추정.
- 깨지는 목표: 3번(매일 파이프라인).
- 권고: 합친 직후 `workflow_dispatch`로 크롤을 한 번 돌려 같은 날 캐시에 위비티를 넣는다. 운영 절차이고 코드 수정은 아니다. 그날 연구가 이미 끝났다면 `machineSources.wevity`(38건 정도)도 새 캐시와 맞춰야 한다. 검증기 114~125행대 `machine_sources` 루프가 캐시의 소스를 기준으로 요구하기 때문이다.

**F5. 위비티 검토 대상에 범위 밖 공고가 들어온다 / 접수예정은 안 읽는다 (낮음)**
- 내용: ContestKorea에는 범위 판정 함수가 있는데 위비티에는 없다. `ACTIONABLE`에 위비티 키가 없어 `crawlGeneric`의 기본 판정(D-n·접수중)이 쓰인다. 실제 38건 중 영상·캐릭터·시나리오 공고가 들어 있다("7th Da-Ho ... Short Film Competition", "한국 고전 설화 ... 캐릭터의 재해석 공모전", "한아전 게임 시나리오·그래픽 공모전").
- 근거: 실제 실행(38건, 전부 actionable). `scripts/actionability.mjs`에는 위비티가 없다. 처분(EXCLUDED 등)으로 닫을 수 있어 막히지는 않는다.
- 등급: 기록(실제 실행).
- 깨지는 목표: 3번(수집 범위)은 처분으로 지켜진다. 편집 부담만 늘어난다. 접수예정도 있다. 위비티 `mode=future`에 `cidx=1` 기준 3건이 있는데 스펙은 `mode=ing`만 읽는다.
- 권고: 원하면 위비티에도 `ACTIONABLE` 범위 판정을 추가한다. 사용자 결정(89건 안팎 유지)과 충돌하지 않게 사용자에게 묻는다(Q2).

**F6. ContestKorea 카테고리를 2개로 좁혔다 (확인 필요)**
- 내용: 전에는 홈 화면의 `view.php` 링크 전부(카테고리 무관, 대외활동 `int_gbn=2` 포함)를 읽었고, 지금은 `int_gbn=1` 목록 중 `031410001`(아이디어•건축•창업)과 `030310001`(학문•과학•IT)만 읽는다. 사이트에는 `031810001`(The 다양한 분야, 전체 1,025건) 등 다른 카테고리도 있다.
- 근거: 카테고리 메뉴 직접 열람. `031810001` 1쪽 열린 5건 중 "The 다양한 분야" 단독 라벨이 1건(K-선비한복, 범위 밖)이고 나머지는 학문•과학•IT 등 다른 라벨을 같이 달고 있다. 다중 라벨 공고는 두 목록에 모두 나오므로 대부분 잡힌다. "다양한 분야"만 단독으로 달린 아이디어·SW 공고가 있는지는 확인하지 못했다.
- 등급: 단독 라벨 누락 여부는 모름. 확인 방법: `031810001` 1~5쪽 열린 공고 제목을 사람이 훑는다.
- 깨지는 목표: 1번.
- 권고: 사용자 질문 Q3.

**F7. 코드 주석의 수치가 오늘 실측과 다르다 (낮음)**
- 내용: `crawl_sources.mjs` 주석은 "열린 공고가 최대 7쪽 간격, 29쪽 뒤에는 없었다"고 적었다. 오늘 실제 실행 결과는 다음과 같다. `031410001`은 `lastOpenPage:30`, `longestClosedRun:8`(22~29쪽). `030310001`은 `lastOpenPage:23`, `longestClosedRun:7`. 한도 15에는 여유가 있지만 최대 간격은 7이 아니라 8이다.
- 근거: 실제 실행 출력.
- 등급: 기록.
- 깨지는 목표: 없음. 사용자 결정 15장의 근거 문구만 정정하면 된다. 필요하면 사용자에게 알린다.

### 확인했고 문제 없는 것
- `collectPaged` 멈춤 경로: `empty`, `repeated`, `closedRun`, `blank`, `error`, `maxPages` 6종을 모두 코드로 따라갔다. `reachedEnd` 값은 `closedRunLimit` 목록의 `blank`와 `error`, `maxPages`가 `false`, 나머지가 `true`로 설계와 맞는다. 문제는 F1의 분류 기준 하나뿐이다.
  - 첫 페이지 오류에서 이미 `byUrl`이 비어 있으면 예외를 던져 소스가 FAILED가 된다. 테스트 `down`이 이를 지킨다.
  - 이전 목록에서 항목을 얻은 뒤 오류가 나면 부분 결과와 `error`가 남는다. 테스트 `broken`이 지킨다.
- `keepUrlParams`: 줄인 주소가 실제 공고를 연다. ContestKorea `view.php?int_gbn=1&str_no=202610290012`은 200이고 같은 공고(KDN 문서 제목 포함). 위비티 `?c=find&gbn=view&ix=111768`, `ix=111812`도 같은 공고 제목이 나왔다. ContestKorea는 `Txt_bcode`가 없어서 페이지 상단 카테고리 표기(breadcrumb)만 비는 정도다.
- 실제 실행 결과(임시 폴더, 저장소 캐시 미접촉):
  - 위비티: 30.5초, 38건, 5개 목록 전부 `reachedEnd:true, stoppedBy:"empty"`.
  - ContestKorea: 98.6초, 99건 중 actionable 90건, 두 카테고리 모두 `closedRun`으로 종료.
  - 두 카테고리가 겹치는 공고는 한 건으로 합쳐졌다.
- 위비티 active 이동의 영향:
  - `evolve_crawler_sources.py`: 3회 연속 실패하면 degraded로 내려가고 `crawlerSpec`이 있으므로 shadow로 계속 돈다. `crawl-sources.yml` 검증의 `shadow_expected`와도 맞다.
  - 매니페스트 키는 64개 중 중복이 없다. 위비티는 다른 칸에 없었다.
  - 상태 점검(`assessHealth`)과 `crawl-sources.yml` 검증은 위비티를 그대로 처리한다.
  - `evolve`와 액션터빌리티 테스트는 모두 PASS했다.
- 기존 캐시 호환: 11-02 캐시에는 `coverage`가 없지만 어떤 소비자도 이를 요구하지 않는다(F2와 같은 사실). ContestKorea 항목의 주소 형태가 `contestkorea.com/...&Txt_bcode=...`에서 `www.contestkorea.com/...int_gbn=1&str_no=...`로 바뀐다. 같은 날 캐시와 감사 비교는 정확 일치로 하므로(`research_rules.normalize_url`, 추적 파라미터만 제거) 편집자는 캐시 주소를 그대로 적어야 한다. 다른 날 발행 항목과의 중복 판정은 GPT 몫이며 영향은 추정이다.
- Actions 실행 시간: ContestKorea 98.6초, 위비티 30.5초, 모든 소스가 동시에 돈다. 테스트 단계 34.8초. `timeout-minutes` 설정이 없어 기본 제한은 6시간이다. 최악(사이트 먹통)은 페이지당 최대 약 2분이고 한 목록은 첫 오류에서 끝난다. 시간 제한에 걸릴 근거는 없다. GitHub 러너에서 ContestKorea가 80여 회 연속 요청을 막는지는 모름(미확인). 확인 방법은 `crawl-sources.yml`을 `workflow_dispatch`로 한 번 돌려 `coverage[].stoppedBy`를 보는 것이다.
- `AUTOMATION.md` 228행의 "pagination은 `actionability`를 무시한다"는 문구: 코드는 `actionability:"all"`을 계속 읽는다. 열린 행만 남아 있어서 결과가 같으므로 동작상 문제는 없다.

### 사용자만 답할 수 있는 질문
- **Q1.** `coverage[].reachedEnd:false`가 나온 날, 상태 점검이나 편집 단계에서 경고만 낼까(권고), 아무것도 안 할까? (F2, 목표 2)
- **Q2.** 위비티 검토 대상 38건에 영상·캐릭터·시나리오 공고가 섞여 들어온다. ContestKorea처럼 범위 판정을 넣을까, 편집자가 처분으로 닫게 둘까? 위비티의 접수예정(`mode=future`)도 읽을까? (F5, 목표 1·3)
- **Q3.** ContestKorea에서 "The 다양한 분야"(`031810001`)나 대외활동 같은 다른 카테고리도 읽을까? 지금은 2개 카테고리만 읽는다. (F6, 목표 1)
- **Q4.** 위비티를 main에 합친 직후 같은 날 크롤을 한 번 수동 실행해도 되는가? (F4, 목표 3)
