---
# One-line feature summary
feature_goal: "객실 관리(Phase 13) — 업체 관리자가 업체 상품 설정 · 객실 그룹(상세정보 · 사진) · 그룹 상품 · 상품별 기간 가격 · 호실 · 호실 상태를 관리한다(API 21개), 호실 상태 5개로 개편"

# Domain/module name
domain: "room"

# Entry-point method/endpoint
api_method: "게이트웨이 공개 API 21개(동기 6 · 큐 15, 매니저 가드) → admin-service room 도메인"

# Path/signature
api_path: "/api/v1/admin-service/room/… → /internal/v1/admin-service/room/… · RabbitMQ admin.room.*"

# Affected state
affected_data: ["t_room_plan (수정)", "t_room_group (등록 · 수정 · 소프트 삭제)", "t_room_group_image (등록 · 순서 · 소프트 삭제 + S3 삭제)", "t_room_group_plan (그룹 등록 때 3행 · 수정)", "t_room_group_plan_price (등록 · 수정 · 소프트 삭제)", "t_room (등록 · 수정 · 소프트 삭제 · 상태)", "t_room_state (시드 개편 — 데이터 마이그레이션)", "t_store (조회 · 업체 행 잠금)"]
---

## Feature Description

로드맵 Phase 13(#53 · #54 · #55 · #56 · #57 · #103) — Phase 12 의 room 테이블을 업체 관리자가 다루는 API 를 만든다. 새 도메인 `room`(admin-service `apps/admin-service/src/room/` · 게이트웨이 `apps/gateway/src/api/v1/admin-service/room/` · contracts `libs/contracts/src/room/`). 한 plan · 한 build 로 한다(사용자 결정 2026-10-31).

- **업체 상품 설정 (#103)** — 업체 × 상품 종류 3행(`t_room_plan`) 조회 · 종류별 수정.
- **객실 그룹 (#53)** — 목록 · 상세 · 등록(그룹 상품 3행을 함께) · 수정 · 삭제(호실 · 사진 함께 소프트 삭제). 상세정보 JSON 은 알려진 항목만 받고 빠진 항목은 기본값으로 채워 저장.
- **그룹 사진 (#53)** — 업로드 주소 · 등록 · 순서 · 삭제(업체 사진과 같은 흐름, 그룹마다 5장).
- **그룹 상품 (#56)** — 그룹 × 종류의 사용 여부 · 요금을 종류별 수정(조회는 그룹 상세에 포함).
- **상품별 기간 가격 (#57)** — 그룹 상품마다 목록 · 등록 · 수정 · 삭제. 겹침은 service 선검사 + DB 배타 제약.
- **호실 (#54)** — 목록(층 · 그룹 필터) · 등록 · 수정(그룹 이동 포함) · 삭제.
- **호실 상태 (#55)** — 상태 5개로 개편, 업체 관리자는 정비 완료 · 사용중지 · 사용 재개만 바꾼다.

## Entry Point

모든 공개 API 는 매니저 가드(`PassportJwtManagerAuthGuard` — 업체 총관리자 · 업체 관리자 모두)이고 내 업체(매니저의 `store_id`)만 다룬다. 쓰기는 큐(SSE), 조회 · 업로드 주소는 동기(내부 HTTP). 게이트웨이 `@Controller('/api/v1/admin-service/room')`, 서비스 `@Controller('/internal/v1/admin-service/room')`.

| # | Method | 공개 경로 (`/api/v1/admin-service/room` 뒤) | 전달 | service 메서드 | 입력 DTO | 결과 |
|---|---|---|---|---|---|---|
| 1 | GET | `/plan` | 동기 | `getMyRoomPlans(user_id)` | — | `RoomPlanListResultDto {list: RoomPlanItemResultDto[]}` |
| 2 | PATCH | `/plan/:room_plan_type_id` | 큐 `admin.room.plan-update` | `updateMyRoomPlan(user_id, room_plan_type_id, dto)` | `RoomPlanUpdateParamDto` + `RoomPlanUpdateDto` | null |
| 3 | GET | `/group` | 동기 | `getMyRoomGroups(user_id, dto)` | `RoomGroupListDto`(Query — PaginationDto + keyword?) | `RoomGroupListResultDto {list, pagination}` |
| 4 | GET | `/group/:room_group_id` | 동기 | `getMyRoomGroup(user_id, room_group_id)` | `RoomGroupDetailParamDto` | `RoomGroupDetailResultDto`(그룹 · 사진 · 그룹 상품 3) |
| 5 | POST | `/group` | 큐 `admin.room.group-create` | `createMyRoomGroup(user_id, dto)` | `RoomGroupDto` | `RoomGroupResultDto {room_group_id}` |
| 6 | PATCH | `/group/:room_group_id` | 큐 `admin.room.group-update` | `updateMyRoomGroup(user_id, room_group_id, dto)` | `RoomGroupUpdateParamDto` + `RoomGroupUpdateDto` | null |
| 7 | DELETE | `/group/:room_group_id` | 큐 `admin.room.group-delete` | `deleteMyRoomGroup(user_id, room_group_id)` | `RoomGroupDeleteParamDto` | null |
| 8 | POST | `/group/:room_group_id/image/upload-url` | 동기 | `createMyRoomGroupImageUploadUrl(user_id, room_group_id, dto)` | `RoomGroupImageUploadUrlParamDto` + `RoomGroupImageUploadUrlDto {content_type}` | `RoomGroupImageUploadUrlResultDto {file_key, upload_url, expires_at}` |
| 9 | POST | `/group/:room_group_id/image` | 큐 `admin.room.group-image` | `addMyRoomGroupImage(user_id, room_group_id, dto)` | `RoomGroupImageParamDto` + `RoomGroupImageDto {file_key, file_name, content_type}` | `RoomGroupImageResultDto {room_group_image_id}` |
| 10 | PUT | `/group/:room_group_id/image/order` | 큐 `admin.room.group-image-order` | `reorderMyRoomGroupImages(user_id, room_group_id, dto)` | `RoomGroupImageOrderParamDto` + `RoomGroupImageOrderDto {room_group_image_ids}` | null |
| 11 | DELETE | `/group/:room_group_id/image/:room_group_image_id` | 큐 `admin.room.group-image-delete` | `deleteMyRoomGroupImage(user_id, room_group_id, room_group_image_id)` | `RoomGroupImageDeleteParamDto` | null |
| 12 | PATCH | `/group/:room_group_id/plan/:room_plan_type_id` | 큐 `admin.room.group-plan-update` | `updateMyRoomGroupPlan(user_id, room_group_id, room_plan_type_id, dto)` | `RoomGroupPlanUpdateParamDto` + `RoomGroupPlanUpdateDto {is_used, price}` | null |
| 13 | GET | `/group/:room_group_id/plan/:room_plan_type_id/price` | 동기 | `getMyRoomGroupPlanPrices(user_id, room_group_id, room_plan_type_id, dto)` | `RoomGroupPlanPriceListParamDto` + `RoomGroupPlanPriceListDto`(Query — PaginationDto) | `RoomGroupPlanPriceListResultDto {list, pagination}` |
| 14 | POST | `/group/:room_group_id/plan/:room_plan_type_id/price` | 큐 `admin.room.group-plan-price` | `addMyRoomGroupPlanPrice(user_id, room_group_id, room_plan_type_id, dto)` | `RoomGroupPlanPriceParamDto` + `RoomGroupPlanPriceDto {start_date, end_date, price, memo?}` | `RoomGroupPlanPriceResultDto {room_group_plan_price_id}` |
| 15 | PATCH | `/group/:room_group_id/plan/:room_plan_type_id/price/:room_group_plan_price_id` | 큐 `admin.room.group-plan-price-update` | `updateMyRoomGroupPlanPrice(user_id, room_group_id, room_plan_type_id, room_group_plan_price_id, dto)` | `RoomGroupPlanPriceUpdateParamDto` + `RoomGroupPlanPriceUpdateDto`(같은 필드) | null |
| 16 | DELETE | `/group/:room_group_id/plan/:room_plan_type_id/price/:room_group_plan_price_id` | 큐 `admin.room.group-plan-price-delete` | `deleteMyRoomGroupPlanPrice(user_id, room_group_id, room_plan_type_id, room_group_plan_price_id)` | `RoomGroupPlanPriceDeleteParamDto` | null |
| 17 | GET | `/` | 동기 | `getMyRooms(user_id, dto)` | `RoomListDto`(Query — PaginationDto + floor? · room_group_id?) | `RoomListResultDto {list, pagination}` |
| 18 | POST | `/` | 큐 `admin.room.create` | `createMyRoom(user_id, dto)` | `RoomDto {room_group_id, room_name, floor}` | `RoomResultDto {room_id}` |
| 19 | PATCH | `/:room_id` | 큐 `admin.room.update` | `updateMyRoom(user_id, room_id, dto)` | `RoomUpdateParamDto` + `RoomUpdateDto {room_group_id, room_name, floor}` | null |
| 20 | DELETE | `/:room_id` | 큐 `admin.room.delete` | `deleteMyRoom(user_id, room_id)` | `RoomDeleteParamDto` | null |
| 21 | PATCH | `/:room_id/state` | 큐 `admin.room.state` | `changeMyRoomState(user_id, room_id, dto)` | `RoomStateParamDto` + `RoomStateDto {room_state_id}` | null |

- Param DTO 는 기능마다 따로 선언한다(모양이 같아도 — 형제 `StoreMineUnavailablePeriodDeleteParamDto` 등).
- 큐 payload 는 형제처럼 `{...param, ...dto}`(path param + 본문), 서비스 큐 컨트롤러 시그니처 `MessageEnvelope<XParamDto & XDto>` → `requireActor(command).user_id`(store.controller.queue.ts:67-69).
- 게이트웨이 라우트 순서: 정적 경로(`/plan` · `/group…`)를 매개변수 경로(`/:room_id`)보다 먼저 선언한다.
- 내부 경로 상수는 contracts `ROOM_INTERNAL_PATH`(경로 함수 — 값은 `encodeURIComponent`), 명령 상수 `ROOM_COMMAND`(`libs/contracts/src/room/room.commands.ts`). 큐는 admin-service 의 `q.admin.cmd`(`admin.#`) 그대로.

### 응답 모양

- `RoomPlanItemResultDto` — `room_plan_type_id` · `room_plan_type_name` · `is_used` · `days_of_week` · `usage_hours`(null) · `check_in_time` · `check_out_time`(`'HH:mm'` 또는 null). 순서 HOURLY · NIGHT · LONG.
- `RoomGroupListItemResultDto` — `room_group_id` · `room_group_name` · `room_count`(지워지지 않은 호실 수) · `image_url`(대표 사진 CDN 주소 또는 null) · `created_at`. 순서 등록일 최신순.
- `RoomGroupDetailResultDto` — `room_group_id` · `room_group_name` · `description` · `room_group_detail`(항목 모두) · `images[]`(`room_group_image_id` · `file_name` · `content_type` · `sort_order` · `image_url`) · `plans[]`(`room_plan_type_id` · `room_plan_type_name` · `is_used` · `price` — HOURLY · NIGHT · LONG 순) · `created_at` · `updated_at`.
- `RoomGroupPlanPriceItemResultDto` — `room_group_plan_price_id` · `start_date` · `end_date`(`'YYYY-MM-DD'`) · `price` · `memo`. 순서 시작 날짜 순.
- `RoomListItemResultDto` — `room_id` · `room_group_id` · `room_group_name` · `room_name` · `floor` · `room_state_id` · `room_state_name` · `created_at`. 순서 층 · 호실명.

## Business Rules

- **내 업체** — 모든 API 는 매니저의 소속 업체(탈퇴 업체 · 지운 업체 제외)를 먼저 찾고 없으면 404 `소속 업체를 찾을 수 없습니다.`(형제 store `findStoreByManager`). room repository 가 room 어휘로 같은 조회를 갖는다(`findManagerStore(user_id, lock)` — t_store · t_user 조인, 잠금이면 `FOR UPDATE OF s`). **쓰기(큐 15개)는 업체 행을 잠근 채** 한다(같은 업체 설정의 교체 · 겹침 검사 · 한도 — AGENTS). 조회는 잠그지 않는다.
- **남의 업체 것은 없는 것과 같다** — 그룹 · 호실 · 사진 · 기간 가격은 업체 조건(그룹은 `store_id`, 사진 · 그룹 상품은 그 그룹, 기간 가격은 그 그룹 상품)으로 찾고 없으면 404(`객실 그룹을 찾을 수 없습니다.` · `호실을 찾을 수 없습니다.` · `사진을 찾을 수 없습니다.` · `기간 가격을 찾을 수 없습니다.`).
- **소프트 삭제**(규약) — 그룹 · 사진 · 호실 · 기간 가격 삭제는 `is_deleted = 1`, 조회는 repository 가 `notDeleted`. 사진은 S3 객체를 실제로 지운다(마지막 단계 — 형제 `removeMyStoreFile`).
- **업체 상품 설정 수정 (#2)** — 종류별 PATCH. `is_used`(0/1) · `days_of_week`(1 ~ 127 — 0 은 거부, 팔지 않으려면 `is_used` 0) 는 모든 종류. 시간 이용(`HOURLY`)은 `usage_hours`(1 ~ 24) 필수 · 시각은 받지 않는다(보내도 NULL 유지). 1박 · 연박은 `check_in_time` · `check_out_time`(`HH:mm`) 필수 · 둘이 같으면 400 · `usage_hours` 는 받지 않는다. 종류에 필요한 값이 없으면 400(`validation_errors` 에 그 필드) — 종류가 경로라 DTO 는 선택 필드로 두고 service 가 종류로 가른다(CHECK `CHK_RoomPlan_UsageHoursCheckInOutTime` 과 같은 조합). 행은 늘 있다(없으면 404 `상품 설정을 찾을 수 없습니다.`).
- **그룹 등록 (#5)** — 그룹명(1 ~ 100자) · 설명(선택, 2,000자, 비우면 null) · 상세정보(선택 — 중첩 DTO: `room_count` 1 ~ 20 · `has_shower` · `has_tv` · `has_pc` 0/1). **상세정보는 알려진 항목만 남기고 빠진 항목은 지금 기본값으로 채워 전부 저장**(사용자 결정 2026-10-31 — `{...ROOM_GROUP_DETAIL_DEFAULTS, ...보낸 알려진 항목}`, 선언 안 된 키는 버린다 — ValidationPipe whitelist 꺼짐). 같은 업체의 지워지지 않은 그룹명이 있으면 400 `이미 있는 그룹명입니다.`(부분 유니크 `UK_RoomGroup_StoreIdRoomGroupName` 위반 변환 — 선검사 없이 DB 가 막는다). **그룹 상품 3행을 같은 트랜잭션에서 만든다**(사용 안 함 · 요금 0).
- **그룹 수정 (#6)** — 그룹명 필수 · 설명(선택 → null) · 상세정보(선택 — 보내면 위와 같이 채워 통째로 저장, 안 보내면 그대로). 그룹명 중복 400.
- **그룹 삭제 (#7)** — 그룹 · 그 그룹의 호실 · 사진을 소프트 삭제하고(사용자 결정 2026-10-31), 사진 S3 객체를 마지막에 지운다. 그룹 상품 · 기간 가격 행은 두지만 그룹이 지워져 닿을 수 없다. 미래 예약 확인은 Phase 17.
- **그룹 사진 (#8 ~ #11)** — 업체 사진과 같은 흐름(형제 store `createMyStoreFileUploadUrl` · `addMyStoreFile` · `reorderMyStoreFiles` · `removeMyStoreFile`).
  - 업로드 주소: 그룹마다 5장 한도(`ROOM_GROUP_IMAGE_LIMIT`), 키는 서버가 `store/<store_id>/room-group/<room_group_id>/<uuid 32자>.<jpg|png>`(공개 — CDN), MIME `image/jpeg` · `image/png`.
  - 등록: 키 모양(그 업체 · 그룹 · 형식) · 한도 · 실제 업로드(`exists`) 확인 → 마지막 순서(지금 가장 큰 순서 + 1). 같은 키 400 `이미 등록된 사진입니다.`
  - 순서: 지금 사진 ID 전부를 한 번씩(빠짐 · 남음 · 겹침 400 `validation_errors.room_group_image_ids`) → 0 부터.
  - 삭제: 그 그룹의 사진 → 행 소프트 삭제 → S3 삭제(마지막). 남은 순서 번호는 그대로.
  - 열람 주소는 `storageGateway.getPublicUrl(file_key)`(공개).
- **그룹 상품 수정 (#12)** — 종류별 PATCH. `is_used`(0/1) · `price`(0 ~ 10,000,000원). **판매(`is_used` 1)인데 요금 0 이면 400** `판매하려면 요금을 1원 이상 입력해주세요.`(`validation_errors.price`). 판매 = 업체 상품 설정 `is_used` AND 그룹 상품 `is_used`(예약 — Phase 17).
- **기간 가격 (#13 ~ #16)** — 그룹 상품(그룹 × 경로의 종류)마다.
  - 입력: `start_date` · `end_date`(`YYYY-MM-DD` — 사용자 결정 2026-10-31, dayjs strict 로 없는 날짜 거부, 종료 ≥ 시작 아니면 400 `validation_errors.end_date`) · `price`(1 ~ 10,000,000원) · `memo`(선택, 30자, 비우면 null).
  - 겹침: 같은 그룹 상품의 지워지지 않은 다른 기간과 날짜(둘 다 포함)가 겹치면 400 `같은 상품의 다른 기간 가격과 날짜가 겹칩니다.` — **service 가 업체 행 잠금 아래에서 먼저 센다**(`start_date <= 새 종료 AND end_date >= 새 시작`, 수정은 자기 자신 제외 — `Not(id)`), **DB 배타 제약 `EXC_RoomGroupPlanPrice_RoomGroupPlanIdDateRange` 위반(23P01)도 repository 가 같은 400 으로 바꾼다**(새 `isExclusionViolation(error, 'EXC_…')` — libs/database/src/typeorm-error.ts).
  - 수정: 등록과 같은 필드를 통째로(사용자 결정 — 수정 포함). 삭제: 소프트 삭제(없거나 남의 것 404).
  - 목록: 페이지(PaginationDto), 시작 날짜 순.
- **호실 (#17 ~ #20)**
  - 목록: 페이지, 필터 `floor`(정수 문자열) · `room_group_id`, 층 · 호실명 순, 그룹명 · 상태명 포함(그룹은 지워지지 않은 것만 — 지운 그룹의 호실은 함께 지워져 있다).
  - 등록: `room_group_id`(그 업체의 지워지지 않은 그룹 — 없으면 404) · `room_name`(1 ~ 50자) · `floor`(-10 ~ 200 정수). 상태는 예약가능(`AVAILABLE`). 업체 안 지워지지 않은 호실명 중복 400 `이미 있는 호실명입니다.`(부분 유니크 `UK_Room_StoreIdRoomName` 변환). `store_id` 는 그룹의 업체(= 내 업체).
  - 수정: 같은 필드 통째로(그룹 이동 포함 — 같은 업체 그룹만). 미래 예약이 있는 호실의 그룹 이동 제한은 Phase 17.
  - 삭제: 소프트 삭제. 미래 예약 확인은 Phase 17.
- **호실 상태 (#21) — 5개로 개편**(사용자 결정 2026-10-31)
  - 예약가능 `AVAILABLE` · 예약완료 `RESERVED` · 사용중 `IN_USE` · 정비중 `MAINTENANCE` · 사용중지 `DISABLED`(Phase 12 시드 STANDBY 는 AVAILABLE 로, 이름 이용중 → 사용중).
  - 흐름: 예약 → 예약완료(Phase 17), 체크인 → 사용중 · 체크아웃 → 정비중(Phase 19), **업체 관리자가 청소 뒤 "정비 완료" → 예약가능**(이번 API). 사용중지는 관리자가 켜고 끈다.
  - **업체 관리자가 바꿀 수 있는 전환 표**(계산 규칙 — `canChangeRoomState(from, to)`, TDD): 정비중 → 예약가능 · 예약가능 → 사용중지 · 정비중 → 사용중지 · 사용중지 → 예약가능. 그 밖(예약완료 · 사용중에서, 예약완료 · 사용중 · 정비중으로, 같은 상태로)은 400 `지금 상태에서는 바꿀 수 없습니다.` 입력 DTO 는 `AVAILABLE` · `DISABLED` 만 허용(`@IsIn`).
  - 예약완료가 시간 단위 예약에서 무엇을 뜻하는지(지금 시각에 걸린 예약이 확정되고 체크인 전 등)와 그 전환은 Phase 17 · 19 기획 때 정한다.
- **검증 위치** — 공개 입력은 게이트웨이 ValidationPipe(DTO), 서비스 큐 컨트롤러는 다시 검증하지 않는다. 종류 · 상태 조합처럼 DTO 가 알 수 없는 규칙은 service 400(`validation_errors` — 입력 필드).

## Notes

- 형제 근거
  - 내 업체 · 잠금: store.repository.ts `buildStoreByManagerQuery`(t_user 조인 · LEAVE 제외 · `is_deleted = 0` · `FOR UPDATE OF s`)
  - 파일 흐름: store.service.ts `createMyStoreFileUploadUrl` · `addMyStoreFile` · `reorderMyStoreFiles` · `removeMyStoreFile`, store.util.ts `issueFileKey` · `isIssuedFileKey` · `nextSortOrder` · `isSameIdSet`
  - 겹침 · 날짜: store.service.ts `addMyStoreUnavailablePeriod`(dayjs strict · 업체 행 잠금 · 겹침 개수), store.util.ts `buildUnavailablePeriodOverlapWhere`
  - 목록 · 페이지: store.service.ts `getMyStoreUnavailablePeriods` · `StoreMineUnavailablePeriodListDto`(Query DTO 생성자 — AGENTS)
  - 중첩 DTO + 알려진 항목만: 예전 `StoreMineProfileDetailDto` · `STORE_DETAIL_KEYS` · `buildStoreDetail`(Phase 12 에서 지움 — 같은 방식)
  - 큐 경로 param + 본문: store.controller.queue.ts(게이트웨이 · 서비스) `addMyApplicationFile`
- room 도메인은 store 도메인 코드를 import 하지 않는다(도메인 간 직접 호출 금지) — 파일 키 · 순서 · 집합 비교 util 은 room.util.ts 에 room 어휘로 둔다(같은 모양).
- 호실 상태 시드 개편은 데이터 마이그레이션(`RoomState` — 손으로 쓴다): AVAILABLE · RESERVED 행 추가 → 호실의 STANDBY → AVAILABLE → STANDBY 행 삭제(FK CASCADE 라 호실을 먼저 옮긴다) → 이름 IN_USE 사용중 · MAINTENANCE 정비중 · DISABLED 사용중지. 엔티티 · 스키마 변경 없음(`db:check` 그대로). 시드(`ROOM_STATE_SEED_DATA`)도 5행으로.
- 이번에 만들지 않는 것: 예약 · 가용성(Phase 17), 정비 완료 자동 전환 없음(사용자 결정 — 관리자가 정비 완료), 업체 상품 설정을 바꿀 때 기존 예약 처리(Phase 17 Open Decision), 사물(Phase 15).
- 캐시 — 아직 없음. cache-spec 무효화 지점 표에 객실 · 상품 쓰기를 더한다(discovery 캐시 대상 후보 — Phase 23).

## Proposals (Codebase-Based)

- [x] 내 업체 조회 · 잠금을 store 와 같은 QueryBuilder 로 room repository 에 둔다(room 어휘 `findManagerStore`)
- [x] 그룹 사진을 업체 사진과 같은 4단계 흐름 · 키 규칙으로
- [x] 기간 가격 겹침을 일시 예약불가와 같은 업체 행 잠금 + 개수 방식으로, 그리고 DB 배타 제약 위반을 같은 400 으로
- [x] `isExclusionViolation` 을 `isUniqueViolation` 옆에(libs/database/src/typeorm-error.ts — 23P01)

## Decisions

- [x] 범위 — **Phase 13 전체를 한 plan · 한 build**(API 21개) (사용자 결정 2026-10-31)
- [x] 그룹 삭제 — **그룹 · 호실 · 사진을 함께 소프트 삭제**(사진 S3 삭제) (사용자 결정 2026-10-31)
- [x] 호실 상태 — **예약가능 · 예약완료 · 사용중 · 정비중 · 사용중지 5개**, 체크아웃 → 정비중, 관리자 정비 완료 → 예약가능, 사용중지는 관리자가 켜고 끔 (사용자 결정 2026-10-31)
- [x] 관리자 상태 전환 표 + TDD — 정비중 → 예약가능 · 예약가능/정비중 → 사용중지 · 사용중지 → 예약가능, 그 밖 400 (사용자 결정 2026-10-31)
- [x] 날짜 입력 — **YYYY-MM-DD** (사용자 결정 2026-10-31)
- [x] 상세정보 저장 — **보낸 알려진 항목 + 지금 기본값으로 전부 저장** (사용자 결정 2026-10-31)
- [x] 업체 상품 설정 · 그룹 상품 수정 — **종류별 PATCH** (사용자 결정 2026-10-31)
- [x] 기간 가격 — **수정 포함**(겹침은 자기 자신 제외) (사용자 결정 2026-10-31)
- [x] 값 범위 — 요금 0 ~ 10,000,000원(판매면 1원 이상) · 기간 요금 1 ~ 10,000,000원 · 이용 시간 1 ~ 24 · 요일 1 ~ 127 · 입실 ≠ 퇴실 (사용자 결정 2026-10-31)
- [x] 그룹 사진 한도 — **5장** (사용자 결정 2026-10-31)
- [x] 그룹 등록 — 그룹 상품 3행을 함께(사용 안 함 · 0원), 요금은 그룹 상품 수정으로
- [x] 경로 — room 도메인 `/api/v1/admin-service/room`(업체 상품 설정도 `/room/plan` — t_room_plan 은 room 엔티티)
- [x] 상세정보 범위 — `room_count` 1 ~ 20, 플래그 0/1 · 그룹명 100자 · 설명 2,000자 · 호실명 50자 · 층 -10 ~ 200
