# Report — room-manage

## Feature Summary
- **Feature**: 객실 관리(업체 관리자) — 업체 상품 설정(시간 이용 · 1박 · 연박) · 객실 그룹 CRUD(상세정보 JSON + 기본값, 삭제는 호실 · 사진까지 삭제 표시 → S3 마지막) · 그룹 사진(업로드 주소 · 등록 · 순서 · 삭제, 5장) · 그룹 상품(종류별 사용 여부 · 요금) · 상품별 기간 가격(선검사 + DB 배타 제약 23P01 → 400) · 호실 CRUD · 호실 상태(정비 완료 · 사용중지 — 전환 표 4개) + 호실 상태 5개 개편(데이터 마이그레이션 `RoomState`)
- **Entry point**: `/api/v1/admin-service/room` 21개(매니저 가드) — 동기 6: `GET /plan` · `GET /group` · `GET /group/:room_group_id` · `POST /group/:room_group_id/image/upload-url` · `GET /group/:room_group_id/plan/:room_plan_type_id/price` · `GET /`, 큐 15: `PATCH /plan/:room_plan_type_id` · `POST /group` · `PATCH|DELETE /group/:room_group_id` · `POST /group/:room_group_id/image` · `PUT /group/:room_group_id/image/order` · `DELETE /group/:room_group_id/image/:room_group_image_id` · `PATCH /group/:room_group_id/plan/:room_plan_type_id` · `POST|PATCH|DELETE /group/:room_group_id/plan/:room_plan_type_id/price[/:room_group_plan_price_id]` · `POST /` · `PATCH|DELETE /:room_id` · `PATCH /:room_id/state`
- **Domain**: room (로드맵 Phase 13 — #53 ~ #57), admin-service
- **Plan**: [room-manage-plan.md](../../plan/room/room-manage-plan.md) · **Spec**: [room-manage-spec.md](../../spec/room/room-manage-spec.md)

## Created/Modified/Deleted Files
| File | Change Type | Description |
|------|-----------|------|
| `libs/contracts/src/room/room.commands.ts` | created | `ROOM_COMMAND` 15개(`admin.room.*`) · `ROOM_INTERNAL_PATH`(정적 `PLAN_LIST` · `GROUP_LIST` · `ROOM_LIST`, 파라미터 경로 함수 3개) |
| `libs/contracts/src/room/dto/*.dto.ts` (21개) | created | 기능당 DTO(경로 Param DTO 포함) · ResultDto · 목록 Query DTO 3개(`PaginationDto` 상속 · 선택 생성자) · 중첩 `room_group_detail` |
| `apps/gateway/src/api/v1/admin-service/room/room.module.ts` · `controllers/room.controller.ts` · `controllers/room.controller.queue.ts` | created | 공개 라우트 동기 6 · 큐 15(`PassportJwtManagerAuthGuard` · Swagger) |
| `apps/gateway/src/gateway.module.ts` | modified | `RoomModule` 등록 |
| `apps/admin-service/src/room/room.module.ts` · `room.symbols.ts` · `room.constants.ts` · `room.util.ts` | created | 도메인 모듈 · `ROOM_REPOSITORY` · 상태 · 상품 종류 · 전환 표 · 한도 · 메시지 상수 · util(`canChangeRoomState` · `isSameTimeOfDay` · 상세정보 기본값 · 응답 변환) |
| `apps/admin-service/src/room/interfaces/room.repository.interface.ts` · `repositories/room.repository.ts` | created | 포트 33개 + QueryBuilder 빌더 7개, UK 23505 · EXC 23P01 → 400, 소프트 삭제(`notDeleted` · `is_deleted = 0`) |
| `apps/admin-service/src/room/room.service.ts` | created | `RoomService` 21개 메서드(쓰기 15 `@Transactional()` + 업체 행 잠금) |
| `apps/admin-service/src/room/controllers/room.controller.ts` · `room.controller.queue.ts` | created | 내부 HTTP 6 · `@OnCommand` 15 |
| `apps/admin-service/src/admin-service.module.ts` | modified | `RoomModule` 등록 |
| `libs/database/src/typeorm-error.ts` | modified | `isExclusionViolation`(23P01) |
| `libs/database/src/seeder/seeder.targets.ts` | modified | `ROOM_STATE_SEED_DATA` 5행(예약가능 · 예약완료 · 사용중 · 정비중 · 사용중지) |
| `libs/database/src/migrations/1793400000000-RoomState.ts` · `migrations.ts` | created · modified | 호실 상태 데이터 마이그레이션(손으로 — 스키마 변경 없음): 새 상태 2개 · STANDBY 호실 → AVAILABLE 후 STANDBY 삭제 · 이름 정리, down 대칭 |
| `apps/admin-service/src/room/test/room.test-helper.ts` | created | repository · 저장소 mock, 큐 · 동기 부팅, 행 도우미 |
| `apps/admin-service/src/room/test/*.spec.ts` (22개) | created | service 기능 spec 21개 + `room.repository.spec.ts` |
| `apps/admin-service/src/store/test/store-mine-profile.spec.ts` | modified | Phase 12 단언 고침 — 엔티티 클래스 필드가 `undefined` 로 정의돼 `Object.keys` 대신 값이 있는 키만 비교 |
| `README.md` · `AGENTS.md` · `docs/data-layer.md` · `docs/architecture.md` · `docs/conventions.md` · `.beaver/output/spec/platform/cache-spec.md` | modified | 객실 기능 설명 · room 트리 · `isExclusionViolation` · Smoke 목록 · 딸린 행 삭제 표시 · 모듈 목록 · Query DTO · Pagination 적용 목록(ship 리뷰 Low #1) · 캐시 무효화 지점 2행 |
| `.beaver/output/plan/room/room-manage-plan.md` | modified | 테스트 절 채움 · 코드 블록을 실제 파일과 맞춤 · 파일 목록 보강 |

## Tests Written
service 기능 spec 21개(194건) + repository spec 1개(68건) = 262건.
- 큐 15개(`CommandDispatcher` — ack · `admin.room.*.done|failed` · 상태 코드 · 한국어 메시지 · `validation_errors`, actor 없음 401) · 동기 6개(supertest + 내부 헤더, 토큰 없음 403)
- `[CASES:canChangeRoomState]` 13개(`room-state.spec.ts`) — 허용 4 · 거부 7(같은 상태 · 시스템 전용 예약완료 · 사용중 · 없는 상태) · DTO 거부 2(목표 정비중 · 예약완료)
- `[SUCCESS]` 업체 행 잠금(쓰기 true · 조회 false) · 업체 범위 조건 · 엔티티 컬럼 값 · 그룹 등록의 그룹 상품 3행(사용 안 함 · 0원) · 그룹 삭제 순서(호실 → 사진 → 그룹 → S3) · 상세정보 기본값 · 사진 순서 · 기간 가격 겹침 선검사 / `[FAIL:*]` 404 · 400(종류에 필요한 값 · 입실 = 퇴실 · 판매 0원 · 없는 날짜 · 종료 < 시작 · 겹침 · 한도 · 미업로드 · 순서 집합) · 실패 뒤 미호출
- `room.repository.spec.ts` — 오류 변환 7(UK 그룹명 · 호실명 · 사진 키, EXC 등록 · 수정) · 그대로 500 인 다른 위반 5 · 소프트 삭제 · `deleteRoomGroupPlanPrice` boolean · `is_deleted: 0` 조건 · 통일 500 표 26 · 빌더 조회 500 7 · `[SMOKE:data-access]` 13(소속 업체 잠금 2 · 상품 설정 · 그룹 목록 2 · 그룹 상품 · 그룹 사진 · 기간 가격 목록 · 겹침 2 · 호실 목록 3 — 실제 빌드로 뽑은 SQL 고정)

## Verification
- `npm run typecheck` · `npm run lint` · `npm run build`(4개 앱) · `npm run db:check`(엔티티 = 마이그레이션 — 스키마 변경 없음) 통과, room 코드 Prettier 적용.
- 테스트(AGENTS 허용 범위의 확인 실행): room 22파일 262건 통과, 전체 80파일 718건 통과(Phase 12 의 `store-mine-profile` 실패 포함 해소). 처음 실행에서 DTO 문구 5개가 테스트 초안과 달라 테스트를 DTO(형제 문구 "~가 올바르지 않습니다.")에 맞췄고, Smoke 자리표시 12개는 실제 빌드 SQL 로 채웠다(내용 확인 — 지워지지 않은 행 · 조인 · 겹침 양 끝 포함 · 수정 시 자기 제외 · 0층 필터).
- PGlite(dist 빌드) `RoomState` 9/9 — 기존 DB(예전 시드 + STANDBY · IN_USE 호실, 실제 부모 행) up: 상태 5개 · 이름 정리 · STANDBY 호실은 지워지지 않고 예약가능 / down: 예전 4개 · 예약가능 · 예약완료 호실은 스탠바이 / 다시 up / 새 DB: 마이그레이션 직후 2개 → 시드 뒤 5개.
- 코드 대조: 전환 표 4개(`ROOM_STATE_TRANSITIONS`) · 그룹 삭제 순서 · 기간 가격 삭제 affected 판별 · 모든 쓰기의 업체 행 잠금이 spec 결정과 같다. 정적 내부 경로 키를 형제(`STORE_INTERNAL_PATH`)처럼 UPPER_SNAKE 로 맞췄다.

## Remaining Issues
- 사용자 — 마이그레이션 `RoomState` 적용(`RoomSchema` 뒤). 데이터만 바꾼다: 스탠바이 호실은 예약가능으로 옮겨지고, 이용중 → 사용중으로 이름이 바뀐다.
- 호실 상태의 시스템 전환(예약 → 예약완료 · 체크인 → 사용중 · 체크아웃 → 정비중)은 예약 · 이용 Phase 몫 — 지금은 업체 관리자 전환 4개만 있다.
