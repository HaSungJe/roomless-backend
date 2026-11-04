# Review — main — 261105

> Pre-merge code review. Check the accumulated changes against the memory rules, AGENTS.md conventions, and the plan/spec intent.
> Location: `.beaver/output/review/` — `<stick>-review-<YYMMDD>.md` (stick = branch name with `/`→`-`, one per ship unit). For a re-review on the same day, append `-<N>`.

## Target
- stick: 해당 없음(direct mode) → origin: `main`
- Included features: 문 관리 · QR 확인(로드맵 Phase 15 — #110 · #111 · #112 · #114 · #115). 들어간 것:
  - 호실 목록 문 상태 · 호실 문 바로 열기 · 내 예약 QR(이력 `t_room_qr` + Redis 현재 QR) · QR 동기화 crontab
  - 업체 문 시크릿 · gateway 문 소켓(표준 WebSocket) · 업체 취소 때 QR 막기
  - HTTP 문 열기 · 닫기 삭제 · 마이그레이션 `RoomQrDoorSecret`
- Change scope: 수정 66 · 삭제 15 · 새 파일 20(gateway 소켓 3 · contracts DTO 6 · 엔티티 · 마이그레이션 · crontab · spec 6 · realtime.md · spec · plan · report). 추적 중인 파일만 세면 `git diff HEAD` 81파일 1568+ / 887−

## Convention Check (against AGENTS.md)
| Item | Result | Notes |
|------|------|------|
| Naming | pass | DTO `room-door-*.dto.ts` · `reservation-qr.dto.ts` · `store-mine-door-secret.dto.ts`, 명령 `admin.store.mine-door-secret`, crontab `reservation-qr-sync.crontab.ts`, 인프라 `door-socket.<role>.ts`, 엔티티 `t_room_qr` · 제약 `UK_RoomQr_*` · `CHK_RoomQr_StartsEndsAt`(생성된 마이그레이션의 UK 이름 확인) |
| Structure & layering | pass | controller(동기 · 큐 파일 분리) → service → repository, crontab → repository(scheduler 에만). 소켓은 gateway `modules/door-socket` 에만 두고 판단은 admin-service 내부 HTTP. 포트는 `DOOR_STORE` 하나, 앱끼리 import 없음 |
| Shared logic extraction | pass | service private 헬퍼 0. QR 판정 · 응답은 `reservation.util.ts`, 문 항목은 `room.util.ts`, 문 시각 `toDoorTime` 은 `libs/integration` util 로 옮김, 소켓 해석 · 메시지는 `door-socket.util.ts`. 날짜 비교는 모두 dayjs |
| Errors & responses | pass | 접속 확인 실패는 이유를 가르지 않는 401, 문 소켓 업그레이드 거절도 공통 실패 본문. QR 불일치는 실패가 아니라 `ok: false`. Redis 503 은 잡지 않음, 업체 취소의 QR 막기는 SMS 보다 먼저. 응답 null 필드 생략 없음(`is_door_secret_set` 0/1) |
| Test strength | pass | `[CASES:judgeReservationQr]` 10 · `[CASES:toDoorTime]` 5 × 2. 호출 인자 · 엔티티 값 · 미호출 단언, 401 세 갈래가 모두 같은 본문, 발급 경합(다시 읽기) · Redis 503 |
| Data-Access Smoke | pass | 새 매핑 민감 메서드 모두 SQL 고정: `buildStoreDoorRoomRowsQuery` · `findDoorStore`(find 조건 `Not`) · `buildInsertRoomQrQuery` ×2(ON CONFLICT) · `buildQrSyncTargetsQuery`. `t_store.door_secret` 이 늘어 업체 select 스냅숏 2곳 갱신 |
| memory | pass | `.beaver/output` 커밋 포함(git). cache 항목(미반영)은 캐시 코드가 생기는 Phase 23 후보라 제안하지 않음 |
| 기타 규약 | pass | README · AGENTS · docs 6개 · `.env.example` 를 같은 변경에서 갱신, mock 어댑터 없음, crontab 운영 가드 · `JobLockService`, compose 는 `REDIS_URL` 필수(`${VAR:?}`) |
| 초안 규약 확정 | done | `docs/realtime.md` · AGENTS "실시간 소켓" 절 · 체크리스트 줄을 코드와 대조했다(업그레이드 직접 수신 · 헤더 인증 · `{event, data}` · Lua PUBLISH · 구독 전용 연결 · ping 30초 · 1001 · nginx 120초). 맞아서 `beaver:draft` 마커를 지움 |

## Intended Behavior Check (against plan/spec)
- **#110 문 상태**: 그 페이지 호실만 MGET 1번, 받은 순서대로 붙임, 빈 페이지는 Redis 에 묻지 않음. Redis 503 이면 목록도 503(호실 목록에 합친 결정).
- **#111 바로 열기**: 내 업체의 지워지지 않은 호실만. 상태 쓰기와 `door-commands` PUBLISH 가 Lua 1개, gateway 가 그 업체 연결에만 `door.open`.
- **#112 내 예약 QR**: 확정 · 이용 중 + [start_at, end_at) 안에서만. 없으면 발급하고(`ON CONFLICT DO NOTHING` → 다시 읽기), 늘 Redis 에 `setQr`(PXAT = 끝).
  - scheduler 가 매분 발급 · 다시 쓰기를 한다(운영 전용 · JobLock · 건별 실패 건너뜀).
  - 업체가 이용 중 예약을 취소하면 DB `ends_at` = 지금 + `revokeQr`.
  - 호실 이동은 시작 전 확정만이라 QR 이 생기기 전이다(이동 뒤 QR 이 옛 호실에 남는 경우 없음 — 확인함).
- **#114 시크릿**: 업체 총관리자만(RolesGuard + 403), 업체 행 잠금 아래 bcrypt 해시만 저장, 원문은 돌려주지 않는다.
- **#115 소켓**:
  - 경로가 다르면 404, 헤더 모양이 틀리면 401(서비스에 묻지 않음), 서비스 확인 실패는 그 상태 코드로 업그레이드 전에 거절.
  - 메시지에는 접속 때 확인한 업체 ID 를 붙인다.
  - verify 만 답하고 closed 는 무응답, 잘못된 메시지는 `error 400`.
- 빠진 것 · 잘못 구현된 것 없음. plan 과 다른 점은 report 에 기록(`DOOR_TIME_CASES` 위치 · realtime.md 경우별 표 · `.env.example` 주석).
- 리뷰 확인: TypeORM `InsertQueryBuilder.execute()` 는 `callListeners` 기본값(true)으로 값 엔티티에 `@BeforeInsert` 를 부른다 — QR 발급의 `created_at` · `updated_at` 은 훅이 채운다(NOT NULL 위반 없음).

## Findings
| # | Severity | Location (path:line) | Description | Recommendation |
|---|--------|-----------------|------|------|
| 1 | Medium | `apps/admin-service/src/store/store.service.ts` `changeMyStoreDoorSecret` · `apps/gateway/src/modules/door-socket/door-socket.server.ts` | 시크릿을 바꿔도 이미 붙은 소켓은 그대로다(JSDoc "다음 접속부터"). 시크릿이 새어 바꾸는 상황에서 새어 나간 연결이 끊기지 않는다. 그 연결로 할 수 있는 일: 그 업체 바로 열기 명령(`door.open`)을 계속 받기 · `door.closed` 로 문 상태를 잠금으로 바꾸기. QR 은 서버가 비교하므로 문을 열 수는 없다 | 시크릿을 바꿀 때 같은 Redis 채널로 `{store_id, command: 'disconnect'}` 를 보내고, gateway 가 그 업체 연결을 모두 끊는다(1008). 새 시크릿으로 다시 붙어야 한다 |
| 2 | Low | `docs/data-layer.md` Repository 절(제약 위반 분기 줄) | 이번에 더한 "`orIgnore()` 는 훅이 돌지 않으니 service · util 이 등록일 · 수정일까지 값을 채운다" 가 틀렸다. 실제로는 `execute()` 가 `@BeforeInsert` 를 부르고, 코드도 훅에 맡긴다(repository JSDoc 은 맞음) | "QueryBuilder insert 도 엔티티 인스턴스를 넘기면 `execute()` 때 훅이 돈다 — Smoke 는 빌드만 하므로 `insertTimestamp()` 를 직접 부른다" 로 고친다 |
| 3 | Info | `apps/admin-service/src/room/room.service.ts` `getDoorSnapshot` | 접속 확인에 요청 수 제한이 없다. bcrypt · 영숫자 16자 이상이라 추측은 사실상 어렵다 | 남용이 보이면 gateway 에서 IP · 업체별 접속 시도 제한 |
| 4 | Info | `apps/user-service/src/reservation/reservation.service.ts` `cancelStoreReservation` | `revokeQr` 를 DB 커밋 전에 한다. 뒤 단계가 끝내 실패해 롤백되면 예약은 확정 그대로인데 Redis QR 만 지워진다. 이용자가 내 예약 QR 을 다시 열거나 scheduler(1분, 운영)가 다시 쓰면 되살아난다 | 지금 구조 유지(SMS 를 마지막에 둔 규약과 같은 선택) |
| 5 | Info | Redis `door:` · `door-qr:` | 지운 호실의 문 키가 남는다. 목록 · 소켓은 DB 호실 기준이라 동작에는 영향이 없다 | 필요할 때 정리 작업을 따로 |

## Verdict
변경 필요(Medium 1 · Low 1) — 1 은 시크릿을 바꿀 때 연결을 끊는 작은 추가(store service · 문 포트 · gateway 소켓 + spec), 2 는 문서 한 줄이다. 고치고 다시 리뷰(`main-review-261105-2.md`)한 뒤 커밋한다.
