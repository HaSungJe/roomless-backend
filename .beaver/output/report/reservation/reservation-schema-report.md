# Report — reservation-schema

## Feature Summary
- **Feature**: reservation 기반(Phase 16) — 예약(`t_reservation`) · 예약 구간(`t_reservation_detail` — 기본 1 + 연장 n, 구간마다 결제 FK) · 결제(`t_payment`) 스키마와 룩업 3개(+시드), 마이그레이션 `ReservationSchema`, 결제 포트 `PAYMENT_GATEWAY` + 토스페이먼츠 어댑터(조회 검증 · 전액 취소 — 승인은 프론트), 호실 그룹 고정(Phase 13 호실 수정에서 그룹 변경 제거).
- **Entry point**: 새 API 없음 — 엔티티 · 시드 · 마이그레이션 · 포트. 변경 API `PATCH /api/v1/admin-service/room/:room_id`(큐 `admin.room.update` — 그룹을 받지 않는다)
- **Domain**: reservation · payment(엔티티) + `libs/integration` 결제 포트 + room(호실 수정) (로드맵 Phase 16 — #63 · #64 · #65 · #66)
- **Plan**: [reservation-schema-plan.md](../../plan/reservation/reservation-schema-plan.md) · **Spec**: [reservation-schema-spec.md](../../spec/reservation/reservation-schema-spec.md)

## Created/Modified/Deleted Files
| File | Change Type | Description |
|------|-----------|------|
| `libs/database/src/entities/reservation/reservation-state.entity.ts` · `reservation-detail-type.entity.ts` | created | 룩업 — 예약 상태 6 · 구간 종류 2 |
| `libs/database/src/entities/reservation/reservation.entity.ts` | created | 예약 — 배타 제약 `EXC_Reservation_RoomIdBlockedRange`(같은 호실 활성 예약의 `[start_at, blocked_until)`) · `CHK_Reservation_StartEndBlocked` · `CHK_Reservation_Cancel` · 인덱스 2 |
| `libs/database/src/entities/reservation/reservation-detail.entity.ts` | created | 구간 — 결제 FK · `UK_ReservationDetail_PaymentId` · `CHK_ReservationDetail_StartEnd` · `CHK_ReservationDetail_State` · 인덱스 |
| `libs/database/src/entities/payment/payment-state.entity.ts` · `payment.entity.ts` | created | 결제 상태 7 · 결제 — `UK_Payment_PaymentKey` · CHECK 4(환경 · 승인 · 환불 · 실패) · 인덱스, `environment` 기본값 없음 |
| `libs/database/src/entities.ts` · `seeder/seeder.targets.ts` | modified | ENTITIES 6개, 시드 3개 + SEED_TARGETS |
| `libs/database/src/migrations/1793603504255-ReservationSchema.ts` · `migrations.ts` | created · modified | `db:generate` 생성(up 28 · down 28) + 머리 주석, 등록(Prettier 로 한 줄에 하나씩) |
| `scripts/db-schema.mjs` | modified | 마이그레이션 등록을 한 줄에 하나씩 쓰게 — 목록이 200자를 넘어 Prettier 가 펼친 모양(끝 쉼표)을 다음 생성이 읽지 못해 빈 칸(`,,`)을 만들던 문제 |
| `libs/database/src/entities/room/room.entity.ts` | modified | 클래스 주석(문 · 그룹은 등록 때만) — DB 변경 없음 |
| `libs/integration/src/integration.symbols.ts` · `integration.constants.ts` · `interfaces/integration.interface.ts` · `integration.util.ts` | modified | `PAYMENT_GATEWAY`, 결제 상수 4개, 결제 포트 타입 5개, `classifyTossFailure` |
| `libs/integration/src/payment/toss-payment.gateway.ts` · `payment.module.ts` | created | `TossPaymentGateway`(fetch · Basic 인증 · 30초 제한 · 조회 null · 취소 멱등키) · `PaymentModule`(전역 — 앱 등록은 Phase 17) |
| `libs/contracts/src/room/dto/room-update.dto.ts` · `room.commands.ts` | modified | `RoomUpdateDto.room_group_id` 삭제, 명령 주석 |
| `apps/admin-service/src/room/room.service.ts` · `repositories/room.repository.ts` | modified | `updateMyRoom` 그룹 조회 · 대입 삭제, 주석 |
| `apps/gateway/src/api/v1/admin-service/room/controllers/room.controller.queue.ts` | modified | 호실 수정 주석 |
| `apps/admin-service/src/room/test/room-update.spec.ts` | modified | 그룹 이동 · 그룹 없음 404 케이스 삭제, 그룹 조회 없음 · 예전 클라이언트의 `room_group_id` 무시 케이스 |
| `.env.example` · `compose.admin-service.yml` · `compose.scheduler.yml` · `compose.gateway.yml` | modified | 토스 절 `TOSS_SECRET_KEY`, 쓰지 않는 앱에 빈 값 · 머리 주석 |
| `docs/guides/toss-setup.md` | created | 역할(프론트 승인 · 서버 검증 · 환불) · 테스트 키 · 라이브 전환 · 실패와 재시도 · 문제 해결 |
| `README.md` · `AGENTS.md` · `docs/data-layer.md` · `docs/integration.md` · `docs/architecture.md` | modified | 결제 포트 · 토스 키 · 예약 · 결제 엔티티 · 배타 제약 예 · 호실 그룹 고정 |
| `.beaver/output/spec/room/room-manage-spec.md` | modified | 호실 수정 — 그룹 고정(2026-11-02) |

## Tests Written
- `room-update.spec.ts`(8건) — `[SUCCESS]` 호실명 · 층만 수정(`findRoomGroup` 미호출 · `room_group_id` · `room_state_id` · `store_id` 미설정) · 예전 클라이언트의 `room_group_id` 무시 / `[FAIL:service]` 호실 없음 · 소속 업체 없음 404, 수정 없음 / `[FAIL:duplicate]` 호실명 UK 400 / `[FAIL:validation]` 층 201 · 호실 ID 형식 / `[SECURITY]` actor 없음 401
- `[CASES:classifyTossFailure]` — 커밋하지 않는 임시 스크립트로 표 대조(라이브러리라 spec 없음 — AGENTS). 엔티티 · 시드 · 마이그레이션 · 어댑터는 plan 대로 테스트 생략(위임형), Smoke 해당 없음(데이터 접근 메서드 없음 — repository 는 Phase 17).

## Verification
- `npm run typecheck` · `npm run lint`(경고 0) · `npm run build`(4개 앱) · `npm run db:check`(일치) 통과, 바뀐 ts · mjs Prettier 적용.
- 테스트(AGENTS 허용 범위의 확인 실행): room-update 8건, 전체 83파일 746건 통과.
- 마이그레이션 — 제약명이 모두 엔티티 이름 그대로(`UQ_<해시>` 없음 — `UK_Payment_PaymentKey` · `UK_ReservationDetail_PaymentId` · `EXC_Reservation_RoomIdBlockedRange` · CHECK 8 · FK 12 · 인덱스 4), 컬럼 COMMENT 55개 모두, down 은 FK → 테이블 역순.
- PGlite(btree_gist, 임시 스크립트 — 커밋 안 함) 32/32: 같은 호실 활성 예약 겹침 23P01(결제 대기 · 이용 중 포함) · 끝 = 시작 맞닿음 허용 · 다른 호실 허용 · 취소 · 만료 · 완료 건과 겹침 허용 · 겹치는 취소 건을 확정으로 되돌리면 23P01 · CHECK(입실 = 체크아웃 · 체크아웃 > 점유 끝 거부, 정비 0 허용, 취소 사유 없음 · 주체 ADMIN · 취소 아닌데 취소 시각 거부) · 결제(environment 없음 23502 · DEV 거부 · DONE 결제 키 없음 · REFUNDED 금액 불일치 · FAILED 사유 없음 거부, 결제 키 중복 23505 · NULL 여러 개 허용) · 구간(CHECKED_IN 거부 · 결제 중복 23505 · 시작 = 끝 거부) · down → 다시 up.
- `classifyTossFailure` 10/10(#1 ~ #8 · #10 · #11) — #9 네트워크 · 시간 초과는 어댑터 `request` 의 catch 가 503(코드 읽기 — 본문 읽기 실패도 같은 catch 안).
- compose 3개 — `docker compose --env-file <더미 값 env> -f <파일> config --quiet` 통과, 각 1개 `TOSS_SECRET_KEY: ""`(`.env` 값은 보지도 출력하지도 않음).
- plan 대비 차이: 어댑터 `request` 를 `RequestInit` 변수로 바꿔 본문이 있을 때만 `body` 를 붙이고(oxlint `no-invalid-fetch-options` 경고 — GET 에 body 자리), 응답 본문 읽기도 try 안에 넣었다(중간에 끊기면 500 대신 503). `scripts/db-schema.mjs` 등록 방식 수정은 plan 에 없던 것 — 이번 등록으로 목록이 200자를 넘어 생겼다.

## Remaining Issues
- 사용자 — 마이그레이션 `ReservationSchema` 적용(RoomState 뒤 — 새 테이블 6개만, 기존 데이터는 바꾸지 않는다), 토스 테스트 키는 `.env` 의 `TOSS_SECRET_KEY`(docs/guides/toss-setup.md). 앱 등록 · 첫 사용은 Phase 17 이라 지금은 키가 비어도 아무 영향이 없다.
- Phase 17 몫(spec 의 "Phase 17 · 19 로 넘기는 것"): 결제 확인 API(프론트 승인 결과 → 토스 조회 대조 → 기록), 결제 대기 유지 시간, 만료 전 `findByPaymentId` 재확인, 23P01 · 23514 · 23505 변환, 일시 예약불가 특수 표시, 이력에서 만료 건 숨기기, `PaymentModule` 앱 등록.
- 어댑터는 실제 토스 호출로 검증하지 않았다(테스트 키 · 실호출 금지) — 요청 모양은 코드 읽기, 실제 확인은 Phase 17 결제 확인 API 를 만들 때 테스트 키로.
