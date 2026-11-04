# Report — door-manage

## Feature Summary
- **Feature**: 문 관리 · QR 확인(Phase 15). 업체 관리자는 호실 목록에서 문 상태(열림 · 잠금 · 마지막 시각)를 보고 호실 문을 바로 열 수 있다. 이용자는 이용 시간 안에서만 내 예약 QR 을 받는다. QR 이 없으면 그때 발급하고, scheduler 가 매분 맞춘다. QR 이력은 DB `t_room_qr` 에, 호실의 현재 QR 은 Redis 에 둔다. 업체 총관리자는 문 소켓 시크릿을 정한다. 문 쪽 타 업체 프로그램은 gateway 의 표준 WebSocket 문 소켓에 붙어 QR 을 확인받고, 잠금을 알리고, 바로 열기 명령을 받는다. 업체가 이용 중 예약을 취소하면 QR 을 바로 막는다. HTTP 문 열기 · 닫기 API(#109)는 없앴다.
- **Entry point**:
  - **공개** — `GET /api/v1/admin-service/room`(#110 문 상태 추가 · 매니저) · `POST /api/v1/admin-service/room/:room_id/door-open`(#111 · 매니저 · 동기) · `GET /api/v1/user-service/reservation/:reservation_id/qr`(#112 · 이용자 · 동기) · `PATCH /api/v1/admin-service/store/mine/door-secret`(#114 · 업체 총관리자 · 큐 `admin.store.mine-door-secret`)
  - **소켓** — `WS /ws/v1/door`(#115 · 헤더 `x-store-id` · `x-store-secret`)
  - **내부** — `/internal/v1/admin-service/room/door-snapshot` · `/door-verify` · `/door-close`
  - **crontab** — `reservation.qr-sync`(scheduler · 1분)
  - **삭제** — `POST /api/v1/user-service/door/open` · `/close`
- **Domain**: admin-service room · store, user-service reservation(door 도메인 삭제), scheduler reservation, gateway modules/door-socket, libs/integration door · redis (로드맵 Phase 15 — #110 · #111 · #112 · #114 · #115)
- **Plan**: [door-manage-plan.md](../../plan/door/door-manage-plan.md) · **Spec**: [door-manage-spec.md](../../spec/door/door-manage-spec.md)

## Created/Modified/Deleted Files
| File | Change Type | Description |
|------|-----------|------|
| `libs/database/src/entities/door/room-qr.entity.ts` · `entities.ts` | created · modified | `t_room_qr`(PK · FK 2 · `UK_RoomQr_Qr` · `UK_RoomQr_ReservationId` · `IDX_RoomQr_RoomId` · `CHK_RoomQr_StartsEndsAt`) |
| `libs/database/src/entities/store/store.entity.ts` | modified | `door_secret varchar(100)` nullable(bcrypt 해시) |
| `libs/database/src/migrations/1793801220826-RoomQrDoorSecret.ts` · `migrations.ts` | created · modified | `db:generate` — 테이블 1 · 컬럼 1(제약명 UK_ 확인) |
| `libs/integration/src/door/redis-door.store.ts` · `door-store.module.ts` · `interfaces/integration.interface.ts` · `integration.constants.ts` · `integration.util.ts` | modified | 포트 다시 쓰기: `getMany` · `setQr`(PXAT) · `revokeQr` · `verify` · `open`(SET + PUBLISH) · `close` · `subscribe`. Lua 3개, `door-commands` 채널, `toDoorTime` 을 user-service 에서 옮김, QR 색인 · 발급 상수 삭제 |
| `libs/integration/src/redis/redis.connection.ts` | modified | 구독 전용 연결 `subscribe(channel, listener)`, 종료 때 닫기 |
| `libs/contracts/src/door/door.commands.ts` | modified | 내부 경로 삭제 → 소켓 경로 · 헤더 · event 6종 |
| `libs/contracts/src/room/*` · `reservation/*` · `store/*` | created · modified | 내부 경로 4 · DTO 5(바로 열기 · 접속 확인 · QR 확인 · 잠금 · 내 예약 QR) · 시크릿 DTO · 명령 `MINE_DOOR_SECRET` · 호실 목록 `door_state` · `door_changed_at` · 내 업체 `is_door_secret_set` |
| `apps/admin-service/src/room/*` | modified | service public 4개 추가(`openMyRoomDoor` · `getDoorSnapshot` · `verifyDoorQr` · `closeDoor`). 목록 문 상태(MGET)를 붙이고, repository 에 `findDoorStore` · `findStoreDoorRoomRows` · `buildStoreDoorRoomRowsQuery` 추가, 내부 HTTP 4개 |
| `apps/admin-service/src/store/*` · `admin-service.module.ts` | modified | `changeMyStoreDoorSecret`(업체 행 잠금 · bcrypt), 큐 핸들러, 상세의 `is_door_secret_set`, `DoorStoreModule` |
| `apps/user-service/src/reservation/*` · `user-service.module.ts` | modified | `getMyReservationQr`(`judgeReservationQr` 판정 → 발급 `ON CONFLICT DO NOTHING` → 다시 읽기 → `setQr`). 업체 취소 때 이용 중이면 `ends_at` = 지금 + `revokeQr`(SMS 보다 먼저). `DoorModule` 제거 |
| `apps/user-service/src/door/` (13개) | deleted | HTTP 문 열기 · 닫기 도메인 |
| `apps/scheduler/src/reservation/*` · `scheduler.module.ts` | created · modified | `reservation-qr-sync.crontab.ts`(운영 전용 · JobLock · 건별 실패 건너뜀), `buildRoomQr`, QR 대상 · 조회 · 발급 repository, `DoorStoreModule` |
| `apps/gateway/src/modules/door-socket/` (server · util · module) · `gateway.module.ts` | created · modified | 표준 WebSocket(`ws` noServer + HttpAdapterHost upgrade). 업그레이드 전 401 · 404 · 503 거절, 업체별 연결 묶음, verify → 답 · closed → 무응답, `door-commands` 구독 → 그 업체 연결에 `door.open`, 30초 ping, 종료 때 1001 |
| `apps/gateway/src/api/v1/admin-service/room/…/room.controller.ts` · `store/…/store.controller.queue.ts` · `user-service/reservation/…/reservation.controller.ts` | modified | 바로 열기 · 시크릿(`RolesGuard` + `@Roles(HEAD_MANAGER)` + 403) · 내 예약 QR 라우트 |
| `apps/gateway/src/api/v1/user-service/door/` · `libs/contracts/src/door/dto/` | deleted | 문 공개 라우트 · DTO |
| `docker/nginx/gateway.conf` · `compose.gateway.yml` · `compose.admin-service.yml` · `compose.scheduler.yml` · `.env.example` | modified | `/ws/` 업그레이드(120초), `REDIS_URL` 필수(gateway · admin-service · scheduler), gateway 를 `roomless-data` 에 연결, Redis 절 주석 |
| `package.json` · `package-lock.json` | modified | `ws` · `@types/ws` |
| 테스트 — admin-service room · store, user-service reservation, scheduler reservation | created · modified | 아래 Tests Written |
| `README.md` · `AGENTS.md` · `docs/architecture.md` · `docs/integration.md` · `docs/guides/redis-setup.md` · `docs/data-layer.md` · `docs/testing.md` · `docs/realtime.md` | modified · created | 문 API 삭제 · 문 소켓 절(event 표) · Redis 를 쓰는 앱 4개 · 키 모양 · `t_room_qr` · `ON CONFLICT DO NOTHING` 규칙 · Smoke 목록 · 실시간 소켓 규약(초안 마커 유지 — ship 이 확정) |

## Tests Written
- `reservation-qr.spec.ts`(user-service) — `[CASES:judgeReservationQr]` 10개(확정 시작 정각 포함 · 끝 정각 제외 · 시작 전 · 6. QR 없음 → 발급 · 이용 중 · 결제 대기 · 취소 · 1박 날짜 넘김 등)
  - 성공 3개: 있는 QR + Redis 다시 쓰기 · 발급(유효 = 이용 시작 ~ 끝, 32자 서로 다름) · 발급 경합(다시 읽은 값)
  - 실패: 404 · 다시 읽어도 없음 500 · Redis 503 · DTO
- `reservation-store-cancel.spec.ts` — 이용 중 취소: DB 끝 = 지금 + `revokeQr`, 둘 다 SMS 보다 먼저. 그 밖에 시작 전 · 이미 끝난 QR 은 건너뜀, `revokeQr` 503 은 재시도 + SMS 없음.
- `reservation.repository.spec.ts`(user-service · scheduler) — QR 조회 조건 · 통일 500. Smoke 는 QR 발급 `INSERT … ON CONFLICT DO NOTHING`, 그리고 scheduler QR 대상(이용 중 + QR 왼쪽 조인 — 같은 시각은 `$3` 하나).
- `room-door-open.spec.ts` — 성공(포트 인자 · 응답) · `[CASES:toDoorTime]` 5개 · 소속 업체 404 · 호실 404 · DTO.
- `room-door-snapshot.spec.ts` — 성공(조건 `Not('LEAVE')` · bcrypt 비교 · MGET 순서 · 층 숫자). 업체 없음 · 시크릿 미설정 · 불일치는 모두 같은 401(뒤 호출 없음). DTO 3.
- `room-door-verify.spec.ts` — ok true · ok false(200) · 다른 업체 호실 404 · Redis 503 · DTO 3.
- `room-door-close.spec.ts` — 성공 · `[CASES:toDoorTime]` 5개 · 404 · DTO 2.
- `room-list.spec.ts` — 문 상태가 같은 순서로 붙는다 · 빈 페이지 · Redis 503 이면 목록도 503.
- `room.repository.spec.ts` — `findDoorStore` notDeleted · 500, `findStoreDoorRoomRows` 통일 500. Smoke 는 업체 호실 문 목록 SQL(별칭 = `RoomDoorRow` 키 · LIMIT 없음)과 `findDoorStore` find 조건(`!= $2` · `is_deleted = $3`).
- `store-mine-door-secret.spec.ts` — 업체 행 잠금 · bcrypt 해시만 `updateStore` · 404(해시 · 수정 없음) · DTO 4(15자 · 65자 · 특수문자 · 빈 값).
- `store-mine.spec.ts` · `store.repository.spec.ts` · `room.repository.spec.ts` — `is_door_secret_set`, `t_store` select 스냅숏에 `door_secret`.
- 게이트웨이 소켓 서버 · util · crontab · 어댑터 · 엔티티는 plan 대로 spec 없음(AGENTS Testing).

## Verification
- `npm run typecheck` · `npm run lint`(경고 0) · `npm run build`(4개 앱) · `npm run db:check`(엔티티 ↔ 마이그레이션 일치)가 모두 통과했다. 바뀐 ts 는 Prettier 적용.
- 테스트(AGENTS 허용 범위의 확인 실행): 전체 97파일 920건 통과. 실패는 새 Smoke 자리표시자(실행 출력으로 채움) · snapshot spec 의 층 값 타입(문자열 → 숫자)뿐이었다.
- `docker compose -f <각 묶음> config --quiet` — 임시 폴더에 compose 와 더미 `.env` 를 복사해 4개 묶음을 확인했다(실제 `.env` 는 열지 않음). `REDIS_URL` 을 빼면 gateway 묶음이 뜨지 않는 것도 확인했다.
- 지운 코드 참조 검색(`DoorService` · `DoorModule` · `user-service/door` · `DOOR_INTERNAL_PATH` · `issueQr`) — apps · libs · docs · 설정에 0건. 남은 곳은 Phase 14 의 지난 기획 · 보고 문서뿐이다.
- plan 대비 차이:
  - `DOOR_TIME_CASES` 를 user-service door 도우미에서 room 테스트 도우미로 옮겨 바로 열기 · 잠금 spec 이 함께 쓴다.
  - realtime.md 에 "경우별 결과" 표를 더했다.
  - `.env.example` 의 Redis 절 주석도 고쳤다(plan 파일 목록 밖, 설명만).

## Remaining Issues
- **사용자 — 배포**: 마이그레이션 `RoomQrDoorSecret` 적용(`ReservationBooking` 뒤 — 새 테이블 `t_room_qr` · `t_store.door_secret` 컬럼만, 기존 데이터는 바뀌지 않는다). gateway · admin-service · scheduler 도 이제 `REDIS_URL` 이 필요하다(`.env` 그대로 전달). 네 앱 묶음을 새 이미지로 다시 띄운다(gateway-lb 는 `/ws/` 설정 때문에 다시 만든다).
- **사용자 — 문 쪽 프로그램 연동 규격 변경**: HTTP 문 열기 · 닫기가 없어지고 문 소켓으로 바뀐다(README "문 소켓"). 업체 총관리자가 먼저 시크릿을 정해야 붙을 수 있다.
- **사용자 — 소켓 직접 확인 순서**(소켓 서버는 spec 이 없다):
  1. 업체 총관리자 로그인 → `PATCH /api/v1/admin-service/store/mine/door-secret` 로 시크릿 저장
  2. `wscat -c ws://localhost:3000/ws/v1/door -H "x-store-id: <업체 ID>" -H "x-store-secret: <시크릿>"` → 접속 직후 `door.snapshot`. 헤더를 틀리면 401 로 끊긴다.
  3. 이용 시간 중인 확정 예약으로 `GET /api/v1/user-service/reservation/:id/qr` → QR 받기
  4. 소켓에 `{"event":"door.verify","data":{"room_id":"…","qr":"…"}}` → `door.verified ok: true`, 틀린 QR 은 `ok: false`
  5. `{"event":"door.closed","data":{"room_id":"…"}}` → 답 없음, 호실 목록의 문 상태가 잠금으로 바뀜
  6. 매니저 `POST /api/v1/admin-service/room/:room_id/door-open` → 그 업체 소켓에 `door.open`
  7. 엉터리 JSON → `error 400`. 30초 뒤 ping 이 오는지 본다.
- QR 동기화 crontab 은 운영(`NODE_ENV=production`)에서만 돈다. 로컬에서는 내 예약 QR 조회가 발급 · Redis 쓰기를 맡는다.
- 지운 호실의 Redis 문 키(`door:` · `door-qr:`)는 남는다. 값만 남고 목록 · 소켓은 DB 호실 기준이라 동작에는 영향이 없다. 정리는 필요할 때 따로 한다.
- Phase 19 #79(체크인 = 첫 입장)는 이번 QR 확인(`door.verify ok`)에 연결한다. 로드맵 #79 문구를 그에 맞게 고쳤다.

## Change - 261105-1

### Change summary
ship 리뷰([main-review-261105.md](../../review/main-review-261105.md)) Finding 1 · 2 수정(사용자 결정 2026-11-05 — 둘 다 고치고 재리뷰).
- **시크릿을 바꾸면 그 업체 문 소켓을 끊는다**: 문 포트에 `disconnect(store_id)` 를 더했다. Redis 채널 `door-commands` 로 `{store_id, command: 'disconnect'}` 를 보낸다.
  - `changeMyStoreDoorSecret` 가 해시를 저장한 뒤 마지막 단계에서 부른다.
  - gateway 는 그 업체의 자기 연결을 모두 1008 `store secret changed` 로 끊는다. 옛 시크릿으로 붙은 연결은 남지 않는다.
- **docs/data-layer.md 문구 수정**: QueryBuilder insert 도 `execute()` 때 `@BeforeInsert` 가 돈다(`callListeners` 기본값). 코드는 원래 맞았다.

### Changed files
| File | Change Type | Description |
|------|-----------|------|
| `libs/integration/src/integration.constants.ts` · `interfaces/integration.interface.ts` · `door/redis-door.store.ts` | modified | `DOOR_COMMAND.DISCONNECT`. `DoorCommand` = `DoorOpenCommand` \| `DoorDisconnectCommand`. 포트 `disconnect` 추가(PUBLISH), 구독 메시지가 두 명령을 읽는다 |
| `apps/admin-service/src/store/store.service.ts` | modified | `DOOR_STORE` 주입, 시크릿 저장 뒤 `disconnect` |
| `apps/gateway/src/modules/door-socket/door-socket.server.ts` · `door-socket.util.ts` | modified | `applyCommand` → 바로 열기 · 연결 끊기, `DOOR_SOCKET_SECRET_CHANGED_CLOSE`(1008) |
| `apps/admin-service/src/store/test/store.test-helper.ts` · `store-mine-door-secret.spec.ts` · `apps/admin-service/src/room/test/room.test-helper.ts` | modified | 문 포트 mock(store 부팅 두 경로) · 연결 끊기 순서 · 404 미호출 · Redis 503 재시도 |
| `README.md` · `AGENTS.md` · `docs/realtime.md` · `docs/integration.md` · `docs/guides/redis-setup.md` · `docs/data-layer.md` | modified | 연결 끊기 명령 · 경우별 결과 행 · 훅 문구 |

### Tests written
- `store-mine-door-secret.spec.ts`:
  - `disconnect(STORE_ID)` 1번 — `updateStore` 뒤에 부른다(호출 순서 단언).
  - 소속 업체 404 면 부르지 않는다.
  - Redis 503 이면 첫 전달은 requeue, 마지막 전달은 dead + failed 503.

### Verification
- `npm run typecheck` · `npm run lint`(경고 0) · `npm run build` · `npm run db:check` 통과, 바뀐 ts Prettier 적용.
- 전체 테스트 97파일 통과(아래 재리뷰 문서에 건수).

### Remaining issues
- 없음(Info 3건은 리뷰 문서대로 지금 구조 유지).
