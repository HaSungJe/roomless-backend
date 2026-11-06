---
# One-line feature summary (e.g. "Admin user sign-up")
feature_goal: "서버 위치 정리(Phase 25) — 이용자 기능은 user-service, 관리자 쪽 기능은 admin-service 로: 문 소켓 처리 3개 · 이용자 입점 신청 7개 → user-service, 매니저 예약 3개 → admin-service (동작 그대로)"

# Domain/module name (see AGENTS.md for the project directory structure)
domain: "user-service door(새) · store(새) / admin-service reservation(새) — admin-service room · store, user-service reservation 에서 빼기"

# Entry-point method/endpoint. Record the entry-point identifier this project actually uses,
#   derived from code evidence (path:line), in the project's own naming. Do not assume a
#   particular position's syntax. (key name "api_method" stays as-is)
api_method: "내부 HTTP POST ×3(문 소켓) · 공개 동기 GET ×2 + POST ×1 · 큐 user.store.application* ×4(이용자 입점 신청) · 공개 동기 GET ×1 + 큐 admin.reservation.* ×2(매니저 예약)"

# Path/signature (e.g. "/api/v1/user/admin/sign")
#   Record the path or signature this project actually uses, from code evidence (path:line),
#   in the project's own naming. (key name "api_path" stays as-is)
api_path: "/internal/v1/user-service/door/{snapshot,verify,close} · /api/v1/user-service/store/application… · /api/v1/admin-service/reservation/{store, :reservation_id/store-cancel, :reservation_id/room}"

# Affected state — write/persist targets. Basis for sizing the test cases. (key name "affected_data" stays as-is)
#   Record the state this project actually writes/persists, derived from code evidence (path:line),
#   in the project's own naming. Read-only reads are not "write" but are still data. Leave empty if none.
affected_data:
  - "쓰기는 지금과 같다 — 서버만 바뀐다. 스키마 · 마이그레이션 변경 없음"
  - "user-service 가 새로 쓰는 것: t_store_application · t_store_file(입점 신청 · 파일 등록 · 소프트 삭제), Redis door:<room_id>(QR 확인 열림 · 잠금), S3 private/store-application · store/application 키(업로드 주소 · 삭제)"
  - "admin-service 가 새로 쓰는 것: t_reservation · t_reservation_detail · t_payment(업체 취소 — 환불 신청 · 결제 만료) · t_reservation.room_id(호실 이동) · t_room_qr.ends_at · Redis door-qr:<room_id>(이용 중 업체 취소 — QR 끝내기)"
---

## Feature Description

이용자가 쓰는 기능은 user-service 에, 업체 관리자 · 업체 총관리자 · 관리자 · 총관리자 전용 기능은 admin-service 에 두도록 어긋난 13개를 옮긴다(사용자 결정 2026-11-07).
문 소켓 처리 3개와 이용자 입점 신청 7개는 user-service 로, 매니저 예약 3개는 admin-service 로 간다. 동작 · 요청 · 응답 · 메시지는 그대로이고, 공개 경로는 서비스 자리만 바뀐다.
Phase 19 체크인(#79)은 여기서 user-service 로 옮긴 QR 확인 안에 붙인다.

## API Spec

### A. 문 소켓 처리 → user-service `door` 도메인 (#118 — 내부 HTTP, gateway 문 소켓이 부른다)

공개 라우트 · 소켓 규격(`/ws/v1/door` · 헤더 · event)은 그대로다. gateway 문 소켓이 부르는 서버만 admin-service 에서 user-service 로 바뀐다.

| 지금 (admin-service room) | 옮긴 뒤 (user-service door) | 요청 → 응답 (DTO 이름만 Room 접두를 뗀다) |
|---|---|---|
| `POST /internal/v1/admin-service/room/door-snapshot` | `POST /internal/v1/user-service/door/snapshot` | `DoorSnapshotDto {store_id, door_secret}` → `DoorSnapshotResultDto {store_id, list: [{room_id, room_name, floor, door_state, door_changed_at}]}` |
| `POST …/room/door-verify` | `POST /internal/v1/user-service/door/verify` | `DoorVerifyDto {store_id, room_id, qr}` → `DoorVerifyResultDto {room_id, ok}` |
| `POST …/room/door-close` | `POST /internal/v1/user-service/door/close` | `DoorCloseDto {store_id, room_id}` → `DoorCloseResultDto {room_id, door_state, door_changed_at}` |

- 경로 상수 `DOOR_INTERNAL_PATH`(`libs/contracts/src/door/door.commands.ts`), DTO 는 `libs/contracts/src/door/dto/door-{snapshot,verify,close}.dto.ts` (← `libs/contracts/src/room/dto/room-door-*.dto.ts`, 필드 · 검증 · 메시지 그대로).
- admin-service 에 남는 것(업체 관리자): 호실 목록의 문 상태(`GET /api/v1/admin-service/room`) · 바로 열기(`POST /api/v1/admin-service/room/:room_id/door-open`) · 문 시크릿(`PATCH /api/v1/admin-service/store/mine/door-secret`).

### B. 이용자 입점 신청 → user-service `store` 도메인 (#119 — 이용자 가드)

| 지금 | 옮긴 뒤 | 경로 |
|---|---|---|
| `POST /api/v1/admin-service/store/application` | `POST /api/v1/user-service/store/application` | 큐 `admin.store.application` → `user.store.application` |
| `DELETE …/application/mine/:store_application_id` | `DELETE /api/v1/user-service/store/application/mine/:store_application_id` | 큐 `…-cancel` → `user.store.application-cancel` |
| `POST …/application/mine/:store_application_id/file` | `POST /api/v1/user-service/store/application/mine/:store_application_id/file` | 큐 → `user.store.application-file` |
| `DELETE …/application/mine/:store_application_id/file/:store_file_id` | `DELETE /api/v1/user-service/store/application/mine/:store_application_id/file/:store_file_id` | 큐 → `user.store.application-file-delete` |
| `GET …/application/mine` | `GET /api/v1/user-service/store/application/mine` | 동기 → `/internal/v1/user-service/store/application/mine` |
| `GET …/application/mine/:store_application_id` | `GET /api/v1/user-service/store/application/mine/:store_application_id` | 동기 → `/internal/v1/user-service/store/application/mine/:id` |
| `POST …/application/mine/:store_application_id/file/upload-url` | `POST /api/v1/user-service/store/application/mine/:store_application_id/file/upload-url` | 동기 → `/internal/v1/user-service/store/application/mine/:id/file/upload-url` |

- 요청 · 응답 DTO 는 `libs/contracts/src/store/dto/` 그대로(`StoreApplicationDto` · `StoreMyApplicationListDto` · `StoreApplicationFileDto` …).
- 규격 상수: `STORE_USER_COMMAND` · `STORE_USER_INTERNAL_PATH`(같은 `store.commands.ts`, 키 이름은 지금과 같다 — `APPLICATION` · `MY_APPLICATION_LIST` · `myApplication()` …).
- Swagger 태그 `입점 신청`(gateway `api/v1/user-service/store/`).
- admin-service 에 남는 것(총관리자): 신청 목록 · 상세 · 승인 · 반려, 업체 목록 · 상세 · 수정 · 상태 · 영업중, 내 업체 설정(업체 관리자).

### C. 매니저 예약 → admin-service `reservation` 도메인 (#120 — 매니저 가드)

| 지금 | 옮긴 뒤 | 경로 |
|---|---|---|
| `GET /api/v1/user-service/reservation/store` | `GET /api/v1/admin-service/reservation/store` | 동기 → `/internal/v1/admin-service/reservation/store` |
| `PATCH …/reservation/:reservation_id/store-cancel` | `PATCH /api/v1/admin-service/reservation/:reservation_id/store-cancel` | 큐 `user.reservation.store-cancel` → `admin.reservation.store-cancel` |
| `PATCH …/reservation/:reservation_id/room` | `PATCH /api/v1/admin-service/reservation/:reservation_id/room` | 큐 `user.reservation.room-change` → `admin.reservation.room-change` |

- 요청 · 응답 DTO 는 `libs/contracts/src/reservation/dto/` 그대로(`ReservationStoreDto` · `ReservationStoreCancelDto` · `ReservationRoomChangeDto`).
- 규격 상수: `RESERVATION_MANAGER_COMMAND` · `RESERVATION_MANAGER_INTERNAL_PATH`(같은 `reservation.commands.ts`).
- Swagger 태그 `업체 예약`(gateway `api/v1/admin-service/reservation/`).

## Business Rules

- **동작은 바꾸지 않는다**. 아래가 모두 지금 코드와 같다:
  - 검증 · 실패 메시지 · 상태 코드 · SSE 결과
  - 트랜잭션 · 쓰기 순서(외부 단계 마지막)
  - SMS 문구 · 환불 신청 · QR 끝내기 · 소프트 삭제 · 저장소 파일 삭제
  - Data-Access SQL
  - 예외는 아래 "매니저 소속 업체 찾기" 하나다.
- **옮긴 기능은 원래 자리에서 지운다** — 같은 명령 type 이 두 서버에 등록되지 않는다. 옛 경로 · 옛 명령은 남기지 않는다(호환 경로 없음).
  - 옛 `GET /api/v1/admin-service/store/application/mine` 은 총관리자 신청 상세(`/application/:id`, 관리자 가드)에 걸린다. 이용자 토큰이면 401, 관리자 토큰이면 id 형식 400 이다.
- **도메인 간 데이터 접근** — 옮긴 쪽 repository 가 공유 DB 표를 자기 도메인 어휘로 직접 다룬다.
  - user-service `store`: `t_store_application` · `t_store_file` · `t_store_file_purpose` · `t_store`
  - user-service `door`: `t_store` · `t_room` · `t_room_group`
  - admin-service `reservation`: `t_reservation` · `t_reservation_detail` · `t_payment` · `t_room_qr` · `t_room` · `t_room_group` · `t_store` · `t_user`
  - 앱끼리 import 는 없다. 두 쪽이 다 쓰는 repository 메서드 · util · 메시지는 각 앱에 따로 둔다(도메인 상수는 import 하지 않는 규칙).
- **매니저 소속 업체 찾기(admin-service reservation)** — 옆 도메인(room · store)과 같은 방식을 쓴다. 매니저 → 업체 조인으로 탈퇴 · 지운 업체를 빼고 찾는다(`findManagerStore(user_id, false)`, 잠금 없음 — 지금도 잠그지 않는다).
  - 지금 user-service 는 회원 행의 `store_id` 만 본다.
  - 탈퇴 업체의 매니저는 이미 정지(BLOCK)라 매니저 가드에서 401 이다(store.service.ts 업체 상태 변경). 그래서 실제 응답은 달라지지 않는다.
  - 없으면 지금과 같은 404 `소속 업체를 찾을 수 없습니다.`
- **서버가 쓰는 포트** — 새로 붙이는 모듈은 없다.
  - user-service: `StorageModule`(입점 신청 파일 — 업로드 주소 · 존재 확인 · 삭제 · 서명 열람 주소) · `DoorStoreModule`(문 소켓)이 이미 전역이다.
  - admin-service: `SmsModule`(업체 취소 · 호실 이동 SMS) · `DoorStoreModule`(QR 끝내기)이 이미 전역이다.
  - compose 의 AWS 값은 user-service 에 이미 닿는다(`compose.user-service.yml` 은 AWS 를 비우지 않는다).
- **브로커** — `user.store.*` 는 `q.user.cmd`(`user.#`), `admin.reservation.*` 는 `q.admin.cmd`(`admin.#`)로 간다. 큐 · 바인딩 · 계정 권한은 바꾸지 않는다.
- **배포 순서** — user-service · admin-service 를 먼저, gateway 를 마지막에 새 이미지로 띄운다(gateway 가 새 명령 type 을 보내기 전에 서비스가 받을 수 있게).

## TDD Cases

기존 spec 을 그대로 옮긴다. 케이스 · 단언은 같고, 경로 · 명령 type · 부팅 도우미만 바뀐다. 새 계산 유닛은 없다.

- [CASES:toDoorTime] 지금(UTC) → 문 시각(한국 yyyyMMddHHmmss) — 기존 `DOOR_TIME_CASES` 그대로(문 소켓 잠금 spec)
- [FAIL:validation] 문 소켓 접속 — 업체 ID 형식 · 시크릿 15자 · 시크릿 특수문자 → 400, 업체 조회 없음
- [FAIL:validation] 문 소켓 QR 확인 · 잠금 — 업체 ID · 호실 ID · QR 형식 → 400, 호실 조회 없음
- [FAIL:validation] 입점 신청 파일 업로드 주소 · 내 신청 상세 — 신청 ID · 용도 · MIME 형식 → 400
- [FAIL:validation] 업체 예약 현황 날짜 형식 · 업체 취소 사유 없음 → 400
- [FAIL:duplicate] 입점 신청 — 같은 사업자번호의 대기 신청 · 등록 업체 → 400 validation_errors.business_number
- [FAIL:duplicate] 호실 이동 — 옮길 호실 점유 겹침(배타 제약) → failed 400, SMS 없음
- [SECURITY] actor 없는 명령 → failed 401 · 내부 토큰 없는 요청 → 403
- [SMOKE:data-access] 옮긴 쿼리의 SQL 그대로:
  - 문 소켓 업체(find 조건) · 업체 호실 문 목록
  - 신청 파일 삭제(UPDATE) · 내 신청 목록 · 신청 파일 행
  - 업체 현황 호실 · 예약
  - + admin-service reservation 의 매니저 소속 업체(조인 · 탈퇴 제외)
- 테스트 생략(위임형): gateway 라우트 · 모듈 등록 · contracts 경로 상수 — 프로젝트 규칙상 gateway · controller spec 을 두지 않는다

## Notes

- 근거 코드 — 옮기는 쪽:
  - 문 소켓 처리: `apps/admin-service/src/room/room.service.ts:812-872` · `controllers/room.controller.ts:82-107` · `repositories/room.repository.ts:778-825`
  - 입점 신청: `apps/admin-service/src/store/store.service.ts:133-380`
  - 매니저 예약: `apps/user-service/src/reservation/reservation.service.ts:560-707`
  - gateway 문 소켓: `apps/gateway/src/modules/door-socket/door-socket.server.ts:109,154,157`
- user-service `door` 도메인은 Phase 14 ~ 15 사이에 있었다(3a67e43 ~ c7aafbb, HTTP 문 열기 · 닫기). 이번에는 문 소켓 처리만 담는다.
- 메모리 규칙 `.beaver/memory/architecture.md` — 기능은 행위자로 서버를 고른다. AGENTS.md Architecture 절에도 이번 변경에서 반영한다(사용자 승인 2026-11-07).
- 프론트(Next.js)는 공개 경로 10개를 고친다(입점 신청 7 · 매니저 예약 3). 문 쪽 프로그램은 바뀌는 것이 없다.

## Proposals (Codebase-Based)

- [x] 옮긴 기능의 같은 이름 도메인을 행위자 서버에 둔다 — user-service `store`(이용자 입점 신청) · admin-service `reservation`(매니저 예약). 규격 파일은 contracts 의 그 도메인 파일 하나에 두고 상수 이름으로 가른다(`STORE_USER_*` · `RESERVATION_MANAGER_*`)
- [x] 매니저 소속 업체는 admin-service 옆 도메인의 `findManagerStore` 방식을 따른다(room.repository.ts:81-113 · store.repository.ts:567-592)

## Decisions

- [x] 문 소켓 처리 위치 — user-service 새 `door` 도메인(사용자 결정 2026-11-07)
- [x] 이용자 입점 신청 · 매니저 예약도 이번에 옮긴다(사용자 결정 2026-11-07)
- [x] 옮기기만 하는 Phase 를 이용(Phase 19) 앞에 따로 둔다(사용자 결정 2026-11-07)
- [x] 공개 경로는 서비스 자리만 바꾼다 · 명령 `user.store.application*` · `admin.reservation.*`(사용자 결정 2026-11-07)
- [x] 규칙 저장 + AGENTS.md 반영(사용자 결정 2026-11-07)
