# Review — main — 261106

> Pre-merge code review. Check the accumulated changes against the memory rules, AGENTS.md conventions, and the plan/spec intent.
> Location: `.beaver/output/review/` — `<stick>-review-<YYMMDD>.md` (stick = branch name with `/`→`-`, one per ship unit). For a re-review on the same day, append `-<N>`.

## Target
- stick: 해당 없음(direct mode) → origin: `main`
- Included features: 업체 둘러보기(로드맵 Phase 18 — #74 · #76 · #77 · #116 · #117, #75 는 #74 에 합침)
  - user-service `discovery` 새 도메인: 반경 업체 · 업체 상세 · 객실 그룹 목록, 로그인 없음
  - 예약 가능 시간을 그룹 → 시간대 → 호수로 바꾸고 그룹 필터를 더함
  - 시간 이용 지금 바로 예약
  - 결제 확인 때 QR 발급
- Change scope: 수정 19 · 새 파일 22, `git diff HEAD` 522+ / 131−(새 파일 제외)
  - 새 파일 내역: contracts 4 · user-service discovery 13(도메인 8 · 테스트 5) · gateway 2 · spec · plan · report

## Convention Check (against AGENTS.md)
| Item | Result | Notes |
|------|------|------|
| Naming | pass | 도메인 파일 `discovery.<role>.ts` · DTO `discovery-<feature>.dto.ts` · 내부 경로 `DISCOVERY_INTERNAL_PATH`(경로 함수 `encodeURIComponent`) · 응답 `*ResultDto` · 라우트 `/api/v1/user-service/discovery/store…` → `/internal/v1/user-service/discovery/…` |
| Structure & layering | pass | controller(동기만 — 큐 없음) → service → repository. 다른 도메인 표(store · room)는 discovery 어휘로 직접 읽는다(로드맵 결정) |
| ↳ 재고 계산 | pass | 예약 가능 시간 한 곳(reservation)에만 두고 discovery 는 계산하지 않음(사용자 결정 2026-11-06) |
| ↳ 의존 | pass | 앱끼리 import 없음, 사진 주소는 `STORAGE_GATEWAY` 포트(user-service 루트에 `StorageModule`) |
| Shared logic extraction | pass | service private 헬퍼 0 |
| ↳ util 위치 | pass | discovery: `toRadiusBox` · 응답 조립 · 판매 판정은 `discovery.util.ts`(라디안 · 시각 변환은 파일 전용 헬퍼). reservation: `toNowStay` · `toAvailabilityGroups` · `buildRoomQr` · `isReservationStarted` 를 util 로 |
| ↳ dayjs | pass | 날짜 · 시각은 모두 `@app/common/utils/dayjs.js` |
| Errors & responses | pass | 업체 없음 404(두 곳 — 상수), 지금 바로 400 2개(validation_errors 귀속 필드), QR 재읽기 없음 500(상수 — 두 곳) · Redis 503 은 잡지 않음(재시도), 결제 확인의 외부 단계(setQr)는 마지막 |
| ↳ null 필드 | pass | 응답 null 필드 생략 없음(최저가 · 사진 · 상세주소 · 소개 · 메모) |
| Test strength | pass | `[CASES:now-stay]` 12 · `[CASES:radius-box]` 5 · 기존 `[CASES:availability]` 14(새 모양) |
| ↳ 단언 | pass | 호출 인자 · 조회 조건(`In` · `MoreThanOrEqual` · 한국 날짜) · 호출 순서 · 미호출 · 공개 필드 toEqual(사업자 정보가 없음을 증명) |
| Data-Access Smoke | pass | 새 매핑 민감 메서드 모두 SQL 고정 — 반경 업체(대원 거리 식 select · where · 파라미터 재사용 · 서브쿼리 3) · 그룹별 호실 수(IN · GROUP BY) · 상품 설정(조인) + find 조건 8 |
| memory | pass | `.beaver/output` 커밋 포함(git). cache 항목(미반영)은 캐시 코드가 생기는 Phase 23 후보라 제안하지 않음 |
| 기타 규약 | pass | README · AGENTS(트리 · 인증 없는 공개 라우트 · Query DTO 목록 · 외부 연동 · Smoke 목록) · docs 3개를 같은 변경에서 갱신 |
| ↳ 공개 라우트 · 설정 | pass | 공개 라우트 Swagger 데코레이터 순서 맞음, compose 변경 없음(`.env` 의 AWS 값이 이미 user-service 에 닿는다) |
| 초안 규약 | 해당 없음 | 새 규약 영역 없음(§4.5 — 기존 동기 조회 · 공개 라우트 패턴) |

## Intended Behavior Check (against plan/spec)
- **반경 업체**
  - 활성 · 지워지지 않은 업체를 사각형(인덱스)으로 먼저 거르고, 대원 거리 ≤ 반경, 가까운 순(동률은 업체 ID) 301개를 읽어 300개 + `is_truncated` 로 돌려준다.
  - 사각형은 경도 폭을 asin 식으로 잡아 원의 동서 접점까지 덮는다(케이스 5 — 원 위 36점).
  - 영업중 아님은 `is_open: 0` 으로 보인다.
  - 최저가는 업체 상품 설정 · 그룹 상품 사용 · 요금 > 0 · 예약 받을 호실이 있는 그룹의 기본 요금 최솟값이다.
- **업체 상세**: 공개 필드만 나온다(사업자 정보 · 업체코드 · 정지 사유 · 문 시크릿 · 정비시간 없음). 사진은 STORE_IMAGE CDN 주소, 시각은 HH:mm, 상품 설정은 사용 중만 시간 이용 → 1박 → 연박 순.
- **그룹 목록**: 예약 받을 호실 > 0 · 판매 중인 상품이 있는 그룹만 그룹명 순으로 나온다. 상품 순서는 종류 순이고, 기간 가격은 끝 날짜 ≥ 한국 오늘이다.
- **예약 가능 시간**
  - 그룹(판매 중, 시간대 없어도 나옴) → 시간대(호수 1개 이상만) → 호수(층 · 호실명 순). 금액은 그룹 단위, 그룹 필터가 있다.
  - 시간 이용 · 오늘이면 지금 바로 시간대(`is_now: 1`)가 맨 앞에 온다. 판정은 기존 재고 판정 그대로이고, 시작 기준만 지금 분으로 내렸다.
- **지금 바로 예약**: 시간 이용 · 오늘만 받는다(아니면 400 — is_now · date). 구간은 지금(분) ~ + 이용 시간이고, 같은 재고 판정을 거친다. 예: 23:36 → 03:36 이고, 겹치면 불가다.
- **결제 확인 QR**: 확정 뒤 `start_at ≤ 지금 < end_at` 이면 아래 순서로 처리한다(마지막 단계).
  1. `INSERT … ON CONFLICT DO NOTHING`
  2. 다시 읽기
  3. `setQr`

  시작 전이면 발급하지 않는다. 내 예약 QR 도 같은 `buildRoomQr` 를 쓴다.
- 빠진 것 · 잘못 구현된 것 없음. plan 과 다른 점은 report 에 기록했다(테스트 픽스처 ID · 부팅 인자 · 1박 케이스 업체).
- 리뷰 확인: 지금 바로 예약은 환불 마감이 이미 지나 있다. 결제 대기 중 취소는 결제 만료로 처리되고, 확정 뒤에는 시작 뒤 취소 불가다. 기존 취소 규칙 그대로이며 spec 과 같다.

## Findings
| # | Severity | Location (path:line) | Description | Recommendation |
|---|--------|-----------------|------|------|
| 1 | Info | `apps/user-service/src/discovery/repositories/discovery.repository.ts` `buildStoreRowsQuery` | 업체마다 상관 서브쿼리 3개(대표 사진 · 시간 이용 · 1박 최저가) × 최대 301행. 50km 밀집 지역에서 느려질 수 있다 | Phase 23 #97 에서 `t_api_log.duration_ms` 로 측정한 뒤 캐시 여부를 정한다 |
| 2 | Info | 같은 파일 `DISTANCE_SQL` | 대원 거리 계산은 SQL 이라 Smoke 가 SQL 문자열만 확인한다(실 DB 금지). 사각형 계산은 TS 케이스로 확인했다 | 사용자가 실데이터로 알려진 두 지점의 거리를 한 번 확인 |
| 3 | Info | `apps/user-service/src/reservation/reservation.util.ts` `isStayBookable` | 시작 비교를 지금 분으로 내리면서, 지금과 같은 분의 30분 단위 시작도 이제 예약 가능하다(예: 10:30:20 에 10:30). 즉시 입실 규칙(예약가능 호실만)은 그대로다 | 의도된 변화로 기록만 한다 |

## Verdict
통과 — 문제 없음(Info 3건만). typecheck · lint(경고 0) · build · db:check 와 전체 테스트 101파일 996건이 통과했다. 커밋으로 넘어간다.
