---
# One-line feature summary
feature_goal: "업체 운영 설정(Phase 11) — 업체 관리자(업체 총관리자 · 업체 관리자)가 자기 업체의 상세를 보고, 소개 · 편의시설 · 연락처 · 사진(순서 포함), 요일별 영업시간(휴무 · 연중무휴), 매일 브레이크타임(서로 겹침 없음), 정비시간, 영업중 여부, 일시 예약불가(일시 범위)를 설정한다"

# Domain/module name
domain: "store"

# Entry-point method/endpoint
api_method: "게이트웨이 /api/v1/admin-service/store/mine… (동기 3 · 큐 10, 매니저 가드) → admin-service store 도메인(내부 HTTP /internal/v1/admin-service/store/mine… · RabbitMQ admin.store.mine-*)"

# Path/signature
api_path: "/api/v1/admin-service/store/mine · /mine/{profile,hours,breaks,maintenance,open} · /mine/file(/upload-url · /order · /:store_file_id) · /mine/unavailable-period(/:store_unavailable_period_id)"

# Affected state
affected_data: ["t_store (introduction · phone · store_detail · is_always_open · maintenance_minutes · is_open)", "t_store_hour (요일별 영업시간 — 통째로 교체)", "t_store_break (day_of_week 삭제 — 매일 브레이크타임, 통째로 교체)", "t_store_unavailable_period (새 — 일시 예약불가 시작 일시 ~ 종료 일시)", "t_store_file (업체 사진 STORE_IMAGE — 등록 · 삭제 · 순서)", "S3 (store/<store_id>/… 공개 · CDN)"]
---

## Feature Description

로드맵 Phase 11(#44 · #45 · #46 · #47 · #94 + 새 유닛 일시 예약불가). 업체 관리자가 **자기 업체**(`t_user.store_id`)를 다룬다 — 경로는 `/api/v1/admin-service/store/mine…`(store 도메인), 매니저 가드만(업체 총관리자 · 업체 관리자 모두 — 로드맵 역할 표). 업체를 입력으로 받지 않고 actor 로 찾는다.

- **내 업체 상세(#44)** — 업체 정보 · 업체코드 · 영업 설정 · 요일별 영업시간 · 브레이크타임 · 업체 정보 파일(열람 주소).
- **업체 소개(#45)** — 소개 · 연락처 · 편의시설(`store_detail` — 방 칸수 · 샤워실 · TV · PC), **업체 사진** 업로드 주소 · 등록 · 삭제 · 순서 변경(첫 장이 대표). 상호명 · 주소 · 위경도 · 사업자번호는 총관리자 몫(Phase 9 업체 수정)이라 여기서 바꾸지 않는다.
- **영업시간 · 브레이크타임(#46)**
  - 영업시간은 **요일별**(`t_store_hour`) + 업체 단위 **24시간 연중무휴**(`is_always_open`). 요일마다 영업 또는 **휴무**(`is_closed` 0/1)다(사용자 결정 2026-10-27 — "휴무" 는 이 0/1 설정이다).
  - 브레이크타임은 **요일과 상관없이 매일** 같은 시작 ~ 종료 목록이고, **서로 겹치면 안 된다**(사용자 결정 2026-10-27). Phase 8 의 `t_store_break.day_of_week` 를 지운다.
- **정비시간(#47)** — 퇴실 후 다음 이용까지 막는 분.
- **영업중 여부(#94)** — 영업중 · 영업중 아님(`is_open`). 0 이면 연중무휴 · 영업시간과 무관하게 영업중 아님.
- **일시 예약불가(새 유닛)** — 시작 일시 ~ 종료 일시(분 단위) 범위를 여러 개 두어 그 시간에 예약을 받지 않는다(예: 2026-11-02 09:00 ~ 18:00). 서로 겹치면 안 된다(사용자 결정 2026-10-27). 로드맵 후순위 "특정 날짜 임시휴무" 를 이 이름으로 당긴다.
  - 범위마다 **메모**(선택, 30자)를 남길 수 있다 — 간단한 사유(예: 내부 공사)를 적는 칸이다(사용자 결정 2026-10-27).
  - **그 범위에 걸리는 기존 예약은 취소하지 않고 특수 표시**를 한다 — 예약 기능(Phase 17)이 생길 때 구현한다(사용자 결정 2026-10-27, Open Decision 해결).

## API Spec

게이트웨이 `@Controller('/api/v1/admin-service/store')`(기존 store 컨트롤러 2개) — 모두 `PassportJwtManagerAuthGuard`(그룹 안 권한 없음).

| # | Method | Path | 경로 | 결과(done data · 응답) |
|---|---|---|---|---|
| 1 | GET | `/mine` | 동기 | 내 업체 상세 |
| 2 | PATCH | `/mine/profile` | 큐 `admin.store.mine-profile` | null |
| 3 | POST | `/mine/file/upload-url` | 동기 | `{file_key, upload_url, expires_at}` |
| 4 | POST | `/mine/file` | 큐 `admin.store.mine-file` | `{store_file_id}` |
| 5 | DELETE | `/mine/file/:store_file_id` | 큐 `admin.store.mine-file-delete` | null |
| 6 | PUT | `/mine/file/order` | 큐 `admin.store.mine-file-order` | null |
| 7 | PUT | `/mine/hours` | 큐 `admin.store.mine-hours` | null |
| 8 | PUT | `/mine/breaks` | 큐 `admin.store.mine-breaks` | null |
| 9 | PATCH | `/mine/maintenance` | 큐 `admin.store.mine-maintenance` | null |
| 10 | PATCH | `/mine/open` | 큐 `admin.store.mine-open` | null |
| 11 | GET | `/mine/unavailable-period` | 동기 | `{list, pagination}` — 끝나지 않은 것, 시작 순 |
| 12 | POST | `/mine/unavailable-period` | 큐 `admin.store.mine-unavailable-period` | `{store_unavailable_period_id}` |
| 13 | DELETE | `/mine/unavailable-period/:store_unavailable_period_id` | 큐 `admin.store.mine-unavailable-period-delete` | null |

- 내부 경로 `/internal/v1/admin-service/store/mine…`(`STORE_INTERNAL_PATH.MINE` · `MINE_FILE_UPLOAD_URL` · `MINE_UNAVAILABLE_PERIOD_LIST`). `/mine…` 라우트는 `/:store_id` 보다 먼저 선언한다.
- Request
  - #2: `introduction?`(2,000자) · `phone`(숫자 8 ~ 11자리) · `store_detail` `{room_count?(0 ~ 100), has_shower?(0/1), has_tv?(0/1), has_pc?(0/1)}` — store_detail 은 통째로 교체
  - #3: `content_type`(image/jpeg · image/png) — 용도는 업체 사진(STORE_IMAGE) 고정
  - #4: `file_key` · `file_name` · `content_type`
  - #6: `store_file_ids`(업체 사진 ID 전부, 원하는 순서)
  - #7: `is_always_open`(0/1) · `hours`(연중무휴 0 이면 요일 7개 `{day_of_week(0 일 ~ 6 토), is_closed(0/1), open_time?, close_time?}`, 1 이면 빈 배열) — 시각 `HH:mm`
  - #8: `breaks`(최대 10개 `{start_time, end_time}`, 빈 배열이면 모두 지움) — 시각 `HH:mm`
  - #9: `maintenance_minutes`(0 ~ 240)
  - #10: `is_open`(0/1)
  - #11: `PaginationDto`
  - #12: `starts_at` · `ends_at`(`YYYY-MM-DD HH:mm`, 한국 시각, 분 단위) · `memo?`(30자 — 간단한 사유)
- Response(#1): `store_id` · `store_code` · `store_state_id` · `store_name` · `business_number` · `owner_name` · `phone` · `address` · `address_detail` · `latitude` · `longitude` · `introduction` · `store_detail` · `is_always_open` · `is_open` · `maintenance_minutes` · `hours[{day_of_week, is_closed, open_time, close_time}]`(HH:mm, 휴무 null) · `breaks[{store_break_id, start_time, end_time}]` · `files[]`(열람 주소 — 사진 CDN · 사업자등록증 서명) · `updated_at`
- Response(#11 항목): `store_unavailable_period_id` · `starts_at` · `ends_at`(ISO 8601) · `memo` · `created_at`

## Business Rules

- **공통** — 매니저 가드 뒤에서 service 가 actor(`user_id`)로 그 매니저의 업체를 찾는다(store repository `findStoreByManager` — `t_store` 에 `t_user` 매니저 그룹을 조인). 없거나 탈퇴 업체면 404 `소속 업체를 찾을 수 없습니다.`. 업체 총관리자 · 업체 관리자 모두 같다(탈퇴 업체 매니저는 정지라 가드에서도 막힌다). 영업중지 업체도 설정은 바꿀 수 있다.
  - **쓰기는 업체 행을 잠근다**(`FOR UPDATE OF s`) — 같은 업체의 설정 쓰기는 한 번에 하나라, 동시에 온 교체 · 등록이 겹침 검사 · 한도를 함께 통과하지 못한다(브레이크타임 교체 두 건이 합쳐지는 경우 등). 조회는 잠그지 않는다.
- **소개(#2)** — 소개 · 연락처 · 편의시설만 바꾼다. 편의시설은 받은 항목만으로 `store_detail` 을 다시 쓴다(빠진 항목은 지운다).
- **업체 사진(#3 ~ #6)** — 용도는 업체 사진(STORE_IMAGE, 공개 · CDN)만. 사업자등록증은 바꾸지 않는다.
  - 키 `store/<store_id>/<uuid>.<jpg|png>`(서버가 만든다 · 새 키로만 — 접두는 신청 파일처럼 용도 룩업의 `is_private` 로 고른다), 한도 5장(승인 때 넘어온 사진 포함), 등록 때 키 모양 · 실제 업로드(`exists`) 확인, 정렬 순서 = 지금 사진의 가장 큰 순서 + 1(없으면 0 — 삭제로 빈 번호가 있어도 마지막에 붙는다).
  - 삭제는 행 → 저장소 파일(마지막). 남은 사진의 정렬 순서는 그대로(빈 번호 허용 — 순서만 쓴다).
  - 순서 변경은 그 업체의 업체 사진 ID **전부**를 원하는 순서로 받는다 — 빠지거나 남거나 겹치면 400. 0 번째가 대표.
- **영업시간(#7)** — 통째로 교체한다(요일 행을 지우고 다시 넣는다).
  - 연중무휴 1 → 요일 행을 모두 지운다(`hours` 는 비어 있어야 — 아니면 400).
  - 연중무휴 0 → 일 ~ 토 7개가 정확히 한 번씩(아니면 400 `validation_errors.hours`).
  - 휴무가 아닌 요일은 **open_time · close_time 둘 다**(세트 — .beaver/memory/data-layer.md), 휴무면 둘 다 NULL 로 저장(보낸 시각은 버린다). DTO 는 짝 필드 패턴(`@ValidateIf(휴무 아님)` → 제약 → `@IsNotEmpty`).
  - 시작 = 마감은 400 — 24시간은 연중무휴 플래그로만(사용자 결정 2026-10-27). 마감이 시작보다 이르면 다음 날 마감이다.
- **브레이크타임(#8)** — 매일 적용, 통째로 교체. 최대 10개.
  - 시작 = 마감은 400. 마감이 시작보다 이르면 다음 날까지(23:30 ~ 00:00 · 23:00 ~ 02:00).
  - **서로 겹치면 400 `브레이크타임이 서로 겹칩니다.`**(`validation_errors.breaks`) — 반열린 구간이라 끝점끼리 맞닿는 것은 겹침이 아니다(09:00 ~ 09:30 + 09:30 ~ 10:00). 입력 순서와 무관.
  - 영업시간 밖에 있어도 막지 않는다 — 예약 가능 시간 계산(Phase 17)에서 빠질 뿐이다.
- **정비시간(#9)** · **영업중 여부(#10)** — 값만 바꾼다. 영업중 여부는 같은 값이면 400 `이미 같은 상태입니다.`(업체 상태 변경과 같은 모양).
- **일시 예약불가(#11 ~ #13)**
  - 입력은 한국 시각 `YYYY-MM-DD HH:mm`(분 단위). 없는 날짜(02-30 등)는 400.
  - 시작 < 종료, 종료가 지금 이후(이미 끝난 범위는 400). 시작이 과거인 것은 된다(진행 중인 범위).
  - 그 업체의 다른 일시 예약불가와 **겹치면 400** `다른 일시 예약불가와 겹칩니다.` — 반열린 구간(맞닿음은 허용).
  - 목록은 끝나지 않은 것(`end_at > 지금`)만, 시작 순. 삭제는 그 업체 것만(아니면 404). 수정은 삭제 후 다시 등록.
  - 걸리는 기존 예약의 특수 표시는 Phase 17.
- **응답 필드 생략 금지** — 없으면 null.

## Notes

- 형제 근거
  - 신청 파일 흐름(업로드 주소 · 키 모양 · exists · 한도 · 삭제 마지막): apps/admin-service/src/store/store.service.ts `createMyApplicationFileUploadUrl` · `addMyApplicationFile` · `removeMyApplicationFile`
  - 상태 같은 값 400: store.service.ts `changeStoreState`
  - 목록: store.service.ts `getStoreList`(count → Pagination → 목록), Smoke `buildStoreListQuery`
  - 다른 도메인 테이블: store repository `findApplicant`(t_user 를 store 어휘로)
  - 영업시간 CHECK: libs/database/src/entities/store/store-hour.entity.ts `CHK_StoreHour_OpenCloseTime`
- 이번 Phase 는 마이그레이션을 더한다(`t_store_break.day_of_week` 삭제 · `t_store_unavailable_period`) — 다른 마이그레이션 Phase(12 · 14 · 16 · 22)와 동시에 돌리지 않는다.
- 캐시(Phase 23): 업체 정보 · 영업 설정은 discovery(Phase 18) 캐시 후보 — 여기 쓰기들을 cache-spec 무효화 지점 표에 더한다.
- 로드맵: Phase 11 에 "일시 예약불가" 유닛 추가 · 후순위 "특정 날짜 임시휴무" 정리 · Open Decision(영업중지 · 영업시간 변경 · 영업중 아님 전환 시 기존 예약) 해결 표시 — ship 때.

## Proposals (Codebase-Based)

- [x] `/mine` 은 store 도메인(store 컨트롤러 · service · repository)에 둔다 — 업체 테이블의 소유 도메인이고 로드맵 예상 경로와 같다. 매니저 → 업체는 store repository 가 `t_user` 를 `findStoreManager` 로 읽는다(AGENTS.md 도메인 간 데이터 접근)
- [x] 검증 규약 확장 — 배열 입력 `@IsArray` · `@ArrayMaxSize` · `@ValidateNested({each: true})` + `@Type(() => 항목 DTO)`, 숫자 범위 `@IsInt` · `@Min` · `@Max`(사용자 결정 2026-10-27). `validationExceptionFactory` 가 중첩 오류를 `hours.0.open_time` 경로로 펼치게 고친다(지금은 첫 단만 봐서 중첩이면 '실패했습니다.')
- [x] 한국 시각 분 단위 일시는 dayjs(이미 의존성 1.11.23)로 읽는다 — `customParseFormat` strict 로 없는 날짜(02-30)를 거르고 `timezone` 으로 한국 시각을 그 순간으로 바꾼다. 날짜 파싱 util 을 직접 만들지 않는다(사용자 결정 2026-10-27)
- [x] 날짜 · 시각 처리를 dayjs 로 통일 — 플러그인을 붙인 `libs/common/src/utils/dayjs.ts` 하나에서 가져오고, 직접 만든 계산(kst.ts `kstDayStart` · `kstYear` 삭제, refresh · SMS 만료 `getTime()` 비교, `* 60 * 1000` 만료 시각, JWT exp, 브레이크 겹침의 분 계산)을 dayjs 로 바꾼다. 이 Phase 의 파일 집합이 user-service · manager · admin · scheduler · libs(account · common · integration)로 넓어진다 (사용자 결정 2026-10-27)
- [x] 영업시간 · 브레이크 · 일시 예약불가 조회는 관계 필드 where · 정렬이라 QueryBuilder 빌더 + Data-Access Smoke
- [x] memory `data-layer`(영업시간 세트 규칙)를 이번에 docs/data-layer.md · conventions.md(짝 필드 패턴 사례)로 옮긴다(261026 리뷰 결정 — Phase 11 때)

## Decisions

- [x] 기존 예약 처리 — 일시 예약불가 범위에 걸리는 기존 예약은 취소하지 않고 특수 표시, 예약 기능(Phase 17) 때 구현 (사용자 결정 2026-10-27)
- [x] "휴무" = 요일별 0/1(`is_closed`), 일시 범위 기능은 **일시 예약불가**라는 이름의 새 기능 (사용자 결정 2026-10-27)
- [x] 일시 예약불가 — 겹침 금지 · 분 단위 (사용자 결정 2026-10-27)
- [x] 일시 예약불가 메모 — 선택, 30자, 간단한 사유를 남기는 칸(`memo` — 설계의 `reason` 255자를 대신한다) (사용자 결정 2026-10-27)
- [x] 브레이크타임 — 요일 없이 매일, 서로 겹침 금지, `day_of_week` 삭제 (사용자 결정 2026-10-27)
- [x] 영업시간 시작 = 마감 — 허용하지 않음(24시간은 연중무휴 플래그) (사용자 결정 2026-10-27)
- [x] 업체 사진 — 업로드 · 등록 · 삭제 + 순서 변경 (사용자 결정 2026-10-27)
- [x] 검증 규약 확장(중첩 · 숫자 범위) (사용자 결정 2026-10-27)
- [x] 브레이크 겹침 판정 TDD 케이스 11개 (사용자 결정 2026-10-27 — Test Cases)
- [x] 매니저 가드만(업체 총관리자 · 업체 관리자 모두), 영업중지 업체도 설정 변경 가능 (Claude 제안 — 검토)
- [x] 한도 — 소개 2,000자 · 방 칸수 0 ~ 100 · 정비시간 0 ~ 240분 · 브레이크 10개 · 사진 5장 (Claude 제안 — 검토)
- [x] 일시 예약불가 — 종료가 지금 이후만 등록(시작은 과거 가능), 목록은 끝나지 않은 것만, 수정 없이 삭제 후 재등록 (Claude 제안 — 검토)
- [x] 응답 일시는 다른 API 와 같이 ISO 8601, 입력만 한국 시각 `YYYY-MM-DD HH:mm` (Claude 제안 — 검토)
- [x] 일시 예약불가 컬럼명 `starts_at` · `ends_at` — 앞으로 올 시각이라 `expires_at` 과 같은 꼴(docs/data-layer.md 컬럼 이름 규칙에 더한다) (Claude 제안 — 검토)
- [x] 쓰기는 업체 행 잠금(`FOR UPDATE OF s`), 탈퇴 업체는 소속 업체 없음과 같은 404 (Claude 제안 — 검토)
- [x] 중첩 검증은 큐 경로라 게이트웨이에서만 돈다 — 영업시간 · 브레이크타임 spec 의 `[FAIL:validation]` 은 게이트웨이와 같은 ValidationPipe 설정에 DTO 를 직접 통과시켜 점 경로(`hours.0.open_time`)를 단언한다(다른 자리가 없다) (Claude 제안 — 검토)
- [x] 테스트 — 정비시간 · 일시 예약불가 삭제는 위임형이라 spec 생략, 기준선에서 찾은 기존 실패 4건(Phase 9 · 10 — store Smoke 스냅샷 3 · 입점 신청 목록 페이지 기대값 1)을 같은 변경에서 고친다 (Claude 제안 — 검토)
