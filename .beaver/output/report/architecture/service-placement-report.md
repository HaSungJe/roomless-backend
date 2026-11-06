# Report — service-placement

## Feature Summary
- **Feature**: 서버 위치 정리(Phase 25)다. 이용자가 쓰는 기능은 user-service 에, 업체 관리자 · 업체 총관리자 · 관리자 · 총관리자 전용 기능은 admin-service 에 둔다(사용자 결정 2026-11-07). 어긋난 13개를 옮겼다.
  - 문 소켓 처리 3개(접속 확인 · QR 확인 · 잠금 알림): admin-service room → user-service `door`
  - 이용자 입점 신청 7개(신청 · 취소 · 업체 정보 파일 등록 · 삭제 · 업로드 주소 · 내 신청 목록 · 상세): admin-service store → user-service `store`
  - 매니저 예약 3개(내 업체 예약 현황 · 업체 취소 · 호실 이동): user-service reservation → admin-service `reservation`
  - 동작 · 요청 · 응답 · 메시지 · SQL 은 그대로다. 공개 경로는 서비스 자리만 바뀐다.
- **Entry point**
  - 내부: `POST /internal/v1/user-service/door/{snapshot,verify,close}` (← `/internal/v1/admin-service/room/door-*`)
  - 공개: `/api/v1/user-service/store/application…` (← `/api/v1/admin-service/store/application…`)
  - 공개: `/api/v1/admin-service/reservation/{store, :reservation_id/store-cancel, :reservation_id/room}` (← `/api/v1/user-service/reservation/…`)
  - 명령: `user.store.application*` (← `admin.store.application*`), `admin.reservation.store-cancel` · `room-change` (← `user.reservation.*`)
- **Domain**:
  - 새 도메인: user-service `door` · `store`, admin-service `reservation`
  - 빼는 쪽: admin-service `room` · `store`, user-service `reservation`
  - 로드맵 Phase 25 의 #118 · #119 · #120 이다.
- **Plan**: [service-placement-plan.md](../../plan/architecture/service-placement-plan.md) · **Spec**: [service-placement-spec.md](../../spec/architecture/service-placement-spec.md)

## Created/Modified/Deleted Files
| File | Change Type | Description |
|------|-----------|------|
| `libs/contracts/src/door/door.commands.ts` | modified | `DOOR_INTERNAL_PATH`(snapshot · verify · close), 머리 주석 |
| `libs/contracts/src/door/dto/door-{snapshot,verify,close}.dto.ts` | moved (git mv) | `room/dto/room-door-*.dto.ts` 에서 옮겼다. 클래스 이름의 `Room` 접두만 뗐다 |
| `libs/contracts/src/room/room.commands.ts` | modified | `ROOM_INTERNAL_PATH.DOOR_*` 3개 삭제 |
| `libs/contracts/src/store/store.commands.ts` | modified | `STORE_USER_COMMAND` · `STORE_USER_INTERNAL_PATH` 추가 |
| ↳ 같은 파일 | | `STORE_COMMAND` 의 신청 4개 · `STORE_INTERNAL_PATH` 의 내 신청 3개 삭제 |
| `libs/contracts/src/reservation/reservation.commands.ts` | modified | `RESERVATION_MANAGER_COMMAND` · `RESERVATION_MANAGER_INTERNAL_PATH` 추가 |
| ↳ 같은 파일 | | `RESERVATION_COMMAND.STORE_CANCEL · ROOM_CHANGE` · `RESERVATION_INTERNAL_PATH.STORE` 삭제 |
| `apps/user-service/src/door/` (symbols · constants · interfaces · repositories · util · service · controllers · module) | created | 원본 room 코드를 옮겼다. 호실 조회는 `findDoorRoom`(room 의 `findRoom` 과 같은 본문) |
| `apps/user-service/src/store/` (symbols · constants · interfaces · repositories · util · service · controllers 2 · module) | created | admin store 의 신청자 메서드 · repository 메서드 · util 을 옮겼다. 두 앱이 다 쓰는 것은 복사했다 |
| `apps/admin-service/src/reservation/` (symbols · constants · interfaces · repositories · util · service · controllers 2 · module) | created | user-service 의 매니저 메서드를 옮겼다. 소속 업체 찾기는 room · store 와 같은 `findManagerStore(user_id, false)` |
| `apps/user-service/src/user-service.module.ts` · `apps/admin-service/src/admin-service.module.ts` | modified | `StoreModule` · `DoorModule` / `ReservationModule` 등록, 포트 사용처 주석 |
| `apps/gateway/src/api/v1/user-service/store/` · `apps/gateway/src/api/v1/admin-service/reservation/` | created | 공개 라우트(Swagger `입점 신청` · `업체 예약`). 데코레이터는 원본 그대로, 대상 서비스와 상수만 바꿨다 |
| `apps/gateway/src/gateway.module.ts` | modified | `UserStoreModule` · `AdminReservationModule`(같은 이름 도메인 모듈 — 별칭) |
| `apps/gateway/src/modules/door-socket/door-socket.server.ts` · `door-socket.util.ts` | modified | `'user'` · `DOOR_INTERNAL_PATH` · `Door*ResultDto`, 주석 |
| `apps/admin-service/src/room/**` · `apps/admin-service/src/store/**` · `apps/user-service/src/reservation/**` · 게이트웨이 `admin-service/store` · `user-service/reservation` | modified | 옮긴 핸들러 · 메서드 · repository 메서드 · util · 상수 · import 삭제, 주석 |
| ↳ user-service reservation | | `SMS_SENDER` 주입 · `users` 게터 삭제 — 매니저 기능만 쓰던 것 |
| `libs/integration/src/integration.util.ts` · `door/door-store.module.ts` · `libs/contracts/src/reservation/reservation.constants.ts` | modified | 사용처 주석 |
| `README.md` · `AGENTS.md` · `docs/{architecture,api,conventions,messaging,integration,realtime,testing}.md` · `docs/guides/redis-setup.md` | modified | 서버 설명 · 공개 경로 · 트리 · 명령 · 포트 사용처 · Smoke 목록 |
| ↳ AGENTS.md | | "기능은 쓰는 사람(행위자)으로 서버를 고른다" 규칙 + 체크리스트(메모리 `architecture.md` 반영) |

삭제한 코드(옮긴 것 말고, 원래 자리에서 쓸모가 없어진 것):
- admin room
  - `UnauthorizedException` · `Not` · `matchBcrypt` import
- admin store
  - `In` import
  - 신청자 DTO import
- user-service reservation
  - `SmsSenderInterface` · `LOGIN_SCOPE` · `RoomStateEntity` · `UserEntity` import
- 테스트 도우미
  - `createSmsSenderMock` · `SmsSenderMock` · `MANAGER_ACTOR`(user-service reservation)
  - 옮긴 메서드의 mock 키(room · store · reservation)

## Tests Written
- 기존 spec 13개를 옮겼다(git mv). 케이스 · 단언은 같고 경로 · 명령 type · 부팅 도우미만 바꿨다.
  - 문 소켓 처리: `door-snapshot` · `door-verify` · `door-close` (user-service). `[CASES:toDoorTime]` 5개는 그대로다.
  - 입점 신청 7개: `store-apply` · `store-application-*` · `store-my-application*` (user-service). 결과 type 은 `user.store.application.done` 이다.
  - 매니저 예약: `reservation-store` · `reservation-store-cancel` · `reservation-room-change` (admin-service)
- 소속 업체 찾기를 바꾼 데 맞춘 단언:
  - `findManagerStore(MANAGER_ACTOR.user_id, false)`: 현황 · 취소 · 이동 세 곳
  - 소속 업체 없음 404: `findManagerStore` 가 null(탈퇴 · 지운 업체 포함)
  - 예약자 연락처 조회: `findReservationUser({user_id})`
- repository spec 3개를 새로 만들었다. 원본 블록을 옮기고 빠진 것을 채웠다.
  - `door.repository.spec`
    - `findDoorStore` · `findDoorRoom` 의 notDeleted 와 통일 500
    - `[SMOKE:data-access]` 업체 호실 문 목록 · 문 소켓 업체 find 조건
  - `store.repository.spec`(user-service)
    - UK 400 · findStores · notDeleted 6개 · 소프트 삭제 · `deleteApplication` affected → boolean
    - 통일 500 표 12개 · 빌더 실행 3개
    - Smoke: 내 신청 목록(실제 조건 `{user_id}` — 원본의 대기 · 반려 IN 은 안 쓰는 모양이었다) · 신청 파일 행 + 별칭 · 신청 파일 삭제 UPDATE
  - `reservation.repository.spec`(admin-service)
    - 업체 · 예약자 조회 조건 · 호실 이동 배타 제약 400 · 상태 조건 boolean · QR 조회 · 수정 · 통일 500
    - Smoke: 매니저 소속 업체(잠금 있음 · 없음 — room 과 같은 SQL) · 업체 현황 호실 · 예약 + 별칭
- 원래 자리 spec 정리:
  - room · store · user-service reservation repository spec 에서 옮긴 블록을 지웠다.
  - store 의 `updateApplication · deleteApplication` it.each 를 나눴다.
- gateway 라우트 · 모듈 등록 · 경로 상수는 plan 대로 spec 이 없다(위임형).

## Verification
- `npm run typecheck` · `npm run lint`(경고 0) · `npm run build`(앱 4개) · `npm run db:check`(엔티티 변경 없음 — 일치)가 통과했다. 바뀐 ts 99개에 Prettier 를 적용했다.
- 테스트(AGENTS 허용 범위의 확인 실행): 전체 104파일 1024건 통과. 빨간 ERROR 로그는 재시도 · 실패 경로 테스트가 남기는 것이다.
  - 이전 101파일 996건에 repository spec 3파일(28건)이 늘었다.
- 옛 참조가 남지 않았는지 코드 · 문서를 grep 했다.
  - `ROOM_INTERNAL_PATH.DOOR_` · `RoomDoor*` · `admin.store.application` · `STORE_INTERNAL_PATH.my*` · `RESERVATION_COMMAND.STORE_CANCEL · ROOM_CHANGE` · `RESERVATION_INTERNAL_PATH.STORE` · `user.reservation.store-cancel` · `/api/v1/user-service/reservation/store` · `door-snapshot`: 0건
  - `.beaver/output` 의 옛 기획 문서는 기록이라 그대로 뒀다.
- plan 대비 차이:
  - plan 은 user-service store 도우미를 "SMS · DOOR 없이" 로 적었고 그대로 했다.
  - admin reservation 도우미의 `DoorStoreMock` 은 업체 취소가 쓰는 `revokeQr` 하나만 둔다(user-service 의 부분 mock 과 같은 방식).
  - gateway 의 user-service store 동기 컨트롤러에서 쓰지 않는 `ApiForbiddenResponse` import 를 뺐다.

## Remaining Issues
- **사용자 — 프론트**: 공개 경로 10개가 바뀐다.
  - 입점 신청 7개: `/api/v1/admin-service/store/application…` → `/api/v1/user-service/store/application…`
  - 매니저 예약 3개: `/api/v1/user-service/reservation/store` · `/:reservation_id/store-cancel` · `/:reservation_id/room` → `/api/v1/admin-service/reservation/…`
  - 요청 · 응답은 같다.
- **사용자 — 배포**:
  - user-service · admin-service 를 먼저, gateway 를 마지막에 새 이미지로 띄운다. gateway 가 새 명령 type 을 보내기 전에 서비스가 받을 수 있어야 한다.
  - 사이에 옛 gateway 가 보낸 옛 명령은 받을 서버가 없어 failed 로 끝난다(잠깐).
  - 마이그레이션 · compose · `.env` 변경은 없다. user-service 에는 이미 AWS 값이 닿는다.
- **문 쪽 프로그램**: 바뀌는 것이 없다(소켓 경로 · 헤더 · event 같음).
- Phase 19 체크인(#79)은 user-service `door` 의 QR 확인에 붙인다.
