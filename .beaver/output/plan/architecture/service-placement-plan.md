# Plan — service-placement (서버 위치 정리 · Phase 25)

## Feature Summary
- **Feature**: 이용자 기능은 user-service, 관리자 쪽 기능은 admin-service 로 — 문 소켓 처리 3개 · 이용자 입점 신청 7개 → user-service, 매니저 예약 3개 → admin-service. 동작 · DTO · 메시지는 그대로 두고 서버만 옮긴다.
- **Entry point**:
  - 내부 `POST /internal/v1/user-service/door/{snapshot,verify,close}`
  - 공개 `/api/v1/user-service/store/application…`(7개 — 큐 `user.store.application*` 4 · 동기 3)
  - 공개 `/api/v1/admin-service/reservation/{store, :reservation_id/store-cancel, :reservation_id/room}`(동기 1 · 큐 `admin.reservation.*` 2)
- **Domain**: user-service `door`(새) · `store`(새), admin-service `reservation`(새). 빼는 쪽은 admin-service `room` · `store`, user-service `reservation`. 로드맵 Phase 25 의 #118 · #119 · #120 이다.
- **Spec**: [service-placement-spec.md](../../spec/architecture/service-placement-spec.md)

구현 단위는 셋이고 서로 파일이 겹치지 않는다. 순서는 A → B → C, 문서는 끝에 한 번 고친다.
- A. 문 소켓 처리(#118)
- B. 이용자 입점 신청(#119)
- C. 매니저 예약(#120)

---

## File List

### A. 문 소켓 처리 → user-service `door` (#118)
| File | Action |
|------|------|
| `libs/contracts/src/door/door.commands.ts` | modified — `DOOR_INTERNAL_PATH` 추가, 머리 주석(서버 쪽 처리 = user-service door) |
| `libs/contracts/src/door/dto/door-snapshot.dto.ts` · `door-verify.dto.ts` · `door-close.dto.ts` | new — `libs/contracts/src/room/dto/room-door-{snapshot,verify,close}.dto.ts` 를 옮기고 클래스 이름의 `Room` 접두만 뗀다 |
| `libs/contracts/src/room/dto/room-door-snapshot.dto.ts` · `room-door-verify.dto.ts` · `room-door-close.dto.ts` | deleted |
| `libs/contracts/src/room/room.commands.ts` | modified — `ROOM_INTERNAL_PATH.DOOR_SNAPSHOT · DOOR_VERIFY · DOOR_CLOSE` 삭제 |
| `apps/user-service/src/door/door.symbols.ts` · `door.constants.ts` · `door.util.ts` · `door.service.ts` · `door.module.ts` | new |
| `apps/user-service/src/door/interfaces/door.repository.interface.ts` · `repositories/door.repository.ts` · `controllers/door.controller.ts` | new |
| `apps/user-service/src/door/test/door.test-helper.ts` · `door-snapshot.spec.ts` · `door-verify.spec.ts` · `door-close.spec.ts` · `door.repository.spec.ts` | new — admin-service room spec 3개 + repository spec 문 블록을 옮긴다 |
| `apps/user-service/src/user-service.module.ts` | modified — `DoorModule`, 주석 |
| `apps/gateway/src/modules/door-socket/door-socket.server.ts` · `door-socket.util.ts` | modified — 대상 `'user'` · `DOOR_INTERNAL_PATH` · `Door*ResultDto`, 주석의 admin-service → user-service |
| `apps/admin-service/src/room/controllers/room.controller.ts` · `room.service.ts` · `room.util.ts` | modified — 문 소켓 핸들러 3 · 메서드 3 · `toRoomDoorSnapshotItem` 삭제, 안 쓰는 import(`UnauthorizedException` · `Not` · `matchBcrypt` · DTO) 삭제 |
| `apps/admin-service/src/room/interfaces/room.repository.interface.ts` · `repositories/room.repository.ts` | modified — `RoomDoorRow` · `findDoorStore` · `findStoreDoorRoomRows` · `buildStoreDoorRoomRowsQuery` 삭제 |
| `apps/admin-service/src/room/test/room-door-snapshot.spec.ts` · `room-door-verify.spec.ts` · `room-door-close.spec.ts` | deleted (user-service door 로 이동) |
| `apps/admin-service/src/room/test/room.test-helper.ts` · `room.repository.spec.ts` | modified — 문 소켓 mock 키 2개 · 문 블록 · `Not` · `ROOM_DOOR_ROW_KEYS` 삭제 |
| `apps/admin-service/src/admin-service.module.ts` · `libs/integration/src/integration.util.ts` · `libs/integration/src/door/door-store.module.ts` | modified — 주석(문 소켓 QR 확인 · 잠금은 user-service) |

### B. 이용자 입점 신청 → user-service `store` (#119)
| File | Action |
|------|------|
| `libs/contracts/src/store/store.commands.ts` | modified — `STORE_USER_COMMAND` · `STORE_USER_INTERNAL_PATH` 추가, `STORE_COMMAND` 의 신청 4개 · `STORE_INTERNAL_PATH` 의 내 신청 3개 삭제, 주석 |
| `libs/contracts/src/store/dto/*` | unchanged |
| `apps/user-service/src/store/store.symbols.ts` · `store.constants.ts` · `store.util.ts` · `store.service.ts` · `store.module.ts` | new |
| `apps/user-service/src/store/interfaces/store.repository.interface.ts` · `repositories/store.repository.ts` | new |
| `apps/user-service/src/store/controllers/store.controller.ts` · `store.controller.queue.ts` | new |
| `apps/user-service/src/store/test/store.test-helper.ts` · `store.repository.spec.ts` · 7 spec(`store-apply` · `store-application-cancel` · `store-application-file` · `store-application-file-delete` · `store-application-file-upload-url` · `store-my-application-list` · `store-my-application`) | new — admin-service store 에서 옮긴다 |
| `apps/user-service/src/user-service.module.ts` | modified — `StoreModule`, 주석(StorageModule 사용처) |
| `apps/gateway/src/api/v1/user-service/store/store.module.ts` · `controllers/store.controller.ts` · `controllers/store.controller.queue.ts` | new — 이용자 가드 라우트 7개(Swagger `입점 신청`) |
| `apps/gateway/src/api/v1/admin-service/store/controllers/store.controller.ts` · `store.controller.queue.ts` · `store.module.ts` | modified — 이용자 가드 핸들러 7개 · `PassportJwtAuthGuard` import · 주석 삭제 |
| `apps/gateway/src/gateway.module.ts` | modified — `UserStoreModule`(별칭) · `AdminReservationModule`(별칭, C) 등록, 주석 |
| `apps/admin-service/src/store/controllers/store.controller.ts` · `store.controller.queue.ts` · `store.service.ts` · `store.util.ts` · `store.module.ts` | modified — 신청자 핸들러 · 메서드 7개 · `toMyApplication*` · `buildApplicationFileKey` · `isApplicationFileKey` · `applicationFilePrefix` 삭제, 주석 |
| `apps/admin-service/src/store/interfaces/store.repository.interface.ts` · `repositories/store.repository.ts` | modified — `insertApplication` · `deleteApplication` · `deleteApplicationFiles`(+ 빌더) · `findStores` 삭제 |
| `apps/admin-service/src/store/test/` 의 7 spec | deleted (user-service store 로 이동) |
| `apps/admin-service/src/store/test/store.test-helper.ts` · `store.repository.spec.ts` | modified — 옮긴 메서드의 mock 키 · 테스트 삭제, 승인 · 취소 it.each 분리 |

### C. 매니저 예약 → admin-service `reservation` (#120)
| File | Action |
|------|------|
| `libs/contracts/src/reservation/reservation.commands.ts` | modified — `RESERVATION_MANAGER_COMMAND` · `RESERVATION_MANAGER_INTERNAL_PATH` 추가, `RESERVATION_COMMAND.STORE_CANCEL · ROOM_CHANGE` · `RESERVATION_INTERNAL_PATH.STORE` 삭제 |
| `libs/contracts/src/reservation/reservation.constants.ts` | modified — 머리 주석(admin-service 업체 예약) |
| `apps/admin-service/src/reservation/reservation.symbols.ts` · `reservation.constants.ts` · `reservation.util.ts` · `reservation.service.ts` · `reservation.module.ts` | new |
| `apps/admin-service/src/reservation/interfaces/reservation.repository.interface.ts` · `repositories/reservation.repository.ts` | new |
| `apps/admin-service/src/reservation/controllers/reservation.controller.ts` · `reservation.controller.queue.ts` | new |
| `apps/admin-service/src/reservation/test/reservation.test-helper.ts` · `reservation-store.spec.ts` · `reservation-store-cancel.spec.ts` · `reservation-room-change.spec.ts` · `reservation.repository.spec.ts` | new — user-service reservation 에서 옮긴다 |
| `apps/admin-service/src/admin-service.module.ts` | modified — `ReservationModule`, 주석(SMS · DOOR 사용처) |
| `apps/gateway/src/api/v1/admin-service/reservation/reservation.module.ts` · `controllers/reservation.controller.ts` · `controllers/reservation.controller.queue.ts` | new — 매니저 가드 라우트 3개(Swagger `업체 예약`) |
| `apps/gateway/src/api/v1/user-service/reservation/controllers/reservation.controller.ts` · `reservation.controller.queue.ts` · `reservation.module.ts` | modified — 매니저 핸들러 3개 · `PassportJwtManagerAuthGuard` · DTO import · 주석 삭제 |
| `apps/user-service/src/reservation/controllers/reservation.controller.ts` · `reservation.controller.queue.ts` · `reservation.service.ts` · `reservation.util.ts` · `reservation.constants.ts` · `reservation.module.ts` | modified — 매니저 메서드 3개 · `SMS_SENDER` 주입 · `buildStoreCancelSms` · `buildRoomChangeSms` · `toStoreReservationRooms` · `RESERVATION_STORE_VISIBLE_STATES` · `RESERVATION_MANAGER_STORE_NOT_FOUND_MESSAGE` · `RESERVATION_ROOM_TAKEN_MESSAGE` 삭제, 주석 |
| `apps/user-service/src/reservation/interfaces/reservation.repository.interface.ts` · `repositories/reservation.repository.ts` | modified — `StoreRoomRow` · `StoreReservationRow` · `findReservationUser` · `changeReservationRoom` · `findStoreRoomRows` · `findStoreReservationRows`(+ 빌더 2) · `updateRoomQr` · `users` 게터 삭제 |
| `apps/user-service/src/reservation/test/reservation-store.spec.ts` · `reservation-store-cancel.spec.ts` · `reservation-room-change.spec.ts` | deleted (admin-service reservation 으로 이동) |
| `apps/user-service/src/reservation/test/reservation.test-helper.ts` · `reservation.repository.spec.ts` · `reservation-payment-confirm.spec.ts` | modified — 매니저 mock 키 · `MANAGER_ACTOR` · SMS mock · 옮긴 블록 삭제, 결제 확인 부팅 인자 |

### D. 문서 · 규칙
| File | Action |
|------|------|
| `README.md` | modified — 앱 설명(user-service 에 입점 신청 · 문 소켓 처리, admin-service 에 업체 예약), 공개 경로 접두 |
| `AGENTS.md` | modified — Architecture 트리 · "기능은 행위자로 서버를 고른다" 규칙(메모리 반영), 라우트 예시, 내부 actor 예시, Query DTO 적용 목록, 외부 연동 사용처, Smoke 목록 |
| `docs/architecture.md` · `docs/api.md` · `docs/conventions.md` · `docs/messaging.md` · `docs/integration.md` · `docs/realtime.md` · `docs/testing.md` · `docs/guides/redis-setup.md` | modified — 옮긴 경로 · 명령 · 모듈 · 사용처 · 예시 코드 |
| `.beaver/memory/architecture.md` · `.beaver/memory/MEMORY.md` | ship 때 — AGENTS.md 반영 확인 뒤 `_archived/architecture.md` 로 옮긴다 |

스키마 · 마이그레이션 · 시드 · compose · `.env.example` 변경은 없다.

---

## Design

### 0. 공통 원칙 (옮기기)
- **옮긴 코드의 본문은 원본 그대로다**. 이 plan 의 코드 블록은 새 파일의 틀과 바뀌는 줄이다. "원본 그대로" 라고 적은 메서드는 아래 원본 줄 범위를 그대로 옮긴다:
  - room.service.ts:812-872 · store.service.ts:133-380 · reservation.service.ts:560-707
  - 각 repository 의 같은 이름 메서드
  - 원본 줄은 HEAD `7a78299` 기준이다.
  - 바뀌는 것은 JSDoc 의 전송 경로 · 명령 type, import 경로, 상수 이름 접두뿐이다.
- **두 앱이 다 쓰는 것은 복사한다** — 도메인 상수 · util · repository 메서드는 앱끼리 import 하지 않는다. 메시지 문구는 한 글자도 바꾸지 않는다(spec 단언).
- **옮긴 기능은 원래 자리에서 지운다** — 같은 명령 type 이 두 서버에 등록되지 않고, 옛 경로 상수는 남기지 않는다(§1.7).

### 1. 규격 (contracts)

```ts
// libs/contracts/src/door/door.commands.ts — 머리 주석 마지막 줄과 끝에 추가
/**
 * 문 도메인 규격 — 문 쪽 타 업체 프로그램과의 실시간 소켓(gateway — 표준 WebSocket)의 경로 · 헤더 · 이벤트 이름.
 * HTTP 문 열기 · 닫기 API 는 없다(사용자 결정 2026-11-04) — QR 확인 · 잠금 알림 · 바로 열기 명령은 모두 이 소켓으로 주고받는다.
 * 소켓이 부르는 서버 쪽 처리(접속 확인 · QR 확인 · 잠금)는 user-service door 도메인 내부 HTTP(DOOR_INTERNAL_PATH)다 — 문을 쓰는 건 이용자 흐름이다(사용자 결정 2026-11-07).
 */
// … DOOR_SOCKET_PATH · DOOR_SOCKET_HEADER · DOOR_SOCKET_EVENT 그대로 …

/** door 내부 HTTP 경로 접두 */
const DOOR_INTERNAL_BASE = '/internal/v1/user-service/door';

/**
 * door 도메인 내부 HTTP 경로 (게이트웨이 문 소켓 → user-service). actor 없이 내부 토큰만 — 업체는 소켓 접속 때 확인한 값이다.
 */
export const DOOR_INTERNAL_PATH = {
    /** 문 소켓 접속 확인 + 업체 호실 문 상태 (POST) */
    SNAPSHOT: `${DOOR_INTERNAL_BASE}/snapshot`,
    /** 문 소켓 QR 확인 (POST) */
    VERIFY: `${DOOR_INTERNAL_BASE}/verify`,
    /** 문 소켓 잠금 알림 (POST) */
    CLOSE: `${DOOR_INTERNAL_BASE}/close`,
} as const;
```

```ts
// libs/contracts/src/door/dto/door-snapshot.dto.ts — room-door-snapshot.dto.ts 를 옮긴다. 필드 · 검증 · 메시지 · 주석 그대로, 클래스 이름만:
//   RoomDoorSnapshotDto → DoorSnapshotDto · RoomDoorSnapshotItemResultDto → DoorSnapshotItemResultDto · RoomDoorSnapshotResultDto → DoorSnapshotResultDto
export class DoorSnapshotResultDto {
    @ApiProperty({description: '업체 ID'})
    store_id: string;

    @ApiProperty({description: '호실 문 (층 · 호실명 순)', type: () => [DoorSnapshotItemResultDto]})
    list: DoorSnapshotItemResultDto[];
}
// libs/contracts/src/door/dto/door-verify.dto.ts — RoomDoorVerifyDto → DoorVerifyDto · RoomDoorVerifyResultDto → DoorVerifyResultDto
// libs/contracts/src/door/dto/door-close.dto.ts  — RoomDoorCloseDto → DoorCloseDto · RoomDoorCloseResultDto → DoorCloseResultDto
```

```ts
// libs/contracts/src/room/room.commands.ts — ROOM_INTERNAL_PATH 에서 세 줄(+ 주석) 삭제
-    /** 문 소켓 접속 확인 + 업체 호실 문 상태 (POST, gateway 문 소켓 — 내부 토큰만, actor 없음) */
-    DOOR_SNAPSHOT: `${ROOM_INTERNAL_BASE}/door-snapshot`,
-    /** 문 소켓 QR 확인 (POST, gateway 문 소켓 — 내부 토큰만, actor 없음) */
-    DOOR_VERIFY: `${ROOM_INTERNAL_BASE}/door-verify`,
-    /** 문 소켓 잠금 알림 (POST, gateway 문 소켓 — 내부 토큰만, actor 없음) */
-    DOOR_CLOSE: `${ROOM_INTERNAL_BASE}/door-close`,
```

```ts
// libs/contracts/src/store/store.commands.ts
/** store 내부 HTTP 경로 접두 — admin-service (업체 · 신청 관리 · 내 업체) */
const STORE_INTERNAL_BASE = '/internal/v1/admin-service/store';

/** store 내부 HTTP 경로 접두 — user-service (이용자 입점 신청) */
const STORE_USER_INTERNAL_BASE = '/internal/v1/user-service/store';

/**
 * store 도메인 RabbitMQ 명령 — admin-service(q.admin.cmd `admin.#`). 승인 · 반려 · 업체 수정 · 상태 변경 · 영업중 여부(총관리자 · 관리자), 내 업체 설정(업체 관리자).
 * 이용자 입점 신청은 user-service 의 STORE_USER_COMMAND 다(기능은 행위자로 서버를 고른다 — 사용자 결정 2026-11-07).
 */
export const STORE_COMMAND = {
    // APPLICATION · APPLICATION_CANCEL · APPLICATION_FILE · APPLICATION_FILE_DELETE 삭제 — 나머지 그대로
    APPLICATION_APPROVE: 'admin.store.application-approve',
    // …
} as const;

/**
 * store 도메인 이용자 명령 — user-service(q.user.cmd `user.#`). 입점 신청 · 신청 취소 · 업체 정보 파일 등록 · 삭제(대기 중 내 신청).
 */
export const STORE_USER_COMMAND = {
    /** 입점 신청 (이용자) */
    APPLICATION: 'user.store.application',
    /** 입점 신청 취소 (이용자 — 대기 중 내 신청, 신청 · 파일 삭제) */
    APPLICATION_CANCEL: 'user.store.application-cancel',
    /** 신청에 업체 정보 파일 등록 (이용자 — 대기 중 내 신청) */
    APPLICATION_FILE: 'user.store.application-file',
    /** 신청의 업체 정보 파일 삭제 (이용자 — 대기 중 내 신청) */
    APPLICATION_FILE_DELETE: 'user.store.application-file-delete',
} as const;

/** store 도메인 내부 HTTP 경로 (게이트웨이 → admin-service) — MY_APPLICATION_LIST · myApplication · myApplicationFileUploadUrl 삭제, 나머지 그대로 */
export const STORE_INTERNAL_PATH = {/* APPLICATION_LIST · application() · STORE_LIST · store() · MINE · MINE_FILE_UPLOAD_URL · MINE_UNAVAILABLE_PERIOD_LIST */} as const;

/**
 * store 도메인 이용자 내부 HTTP 경로 (게이트웨이 → user-service). 파라미터가 있는 경로는 함수로 만든다.
 */
export const STORE_USER_INTERNAL_PATH = {
    /** 내 입점 신청 목록 (GET) */
    MY_APPLICATION_LIST: `${STORE_USER_INTERNAL_BASE}/application/mine`,
    /** 내 입점 신청 상세 (GET) */
    myApplication: (store_application_id: string) => `${STORE_USER_INTERNAL_BASE}/application/mine/${encodeURIComponent(store_application_id)}`,
    /** 업체 정보 파일 업로드 주소 (POST) */
    myApplicationFileUploadUrl: (store_application_id: string) => `${STORE_USER_INTERNAL_BASE}/application/mine/${encodeURIComponent(store_application_id)}/file/upload-url`,
} as const;
```

```ts
// libs/contracts/src/reservation/reservation.commands.ts
/** reservation 내부 HTTP 경로 접두 — user-service (이용자) */
const RESERVATION_INTERNAL_BASE = '/internal/v1/user-service/reservation';

/** reservation 내부 HTTP 경로 접두 — admin-service (매니저) */
const RESERVATION_MANAGER_INTERNAL_BASE = '/internal/v1/admin-service/reservation';

/**
 * reservation 도메인 이용자 명령 (= 라우팅 키, user-service 의 q.user.cmd 가 `user.#` 로 받는다) — 예약 생성 · 결제 확인 · 취소. 조회는 내부 HTTP 동기 경로다.
 */
export const RESERVATION_COMMAND = {
    CREATE: 'user.reservation.create',
    PAYMENT_CONFIRM: 'user.reservation.payment-confirm',
    CANCEL: 'user.reservation.cancel',
} as const;

/**
 * reservation 도메인 매니저 명령 — admin-service(q.admin.cmd `admin.#`). 업체 총관리자 · 업체 관리자가 내 업체 예약만 바꾼다(기능은 행위자로 서버를 고른다 — 사용자 결정 2026-11-07).
 */
export const RESERVATION_MANAGER_COMMAND = {
    /** 업체 취소 — 100% 환불 + 이용자 SMS (매니저) */
    STORE_CANCEL: 'admin.reservation.store-cancel',
    /** 호실 이동 — 같은 그룹 + 이용자 SMS (매니저) */
    ROOM_CHANGE: 'admin.reservation.room-change',
} as const;

/** reservation 도메인 이용자 내부 HTTP 경로 (게이트웨이 → user-service) — STORE 삭제 */
export const RESERVATION_INTERNAL_PATH = {/* AVAILABILITY · LIST · detail() · qr() 그대로 */} as const;

/**
 * reservation 도메인 매니저 내부 HTTP 경로 (게이트웨이 → admin-service).
 */
export const RESERVATION_MANAGER_INTERNAL_PATH = {
    /** 내 업체 예약 현황 (GET, 매니저) */
    STORE: `${RESERVATION_MANAGER_INTERNAL_BASE}/store`,
} as const;
```

### 2. A — user-service `door` 도메인

```ts
// apps/user-service/src/door/door.symbols.ts
/** door repository 포트 토큰 */
export const DOOR_REPOSITORY = Symbol('DoorRepositoryInterface');
```

```ts
// apps/user-service/src/door/door.constants.ts
/** 업체 탈퇴 상태 — t_store_state PK (store 도메인 상수는 import 하지 않는다) */
export const DOOR_STORE_STATE_LEAVE = 'LEAVE';

/** 문 소켓 접속 확인 실패 — 업체 없음 · 탈퇴 · 시크릿 미설정 · 불일치를 가르지 않는다(gateway door-socket.util.ts 와 같은 문구) */
export const DOOR_AUTH_FAILED_MESSAGE = '업체 ID 또는 시크릿 코드가 올바르지 않습니다.';

/** 그 업체의 지워지지 않은 호실이 아님 */
export const DOOR_ROOM_NOT_FOUND_MESSAGE = '호실을 찾을 수 없습니다.';
```

```ts
// apps/user-service/src/door/interfaces/door.repository.interface.ts
import type {FindOptionsWhere} from 'typeorm';
import type {RoomEntity} from '@app/database/entities/room/room.entity.js';
import type {StoreEntity} from '@app/database/entities/store/store.entity.js';

/** 문 소켓 접속 — 업체 호실 문 1개 (QueryBuilder raw — t_room_group 조인, 지워지지 않은 호실 · 그룹) */
export interface DoorRoomRow {
    room_id: string;
    room_name: string;
    floor: number;
}

/**
 * door repository 포트 — 문 소켓이 확인하는 업체 · 호실을 door 어휘로 읽는다(공유 DB 의 t_store · t_room · t_room_group).
 * WHERE 는 service 가 만들고 repository 는 is_deleted = 0 을 붙여 실행 + DB 오류 변환만 한다.
 */
export interface DoorRepositoryInterface {
    /** 문 소켓 접속 확인의 업체 — 지워지지 않은 업체(조건은 service: 탈퇴 제외) */
    findDoorStore(where: FindOptionsWhere<StoreEntity>): Promise<StoreEntity | null>;
    /** 문 소켓이 가리킨 호실 — 지워지지 않은 호실(조건은 service: 그 업체) */
    findDoorRoom(where: FindOptionsWhere<RoomEntity>): Promise<RoomEntity | null>;
    /** 업체 호실 문 목록 행 — 지워지지 않은 호실 · 그룹, 층 · 호실명 순 */
    findStoreDoorRoomRows(store_id: string): Promise<DoorRoomRow[]>;
}
```

```ts
// apps/user-service/src/door/repositories/door.repository.ts
import {Injectable, InternalServerErrorException} from '@nestjs/common';
import {TransactionHost} from '@nestjs-cls/transactional';
import type {TransactionalAdapterTypeOrm} from '@nestjs-cls/transactional-adapter-typeorm';
import type {FindOptionsWhere, Repository, SelectQueryBuilder} from 'typeorm';
import {RoomGroupEntity} from '@app/database/entities/room/room-group.entity.js';
import {RoomEntity} from '@app/database/entities/room/room.entity.js';
import {StoreEntity} from '@app/database/entities/store/store.entity.js';
import {notDeleted} from '@app/database/soft-delete.js';
import type {DoorRepositoryInterface, DoorRoomRow} from '../interfaces/door.repository.interface.js';

/** DB 최종 실패 메시지 */
const SERVER_ERROR_MESSAGE = '서버에서 오류가 발생했습니다. 관리자에게 문의해주세요.';

/**
 * door repository — 문 소켓이 확인하는 업체 · 호실을 공유 DB 에서 직접 읽는다(쓰기 없음 — 문 상태는 Redis).
 */
@Injectable()
export class DoorRepository implements DoorRepositoryInterface {
    /**
     * @param txHost 트랜잭션 호스트
     */
    constructor(private readonly txHost: TransactionHost<TransactionalAdapterTypeOrm>) {}

    /** t_store */
    private get stores(): Repository<StoreEntity> {
        return this.txHost.tx.getRepository(StoreEntity);
    }

    /** t_room */
    private get rooms(): Repository<RoomEntity> {
        return this.txHost.tx.getRepository(RoomEntity);
    }

    /**
     * 문 소켓 접속 확인의 업체 — 지워지지 않은 업체
     *
     * @param where 조회 조건 (service 는 is_deleted 를 넣지 않는다)
     * @returns 업체 또는 null
     */
    async findDoorStore(where: FindOptionsWhere<StoreEntity>): Promise<StoreEntity | null> {
        try {
            return await this.stores.findOne({where: notDeleted(where), loadRelationIds: true});
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 문 소켓이 가리킨 호실 — 지워지지 않은 호실
     *
     * @param where 조회 조건 (service 는 is_deleted 를 넣지 않는다)
     * @returns 호실 또는 null
     */
    async findDoorRoom(where: FindOptionsWhere<RoomEntity>): Promise<RoomEntity | null> {
        try {
            return await this.rooms.findOne({where: notDeleted(where), loadRelationIds: true});
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 업체 호실 문 목록 행
     *
     * @param store_id 업체 ID
     * @returns 호실 행 (층 · 호실명 순)
     */
    async findStoreDoorRoomRows(store_id: string): Promise<DoorRoomRow[]> {
        try {
            return await this.buildStoreDoorRoomRowsQuery(store_id).getRawMany<DoorRoomRow>();
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 업체 호실 문 목록 쿼리 — 지워지지 않은 호실 · 그룹(조인), 층 · 호실명 순(페이지 없음 — 문 소켓 접속 때 업체 전체).
     * 매핑 민감(조인 · raw select — 별칭이 DoorRoomRow 키와 같다)이라 Data-Access Smoke spec 으로 SQL 을 고정한다.
     *
     * @param store_id 업체 ID
     * @returns 쿼리 빌더
     */
    buildStoreDoorRoomRowsQuery(store_id: string): SelectQueryBuilder<RoomEntity> {
        return this.rooms
            .createQueryBuilder('r')
            .select('r.room_id', 'room_id')
            .addSelect('r.room_name', 'room_name')
            .addSelect('r.floor', 'floor')
            .innerJoin(RoomGroupEntity, 'g', 'g.room_group_id = r.room_group_id')
            .where('r.store_id = :store_id', {store_id})
            .andWhere('r.is_deleted = 0')
            .andWhere('g.is_deleted = 0')
            .orderBy('r.floor', 'ASC')
            .addOrderBy('r.room_name', 'ASC');
    }
}
```

```ts
// apps/user-service/src/door/door.util.ts
import type {DoorSnapshotItemResultDto} from '@app/contracts/door/dto/door-snapshot.dto.js';
import type {DoorRecord} from '@app/integration/interfaces/integration.interface.js';
import type {DoorRoomRow} from './interfaces/door.repository.interface.js';

/**
 * 문 소켓 접속 항목 — 호실 + 문 상태.
 *
 * @param row 업체 호실 문 행
 * @param door 그 호실 문 상태
 * @returns 항목
 */
export function toDoorSnapshotItem(row: DoorRoomRow, door: DoorRecord): DoorSnapshotItemResultDto {
    return {room_id: row.room_id, room_name: row.room_name, floor: Number(row.floor), door_state: door.state, door_changed_at: door.changed_at};
}
```

```ts
// apps/user-service/src/door/door.service.ts — room.service.ts:812-872 를 옮긴다(본문 같다, 상수 · repository 이름만)
import {Inject, Injectable, NotFoundException, UnauthorizedException} from '@nestjs/common';
import {Not} from 'typeorm';
import {matchBcrypt} from '@app/common/utils/bcrypt.js';
import type {DoorCloseDto, DoorCloseResultDto} from '@app/contracts/door/dto/door-close.dto.js';
import type {DoorSnapshotDto, DoorSnapshotResultDto} from '@app/contracts/door/dto/door-snapshot.dto.js';
import type {DoorVerifyDto, DoorVerifyResultDto} from '@app/contracts/door/dto/door-verify.dto.js';
import {DOOR_STATE} from '@app/integration/integration.constants.js';
import {DOOR_STORE} from '@app/integration/integration.symbols.js';
import {toDoorTime} from '@app/integration/integration.util.js';
import type {DoorStoreInterface} from '@app/integration/interfaces/integration.interface.js';
import {DOOR_AUTH_FAILED_MESSAGE, DOOR_ROOM_NOT_FOUND_MESSAGE, DOOR_STORE_STATE_LEAVE} from './door.constants.js';
import {DOOR_REPOSITORY} from './door.symbols.js';
import {toDoorSnapshotItem} from './door.util.js';
import type {DoorRepositoryInterface} from './interfaces/door.repository.interface.js';

/**
 * door 비즈니스 로직 — gateway 문 소켓(문 쪽 타 업체 프로그램)의 접속 확인 · QR 확인 · 잠금 알림. 이용자 흐름이라 user-service 에 둔다(사용자 결정 2026-11-07).
 * 업체 관리자의 문 상태 · 바로 열기 · 문 시크릿은 admin-service 다.
 */
@Injectable()
export class DoorService {
    /**
     * @param doorRepository door repository 포트
     * @param doorStore 문 정보 포트 (Redis — 문 상태 · 현재 QR)
     */
    constructor(
        @Inject(DOOR_REPOSITORY) private readonly doorRepository: DoorRepositoryInterface,
        @Inject(DOOR_STORE) private readonly doorStore: DoorStoreInterface,
    ) {}

    /**
     * 문 소켓 접속 확인 (gateway 문 소켓) — 지워지지 않고 탈퇴하지 않은 업체 · 시크릿 설정 · bcrypt 일치면 그 업체 호실 전체의 문 상태. 영업 상태는 보지 않는다(문은 영업과 별개).
     * 실패 이유(업체 없음 · 탈퇴 · 시크릿 미설정 · 불일치)는 가르지 않고 모두 401 — 업체가 있는지 알려 주지 않는다. (내부 HTTP: POST /internal/v1/user-service/door/snapshot)
     *
     * @param dto 업체 ID · 시크릿 코드
     * @returns 업체 ID · 호실 문 목록
     * @throws UnauthorizedException 확인 실패
     */
    async getDoorSnapshot(dto: DoorSnapshotDto): Promise<DoorSnapshotResultDto> {
        // 1. 업체 · 시크릿
        const store = await this.doorRepository.findDoorStore({store_id: dto.store_id, store_state_id: Not(DOOR_STORE_STATE_LEAVE)});
        if (!store?.door_secret || !(await matchBcrypt(dto.door_secret, store.door_secret))) {
            throw new UnauthorizedException({message: DOOR_AUTH_FAILED_MESSAGE});
        }

        // 2. 호실 · 문 상태 (업체 전체 — 페이지 없음)
        const rows = await this.doorRepository.findStoreDoorRoomRows(store.store_id);
        const doors = await this.doorStore.getMany(rows.map((row) => row.room_id));
        return {store_id: store.store_id, list: rows.map((row, index) => toDoorSnapshotItem(row, doors[index]))};
    }

    /**
     * 문 소켓 QR 확인 (gateway 문 소켓) — 문이 읽은 QR 을 그 호실의 Redis 현재 QR 과 비교한다. 같으면 open + 지금 시각으로 쓰고 ok, 다르거나 없으면 그대로 두고 ok false.
     * QR 값은 서버 밖으로 나가지 않는다(사용자 결정 2026-11-04). (내부 HTTP: POST /internal/v1/user-service/door/verify)
     *
     * @param dto 업체 ID(소켓이 확인한 값) · 호실 ID · 읽은 QR
     * @returns 호실 ID · 일치 여부
     * @throws NotFoundException 그 업체의 호실이 아닐 때
     */
    async verifyStoreDoor(dto: DoorVerifyDto): Promise<DoorVerifyResultDto> {
        // 1. 그 업체의 호실
        const room = await this.doorRepository.findDoorRoom({room_id: dto.room_id, store_id: dto.store_id});
        if (!room) {
            throw new NotFoundException({message: DOOR_ROOM_NOT_FOUND_MESSAGE});
        }

        // 2. 현재 QR 과 비교 + 같으면 열림 기록 (포트가 스크립트 1개로)
        const ok = await this.doorStore.verify(room.room_id, dto.qr, toDoorTime(new Date()));
        return {room_id: room.room_id, ok};
    }

    /**
     * 문 소켓 잠금 알림 (gateway 문 소켓) — 하드웨어가 잠겼다(잠금 버튼 · 자동 잠금, 인증된 소켓이라 QR 없이). 그 업체의 지워지지 않은 호실이면 close + 지금 시각.
     * (내부 HTTP: POST /internal/v1/user-service/door/close)
     *
     * @param dto 업체 ID(소켓이 확인한 값) · 호실 ID
     * @returns 잠근 문의 room_id · 상태 · 시각
     * @throws NotFoundException 그 업체의 호실이 아닐 때
     */
    async closeStoreDoor(dto: DoorCloseDto): Promise<DoorCloseResultDto> {
        // 1. 그 업체의 호실
        const room = await this.doorRepository.findDoorRoom({room_id: dto.room_id, store_id: dto.store_id});
        if (!room) {
            throw new NotFoundException({message: DOOR_ROOM_NOT_FOUND_MESSAGE});
        }

        // 2. close + 지금 시각
        const changed_at = toDoorTime(new Date());
        await this.doorStore.close(room.room_id, changed_at);
        return {room_id: room.room_id, door_state: DOOR_STATE.CLOSE, door_changed_at: changed_at};
    }
}
```

```ts
// apps/user-service/src/door/controllers/door.controller.ts
import {Body, Controller, HttpCode, Post} from '@nestjs/common';
import {DoorCloseDto, DoorCloseResultDto} from '@app/contracts/door/dto/door-close.dto.js';
import {DoorSnapshotDto, DoorSnapshotResultDto} from '@app/contracts/door/dto/door-snapshot.dto.js';
import {DoorVerifyDto, DoorVerifyResultDto} from '@app/contracts/door/dto/door-verify.dto.js';
import {DoorService} from '../door.service.js';

/**
 * door 내부 HTTP 인바운드 어댑터 — gateway 문 소켓만 부른다(외부 비공개, Swagger 없음). actor 없이 내부 토큰만(업체는 소켓 접속 때 확인한 값). 내부 토큰 검사는 전역 InternalAuthGuard 가 한다.
 */
@Controller('/internal/v1/user-service/door')
export class DoorController {
    /**
     * @param doorService door 비즈니스 로직
     */
    constructor(private readonly doorService: DoorService) {}

    /**
     * 문 소켓 접속 확인 (gateway 문 소켓 — actor 없음, 내부 토큰만)
     */
    @Post('/snapshot')
    @HttpCode(200)
    async getDoorSnapshot(@Body() dto: DoorSnapshotDto): Promise<DoorSnapshotResultDto> {
        return this.doorService.getDoorSnapshot(dto);
    }

    /**
     * 문 소켓 QR 확인 (gateway 문 소켓 — actor 없음, 내부 토큰만)
     */
    @Post('/verify')
    @HttpCode(200)
    async verifyStoreDoor(@Body() dto: DoorVerifyDto): Promise<DoorVerifyResultDto> {
        return this.doorService.verifyStoreDoor(dto);
    }

    /**
     * 문 소켓 잠금 알림 (gateway 문 소켓 — actor 없음, 내부 토큰만)
     */
    @Post('/close')
    @HttpCode(200)
    async closeStoreDoor(@Body() dto: DoorCloseDto): Promise<DoorCloseResultDto> {
        return this.doorService.closeStoreDoor(dto);
    }
}
```

```ts
// apps/user-service/src/door/door.module.ts
import {Module} from '@nestjs/common';
import {DoorController} from './controllers/door.controller.js';
import {DoorService} from './door.service.js';
import {DOOR_REPOSITORY} from './door.symbols.js';
import {DoorRepository} from './repositories/door.repository.js';

/**
 * 문 도메인 — gateway 문 소켓의 접속 확인 · QR 확인 · 잠금 알림(내부 HTTP 만 — 큐 경로 없음). 문 정보 포트(DOOR_STORE — Redis)는 루트 모듈의 DoorStoreModule 이 전역으로 준다.
 * - DoorController(controllers/door.controller.ts): 내부 HTTP — snapshot · verify · close
 */
@Module({controllers: [DoorController], providers: [DoorService, {provide: DOOR_REPOSITORY, useClass: DoorRepository}]})
export class DoorModule {}
```

```ts
// apps/user-service/src/user-service.module.ts — imports 와 주석
import {DoorModule} from './door/door.module.js';
import {StoreModule} from './store/store.module.js';
// * - StorageModule: 파일 저장소 포트(STORAGE_GATEWAY, Amazon S3 · CloudFront) — 입점 신청 업체 정보 파일(업로드 주소 · 존재 확인 · 삭제 · 서명 열람 주소) · 업체 둘러보기 사진 공개 주소
// * - DoorStoreModule: 문 정보 포트(DOOR_STORE, Redis — RedisModule 연결 포함) — 문 소켓 접속 · QR 확인 · 잠금, 내 예약 QR 발급
// * 도메인: UserModule(회원) · ReservationModule(예약) · DiscoveryModule(업체 둘러보기) · StoreModule(입점 신청) · DoorModule(문 소켓 처리).
    imports: [
        // … DatabaseModule · MessagingModule.forService · SmsModule · StorageModule · DoorStoreModule · PaymentModule 그대로
        UserModule,
        ReservationModule,
        DiscoveryModule,
        StoreModule,
        DoorModule,
    ],
```

```ts
// apps/gateway/src/modules/door-socket/door-socket.server.ts — 바뀌는 줄
import type {DoorCloseResultDto} from '@app/contracts/door/dto/door-close.dto.js';
import type {DoorSnapshotResultDto} from '@app/contracts/door/dto/door-snapshot.dto.js';
import type {DoorVerifyResultDto} from '@app/contracts/door/dto/door-verify.dto.js';
import {DOOR_INTERNAL_PATH, DOOR_SOCKET_EVENT, DOOR_SOCKET_PATH} from '@app/contracts/door/door.commands.js'; // ROOM_INTERNAL_PATH import 삭제
// :109
            snapshot = await this.internalHttp.request<DoorSnapshotResultDto>('user', 'POST', DOOR_INTERNAL_PATH.SNAPSHOT, {body: credential});
// :154
                const result = await this.internalHttp.request<DoorVerifyResultDto>('user', 'POST', DOOR_INTERNAL_PATH.VERIFY, {body: {store_id, room_id: request.room_id, qr: request.qr}});
// :157
                await this.internalHttp.request<DoorCloseResultDto>('user', 'POST', DOOR_INTERNAL_PATH.CLOSE, {body: {store_id, room_id: request.room_id}});
// 주석 :36 · :38 · :57 · :90 — "admin-service" → "user-service"
// door-socket.util.ts :5 · :6 — Door*ResultDto import, 주석 :15 · :33 · :59 · :99 · :109 의 admin-service → user-service (DoorSnapshotDto)
```

```ts
// apps/admin-service/src/room — 지우는 것
// controllers/room.controller.ts :82-107 핸들러 3개, :3 · :5 · :6 DTO import, 클래스 주석의 "문 소켓 처리" 문장(:16-18)
// room.service.ts :812-872 메서드 3개, :1 UnauthorizedException · :3 Not · :5 matchBcrypt · :11 · :13 · :14 DTO · :84 toRoomDoorSnapshotItem import, 생성자 주석 doorStore(:101 "· 문 소켓 접속 · QR 확인 · 잠금")
// room.util.ts :272-281 toRoomDoorSnapshotItem, :8 DTO import, :16 RoomDoorRow import
// interfaces/room.repository.interface.ts :56-61 RoomDoorRow, :146-149 findDoorStore · findStoreDoorRoomRows
// repositories/room.repository.ts :778-825 findDoorStore · findStoreDoorRoomRows · buildStoreDoorRoomRowsQuery, :22 RoomDoorRow import
// ROOM_STORE_STATE_LEAVE · ROOM_NOT_FOUND_MESSAGE · findRoom 은 남는다(다른 room 기능이 쓴다)
```

### 3. B — user-service `store` 도메인 (이용자 입점 신청)

```ts
// apps/user-service/src/store/store.symbols.ts
/** store repository 포트 토큰 (이용자 입점 신청) */
export const STORE_REPOSITORY = Symbol('StoreRepositoryInterface');
```

```ts
// apps/user-service/src/store/store.constants.ts — admin-service store.constants.ts 에서 입점 신청이 쓰는 것만 복사(문구 같다)
/** 입점 신청 상태 — t_store_application_state PK */
export const STORE_APPLICATION_STATE = {WAIT: 'WAIT', APPROVED: 'APPROVED', REJECTED: 'REJECTED'} as const;

/** 용도별 파일 한도 — 신청 1건 기준 */
export const STORE_FILE_LIMIT: Record<string, number> = {BUSINESS_LICENSE: 1, STORE_IMAGE: 5};

/** 파일 MIME 타입 → 확장자 */
export const STORE_FILE_EXTENSION: Record<string, string> = {'image/jpeg': 'jpg', 'image/png': 'png'};

/** 입점 신청 없음 — 남의 신청 포함(존재를 드러내지 않는다) */
export const STORE_APPLICATION_NOT_FOUND_MESSAGE = '입점 신청을 찾을 수 없습니다.';

/** 대기 중이 아닌 신청을 바꾸려 할 때 */
export const STORE_APPLICATION_NOT_WAITING_MESSAGE = '대기 중인 입점 신청만 처리할 수 있습니다.';

/** 사업자등록번호 중복 — 대기 신청 · 등록 업체 */
export const STORE_BUSINESS_NUMBER_TAKEN_MESSAGE = '이미 신청 · 등록된 사업자등록번호입니다.';

/** 용도별 파일 한도 초과 */
export const STORE_FILE_LIMIT_MESSAGE = '올릴 수 있는 파일 수를 넘었습니다.';

/** 파일 용도가 룩업에 없을 때 */
export const STORE_FILE_PURPOSE_INVALID_MESSAGE = '파일 용도가 올바르지 않습니다.';

/** 업체 정보 파일 없음 — 남의 신청의 파일 포함 */
export const STORE_FILE_NOT_FOUND_MESSAGE = '파일을 찾을 수 없습니다.';

/** 업로드 주소로 발급하지 않은 저장 키 */
export const STORE_FILE_KEY_INVALID_MESSAGE = '업로드 주소로 받은 저장 키가 아닙니다.';

/** 저장소에 아직 파일이 없다 */
export const STORE_FILE_NOT_UPLOADED_MESSAGE = '파일이 아직 올라가지 않았습니다. 업로드 후 다시 시도해주세요.';
```

```ts
// apps/user-service/src/store/interfaces/store.repository.interface.ts — admin store 인터페이스에서 신청자 기능이 쓰는 메서드만(시그니처 · 주석 같다)
import type {FindOptionsWhere} from 'typeorm';
import type {StoreApplicationEntity} from '@app/database/entities/store/store-application.entity.js';
import type {StoreFilePurposeEntity} from '@app/database/entities/store/store-file-purpose.entity.js';
import type {StoreFileEntity} from '@app/database/entities/store/store-file.entity.js';
import type {StoreEntity} from '@app/database/entities/store/store.entity.js';

/** 업체 정보 파일 조회 행 — 파일 컬럼 + 용도의 비공개 여부 (QueryBuilder raw — t_store_file_purpose 조인) */
export interface StoreFileRow {
    store_file_id: string;
    store_file_purpose_id: string;
    store_application_id: string | null;
    store_id: string | null;
    file_key: string;
    file_name: string;
    content_type: string;
    sort_order: number;
    created_at: Date;
    is_private: number;
}

/**
 * store repository 포트 (이용자 입점 신청) — 공유 DB 의 t_store_application · t_store_file · t_store_file_purpose · t_store 를 다룬다.
 * WHERE 는 service 가 만들고 repository 는 is_deleted = 0 을 붙여 실행 + DB 오류 변환만 한다.
 */
export interface StoreRepositoryInterface {
    findApplication(where: FindOptionsWhere<StoreApplicationEntity>): Promise<StoreApplicationEntity | null>;
    countApplications(where: FindOptionsWhere<StoreApplicationEntity> | FindOptionsWhere<StoreApplicationEntity>[]): Promise<number>;
    findApplicationList(where: FindOptionsWhere<StoreApplicationEntity> | FindOptionsWhere<StoreApplicationEntity>[], limit: number, offset: number): Promise<StoreApplicationEntity[]>;
    insertApplication(entity: StoreApplicationEntity): Promise<void>;
    deleteApplication(where: FindOptionsWhere<StoreApplicationEntity>): Promise<boolean>;
    findStoreFilePurpose(store_file_purpose_id: string): Promise<StoreFilePurposeEntity | null>;
    findApplicationFileRows(store_application_id: string): Promise<StoreFileRow[]>;
    countStoreFiles(where: FindOptionsWhere<StoreFileEntity>): Promise<number>;
    findStoreFile(where: FindOptionsWhere<StoreFileEntity>): Promise<StoreFileEntity | null>;
    insertStoreFile(entity: StoreFileEntity): Promise<void>;
    deleteStoreFile(where: FindOptionsWhere<StoreFileEntity>): Promise<void>;
    deleteApplicationFiles(store_application_id: string): Promise<void>;
    findStore(where: FindOptionsWhere<StoreEntity>): Promise<StoreEntity | null>;
    findStores(where: FindOptionsWhere<StoreEntity>): Promise<StoreEntity[]>;
    countStores(where: FindOptionsWhere<StoreEntity> | FindOptionsWhere<StoreEntity>[]): Promise<number>;
}
```

```ts
// apps/user-service/src/store/repositories/store.repository.ts — admin store.repository.ts 의 같은 이름 메서드를 옮기거나(insertApplication · deleteApplication · deleteApplicationFiles · findStores) 복사한다(나머지).
// 빌더도 같이: buildApplicationListQuery(:124-134) · buildStoreFileRowsQuery(:224-250 — store_application_id 열만 쓴다) · buildDeleteApplicationFilesQuery(:339-354)
// insertStoreFile 의 UK_StoreFile_FileKey → 400 분기 · 통일 500 · notDeleted 그대로. 게터: applications · storeFiles · storeFilePurposes · stores.
@Injectable()
export class StoreRepository implements StoreRepositoryInterface {
    constructor(private readonly txHost: TransactionHost<TransactionalAdapterTypeOrm>) {}
    // … 위 15개 메서드 + 빌더 3개 (본문 = admin store.repository.ts 의 같은 메서드)
}
```

```ts
// apps/user-service/src/store/store.util.ts — admin store.util.ts 에서 옮긴다(본문 같다)
// 옮김: toMyApplicationItem · toMyApplicationFile · toMyApplicationDetail · buildApplicationFileKey · isApplicationFileKey · (파일 전용) applicationFilePrefix
// 복사: (파일 전용) issueFileKey · isIssuedFileKey — admin 의 업체 사진 키(buildStoreFileKey)도 쓴다
import {randomUUID} from 'node:crypto';
import type {StoreMyApplicationItemResultDto} from '@app/contracts/store/dto/store-my-application-list.dto.js';
import type {StoreMyApplicationFileResultDto, StoreMyApplicationResultDto} from '@app/contracts/store/dto/store-my-application.dto.js';
import type {StoreApplicationEntity} from '@app/database/entities/store/store-application.entity.js';
import type {StoreFileRow} from './interfaces/store.repository.interface.js';
import {STORE_FILE_EXTENSION} from './store.constants.js';

function applicationFilePrefix(is_private: number, store_application_id: string): string {
    return is_private === 1 ? `private/store-application/${store_application_id}` : `store/application/${store_application_id}`;
}
// … issueFileKey · isIssuedFileKey · buildApplicationFileKey · isApplicationFileKey · toMyApplicationItem · toMyApplicationFile · toMyApplicationDetail (원본 그대로)
```

```ts
// apps/user-service/src/store/store.service.ts — admin store.service.ts:133-380 의 7개 메서드를 그대로 옮긴다. JSDoc 의 경로만:
//   (RabbitMQ: admin.store.application) → (RabbitMQ: user.store.application) … application-cancel · application-file · application-file-delete 도 같다
//   (내부 HTTP: GET /internal/v1/admin-service/store/application/mine…) → /internal/v1/user-service/store/application/mine…
/**
 * store 비즈니스 로직 (이용자 입점 신청) — 신청 · 취소 · 업체 정보 파일 · 내 신청. 총관리자의 신청 관리 · 승인 · 반려는 admin-service store 다(기능은 행위자로 서버를 고른다 — 사용자 결정 2026-11-07).
 */
@Injectable()
export class StoreService {
    /**
     * @param storeRepository store repository 포트
     * @param storageGateway 파일 저장소 포트 (Amazon S3 · CloudFront — 업로드 주소 · 존재 확인 · 삭제 · 열람 주소)
     */
    constructor(
        @Inject(STORE_REPOSITORY) private readonly storeRepository: StoreRepositoryInterface,
        @Inject(STORAGE_GATEWAY) private readonly storageGateway: StorageGatewayInterface,
    ) {}

    @Transactional()
    async apply(user_id: string, dto: StoreApplicationDto): Promise<StoreApplicationResultDto> {/* 원본 :143-180 */}
    async getMyApplicationList(user_id: string, dto: StoreMyApplicationListDto): Promise<StoreMyApplicationListResultDto> {/* 원본 :189-201 */}
    async getMyApplication(user_id: string, store_application_id: string): Promise<StoreMyApplicationResultDto> {/* 원본 :210-223 */}
    async createMyApplicationFileUploadUrl(user_id: string, store_application_id: string, dto: StoreApplicationFileUploadUrlDto): Promise<StoreApplicationFileUploadUrlResultDto> {/* 원본 :233-259 */}
    @Transactional()
    async addMyApplicationFile(user_id: string, store_application_id: string, dto: StoreApplicationFileDto): Promise<StoreApplicationFileResultDto> {/* 원본 :271-317 */}
    @Transactional()
    async removeMyApplicationFile(user_id: string, store_application_id: string, store_file_id: string): Promise<void> {/* 원본 :327-346 */}
    @Transactional()
    async cancelMyApplication(user_id: string, store_application_id: string): Promise<void> {/* 원본 :356-380 */}
}
```

```ts
// apps/user-service/src/store/controllers/store.controller.ts — admin store.controller.ts 의 내 신청 핸들러 3개를 옮긴다(데코레이터 · 본문 같다)
/**
 * store 내부 HTTP 인바운드 어댑터 (이용자 입점 신청) — 게이트웨이의 동기 경로(내 신청 목록 · 상세 · 업로드 주소)만 받는다(외부 비공개, Swagger 없음). 로그인 이용자는 게이트웨이가 넘긴 actor 헤더에서 꺼낸다.
 */
@Controller('/internal/v1/user-service/store')
export class StoreController {
    constructor(private readonly storeService: StoreService) {}

    /** 내 입점 신청 목록 */
    @Get('/application/mine')
    @HttpCode(200)
    async getMyApplicationList(@InternalActor('user_id') user_id: string, @Query() query: StoreMyApplicationListDto): Promise<StoreMyApplicationListResultDto> {
        const dto = new StoreMyApplicationListDto(query);
        return this.storeService.getMyApplicationList(user_id, dto);
    }
    // GET /application/mine/:store_application_id · POST /application/mine/:store_application_id/file/upload-url — 원본 그대로
}
```

```ts
// apps/user-service/src/store/controllers/store.controller.queue.ts — admin store.controller.queue.ts 의 신청자 핸들러 4개(:47 · :57 · :68 · :78)를 옮긴다
/**
 * store 큐 인바운드 어댑터 (이용자 입점 신청) — `user.store.application*` 명령을 service 로 넘긴다(위임만).
 */
@Injectable()
export class StoreQueueController {
    constructor(private readonly storeService: StoreService) {}

    /** 입점 신청 — 이용자 */
    @OnCommand(STORE_USER_COMMAND.APPLICATION)
    async apply(command: MessageEnvelope<StoreApplicationDto>): Promise<StoreApplicationResultDto> {
        return this.storeService.apply(requireActor(command).user_id, command.payload);
    }
    // APPLICATION_CANCEL · APPLICATION_FILE · APPLICATION_FILE_DELETE — 원본 그대로, STORE_COMMAND → STORE_USER_COMMAND
}
```

```ts
// apps/user-service/src/store/store.module.ts
/**
 * store 도메인 (이용자 입점 신청) — 인바운드 어댑터 2종이 같은 service 를 부른다. 파일 저장소 포트(STORAGE_GATEWAY)는 루트 모듈의 StorageModule 이 전역으로 준다.
 * - StoreController(controllers/store.controller.ts): 내부 HTTP — 내 신청 목록 · 상세 · 업로드 주소
 * - StoreQueueController(controllers/store.controller.queue.ts): RabbitMQ — 신청 · 취소 · 파일 등록 · 삭제 (`@OnCommand` provider)
 */
@Module({controllers: [StoreController], providers: [StoreService, StoreQueueController, {provide: STORE_REPOSITORY, useClass: StoreRepository}]})
export class StoreModule {}
```

```ts
// apps/gateway/src/api/v1/user-service/store/controllers/store.controller.queue.ts — admin-service store 게이트웨이의 이용자 가드 핸들러 4개를 옮긴다(데코레이터 같다)
/**
 * 입점 신청 공개 API — 큐 경로(RabbitMQ `user.store.application*` → user-service + 요청 단위 SSE). 모두 이용자 가드. path param 은 payload 에 합쳐 보낸다.
 */
@ApiTags('입점 신청')
@Controller('/api/v1/user-service/store')
export class StoreQueueController {
    constructor(private readonly commandStream: CommandStreamService) {}

    // @Post('/application') … apply — {type: STORE_USER_COMMAND.APPLICATION, …}
    // @Delete('/application/mine/:store_application_id') … cancelMyApplication — STORE_USER_COMMAND.APPLICATION_CANCEL
    // @Post('/application/mine/:store_application_id/file') … addMyApplicationFile — STORE_USER_COMMAND.APPLICATION_FILE
    // @Delete('/application/mine/:store_application_id/file/:store_file_id') … removeMyApplicationFile — STORE_USER_COMMAND.APPLICATION_FILE_DELETE
}

// apps/gateway/src/api/v1/user-service/store/controllers/store.controller.ts — 동기 3개, 대상 'user'
@ApiTags('입점 신청')
@Controller('/api/v1/user-service/store')
export class StoreController {
    constructor(private readonly internalHttp: InternalHttpClient) {}
    // getMyApplicationList   → this.internalHttp.request<StoreMyApplicationListResultDto>('user', 'GET', STORE_USER_INTERNAL_PATH.MY_APPLICATION_LIST, {actor, query: dto})
    // getMyApplication       → ('user', 'GET', STORE_USER_INTERNAL_PATH.myApplication(param.store_application_id), {actor})
    // createMyApplicationFileUploadUrl → ('user', 'POST', STORE_USER_INTERNAL_PATH.myApplicationFileUploadUrl(param.store_application_id), {actor, body: dto})
}

// apps/gateway/src/api/v1/user-service/store/store.module.ts
/** 입점 신청 라우트 모듈(/api/v1/user-service/store — 이용자 가드) — controllers 는 [동기, 큐] 순 */
@Module({controllers: [StoreController, StoreQueueController]})
export class StoreModule {}
```

```ts
// apps/gateway/src/gateway.module.ts — 이름이 같은 도메인 모듈은 별칭으로 들인다
import {ReservationModule as AdminReservationModule} from './api/v1/admin-service/reservation/reservation.module.js';
import {StoreModule} from './api/v1/admin-service/store/store.module.js';
import {StoreModule as UserStoreModule} from './api/v1/user-service/store/store.module.js';
// imports: […, ReservationModule, DiscoveryModule, UserStoreModule, …, StoreModule, RoomModule, AdminReservationModule]
// 주석: StoreModule(/api/v1/admin-service/store — 관리자 · 매니저 가드) · UserStoreModule(/api/v1/user-service/store — 이용자 가드) · AdminReservationModule(/api/v1/admin-service/reservation — 매니저 가드)
```

```ts
// apps/admin-service/src/store — 지우는 것
// controllers/store.controller.ts · store.controller.queue.ts 의 신청자 핸들러 7개와 그 DTO import
// store.service.ts :133-380 메서드 7개 + import(:3 In · :13 · :14 · :17 · :33 · :34 DTO · :54 STORE_BUSINESS_NUMBER_TAKEN_MESSAGE · :76 · :84 · :98-100 util), 클래스 주석 "입점 신청(이용자)"
// store.util.ts applicationFilePrefix · buildApplicationFileKey · isApplicationFileKey · toMyApplicationItem · toMyApplicationFile · toMyApplicationDetail + :15 · :16 DTO import
// interfaces · repositories: insertApplication · deleteApplication · deleteApplicationFiles · buildDeleteApplicationFilesQuery · findStores
// 남는 것: findApplication · countApplications · findApplicationList · findStoreFilePurpose · findApplicationFileRows · countStoreFiles · findStoreFile · insertStoreFile · deleteStoreFile · findStore · countStores (총관리자 · 업체 관리자 기능이 쓴다)
// gateway admin-service store: 이용자 가드 핸들러 7개 · PassportJwtAuthGuard import 삭제, store.module.ts 주석 "(이용자 가드: …)" 삭제
```

### 4. C — admin-service `reservation` 도메인 (매니저 예약)

```ts
// apps/admin-service/src/reservation/reservation.symbols.ts
/** reservation repository 포트 토큰 (매니저 예약) */
export const RESERVATION_REPOSITORY = Symbol('ReservationRepositoryInterface');
```

```ts
// apps/admin-service/src/reservation/reservation.constants.ts — user-service reservation.constants.ts 에서 매니저 기능이 쓰는 것(문구 같다)
import {RESERVATION_STATE} from '@app/contracts/reservation/reservation.constants.js';

/** 호실 상태 — 사용중지(옮길 수 없는 호실) */
export const RESERVATION_ROOM_STATE_DISABLED = 'DISABLED';

/** 업체 탈퇴 상태 — 매니저의 소속 업체에서 뺀다 (store 도메인 상수는 import 하지 않는다) */
export const RESERVATION_STORE_STATE_LEAVE = 'LEAVE';

/** 업체 예약 현황에 나오는 예약 상태 — 결제 대기 · 확정 · 이용 중 · 이용 완료 */
export const RESERVATION_STORE_VISIBLE_STATES: string[] = [RESERVATION_STATE.PENDING, RESERVATION_STATE.CONFIRMED, RESERVATION_STATE.CHECKED_IN, RESERVATION_STATE.COMPLETED];

/** 날짜 형식 — 한국 날짜 */
export const RESERVATION_DATE_FORMAT = 'YYYY-MM-DD';

/** 예약을 찾을 수 없음 — 다른 업체 예약 포함 */
export const RESERVATION_NOT_FOUND_MESSAGE = '예약을 찾을 수 없습니다.';

/** 호실을 찾을 수 없음 */
export const RESERVATION_ROOM_NOT_FOUND_MESSAGE = '호실을 찾을 수 없습니다.';

/** 매니저의 소속 업체를 찾을 수 없음 — 탈퇴 · 지운 업체 포함 */
export const RESERVATION_MANAGER_STORE_NOT_FOUND_MESSAGE = '소속 업체를 찾을 수 없습니다.';

/** 없는 날짜 */
export const RESERVATION_DATE_INVALID_MESSAGE = '없는 날짜입니다.';

/** 옮길 호실의 점유 예약과 겹침 — 배타 제약 23P01 */
export const RESERVATION_ROOM_TAKEN_MESSAGE = '옮길 호실에 겹치는 예약이 있습니다.';

/** 상태 조건을 건 쓰기가 0행 — 그 사이 바뀌었다(crontab · 다른 요청) */
export const RESERVATION_STATE_CHANGED_MESSAGE = '예약 상태가 바뀌었습니다. 다시 확인해주세요.';

/** 취소할 수 없는 상태 */
export const RESERVATION_NOT_CANCELABLE_MESSAGE = '취소할 수 없는 예약입니다.';
```

```ts
// apps/admin-service/src/reservation/interfaces/reservation.repository.interface.ts
/** 업체 현황 호실 행 — StoreRoomRow (user-service 에서 옮긴다, 필드 같다) */
/** 업체 현황 예약 행 — StoreReservationRow (user-service 에서 옮긴다, 필드 같다) */

/**
 * reservation repository 포트 (매니저 예약) — 공유 DB 의 예약 · 구간 · 결제 · QR 이력과, reservation 어휘로 읽는 업체 · 호실 · 회원.
 */
export interface ReservationRepositoryInterface {
    /** 매니저의 소속 업체 (탈퇴 업체 · 지운 업체 제외) — lock 이면 업체 행을 잠근다(쓰기 트랜잭션 안에서만) */
    findManagerStore(user_id: string, lock: boolean): Promise<StoreEntity | null>;
    /** 회원 단건 — 이용자 연락처(SMS) */
    findReservationUser(where: FindOptionsWhere<UserEntity>): Promise<UserEntity | null>;
    findReservationStore(where: FindOptionsWhere<StoreEntity>): Promise<StoreEntity | null>;
    findReservationRoom(where: FindOptionsWhere<RoomEntity>): Promise<RoomEntity | null>;
    findReservation(where: FindOptionsWhere<ReservationEntity>): Promise<ReservationEntity | null>;
    findReservationDetails(where: FindOptionsWhere<ReservationDetailEntity>): Promise<ReservationDetailEntity[]>;
    updateReservation(where: FindOptionsWhere<ReservationEntity>, entity: ReservationEntity): Promise<boolean>;
    changeReservationRoom(where: FindOptionsWhere<ReservationEntity>, entity: ReservationEntity): Promise<boolean>;
    updateReservationDetails(where: FindOptionsWhere<ReservationDetailEntity>, entity: ReservationDetailEntity): Promise<void>;
    updatePayment(where: FindOptionsWhere<PaymentEntity>, entity: PaymentEntity): Promise<boolean>;
    findStoreRoomRows(store_id: string): Promise<StoreRoomRow[]>;
    findStoreReservationRows(store_id: string, from: Date, to: Date): Promise<StoreReservationRow[]>;
    findRoomQr(where: FindOptionsWhere<RoomQrEntity>): Promise<RoomQrEntity | null>;
    updateRoomQr(where: FindOptionsWhere<RoomQrEntity>, entity: RoomQrEntity): Promise<void>;
}
```

```ts
// apps/admin-service/src/reservation/repositories/reservation.repository.ts
// 옮김: findReservationUser · changeReservationRoom(배타 제약 → 400 RESERVATION_ROOM_TAKEN_MESSAGE) · findStoreRoomRows + buildStoreRoomsQuery · findStoreReservationRows + buildStoreReservationsQuery · updateRoomQr · users 게터
// 복사: findReservationStore · findReservationRoom · findReservation · findReservationDetails · updateReservation · updateReservationDetails · updatePayment · findRoomQr (user-service 에도 남는다)
// 새로(옆 도메인 room.repository.ts:81-113 과 같은 방식):
    /**
     * 매니저의 소속 업체 — 매니저 그룹 회원의 업체, 탈퇴 업체 · 지운 업체 제외
     *
     * @param user_id 로그인 매니저 ID
     * @param lock 업체 행 잠금 여부 (쓰기 트랜잭션 안에서만 true)
     * @returns 업체 또는 null
     */
    async findManagerStore(user_id: string, lock: boolean): Promise<StoreEntity | null> {
        try {
            return await this.buildManagerStoreQuery(user_id, lock).getOne();
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 매니저의 소속 업체 쿼리 — t_user 조인(매니저 그룹) · 탈퇴 아님 · 지워지지 않은 업체. 매핑 민감(조인 · 잠금)이라 Data-Access Smoke spec 으로 SQL 을 고정한다.
     *
     * @param user_id 로그인 매니저 ID
     * @param lock 업체 행 잠금 여부
     * @returns 쿼리 빌더
     */
    buildManagerStoreQuery(user_id: string, lock: boolean): SelectQueryBuilder<StoreEntity> {
        const query = this.stores
            .createQueryBuilder('s')
            .innerJoin(UserEntity, 'u', 'u.store_id = s.store_id')
            .where('u.user_id = :user_id', {user_id})
            .andWhere('u.login_scope = :login_scope', {login_scope: LOGIN_SCOPE.MANAGER})
            .andWhere('s.store_state_id <> :leave', {leave: RESERVATION_STORE_STATE_LEAVE})
            .andWhere('s.is_deleted = 0')
            .loadAllRelationIds();
        return lock ? query.setLock('pessimistic_write', undefined, ['s']) : query;
    }
```

```ts
// apps/admin-service/src/reservation/reservation.util.ts — user-service reservation.util.ts 에서
// 옮김: buildStoreCancelSms · buildRoomChangeSms · toStoreReservationRooms
// 복사: isValidDate · toKstDay · nowKst · isRoomQrActive · (파일 전용) toIso — 이용자 예약도 쓴다
import {dayjs, KST_TIMEZONE} from '@app/common/utils/dayjs.js';
import type {Dayjs} from '@app/common/utils/dayjs.js';
// … 본문 같다
```

```ts
// apps/admin-service/src/reservation/reservation.service.ts — user-service reservation.service.ts:560-707 을 옮긴다. 매니저 소속 업체 찾기만 옆 도메인 방식으로 바꾼다(spec 업무 규칙)
/**
 * reservation 비즈니스 로직 (매니저 예약) — 내 업체 예약 현황 · 업체 취소 · 호실 이동. 이용자 예약(예약 가능 시간 · 예약 · 결제 · 취소 · 내 예약 · QR)은 user-service reservation 이다(기능은 행위자로 서버를 고른다 — 사용자 결정 2026-11-07).
 */
@Injectable()
export class ReservationService {
    /**
     * @param reservationRepository reservation repository 포트
     * @param smsSender SMS 발송 포트(업체 취소 · 호실 이동 안내)
     * @param doorStore 문 정보 포트(Redis — 이용 중 업체 취소 때 현재 QR 지우기)
     */
    constructor(
        @Inject(RESERVATION_REPOSITORY) private readonly reservationRepository: ReservationRepositoryInterface,
        @Inject(SMS_SENDER) private readonly smsSender: SmsSenderInterface,
        @Inject(DOOR_STORE) private readonly doorStore: DoorStoreInterface,
    ) {}

    /**
     * 내 업체 예약 현황 (매니저) — 날짜(한국 날짜) 하루와 겹치는 결제 대기 · 확정 · 이용 중 · 이용 완료 예약을 호실별로(이용자 이름 · 휴대폰 포함). (내부 HTTP: GET /internal/v1/admin-service/reservation/store)
     */
    async getStoreReservations(user_id: string, dto: ReservationStoreDto): Promise<ReservationStoreResultDto> {
        // 1. 날짜
        if (!isValidDate(dto.date)) {
            throw new BadRequestException({message: RESERVATION_DATE_INVALID_MESSAGE, validation_errors: createValidationError('date', RESERVATION_DATE_INVALID_MESSAGE)});
        }

        // 2. 매니저의 소속 업체 (탈퇴 · 지운 업체 제외 — 옆 도메인과 같은 방식)
        const store = await this.reservationRepository.findManagerStore(user_id, false);
        if (!store) {
            throw new NotFoundException({message: RESERVATION_MANAGER_STORE_NOT_FOUND_MESSAGE});
        }

        // 3. 호실 · 그날 예약
        const day = toKstDay(dto.date);
        const rooms = await this.reservationRepository.findStoreRoomRows(store.store_id);
        const rows = await this.reservationRepository.findStoreReservationRows(store.store_id, day.toDate(), day.add(1, 'day').toDate());
        return {date: dto.date, list: toStoreReservationRooms(rooms, rows)};
    }

    /**
     * 업체 취소 (매니저) — … (RabbitMQ: admin.reservation.store-cancel)
     */
    @Transactional()
    async cancelStoreReservation(user_id: string, reservation_id: string, dto: ReservationStoreCancelDto): Promise<void> {
        // 1. 매니저의 소속 업체 · 그 업체 예약
        const store = await this.reservationRepository.findManagerStore(user_id, false);
        if (!store) {
            throw new NotFoundException({message: RESERVATION_MANAGER_STORE_NOT_FOUND_MESSAGE});
        }
        const reservation = await this.reservationRepository.findReservation({reservation_id, store_id: store.store_id});
        // … 2 ~ 5 원본 :607-654 그대로 (예약 · 구간 취소 → 이용 중 QR 끝내기 → 결제 → 이용자 SMS 마지막)
    }

    /**
     * 호실 이동 (매니저) — … (RabbitMQ: admin.reservation.room-change)
     */
    @Transactional()
    async changeReservationRoom(user_id: string, reservation_id: string, dto: ReservationRoomChangeDto): Promise<void> {
        // 1. 매니저의 소속 업체 · 그 업체 예약
        const store = await this.reservationRepository.findManagerStore(user_id, false);
        if (!store) {
            throw new NotFoundException({message: RESERVATION_MANAGER_STORE_NOT_FOUND_MESSAGE});
        }
        const reservation = await this.reservationRepository.findReservation({reservation_id, store_id: store.store_id});
        // … 원본 :670-706 그대로, manager.store_id → store.store_id, RESERVATION_ROOM_STATE.DISABLED → RESERVATION_ROOM_STATE_DISABLED
    }
}
```

```ts
// apps/admin-service/src/reservation/controllers/reservation.controller.ts
/**
 * reservation 내부 HTTP 인바운드 어댑터 (매니저 예약) — 게이트웨이의 동기 경로(업체 예약 현황)만 받는다(외부 비공개, Swagger 없음). 로그인 매니저는 게이트웨이가 넘긴 actor 헤더에서 꺼낸다.
 */
@Controller('/internal/v1/admin-service/reservation')
export class ReservationController {
    constructor(private readonly reservationService: ReservationService) {}

    /**
     * 내 업체 예약 현황 (매니저)
     */
    @Get('/store')
    @HttpCode(200)
    async getStoreReservations(@InternalActor('user_id') user_id: string, @Query() query: ReservationStoreDto): Promise<ReservationStoreResultDto> {
        const dto = new ReservationStoreDto(query);
        return this.reservationService.getStoreReservations(user_id, dto);
    }
}

// apps/admin-service/src/reservation/controllers/reservation.controller.queue.ts
@Injectable()
export class ReservationQueueController {
    constructor(private readonly reservationService: ReservationService) {}

    /** 업체 취소 — 매니저 */
    @OnCommand(RESERVATION_MANAGER_COMMAND.STORE_CANCEL)
    async cancelStoreReservation(command: MessageEnvelope<ReservationStoreCancelParamDto & ReservationStoreCancelDto>): Promise<void> {
        return this.reservationService.cancelStoreReservation(requireActor(command).user_id, command.payload.reservation_id, command.payload);
    }

    /** 호실 이동 — 매니저 */
    @OnCommand(RESERVATION_MANAGER_COMMAND.ROOM_CHANGE)
    async changeReservationRoom(command: MessageEnvelope<ReservationRoomChangeParamDto & ReservationRoomChangeDto>): Promise<void> {
        return this.reservationService.changeReservationRoom(requireActor(command).user_id, command.payload.reservation_id, command.payload);
    }
}

// apps/admin-service/src/reservation/reservation.module.ts
/**
 * reservation 도메인 (매니저 예약) — 업체 예약 현황 · 업체 취소 · 호실 이동. SMS 포트(SMS_SENDER) · 문 정보 포트(DOOR_STORE)는 루트 모듈의 SmsModule · DoorStoreModule 이 전역으로 준다.
 * - ReservationController(controllers/reservation.controller.ts): 내부 HTTP — 업체 예약 현황
 * - ReservationQueueController(controllers/reservation.controller.queue.ts): RabbitMQ — 업체 취소 · 호실 이동 (`@OnCommand` provider)
 */
@Module({controllers: [ReservationController], providers: [ReservationService, ReservationQueueController, {provide: RESERVATION_REPOSITORY, useClass: ReservationRepository}]})
export class ReservationModule {}

// apps/admin-service/src/admin-service.module.ts — imports 에 ReservationModule, 주석 갱신
// * 도메인: … store(업체 · 입점 신청 관리 · 업체 정보 파일) · room(…) · reservation(업체 예약 현황 · 업체 취소 · 호실 이동)
// * - SmsModule: … 입점 승인 안내 · 업체 취소 · 호실 이동 안내
// * - DoorStoreModule: … 호실 목록 문 상태 · 바로 열기 · 이용 중 업체 취소 때 QR 지우기
```

```ts
// apps/gateway/src/api/v1/admin-service/reservation/controllers/reservation.controller.ts — user-service 게이트웨이의 업체 현황 핸들러를 옮긴다(데코레이터 같다)
/**
 * 업체 예약 공개 API — 동기 경로(내부 HTTP → admin-service). 매니저 가드(내 업체 예약만). 쓰기(큐)는 같은 경로 접두의 reservation.controller.queue.ts.
 */
@ApiTags('업체 예약')
@Controller('/api/v1/admin-service/reservation')
export class ReservationController {
    constructor(private readonly internalHttp: InternalHttpClient) {}

    /**
     * 내 업체 예약 현황 (업체 관리자) — 날짜 하루와 겹치는 예약을 호실별로
     */
    @Get('/store')
    @UseGuards(PassportJwtManagerAuthGuard)
    @HttpCode(200)
    @ApiBearerAuth()
    @ApiOperation({summary: '내 업체 예약 현황'})
    @ApiOkResponse({type: ReservationStoreResultDto})
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async getStoreReservations(@PassportActor() actor: Actor, @Query() query: ReservationStoreDto): Promise<ReservationStoreResultDto> {
        const dto = new ReservationStoreDto(query);
        return this.internalHttp.request<ReservationStoreResultDto>('admin', 'GET', RESERVATION_MANAGER_INTERNAL_PATH.STORE, {actor, query: dto});
    }
}

// .../controllers/reservation.controller.queue.ts — 업체 취소 · 호실 이동 핸들러를 옮긴다(데코레이터 같다), 명령만:
//   {type: RESERVATION_MANAGER_COMMAND.STORE_CANCEL, …} · {type: RESERVATION_MANAGER_COMMAND.ROOM_CHANGE, …}
@ApiTags('업체 예약')
@Controller('/api/v1/admin-service/reservation')
export class ReservationQueueController {
    constructor(private readonly commandStream: CommandStreamService) {}
    // @Patch('/:reservation_id/store-cancel') … @Patch('/:reservation_id/room') …
}

// .../reservation.module.ts
/** 업체 예약 라우트 모듈(/api/v1/admin-service/reservation — 매니저 가드) — controllers 는 [동기, 큐] 순 */
@Module({controllers: [ReservationController, ReservationQueueController]})
export class ReservationModule {}
```

```ts
// apps/user-service/src/reservation — 지우는 것
// reservation.service.ts :560-707 메서드 3개, SMS_SENDER 주입(:89 · :95) · SmsSenderInterface import · LOGIN_SCOPE import(다른 곳이 안 쓰면), 주석 :81
// reservation.util.ts buildStoreCancelSms · buildRoomChangeSms · toStoreReservationRooms · :5 DTO import — isRoomQrActive 주석의 "업체 취소" 문구도
// reservation.constants.ts RESERVATION_STORE_VISIBLE_STATES · RESERVATION_MANAGER_STORE_NOT_FOUND_MESSAGE · RESERVATION_ROOM_TAKEN_MESSAGE
//   (RESERVATION_ROOM_STATE 는 isStayBookable 이 쓴다 — 남는다)
// interfaces · repositories: StoreRoomRow · StoreReservationRow · findReservationUser · changeReservationRoom · findStoreRoomRows · buildStoreRoomsQuery
//   · findStoreReservationRows · buildStoreReservationsQuery · updateRoomQr · users 게터 · RoomStateEntity · UserEntity import
// controllers: 업체 현황 핸들러 · 업체 취소 · 호실 이동 @OnCommand, DTO import, 주석
// reservation.module.ts 주석: "SMS 포트(SMS_SENDER)" · "업체 현황" 삭제
// gateway user-service reservation: 매니저 핸들러 3개 · PassportJwtManagerAuthGuard · ReservationStore* · ReservationRoomChange* · ReservationStoreCancel* import, 주석
```

### 5. 테스트 도우미

```ts
// apps/user-service/src/door/test/door.test-helper.ts — admin room.test-helper.ts 에서 문 spec 이 쓰는 것만(본문 같다)
export const TEST_INTERNAL_TOKEN = 'test-internal-token';
export const STORE_ID = 'b'.repeat(32);
export const ROOM_ID = 'f'.repeat(32);
export type DoorRepositoryMock = {[K in keyof DoorRepositoryInterface]: Mock};
export type DoorStoreMock = {[K in keyof DoorStoreInterface]: Mock};

/** door repository mock — 업체 · 호실은 null, 목록은 빈 배열 */
export function createDoorRepositoryMock(): DoorRepositoryMock {
    return {findDoorStore: vi.fn(), findDoorRoom: vi.fn(), findStoreDoorRoomRows: vi.fn().mockResolvedValue([])};
}
// createDoorStoreMock · DOOR_TIME_CASES · storeRow · roomEntity · internalHeaders — room.test-helper.ts 와 같은 값

/** 동기 경로 부팅 — 실제 DoorController + DoorService + ValidationPipe + 필터 + 전역 InternalAuthGuard · ReturnedExceptionInterceptor(user-service.module 과 같다), repository · 문 정보 포트만 mock */
export async function bootHttpPath(repo: DoorRepositoryMock, door: DoorStoreMock = createDoorStoreMock()): Promise<INestApplication> {
    process.env.INTERNAL_API_TOKEN = TEST_INTERNAL_TOKEN;
    const module = await Test.createTestingModule({
        controllers: [DoorController],
        providers: [
            DoorService,
            {provide: DOOR_REPOSITORY, useValue: repo},
            {provide: DOOR_STORE, useValue: door},
            {provide: APP_GUARD, useClass: InternalAuthGuard},
            {provide: APP_INTERCEPTOR, useClass: ReturnedExceptionInterceptor},
        ],
    }).compile();
    const app = module.createNestApplication();
    app.useGlobalFilters(new CustomErrorFilter());
    app.useGlobalPipes(new ValidationPipe({transform: true, forbidNonWhitelisted: true, exceptionFactory: validationExceptionFactory}));
    await app.init();
    return app;
}
```

```ts
// apps/user-service/src/store/test/store.test-helper.ts — admin store.test-helper.ts 에서 신청자 spec 이 쓰는 것(값 같다)
//   TEST_REPLY_TO · TEST_INTERNAL_TOKEN · FIXED_TIME · USER_ACTOR · APPLICATION_ID · STORE_ID · STORE_CODE
//   StoreRepositoryMock(새 인터페이스 15개 키) · StorageGatewayMock · createStoreRepositoryMock · createStorageGatewayMock
//   bootCommandPath(repo, storage) — providers: StoreService · StoreQueueController · CommandHandlerRegistry · CommandDispatcher · STORE_REPOSITORY · STORAGE_GATEWAY (SMS · DOOR 없음)
//   bootHttpPath(repo, storage) — controllers: [StoreController], 전역 InternalAuthGuard · ReturnedExceptionInterceptor · CustomErrorFilter · ValidationPipe
//   internalHeaders · runCommand · applicationRow · fileRow · storeRow
// apps/admin-service/src/reservation/test/reservation.test-helper.ts — user-service reservation.test-helper.ts 에서 매니저 spec 이 쓰는 것(값 같다)
//   MANAGER_ACTOR · USER_ACTOR · STORE_ID · ROOM_GROUP_ID · ROOM_ID · ROOM_ID_2 · RESERVATION_ID · PAYMENT_ID · ROOM_QR_ID · QR
//   ReservationRepositoryMock(새 인터페이스 14개 키 — findManagerStore 기본값 storeEntity()) · SmsSenderMock · DoorStoreMock
//   bootCommandPath(repo, sms, door) · bootHttpPath(repo) · storeEntity · roomEntity · reservationEntity · detailEntity · roomQrEntity · internalHeaders · runCommand · validateBody
// 원래 자리의 도우미: 옮긴 메서드의 mock 키를 뺀다(mapped type 이라 남기면 typecheck 실패)
//   room.test-helper.ts :116-117 · store.test-helper.ts :72 · :74 · :82 · :85 · reservation.test-helper.ts :92 · :97 · :104 · :105 · :108
//   user-service reservation.test-helper.ts 는 MANAGER_ACTOR · SmsSenderMock · createSmsSenderMock · bootCommandPath 의 sms 인자 · bootHttpPath 의 SMS_SENDER 를 뺀다
//   → reservation-payment-confirm.spec.ts:54 는 bootCommandPath(repo, payment, door)
```

---

## Test Cases

```
기존 spec 을 그대로 옮긴다. 케이스 · 단언은 같고, 경로 · 명령 type · 부팅 도우미만 바뀐다. 새 계산 유닛은 없다.
[CASES:toDoorTime] 지금(UTC) → 문 시각(한국 yyyyMMddHHmmss) — 기존 DOOR_TIME_CASES 그대로(문 소켓 잠금 spec)
[FAIL:validation] 문 소켓 접속 — 업체 ID 형식 · 시크릿 15자 · 시크릿 특수문자 → 400, 업체 조회 없음
[FAIL:validation] 문 소켓 QR 확인 · 잠금 — 업체 ID · 호실 ID · QR 형식 → 400, 호실 조회 없음
[FAIL:validation] 입점 신청 파일 업로드 주소 · 내 신청 상세 — 신청 ID · 용도 · MIME 형식 → 400
[FAIL:validation] 업체 예약 현황 날짜 형식 · 업체 취소 사유 없음 → 400
[FAIL:duplicate] 입점 신청 — 같은 사업자번호의 대기 신청 · 등록 업체 → 400 validation_errors.business_number
[FAIL:duplicate] 호실 이동 — 옮길 호실 점유 겹침(배타 제약) → failed 400, SMS 없음
[SECURITY] actor 없는 명령 → failed 401 · 내부 토큰 없는 요청 → 403
[SMOKE:data-access] 옮긴 쿼리의 SQL 그대로: 문 소켓 업체(find 조건) · 업체 호실 문 목록 / 신청 파일 삭제(UPDATE) · 내 신청 목록 · 신청 파일 행 / 업체 현황 호실 · 예약 / + admin-service reservation 의 매니저 소속 업체(조인 · 탈퇴 제외)
테스트 생략(위임형): gateway 라우트 · 모듈 등록 · contracts 경로 상수 — 프로젝트 규칙상 gateway · controller spec 을 두지 않는다
```

옮기는 spec 과 바뀌는 단언 — 위 케이스의 프로젝트 형태다(spec 파일 = 서비스 기능 spec · repository spec 만).

| 새 위치 | 원본 | 바뀌는 것 |
|---|---|---|
| `apps/user-service/src/door/test/door-snapshot.spec.ts` | `room-door-snapshot.spec.ts` | describe 경로 `/internal/v1/user-service/door/snapshot`, mock `findDoorStore` · `findStoreDoorRoomRows` 그대로 |
| `door-verify.spec.ts` · `door-close.spec.ts` | `room-door-verify.spec.ts` · `room-door-close.spec.ts` | 경로 `/verify` · `/close`, `findRoom` → `findDoorRoom` |
| `door.repository.spec.ts` | `room.repository.spec.ts:334-348 · :392-397 · :571-595` + it.each 행 :310 | `RoomRepository` → `DoorRepository`, `findDoorRoom` 의 notDeleted · 통일 500 을 더한다(`findRoom` 이 하던 것) |
| `apps/user-service/src/store/test/` 7 spec | admin `store/test/` 같은 이름 | 명령 `STORE_USER_COMMAND.*` · 결과 type `user.store.application.done`, 경로 `/internal/v1/user-service/store/…`, 부팅에서 SMS · DOOR mock 을 뺀다 |
| `apps/user-service/src/store/test/store.repository.spec.ts` | admin `store.repository.spec.ts` 의 신청 · 파일 블록 | `insertStoreFile` UK 400 · notDeleted 조건(findApplication · countApplications · countStoreFiles · findStoreFile · findStore · countStores · findStores) · `deleteStoreFile` 소프트 삭제 · `deleteApplication` affected → boolean · 통일 500 표 · Smoke(내 신청 목록 — where `{user_id}` · 신청 파일 행 · 신청 파일 삭제 UPDATE) |
| `apps/admin-service/src/reservation/test/reservation-store.spec.ts` | user-service 같은 이름 | 경로 `/internal/v1/admin-service/reservation/store`, `findReservationUser({user_id, login_scope: 'MANAGER'})` → `findManagerStore(MANAGER_ACTOR.user_id, false)`, 소속 업체 없음 404 는 `findManagerStore` → null |
| `reservation-store-cancel.spec.ts` · `reservation-room-change.spec.ts` | user-service 같은 이름 | 명령 `RESERVATION_MANAGER_COMMAND.*` · 결과 type `admin.reservation.…`, 매니저 = `findManagerStore` → 업체, 이용자 연락처 = `findReservationUser({user_id})` |
| `apps/admin-service/src/reservation/test/reservation.repository.spec.ts` | user-service `reservation.repository.spec.ts` 의 매니저 블록 | `changeReservationRoom` 배타 제약 400 · `updateRoomQr` 조건 · 통일 500 표(findStoreRoomRows · findStoreReservationRows · findManagerStore) · Smoke(업체 현황 호실 · 예약 SQL 그대로 + `buildManagerStoreQuery` SQL — room.repository.spec 의 같은 쿼리와 같은 모양, 잠금 있을 때 `FOR UPDATE OF "s"`) |

원래 자리 spec 정리(같은 변경):
- admin `room.repository.spec.ts`
  - 문 블록 · `ROOM_DOOR_ROW_KEYS` · `Not` import 를 뺀다.
- admin `store.repository.spec.ts`
  - 옮긴 메서드 테스트를 뺀다(`findStores` · 통일 500 표의 3행 · 신청 파일 삭제 Smoke · 내 신청 목록 Smoke).
  - `updateApplication · deleteApplication` it.each 를 `updateApplication` 만 남겨 나눈다.
  - Smoke describe 제목에서 "신청 파일 삭제" 를 뺀다.
- user-service `reservation.repository.spec.ts`
  - 옮긴 블록을 뺀다(`changeReservationRoom` · `updateRoomQr` 줄 · 표 2행 · `STORE_*_SQL` 2개와 그 it).
  - describe 제목에서 "업체 현황" 을 뺀다.

## Response Codes

동작이 같으므로 응답도 지금과 같다. 경로만 바뀐다.

| 진입점 | 성공 | 실패 |
|---|---|---|
| `POST /internal/v1/user-service/door/snapshot` | 200 `DoorSnapshotResultDto` | 400 검증 · 401 `업체 ID 또는 시크릿 코드가 올바르지 않습니다.` · 403 내부 토큰 · 500 · 503 Redis |
| `POST …/door/verify` · `…/door/close` | 200 `{room_id, ok}` · `{room_id, door_state, door_changed_at}` | 400 검증 · 404 `호실을 찾을 수 없습니다.` · 403 · 500 · 503 |
| 입점 신청 큐 4개 (`user.store.application*`) | SSE done(신청 ID · 파일 ID · null) | 400(대기 신청 있음 · 사업자번호 중복 · 대기 아님 · 용도 · 키 · 한도 · 미업로드) · 401 actor 없음 · 404(신청 · 파일) · 503 저장소 → 재시도 · 500 |
| 입점 신청 동기 3개 | 200 목록 · 상세 · 업로드 주소 | 400 검증 · 401 가드 · 403 내부 토큰 · 404 신청 · 503 저장소 · 500 |
| `GET /api/v1/admin-service/reservation/store` | 200 호실별 예약 | 400 날짜 · 401 가드 · 404 `소속 업체를 찾을 수 없습니다.` · 500 |
| 업체 취소 · 호실 이동 큐 (`admin.reservation.*`) | SSE done(null) | 400(취소 불가 · 상태 바뀜 · 같은 호실 · 다른 그룹 · 사용중지 · 겹침) · 401 · 404(소속 업체 · 예약 · 호실) · 503 SMS · Redis → 재시도 · 500 |

## 검증 (build 뒤 — AGENTS 허용 범위)
- `npm run typecheck` · `npm run lint` · `npm run build` · `npm run db:check`(엔티티 변경 없음) · `npm test`(옮긴 spec 포함 전체).
- 남은 참조가 없는지 grep 으로 확인한다:
  - 코드 · 문서: `ROOM_INTERNAL_PATH.DOOR_` · `RoomDoor` · `admin.store.application'` · `STORE_INTERNAL_PATH.MY_APPLICATION_LIST` · `myApplication(` · `RESERVATION_COMMAND.STORE_CANCEL` · `RESERVATION_COMMAND.ROOM_CHANGE` · `RESERVATION_INTERNAL_PATH.STORE` · `user.reservation.store-cancel`
  - `.beaver/output` 의 옛 문서는 기록이라 그대로 둔다.
