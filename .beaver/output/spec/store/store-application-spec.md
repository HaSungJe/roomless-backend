---
# One-line feature summary
feature_goal: "업체 입점·관리(Phase 9) — 이용자의 입점 신청 · 업체 정보 파일(사업자등록증 1 · 업체 사진 5) · 내 신청, 총관리자의 신청 목록 · 상세 · 승인(업체 + 업체 총관리자 계정 + 안내 SMS) · 반려, 업체 목록 · 상세 · 수정 · 상태 변경"

# Domain/module name
domain: "store"

# Entry-point method/endpoint
api_method: "게이트웨이 /api/v1/admin-service/store (동기 7 · 큐 7) → admin-service store 도메인(내부 HTTP /internal/v1/admin-service/store · RabbitMQ admin.store.*)"

# Path/signature
api_path: "/api/v1/admin-service/store/application(…) · /api/v1/admin-service/store(/:store_id)"

# Affected state
affected_data: ["t_store_application (신청 · 승인 · 반려 — head_manager_name 삭제 · head_manager_phone → owner_phone)", "t_store_file (새 — 업체 정보 파일, 신청 때 등록 · 승인 때 업체 지정)", "t_store_file_purpose (새 용도 룩업 + is_private + 시드)", "t_store_image (삭제 — t_store_file 로 합침)", "t_store_application.business_license_image_key (삭제)", "t_store (승인 때 등록 · 수정 · 상태 · 탈퇴 마스킹)", "t_user (승인 때 업체 총관리자 계정 · 탈퇴 때 그 업체 매니저 정지)", "S3 (private/store-application/… · store/application/…)"]
---

## Feature Description

로드맵 Phase 9(#37 ~ #41). admin-service 에 **store 도메인**을 새로 만든다. 게이트웨이 경로는 `/api/v1/admin-service/store` 이고, 신청자 라우트는 이용자 가드, 나머지는 관리자 가드로 가른다(경로 규칙 — 로그인 그룹은 가드로).

- **입점 신청(이용자)** — 업체 정보를 먼저 등록하고, 그 신청에 업체 정보 파일을 붙인다(사용자 결정 2026-10-26).
  - 신청자 한 명은 대기 중 신청을 **1건**만 가질 수 있다.
  - 업체 정보 파일은 **사업자등록증 사진 1장 · 업체 사진 최대 5장**이고, 대기 중일 때만 추가 · 삭제한다. 파일은 신청이 아니라 **업체의 정보**다 — 승인하면 같은 행이 그 업체의 파일이 된다(`t_store_file`, 사용자 결정 2026-10-26).
  - 파일은 presigned URL 로 클라이언트가 S3 에 직접 올리고, 서버에는 키만 등록한다.
- **내 신청(이용자)** — 대기 · 반려 신청만 보인다. **승인되면 목록 · 상세 어디에서도 보이지 않는다** — 신청자는 그 업체 정보를 알 수 없다.
- **신청 관리(총관리자)**
  - 목록 · 상세. 상세에는 업체 정보 파일 열람 주소와 신청자 정보가 들어간다.
  - **승인**: 업체(`t_store`) 등록, 신청의 업체 정보 파일에 `store_id` 지정, 업체 총관리자 계정(매니저 그룹 `HEAD_MANAGER`) 생성, 아이디 · 임시 비밀번호 SMS.
  - **반려**: 사유를 남긴다.
- **업체 관리(총관리자)** — 목록 · 상세 · 정보 수정 · 상태 변경(활성 · 영업중지 · 탈퇴). **삭제 API 는 없다**(사용자 결정 2026-10-26 — 상태로만 관리).
- **스키마 보정**(마이그레이션 `StoreFile`)
  - Phase 8 의 `t_store_application.business_license_image_key` 와 `t_store_image` 를 지운다(사용처 · 데이터 없음).
  - 업체 정보 파일 `t_store_file` 과 용도 룩업 `t_store_file_purpose`(+ `is_private`)를 둔다.
  - 파일은 용도를 FK 로 가리키고, 비공개 여부는 용도 룩업이 정한다(사용자 결정 2026-10-26).
- **인프라 보정**
  - 저장소 포트에 비공개 파일 열람 주소(presigned GET)를 더한다.
  - 공개 이미지는 CDN(CloudFront)으로 보낸다 — 가이드를 CloudFront 기본 구성(OAC 가 공개 접두사 `store/*` 만 읽음)으로 바꾼다.
  - 게이트웨이 내부 HTTP 에 쿼리 문자열을 더한다(첫 목록 API).

## API Spec

게이트웨이 `@Controller('/api/v1/admin-service/store')` — 동기는 `controllers/store.controller.ts`(InternalHttpClient → admin-service 내부 HTTP), 큐는 `controllers/store.controller.queue.ts`(CommandStreamService → `admin.store.*` + 요청 단위 SSE).

| # | Method | Path | 가드 | 경로 | 결과(done data · 응답) |
|---|---|---|---|---|---|
| 1 | POST | `/application` | 이용자 | 큐 `admin.store.application` | `{store_application_id}` |
| 2 | GET | `/application/mine` | 이용자 | 동기 | `{list, pagination}` — 대기 · 반려만 |
| 3 | GET | `/application/mine/:store_application_id` | 이용자 | 동기 | 신청 상세 + 업체 정보 파일(열람 주소) — 승인 신청은 404 |
| 4 | POST | `/application/mine/:store_application_id/file/upload-url` | 이용자 | 동기 | `{file_key, upload_url, expires_at}` |
| 5 | POST | `/application/mine/:store_application_id/file` | 이용자 | 큐 `admin.store.application-file` | `{store_file_id}` |
| 6 | DELETE | `/application/mine/:store_application_id/file/:store_file_id` | 이용자 | 큐 `admin.store.application-file-delete` | null |
| 7 | GET | `/application` | 관리자 | 동기 | `{list, pagination}` — 상태 · 검색어 |
| 8 | GET | `/application/:store_application_id` | 관리자 | 동기 | 신청 상세 + 신청자 + 업체 정보 파일(열람 주소) |
| 9 | PATCH | `/application/:store_application_id/approve` | 관리자 | 큐 `admin.store.application-approve` | `{store_id, login_id}` |
| 10 | PATCH | `/application/:store_application_id/reject` | 관리자 | 큐 `admin.store.application-reject` | null |
| 11 | GET | `/` | 관리자 | 동기 | `{list, pagination}` — 상태 · 검색어 |
| 12 | GET | `/:store_id` | 관리자 | 동기 | 업체 상세 + 업체 정보 파일(열람 주소) |
| 13 | PATCH | `/:store_id` | 관리자 | 큐 `admin.store.update` | null |
| 14 | PATCH | `/:store_id/state` | 관리자 | 큐 `admin.store.state` | null |
| 15 | DELETE | `/application/mine/:store_application_id` | 이용자 | 큐 `admin.store.application-cancel` | null — 신청 취소(삭제) |

- Method · Path: 위 표. 내부 경로는 `/internal/v1/admin-service/store/…` 로 같은 모양이다(`STORE_INTERNAL_PATH`).
- Request
  - #1: `store_name` · `business_number`(숫자 10자리) · `owner_name`(대표자명) · `owner_phone`(대표자 휴대폰 번호) · `phone`(업체 연락처) · `address` · `address_detail?` · `latitude` · `longitude` · `application_comment?`
  - #4: `store_file_purpose_id`(BUSINESS_LICENSE · STORE_IMAGE) · `content_type`(image/jpeg · image/png)
  - #5: `store_file_purpose_id` · `file_key` · `file_name` · `content_type`
  - #10: `reject_comment`
  - #13: `store_name` · `owner_name` · `phone` · `address` · `address_detail?` · `latitude` · `longitude`
  - #14: `store_state_id`(ACTIVE · SUSPEND · LEAVE)
  - 목록 #2 · #7 · #11: `PaginationDto`(+ #7 `store_application_state_id?` · `keyword?`, #11 `store_state_id?` · `keyword?`)
- Response: 실패는 공통 `ApiFailResultDto`. 큐 경로는 SSE `accepted → done | failed | pending`.

## Business Rules

- **신청(#1)**
  - 대기 중 신청이 있는 신청자 → 400 `이미 대기 중인 입점 신청이 있습니다.`
  - 같은 사업자번호의 대기 신청 또는 등록 업체가 있으면 400 `이미 신청 · 등록된 사업자등록번호입니다.`(`validation_errors.business_number`)
  - 위경도는 클라이언트가 주소 검색으로 구해 보낸다(Phase 8 결정).
- **업체 정보 파일(#4 · #5 · #6)** — 내 신청 · 대기 중일 때만. 아니면 404(남의 신청 · 승인 신청 — 존재를 드러내지 않는다) · 400(반려).
  - 용도별 한도: 사업자등록증 1 · 업체 사진 5. 넘치면 400.
  - 파일은 용도 룩업(`t_store_file_purpose`)을 FK 로 가리키고, **비공개 여부 `is_private` 는 그 룩업에 둔다**(사용자 결정 2026-10-26).
    - 사업자등록증 1, 업체 사진 0.
    - 열람 주소는 파일 종류가 아니라 이 값으로 고른다 — 1 이면 서명된 열람 주소(presigned GET, 10분), 0 이면 CDN(CloudFront) 공개 주소. 조회는 용도를 조인해 읽는다.
  - 저장 키는 서버가 용도의 비공개 여부로 만든다:
    - 비공개(사업자등록증) `private/store-application/<신청 ID>/<uuid>.<jpg|png>` — CDN 이 읽지 못한다
    - 공개(업체 사진) `store/application/<신청 ID>/<uuid>.<jpg|png>` — CDN
  - 파일은 항상 새 키로 올리고 같은 키를 덮어쓰지 않는다. 그래서 CDN · 브라우저 캐시를 길게 두고 무효화하지 않는다.
  - 등록(#5) 때 키 접두사가 그 신청 · 용도와 맞는지, S3 에 실제로 올라갔는지(`exists`) 확인한다.
  - 삭제(#6)는 행을 지운 뒤 S3 객체를 지운다(마지막 단계).
- **내 신청(#2 · #3)** — 승인(APPROVED) 신청은 목록에서 빼고 상세는 404. 반려 신청은 사유 · 업체 정보 파일까지 보인다.
- **신청 취소(#15)** — 내 신청 · 대기 중일 때만(아니면 404 · 반려 400). 취소는 **삭제**다 — 목록 · 상세에 남지 않는다(사용자 결정 2026-10-26).
  - 한 트랜잭션에서 업체 정보 파일 행(아직 업체에 붙지 않은 것 — `store_id IS NULL`) → 신청 행(대기 조건) 순으로 지운다. 파일 FK 가 RESTRICT 라 파일이 먼저다.
  - S3 파일은 마지막에 지운다. 503 이면 재시도된다.
- **동시 처리** — 승인 · 반려는 신청 상태를 **대기 조건으로** 바꾸고, 취소는 대기 조건으로 지운다. 그 사이 다른 쪽(취소 · 승인 · 반려)이 먼저 처리했으면 0건이라 400 `대기 중인 입점 신청만 처리할 수 있습니다.` → 트랜잭션 전체 롤백(승인은 업체 · 계정 · SMS 없음).
- **승인(#9)** — 대기 중 신청만. 한 트랜잭션, SMS 는 마지막.
  1. 사업자등록증 1장이 있어야 한다. 없으면 400.
  2. 신청자 계정(이용자 그룹)에서 성별 · 생년월일을 복사한다(사용자 결정). 신청자가 없으면 400.
  3. 업체 등록: `store_state_id = ACTIVE` · **`is_open = 0`(영업준비 — 업체가 준비 후 수동으로 영업중 전환, Phase 11 #94)** · 신청의 업체 정보 · 위경도 · `store_detail = {}` · 연중무휴 0 · 정비 0. 사업자번호 UK 충돌 → 400.
  4. 신청의 업체 정보 파일 → 같은 행에 `store_id` 를 채운다(파일을 옮기거나 복사하지 않는다 — 업체 사진은 등록 순서 = 정렬 순서, 첫 장 대표).
  5. 업체 총관리자 계정
     - `auth_id = HEAD_MANAGER` · `login_scope = MANAGER` · `store_id` · `state_id = ACTIVE`
     - 아이디 무작위(`m` + 숫자 8자리, 겹치면 다시 — 사용자 결정)
     - 임시 비밀번호(bcrypt) · `is_password_change_required = 1`
     - **대표자 = 업체 총관리자** — 이름 · 닉네임은 대표자명, 휴대폰 = 대표자 휴대폰 번호(매니저 그룹 UK — 충돌 400)
  6. 신청 → APPROVED · `store_id` · `reviewed_at`.
  7. SMS(대표자 휴대폰 번호): 업체명 · 아이디 · 임시 비밀번호.
- **반려(#10)** — 대기 중 신청만. REJECTED · `reject_comment` · `reviewed_at`. 업체 정보 파일은 남긴다(신청자가 사유와 함께 본다).
- **업체 수정(#13)** — 상호명 · 대표자명 · 연락처 · 주소 · 상세주소 · 위경도. 사업자번호는 바꾸지 않는다. 탈퇴 업체 → 400.
- **상태 변경(#14)** — ACTIVE · SUSPEND · LEAVE. 같은 상태 → 400, 탈퇴(LEAVE) 업체 → 400(되돌리지 않는다).
  - **탈퇴로 바꾸면** 한 트랜잭션에서 세 가지를 한다.
    - 그 업체 매니저 계정(매니저 그룹 · `store_id`)을 **정지(BLOCK)** 로 바꿔 로그인 등 모든 기능을 막는다(`block_comment` `업체 탈퇴로 이용이 정지되었습니다.`).
    - 사업자번호를 `DELETE_<store_id>` 로 마스킹한다 — 같은 번호로 다시 입점 신청할 수 있다.
    - 원래 값은 `delete_backup`(JSON)에 둔다.
  - **영업중지(SUSPEND)** 는 매니저 계정을 그대로 둔다(사용자 결정 2026-10-26).
  - 영업중지 · 탈퇴 때 미래 예약 처리는 예약 기능(Phase 17)이 생길 때 정한다(Open Decisions).
- **목록(#2 · #7 · #11)** — 첫 목록 API 라 미적용 규약을 이대로 적용한다(conventions.md "Query DTO" · data-layer.md "Pagination").
  - Query DTO 는 `extends PaginationDto` + 생성자. 컨트롤러는 `const dto = new XListDto(query);`.
  - 순서는 count → `Pagination` → 목록이고, 응답은 `{list, pagination}` · 정렬은 `created_at DESC`.
  - 검색어는 부분 일치(ILike, `%` · `_` 이스케이프)다. 신청은 상호명 · 사업자번호, 업체는 상호명 · 사업자번호 · 대표자명.
  - 이 조건은 매핑 민감이라 Data-Access Smoke 대상이다.
- **응답 필드 생략 금지** — 없으면 null.

## Notes

- 형제 근거
  - 도메인 구성: manager 도메인(apps/admin-service/src/manager/ — module · symbols · service · repository · interfaces · util · controllers 2종 · test helper)
  - 계정 · 임시 비밀번호 · SMS: manager.service.ts `confirmPasswordReset`(임시 비밀번호 bcrypt · 변경 필요 표시 · SMS 마지막)
  - 다른 도메인 테이블: AGENTS.md "도메인 간 데이터 접근" — store repository 가 t_user 를 store 어휘(`findApplicant` · `insertHeadManager` · `updateStoreManagers`)로 직접 다룬다(service → service ❌). 로드맵 #39 의 "store 도메인에서 할지 manager 도메인 repository 로 할지" 는 이 규약으로 닫는다.
  - 저장소 포트: libs/integration/src/interfaces/integration.interface.ts:44 `StorageGatewayInterface`(업로드 · 확인 · 공개 주소 · 삭제)
  - 목록 규약: docs/conventions.md:110 Query DTO · docs/data-layer.md:171 Pagination · libs/common/src/dto/pagination.dto.ts · libs/common/src/utils/pagination.ts
  - 게이트웨이 내부 HTTP: apps/gateway/src/modules/transport/internal-http.client.ts:17 `InternalRequestOptions`(쿼리 없음 → 더한다)
- 캐시 무효화(Phase 23, .beaver/memory/cache.md): 업체 탈퇴가 매니저 상태를 바꾼다 → `cache-spec.md` 무효화 지점 표에 더한다.
- 이번 Phase 는 마이그레이션을 더한다 — Phase 12 · 22(마이그레이션)와 동시에 돌리지 않는다(로드맵 Notes).

## Proposals (Codebase-Based)

- [x] store 도메인을 manager 도메인 구성 그대로 만든다(module · symbols · service · repository · interfaces · util · constants · controllers 2종 · test helper)
- [x] 승인의 계정 생성 · 탈퇴의 매니저 정지는 store repository 가 t_user 를 직접 다룬다(AGENTS.md 도메인 간 데이터 접근)
- [x] 임시 비밀번호 · bcrypt 는 `libs/account` · `libs/common` util 을 그대로 쓴다(generateTemporaryPassword · getBcrypt)
- [x] 파일 용도는 룩업 테이블(`t_store_file_purpose` — 형제 `t_sms_purpose`), 비공개 여부는 그 룩업의 동작 플래그(형제 `t_state.is_login_allowed`) · 조회는 용도 조인(형제 `buildLoginManagerQuery`)
- [x] 위경도 검증에 `@IsLatitude()` · `@IsLongitude()` 를 쓴다 — 지금 허용 데코레이터(IsNotEmpty · IsOptional · IsIn · Matches · MaxLength)로는 숫자 좌표를 검증할 수 없다. conventions.md 허용 목록에 더한다
- [x] 파라미터가 있는 내부 경로는 contracts 의 경로 함수(`STORE_INTERNAL_PATH.myApplication(id)`)로 만든다 — 게이트웨이가 경로 문자열을 직접 이어 붙이지 않게 한다. conventions.md 규격 상수 항목에 더한다

## Decisions

- [x] 업체 총관리자 아이디 — **무작위 생성**(`m` + 숫자 8자리, 겹치면 다시) · 임시 비밀번호 SMS (사용자 결정 2026-10-26)
- [x] 업체 총관리자 성별 · 생년월일 — **신청자 계정에서 복사** (사용자 결정 2026-10-26)
- [x] **대표자 = 업체 총관리자** — 신청서에 업체 총관리자 이름 · 번호를 따로 받지 않고 대표자명 · 대표자 휴대폰 번호(`owner_phone`)를 쓴다. Phase 8 의 `head_manager_name` 삭제 · `head_manager_phone` → `owner_phone`(RENAME) (사용자 결정 2026-10-26)
- [x] 파일 — **업체 정보 파일 `t_store_file`** 하나(사업자등록증 1장 · 업체 사진 5장), 신청 등록 뒤 신청에 붙이고 대기 중에만 추가 · 삭제, 승인 때 같은 행에 `store_id`. Phase 8 의 `t_store_image` 는 지운다 (사용자 결정 2026-10-26)
- [x] 용도 룩업 **`t_store_file_purpose`** 를 FK 로 가리키고, **`is_private` 는 그 룩업에** — 사업자등록증 1(`private/` + presigned GET) · 업체 사진 0(`store/` + CDN) (사용자 결정 2026-10-26)
- [x] 공개 파일은 **CDN(CloudFront)** 공개 주소. CloudFront 를 기본 구성으로 둔다(OAC · 공개 접두사만 · 퍼블릭 액세스 차단 모두 켬 · 긴 캐시 · 새 키로만 업로드). 앱 코드는 `AWS_S3_PUBLIC_URL` 만 CloudFront 도메인 (사용자 결정 2026-10-26)
- [x] 신청자 열람 — **승인되면 목록에서도 빼고 그 업체 정보를 알 수 없게**, 대기 중 신청은 **1건만** (사용자 결정 2026-10-26)
- [x] 업체 삭제 — **삭제 API 없음**, 상태(ACTIVE · SUSPEND · LEAVE)로만 관리 (사용자 결정 2026-10-26)
- [x] 승인 직후 — **활성 + 영업준비(`is_open = 0`)**, 업체가 수동으로 영업중 전환 (사용자 결정 2026-10-26)
- [x] 매니저 계정 — **업체 탈퇴 때만 정지(BLOCK)**, 영업중지는 그대로 (사용자 결정 2026-10-26)
- [x] 탈퇴는 되돌리지 않는다 · 사업자번호 `DELETE_<store_id>` 마스킹 + `delete_backup` · 같은 상태 변경 400 (Claude 제안 — 검토)
- [x] 승인 조건 사업자등록증 정확히 1장 · 업체 사진 0 ~ 5장 · 형식 image/jpeg · image/png (Claude 제안 — 검토)
- [x] 입점 신청 취소 — **대기 중 내 신청만, 삭제**(신청 · 업체 정보 파일 행 + S3 파일). 취소한 신청은 목록 · 상세에 남지 않는다 (사용자 결정 2026-10-26)
- [x] 승인 신청은 지금처럼 신청자 목록에서 뺀다 — 신청과 업체 정보가 다른 테이블이라 그대로 둔다 (사용자 재확인 2026-10-26)
- [x] 반려 사유 필수 · 반려 SMS 없음 (Claude 제안 — 검토)
- [x] 업체 수정 대상에서 사업자번호 제외 (Claude 제안 — 검토)
