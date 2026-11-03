# Report — reservation-booking

## Feature Summary
- **Feature**: 예약·결제(Phase 17) — 호실별 예약 가능 시간 조회 · 예약 생성(결제 대기 5분) · 결제 확인(토스 조회 대조) · 이용자 취소(업체별 환불 마감 · 마감 뒤 환불 비율) · 내 예약 목록 · 상세 · 업체 예약 현황 · 업체 취소(100% 환불 + SMS) · 호실 이동(같은 그룹 + SMS), scheduler crontab 3개(결제 대기 만료 · 늦은 승인 재확인 · 환불), 업체 환불 규정(분 단위 · 비율) · 연박 최소 · 최대 박수 · 1박 항상 다음 날 퇴실, 점유 예약이 있는 호실 · 그룹 삭제 금지.
- **Entry point**: `/api/v1/user-service/reservation` — 동기 `GET /availability`(로그인 없음) · `GET /`(이용자) · `GET /:reservation_id`(이용자) · `GET /store`(매니저), 큐 `POST /`(user.reservation.create) · `POST /payment-confirm` · `PATCH /:reservation_id/cancel`(이용자) · `PATCH /:reservation_id/store-cancel` · `PATCH /:reservation_id/room`(매니저) + crontab `reservation.payment-expire`(1분) · `reservation.payment-recheck`(5분) · `reservation.refund`(1분)
- **Domain**: reservation (user-service 새 도메인 · scheduler 새 도메인) + store · room(admin-service 변경) (로드맵 Phase 17 — #67 ~ #73 · #113)
- **Plan**: [reservation-booking-plan.md](../../plan/reservation/reservation-booking-plan.md) · **Spec**: [reservation-booking-spec.md](../../spec/reservation/reservation-booking-spec.md)

## Created/Modified/Deleted Files
| File | Change Type | Description |
|------|-----------|------|
| `libs/database/src/entities/store/store.entity.ts` | modified | `refund_deadline_hours` → `refund_deadline_minutes`(기본 60), `late_refund_percent`(기본 50) |
| `libs/database/src/entities/room/room-plan.entity.ts` | modified | `min_nights` · `max_nights` + `CHK_RoomPlan_LongNights`, 퇴실 시각 주석(1박 항상 다음 날) |
| `libs/database/src/entities/reservation/reservation.entity.ts` | modified | `late_refund_percent`(예약 때 업체 값) |
| `libs/database/src/entities/payment/payment.entity.ts` · `payment-state.entity.ts` · `seeder/seeder.targets.ts` | modified | `CHK_Payment_Refunded` → `CHK_Payment_RefundedAmount`(0 < 환불 ≤ 결제), 부분 환불 주석 |
| `libs/database/src/migrations/1793700505373-ReservationBooking.ts` · `migrations.ts` | created · modified | `db:generate` 후 손으로 고침 — RENAME + × 60 · 연박 행 1 · 30 채운 뒤 CHECK · 예약 행 50 채운 뒤 기본값 제거 · 퇴실 시각 주석, down 은 시간으로 올림(최대 168) |
| `libs/contracts/src/reservation/reservation.constants.ts` · `reservation.commands.ts` · `dto/*`(9개) | created | 공통 상태 · 결제 대기 5분 · 재예약 제한 10분 · 환불 사유, 명령 5개 · 내부 경로, DTO 9개 |
| `libs/contracts/src/store/dto/store-mine-reservation-policy.dto.ts` · `store-detail.dto.ts` · `store-mine.dto.ts` | modified | 환불 마감(분 0 ~ 10,080) · 마감 뒤 환불 비율(0 ~ 100) |
| `libs/contracts/src/room/dto/room-plan-update.dto.ts` · `room-plan-list.dto.ts` | modified | 연박 박수(1 ~ 180), 퇴실 시각 설명(1박 항상 다음 날) |
| `libs/integration/src/integration.util.ts` · `integration.constants.ts` · `interfaces/integration.interface.ts` | modified | `verifyPaymentLookup` · `PaymentLookupVerdict` · `TOSS_PAYMENT_STATUS_DONE`, `PaymentCancelInput.amount` |
| `libs/integration/src/payment/toss-payment.gateway.ts` · `payment.module.ts` | modified | 취소 금액(`cancelAmount`), 사용처 주석 |
| `apps/user-service/src/reservation/` (symbols · constants · util · interfaces · repositories · service · controllers · module) | created | 재고 판정 · 요금 · 환불액 util, repository(공유 DB 읽기 · 23P01 → 400 두 곳 · QueryBuilder 7개), service public 9개, 내부 HTTP 4 · 큐 5 |
| `apps/user-service/src/user-service.module.ts` | modified | `PaymentModule` · `ReservationModule` |
| `apps/gateway/src/api/v1/user-service/reservation/` · `gateway.module.ts` | created · modified | 공개 라우트 9개(가드 없음 1 · 이용자 5 · 매니저 3) |
| `apps/scheduler/src/reservation/` (symbols · util · interfaces · repositories · crontabs 3 · module) · `scheduler.module.ts` | created · modified | 결제 대기 만료 · 늦은 승인 재확인 · 환불 crontab(운영 전용 · `JobLockService`), 상태 전환 1건 = 트랜잭션 1개(`withTransaction` · 상태 조건) |
| `apps/admin-service/src/store/store.constants.ts` · `store.service.ts` · `store.util.ts` | modified | 환불 규정 기본값 · 입점 승인 · 내 업체 규정 · 응답, 연박 박수 기본값(1 · 30) |
| `apps/admin-service/src/room/room.constants.ts` · `room.service.ts` · `room.util.ts` · `interfaces/room.repository.interface.ts` · `repositories/room.repository.ts` | modified | 연박 박수 검증 · 응답, 호실 · 그룹 삭제 전 점유 예약 확인(`countRoomActiveReservations` · `countGroupActiveReservations`), "Phase 17 에서" 주석 정리 |
| `apps/user-service/src/reservation/test/` (helper + spec 10) · `apps/scheduler/src/reservation/test/reservation.repository.spec.ts` | created | 아래 Tests Written |
| `apps/admin-service/src/store/test/*` · `apps/admin-service/src/room/test/*` (11개) | modified | 환불 규정 · 연박 박수 · 점유 예약 확인 · Smoke SQL(업체 select · 상품 설정 select) |
| `compose.scheduler.yml` · `.env.example` | modified | scheduler 에 `TOSS_SECRET_KEY` 전달(빈 값 덮기 삭제), 토스 절 주석 |
| `README.md` · `AGENTS.md` · `docs/architecture.md` · `docs/data-layer.md` · `docs/integration.md` · `docs/messaging.md` · `docs/guides/toss-setup.md` | modified | 예약 도메인 · scheduler crontab · 결제 흐름(검증 · 백그라운드 환불 · 부분 환불) · 업체 환불 규정 · 연박 박수 · 시험 순서 |
| `.beaver/output/spec/room/room-manage-spec.md` · `.beaver/output/revision/store/store-operation-revision-261029-1.md` | modified | 2026-11-03 변경 줄 · 메모 |

삭제한 코드: `STORE_REFUND_DEADLINE_HOURS_DEFAULT` · `refund_deadline_hours` 필드 전부(엔티티 · DTO 3 · util 2 · service 2 · spec 픽스처), room.service 의 "미래 예약 확인은 Phase 17" 주석 2곳, payment 엔티티 · 시드의 "환불은 100% 만" 주석, compose.scheduler 의 `TOSS_SECRET_KEY: ''`.

## Tests Written
- `reservation-availability.spec.ts` — `[CASES:availability]` 14개(12 + 짝 2): 30분 단위 · 브레이크 맞닿음 · 자정 넘는 영업(전날 창) · 점유 + 정비 · 오늘 즉시 입실(정비중 호실) · 예약 가능 기간 · 입실일 요일(대실 없음 / 화요일 입실 숙박 가능) · 24시간 + 브레이크 · 숙박 체크아웃 영업시간 밖 / 안 · 연박 입실일만 · 연박 박마다 기간 요금(210,000) · 일시 예약불가. 그 밖 응답 모양 · 조회 조건(In) · 요금 0 그룹 제외 · 영업중 아님 · 업체 상품 미판매 · 업체 없음 404 · 박수 범위 · 없는 날짜 · DTO 2 · 내부 토큰 403.
- `reservation-create.spec.ts` — 쓰기 순서(결제 → 예약 → 구간) · 엔티티 값(정비 · 점유 끝 · 환불 마감 · 비율 · 결제 대기 만료) · 결과, 연박 3박 금액 · 끝, 1박 10:00 → 다음 날 12:00, 호실 · 업체 404 · 미판매 · 10분 재예약 제한 · 재고 판정 · 없는 날짜, 23P01 400, 토스 키 없음 requeue, DTO 2, actor 없음 401.
- `reservation-payment-confirm.spec.ts` — 확정 3단 상태 조건 · 같은 결제 재요청, 미결제 · 다른 주문 · 다른 키 · 남의 결제 · 상태 경합(쓰기 없음), 금액 불일치 · 늦은 결제 → 환불 신청 커밋 + 반환된 실패(ack), DTO, 401.
- `reservation-cancel.spec.ts` — `[CASES:refund]` 8개 + 확정 취소(주체 USER · 사유) · 결제 대기 취소(결제 EXPIRED) · 취소 불가 상태 3 · 만료 404 · 상태 경합, DTO 2, 401.
- `reservation-list` · `reservation-detail` · `reservation-store` · `reservation-store-cancel`(100% 환불 · SMS 마지막 · 결제 대기 · 번호 없음 SMS 생략 · 다른 업체 404 · SMS 503 requeue) · `reservation-room-change`(room_id 만 · SMS · 다른 그룹 · 사용중지 · 미확정 · 겹침 · 401).
- `reservation.repository.spec.ts`(user-service) — notDeleted 조건 · 23P01 → 400 두 곳 · 통일 500 · 상태 조건 boolean · `[SMOKE:data-access]` 7개(SQL 고정).
- `reservation.repository.spec.ts`(scheduler) — 결제 대기 전환 트랜잭션 · 결제가 먼저 바뀌면 false · 예약 어긋남 롤백 500 · 상태 조건, Smoke 1개.
- admin-service — 예약 · 환불 규정(분 · 비율 · 경계), 입점 승인 기본값, 상품 설정(1박 박수 NULL · 연박 박수 · 박수 없음 · 최소 > 최대 · DTO 2), 상품 목록, 호실 · 그룹 삭제 점유 예약 400, room repository(점유 예약 조건 · 그룹 점유 Smoke · 상품 설정 Smoke 갱신).
- crontab · 게이트웨이 · 어댑터 · 엔티티는 plan 대로 spec 없음.

## Verification
- `npm run typecheck` · `npm run lint`(경고 0) · `npm run build`(4개 앱) · `npm run db:check`(손으로 고친 마이그레이션과 엔티티 일치) 통과, 바뀐 ts · mjs Prettier 적용.
- 테스트(AGENTS 허용 범위의 확인 실행): 전체 94파일 865건 통과. 첫 실행에서 실패한 것은 Smoke SQL 스냅숏뿐(새 자리표시자 7개 · 업체 select 의 바뀐 컬럼 · 상품 설정 select) — 실행 출력으로 채우고 다시 통과.
- PGlite(btree_gist, 임시 스크립트 — 커밋 안 함) 14/14: ReservationSchema 까지 적용 + 기존 데이터 → ReservationBooking 적용 → 업체 2시간 → 120분 · 비율 50, 연박 행 1 · 30 · 대실 NULL, 기존 예약 비율 50 · 기본값 없음, `CHK_RoomPlan_LongNights` 3가지 거부, 부분 환불 15,000 · 전액 허용 · 0 · 초과 거부, down(120분 → 2시간) → 다시 up.
- `verifyPaymentLookup` 6/6(빌드된 dist 로 표 대조 — 임시 스크립트).
- `docker compose --env-file <더미 값 env> -f compose.scheduler.yml config --quiet` 통과(`.env` 값은 보지도 출력하지도 않음).
- plan 대비 차이: user-service repository 의 `notDeleted({store_id})` 두 곳에 제네릭(`notDeleted<StoreHourEntity>`)을 붙였다(리터럴 추론 타입 오류). plan 의 새 파일 코드 블록은 실제 파일(포맷 · 채운 Smoke SQL)로 맞췄다.

## Remaining Issues
- 사용자 — 마이그레이션 `ReservationBooking` 적용(`ReservationSchema` 뒤 — 업체 환불 기준이 분으로 바뀌고(× 60) 마감 뒤 비율 50 · 연박 행 박수 1 · 30 · 예약 비율 50 이 채워진다), scheduler 를 새 이미지로 다시 띄우기(토스 키를 쓴다 — `.env` 의 `TOSS_SECRET_KEY` 가 그대로 전달된다), 프론트의 `refund_deadline_hours` → `refund_deadline_minutes` · `late_refund_percent` 반영.
- crontab 은 운영(`NODE_ENV=production`)에서만 돈다 — 로컬에서 결제 대기 만료 · 환불까지 시험하려면 scheduler 를 production 으로 띄운다(docs/guides/toss-setup.md 6절).
- 토스 실제 호출(조회 · 부분 취소)은 테스트 키로 사용자가 확인한다 — 어댑터 요청 모양은 코드 읽기로만 맞췄다.
- 로드맵 열린 결정(객실 데이터 읽는 방법 · 결제 대기 유지 시간 · 설정 충돌)은 ship 때 닫는다.

## Modification - 261103-1 (ship 리뷰 반영 — `main-review-261103.md`)
- find 조건 Smoke 추가: user-service `reservation.repository.spec.ts` 에 7건(점유 예약 `In` · `LessThan` · `MoreThan` · 일시 예약불가 · 그룹 상품 · 기간 가격 · 영업시간 · 브레이크타임 · 내 예약 수 `Not`), admin `room.repository.spec.ts` 에 `countRoomActiveReservations` 1건 — `vi.spyOn(dataSource.manager, 'find' | 'count')` 로 넘긴 옵션을 가로채 `setFindOptions` 로 빌드해 SQL 고정(`buildFindQuery` 도우미).
- `reservation.util.ts` `mergeWindows` 정렬을 dayjs `diff` 로(`valueOf()` 빼기 제거) — plan 블록도 같이.
- docs/testing.md Smoke 적용 목록에 room · 예약 · scheduler 예약 추가 + find 조건 고정 방법, AGENTS.md 목록 갱신.
- 확인: typecheck · lint · build · db:check 통과, 전체 94파일 873건 통과.
