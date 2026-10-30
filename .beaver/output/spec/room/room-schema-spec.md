---
# One-line feature summary
feature_goal: "room 스키마 — 호실 상태 · 상품 종류 룩업(+시드) · 객실 그룹(상세정보 JSON) · 그룹 사진 · 호실 · 업체 상품 설정(업체 × 상품 종류 1행) · 그룹 상품(그룹 × 상품 종류 가격) · 상품별 기간 가격(DB 배타 제약) · 편의시설을 업체(t_store.store_detail)에서 객실 그룹으로 이동 · 기존 테이블 소프트 삭제 전환(삭제 = is_deleted 1, 조회는 repository 가 항상 is_deleted = 0)"

# Domain/module name
domain: "room"

# Entry-point method/endpoint
api_method: "엔티티 · 시드 · 마이그레이션(진입점 없음 — 스키마 단계) + 입점 승인 · 내 업체 소개 수정 · 업체 상세 응답 정리"

# Path/signature
api_path: "libs/database/src/entities/room/*.entity.ts · libs/database/src/entities/store/store.entity.ts · libs/database/src/seeder/seeder.targets.ts · libs/database/src/migrations/<ts>-RoomSchema.ts · apps/admin-service/src/store"

# Affected state
affected_data: ["t_room_state (새 룩업 + 시드)", "t_room_plan_type (새 룩업 + 시드)", "t_room_group (새)", "t_room_group_image (새)", "t_room (새)", "t_room_plan (새 — 업체 × 상품 종류 1행, 입점 승인 · 기존 업체에 3행)", "t_room_group_plan (새)", "t_room_group_plan_price (새 — btree_gist 배타 제약)", "t_store.store_detail (삭제 — 편의시설은 객실 그룹으로)", "t_store_application · t_store_file · t_store_hour · t_store_break · t_store_unavailable_period (is_deleted 추가 — 실제 삭제 6곳을 소프트 삭제로, t_store_file 은 updated_at 도, UK_StoreHour_StoreIdDayOfWeek 는 부분 유니크로)", "t_store · t_session (조회 · 개수 · 수정에 is_deleted = 0)"]
---

## Feature Description

로드맵 Phase 12(#48 ~ #52) — 객실 테이블을 세운다. 객실 관리(Phase 13) · device 기반(Phase 14) · reservation 기반(Phase 16)이 이 테이블을 기다린다. 이번 단계는 **스키마가 중심**이다 — 객실 관리 API 는 Phase 13 에서 만든다. 스키마 때문에 바뀌는 업체 코드만 함께 고친다(입점 승인이 업체 상품 설정 3행을 넣고, 업체 편의시설 입력 · 응답을 지운다).

- **#48 호실 상태 룩업 `t_room_state`** + 시드 — 스탠바이(STANDBY) · 이용중(IN_USE) · 정비중(MAINTENANCE) · 사용중지(DISABLED).
- **#49 객실 그룹 `t_room_group` · 그룹 사진 `t_room_group_image`**
  - 객실 그룹 = 객실의 유형. 같은 상품 · 가격을 쓰는 호실 묶음이다(Cross-Cutting "객실 모델"). 그룹명 · 설명 · **상세정보 JSON 하나**(`room_group_detail` — 업체에 있던 `store_detail` 처럼: 객실 안의 방 개수 · 샤워실 · TV · PC 유무). 수용인원 같은 별도 컬럼은 두지 않는다.
  - 사진은 공개(CDN)다. 업체 사진과 같은 컬럼(저장 키 · 원본 파일명 · MIME · 정렬 순서), 키는 `store/<store_id>/room-group/<room_group_id>/<uuid>.<jpg|png>`(CDN 이 `store/*` 만 읽는다 — docs/integration.md:42-43). 업로드는 presigned URL(Phase 13).
- **#50 호실 `t_room`** — 업체 · 그룹 · 층(정수, 지하는 음수) · 호실명 · 상태. 상태 · 사물은 호실마다.
- **#51 상품 종류 룩업 `t_room_plan_type`** + 시드, **업체 상품 설정 `t_room_plan`**, **그룹 상품 `t_room_group_plan`**
  - 상품 종류는 세 가지다 — **시간 이용(`HOURLY`)** · **1박(`NIGHT`)** · **연박(`LONG`)**.
  - **업체 상품 설정 = 업체 × 상품 종류 1행, 반드시 종류마다 1행씩**(업체의 모든 객실 공통): 사용 여부(`is_used` — 판매 여부) · 예약 가능 요일(비트) · 이용 시간(시간 이용) 또는 입실 · 퇴실 시각(1박 · 연박). 입점 승인이 기본값으로 3행을 넣고, 마이그레이션이 기존 업체에도 3행을 넣는다.
  - **그룹 상품 = 그룹 × 상품 종류 1행, 반드시 종류마다 1행씩**: 사용 여부 `is_used`(0/1 — 그 그룹이 그 종류를 파는지) + 기본 요금(시간 이용 1회 · 1박 · 연박 1박당). 그룹을 만들 때(Phase 13) 3행을 함께 만든다.
- **#52 상품별 기간 가격 `t_room_group_plan_price`** — 성수기 등. 날짜 범위(`start_date` · `end_date`, 한국 날짜, 둘 다 포함) + 요금 + 메모(30자). 같은 상품의 기간끼리 겹치지 않는다 — **DB 배타 제약 + service 검사 둘 다**.
- **편의시설 이동 — 업체 → 객실 그룹**(사용자 요청 2026-10-31)
  - 업체 상세정보 `t_store.store_detail`(`StoreDetail` — `room_count` · `has_shower` · `has_tv` · `has_pc`, Phase 6 #93 · Phase 11 #45)은 객실마다 다른 정보라 객실 그룹 상세정보 `t_room_group.room_group_detail`(`RoomGroupDetail`)로 옮긴다.
  - `room_count` 는 뜻이 바뀐다 — 업체의 방 개수(0 ~ 100) → **객실 안의 방 개수**(원룸 1 · 투룸 2). 업체 · 그룹의 호실 수는 `t_room` 행 개수로 센다.
  - **업체 쪽은 컬럼째 없앤다** — `t_store.store_detail` DROP, 내 업체 소개 수정(`PATCH /mine/profile`)의 편의시설 입력, 관리자 업체 상세(`GET /:store_id`) · 내 업체 상세(`GET /mine`) 응답의 `store_detail`, 도우미(`StoreMineProfileDetailDto` · `STORE_DETAIL_KEYS` · `buildStoreDetail`)를 지운다. 내 업체 소개 수정은 소개 · 연락처만 남는다. 업체 단위 항목(주차 등)이 필요해지면 그때 다시 둔다.
- **기존 테이블 소프트 삭제 전환**(사용자 규칙 · 요청 2026-10-31 — "전부 점검해줘", Phase 12 에 합친다)
  - 점검 결과: 실제 `DELETE` 6곳(store.repository.ts 165 입점 신청 취소 · 293 업체 정보 파일 삭제 · 333 신청 파일 일괄 삭제 · 585 영업시간 교체 · 635 브레이크타임 교체 · 718 일시 예약불가 삭제), `is_deleted` 가 있는 `t_store` · `t_session` 은 넣을 때 0 만 쓰고 **어떤 조회 · 개수 · 수정에도 `is_deleted = 0` 이 없다**. 파일의 S3 객체는 이미 `storageGateway.remove` 로 지운다(store.service.ts 336 · 369 · 810).
  - 바꾸는 것: 지우는 5개 테이블에 `is_deleted` 를 더하고(`t_store_file` 은 `updated_at` 도), 삭제 6곳을 `is_deleted = 1` 로 바꾼다(메서드 이름은 그대로). 파일은 S3 객체는 실제 삭제, DB 행은 `is_deleted = 1`. `is_deleted` 가 있는 모든 테이블의 조회 · 개수 · 수정은 **repository 가 항상 `is_deleted = 0` 을 붙인다** — 공통 util `notDeleted(where)`(libs/database), QueryBuilder 는 `"<별칭>"."is_deleted" = 0`(조인 테이블 포함).
  - 지우지 않는 테이블은 그대로다 — `t_user`(탈퇴 = 상태 LEAVE + 정보 가리기) · `t_session_refresh` · `t_sms_verification` · `t_user_setting` · 룩업 · `t_api_log`.

## Entry Point

진입점(API · 명령)은 새로 생기지 않는다. 결과물은 스키마이고, 기존 업체 진입점 셋의 입력 · 응답 · 동작이 바뀐다.

- Method: 엔티티 8개 추가 · 6개 수정(t_store · store 5개 소프트 삭제), 시드 2건, 마이그레이션 1개(`RoomSchema`), 오프라인 스키마 도구의 `btree_gist` 확장, 입점 승인의 업체 상품 설정 3행, 업체 편의시설 입력 · 응답 제거, 소프트 삭제 공통 util `notDeleted` + 모든 repository 의 `is_deleted = 0` · 삭제 6곳 소프트 삭제
- Path: `libs/database/src/entities/room/` · `libs/database/src/entities/store/store.entity.ts` · `libs/database/src/entities.ts`(ENTITIES) · `libs/database/src/seeder/seeder.targets.ts`(SEED_TARGETS) · `libs/database/src/migrations/<ts>-RoomSchema.ts` · `libs/database/src/migrations.ts`(MIGRATIONS) · `scripts/db-schema.mjs` · `apps/admin-service/src/store/`(service · repository · interface · constants · util) · `libs/contracts/src/store/dto/`(store-mine-profile · store-detail · store-mine)
- Request:
  - 입점 승인 `PATCH /api/v1/admin-service/store/application/:store_application_id/approve`(큐) — 입력 그대로, 업체 상품 설정 3행을 더 넣는다.
  - 내 업체 소개 수정 `PATCH /api/v1/admin-service/store/mine/profile`(큐) — `{introduction?, phone}`(`store_detail` 를 뺀다. 예전 클라이언트가 보내도 무시된다 — ValidationPipe 가 whitelist 를 켜지 않아 선언 안 된 필드를 막지도 지우지도 않고, service 는 소개 · 연락처만 쓴다).
- Response: `npm run db:check` 통과(엔티티 = 마이그레이션). `GET /api/v1/admin-service/store/:store_id` · `GET /api/v1/admin-service/store/mine` 응답에서 `store_detail` 이 빠진다. 업체 상품 설정 조회 · 변경 API 는 Phase 13. 마이그레이션 적용은 사용자 몫이다.

### 테이블

**t_room_state** (룩업 — 호실 상태)

| 컬럼 | 타입 | 비고 |
|---|---|---|
| room_state_id | varchar(20) PK `PK_RoomState` | STANDBY · IN_USE · MAINTENANCE · DISABLED |
| room_state_name | varchar(50) | 스탠바이 · 이용중 · 정비중 · 사용중지 |

**t_room_plan_type** (룩업 — 상품 종류)

| 컬럼 | 타입 | 비고 |
|---|---|---|
| room_plan_type_id | varchar(20) PK `PK_RoomPlanType` | HOURLY · NIGHT · LONG |
| room_plan_type_name | varchar(50) | 시간 이용 · 1박 · 연박 |

**t_room_group** (객실 그룹 — 객실의 유형)

| 컬럼 | 타입 | 비고 |
|---|---|---|
| room_group_id | varchar(32) PK `PK_RoomGroup` | |
| store_id | varchar(32) NOT NULL, FK `FK_RoomGroup_Store` → t_store (CASCADE) | |
| room_group_name | varchar(100) | 그룹명(예: 스탠다드 더블) |
| description | text NULL | 설명 |
| room_group_detail | jsonb NOT NULL 기본 `'{}'` | 상세정보 — `RoomGroupDetail`(room_count · has_shower · has_tv · has_pc, 항목은 바뀔 수 있다, 플래그는 `0 \| 1`). 없는 항목은 조회 뒤 `ROOM_GROUP_DETAIL_DEFAULTS`(방 1 · 샤워실 1 · TV 1 · PC 1)로 채운다(`@AfterLoad`) |
| is_deleted | smallint NOT NULL 기본 0 | 삭제 표시 |
| created_at · updated_at | timestamptz | 훅 |
| 제약 | `UK_RoomGroup_StoreIdRoomGroupName (store_id, room_group_name) WHERE is_deleted = 0` | 부분 유니크 인덱스 — 지운 그룹의 이름은 다시 쓸 수 있다 |

**t_room_group_image** (그룹 사진 — 공개)

| 컬럼 | 타입 | 비고 |
|---|---|---|
| room_group_image_id | varchar(32) PK `PK_RoomGroupImage` | |
| room_group_id | varchar(32) NOT NULL, FK `FK_RoomGroupImage_RoomGroup` (CASCADE) | |
| file_key | varchar(255), `UK_RoomGroupImage_FileKey` | `store/<store_id>/room-group/<room_group_id>/<uuid 32자>.<jpg\|png>` — 같은 키를 덮어쓰지 않는다 |
| file_name | varchar(255) | 원본 파일명 |
| content_type | varchar(100) | image/jpeg · image/png |
| sort_order | smallint NOT NULL 기본 0 | 0 = 대표 |
| is_deleted | smallint NOT NULL 기본 0 | 삭제 표시(소프트 삭제) |
| created_at · updated_at | timestamptz | 훅(삭제 표시도 수정이라 수정일을 둔다) |
| 인덱스 | `IDX_RoomGroupImage_RoomGroupIdSortOrder (room_group_id, sort_order)` | |

**t_room** (호실)

| 컬럼 | 타입 | 비고 |
|---|---|---|
| room_id | varchar(32) PK `PK_Room` | |
| store_id | varchar(32) NOT NULL, FK `FK_Room_Store` (CASCADE) | 그룹의 업체와 같다(service 가 맞춘다) — 업체 단위 호실명 유일성 · 업체 전체 조회용 |
| room_group_id | varchar(32) NOT NULL, FK `FK_Room_RoomGroup` (CASCADE) | |
| room_state_id | varchar(20) NOT NULL, FK `FK_Room_RoomState` (CASCADE) | |
| room_name | varchar(50) | 호실명(예: 101호) |
| floor | smallint | 층(정수 — 지하는 음수, B1 = -1) |
| is_deleted | smallint NOT NULL 기본 0 | 삭제 표시 |
| created_at · updated_at | timestamptz | 훅 |
| 제약 | `UK_Room_StoreIdRoomName (store_id, room_name) WHERE is_deleted = 0` | 부분 유니크 인덱스 |
| 인덱스 | `IDX_Room_StoreIdFloor (store_id, floor)` · `IDX_Room_RoomGroupId (room_group_id)` | 층별 목록 · 그룹의 호실 |

**t_room_plan** (업체 상품 설정 — 업체 × 상품 종류, 반드시 종류마다 1행)

| 컬럼 | 타입 | 비고 |
|---|---|---|
| room_plan_id | varchar(32) PK `PK_RoomPlan` | |
| store_id | varchar(32) NOT NULL, FK `FK_RoomPlan_Store` (CASCADE) | |
| room_plan_type_id | varchar(20) NOT NULL, FK `FK_RoomPlan_RoomPlanType` (CASCADE) | |
| is_used | smallint NOT NULL 기본 1 | 사용 여부(0: 이 업체는 이 종류를 팔지 않음, 1: 판매) |
| days_of_week | smallint NOT NULL 기본 127 | 예약 가능 요일(비트 — 일 1 · 월 2 · 화 4 · 수 8 · 목 16 · 금 32 · 토 64, 매일 127) |
| usage_hours | smallint NULL | 이용 시간(시간) — 시간 이용만, 1회 이용 · 연장 단위 |
| check_in_time · check_out_time | time NULL | 입실 · 퇴실 시각(한국 시각, 분 단위) — 1박 · 연박만. 1박은 퇴실이 입실보다 이르면 다음 날, 연박은 첫날 입실 · 마지막 날 퇴실 |
| created_at · updated_at | timestamptz | 훅 |
| 제약 | `UK_RoomPlan_StoreIdRoomPlanTypeId (store_id, room_plan_type_id)` | 업체 × 종류 1행 |
| 제약 | `CHK_RoomPlan_UsageHoursCheckInOutTime` | 시간 이용(HOURLY)은 `usage_hours` 만, 나머지(1박 · 연박)는 `check_in_time` · `check_out_time` 둘 다(세트)만 |

**t_room_group_plan** (그룹 상품 — 그룹 × 상품 종류, 반드시 종류마다 1행)

| 컬럼 | 타입 | 비고 |
|---|---|---|
| room_group_plan_id | varchar(32) PK `PK_RoomGroupPlan` | |
| room_group_id | varchar(32) NOT NULL, FK `FK_RoomGroupPlan_RoomGroup` (CASCADE) | |
| room_plan_type_id | varchar(20) NOT NULL, FK `FK_RoomGroupPlan_RoomPlanType` (CASCADE) | |
| is_used | smallint NOT NULL 기본 0 | 사용 여부(0: 이 그룹은 이 종류를 팔지 않음, 1: 판매) |
| price | integer NOT NULL 기본 0 | 기본 요금(원) — 시간 이용 1회 · 1박 · 연박 1박당 |
| created_at · updated_at | timestamptz | 훅 |
| 제약 | `UK_RoomGroupPlan_RoomGroupIdRoomPlanTypeId (room_group_id, room_plan_type_id)` | 그룹 × 종류 1행(지우지 않는 행이라 일반 UK) |

**t_room_group_plan_price** (상품별 기간 가격)

| 컬럼 | 타입 | 비고 |
|---|---|---|
| room_group_plan_price_id | varchar(32) PK `PK_RoomGroupPlanPrice` | |
| room_group_plan_id | varchar(32) NOT NULL, FK `FK_RoomGroupPlanPrice_RoomGroupPlan` (CASCADE) | |
| start_date · end_date | date | 한국 날짜, 둘 다 포함 — 값은 문자열 `'YYYY-MM-DD'` |
| price | integer | 이 기간의 요금(원) — 기본 요금 대신 |
| memo | varchar(30) NULL | 예: 여름 성수기 |
| is_deleted | smallint NOT NULL 기본 0 | 삭제 표시(소프트 삭제) |
| created_at · updated_at | timestamptz | 훅 |
| 제약 | `CHK_RoomGroupPlanPrice_StartDateEndDate` — `start_date <= end_date` | |
| 제약 | `EXC_RoomGroupPlanPrice_RoomGroupPlanIdDateRange` — `EXCLUDE USING gist (room_group_plan_id WITH =, daterange(start_date, end_date, '[]') WITH &&) WHERE ("is_deleted" = 0)` | 같은 상품의 지워지지 않은 기간끼리 겹침을 DB 가 막는다(23P01). `btree_gist` 확장 필요 |

**t_store** (컬럼 삭제)

| 컬럼 | 비고 |
|---|---|
| ~~store_detail~~ (jsonb) | **삭제** — 편의시설은 객실 그룹 `room_group_detail` 로 옮긴다. 기존 값은 옮기지 않고 사라진다(받을 그룹이 아직 없다) |

## Business Rules

- **상품 종류 3가지**(사용자 결정 2026-10-30 · 이름 2026-10-31)
  - **시간 이용 `HOURLY`** — 업체가 정한 이용 시간(`usage_hours`)만큼 이용한다. 영업시간 안 아무 시각에나 시작한다. 연장은 그 시간만큼씩(Phase 19).
  - **1박 `NIGHT`** — 업체가 정한 입실 ~ 퇴실 시각 그대로 한 번(22:00 ~ 다음 날 09:00). 그 시간대만 판다. 연장도 가능하다(단위는 Phase 19 #81 — 기본안: 시간 이용의 이용 시간).
  - **연박 `LONG`** — 날짜 범위로 고른다. 첫날 입실 시각에 들어가 마지막 날 퇴실 시각에 나온다(2026.01.01 ~ 2026.01.05 → 01.01 15:00 입실, 01.05 11:00 퇴실). **1박부터**(마지막 날 > 첫날 — 1박도 연박 시각 · 가격으로 고를 수 있다).
  - 이름은 뜻이 바로 드러나는 말로 한다 — 영어를 한글로 옮겨 적은 말(데이유즈 · 나이트 · 롱스테이)은 쓰지 않는다(.beaver/memory/naming.md).
  - 종류마다 다른 동작은 코드가 ID 상수로 가른다. 룩업에는 구조 컬럼만 둔다(형제: t_store_state).
- **업체 상품 설정 `t_room_plan` — 업체 × 상품 종류, 반드시 종류마다 1행**(사용자 결정 2026-10-31)
  - 업체의 모든 객실 공통이다. 종류마다 반복되는 설정을 `t_store` 에 `<종류>_<설정>` 컬럼으로 늘어놓지 않고(JSON 도 아니고) 종류별 행으로 둔다 — 컬럼은 종류와 무관한 이름(.beaver/memory/naming.md).
  - 사용 여부 `is_used` 0 이면 그 업체는 그 상품을 팔지 않는다(예: 연박을 안 파는 업체). 그룹 상품의 `is_used` 가 1 이어도 팔지 않는다. 요일 · 시각 설정은 그대로 남는다(다시 켜면 그대로).
  - 예약 가능 요일 `days_of_week` 는 비트(`smallint`, 0 ~ 127). 비트 i 가 1 이면 `day_of_week = i`(0: 일 ~ 6: 토, dayjs `day()` · `t_store_hour.day_of_week`)에 예약 가능하다. 어느 날짜의 요일로 볼지(입실 날짜 · 연박 각 박)는 Phase 17 #67 에서 정한다.
  - 시간 이용은 `usage_hours` 만, 1박 · 연박은 `check_in_time` · `check_out_time` 둘 다(세트)만 — CHECK `CHK_RoomPlan_UsageHoursCheckInOutTime`(형제: `CHK_StoreHour_OpenCloseTime` 의 플래그 + 세트 규칙). 시각은 하루 안 시각 `time` 규칙 그대로(한국 시각, 분 단위, 퇴실이 입실보다 이르면 다음 날 — 1박). 입실 = 퇴실은 두지 않는다(검증은 Phase 13 DTO).
  - **업체마다 3행이 항상 있다** — 입점 승인이 기본값으로 3행을 넣고(같은 트랜잭션), 마이그레이션이 기존 업체에도 같은 기본값으로 3행을 넣는다. 행을 지우는 API 는 두지 않는다(팔지 않으려면 `is_used = 0`).
  - 기본값: 세 종류 모두 판매 · 매일(127), 시간 이용 3시간, 1박 22:00 ~ 09:00, 연박 15:00 ~ 11:00(사용자 결정 2026-10-30). 업체 관리자가 바꾸는 API 는 Phase 13.
- **그룹 상품 `t_room_group_plan` — 그룹 × 상품 종류, 반드시 종류마다 1행**(사용자 결정 2026-10-31)
  - 그룹마다 3행이 항상 있다 — 그룹을 만들 때(Phase 13 #53) 3행을 함께 만들고, 지우지 않는다(`UK_RoomGroupPlan_RoomGroupIdRoomPlanTypeId` 는 일반 UK). 판매 / 판매 안 함은 사용 여부 `is_used` 0/1 로 바꾼다. 그룹이 삭제 표시되면 그룹 상품도 그 그룹과 함께 쓰이지 않는다.
  - 기본값은 사용 안 함(`is_used = 0`) · 요금 0 이다 — 요금을 정한 종류만 켜고 판다. 그룹을 만들 때의 입력(종류별 사용 여부 · 요금)은 Phase 13 에서 정한다.
  - **판매 = 업체 상품 설정 `is_used = 1` AND 그룹 상품 `is_used = 1`**. 금액은 `integer`(원). 예약(Phase 16)은 그룹 상품 행을 가리키고 적용 가격을 따로 저장한다.
- **기간 가격**
  - 날짜 단위다(시각 없음 — 사용자 표기 yyyy.MM.dd). 시작 · 종료 날짜 둘 다 포함, 시작 ≤ 종료(CHECK). API 입력 형식은 Phase 13 기획 때 정한다.
  - 이용 날짜가 기간에 포함되면 무조건 기간 요금을 쓴다(사용자 결정 2026-10-30). 1박 · 연박처럼 여러 날짜에 걸칠 때의 계산(박마다 · 기준일)은 Phase 17 #67 에서 정한다.
  - **겹침은 DB + service 둘 다 막는다**(사용자 결정 2026-10-30). DB 는 배타 제약 `EXC_RoomGroupPlanPrice_RoomGroupPlanIdDateRange`(PostgreSQL 오류 23P01, 제약명 그대로). service 는 등록 · 수정 때 업체 행 잠금 아래에서 먼저 확인해 400 으로 알린다(형제: 일시 예약불가 store.service.ts `addMyUnavailablePeriod` — Phase 13). repository 의 `isExclusionViolation(error, 'EXC_…')` 변환도 Phase 13 에서 더한다.
  - 기간 가격도 지울 때 삭제 표시(`is_deleted = 1`)로 남긴다. 겹침은 지워지지 않은 기간끼리만 본다 — 배타 제약 `… WHERE ("is_deleted" = 0)`, service 검사도 `is_deleted = 0`. 예약은 적용 가격을 따로 저장한다(Phase 16 `t_reservation`).
- **삭제는 항상 소프트 삭제**(사용자 규칙 2026-10-31 — .beaver/memory/data-layer.md) — 그룹 · 그룹 사진 · 호실 · 기간 가격은 지울 때 `is_deleted = 1` 로 남긴다(`DELETE` 없음). 예약(Phase 16)이 호실 · 상품을 FK 로 가리켜 이력도 남는다. 조회 · 개수 · 겹침 검사는 `is_deleted = 0` 만 보고, 유일성 · 배타 제약도 지워지지 않은 행끼리만이다(부분 유니크 인덱스 · 배타 제약 `WHERE "is_deleted" = 0`). 그룹 사진의 저장 키 UK(`UK_RoomGroupImage_FileKey`)는 전체 행에 건다 — 키는 업로드마다 새로 만들어 다시 쓰지 않는다. 룩업 · 업체 상품 설정(업체마다 종류별 반드시 1행) · 그룹 상품(그룹마다 종류별 반드시 1행)은 지우지 않는다 — 판매 여부는 `is_used` 로 바꾼다. 미래 예약이 있는 그룹 · 호실 삭제는 Phase 13 #53 · #54 에서 정한다.
  - **DB 데이터만 소프트 삭제다** — 파일을 지울 때 S3 객체는 실제로 지우고(`storageGateway.remove` — 이미 그렇게 한다), DB 행은 `is_deleted = 1` 로 바꾼다(사용자 결정 2026-10-31).
  - **조회에는 `is_deleted = 0` 이 항상 붙는다 — repository 가 붙인다**(사용자 결정 2026-10-31). `is_deleted` 가 있는 테이블의 조회 · 개수 · 수정 메서드는 받은 조건을 공통 util `notDeleted(where)`(libs/database/src/soft-delete.ts — 배열(OR) 조건이면 각 조건에)로 감싸고, QueryBuilder 빌더는 `"<별칭>"."is_deleted" = 0` 을 더한다(조인한 테이블도). service 는 조건에 `is_deleted` 를 넣지 않는다 — 규약 "WHERE 는 service 가 만들고 repository 는 실행만" 의 예외로 규약 문서에 적는다(삭제 조건이 빠지는 일을 구조로 막는다).
  - **삭제 메서드는 이름을 그대로 두고 소프트 삭제로** — `deleteApplication` · `deleteStoreFile` · `deleteApplicationFiles` · `deleteStoreHours` · `deleteStoreBreaks` · `deleteUnavailablePeriod` 는 `update(notDeleted(where), is_deleted = 1 인 엔티티)`(훅이 수정일을 채운다). 상태 조건을 건 삭제(`deleteApplication` · `deleteUnavailablePeriod`)는 지금처럼 `affected === 1` 을 돌려준다. 통째로 교체(영업시간 · 브레이크타임)는 기존 행을 삭제 표시한 뒤 새 행을 넣는다 — 그래서 `UK_StoreHour_StoreIdDayOfWeek` 는 부분 유니크 인덱스(`WHERE "is_deleted" = 0`)로 바꾼다.
  - 기존 store 코드의 실제 삭제 6곳(store.repository.ts 165 · 293 · 333 · 585 · 635 · 718)과 `t_store` · `t_session` 조회 전부를 이번 Phase 12 에서 함께 바꾼다(사용자 결정 2026-10-31).
- **호실의 업체** — `t_room.store_id` 는 그룹의 업체와 같아야 한다. DB 복합 FK 대신 service 가 맞춘다(Phase 13 — 그룹을 업체 범위로 찾은 뒤 등록 · 이동).
- **그룹 상세정보는 JSON 하나** — 객실 그룹(객실의 유형)별 상세정보는 jsonb `room_group_detail` 하나 + 같은 파일의 TS 인터페이스 `RoomGroupDetail` 로만 관리한다. 업체에 있던 `t_store.store_detail` · `StoreDetail`(store.entity.ts:5)과 같은 방식이고, 이번에 그 항목을 그룹으로 옮긴다. 수용인원 같은 별도 컬럼은 두지 않는다(사용자 결정 2026-10-31).
  - 항목(업체에서 옮겨 온 그대로): `room_count`(객실 안의 방 개수 — 원룸 1 · 투룸 2) · `has_shower` · `has_tv` · `has_pc`(`0 | 1` — 0: 없음, 1: 있음).
  - **기본값을 두고, 조회 뒤 빈 항목을 채운다**(사용자 결정 2026-10-31) — 같은 엔티티 파일의 상수 `ROOM_GROUP_DETAIL_DEFAULTS = {room_count: 1, has_shower: 1, has_tv: 1, has_pc: 1}`. 엔티티의 `@AfterLoad` 훅이 `{...기본값, ...저장된 값}` 으로 저장된 JSON 에 없는 항목을 채운다. 그래서 항목을 더할 때(수용인원 · 침대 · 면적 등)는 인터페이스 · 기본값만 고치고, 기존 행을 고치는 마이그레이션이 없다 — 기존 그룹은 새 항목이 기본값으로 보인다. 엔티티로 읽지 않는 조회(raw select — Phase 18 discovery 등)는 같은 상수로 채운다.
  - 인터페이스의 항목은 조회 뒤 값 기준이라 모두 필수다(저장된 JSON 은 빠진 항목이 있을 수 있다). 저장할 때 보낸 항목만 둘지 기본값까지 채워 둘지는 Phase 13 입력 기획 때 정한다.
  - jsonb 상세정보는 앞으로도 이 방식이다(규약 — data-layer.md jsonb 절). 지금 다른 jsonb 는 상세정보가 아니라 대상이 없다 — `t_api_log` 요청 · 응답 본문(로그 원본), `delete_backup` · `leave_backup`(text 백업).
  - 입력(Phase 13)은 지금 업체 편의시설과 같이 중첩 DTO + 알려진 항목만 남기는 상수 목록으로 한다(ValidationPipe 가 whitelist 를 켜지 않아 선언 안 된 키가 남는다 — 지금 `STORE_DETAIL_KEYS` · `buildStoreDetail` store.constants.ts:43 · store.util.ts:197 의 방식. 이번에 업체 쪽에서는 지운다).
- **편의시설은 업체가 아니라 객실 그룹에**(사용자 요청 2026-10-31) — 업체 쪽 `t_store.store_detail` 과 그 입력 · 응답 · 도우미(`StoreDetail` · `StoreMineProfileDetailDto` · `STORE_DETAIL_KEYS` · `buildStoreDetail`)를 이번에 지운다(§1.7 — 옮기면서 빈 자리를 남기지 않는다). 내 업체 소개 수정(`MINE_PROFILE`)은 소개 · 연락처만 받는다. 예전 클라이언트가 `store_detail` 을 보내도 무시된다(ValidationPipe 는 whitelist 를 켜지 않아 선언 안 된 필드를 막지도 지우지도 않는다 — AGENTS.md Validation, service 는 소개 · 연락처만 엔티티에 담는다). 기존 업체의 편의시설 값은 옮기지 않는다 — 받을 그룹이 아직 없고, 업체 관리자가 그룹을 만들 때(Phase 13) 다시 넣는다.
- **같은 서비스 FK** — room 테이블은 admin-service 가 업체와 함께 쓴다. store → room 사이 FK 는 같은 서비스 안이라 건다(data-layer.md:31 은 다른 서비스 소유 테이블만 금지).
- **룩업 값은 시드 한 곳** — `ROOM_STATE_SEED_DATA` · `ROOM_PLAN_TYPE_SEED_DATA`. 마이그레이션은 기존 업체의 업체 상품 설정이 FK 를 만족하도록 상품 종류 3행을 먼저 넣는다(`ON CONFLICT DO NOTHING` — 형제: StoreSchema 의 SUSPEND 행, seeder 는 있는 PK 를 건너뛴다). Phase 13 DTO 허용값(`@IsIn`)은 이 시드에 있어야 한다.

## Notes

- 형제 근거
  - 룩업: `t_store_state`(store-state.entity.ts:6) — 구조 컬럼만
  - 파일 행: `t_store_file`(store-file.entity.ts:13 — `file_key` UK · `file_name` · `content_type` · `sort_order` · 등록일 훅만)
  - jsonb 상세정보: `StoreDetail`(store.entity.ts:5 — 이번에 `RoomGroupDetail` 로 옮긴다)
  - 부분 유니크 인덱스: t_user `UK_User_LoginIdLoginScope`(where `"store_id" IS NULL` — user.entity.ts:17-20)
  - CHECK: `CHK_StoreHour_OpenCloseTime`(store-hour.entity.ts:11 — 플래그 + 세트) · `CHK_StoreUnavailablePeriod_StartsAtEndsAt`(store-unavailable-period.entity.ts:11)
  - 배열 insert: `insertStoreHours(entities)`(store.repository.ts:596) — 엔티티 인스턴스 배열이라 각 행의 `@BeforeInsert` 가 돈다
  - 다른 도메인 테이블 쓰기의 이름: `insertHeadManager`(store 가 t_user — store.repository.ts:481) → 업체 상품 설정은 `insertStorePlans`
  - 마이그레이션의 룩업 선입력: 1792780576432-StoreSchema.ts:52(`INSERT … ON CONFLICT DO NOTHING`)
  - 시드: seeder.targets.ts `STORE_FILE_PURPOSE_SEED_DATA` · `SEED_TARGETS`
- **`btree_gist` 은 프로젝트 첫 PostgreSQL 확장이다**
  - 배타 제약에서 `room_group_plan_id WITH =`(varchar 같음)를 gist 로 쓰려면 필요하다.
  - PGlite 0.5.9 에 `@electric-sql/pglite/contrib/btree_gist` 가 있고, 겹치는 기간 insert 가 23P01 · 제약명 `EXC_…` 로 거부되는 것을 확인했다(기획 중 시험 2026-10-30). `scripts/db-schema.mjs` 가 PGlite 를 이 확장과 함께 띄워야 `db:check` · `db:generate` 가 돈다.
  - TypeORM 은 배타 제약이 있는 엔티티가 있으면 연결 때 `CREATE EXTENSION IF NOT EXISTS "btree_gist"` 를 시도하고, 권한이 없으면 경고만 남긴다(PostgresDriver.js:406-412). 마이그레이션도 맨 앞에서 같은 문장을 실행한다 — 적용 계정에 확장 생성 권한이 필요하다(RDS PostgreSQL 13+ 는 `btree_gist` 가 trusted 확장이라 DB 의 CREATE 권한이면 된다).
  - 로드맵 Notes/Risks "배타 제약과 오프라인 검사"(Phase 16 에서 확인 예정)가 여기서 풀린다. Phase 16 `t_reservation` 의 점유 구간 배타 제약도 같은 확장을 쓴다.
- `date` 컬럼은 TypeORM 이 문자열 `'YYYY-MM-DD'` 로 돌려준다(PostgresDriver.js:519-522 `mixedDateToDateString`). 엔티티 타입은 `string`. 마이그레이션의 기존 업체 3행 PK 는 `replace(gen_random_uuid()::text, '-', '')`(PostgreSQL 13+ 내장 — 앱의 `generateId()` 와 같은 32자).
- 새 규약(data-layer.md · conventions.md · AGENTS.md)
  - 날짜 `date`(한국 날짜, 문자열 `'YYYY-MM-DD'`, 컬럼 이름 `<x>_date`) · 금액 `integer`(원) · 요일 비트 `smallint`(`days_of_week`, 비트 = `1 << day_of_week`)
  - 배타 제약 `@Exclusion('EXC_<Model>_<내용>', 'USING gist (…)')` — 범위 겹침을 DB 가 막을 때, `btree_gist` 확장
  - 삭제 표시 테이블의 이름 유일성은 부분 유니크 인덱스 `WHERE "is_deleted" = 0`
  - 종류마다 반복되는 설정은 (주체 × 종류) 1행 테이블 — `<종류>_<설정>` 컬럼 ❌(naming 메모리)
  - 이름은 뜻이 드러나는 말 — 음역 ❌(naming 메모리)
- 이번에 만들지 않는 것: 객실 관리 · 업체 상품 설정 API 전부(Phase 13 — 업체 상품 설정 API 도 Phase 13 에 새 유닛으로), 그룹 정렬 순서, 요일별 요금(주말 요금 — 기간 가격만), 사람 수에 따른 요금.
- 업체 상품 설정을 바꿀 때(판매 중지 · 요일 · 시각 변경) 걸리는 기존 예약 처리는 로드맵 Open Decisions "영업중지 · 영업시간 변경 · 영업중 아님 전환 시 기존 예약" 과 같이 Phase 17 에서 정한다.

## Proposals (Codebase-Based)

- [x] 룩업 2개를 `t_store_state` 와 같은 모양(구조 컬럼만 + seeder)으로 만든다 — store-state.entity.ts:6
- [x] 그룹 사진을 `t_store_file` 과 같은 컬럼 · 키 규칙으로 둔다(공개 — `store/` 접두) — store-file.entity.ts:13, docs/integration.md:42-43
- [x] 업체 상품 설정의 시간 규칙 조합을 `CHK_StoreHour_OpenCloseTime` 처럼 CHECK 로 막는다 — store-hour.entity.ts:11
- [x] 입점 승인이 업체 상품 설정을 업체와 같은 트랜잭션에서 넣는다(배열 insert — `insertStoreHours` 와 같은 방식) — store.repository.ts:596
- [x] 기간 가격 겹침의 service 검사는 일시 예약불가(#98)와 같은 업체 행 잠금 방식으로 한다 — `findStoreByManager(user_id, true)`(Phase 13)

## Decisions

- [x] 그룹 상세정보 — **jsonb `room_group_detail` + `RoomGroupDetail` 하나로만**(업체에서 옮겨 온 room_count · has_shower · has_tv · has_pc). 수용인원 컬럼 · 침대 · 면적 항목은 두지 않는다 (사용자 결정 2026-10-30 · 2026-10-31)
- [x] 편의시설 위치 — **업체(`t_store.store_detail`)에서 객실 그룹(`room_group_detail`)으로 옮기고 업체 쪽은 컬럼째 없앤다**(입력 · 응답 · 도우미 포함). 기존 값은 옮기지 않는다 (사용자 결정 2026-10-31)
- [x] 상세정보 기본값 — **`ROOM_GROUP_DETAIL_DEFAULTS`(방 1 · 샤워실 · TV · PC 1) + 조회 뒤 `@AfterLoad` 로 빈 항목 채우기**. 앞으로의 jsonb 상세정보도 같은 방식(규약) (사용자 결정 2026-10-31)
- [x] `room_count` 의 뜻 — **객실 안의 방 개수**(원룸 1 · 투룸 2). 업체 · 그룹의 호실 수는 `t_room` 개수 (사용자 결정 2026-10-31)
- [x] 삭제 방식 — **항상 소프트 삭제** — 그룹 · 그룹 사진 · 호실 · 기간 가격 모두 `is_deleted`. 업체 상품 설정 · 그룹 상품은 종류마다 반드시 1행이라 지우지 않고 `is_used` 로 판매 여부를 바꾼다. 이름 유일성 · 기간 겹침 배타 제약은 지워지지 않은 행끼리(`WHERE "is_deleted" = 0`). 룩업도 지우지 않는다 (사용자 결정 2026-10-30 · 규칙 2026-10-31)
- [x] 상품 종류 — **3가지 `HOURLY` 시간 이용 · `NIGHT` 1박 · `LONG` 연박**, 룩업 `t_room_plan_type`. 음역(데이유즈 · 나이트 · 롱스테이)은 쓰지 않는다 (사용자 결정 2026-10-30 · 이름 2026-10-31)
- [x] 업체 상품 설정 위치 — **`t_room_plan` 업체 × 상품 종류, 반드시 종류마다 1행**(`is_used` · `days_of_week` · `usage_hours` · `check_in_time` · `check_out_time`). `t_store` 의 종류별 컬럼 · JSON 은 쓰지 않는다 (사용자 결정 2026-10-31)
- [x] 그룹 상품 — **그룹 × 상품 종류, 반드시 종류마다 1행**, 판매 / 판매 안 함은 `is_used` 0/1(기본 0 · 요금 기본 0). 판매 = 업체 상품 설정 `is_used` AND 그룹 상품 `is_used` (사용자 결정 2026-10-30 · 2026-10-31)
- [x] 기본값 — 판매 · 매일(127) · 시간 이용 3시간 · 1박 22:00 ~ 09:00 · 연박 15:00 ~ 11:00, 입점 승인 · 기존 업체(마이그레이션) 모두 (사용자 결정 2026-10-30)
- [x] 연박 최소 — **1박부터** (사용자 결정 2026-10-30)
- [x] 기간 가격 — **날짜 범위(둘 다 포함) · 이용 날짜가 포함되면 기간 요금 · 겹침은 DB 배타 제약 + service 검사 둘 다** (사용자 결정 2026-10-30)
- [x] 호실 상태 ID — `STANDBY` · `IN_USE` · `MAINTENANCE` · `DISABLED`(대문자 ID 방식 — t_store_state). 상태 전이 규칙 · 정비 완료 자동 전환은 Phase 13 #55
- [x] 호실의 업체 — `t_room.store_id` 를 둔다(업체 단위 호실명 유일성 · 업체 전체 조회). 그룹의 업체와 같은지는 service 가 맞춘다
- [x] 마이그레이션 되돌리기는 `btree_gist` 확장을 지우지 않는다 — 다른 곳(Phase 16)이 쓰고 남겨도 해가 없다
- [x] 소프트 삭제 범위 — **DB 데이터만**. 파일은 S3 객체를 실제로 지우고 DB 행은 `is_deleted = 1`. 지우는 테이블에만 `is_deleted` 를 두고(지우지 않는 t_user · 세션 갱신 · SMS 기록 · 룩업 · API 로그는 그대로) (사용자 결정 2026-10-31)
- [x] `is_deleted = 0` 을 붙이는 곳 — **repository 가 항상**(`notDeleted(where)` · QueryBuilder 조건, 조인 테이블 포함). 규약 "WHERE 는 service" 의 예외로 문서화 (사용자 결정 2026-10-31)
- [x] 기존 코드 전환 시점 — **Phase 12 에 합친다**(실제 삭제 6곳 · t_store · t_session 조회 전부, 마이그레이션도 RoomSchema 하나) (사용자 결정 2026-10-31)
