# Report — reservation-extension

## Feature Summary
- **Feature**: 연장(Phase 26) — 이용 중 예약을 지금 끝에서 한 단위씩 늘린다.
  - 시간 이용 · 1박: 업체 시간 이용 이용 시간만큼, 그룹 시간 이용 요금(기간 가격 포함)
  - 연박: 1일씩, 그룹 1박 요금으로 연박 최대 박수까지
  - 업체 상품별(시간 이용 · 1박 · 연박) 연장 가능 여부 · 최대 연장 횟수(기본 연장 가능 · 3회, 1 ~ 10회) — 예약의 기본 상품 행을 지금 값으로 읽는다
  - 신청하면 점유 끝(`blocked_until`)을 늘려 바로 잡아 두고(다음 예약과 겹치면 불가) 5분 안에 결제, 결제하지 않으면 만료 · 되돌림, 그 예약은 다시 연장할 수 없다
  - 결제 확인은 기존 `/payment-confirm` · 결제 대기 만료 crontab 을 구간 종류(EXTENSION)로 가른다. 이용 종료는 결제 대기 연장이 있으면 기다리고, 이용자 취소 · 이용 중 취소 승인은 결제 대기 연장을 정리한다
- **Entry point**:
  - 이용자 `GET /api/v1/user-service/reservation/:reservation_id/extension`(동기 — 조회) · `POST …/:reservation_id/extension`(큐 `user.reservation.extend` — 신청)
  - 업체 관리자 `GET` · `PUT /api/v1/admin-service/room/plan`(상품 설정 — `is_extendable` · `max_extensions`)
  - 업체 둘러보기 `GET /api/v1/user-service/discovery/store/:store_id`(상품 설정에 두 값)
  - 기존 변경: 결제 확인 `user.reservation.payment-confirm`(연장 구간) · 이용자 취소 · 이용 중 취소 승인(결제 대기 연장 정리) · 입점 승인(상품 3행 기본값) · scheduler 결제 대기 만료(연장 구간) · 이용 전환(종료 대기)
- **Domain**: reservation(user-service · scheduler) · room · store(admin-service) · discovery(user-service) · libs/database — 로드맵 Phase 26 의 #81 · #124
- **Plan**: [reservation-extension-plan.md](../../plan/reservation/reservation-extension-plan.md) · **Spec**: [reservation-extension-spec.md](../../spec/reservation/reservation-extension-spec.md)

## Created/Modified/Deleted Files
| File | Change Type | Description |
|------|-----------|------|
| `libs/database/src/entities/room/room-plan.entity.ts` | modified | `is_extendable`(기본 1) · `max_extensions`(기본 3) · CHECK `CHK_RoomPlan_MaxExtensions`(1 ~ 10), 주석 |
| `libs/database/src/entities/reservation/reservation-detail.entity.ts` | modified | 부분 유니크 `UK_ReservationDetail_ReservationIdPending`(예약당 결제 대기 구간 1개) |
| `libs/database/src/migrations/1794157026139-ReservationExtension.ts` · `migrations.ts` | created · modified | `db:generate` — 컬럼 2 · CHECK · 부분 유니크(up 6 · down 6), 설명 주석. 불필요한 재생성 줄 없음 |
| `libs/contracts/src/room/dto/room-plan-update.dto.ts` · `room-plan-list.dto.ts` | modified | 수정 필수(`@IsIn([0,1])` · `@IsInt` `@Min(1)` `@Max(10)`) · 조회 항목 |
| `libs/contracts/src/discovery/dto/discovery-store-detail.dto.ts` | modified | 상품 설정 항목에 두 값 |
| `libs/contracts/src/reservation/reservation.commands.ts` | modified | `RESERVATION_COMMAND.EXTEND` · `RESERVATION_INTERNAL_PATH.extension()` |
| `libs/contracts/src/reservation/dto/reservation-extension.dto.ts` · `reservation-extend.dto.ts` | created | 조회(가능 여부 · 사유 · 구간 · 금액) · 신청(결제 정보 · 만료 · 구간) |
| `apps/admin-service/src/room/` (service · util · interfaces · repositories) | modified | `RoomPlanRow` · 조회 select · 응답 · 수정 때 두 값 쓰기 |
| `apps/admin-service/src/store/store.constants.ts` · `store.service.ts` | modified | `STORE_PLAN_MAX_EXTENSIONS_DEFAULT` 3, 입점 승인 3행에 연장 가능 · 3회 |
| `apps/user-service/src/discovery/` (util · interfaces · repositories) | modified | `DiscoveryStorePlanRow` · select · 응답 |
| `apps/user-service/src/reservation/reservation.constants.ts` · `reservation.util.ts` | modified | 연장 판정 문구 8개, `ExtensionStay` · `ExtensionContext` · `toExtensionPlanType` · `toExtensionStay` · `toStayNights` · `calculateExtensionPrice` · `judgeExtension` · `buildExtensionOrderName` · `toExtensionResult`, 파일 전용 `isExtensionWithinStoreHours` |
| `apps/user-service/src/reservation/reservation.service.ts` | modified | 새 `getExtension` · `requestExtension`(결제 READY → 구간 EXTENSION · PENDING · 5분 → 잡아 두기), `confirmPayment` 연장 갈래(확정 · 환불 신청 + 만료 + 되돌림), `cancelReservation` · `approveCancelRequest` 결제 대기 연장 정리 |
| `apps/user-service/src/reservation/interfaces/…` · `repositories/reservation.repository.ts` | modified | `insertReservationDetail`(부분 유니크 → 400), 새 `updateReservationHold`(배타 제약 → 400 · boolean) |
| `apps/user-service/src/reservation/controllers/reservation.controller.ts` · `.queue.ts` | modified | GET extension · `@OnCommand(EXTEND)` |
| `apps/scheduler/src/reservation/interfaces/…` · `repositories/reservation.repository.ts` | modified | `ExpiredPendingRow`(구간 · 예약 필드 12), `buildExpiredPendingQuery`(기본 · 연장 + 예약 조인), 새 `transitionExtension`(withTransaction · 결제 READY 조건 · 예약 끝 = 연장 시작 조건), `buildUsageEndRowsQuery`(결제 대기 연장 NOT EXISTS) |
| `apps/scheduler/src/reservation/reservation.util.ts` | modified | `ExtensionTransition` · `buildExtensionConfirmTransition` · `buildExtensionRefundTransition` · `buildExtensionExpireTransition`, 파일 전용 `buildExtensionRelease` |
| `apps/scheduler/src/reservation/crontabs/reservation-payment-expire.crontab.ts` | modified | 연장 구간 갈래(결제됨 + 확정 · 이용 중 → 확정, 결제됨 · 금액 다름 → 환불 신청, 미결제 → 만료) |
| `apps/gateway/src/api/v1/user-service/reservation/controllers/*` | modified | 공개 라우트 2개(조회 동기 · 신청 큐) |
| 테스트 — 아래 Tests Written | created · modified | |
| `README.md` · `AGENTS.md` · `docs/{data-layer,messaging,testing,integration}.md` | modified | 연장 API · 상품 연장 설정 · scheduler 결제 대기 만료 · 이용 종료 대기 · `user.reservation.extend` · Smoke 목록 |

## Tests Written
- user-service
  - `reservation-extension.spec.ts`(새, 35건) — `[CASES:extension-stay]` 7개(시간 이용 한 번 · 두 번째 연장(자정까지) · 자정 넘은 연장의 요금 날짜 = 연장 시작일 · 1박 → 시간 이용 단위 · 연박 1일 · 1박 요금 · 기간 가격 안 · 밖), `[CASES:extension-judge]` 16개(판정 순서 1 ~ 10 — 이용 중 아님 · 만료 연장 · 결제 대기 · 업체 · 호실 · 연장 불가 상품 · 최대 횟수 · 판매 안 함 · 연박 최대 박수 · 영업시간 · 브레이크 · 일시 예약불가 · 다음 예약(정비시간)), 조회 조건(자기 예약 `Not` · 점유 상태 · 새 끝 + 정비) · 404 · 검증 · 401.
  - `reservation-extend.spec.ts`(새, 11건) — 결제 · 구간 · 잡아 두기 값과 순서 · 결과, 연박 1일 · 1박 요금, 판정 400 · 404 · 잡아 두기 0행 400, 부분 유니크 · 배타 제약 400, 결제 환경 503 requeue, 검증, 401.
  - `reservation-payment-confirm.spec.ts` — `[연장 구간]` 7건(확정 쓰기 · QR · Redis 마지막, 이전 끝이 지난 QR 도 늘림, QR 없음, 금액 다름 · 늦은 결제 · 취소된 예약 환불 + 만료 + 되돌림, 예약 0행 롤백).
  - `reservation-cancel.spec.ts` · `reservation-cancel-request-approve.spec.ts` — 결제 대기 연장 정리(구간 CANCELED · 결제 EXPIRED · 환불은 확정 구간만) 각 1건.
  - `reservation.repository.spec.ts` — `insertReservationDetail` 부분 유니크 400 · 그 밖 500, `updateReservationHold` 조건 · boolean · 배타 제약 400 · 500, Smoke 4건(연장 다음 예약 `Not` find · `findReservationDetails` 관계 컬럼 · 잡아 두기 update · 연장 확정 update `IN` · 끝).
  - `discovery-store-detail.spec.ts` · `discovery.repository.spec.ts` — 상품 설정 두 값 · select Smoke 갱신.
- admin-service
  - `room-plan-update.spec.ts` — 두 값 저장(1박 0 · 10회), 검증 6건(누락 · 0/1 밖 · 정수 아님 · 0 · 11).
  - `room-plan-list.spec.ts` · `room.repository.spec.ts` — 응답 · select Smoke 갱신.
  - `store-application-approve.spec.ts` — 상품 3행 연장 가능 · 3회.
- scheduler `reservation.repository.spec.ts` — `transitionExtension` 확정(조건 · 엔티티 · QR) · 만료 · 환불(되돌림 · QR 없음) · 결제 먼저 바뀜 false · 확정 예약 0행 500, Smoke(결제 대기 만료 기본 · 연장 + 예약 조인 · 별칭 12, 이용 종료 NOT EXISTS, 연장 확정 · 되돌림 update 조건).
- crontab · 게이트웨이 · contracts 상수는 plan 대로 spec 없음.

## Verification
- `npm run typecheck` · `npm run lint` · `npm run build`(4개 앱) · `npm run db:check`(마이그레이션 = 엔티티) 통과, 바뀐 파일 Prettier 적용.
- 테스트(AGENTS 허용 범위의 확인 실행): 전체 110파일 1223건 통과. 첫 실행 실패는 Smoke SQL 고정값뿐(새 컬럼 · 결제 대기 만료 · 이용 종료 쿼리) — 실행 출력으로 채웠다.
- plan 대비 차이
  - 연박 연장 · 1박 연장 케이스 일부는 테스트 영업시간을 08:00 ~ 23:00 으로 둔다 — 기본 도우미 10:00 ~ 22:00 이면 09:00 끝 연장이 영업시간 밖이라 정상적으로 막힌다(판정이 맞다).
  - 연장 확정 · 잡아 두기 · `findReservationDetails` 의 find · update 조건 Smoke 를 plan 의 repository 단위 항목에 더해 고정했다(관계 컬럼 · `Not` · `IN`).
  - scheduler 의 연장 확정은 Redis QR 을 쓰지 않는다 — QR 동기화 crontab 이 1분 안에 새 유효 끝으로 맞춘다(plan 대로, 이전 끝이 지나 Redis 키가 만료됐다면 그 사이 최대 1분 문이 QR 을 거부할 수 있다).

## Remaining Issues
- 사용자(배포 — ship 때 로드맵 사용자 할 일에 정리)
  - 마이그레이션 `ReservationExtension` 적용 → user-service · admin-service · scheduler · gateway 새 이미지(기존 업체 상품 행은 연장 가능 · 3회로 채워진다).
  - 프론트: 이용 중 예약 화면의 연장 버튼(조회로 가능 여부 · 사유 · 새 끝 · 금액 → 신청 → 토스 결제창(orderId = payment_id, 5분) → 결제 확인), 업체 관리자 상품 설정의 연장 가능 여부 · 최대 연장 횟수.
- crontab 은 운영(`NODE_ENV=production`)에서만 돈다 — 로컬에서 연장 만료 · 확정을 보려면 scheduler 를 production 으로 띄운다.
