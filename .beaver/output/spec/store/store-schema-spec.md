---
# One-line feature summary
feature_goal: "store 스키마 — 입점 신청 · 신청 상태 · 업체 상태 룩업(+시드) · t_store 재설계(상태 · 위경도 · 소개 · 연중무휴 · 정비시간) · 업체 사진 · 요일별 영업시간 · 브레이크타임"

# Domain/module name
domain: "store"

# Entry-point method/endpoint
api_method: "엔티티 · 시드 · 마이그레이션(진입점 없음 — 스키마 단계)"

# Path/signature
api_path: "libs/database/src/entities/store/*.entity.ts · libs/database/src/seeder/seeder.targets.ts · libs/database/src/migrations/<ts>-StoreSchema.ts"

# Affected state
affected_data: ["t_store_state (새 룩업 + 시드)", "t_store_application_state (새 룩업 + 시드)", "t_store (컬럼 추가 · 주석 변경)", "t_store_application (새)", "t_store_image (새)", "t_store_hour (새)", "t_store_break (새)", "t_user.store_id (주석만 — 참조 PK 주석을 따른다)"]
---

## Feature Description

로드맵 Phase 8(#32 ~ #36) — 업체 새 모델의 테이블을 세운다. 업체 입점·관리(Phase 9)와 room 스키마(Phase 12)가 이 테이블을 기다린다. 이번 단계는 **스키마만** 만든다 — API · service · repository 는 Phase 9 · 11 에서 만든다.

- **#32 입점 신청 `t_store_application`**
  - 이용자가 신청하고 총관리자가 승인 · 반려한다.
  - 승인하면 업체(`t_store`)와 업체 총관리자 계정을 만들고, 만든 업체 ID 를 신청에 남긴다(Phase 9).
  - 항목: 업체 정보 · 위경도 · 업체 총관리자 이름 · 휴대폰 번호 · 사업자등록증 사진 · 신청 메모 · 상태 · 반려 사유 · 처리일.
- **#32 신청 상태 룩업 `t_store_application_state`** + 시드 — 대기(WAIT) · 승인(APPROVED) · 반려(REJECTED).
- **#33 업체 상태 룩업 `t_store_state`** + 시드 — 활성(ACTIVE) · 영업중지(SUSPEND) · 탈퇴(LEAVE). 이용자에게는 활성 업체만 보인다(Cross-Cutting "업체 공개").
- **#34 `t_store` 재설계** — 기존 테이블에 컬럼을 더한다.
  - 상태(`store_state_id` FK) · 위경도(`latitude` · `longitude`) · 소개(`introduction`) · 24시간 연중무휴 여부(`is_always_open`) · 영업중 여부(`is_open`) · 정비시간(`maintenance_minutes`).
  - 편의시설 · 방 칸수는 이미 있는 `store_detail`(jsonb)에 그대로 둔다(Phase 6 #93).
  - 연락처는 기존 `phone` 이다.
  - 주석의 "가맹점" 을 로드맵 용어 "업체" 로 바꾼다.
- **#35 업체 사진 `t_store_image`** — S3 저장 키 · 정렬 순서. 업로드는 presigned URL(Phase 11)이다.
- **#36 요일별 영업시간 `t_store_hour` · 브레이크타임 `t_store_break`**
  - 요일 반복만 둔다(특정 날짜 휴무는 후순위).
  - 시각은 `time` 이고 분 단위이며, 자정을 넘길 수 있다.

## Entry Point

진입점(API · 명령)은 없다. 결과물은 스키마다.

- Method: 엔티티 6개 추가 · 1개 수정, 시드 2건, 마이그레이션 1개(`StoreSchema`)
- Path: `libs/database/src/entities/store/` · `libs/database/src/entities.ts`(ENTITIES) · `libs/database/src/seeder/seeder.targets.ts`(SEED_TARGETS) · `libs/database/src/migrations/<ts>-StoreSchema.ts` · `libs/database/src/migrations.ts`(MIGRATIONS)
- Request: —
- Response: `npm run db:check` 통과(엔티티 = 마이그레이션). 마이그레이션 적용은 사용자 몫이다.

### 테이블

**t_store_state** (룩업 — 업체 상태)

| 컬럼 | 타입 | 비고 |
|---|---|---|
| store_state_id | varchar(20) PK `PK_StoreState` | ACTIVE · SUSPEND · LEAVE |
| store_state_name | varchar(50) | 활성 · 영업중지 · 탈퇴 |

**t_store_application_state** (룩업 — 입점 신청 상태)

| 컬럼 | 타입 | 비고 |
|---|---|---|
| store_application_state_id | varchar(20) PK `PK_StoreApplicationState` | WAIT · APPROVED · REJECTED |
| store_application_state_name | varchar(50) | 대기 · 승인 · 반려 |

**t_store** (추가 컬럼 — 기존 컬럼은 그대로)

| 컬럼 | 타입 | 비고 |
|---|---|---|
| store_state_id | varchar(20) NOT NULL, FK `FK_Store_StoreState` → t_store_state (CASCADE) | 업체 상태 |
| latitude · longitude | double precision NOT NULL | 위도 · 경도(WGS84) — 입점 신청 좌표를 승인 때 옮긴다 |
| introduction | text NULL | 업체 소개 |
| is_always_open | smallint NOT NULL 기본 0 | 1 = 24시간 연중무휴(요일별 영업시간을 두지 않는다) |
| is_open | smallint NOT NULL 기본 1 | 영업중 여부 — 0 = 영업중 아님, 1 = 영업중. 0 이면 연중무휴 · 영업시간과 무관하게 영업중 아님으로 걸러진다 |
| maintenance_minutes | smallint NOT NULL 기본 0 | 정비시간(분) — 퇴실 후 호실을 막는 시간 |
| 인덱스 | `IDX_Store_LatitudeLongitude (latitude, longitude)` | 지도 범위 조회(Phase 18) |

**t_store_application** (입점 신청)

| 컬럼 | 타입 | 비고 |
|---|---|---|
| store_application_id | varchar(32) PK `PK_StoreApplication` | |
| user_id | varchar(32) NOT NULL, **FK 없음** · `IDX_StoreApplication_UserId` | 신청한 이용자 — t_user 는 다른 서비스 소유라 ID 만 둔다 |
| store_application_state_id | varchar(20) NOT NULL, FK `FK_StoreApplication_StoreApplicationState` (CASCADE) | 신청 상태 |
| store_id | varchar(32) NULL, FK `FK_StoreApplication_Store` → t_store (RESTRICT) | 승인으로 만든 업체(대기 · 반려 NULL) |
| store_name | varchar(100) | 상호명 |
| business_number | varchar(10) | 사업자등록번호(숫자 10자리) — UK 없음(반려 후 재신청) |
| owner_name | varchar(50) | 대표자명 |
| phone | varchar(30) | 업체 연락처 |
| address · address_detail | varchar(255) · varchar(255) NULL | 주소 · 상세주소 |
| latitude · longitude | double precision | 클라이언트가 주소 검색으로 구해 보낸다 |
| head_manager_name | varchar(50) | 업체 총관리자 이름 — 승인 때 만드는 매니저 계정 |
| head_manager_phone | varchar(30) | 업체 총관리자 휴대폰 번호(숫자만) — 계정 · 안내 SMS |
| business_license_image_key | varchar(255) | 사업자등록증 사진 S3 키(신청 때 필수) |
| application_comment | varchar(500) NULL | 신청 메모 |
| reject_comment | varchar(255) NULL | 반려 사유 |
| reviewed_at | timestamptz NULL | 처리일(승인 · 반려) |
| created_at · updated_at | timestamptz | 신청일 · 수정일(훅) |

**t_store_image** (업체 사진)

| 컬럼 | 타입 | 비고 |
|---|---|---|
| store_image_id | varchar(32) PK `PK_StoreImage` | |
| store_id | varchar(32) NOT NULL, FK `FK_StoreImage_Store` (CASCADE) | |
| image_key | varchar(255) | S3 저장 키(`store/<store_id>/<uuid>.jpg`) — 화면은 `getPublicUrl(key)` |
| sort_order | smallint NOT NULL 기본 0 | 작을수록 앞, 0 = 대표 사진 |
| created_at | timestamptz | 등록일(훅) |
| 인덱스 | `IDX_StoreImage_StoreIdSortOrder (store_id, sort_order)` | |

**t_store_hour** (요일별 영업시간 — `is_always_open = 0` 인 업체만)

| 컬럼 | 타입 | 비고 |
|---|---|---|
| store_hour_id | varchar(32) PK `PK_StoreHour` | |
| store_id | varchar(32) NOT NULL, FK `FK_StoreHour_Store` (CASCADE) | |
| day_of_week | smallint | 0 = 일 ~ 6 = 토(dayjs `day()`) |
| is_closed | smallint NOT NULL 기본 0 | 1 = 휴무(시각 NULL) |
| open_time · close_time | time NULL | 한국 시각, 분 단위. 마감이 시작보다 이르면 다음 날 마감(18:00 ~ 06:00) |
| created_at · updated_at | timestamptz | 훅 |
| 제약 | `UK_StoreHour_StoreIdDayOfWeek (store_id, day_of_week)` | 요일마다 1행 |
| 제약 | `CHK_StoreHour_OpenCloseTime` | 휴무면 open_time · close_time 둘 다 NULL, 아니면 둘 다 NOT NULL |

**t_store_break** (요일별 브레이크타임 — 연중무휴 업체도 둘 수 있다)

| 컬럼 | 타입 | 비고 |
|---|---|---|
| store_break_id | varchar(32) PK `PK_StoreBreak` | |
| store_id | varchar(32) NOT NULL, FK `FK_StoreBreak_Store` (CASCADE) | |
| day_of_week | smallint | 브레이크타임이 시작하는 요일 |
| start_time · end_time | time NOT NULL | 마감이 시작보다 이르면 다음 날(23:00 ~ 02:00) |
| created_at · updated_at | timestamptz | 훅 |
| 인덱스 | `IDX_StoreBreak_StoreIdDayOfWeek (store_id, day_of_week)` | 하루 여러 개 |

## Business Rules

- **영업시간 규칙**(API 는 Phase 11 — 스키마는 이 규칙을 담을 수 있어야 한다)
  - 24시간 연중무휴는 업체 단위 `t_store.is_always_open = 1` 이다. 이때는 요일별 영업시간을 입력하지 않는다.
    - 요일 단위로 두지 않는 이유: 수요일에 쉬는 업체라면 화요일 영업이 다음 날로 넘어가며 예약될 때 연중무휴라고 볼 수 없다.
  - `is_always_open = 0` 이면 요일마다 1행이다. 영업이면 `open_time` · `close_time`, 정기휴무면 `is_closed = 1` 이고 시각은 NULL 이다.
  - **휴무가 아니면(`is_closed = 0`) `open_time` · `close_time` 은 세트로 둘 다 있어야 한다** — 하나만 있는 행은 없다. 휴무면 둘 다 NULL. DB 는 CHECK 제약 `CHK_StoreHour_OpenCloseTime` 으로 막고, Phase 11 DTO 는 짝 필드 패턴(`@ValidateIf` → 제약 → `@IsNotEmpty`)으로 함께 요구한다(.beaver/memory/data-layer.md, 사용자 결정 2026-10-24).
  - 시각은 분 단위(`HH:mm`)이고 한국 시각이다. **마감이 시작보다 이르면 다음 날 마감**이다(예: 18:00 ~ 06:00).
  - 시작과 마감이 같은 값은 쓰지 않는다. 24시간은 `is_always_open` 으로만 표현한다. 이 검증은 Phase 11 DTO 에서 한다.
  - 브레이크타임도 같은 시각 규칙이다. 다음 날로 넘길 수 있고(23:00 ~ 02:00), 시작한 요일에 속하며, 하루 여러 개를 둘 수 있다.
- **영업중 여부 `is_open`**(0: 영업중 아님, 1: 영업중 — 전환 API 는 Phase 11)
  - 업체 관리자가 사정이 있을 때 직접 바꾼다.
  - **영업중 판정 = `is_open = 1` 이고, `is_always_open = 1` 이거나 지금이 영업시간 안 · 브레이크타임 밖.** 0 이면 연중무휴로 되어 있어도 영업중 아님으로 걸러진다.
  - 업체는 이용자에게 계속 보이고, 영업중 아님으로 표시 · 필터링된다(Phase 18).
  - 총관리자의 영업중지(`store_state_id = 'SUSPEND'`)와는 다르다. 영업중지는 업체를 숨긴다.
  - 영업중 아님으로 바꿀 때 이미 받은 예약을 어떻게 처리할지는 로드맵 Open Decisions "영업중지 · 영업시간 변경 시 기존 예약" 에 함께 둔다(Phase 11).
- **위경도** — 입점 신청 때 클라이언트가 주소 검색(지도 SDK 지오코더)으로 구해 보낸다. 서버에 지오코딩 연동은 두지 않는다. 승인하면 신청 좌표를 업체로 옮긴다(Phase 9).
- **업체 공개** — 이용자에게는 `store_state_id = 'ACTIVE'` 이고 `is_deleted = 0` 인 업체만 보인다(Phase 18).
- **기존 `t_store` 행**
  - 새 시스템에서 `t_store` 를 쓰는 곳이 없어 비어 있는 것이 정상이다.
  - 혹시 행이 있으면 마이그레이션이 상태 영업중지 · 좌표 0 · 연중무휴 아님 · 영업중(`is_open` 기본 1) · 정비 0분으로 채운다. 이용자에게 노출되지 않고, 총관리자가 고친 뒤 활성으로 바꾼다.
- **서비스 간 FK 금지**(data-layer.md:31)
  - `t_store_application.user_id` 는 t_user(다른 서비스 소유)를 가리키지만 FK 없이 ID 만 둔다.
  - store 테이블끼리(신청 → 업체, 사진 · 영업시간 · 브레이크 → 업체, 업체 → 상태)는 같은 도메인이라 FK 를 건다.
- **룩업 값은 시드 한 곳** — `seeder.targets.ts` 의 `STORE_STATE_SEED_DATA` · `STORE_APPLICATION_STATE_SEED_DATA`. Phase 9 의 DTO 허용값(`@IsIn`)은 이 시드에 있어야 한다.

## Notes

- 형제 근거
  - 룩업: `t_state`(libs/database/src/entities/user/state.entity.ts:6) · `t_sms_purpose`(sms-purpose.entity.ts:6)
  - FK 선언: user.entity.ts:23-41(NOT NULL → CASCADE, NULL → RESTRICT)
  - jsonb: store.entity.ts:4 `StoreDetail`
  - 기존 행 NOT NULL 추가: 1792682222497-LoginScopeStoreDetail.ts:19-23(임시 기본값 → UPDATE → DROP DEFAULT)
  - 시드: seeder.targets.ts:22-49 · `SEED_TARGETS`:107
- 시드는 마이그레이션 뒤 user-service 가 부팅할 때 넣는다(SeederService, PK 기준 미존재 행만). 기존 `t_store` 행이 새 FK 를 만족하도록, 마이그레이션이 `SUSPEND` 룩업 행 하나를 먼저 넣는다(`ON CONFLICT DO NOTHING`). seeder 는 있는 PK 를 건너뛴다.
- `.back` 의 store(옛 모델 — 입점 신청 · 상태 · 소개 없음)와 `.beaver/output/{spec,plan,report}/store/store-{crud,register,staff}-*` 는 참고만 한다.
- 새 타입 규칙 두 가지를 data-layer.md · AGENTS.md 에 더한다.
  - 하루 안 시각 `time`(분 단위 · 다음 날 마감 규칙)
  - 좌표 `double precision`(JS number — `numeric` 은 문자열로 온다)

## Proposals (Codebase-Based)

- [x] 룩업 2개를 `t_state` · `t_sms_purpose` 와 같은 모양(구조 컬럼만 + seeder)으로 만든다 — state.entity.ts:6
- [x] 기존 행 NOT NULL 추가는 LoginScopeStoreDetail 의 임시 기본값 방식으로 한다 — 1792682222497-LoginScopeStoreDetail.ts:19-23
- [x] `t_store` 주석의 "가맹점" 을 "업체" 로 맞춘다(로드맵 용어). `t_user.store_id` 주석도 참조 PK 주석을 따라 바뀐다
- [x] 지도 범위 조회용 `IDX_Store_LatitudeLongitude` 를 미리 둔다(Phase 18 discovery)

## Decisions

- [x] 입점 신청 상태 표현 — **룩업 테이블** `t_store_application_state`(WAIT · APPROVED · REJECTED) + 시드 (사용자 결정 2026-10-24)
- [x] 편의시설 위치 — **기존 `t_store.store_detail`(jsonb) 그대로**(room_count · has_shower · has_tv · has_pc). 이번 단계에서 바꾸지 않는다 (사용자 결정 2026-10-24)
- [x] 위경도 — **신청 때 클라이언트가 보낸다**. 신청 · 업체 모두 `double precision NOT NULL`, 승인 때 옮긴다. 서버 지오코딩 없음 (사용자 결정 2026-10-24)
- [x] 영업시간 표현 — **`time` 타입, 분 단위, 영업시간 · 브레이크타임 모두 다음 날로 넘길 수 있다**(18:00 ~ 06:00 · 23:00 ~ 02:00) (사용자 결정 2026-10-24)
- [x] 24시간 연중무휴 — **업체 단위 구분값 `t_store.is_always_open`**. 1 이면 요일별 영업시간을 입력하지 않는다. `00:00 ~ 00:00` 표기는 쓰지 않는다 (사용자 결정 2026-10-24)
- [x] 영업중 여부 — **`t_store.is_open`(0: 영업중 아님, 1: 영업중, 기본 1)**. 0 이면 연중무휴로 되어 있어도 영업중 아님으로 필터링한다 (사용자 요청 2026-10-24)
- [x] 입점 신청 추가 항목 — **업체 총관리자 이름 · 사업자등록증 사진 · 신청 메모** 모두 받는다 (사용자 결정 2026-10-24)
- [x] 신청자 FK — 규약(data-layer.md:31 서비스 간 FK 금지)대로 `user_id` 는 ID 만 + 인덱스
- [x] 영업 요일의 시각 — 휴무가 아니면 `open_time` · `close_time` 둘 다 필수(세트), DB 도 CHECK `CHK_StoreHour_OpenCloseTime` 으로 막는다(프로젝트 첫 CHECK — 제약명 `CHK_<Model>_<내용>` 을 규약에 더한다) (사용자 결정 2026-10-24)
- [x] 정기휴무 — `t_store_hour.is_closed = 1`(시각 NULL). 정비시간 기본값 0분(업체 관리자가 Phase 11 에서 정한다)
- [x] 업체 상태 ID — `ACTIVE` · `SUSPEND` · `LEAVE`(t_state 의 대문자 ID 방식). `LEAVE` 상태와 기존 `is_deleted` 의 관계(삭제 방식)는 Phase 9 #40 에서 정한다
