# Review — main — 261109

> Pre-merge code review. Check the accumulated changes against the memory rules, AGENTS.md conventions, and the plan/spec intent.
> Location: `.beaver/output/review/` — `<stick>-review-<YYMMDD>.md` (stick = branch name with `/`→`-`, one per ship unit). For a re-review on the same day, append `-<N>`.

## Target
- stick: `main`(direct mode — worktree 없음) → origin: `main`
- Included features: 연장(Phase 26 — #81 · #124) — [plan](../plan/reservation/reservation-extension-plan.md) · [spec](../spec/reservation/reservation-extension-spec.md) · [report](../report/reservation/reservation-extension-report.md)
- Change scope: 52 files changed(+1418 · −108) + 새 파일 8 — 엔티티 2 · 마이그레이션 1 · contracts(명령 · 내부 경로 · DTO 2 새 + 3 수정) · user-service reservation · discovery · admin-service room · store · scheduler reservation · gateway 라우트 2 · 문서(README · AGENTS · docs 4) · 로드맵 · spec 보드

## Convention Check (against AGENTS.md)
| Item | Result | Notes |
|------|------|------|
| Naming | pass | DTO kebab · 기능당 1개(`reservation-extension.dto.ts` 조회 · `reservation-extend.dto.ts` 신청), 명령 `user.reservation.extend`, 내부 경로 함수 `RESERVATION_INTERNAL_PATH.extension()`, 제약 `CHK_RoomPlan_MaxExtensions` · 부분 유니크 `UK_ReservationDetail_ReservationIdPending`, 컬럼 `is_extendable`(여부 `is_<형용사>`) · `max_extensions` |
| Structure & layering | pass | 이용자 연장 → user-service, 업체 상품 설정 → admin-service room, 만료 · 종료 대기 → scheduler(행위자별 서버). controller 위임만(동기 `@InternalActor` · 큐 `requireActor`), crontab → repository 직접, scheduler 여러 쓰기는 `withTransaction` + 상태 조건(결제 READY · 구간 PENDING · 예약 끝 = 연장 시작) |
| Shared logic extraction | pass(1건 Low) | 판정 · 구간 · 금액 · 주문명 · 응답은 도메인 util(`judgeExtension` · `toExtensionStay` · `calculateExtensionPrice` …, 파일 전용 `isExtensionWithinStoreHours` · `buildExtensionRelease`), service private 헬퍼 0. 조회 · 신청의 DB 읽기 블록이 같다(#1) |
| Errors & responses | pass | 판정 사유는 조회 `reason` · 신청 400 이 같은 문구, repository 제약명 분기(부분 유니크 23505 · 배타 제약 23P01 → 400) · 통일 500, 커밋해야 하는 결제 확인 실패는 return(환불 신청 · 구간 만료 · 되돌림), 응답 필드 null 포함(`reason` · `room_plan_type_id` · `start_at` · `end_at` · `amount`), Redis `setQr` 는 마지막 |
| Test strength | pass | 계산 표 2종을 service spec 이 지난다(extension-stay 7 · extension-judge 16), 쓰기 엔티티 값 · 호출 순서 · 미호출 단언, 새 · 바뀐 매핑 민감 쿼리는 Smoke 고정(결제 대기 만료 · 이용 종료 NOT EXISTS · 연장 다음 예약 `Not` · 구간 find · 잡아 두기 · 연장 확정 · 연장 전환 update) |

memory: `git`(산출물 커밋 포함 — 지킴) · `api-log`(해당 없음) · `cache`(미반영 code rule — 캐시 코드가 아직 없어 이번 변경과 무관, Phase 23 에 옮긴다). draft 문서 없음.

## Intended Behavior Check (against plan/spec)
- **연장 단위 · 요금(#81)** — 시간 이용 · 1박은 업체 시간 이용 이용 시간만큼 · 그룹 시간 이용 요금, 연박은 1일 · 그룹 1박 요금, 요금 기준일 = 연장 시작의 한국 날짜(기간 가격). 사용자 예시(1박 21:00 ~ 09:00 → ~ 13:00, 시간 이용 14:00 ~ 16:00 → ~ 20:00 → ~ 24:00)가 `[CASES:extension-stay]` 1 · 2 · 4 로 고정. 맞음.
- **판정 순서** — 이용 중 아님 → 만료된 연장 → 결제 대기 연장 → 업체 · 호실 → 연장 불가 상품 → 최대 횟수 → 판매 안 함 → 연박 최대 박수 → 시간(영업시간 · 브레이크 · 일시 예약불가) → 다음 예약(정비시간까지). spec 순서와 같다. 맞음.
- **잡아 두기 · 5분 결제** — 결제 READY → 구간 EXTENSION · PENDING(만료 5분) → `blocked_until` = 새 끝 + 정비시간(예약 상태 · 끝 조건, 겹치면 배타 제약 400), 겹친 신청은 부분 유니크 400. 맞음.
- **확정 · 만료** — 결제 확인(user-service)과 결제 대기 만료(scheduler)가 구간 종류로 가른다: 확정이면 끝 · 합계 · QR 유효 끝, 아니면 환불 신청 또는 만료 + 되돌림, 만료된 예약은 다시 연장 불가. 이용 종료는 결제 대기 연장이 있으면 기다리고, 이용자 취소 · 이용 중 취소 승인은 결제 대기 연장을 취소 · 결제 만료. 맞음.
- **업체 상품별 연장 설정(#124)** — `t_room_plan` 두 컬럼(기본 가능 · 3회, 1 ~ 10), 업체 관리자 조회 · 수정(필수), 입점 승인 기본값, 업체 둘러보기 상세 노출, 판정은 예약 기본 상품 행의 지금 값 · 확정 연장 수. 맞음.
- 빠진 것 · 잘못된 것 없음. 확인한 경합: 호실 이동은 시작 전만(연장은 이용 중만이라 겹치지 않음), 끝 ≤ 점유 끝 CHECK(`CHK_Reservation_StartEndBlocked`)는 확정(끝만 늘림 — 점유 끝은 잡아 두기 때 이미 새 끝 + 정비) · 되돌림(지금 끝 + 정비) 모두 지킨다.
- 검증: typecheck · lint · build · db:check 통과, 전체 110파일 1223건 통과(build 단계 확인 실행).

## Findings
| # | Severity | Location (path:line) | Description | Recommendation |
|---|--------|-----------------|------|------|
| 1 | Low | apps/user-service/src/reservation/reservation.service.ts `getExtension` · `requestExtension` | 두 메서드의 재료 읽기 블록(구간 · 업체 · 호실 · 상품 · 그룹 상품 · 기간 가격 · 영업시간 · 브레이크 · 일시 예약불가 · 점유 예약)이 같다 — service private 헬퍼 금지 · DB 읽기는 util 로 못 옮겨 생긴 중복 | 그대로 둠 — 판정 · 계산은 util 하나(`judgeExtension`)라 결과가 갈리지 않는다. 읽기 조건이 바뀌면 두 곳을 같이 고친다 |
| 2 | Low | apps/user-service/src/reservation/reservation.service.ts `confirmPayment` · `cancelReservation` · `approveCancelRequest` | 새 호출 모양 `updateReservationDetails({reservation_detail_id, reservation_state_id})` · `updatePayment({payment_id, payment_state_id: READY})` 는 user-service repository Smoke 가 따로 없다 | 그대로 둠 — 같은 엔티티 · 같은 컬럼(구간 ID + 관계 컬럼 상태) update 를 scheduler Smoke(`transitionExtension`)가 SQL 로 고정했다(`WHERE ("reservation_detail_id" = $2 AND "reservation_state_id" = $3)`) |
| 3 | Low | apps/scheduler/src/reservation/repositories/reservation.repository.ts `transitionExtension` | scheduler 가 연장을 확정할 때(이용자가 결제 확인을 부르지 않은 경우) Redis 현재 QR 은 QR 동기화가 1분 안에 맞춘다 — 이전 끝이 지나 Redis 키가 만료됐으면 그 사이 최대 1분 문이 QR 을 거부할 수 있다 | 그대로 둠 — plan 대로(scheduler 결제 대기 만료에 문 정보 포트를 두지 않는다). 보통 경로(프론트가 결제 확인 호출)는 바로 Redis 를 쓴다 |
| 4 | Low | libs/contracts/src/room/dto/room-plan-update.dto.ts | 업체 상품 설정 수정(`PUT /api/v1/admin-service/room/plan`)에 `is_extendable` · `max_extensions` 가 필수가 됐다 — 두 값을 안 보내는 기존 프론트는 400 | 그대로 둠 — 통째로 교체하는 PUT 규칙. 배포 안내(프론트)에 적는다 |
| 5 | Low | apps/user-service/src/reservation/reservation.service.ts `confirmPayment` | 이용자 취소로 정리된 결제 대기 연장(구간 CANCELED · 결제 EXPIRED)에 늦게 결제가 오면 환불 신청은 맞게 되지만 문구가 '연장 결제 대기 시간이 지나 결제를 취소했습니다.'(사유 `결제 대기 시간 경과`)다 | 그대로 둠 — 데이터는 안전(환불 신청 · 예약 그대로). 문구를 가르려면 예약 상태로 한 줄 분기 |

## Verdict
Pass — 막는 문제 없음(Low 5건은 모두 그대로 두는 권고). 커밋 단계로 진행한다.
