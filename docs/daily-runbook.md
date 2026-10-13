# Daily Brief 일일 실행 절차

09:00 예약 실행이 처음부터 끝까지 따르는 순서다. 이 파일은 끝까지 전부 읽는다. 세부 규칙은 각 단계에 적힌 `AUTOMATION.md`의 절을 그 단계를 시작할 때 찾아서 그 절 전체를 읽는다. `AUTOMATION.md`를 앞뒤만 추려 읽고 끝난 것으로 보지 않는다.

## 계속 진행 원칙

캐시 확인은 1단계일 뿐이다. 아래 "중단 조건"이 실제로 발생하지 않았다면 9단계 발행 확인까지 실제 도구 호출로 진행한다. 검색·열람·작성·검증을 하지 않은 채 "미완료"로 보고하고 끝내지 않는다.

중단 조건은 다음뿐이다.
- 필수 크롤러 캐시가 10분 대기 후에도 없거나 필수 출처가 실패했다.
- 도구 오류로 작업을 계속할 수 없고, 재시도해도 같은 오류가 난다.
- GitHub 쓰기가 도구 안전 검사에서 거부됐다.
- 검증 스크립트가 실패했는데, 실제로 수행한 조사만으로는 정직하게 고칠 수 없다.
- 실행 시간·도구 호출·컨텍스트 한도에 실제로 도달했다.

중단하면 다음을 보고한다. 마지막으로 완료한 단계 번호, 단계별 처리 건수(예: 재검증 18/42), 중단 원인이 된 도구 호출과 오류·거부 문구 원문, 복구 묶음이 있으면 위치와 해시.

## 1. 입력 읽기와 캐시 확인
- current main의 `data/latest.json`, `data/crawler-sources.json`, 가능하면 `data/crawler-source-state.json`을 읽는다.
- `data/source-cache/YYYY-MM-DD.json`을 확인한다. 날짜가 오늘이고 `crawler.engine == playwright-chromium`이며 필수 출처가 `OK`이면 바로 2단계로 간다. 크롤러는 다시 실행하지 않는다.
- 캐시가 없을 때만 `AUTOMATION.md` → "Source crawler preflight"를 따른다. 그동안 4단계 웹 조사는 먼저 진행할 수 있다.
- 비필수 출처가 `FAILED`이면 `sourceGaps`에 기록하고 계속 진행한다. 비필수 출처 실패는 중단 사유가 아니다.

## 2. 작업 목록 만들기
- 셸이 있으면 `python3 scripts/research_worklist.py --date YYYY-MM-DD --json`을 실행한다. 셸이 없으면 같은 목록을 main과 캐시에서 직접 계산한다. 계산 기준은 `AUTOMATION.md` → "Daily research checklist" §1.
- 이 목록은 할 일 목록일 뿐 확인 증거가 아니다. 목록의 항목을 확인한 것으로 기록하지 않는다.
- 이후 단계의 완료 기준은 이 목록의 재검증 대상 수와 actionable URL 수다.

## 3. 기존 공고 재검증
- 참조: "Daily research checklist" §1.
- 재검증 대상마다 공식 페이지를 실제로 열어 상태·마감·자격·혜택을 확인한다. `lastVerifiedDate`를 오늘로 하고 id를 `reverifiedIds`에 넣는다. 확인하지 못한 항목은 `reverificationFailures`에 사유와 함께 남긴다.
- 완료 기준: 재검증 대상 전부가 `reverifiedIds` 또는 `reverificationFailures`에 있다.

## 4. 독립 검색 트랙
- 참조: "Discovery", "Daily research checklist" §2·§4, "AI news", "AI Discovery / Source Radar".
- 트랙: `aiData`(후보 10개 이상), `generalSoftware`(15개 이상), `publicIdea`(10개 이상), `startupSupport`(15개 이상), `upcomingOpenings`, `aiNews`, `aiDiscovery`.
- 후보 수를 채우지 못하면 여러 검색 축을 소진했다는 사유를 기록한다. `aiNews`는 `officialProduct`, `githubReleases`, `huggingFace`, `researchLabs`, `communities` 축의 실제 검색어를 모두 기록한다.
- 한 트랙에서 후보가 많이 나와도 다른 트랙은 생략하지 않는다.
- 완료 기준: 모든 트랙에 실제 검색어, 후보 제목·URL, 처분(`PUBLISHED`/`EXISTING`/`DUPLICATE`/`INELIGIBLE`/`CLOSED`/`NOT_RELEVANT`)이 있다.

## 5. 고정 출처, 크롤러 목록, 지역 점검
- 참조: "Structured source enumeration", "Daily research checklist" §3, "Mandatory Seoul northeast district-source track".
- 성공한 active 크롤러의 `actionableItems[]` 전부를 `machineSources.<key>[]`에 `title`·`url`·`disposition`으로 기록한다.
- DACON·DAKER의 `actionableItems[]` 전부를 `fixedSources.DACON.competitionsInventory[]`·`dakerInventory[]`에 기록한다. 하나라도 빠지면 발행이 막힌다.
- 고정 출처 묶음마다 확인한 URL 또는 구체적인 실패 사유를 남긴다.
- 노원·도봉·강북은 각각 공식 페이지를 확인하고 결과를 `districts`에 기록한다.
- 성공한 `shadowSources`는 추가 후보로 검토하고, 쓸모가 있었으면 `sourceDiscoveries`에 기록한다.

## 6. 1차 출처 확인, 중복 정리, 누락 점검
- 참조: "Daily research checklist" §5–§8, "Eligibility".
- 발행할 후보는 공식 공고·신청 페이지로 확인한다. 명시되지 않은 사실은 `명시 없음`·`확인 필요`로 쓴다.
- 기존 항목과 같은 대상이면 병합한다. §8의 누락 점검 조건에 해당하면 해당 트랙을 다시 검색한다.

## 7. 데이터 작성
- 참조: "Data model", "Editorial selection", "Daily research checklist" §9, "Today indicators".
- `data/latest.json`과 `data/archive/YYYY-MM-DD.json`을 바이트 단위로 같은 내용으로 쓰고, `data/research/YYYY-MM-DD.json`을 쓴다.
- 기존 id와 `firstSeenDate`를 보존한다. 단순 재확인은 `lastVerifiedDate`만 바꾼다. GitHub 별·포크 수는 손대지 않는다.

## 8. 검증과 복구 묶음
- 기준선: current main의 `data/latest.json` 사본을 `baseline-latest.json`으로 저장한다.
- `python3 scripts/validate_data.py data/latest.json`
- `python3 scripts/validate_research_audit.py data/research/YYYY-MM-DD.json data/latest.json baseline-latest.json`
- 실패하면 실제 조사로 빠진 증거를 보완하고 다시 검증한다. 증거를 지어내서 통과시키지 않는다.
- 통과하면 `python3 scripts/publication_bundle.py pack --date YYYY-MM-DD --latest data/latest.json --archive data/archive/YYYY-MM-DD.json --research data/research/YYYY-MM-DD.json --baseline baseline-latest.json --out <묶음 경로>`를 실행한다. 임시 환경 밖에 사본을 보관하고 위치를 확인한다.

## 9. staging 발행과 확인
- 참조: "Daily research checklist" §10.
- 오늘자 캐시 커밋이 포함된 최신 main에서 `automation/daily-brief-YYYY-MM-DD-data`를 만든다. 세 파일만 하나의 커밋으로 push한다.
- push가 거부되면 우회하지 않는다. 중단 조건에 따라 보고한다.
- `Promote daily brief staging snapshot` 실행 성공, 이어진 Pages 배포 성공, 공개 사이트의 `data/latest.json` 날짜가 오늘인지까지 확인해야 완료다.
- 정상 완료는 조용히 끝낸다.
