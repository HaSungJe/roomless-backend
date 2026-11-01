# Review — 문 상태 (Phase 14 재정의) · Redis 기반 · 실행 가이드 — 261101

> Pre-merge code review. Check the accumulated changes against the memory rules, AGENTS.md conventions, and the plan/spec intent.
> Location: `.beaver/output/review/` — direct 모드라 `<branch>-review-<YYMMDD>.md`.

## Target
- stick: 없음(direct 모드) — `main` 에 바로 커밋 · 푸쉬
- Included features: [door-state](../plan/door/door-state-plan.md) — 로드맵 Phase 14(#107 Redis 기반 · #108 문 정보 포트 · #109 문 열기 · 닫기 API). 로드맵 구조 변경은 앞서 따로 커밋(bf87d7d)
- Change scope: 43파일(새 26 · 수정 17) +3048 / −59 — 코드 21파일 +634, 테스트 4파일 +359, 나머지는 compose · 스크립트 · 문서(spec · plan · report · review · 가이드 · 규약 · 로드맵 메모)

## Convention Check (against AGENTS.md)
| Item | Result | Notes |
|------|------|------|
| Naming | pass | 도메인 `door` — `door.service.ts` · `door.util.ts` · `door.symbols.ts` · `controllers/door.controller.ts`, DTO `door-open.dto.ts` · `door-close.dto.ts`(`DoorOpenDto` · `DoorOpenResultDto` · `DoorCloseDto`), 인프라 `redis.connection.ts` · `redis-door.store.ts`(`<kebab>.<role>.ts`), 포트 `DOOR_STORE = Symbol('DoorStoreInterface')`, 내부 경로 `DOOR_INTERNAL_PATH`(`door.commands.ts` — 명령 없음). 키 snake_case(`room_id` · `door_state` · `door_changed_at`) |
| Structure & layering | pass | 게이트웨이 `api/v1/user-service/door/controllers/door.controller.ts`(동기만 — 큐 파일 없음), 서비스 `src/door/controllers/`. controller 위임 한 줄, service 는 포트(`DOOR_REPOSITORY` · `DOOR_STORE`)만, t_room 은 door 어휘(`findDoorRoom`)로 읽는다. 문 정보 포트는 여러 앱이 쓸 수 있게 `libs/integration`(SMS · S3 옆), 앱 루트가 `DoorStoreModule` 을 import |
| Shared logic extraction | pass | service private 헬퍼 0, 시각은 `door.util.ts` `toDoorTime`(`@app/common/utils/dayjs.js` — 직접 계산 · `'dayjs'` import 없음), 키 · 값 해석은 어댑터 파일 전용 함수(`doorKey` · `doorQrKey` · `parseDoorValue`), Redis 명령 실패 → 503 은 어댑터 한 곳(`run`) |
| Errors & responses | pass | repository try/catch + 통일 500, service 404(`일치하는 QR 정보가 없습니다.` · `호실을 찾을 수 없습니다.` — 한 곳에서만 쓰여 인라인), 어댑터 503 `REDIS_UNAVAILABLE_MESSAGE` · 500 `DOOR_QR_ISSUE_FAILED_MESSAGE`(`*_MESSAGE` 상수). 입력 필드 오류만 `validation_errors`, 404 · 503 은 null. 열기 응답 필드 3개 모두, 닫기는 void(ResultDto 없음) |
| Test strength | pass | service 기능 spec 2개 — 포트 호출 횟수 · 인자(QR · room_id · 한국 시각) · 실패 뒤 `.not.toHaveBeenCalled()` · 내부 토큰 403 · DTO 400(필드별 메시지), `[CASES:toDoorTime]` 5개를 두 경로에서. repository spec — `is_deleted: 0` · `loadRelationIds` · 통일 500. 어댑터 spec 은 규약대로 없다 |

**Data-Access Smoke**: 해당 없음 — 새 data-access 메서드는 `findDoorRoom`(단순 `findOne` + `notDeleted`) 하나이고 관계 필드 where · QueryBuilder · raw select · 동적 조립이 없다.

**memory**
- `git` — spec · plan · report · review 를 코드와 함께 커밋한다.
- `cache` — Redis 가 처음 들어왔지만 문 정보는 캐시가 아니라 원본이다(무효화 대상 아님). 캐시 규칙은 Phase 23 첫 캐시 도입 때 규약으로 옮긴다 — 이번엔 제안하지 않는다.
- `api-log` — 해당 없음.

## Intended Behavior Check (against plan/spec)
- **문 열기**: QR(32자 hex)로 `door-qr:` 색인을 찾아 그 문을 `QR:open:<한국 시각>` 으로 바꾸고 `{room_id, door_state: 'open', door_changed_at}` 을 돌려준다. 일치하는 문이 없으면 404. 여기까지만 한다(체크인 · 예약 확인 없음) — spec 그대로.
- **문 닫기**: 지워지지 않은 호실만(DB 확인 — 없으면 404, Redis 를 건드리지 않음), QR 은 그대로 `close` + 시각. 기록 없던 문은 `:close:<시각>`.
- **QR 겹침 방지**: 발급은 새 색인을 `SET NX` 로 잡아야만 바꾸고 이전 색인을 지운다(Lua 1개 — 원자적). 32자 무작위 + 최대 3번 시도. 열기 · 닫기도 Lua 1개씩.
- **기록 없음**: 키가 없으면 `get` 이 `close` · `00000000000000`. 발급 때 기록 없는 문은 `close` · `00000000000000` 으로 시작.
- **Redis 장애**: 부팅을 막지 않고(연결을 기다리지 않음 · 기본 재연결), 준비 전 · 실패는 503. 끊긴 동안 명령을 쌓지 않는다. 재연결 중에도 소켓 `isOpen` 은 true 라 종료 때 `close()` 가 재연결을 멈춘다(node-redis 6 소스 확인).
- **Docker · 가이드**: `compose.redis.yml`(AOF · 비밀번호 · `roomless-data`), `docker:redis` · `docker:infra` · `docker:down`, user-service 만 `REDIS_URL` 필수 · 다른 앱은 Redis 비밀값을 빈 값으로. README 실행 절 4단계 · `docs/guides/redis-setup.md`(로컬 · ElastiCache · 확인 · 문제 해결) — 사용자 요청대로.
- **검증**: typecheck · lint · build(4개 앱) · db:check 통과, 테스트(AGENTS 허용 확인 실행) door 28 · 전체 746 통과, compose 5개 문법 통과(`.env` 값 미출력), Lua 3개를 Lua VM 에서 16/16(색인 없음 · 발급 · 열기 · 닫기 · 재발급 · 충돌 · QR 없는 기록).
- **plan 과 다른 점**: `RedisClient` 타입을 클라이언트 생성 함수에서 얻는다(node-redis 6 기본 RESP3 제네릭 — 동작 같음). 로드맵 변경으로 QR 발급의 첫 사용처를 Phase 15 #112 로 문서들을 고쳤다.

## Findings
| # | Severity | Location (path:line) | Description | Recommendation |
|---|--------|-----------------|------|------|
| 1 | Low | apps/admin-service/src/room/room.service.ts `deleteMyRoom` · `deleteMyRoomGroup` / libs/integration/src/door/redis-door.store.ts | 호실 · 객실 그룹을 지워도(소프트 삭제) Redis 의 `door:<room_id>` · `door-qr:<QR>` 는 남는다. 지운 호실의 QR 로 문 열기를 부르면 열림으로 기록된다(닫기는 404). 지금은 QR 을 발급하는 곳이 없어 실제로 생기지 않는다 | QR 발급이 생기는 Phase 15(#112)에서 호실 삭제 · 예약 종료 때 문 키를 지우는 지점을 함께 정한다 — 조치 없음 |
| 2 | Info | apps/gateway/src/api/v1/user-service/door/controllers/door.controller.ts | 인증 없는 공개 API 2개 — 요청 수 제한이 없다. QR 은 32자 무작위라 추측은 사실상 불가능하고, 닫기는 상태 표시만 바꾼다(spec Notes) | 남용이 보이면 문 쪽 프로그램 키 · 요청 제한을 붙인다 |
| 3 | Info | compose.redis.yml `command` | 비밀번호가 컨테이너 안 `redis-server` 프로세스 인자로 펼쳐진다(호스트 · 같은 네트워크 밖에서는 보이지 않음). compose 파일에는 적지 않는다 | 조치 없음 — 운영은 ElastiCache AUTH 토큰 |
| 4 | Info | compose.user-service.yml | user-service 묶음이 이제 `REDIS_URL` 없이는 뜨지 않는다(필수값 규칙) | 배포 때 `.env` 에 `REDIS_PASSWORD` · `REDIS_URL` 추가 — 지금 할 일 사용자 줄 |

## Verdict
통과 — High · Medium 없음. Low #1 은 QR 발급이 생기는 Phase 15 에서 함께 정한다(조치 없음).
