# Plan — 문 관리 · QR 확인 (door-manage)

## Feature Summary
- **Feature**: 문 관리 · QR 확인(로드맵 Phase 15) — 호실 목록에 문 상태 · 업체 관리자 바로 열기, 이용 시작 때 QR 발급(DB 이력 `t_room_qr` + Redis 현재 QR `door-qr:<room_id>`) · 이용자 QR 조회(없으면 그 자리에서 발급), 문 프로그램이 업체 소켓(gateway 표준 WebSocket · 업체 ID + 시크릿)으로 QR 확인(`door.verify`) · 잠금 알림(`door.closed`) · 바로 열기 명령(`door.open`)을 주고받는다. HTTP 문 열기 · 닫기 API 는 없앤다. 업체 시크릿 코드 설정
- **Entry point**: 새 공개 3개 `POST /api/v1/admin-service/room/:room_id/door-open` · `GET /api/v1/user-service/reservation/:reservation_id/qr` · `PATCH /api/v1/admin-service/store/mine/door-secret` + 소켓 `WS /ws/v1/door`(gateway) + 내부 3개(`/internal/v1/admin-service/room/door-snapshot` · `/door-verify` · `/door-close`) + crontab `reservation-qr-sync`(scheduler) + 기존 변경 3개(호실 목록 · 업체 취소 · 내 업체 상세) + 삭제 2개(`POST /api/v1/user-service/door/open` · `/close`)
- **Domain**: door (+ room · store · reservation)
- spec: `.beaver/output/spec/door/door-manage-spec.md`

---

## Prerequisites

- 로드맵 Phase 15 에 유닛 추가(#114 업체 문 시크릿 · #115 문 상태 실시간 소켓 · #112 목표 갱신 — QR 테이블 · scheduler 발급, Phase 14 #109 가 소켓으로 바뀐 메모)는 `/beaver:roadmap` 몫이라 이 plan 승인 뒤 반영한다(코드와 무관 — build 를 막지 않는다).
- 의존성 추가(build 첫 단계): `npm install ws` · `npm install -D @types/ws` — 표준 WebSocket(`ws` 8 — `@nestjs/platform-ws` 의 의존성과 같은 패키지). Nest WebSocket 어댑터(`@nestjs/websockets` · `@nestjs/platform-ws`)는 쓰지 않는다 — 업그레이드 요청을 직접 받아야 헤더 인증 실패를 업그레이드 전 HTTP 401 로 거절할 수 있다(어댑터는 연결을 맺은 뒤에야 핸들러를 부른다).
- 스키마 반영(`db:migrate`)은 사용자 몫이고 build 를 막지 않는다(AGENTS 주의사항).

---

## File List

| File | Action |
|------|------|
| `libs/database/src/entities/door/room-qr.entity.ts` | new — `t_room_qr`(호실 QR 이력 · 유효 시작 · 종료) |
| `libs/database/src/entities/store/store.entity.ts` | modified — `door_secret`(bcrypt 해시) |
| `libs/database/src/entities.ts` | modified — `RoomQrEntity` 등록 |
| `libs/database/src/migrations/<ts>-RoomQrDoorSecret.ts` | new — `npm run db:generate -- RoomQrDoorSecret` |
| `libs/database/src/migrations.ts` | modified — 생성기가 등록 |
| `libs/integration/src/interfaces/integration.interface.ts` | modified — 문 정보 포트 다시: `getMany` · `setQr` · `revokeQr` · `verify` · `open` · `close` · `subscribe`, `DoorCommand` |
| `libs/integration/src/integration.constants.ts` | modified — `DOOR_COMMAND_CHANNEL` · `DOOR_COMMAND`, QR 발급 상수 제거 |
| `libs/integration/src/integration.util.ts` | modified — `toDoorTime` (user-service door.util 에서 옮김) |
| `libs/integration/src/door/redis-door.store.ts` | modified — `door:<room_id>` = 상태:시각, `door-qr:<room_id>` = 현재 QR(PXAT), Lua(확인 + 열림 · 열림 + 명령 · 같을 때만 지우기), MGET, 구독 |
| `libs/integration/src/door/door-store.module.ts` | modified — 주석(쓰는 앱) |
| `libs/integration/src/redis/redis.connection.ts` | modified — 구독 전용 연결 `subscribe(channel, listener)` |
| `libs/contracts/src/door/door.commands.ts` | modified — 내부 경로 삭제, 소켓 경로 · 헤더 · 이벤트 이름 |
| `libs/contracts/src/door/dto/door-open.dto.ts` · `door-close.dto.ts` | **deleted** — HTTP 문 열기 · 닫기 삭제 |
| `libs/contracts/src/room/room.commands.ts` | modified — 내부 경로 `doorOpen(room_id)` · `DOOR_SNAPSHOT` · `DOOR_VERIFY` · `DOOR_CLOSE` |
| `libs/contracts/src/room/dto/room-list.dto.ts` | modified — 항목 `door_state` · `door_changed_at` |
| `libs/contracts/src/room/dto/room-door-open.dto.ts` | new — 바로 열기 param · 결과 |
| `libs/contracts/src/room/dto/room-door-snapshot.dto.ts` | new — 소켓 접속 확인 입력 · 결과 |
| `libs/contracts/src/room/dto/room-door-verify.dto.ts` | new — 소켓 QR 확인 입력 · 결과 |
| `libs/contracts/src/room/dto/room-door-close.dto.ts` | new — 소켓 잠금 입력 · 결과 |
| `libs/contracts/src/reservation/reservation.commands.ts` | modified — 내부 경로 `qr(reservation_id)` |
| `libs/contracts/src/reservation/dto/reservation-qr.dto.ts` | new — 내 예약 QR param · 결과 |
| `libs/contracts/src/store/store.commands.ts` | modified — `MINE_DOOR_SECRET` |
| `libs/contracts/src/store/dto/store-mine-door-secret.dto.ts` | new — 업체 문 시크릿 입력 |
| `libs/contracts/src/store/dto/store-mine.dto.ts` | modified — `is_door_secret_set` |
| `apps/user-service/src/door/` (controllers · interfaces · repositories · test · door.module · door.service · door.symbols · door.util) | **deleted** — HTTP 문 열기 · 닫기가 없어져 문 도메인이 빈다 |
| `apps/user-service/src/user-service.module.ts` | modified — `DoorModule` 제거(DoorStoreModule 은 그대로 — 예약이 QR 을 Redis 에 쓴다) |
| `apps/user-service/src/reservation/reservation.constants.ts` | modified — QR 상태 |
| `apps/user-service/src/reservation/reservation.util.ts` | modified — `judgeReservationQr` · `toReservationQr` |
| `apps/user-service/src/reservation/reservation.service.ts` | modified — `DOOR_STORE`, `getMyReservationQr`, 업체 취소에 QR 끝내기 |
| `apps/user-service/src/reservation/controllers/reservation.controller.ts` | modified — `GET /:reservation_id/qr` |
| `apps/user-service/src/reservation/interfaces/reservation.repository.interface.ts` | modified — `findRoomQr` · `insertRoomQr` · `updateRoomQr` |
| `apps/user-service/src/reservation/repositories/reservation.repository.ts` | modified — 위 3개 + `buildInsertRoomQrQuery` |
| `apps/user-service/src/reservation/test/reservation.test-helper.ts` | modified — 문 정보 포트 mock · repo mock · `roomQrEntity` |
| `apps/user-service/src/reservation/test/reservation-qr.spec.ts` | new |
| `apps/user-service/src/reservation/test/reservation-store-cancel.spec.ts` | modified |
| `apps/user-service/src/reservation/test/reservation.repository.spec.ts` | modified — Smoke |
| `apps/scheduler/src/scheduler.module.ts` | modified — `DoorStoreModule` |
| `apps/scheduler/src/reservation/crontabs/reservation-qr-sync.crontab.ts` | new |
| `apps/scheduler/src/reservation/reservation.module.ts` | modified — crontab 등록 |
| `apps/scheduler/src/reservation/reservation.util.ts` | modified — `buildRoomQr` |
| `apps/scheduler/src/reservation/interfaces/reservation.repository.interface.ts` | modified — `QrSyncTargetRow` · `findQrSyncTargets` · `insertRoomQr` · `findRoomQr` |
| `apps/scheduler/src/reservation/repositories/reservation.repository.ts` | modified — 위 3개 + 빌더 2개 |
| `apps/scheduler/src/reservation/test/reservation.repository.spec.ts` | modified — Smoke |
| `apps/admin-service/src/admin-service.module.ts` | modified — `DoorStoreModule` |
| `apps/admin-service/src/room/room.util.ts` | modified — `toRoomListItem(row, door)` · `toRoomDoorSnapshotItem` |
| `apps/admin-service/src/room/room.service.ts` | modified — `DOOR_STORE`, 목록 문 상태, `openMyRoomDoor` · `getDoorSnapshot` · `verifyStoreDoor` · `closeStoreDoor` |
| `apps/admin-service/src/room/controllers/room.controller.ts` | modified — 내부 4개 |
| `apps/admin-service/src/room/interfaces/room.repository.interface.ts` | modified — `RoomDoorRow` · `findDoorStore` · `findStoreDoorRoomRows` |
| `apps/admin-service/src/room/repositories/room.repository.ts` | modified — 위 2개 + `buildStoreDoorRoomRowsQuery` |
| `apps/admin-service/src/room/test/room.test-helper.ts` | modified — 문 정보 포트 mock · repo mock |
| `apps/admin-service/src/room/test/room-list.spec.ts` | modified |
| `apps/admin-service/src/room/test/room-door-open.spec.ts` · `room-door-snapshot.spec.ts` · `room-door-verify.spec.ts` · `room-door-close.spec.ts` | new |
| `apps/admin-service/src/room/test/room.repository.spec.ts` | modified — Smoke(+ t_store 컬럼이 늘어 매니저 업체 SQL 스냅숏 갱신) |
| `apps/admin-service/src/store/store.service.ts` | modified — `changeMyStoreDoorSecret` |
| `apps/admin-service/src/store/store.util.ts` | modified — `is_door_secret_set` |
| `apps/admin-service/src/store/controllers/store.controller.queue.ts` | modified — `@OnCommand(MINE_DOOR_SECRET)` |
| `apps/admin-service/src/store/test/store.test-helper.ts` | modified — 업체 `door_secret` 기본 null |
| `apps/admin-service/src/store/test/store-mine-door-secret.spec.ts` | new |
| `apps/admin-service/src/store/test/store-mine.spec.ts` | modified |
| `apps/admin-service/src/store/test/store.repository.spec.ts` | modified — t_store 컬럼이 늘어 SQL 스냅숏 갱신 |
| `apps/gateway/src/modules/door-socket/door-socket.server.ts` | new — 업그레이드 · 인증 · 연결 묶음 · QR 확인 · 잠금 · 바로 열기 명령 · 하트비트 |
| `apps/gateway/src/modules/door-socket/door-socket.util.ts` | new — 경로 · 헤더 · 메시지 읽기 · 만들기 |
| `apps/gateway/src/modules/door-socket/door-socket.module.ts` | new |
| `apps/gateway/src/gateway.module.ts` | modified — `DoorStoreModule` · `DoorSocketModule` 추가, `DoorModule` 제거 |
| `apps/gateway/src/api/v1/user-service/door/` | **deleted** — 문 열기 · 닫기 공개 라우트 |
| `apps/gateway/src/api/v1/admin-service/room/controllers/room.controller.ts` | modified — 바로 열기 |
| `apps/gateway/src/api/v1/admin-service/store/controllers/store.controller.queue.ts` | modified — 업체 문 시크릿(+ 환불 규정 주석의 지난 문구 바로잡기) |
| `apps/gateway/src/api/v1/user-service/reservation/controllers/reservation.controller.ts` | modified — 내 예약 QR |
| `docker/nginx/gateway.conf` | modified — `/ws/` WebSocket 업그레이드 |
| `compose.gateway.yml` | modified — `REDIS_URL` 전달 · `roomless-data` 네트워크 |
| `compose.admin-service.yml` · `compose.scheduler.yml` | modified — `REDIS_URL` 전달 |
| `package.json` · `package-lock.json` | modified — `ws` · `@types/ws` |
| `README.md` | modified — 문 API 삭제 · 소켓 · 시크릿 · Redis 를 쓰는 앱 |
| `AGENTS.md` | modified — 구조 · 문 · 소켓 · Smoke 목록 · 인증 없는 공개 라우트에서 문 제거 |
| `docs/architecture.md` · `docs/integration.md` · `docs/guides/redis-setup.md` · `docs/data-layer.md` · `docs/testing.md` | modified |
| `docs/realtime.md` | new(초안 — §4.5 승인, 이미 씀) — 실시간 소켓 규약, build 가 코드에 맞춘다 |

---

## Design

### 데이터 — 엔티티 · 마이그레이션 (`libs/database`)

QR 은 예약 1건에 1개, 지우지 않는 이력이다. 문 열기 · 잠금은 "QR 이 같고 유효 시작 ≤ 지금 < 유효 종료" 인 행을 찾는다(예약 상태는 보지 않는다 — 업체 취소는 유효 종료를 지금으로 바꿔 끝낸다). 엔티티 폴더는 소유 도메인 `door`(형제: `entities/reservation/reservation-detail.entity.ts` — FK 는 문자열 속성 + `@ManyToOne` + `@JoinColumn`, 훅 `insertTimestamp`/`updateTimestamp`).

```ts
// libs/database/src/entities/door/room-qr.entity.ts — new
import {BeforeInsert, BeforeUpdate, Check, Column, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn, Unique} from 'typeorm';
import {ReservationEntity} from '../reservation/reservation.entity.js';
import {RoomEntity} from '../room/room.entity.js';

/**
 * 호실 QR — 예약 1건의 이용 시간 동안 그 호실 문을 열고 잠그는 QR. 미래 예약에 미리 주지 않고 이용 시작 때 발급한다(scheduler · 이용자 조회).
 * 유효 = [starts_at, ends_at) — 문 열기 · 잠금은 이 범위 안의 행만 찾는다. 업체가 이용 중 예약을 취소하면 ends_at 을 그 시각으로 바꾼다(이력은 남는다).
 * 예약 1건에 1행(UK), QR 은 32자 무작위(UK). 지우지 않는다.
 */
@Entity({name: 't_room_qr', comment: '호실 QR(예약별 이용 시간 QR 이력)'})
@Check('CHK_RoomQr_StartsEndsAt', '"starts_at" <= "ends_at"')
@Unique('UK_RoomQr_Qr', ['qr'])
@Unique('UK_RoomQr_ReservationId', ['reservation_id'])
@Index('IDX_RoomQr_RoomId', ['room_id'])
export class RoomQrEntity {
    @PrimaryColumn({name: 'room_qr_id', length: 32, comment: '호실 QR ID', primaryKeyConstraintName: 'PK_RoomQr'})
    room_qr_id: string;

    @ManyToOne(() => RoomEntity, {nullable: false, onUpdate: 'CASCADE', onDelete: 'CASCADE'})
    @JoinColumn({name: 'room_id', referencedColumnName: 'room_id', foreignKeyConstraintName: 'FK_RoomQr_Room'})
    room_id: string;

    @ManyToOne(() => ReservationEntity, {nullable: false, onUpdate: 'CASCADE', onDelete: 'CASCADE'})
    @JoinColumn({name: 'reservation_id', referencedColumnName: 'reservation_id', foreignKeyConstraintName: 'FK_RoomQr_Reservation'})
    reservation_id: string;

    @Column({name: 'qr', length: 32, nullable: false, comment: 'QR 정보(32자 무작위 — 예약자 QR 화면의 값, 문 열기 · 잠금의 열쇠)'})
    qr: string;

    @Column({name: 'starts_at', type: 'timestamptz', nullable: false, comment: '유효 시작 — 예약의 이용 시작'})
    starts_at: Date;

    @Column({name: 'ends_at', type: 'timestamptz', nullable: false, comment: '유효 종료 — 예약의 이용 끝, 업체가 이용 중 예약을 취소하면 그 시각(이 시각부터 쓸 수 없다)'})
    ends_at: Date;

    @Column({name: 'created_at', type: 'timestamptz', nullable: false, comment: '등록일(발급 시각)'})
    created_at: Date;

    @Column({name: 'updated_at', type: 'timestamptz', nullable: false, comment: '수정일'})
    updated_at: Date;

    /**
     * insert 직전 등록일 · 수정일을 채운다.
     */
    @BeforeInsert()
    insertTimestamp(): void {
        const now = new Date();
        this.created_at = now;
        this.updated_at = now;
    }

    /**
     * update 직전 수정일을 갱신한다.
     */
    @BeforeUpdate()
    updateTimestamp(): void {
        this.updated_at = new Date();
    }
}
```

```ts
// libs/database/src/entities/store/store.entity.ts — modified (late_refund_percent 뒤에 추가)
    @Column({
        name: 'door_secret',
        type: 'varchar',
        length: 100,
        nullable: true,
        comment: '문 소켓 시크릿 코드(bcrypt 해시) — 업체 총관리자가 정한다. 문 쪽 프로그램이 실시간 소켓에 붙을 때 확인, NULL 이면 소켓에 붙을 수 없다',
    })
    door_secret: string | null;
```

```ts
// libs/database/src/entities.ts — modified
import {RoomQrEntity} from './entities/door/room-qr.entity.js';
// …
export const ENTITIES = [
    // … (ReservationDetailEntity 뒤)
    ReservationDetailEntity,
    RoomQrEntity,
    UserEntity,
    // …
];
```

마이그레이션은 `npm run db:generate -- RoomQrDoorSecret`(PGlite 계산) → `npm run db:check`. 생성 결과의 제약명이 `UK_RoomQr_Qr` · `UK_RoomQr_ReservationId` 인지 확인한다(단일 컬럼 `@Unique` 는 생성기가 `UQ_<해시>` 를 만들 수 있다 — AGENTS 컬럼 이름 절). 예상 모양:

```ts
// libs/database/src/migrations/<ts>-RoomQrDoorSecret.ts — new (생성기 출력, 설명 JSDoc 만 손으로)
import type {MigrationInterface, QueryRunner} from 'typeorm';

/**
 * 문 관리 · QR 확인(로드맵 Phase 15) — 호실 QR 이력 테이블 · 업체 문 소켓 시크릿.
 * - t_room_qr 생성(예약별 이용 시간 QR — 유효 시작 · 종료, UK 예약 · QR, FK 호실 · 예약)
 * - t_store.door_secret 추가(bcrypt 해시, NULL 이면 소켓 접속 불가) — 기존 행은 NULL
 * 기존 데이터는 바뀌지 않는다. Redis 의 Phase 14 문 값(QR:상태:시각)은 앱이 뒤의 두 칸만 읽는다(정리 불필요).
 */
export class RoomQrDoorSecret<ts> implements MigrationInterface {
    name = 'RoomQrDoorSecret<ts>';

    /**
     * 적용
     *
     * @param queryRunner 쿼리 실행기
     */
    async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `CREATE TABLE "t_room_qr" ("room_qr_id" character varying(32) NOT NULL, "qr" character varying(32) NOT NULL, "starts_at" TIMESTAMP WITH TIME ZONE NOT NULL, "ends_at" TIMESTAMP WITH TIME ZONE NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL, "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL, "room_id" character varying(32) NOT NULL, "reservation_id" character varying(32) NOT NULL, CONSTRAINT "UK_RoomQr_ReservationId" UNIQUE ("reservation_id"), CONSTRAINT "UK_RoomQr_Qr" UNIQUE ("qr"), CONSTRAINT "CHK_RoomQr_StartsEndsAt" CHECK ("starts_at" <= "ends_at"), CONSTRAINT "PK_RoomQr" PRIMARY KEY ("room_qr_id"))`,
        );
        // … COMMENT ON COLUMN / TABLE (생성기 출력)
        await queryRunner.query(`CREATE INDEX "IDX_RoomQr_RoomId" ON "t_room_qr" ("room_id") `);
        await queryRunner.query(`ALTER TABLE "t_store" ADD "door_secret" character varying(100)`);
        // … COMMENT ON COLUMN "t_store"."door_secret"
        await queryRunner.query(`ALTER TABLE "t_room_qr" ADD CONSTRAINT "FK_RoomQr_Room" FOREIGN KEY ("room_id") REFERENCES "t_room"("room_id") ON DELETE CASCADE ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE "t_room_qr" ADD CONSTRAINT "FK_RoomQr_Reservation" FOREIGN KEY ("reservation_id") REFERENCES "t_reservation"("reservation_id") ON DELETE CASCADE ON UPDATE CASCADE`);
    }

    /**
     * 되돌리기
     *
     * @param queryRunner 쿼리 실행기
     */
    async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "t_room_qr" DROP CONSTRAINT "FK_RoomQr_Reservation"`);
        await queryRunner.query(`ALTER TABLE "t_room_qr" DROP CONSTRAINT "FK_RoomQr_Room"`);
        await queryRunner.query(`ALTER TABLE "t_store" DROP COLUMN "door_secret"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_RoomQr_RoomId"`);
        await queryRunner.query(`DROP TABLE "t_room_qr"`);
    }
}
```


### 외부 연동 포트 — 문 정보 · 현재 QR · 명령 채널 (`libs/integration`)

Redis 에는 호실마다 문 상태(`door:<room_id>` = `상태:시각`)와 **현재 유효 QR**(`door-qr:<room_id>` = QR, 만료 `PXAT` = 유효 종료)을 둔다(사용자 결정 2026-11-04 — DB 는 이력, Redis 는 현재 값). QR 비교 · 열림 기록, 열림 · 명령 알림, 값이 같을 때만 지우기는 각각 Lua 1개(형제: 기존 `OPEN_SCRIPT` — 찾기 + 쓰기를 1개로). Phase 14 의 `door-qr:<QR>` 색인 · `issueQr` · `get` 은 없앤다(§1.7 — `issueQr` 는 호출이 0 이라 남은 키도 없다). 문 시각 util 은 user-service 문 도메인이 없어지고 admin-service 가 쓰므로 `integration.util.ts` 로 옮긴다(형제: 같은 파일의 `verifyPaymentLookup` — 여러 앱이 쓰는 연동 순수 함수).

```ts
// libs/integration/src/integration.constants.ts — modified (문 절)
/** 문 상태 — open: 열림, close: 닫힘 (Redis 문 정보의 상태 칸) */
export const DOOR_STATE = {OPEN: 'open', CLOSE: 'close'} as const;

/** 한 번도 열거나 닫은 적 없는 문의 시각 */
export const DOOR_TIME_NONE = '00000000000000';

/** 문 명령(관리자 바로 열기)을 보내는 Redis 채널 — gateway 문 소켓이 구독해 그 업체 연결에 보낸다 */
export const DOOR_COMMAND_CHANNEL = 'door-commands';

/** 문 명령 종류 — open: 바로 열기 */
export const DOOR_COMMAND = {OPEN: 'open'} as const;

// 삭제: DOOR_QR_ISSUE_FAILED_MESSAGE · DOOR_QR_ISSUE_ATTEMPTS (QR 발급은 DB — Redis 에서 겹침을 잡지 않는다)
```

```ts
// libs/integration/src/integration.util.ts — modified (import 추가 + 함수 추가)
import {dayjs, KST_TIMEZONE} from '@app/common/utils/dayjs.js';

/** 문 시각 형식 — 한국 시각 yyyyMMddHHmmss (Redis 문 정보의 시각 칸) */
const DOOR_TIME_FORMAT = 'YYYYMMDDHHmmss';

/**
 * 문을 열거나 닫은 시각 — 한국 시각 `yyyyMMddHHmmss`(밀리초는 버린다). admin-service(바로 열기 · 소켓 QR 확인 · 잠금)가 쓴다.
 *
 * @param at 시각
 * @returns 예: 20261101022459
 */
export function toDoorTime(at: Date): string {
    return dayjs(at).tz(KST_TIMEZONE).format(DOOR_TIME_FORMAT);
}
```

```ts
// libs/integration/src/interfaces/integration.interface.ts — modified (문 절 전체)
/** 문 상태 — DOOR_STATE 값 */
export type DoorState = 'open' | 'close';

/** 호실 문 1개의 상태 — Redis `door:<room_id>` 의 값 `상태:시각` */
export interface DoorRecord {
    /** 문 상태 */
    state: DoorState;
    /** 마지막으로 열거나 닫은 시각 — 한국 시각 yyyyMMddHHmmss, 기록이 없으면 DOOR_TIME_NONE */
    changed_at: string;
}

/** 문 명령 — Redis 채널 DOOR_COMMAND_CHANNEL 의 메시지(JSON). 밖(Redis · 소켓)으로 나가는 키라 snake_case */
export interface DoorCommand {
    /** 그 호실의 업체 ID — gateway 가 그 업체 소켓에만 보낸다 */
    store_id: string;
    /** 호실 ID */
    room_id: string;
    /** 명령 — DOOR_COMMAND 값 (open: 바로 열기) */
    command: 'open';
}

/**
 * 문 정보 포트 — 호실 문마다 열림/닫힘 · 마지막 시각, 그 호실의 현재 유효 QR(Redis)과 문 명령 채널. QR 이력은 DB(t_room_qr)에 있다.
 * 서버는 문을 직접 움직이지 않는다 — 문 쪽 타 업체 프로그램이 소켓(gateway)의 QR 확인 답 · 열기 명령을 보고 움직인다.
 */
export interface DoorStoreInterface {
    /**
     * 여러 문의 상태를 한 번에 읽는다(MGET) — 받은 순서대로, 기록이 없으면 `{state: 'close', changed_at: DOOR_TIME_NONE}`. 빈 배열이면 Redis 에 묻지 않는다.
     *
     * @throws ServiceUnavailableException `{message: REDIS_UNAVAILABLE_MESSAGE}` — Redis 에 닿지 못했을 때
     */
    getMany(room_ids: string[]): Promise<DoorRecord[]>;

    /**
     * 그 호실의 현재 QR 을 쓴다 — expires_at 에 저절로 사라진다(PXAT). 같은 값이면 그대로(멱등).
     *
     * @throws ServiceUnavailableException `{message: REDIS_UNAVAILABLE_MESSAGE}` — Redis 에 닿지 못했을 때
     */
    setQr(room_id: string, qr: string, expires_at: Date): Promise<void>;

    /**
     * 그 호실의 현재 QR 이 qr 일 때만 지운다(다른 QR 을 지우지 않는다).
     *
     * @throws ServiceUnavailableException `{message: REDIS_UNAVAILABLE_MESSAGE}` — Redis 에 닿지 못했을 때
     */
    revokeQr(room_id: string, qr: string): Promise<void>;

    /**
     * QR 확인 — 그 호실의 현재 QR 이 qr 이면 문을 open + changed_at 으로 쓰고 true, 다르거나 없으면 아무것도 바꾸지 않고 false(비교와 쓰기를 한 번에).
     *
     * @throws ServiceUnavailableException `{message: REDIS_UNAVAILABLE_MESSAGE}` — Redis 에 닿지 못했을 때
     */
    verify(room_id: string, qr: string, changed_at: string): Promise<boolean>;

    /**
     * 바로 열기 — 문을 open + changed_at 으로 쓰고 같은 스크립트에서 열기 명령(DoorCommand)을 보낸다.
     *
     * @throws ServiceUnavailableException `{message: REDIS_UNAVAILABLE_MESSAGE}` — Redis 에 닿지 못했을 때
     */
    open(room_id: string, store_id: string, changed_at: string): Promise<void>;

    /**
     * 문을 close + changed_at 으로 쓴다(하드웨어 잠금 알림).
     *
     * @throws ServiceUnavailableException `{message: REDIS_UNAVAILABLE_MESSAGE}` — Redis 에 닿지 못했을 때
     */
    close(room_id: string, changed_at: string): Promise<void>;

    /**
     * 문 명령을 구독한다 — 구독 전용 연결을 따로 열고 기다리지 않는다(부팅을 막지 않는다). 끊기면 다시 붙어 다시 구독한다.
     *
     * @param listener 명령마다 부를 함수(모양이 다른 메시지는 버린다)
     */
    subscribe(listener: (command: DoorCommand) => void): void;
}
```

```ts
// libs/integration/src/redis/redis.connection.ts — modified (구독 연결 추가 · 종료 · 경고 문구)
@Injectable()
export class RedisConnection implements OnApplicationBootstrap, OnModuleDestroy {
    private readonly logger = new Logger(RedisConnection.name);
    private client: RedisClient | null = null;
    /** 구독 전용 연결 — 구독 중인 연결은 다른 명령을 보내지 않으므로 채널마다 따로 연다 */
    private readonly subscribers: RedisClient[] = [];

    /**
     * 연결을 연다 — 기다리지 않는다(부팅을 막지 않는다).
     */
    onApplicationBootstrap(): void {
        const url = process.env.REDIS_URL;
        if (!url) {
            this.logger.warn('REDIS_URL 이 비어 있어 Redis 를 쓰는 요청(문 상태 · QR · 문 소켓)이 실패합니다 — docs/guides/redis-setup.md');
            return;
        }
        // … (그대로)
    }

    /**
     * 종료 시 연결 · 구독 연결을 닫는다.
     */
    async onModuleDestroy(): Promise<void> {
        for (const subscriber of this.subscribers) {
            if (subscriber.isOpen) {
                await subscriber.close();
            }
        }
        if (this.client?.isOpen) {
            await this.client.close();
        }
    }

    /**
     * 채널을 구독한다 — 구독 전용 연결을 따로 연다(기다리지 않는다 — 부팅을 막지 않는다). 끊기면 node-redis 가 다시 붙고 같은 채널을 다시 구독한다.
     * REDIS_URL 이 비어 있으면 경고만 남긴다.
     *
     * @param channel 채널
     * @param listener 메시지마다 부를 함수
     */
    subscribe(channel: string, listener: (message: string) => void): void {
        const url = process.env.REDIS_URL;
        if (!url) {
            this.logger.warn(`REDIS_URL 이 비어 있어 ${channel} 을 구독하지 않습니다 — docs/guides/redis-setup.md`);
            return;
        }
        const subscriber = buildClient(url);
        subscriber.on('error', (error: Error) => this.logger.error(`Redis 구독 오류: ${error.message}`));
        this.subscribers.push(subscriber);
        subscriber
            .connect()
            .then(() => subscriber.subscribe(channel, listener))
            .catch((error: Error) => this.logger.error(`Redis 구독 실패(${channel}): ${error.message}`));
    }

    // ready() — 그대로
}
```

```ts
// libs/integration/src/door/redis-door.store.ts — modified (전체)
import {Injectable, Logger, ServiceUnavailableException} from '@nestjs/common';
import {dayjs} from '@app/common/utils/dayjs.js';
import {DOOR_COMMAND, DOOR_COMMAND_CHANNEL, DOOR_STATE, DOOR_TIME_NONE, REDIS_UNAVAILABLE_MESSAGE} from '../integration.constants.js';
import type {DoorCommand, DoorRecord, DoorStoreInterface} from '../interfaces/integration.interface.js';
import {RedisConnection} from '../redis/redis.connection.js';
import type {RedisClient} from '../redis/redis.connection.js';

/** 문 상태 키 접두 — `door:<room_id>` = `상태:시각` */
const DOOR_KEY_PREFIX = 'door:';

/** 현재 QR 키 접두 — `door-qr:<room_id>` = QR (만료 = 유효 종료) */
const DOOR_QR_KEY_PREFIX = 'door-qr:';

/**
 * QR 확인 + 열림 — KEYS[1] `door-qr:<room_id>` · KEYS[2] `door:<room_id>` / ARGV[1] QR · ARGV[2] 상태(open) · ARGV[3] 시각.
 * 현재 QR 이 같을 때만 상태를 쓰고 1, 아니면 아무것도 바꾸지 않고 0.
 */
const VERIFY_SCRIPT = `
if redis.call('GET', KEYS[1]) ~= ARGV[1] then return 0 end
redis.call('SET', KEYS[2], ARGV[2] .. ':' .. ARGV[3])
return 1
`;

/**
 * 바로 열기 — KEYS[1] `door:<room_id>` / ARGV[1] 상태(open) · ARGV[2] 시각 · ARGV[3] 채널 · ARGV[4] 명령(JSON).
 * 상태를 쓰고 같은 스크립트에서 PUBLISH 한다(쓰기와 명령이 어긋나지 않는다).
 */
const OPEN_SCRIPT = `
redis.call('SET', KEYS[1], ARGV[1] .. ':' .. ARGV[2])
redis.call('PUBLISH', ARGV[3], ARGV[4])
return 1
`;

/**
 * 현재 QR 지우기 — KEYS[1] `door-qr:<room_id>` / ARGV[1] QR. 값이 같을 때만 지운다.
 */
const REVOKE_SCRIPT = `
if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) end
return 0
`;

/**
 * 문 상태 키
 *
 * @param room_id 호실 ID
 * @returns `door:<room_id>`
 */
function doorKey(room_id: string): string {
    return `${DOOR_KEY_PREFIX}${room_id}`;
}

/**
 * 현재 QR 키
 *
 * @param room_id 호실 ID
 * @returns `door-qr:<room_id>`
 */
function doorQrKey(room_id: string): string {
    return `${DOOR_QR_KEY_PREFIX}${room_id}`;
}

/**
 * 문 상태 값(`상태:시각`)을 읽는다 — Phase 14 의 `QR:상태:시각` 도 뒤의 두 칸만 쓴다. 값이 없으면 기록 없는 문(close · DOOR_TIME_NONE).
 *
 * @param value Redis 값
 * @returns 문 상태
 */
function parseDoorValue(value: string | null): DoorRecord {
    if (!value) {
        return {state: DOOR_STATE.CLOSE, changed_at: DOOR_TIME_NONE};
    }
    const [state, changed_at] = value.split(':').slice(-2);
    return {state: state === DOOR_STATE.OPEN ? DOOR_STATE.OPEN : DOOR_STATE.CLOSE, changed_at: changed_at || DOOR_TIME_NONE};
}

/**
 * 구독 메시지(JSON)를 문 명령으로 읽는다 — 모양이 다르면 null.
 *
 * @param message Redis 메시지
 * @returns 명령 또는 null
 */
function parseDoorCommand(message: string): DoorCommand | null {
    try {
        const data = JSON.parse(message) as Partial<DoorCommand>;
        if (typeof data.store_id !== 'string' || typeof data.room_id !== 'string' || data.command !== DOOR_COMMAND.OPEN) {
            return null;
        }
        return {store_id: data.store_id, room_id: data.room_id, command: data.command};
    } catch {
        return null;
    }
}

/**
 * 문 정보 어댑터 — Redis. `door:<room_id>` = `open|close:yyyyMMddHHmmss`, `door-qr:<room_id>` = 현재 QR(만료 = 유효 종료), 바로 열기 명령은 채널 `door-commands`.
 * QR 확인 + 열림 · 열림 + 명령 · 같을 때만 지우기는 Lua 스크립트 1개씩(원자적), 여러 문 읽기는 MGET 1번. QR 이력은 DB(t_room_qr)에 있다.
 * 세팅 · 저장 모양 확인: docs/guides/redis-setup.md
 */
@Injectable()
export class RedisDoorStore implements DoorStoreInterface {
    private readonly logger = new Logger(RedisDoorStore.name);

    /**
     * @param redis 앱 공용 Redis 연결
     */
    constructor(private readonly redis: RedisConnection) {}

    /**
     * 여러 문의 상태 — 받은 순서대로, 빈 배열이면 Redis 에 묻지 않는다.
     *
     * @param room_ids 호실 ID 목록
     * @returns 문 상태 목록
     */
    async getMany(room_ids: string[]): Promise<DoorRecord[]> {
        if (room_ids.length === 0) {
            return [];
        }
        const values = await this.run('문 정보 조회', (client) => client.mGet(room_ids.map(doorKey)));
        return values.map((value) => parseDoorValue(typeof value === 'string' ? value : null));
    }

    /**
     * 그 호실의 현재 QR — expires_at 에 저절로 사라진다.
     *
     * @param room_id 호실 ID
     * @param qr QR 정보
     * @param expires_at 유효 종료
     */
    async setQr(room_id: string, qr: string, expires_at: Date): Promise<void> {
        await this.run('현재 QR 쓰기', (client) => client.set(doorQrKey(room_id), qr, {expiration: {type: 'PXAT', value: dayjs(expires_at).valueOf()}}));
    }

    /**
     * 그 호실의 현재 QR 이 qr 일 때만 지운다.
     *
     * @param room_id 호실 ID
     * @param qr 지울 QR
     */
    async revokeQr(room_id: string, qr: string): Promise<void> {
        await this.run('현재 QR 지우기', (client) => client.eval(REVOKE_SCRIPT, {keys: [doorQrKey(room_id)], arguments: [qr]}));
    }

    /**
     * QR 확인 — 현재 QR 이 같으면 open + 시각으로 쓰고 true.
     *
     * @param room_id 호실 ID
     * @param qr 문이 읽은 QR
     * @param changed_at 시각 (한국 시각 yyyyMMddHHmmss)
     * @returns 같았으면 true
     */
    async verify(room_id: string, qr: string, changed_at: string): Promise<boolean> {
        const matched = await this.run('QR 확인', (client) => client.eval(VERIFY_SCRIPT, {keys: [doorQrKey(room_id), doorKey(room_id)], arguments: [qr, DOOR_STATE.OPEN, changed_at]}));
        return matched === 1;
    }

    /**
     * 바로 열기 — open + 시각을 쓰고 열기 명령을 보낸다.
     *
     * @param room_id 호실 ID
     * @param store_id 그 호실의 업체 ID (명령 대상)
     * @param changed_at 시각 (한국 시각 yyyyMMddHHmmss)
     */
    async open(room_id: string, store_id: string, changed_at: string): Promise<void> {
        const command: DoorCommand = {store_id, room_id, command: DOOR_COMMAND.OPEN};
        await this.run('바로 열기', (client) =>
            client.eval(OPEN_SCRIPT, {keys: [doorKey(room_id)], arguments: [DOOR_STATE.OPEN, changed_at, DOOR_COMMAND_CHANNEL, JSON.stringify(command)]}),
        );
    }

    /**
     * close + 시각을 쓴다.
     *
     * @param room_id 호실 ID
     * @param changed_at 시각 (한국 시각 yyyyMMddHHmmss)
     */
    async close(room_id: string, changed_at: string): Promise<void> {
        await this.run('문 닫기', (client) => client.set(doorKey(room_id), `${DOOR_STATE.CLOSE}:${changed_at}`));
    }

    /**
     * 문 명령 구독 — 모양이 다른 메시지는 경고만 남기고 버린다.
     *
     * @param listener 명령마다 부를 함수
     */
    subscribe(listener: (command: DoorCommand) => void): void {
        this.redis.subscribe(DOOR_COMMAND_CHANNEL, (message) => {
            const command = parseDoorCommand(message);
            if (command) {
                listener(command);
            } else {
                this.logger.warn(`문 명령 모양이 다릅니다: ${message}`);
            }
        });
    }

    /**
     * Redis 명령 1번 — 준비 전이면 RedisConnection 이 503, 명령이 실패하면 로그를 남기고 503.
     *
     * @param action 로그에 남길 동작 이름
     * @param command 클라이언트로 실행할 명령
     * @returns 명령 결과
     */
    private async run<T>(action: string, command: (client: RedisClient) => Promise<T>): Promise<T> {
        const client = this.redis.ready();
        try {
            return await command(client);
        } catch (error) {
            this.logger.error(`${action} 실패: ${(error as Error)?.message ?? error}`);
            throw new ServiceUnavailableException({message: REDIS_UNAVAILABLE_MESSAGE});
        }
    }
}
```

`client.set(…, {expiration: {type: 'PXAT', value}})` 는 node-redis 6 의 SET 옵션 모양이다 — build 때 타입으로 확인하고, 다르면 `{PXAT: value}` 꼴로 맞춘다(typecheck 기준).

```ts
// libs/integration/src/door/door-store.module.ts — modified (주석만)
/**
 * 문 정보 포트(DOOR_STORE) — Redis(문 상태 · 현재 QR · 명령 채널). Redis 연결(RedisModule)을 함께 가져온다.
 * 쓰는 앱의 루트 모듈에서 import 한다 — user-service(QR 발급 · 업체 취소) · admin-service(호실 목록 · 바로 열기 · 소켓 접속 · QR 확인 · 잠금) · scheduler(QR 맞추기) · gateway(명령 구독).
 * 전역 — 도메인 모듈 · 인프라 모듈은 import 없이 `@Inject(DOOR_STORE)` 로 주입받는다.
 */
```

### Input/Validation (DTO) · 규격 상수 (`libs/contracts`)

입력 DTO 는 `@ApiProperty` → 제약(`message` 한국어) → `@IsNotEmpty` 맨 마지막(형제: `reservation-detail.dto.ts` 의 `ReservationDetailParamDto`). 결과 DTO 는 기능마다 따로(모양이 같아도 독립 선언). HTTP 문 열기 · 닫기가 없어져 `libs/contracts/src/door/dto/` 는 지운다(§1.7) — 문 도메인 규격에는 소켓 규격만 남는다.

```ts
// libs/contracts/src/door/door.commands.ts — modified (전체)
/**
 * 문 도메인 규격 — 문 쪽 타 업체 프로그램과의 실시간 소켓(gateway — 표준 WebSocket)의 경로 · 헤더 · 이벤트 이름.
 * HTTP 문 열기 · 닫기 API 는 없다(사용자 결정 2026-11-04) — QR 확인 · 잠금 알림 · 바로 열기 명령은 모두 이 소켓으로 주고받는다.
 * 소켓이 부르는 서버 쪽 처리(접속 확인 · QR 확인 · 잠금)는 admin-service room 도메인 내부 HTTP(ROOM_INTERNAL_PATH)다.
 */

/** 문 소켓 경로 — gateway 가 이 경로의 WebSocket 업그레이드만 받는다 */
export const DOOR_SOCKET_PATH = '/ws/v1/door';

/** 소켓 접속 헤더 — 업그레이드 요청에 업체 ID · 업체 문 시크릿 코드(틀리면 업그레이드 전에 401) */
export const DOOR_SOCKET_HEADER = {
    /** 업체 ID (32자) */
    STORE_ID: 'x-store-id',
    /** 업체 문 시크릿 코드 (업체 총관리자가 정한 영문 · 숫자 16 ~ 64자) */
    STORE_SECRET: 'x-store-secret',
} as const;

/** 소켓 메시지 event — 모든 메시지는 JSON 한 개 `{"event": …, "data": …}` */
export const DOOR_SOCKET_EVENT = {
    /** 서버 → 문 프로그램: 접속 직후 업체 호실 전체의 문 상태 */
    SNAPSHOT: 'door.snapshot',
    /** 문 프로그램 → 서버: 문이 읽은 QR 확인 요청 — `{room_id, qr}` */
    VERIFY: 'door.verify',
    /** 서버 → 문 프로그램: QR 확인 결과(그 연결에만) — `{room_id, ok}`. ok 면 서버가 이미 열림으로 기록했다 → 문을 연다 */
    VERIFIED: 'door.verified',
    /** 서버 → 문 프로그램: 관리자 바로 열기 명령(그 업체 연결 모두) — `{room_id}` */
    OPEN: 'door.open',
    /** 문 프로그램 → 서버: 하드웨어가 잠겼다(잠금 버튼 · 자동 잠금) — `{room_id}`, 성공은 답하지 않는다 */
    CLOSED: 'door.closed',
    /** 서버 → 문 프로그램: 받은 메시지를 처리하지 못했다 — `{status_code, message}` (연결은 유지) */
    ERROR: 'error',
} as const;

// 삭제: DOOR_INTERNAL_PATH (HTTP 문 열기 · 닫기)
```

```ts
// libs/contracts/src/room/room.commands.ts — modified (ROOM_INTERNAL_PATH 에 추가 — ROOM_LIST 앞)
    /** 문 소켓 접속 확인 + 업체 호실 문 상태 (POST, gateway 문 소켓 — 내부 토큰만, actor 없음) */
    DOOR_SNAPSHOT: `${ROOM_INTERNAL_BASE}/door-snapshot`,
    /** 문 소켓 QR 확인 (POST, gateway 문 소켓 — 내부 토큰만, actor 없음) */
    DOOR_VERIFY: `${ROOM_INTERNAL_BASE}/door-verify`,
    /** 문 소켓 잠금 알림 (POST, gateway 문 소켓 — 내부 토큰만, actor 없음) */
    DOOR_CLOSE: `${ROOM_INTERNAL_BASE}/door-close`,
    /** 호실 문 바로 열기 (POST, 업체 관리자) */
    doorOpen: (room_id: string) => `${ROOM_INTERNAL_BASE}/${encodeURIComponent(room_id)}/door-open`,
```

```ts
// libs/contracts/src/room/dto/room-list.dto.ts — modified (RoomListItemResultDto 의 created_at 뒤에 추가)
    @ApiProperty({description: '문 상태 (open: 열림, close: 닫힘 — 기록이 없으면 close)', enum: ['open', 'close']})
    door_state: string;

    @ApiProperty({description: '문을 마지막으로 열거나 닫은 시각 — 한국 시각 yyyyMMddHHmmss, 기록이 없으면 00000000000000'})
    door_changed_at: string;
```

```ts
// libs/contracts/src/room/dto/room-door-open.dto.ts — new
import {ApiProperty} from '@nestjs/swagger';
import {IsNotEmpty, Matches} from 'class-validator';

/**
 * 호실 문 바로 열기 path — 내 업체의 지워지지 않은 호실만(없으면 404)
 */
export class RoomDoorOpenParamDto {
    @ApiProperty({description: '호실 ID'})
    @Matches(/^[a-f0-9]{32}$/, {message: '호실 ID가 올바르지 않습니다.'})
    @IsNotEmpty({message: '호실 ID를 입력해주세요.'})
    room_id: string;
}

/**
 * 바로 열기 결과 — 서버는 Redis 상태만 바꾸고 그 업체 소켓에 열기 명령(door.open)을 보낸다. 실제 문은 문 쪽 프로그램이 연다
 */
export class RoomDoorOpenResultDto {
    @ApiProperty({description: '연 문의 호실 ID'})
    room_id: string;

    @ApiProperty({description: '문 상태 (open: 열림)', enum: ['open', 'close']})
    door_state: string;

    @ApiProperty({description: '문을 연 시각 — 한국 시각 yyyyMMddHHmmss'})
    door_changed_at: string;
}
```

```ts
// libs/contracts/src/room/dto/room-door-snapshot.dto.ts — new
import {ApiProperty} from '@nestjs/swagger';
import {IsNotEmpty, Matches} from 'class-validator';

/**
 * 문 소켓 접속 확인 — gateway 가 업그레이드 요청 헤더(x-store-id · x-store-secret)로 만든다(내부 HTTP — 내부 토큰만).
 * 지워지지 않고 탈퇴하지 않은 업체 · 시크릿이 정해져 있고 bcrypt 가 맞아야 한다(아니면 401)
 */
export class RoomDoorSnapshotDto {
    @ApiProperty({description: '업체 ID (32자)'})
    @Matches(/^[a-f0-9]{32}$/, {message: '업체 ID가 올바르지 않습니다.'})
    @IsNotEmpty({message: '업체 ID를 입력해주세요.'})
    store_id: string;

    @ApiProperty({description: '업체 문 시크릿 코드 (영문 · 숫자 16 ~ 64자)'})
    @Matches(/^[A-Za-z0-9]{16,64}$/, {message: '시크릿 코드는 영문 · 숫자 16 ~ 64자로 입력해주세요.'})
    @IsNotEmpty({message: '시크릿 코드를 입력해주세요.'})
    door_secret: string;
}

/**
 * 업체 호실 문 1개 — 지워지지 않은 호실 · 그룹
 */
export class RoomDoorSnapshotItemResultDto {
    @ApiProperty({description: '호실 ID'})
    room_id: string;

    @ApiProperty({description: '호실명 (예: 101호)'})
    room_name: string;

    @ApiProperty({description: '층 (지하는 음수, B1 = -1)'})
    floor: number;

    @ApiProperty({description: '문 상태 (open: 열림, close: 닫힘 — 기록이 없으면 close)', enum: ['open', 'close']})
    door_state: string;

    @ApiProperty({description: '문을 마지막으로 열거나 닫은 시각 — 한국 시각 yyyyMMddHHmmss, 기록이 없으면 00000000000000'})
    door_changed_at: string;
}

/**
 * 문 소켓 접속 결과 — 소켓의 `door.snapshot` data 로 그대로 보낸다
 */
export class RoomDoorSnapshotResultDto {
    @ApiProperty({description: '업체 ID'})
    store_id: string;

    @ApiProperty({description: '호실 문 (층 · 호실명 순)', type: () => [RoomDoorSnapshotItemResultDto]})
    list: RoomDoorSnapshotItemResultDto[];
}
```


```ts
// libs/contracts/src/room/dto/room-door-verify.dto.ts — new
import {ApiProperty} from '@nestjs/swagger';
import {IsNotEmpty, Matches} from 'class-validator';

/**
 * 문 소켓 QR 확인 — 인증된 소켓의 업체 ID(gateway 가 붙인다) + 문 프로그램이 보낸 호실 ID · 읽은 QR. 그 업체의 지워지지 않은 호실이 아니면 404
 */
export class RoomDoorVerifyDto {
    @ApiProperty({description: '업체 ID (소켓 접속 때 확인한 값)'})
    @Matches(/^[a-f0-9]{32}$/, {message: '업체 ID가 올바르지 않습니다.'})
    @IsNotEmpty({message: '업체 ID를 입력해주세요.'})
    store_id: string;

    @ApiProperty({description: 'QR 을 읽은 문의 호실 ID'})
    @Matches(/^[a-f0-9]{32}$/, {message: '호실 ID가 올바르지 않습니다.'})
    @IsNotEmpty({message: '호실 ID를 입력해주세요.'})
    room_id: string;

    @ApiProperty({description: '문이 읽은 QR 정보 (32자)'})
    @Matches(/^[a-f0-9]{32}$/, {message: 'QR 정보가 올바르지 않습니다.'})
    @IsNotEmpty({message: 'QR 정보를 입력해주세요.'})
    qr: string;
}

/**
 * QR 확인 결과 — 소켓의 `door.verified` data 로 그대로 보낸다. ok 면 서버가 이미 열림 + 시각으로 기록했다
 */
export class RoomDoorVerifyResultDto {
    @ApiProperty({description: '호실 ID'})
    room_id: string;

    @ApiProperty({description: '그 호실의 현재 QR 과 같은지 (true: 문을 연다)'})
    ok: boolean;
}
```

```ts
// libs/contracts/src/room/dto/room-door-close.dto.ts — new
import {ApiProperty} from '@nestjs/swagger';
import {IsNotEmpty, Matches} from 'class-validator';

/**
 * 문 소켓 잠금 알림 — 인증된 소켓의 업체 ID(gateway 가 붙인다) + 문 프로그램이 보낸 호실 ID. 그 업체의 지워지지 않은 호실이 아니면 404
 */
export class RoomDoorCloseDto {
    @ApiProperty({description: '업체 ID (소켓 접속 때 확인한 값)'})
    @Matches(/^[a-f0-9]{32}$/, {message: '업체 ID가 올바르지 않습니다.'})
    @IsNotEmpty({message: '업체 ID를 입력해주세요.'})
    store_id: string;

    @ApiProperty({description: '잠긴 문의 호실 ID'})
    @Matches(/^[a-f0-9]{32}$/, {message: '호실 ID가 올바르지 않습니다.'})
    @IsNotEmpty({message: '호실 ID를 입력해주세요.'})
    room_id: string;
}

/**
 * 소켓 잠금 결과 — gateway 는 성공을 문 프로그램에 답하지 않는다(실패만 error)
 */
export class RoomDoorCloseResultDto {
    @ApiProperty({description: '잠근 문의 호실 ID'})
    room_id: string;

    @ApiProperty({description: '문 상태 (close: 닫힘)', enum: ['open', 'close']})
    door_state: string;

    @ApiProperty({description: '문을 잠근 시각 — 한국 시각 yyyyMMddHHmmss'})
    door_changed_at: string;
}
```

```ts
// libs/contracts/src/reservation/reservation.commands.ts — modified (RESERVATION_INTERNAL_PATH 에 추가)
    /** 내 예약 QR (GET, 이용자 — 이용 시간 안이면 QR, 없으면 그 자리에서 발급) */
    qr: (reservation_id: string) => `${RESERVATION_INTERNAL_BASE}/${encodeURIComponent(reservation_id)}/qr`,
```

```ts
// libs/contracts/src/reservation/dto/reservation-qr.dto.ts — new
import {ApiProperty} from '@nestjs/swagger';
import {IsNotEmpty, Matches} from 'class-validator';

/**
 * 내 예약 QR path — 내 예약만(남의 예약은 404)
 */
export class ReservationQrParamDto {
    @ApiProperty({description: '예약 ID'})
    @Matches(/^[a-f0-9]{32}$/, {message: '예약 ID가 올바르지 않습니다.'})
    @IsNotEmpty({message: '예약 ID를 입력해주세요.'})
    reservation_id: string;
}

/**
 * 내 예약 QR — 이용 시간에만 볼 수 있고, 유효 끝(이용 끝)이 지나면 그 QR 로는 열리지 않는다
 */
export class ReservationQrResultDto {
    @ApiProperty({description: '예약 ID'})
    reservation_id: string;

    @ApiProperty({description: '호실 ID'})
    room_id: string;

    @ApiProperty({description: 'QR 정보 (32자 — 화면에 QR 로 그려 문에 댄다)'})
    qr: string;

    @ApiProperty({description: 'QR 유효 시작 (ISO 8601 — 이용 시작)'})
    qr_starts_at: string;

    @ApiProperty({description: 'QR 유효 끝 (ISO 8601 — 이용 끝, 이 시각부터 쓸 수 없다)'})
    qr_ends_at: string;
}
```

```ts
// libs/contracts/src/store/store.commands.ts — modified (STORE_COMMAND 의 MINE_RESERVATION_POLICY 뒤에 추가)
    /** 내 업체 문 소켓 시크릿 코드 설정 (업체 총관리자) */
    MINE_DOOR_SECRET: 'admin.store.mine-door-secret',
```

```ts
// libs/contracts/src/store/dto/store-mine-door-secret.dto.ts — new
import {ApiProperty} from '@nestjs/swagger';
import {IsNotEmpty, Matches} from 'class-validator';

/**
 * 내 업체 문 소켓 시크릿 코드 — 업체 총관리자만. bcrypt 해시로 저장하고 원문은 돌려주지 않는다(잊으면 새로 정한다).
 * 바꿔도 이미 붙어 있는 소켓은 끊지 않는다 — 다음 접속부터 새 코드
 */
export class StoreMineDoorSecretDto {
    @ApiProperty({description: '시크릿 코드 (영문 · 숫자 16 ~ 64자 — 문 쪽 프로그램이 소켓 접속 헤더 x-store-secret 으로 보낸다)'})
    @Matches(/^[A-Za-z0-9]{16,64}$/, {message: '시크릿 코드는 영문 · 숫자 16 ~ 64자로 입력해주세요.'})
    @IsNotEmpty({message: '시크릿 코드를 입력해주세요.'})
    door_secret: string;
}
```

```ts
// libs/contracts/src/store/dto/store-mine.dto.ts — modified (StoreMineResultDto 의 late_refund_percent 뒤에 추가)
    @ApiProperty({description: '문 소켓 시크릿 코드 설정 여부 (0: 안 함 — 문 쪽 프로그램이 소켓에 붙을 수 없다, 1: 설정함 — 원문은 볼 수 없다)'})
    is_door_secret_set: number;
```

### user-service — 문 도메인 삭제

HTTP 문 열기 · 닫기가 소켓(`door.verify` · `door.closed` — admin-service room 이 처리)으로 바뀌어 user-service 문 도메인이 빈다. 폴더째 지운다(§1.7): `apps/user-service/src/door/`(controllers/door.controller.ts · interfaces/door.repository.interface.ts · repositories/door.repository.ts · test/* · door.module.ts · door.service.ts · door.symbols.ts · door.util.ts). `DoorStoreModule` 은 남긴다 — 예약이 QR 을 Redis 현재 QR 로 쓴다.

```ts
// apps/user-service/src/user-service.module.ts — modified
// 삭제: import {DoorModule} from './door/door.module.js';
/**
 * …
 * - DoorStoreModule: 문 정보 포트(DOOR_STORE, Redis — RedisModule 연결 포함) — 내 예약 QR 발급 · 업체 취소 때 현재 QR 쓰기 · 지우기
 * …
 * 도메인: UserModule(회원) · ReservationModule(예약). crontab 은 scheduler 앱이 돌린다(이 서비스에는 ScheduleModule 이 없다).
 */
@Module({
    imports: [
        DatabaseModule,
        MessagingModule.forService({queue: USER_COMMAND_QUEUE, binding_keys: [USER_COMMAND_BINDING], broker_user: BROKER_USER.USER_SERVICE}),
        SmsModule,
        DoorStoreModule,
        PaymentModule,
        UserModule,
        ReservationModule,
    ],
    providers: [{provide: APP_GUARD, useClass: InternalAuthGuard}, {provide: APP_INTERCEPTOR, useClass: ReturnedExceptionInterceptor}, SeederService],
})
export class UserServiceModule {}
```

### user-service — 내 예약 QR · 업체 취소 때 QR 끝내기

판정은 순수 함수 `judgeReservationQr`(TDD 표 10건 — Test Cases). 발급은 scheduler 와 겹칠 수 있어 `INSERT … ON CONFLICT DO NOTHING` 후 다시 읽는다 — `@Transactional()` 안에서 UK 위반을 일으키면 PostgreSQL 트랜잭션이 깨지므로(이후 쿼리 실패) 위반을 내지 않는 쓰기로 한다. 형제: 상태 조건 쓰기(`updateReservation` — 결과로 판별)처럼 DB 가 경합을 가르고 service 가 결과를 다시 읽는다. 내주는 QR 은 Redis 현재 QR 로도 쓴다(보여 주는 QR 로 문이 반드시 열리게 — 발급 · 기존 둘 다, 같은 값이면 멱등). Redis 가 실패하면 503 → 트랜잭션이 되돌려진다(발급 행도 없어진다 — 다음 조회 · scheduler 가 다시).

```ts
// apps/user-service/src/reservation/reservation.constants.ts — modified (추가)
/** QR 을 내주는 예약 상태 — 확정 · 이용 중 */
export const RESERVATION_QR_STATES: string[] = [RESERVATION_STATE.CONFIRMED, RESERVATION_STATE.CHECKED_IN];
```

```ts
// apps/user-service/src/reservation/reservation.util.ts — modified (import 추가 + 함수 2개)
import type {ReservationQrResultDto} from '@app/contracts/reservation/dto/reservation-qr.dto.js';
import type {RoomQrEntity} from '@app/database/entities/door/room-qr.entity.js';
import {RESERVATION_QR_STATES} from './reservation.constants.js';

/** 내 예약 QR 판정 — SHOW: 지금 QR 을 준다, ISSUE: 발급해서 준다, OUT_OF_TIME: 이용 시간 밖, NO_QR: QR 을 볼 수 없는 예약 */
export type ReservationQrVerdict = 'SHOW' | 'ISSUE' | 'OUT_OF_TIME' | 'NO_QR';

/**
 * 내 예약 QR 판정 — 확정 · 이용 중 예약의 이용 구간 [start_at, end_at) 안일 때만. QR 행이 없으면 발급(사용자 결정 2026-11-04),
 * 있으면 지금 유효할 때만 준다(업체가 끝낸 QR — ends_at ≤ 지금 — 은 볼 수 없다).
 *
 * @param reservation 예약 (상태 · 이용 구간)
 * @param roomQr 그 예약의 QR 행 (없으면 null)
 * @param now 지금
 * @returns 판정
 */
export function judgeReservationQr(
    reservation: Pick<ReservationEntity, 'reservation_state_id' | 'start_at' | 'end_at'>,
    roomQr: Pick<RoomQrEntity, 'starts_at' | 'ends_at'> | null,
    now: Date,
): ReservationQrVerdict {
    if (!RESERVATION_QR_STATES.includes(reservation.reservation_state_id)) {
        return 'NO_QR';
    }
    const at = dayjs(now);
    if (at.isBefore(reservation.start_at) || !at.isBefore(reservation.end_at)) {
        return 'OUT_OF_TIME';
    }
    if (!roomQr) {
        return 'ISSUE';
    }
    return !at.isBefore(roomQr.starts_at) && at.isBefore(roomQr.ends_at) ? 'SHOW' : 'NO_QR';
}

/**
 * 내 예약 QR 응답
 *
 * @param roomQr QR 행
 * @returns QR · 유효 시작 · 끝(ISO 8601)
 */
export function toReservationQr(roomQr: RoomQrEntity): ReservationQrResultDto {
    return {
        reservation_id: roomQr.reservation_id,
        room_id: roomQr.room_id,
        qr: roomQr.qr,
        qr_starts_at: dayjs(roomQr.starts_at).toISOString(),
        qr_ends_at: dayjs(roomQr.ends_at).toISOString(),
    };
}
```

```ts
// apps/user-service/src/reservation/reservation.service.ts — modified
// import 추가
import {BadRequestException, Inject, Injectable, InternalServerErrorException, NotFoundException} from '@nestjs/common';
import type {ReservationQrResultDto} from '@app/contracts/reservation/dto/reservation-qr.dto.js';
import {RoomQrEntity} from '@app/database/entities/door/room-qr.entity.js';
import {DOOR_STORE, PAYMENT_GATEWAY, SMS_SENDER} from '@app/integration/integration.symbols.js';
import type {DoorStoreInterface, PaymentGatewayInterface, PaymentLookupResult, SmsSenderInterface} from '@app/integration/interfaces/integration.interface.js';
// reservation.util.js 의 import 목록에 judgeReservationQr · toReservationQr 추가

    /**
     * @param reservationRepository 예약 repository 포트
     * @param paymentGateway 결제 포트(토스)
     * @param smsSender SMS 포트
     * @param doorStore 문 정보 포트(Redis — 호실의 현재 QR)
     */
    constructor(
        @Inject(RESERVATION_REPOSITORY) private readonly reservationRepository: ReservationRepositoryInterface,
        @Inject(PAYMENT_GATEWAY) private readonly paymentGateway: PaymentGatewayInterface,
        @Inject(SMS_SENDER) private readonly smsSender: SmsSenderInterface,
        @Inject(DOOR_STORE) private readonly doorStore: DoorStoreInterface,
    ) {}

    /**
     * 내 예약 QR (이용자) — 확정 · 이용 중 예약의 이용 시간 안에서만. QR 이 아직 없으면(scheduler 발급 전) 그 자리에서 발급한다(유효 = 이용 시작 ~ 이용 끝).
     * scheduler 와 겹치면 먼저 들어간 행을 쓴다(ON CONFLICT DO NOTHING 뒤 다시 읽기). 내주는 QR 은 Redis 현재 QR 로도 쓴다(문이 그 QR 로 열리게).
     * (내부 HTTP: GET /internal/v1/user-service/reservation/:reservation_id/qr)
     *
     * @param user_id 이용자 ID
     * @param reservation_id 예약 ID
     * @returns QR · 유효 시작 · 끝
     * @throws NotFoundException 내 예약이 아닐 때
     * @throws BadRequestException QR 을 볼 수 없는 상태 · 업체가 끝낸 QR · 이용 시간 밖
     */
    @Transactional()
    async getMyReservationQr(user_id: string, reservation_id: string): Promise<ReservationQrResultDto> {
        // 1. 내 예약 · 그 예약의 QR
        const reservation = await this.reservationRepository.findReservation({reservation_id, user_id});
        if (!reservation) {
            throw new NotFoundException({message: RESERVATION_NOT_FOUND_MESSAGE});
        }
        let roomQr = await this.reservationRepository.findRoomQr({reservation_id: reservation.reservation_id});

        // 2. 판정 — 상태 · 이용 시간 · QR 유효
        const verdict = judgeReservationQr(reservation, roomQr, nowKst().toDate());
        if (verdict === 'NO_QR') {
            throw new BadRequestException({message: 'QR 을 볼 수 없는 예약입니다.'});
        }
        if (verdict === 'OUT_OF_TIME') {
            throw new BadRequestException({message: 'QR 은 이용 시간에만 볼 수 있습니다.'});
        }

        // 3. 없으면 발급 — 유효 = 이용 시작 ~ 이용 끝, QR 은 32자 무작위. 같은 예약에 이미 들어갔으면 DB 가 무시하고, 다시 읽은 행을 쓴다
        if (verdict === 'ISSUE') {
            const issued = new RoomQrEntity();
            issued.room_qr_id = generateId();
            issued.room_id = reservation.room_id;
            issued.reservation_id = reservation.reservation_id;
            issued.qr = generateId();
            issued.starts_at = reservation.start_at;
            issued.ends_at = reservation.end_at;
            await this.reservationRepository.insertRoomQr(issued);
            roomQr = await this.reservationRepository.findRoomQr({reservation_id: reservation.reservation_id});
        }
        if (!roomQr) {
            throw new InternalServerErrorException({message: 'QR 정보를 발급하지 못했습니다. 관리자에게 문의해주세요.'});
        }

        // 4. Redis 현재 QR 로 — 문이 이 QR 로 열린다(유효 종료에 저절로 사라진다)
        await this.doorStore.setQr(roomQr.room_id, roomQr.qr, roomQr.ends_at);
        return toReservationQr(roomQr);
    }

// cancelStoreReservation — "2. 예약 · 구간 취소" 뒤에 단계 추가(그 뒤 번호 3 → 4, 4 → 5)
        // 3. 이용 중이면 QR 을 끝낸다 — DB 유효 종료 = 지금(이력은 남는다) · Redis 현재 QR 에서 지운다. 시작 전 예약은 QR 이 없다
        const roomQr = await this.reservationRepository.findRoomQr({reservation_id: reservation.reservation_id});
        if (roomQr && dayjs(now).isBefore(roomQr.ends_at)) {
            const endedQr = new RoomQrEntity();
            endedQr.ends_at = now;
            await this.reservationRepository.updateRoomQr({room_qr_id: roomQr.room_qr_id}, endedQr);
            await this.doorStore.revokeQr(roomQr.room_id, roomQr.qr);
        }

        // 4. 결제 — 확정은 전액 환불 신청, 결제 대기는 만료
        // … (그대로)
        // 5. 이용자 SMS — 번호가 있을 때만(마지막 단계)
```

업체 취소 JSDoc 첫 줄에 "이용 중이면 그 QR 도 끝낸다(DB 유효 종료 = 지금 · Redis 현재 QR 지우기)" 를 더한다. `dayjs` 는 service 가 아직 import 하지 않았으면 `@app/common/utils/dayjs.js` 에서 더한다.

```ts
// apps/user-service/src/reservation/interfaces/reservation.repository.interface.ts — modified
import type {RoomQrEntity} from '@app/database/entities/door/room-qr.entity.js';
// ReservationRepositoryInterface 끝에 추가
    /** 예약의 QR — 예약 1건에 1행 */
    findRoomQr(where: FindOptionsWhere<RoomQrEntity>): Promise<RoomQrEntity | null>;
    /** QR 발급 — 같은 예약 · 같은 QR 이 이미 있으면 넣지 않는다(ON CONFLICT DO NOTHING — 트랜잭션을 깨지 않는다, 호출자가 다시 읽는다) */
    insertRoomQr(entity: RoomQrEntity): Promise<void>;
    /** QR 수정 — 업체 취소 때 유효 종료 */
    updateRoomQr(where: FindOptionsWhere<RoomQrEntity>, entity: RoomQrEntity): Promise<void>;
```

```ts
// apps/user-service/src/reservation/repositories/reservation.repository.ts — modified
import type {FindOptionsWhere, InsertQueryBuilder, Repository, SelectQueryBuilder} from 'typeorm';
import {RoomQrEntity} from '@app/database/entities/door/room-qr.entity.js';

    /** t_room_qr */
    private get roomQrs(): Repository<RoomQrEntity> {
        return this.txHost.tx.getRepository(RoomQrEntity);
    }

    /**
     * 예약의 QR
     *
     * @param where 조회 조건
     * @returns QR 행 또는 null
     */
    async findRoomQr(where: FindOptionsWhere<RoomQrEntity>): Promise<RoomQrEntity | null> {
        try {
            return await this.roomQrs.findOne({where, loadRelationIds: true});
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * QR 발급 — 같은 예약(UK_RoomQr_ReservationId) · 같은 QR(UK_RoomQr_Qr)이 이미 있으면 넣지 않는다. 호출자가 다시 읽어 실제 행을 쓴다.
     *
     * @param entity new RoomQrEntity() + 할당 (@BeforeInsert 가 돈다)
     */
    async insertRoomQr(entity: RoomQrEntity): Promise<void> {
        try {
            await this.buildInsertRoomQrQuery(entity).execute();
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * QR 발급 쿼리 — INSERT … ON CONFLICT DO NOTHING(scheduler 발급과 겹쳐도 UK 위반을 내지 않는다 — 트랜잭션 안에서 위반이 나면 그 뒤 쿼리가 모두 실패한다).
     * 엔티티 인스턴스를 넘겨 @BeforeInsert 가 돈다. 매핑 민감(충돌 처리 절)이라 Data-Access Smoke spec 으로 SQL 을 고정한다.
     *
     * @param entity QR 엔티티
     * @returns 쿼리 빌더
     */
    buildInsertRoomQrQuery(entity: RoomQrEntity): InsertQueryBuilder<RoomQrEntity> {
        return this.roomQrs.createQueryBuilder().insert().into(RoomQrEntity).values(entity).orIgnore();
    }

    /**
     * QR 수정 (업체 취소 — 유효 종료)
     *
     * @param where 수정 조건
     * @param entity 바꿀 필드만 할당한 엔티티
     */
    async updateRoomQr(where: FindOptionsWhere<RoomQrEntity>, entity: RoomQrEntity): Promise<void> {
        try {
            await this.roomQrs.update(where, entity);
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }
```

```ts
// apps/user-service/src/reservation/controllers/reservation.controller.ts — modified (상세 뒤에 추가)
import {ReservationQrParamDto, ReservationQrResultDto} from '@app/contracts/reservation/dto/reservation-qr.dto.js';

    /**
     * 내 예약 QR (이용자)
     */
    @Get('/:reservation_id/qr')
    @HttpCode(200)
    async getMyReservationQr(@InternalActor('user_id') user_id: string, @Param() param: ReservationQrParamDto): Promise<ReservationQrResultDto> {
        return this.reservationService.getMyReservationQr(user_id, param.reservation_id);
    }
```

```ts
// apps/user-service/src/reservation/test/reservation.test-helper.ts — modified
import {DOOR_STORE, PAYMENT_GATEWAY, SMS_SENDER} from '@app/integration/integration.symbols.js';

/** 문 정보 포트 mock — 이 도메인은 현재 QR 쓰기 · 지우기만 쓴다 */
export type DoorStoreMock = {setQr: Mock; revokeQr: Mock};

/**
 * 문 정보 포트 mock — 쓰기 · 지우기는 성공
 *
 * @returns mock
 */
export function createDoorStoreMock(): DoorStoreMock {
    return {setQr: vi.fn().mockResolvedValue(undefined), revokeQr: vi.fn().mockResolvedValue(undefined)};
}

// createReservationRepositoryMock() 에 추가
        findRoomQr: vi.fn().mockResolvedValue(null),
        insertRoomQr: vi.fn(),
        updateRoomQr: vi.fn(),

// bootCommandPath(repo, payment, sms, door = createDoorStoreMock()) · bootHttpPath(repo, door = createDoorStoreMock()) — providers 에 {provide: DOOR_STORE, useValue: door}

/** 호실 QR ID · QR */
export const ROOM_QR_ID = '4'.repeat(32);
export const QR = '5'.repeat(32);

/**
 * 호실 QR — 예약 이용 구간(2026-11-10 13:00 ~ 16:00 한국 시각) 동안 유효
 *
 * @param override 바꿀 필드
 * @returns QR 엔티티 모양
 */
export function roomQrEntity(override: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        room_qr_id: ROOM_QR_ID,
        room_id: ROOM_ID,
        reservation_id: RESERVATION_ID,
        qr: QR,
        starts_at: new Date('2026-11-10T04:00:00Z'),
        ends_at: new Date('2026-11-10T07:00:00Z'),
        ...override,
    };
}
```

### scheduler — QR 맞추기 crontab

형제 `reservation-payment-expire.crontab.ts` 의 틀(운영 가드 · `JobLockService` · 건별 catch)을 따른다. 1분마다 이용 중인 확정 · 이용 중 예약을 QR 행과 함께 읽어, 없으면 발급(DB)하고 유효한 QR 을 Redis 현재 QR 로 다시 쓴다 — 이용자 조회 · 업체 취소의 Redis 쓰기가 실패했거나 Redis 가 재시작돼도 1분 안에 맞춰진다(같은 값이면 그대로 — 멱등, 대상은 상태로 고르므로 두 번 돌아도 같은 결과). 엔티티 조립은 형제처럼 scheduler `reservation.util.ts`(`buildConfirmTransition` 등). 그래서 scheduler 도 Redis(DoorStoreModule)를 쓴다.

```ts
// apps/scheduler/src/reservation/interfaces/reservation.repository.interface.ts — modified (추가)
import type {FindOptionsWhere} from 'typeorm';
import type {RoomQrEntity} from '@app/database/entities/door/room-qr.entity.js';

/** QR 을 맞출 예약 행 — 이용 중인 확정 · 이용 중 예약 + 그 예약의 QR(없으면 null) (QueryBuilder raw — t_room_qr 왼쪽 조인) */
export interface QrSyncTargetRow {
    reservation_id: string;
    room_id: string;
    start_at: Date;
    end_at: Date;
    qr: string | null;
    qr_ends_at: Date | null;
}

// ReservationRepositoryInterface 끝에 추가
    /** QR 맞추기 대상 — 확정 · 이용 중 · start_at ≤ now < end_at, 그 예약의 QR(왼쪽 조인), 시작 순 */
    findQrSyncTargets(now: Date): Promise<QrSyncTargetRow[]>;
    /** 예약의 QR — 예약 1건에 1행 */
    findRoomQr(where: FindOptionsWhere<RoomQrEntity>): Promise<RoomQrEntity | null>;
    /** QR 발급 — 같은 예약 · 같은 QR 이 이미 있으면 넣지 않는다(ON CONFLICT DO NOTHING — 이용자 조회 발급과 겹쳐도 된다) */
    insertRoomQr(entity: RoomQrEntity): Promise<void>;
```

```ts
// apps/scheduler/src/reservation/repositories/reservation.repository.ts — modified (추가)
import type {FindOptionsWhere, InsertQueryBuilder, Repository, SelectQueryBuilder} from 'typeorm';
import {RoomQrEntity} from '@app/database/entities/door/room-qr.entity.js';
import type {ExpiredPendingRow, QrSyncTargetRow, ReservationRepositoryInterface} from '../interfaces/reservation.repository.interface.js';

    /** t_room_qr */
    private get roomQrs(): Repository<RoomQrEntity> {
        return this.txHost.tx.getRepository(RoomQrEntity);
    }

    /**
     * QR 맞추기 대상
     *
     * @param now 지금
     * @returns 예약 + QR 행
     */
    async findQrSyncTargets(now: Date): Promise<QrSyncTargetRow[]> {
        try {
            return await this.buildQrSyncTargetsQuery(now).getRawMany<QrSyncTargetRow>();
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * QR 맞추기 대상 쿼리 — 확정 · 이용 중 · start_at ≤ now < end_at, 그 예약의 QR 을 왼쪽 조인(없으면 qr · qr_ends_at NULL), 시작 순.
     * 매핑 민감(조인 · raw select — 별칭이 QrSyncTargetRow 키와 같다)이라 Data-Access Smoke spec 으로 SQL 을 고정한다.
     *
     * @param now 지금
     * @returns 쿼리 빌더
     */
    buildQrSyncTargetsQuery(now: Date): SelectQueryBuilder<ReservationEntity> {
        return this.reservations
            .createQueryBuilder('r')
            .select('r.reservation_id', 'reservation_id')
            .addSelect('r.room_id', 'room_id')
            .addSelect('r.start_at', 'start_at')
            .addSelect('r.end_at', 'end_at')
            .addSelect('q.qr', 'qr')
            .addSelect('q.ends_at', 'qr_ends_at')
            .leftJoin(RoomQrEntity, 'q', 'q.reservation_id = r.reservation_id')
            .where('r.reservation_state_id IN (:...states)', {states: [RESERVATION_STATE.CONFIRMED, RESERVATION_STATE.CHECKED_IN]})
            .andWhere('r.start_at <= :now', {now})
            .andWhere('r.end_at > :now', {now})
            .orderBy('r.start_at', 'ASC');
    }

    /**
     * 예약의 QR
     *
     * @param where 조회 조건
     * @returns QR 행 또는 null
     */
    async findRoomQr(where: FindOptionsWhere<RoomQrEntity>): Promise<RoomQrEntity | null> {
        try {
            return await this.roomQrs.findOne({where, loadRelationIds: true});
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * QR 발급 — 같은 예약 · 같은 QR 이 이미 있으면 넣지 않는다
     *
     * @param entity new RoomQrEntity() + 할당 (@BeforeInsert 가 돈다)
     */
    async insertRoomQr(entity: RoomQrEntity): Promise<void> {
        try {
            await this.buildInsertRoomQrQuery(entity).execute();
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * QR 발급 쿼리 — INSERT … ON CONFLICT DO NOTHING. 매핑 민감(충돌 처리 절)이라 Data-Access Smoke spec 으로 SQL 을 고정한다.
     *
     * @param entity QR 엔티티
     * @returns 쿼리 빌더
     */
    buildInsertRoomQrQuery(entity: RoomQrEntity): InsertQueryBuilder<RoomQrEntity> {
        return this.roomQrs.createQueryBuilder().insert().into(RoomQrEntity).values(entity).orIgnore();
    }
```

```ts
// apps/scheduler/src/reservation/reservation.util.ts — modified (추가)
import {generateId} from '@app/common/utils/id.js';
import {RoomQrEntity} from '@app/database/entities/door/room-qr.entity.js';
import type {QrSyncTargetRow} from './interfaces/reservation.repository.interface.js';

/**
 * 이용이 시작된 예약의 QR — 유효 = 이용 시작 ~ 이용 끝, QR 은 32자 무작위(user-service 내 예약 QR 발급과 같은 값).
 *
 * @param row 맞추기 대상 예약
 * @returns QR 엔티티
 */
export function buildRoomQr(row: QrSyncTargetRow): RoomQrEntity {
    const roomQr = new RoomQrEntity();
    roomQr.room_qr_id = generateId();
    roomQr.room_id = row.room_id;
    roomQr.reservation_id = row.reservation_id;
    roomQr.qr = generateId();
    roomQr.starts_at = row.start_at;
    roomQr.ends_at = row.end_at;
    return roomQr;
}
```

```ts
// apps/scheduler/src/reservation/crontabs/reservation-qr-sync.crontab.ts — new
import {Inject, Injectable} from '@nestjs/common';
import {Cron, CronExpression} from '@nestjs/schedule';
import {dayjs} from '@app/common/utils/dayjs.js';
import {JobLockService} from '@app/database/job-lock/job-lock.service.js';
import {DOOR_STORE} from '@app/integration/integration.symbols.js';
import type {DoorStoreInterface} from '@app/integration/interfaces/integration.interface.js';
import type {ReservationRepositoryInterface} from '../interfaces/reservation.repository.interface.js';
import {RESERVATION_REPOSITORY} from '../reservation.symbols.js';
import {buildRoomQr} from '../reservation.util.js';

/** QR 맞추기 잠금 키 */
export const RESERVATION_QR_SYNC_LOCK = 'reservation.qr-sync';

/**
 * QR 맞추기 스케줄러 — 이용 중인 예약마다 QR 이 있게 하고(없으면 발급 — 사용자 결정 2026-11-04: 미래 예약에 미리 주지 않는다), 그 QR 을 Redis 현재 QR 로 다시 쓴다.
 * DB(이력)와 Redis(현재 값)가 한쪽 쓰기 실패 · Redis 재시작으로 어긋나도 1분 안에 맞춰진다. 이용자가 먼저 발급했으면 그 QR 을 쓰고, 두 번 넣으려 하면 DB 가 무시한다(ON CONFLICT DO NOTHING).
 * 업체가 끝낸 QR(유효 종료 ≤ 지금)은 다시 쓰지 않는다 — 그 예약은 취소 상태라 대상에도 없다. 건별 실패는 다음 회차에 다시 본다.
 */
@Injectable()
export class ReservationQrSyncCrontab {
    /**
     * @param reservationRepository 예약 repository 포트
     * @param doorStore 문 정보 포트 (Redis — 현재 QR)
     * @param jobLock 인스턴스 1대 실행 잠금
     */
    constructor(
        @Inject(RESERVATION_REPOSITORY) private readonly reservationRepository: ReservationRepositoryInterface,
        @Inject(DOOR_STORE) private readonly doorStore: DoorStoreInterface,
        private readonly jobLock: JobLockService,
    ) {}

    /**
     * 1분마다(운영 전용) — 이용 중 예약의 QR 을 발급 · Redis 현재 QR 로 맞춘다.
     */
    @Cron(CronExpression.EVERY_MINUTE)
    async syncReservationQrs(): Promise<void> {
        if (process.env.NODE_ENV !== 'production') {
            return;
        }
        await this.jobLock.runExclusive(RESERVATION_QR_SYNC_LOCK, async () => {
            const now = new Date();
            const rows = await this.reservationRepository.findQrSyncTargets(now);
            for (const row of rows) {
                try {
                    let qr = row.qr;
                    let qr_ends_at = row.qr_ends_at;
                    if (!qr) {
                        await this.reservationRepository.insertRoomQr(buildRoomQr(row));
                        const issued = await this.reservationRepository.findRoomQr({reservation_id: row.reservation_id});
                        qr = issued?.qr ?? null;
                        qr_ends_at = issued?.ends_at ?? null;
                    }
                    if (qr && qr_ends_at && dayjs(now).isBefore(qr_ends_at)) {
                        await this.doorStore.setQr(row.room_id, qr, qr_ends_at);
                    }
                } catch {
                    // Redis 503 · 건별 실패는 건너뛰고 다음 회차에 다시 본다
                }
            }
        });
    }
}
```

```ts
// apps/scheduler/src/reservation/reservation.module.ts — modified
import {ReservationQrSyncCrontab} from './crontabs/reservation-qr-sync.crontab.js';

/**
 * scheduler 예약 도메인 — crontab 4개(결제 대기 만료 · 늦은 승인 재확인 · 환불 · 이용 중 QR 맞추기).
 * 결제 포트(PAYMENT_GATEWAY) · 문 정보 포트(DOOR_STORE)는 루트 모듈의 PaymentModule · DoorStoreModule 이 전역으로 준다.
 */
@Module({
    providers: [
        ReservationPaymentExpireCrontab,
        ReservationPaymentRecheckCrontab,
        ReservationRefundCrontab,
        ReservationQrSyncCrontab,
        {provide: RESERVATION_REPOSITORY, useClass: ReservationRepository},
    ],
})
export class ReservationModule {}
```

```ts
// apps/scheduler/src/scheduler.module.ts — modified
import {DoorStoreModule} from '@app/integration/door/door-store.module.js';
// JSDoc 목록에 추가: * - DoorStoreModule: 문 정보 포트(DOOR_STORE, Redis) — 이용 중 예약의 QR 을 Redis 현재 QR 로 맞춘다
@Module({imports: [DatabaseModule, ScheduleModule.forRoot(), PaymentModule, DoorStoreModule, UserModule, ReservationModule]})
export class SchedulerModule {}
```

### admin-service — 호실 목록 문 상태 · 바로 열기 · 소켓 접속 · QR 확인 · 잠금 (room)

매니저 문 API 와 소켓이 부르는 처리는 room 도메인(사용자 결정 2026-11-04). 형제 `getMyRooms` 의 업체 확인(`findManagerStore(user_id, false)` — room.service.ts:749) · 호실 확인(`findRoom({room_id, store_id})`)을 그대로 쓴다. 바로 열기 · QR 확인 · 잠금은 Redis 쓰기뿐이라 동기 경로이고 `@Transactional()` 이 없다(DB 쓰기 없음). 소켓 접속 확인은 업체가 있는지 알려 주지 않도록 실패 이유를 가르지 않고 모두 401.

```ts
// apps/admin-service/src/room/interfaces/room.repository.interface.ts — modified (추가)
/** 문 소켓 접속 — 업체 호실 문 1개 (QueryBuilder raw — t_room_group 조인, 지워지지 않은 호실 · 그룹) */
export interface RoomDoorRow {
    room_id: string;
    room_name: string;
    floor: number;
}

// RoomRepositoryInterface 끝에 추가
    /** 문 소켓 접속 확인의 업체 — 지워지지 않은 업체(조건은 service: 탈퇴 제외) */
    findDoorStore(where: FindOptionsWhere<StoreEntity>): Promise<StoreEntity | null>;
    /** 업체 호실 문 목록 행 — 지워지지 않은 호실 · 그룹, 층 · 호실명 순 */
    findStoreDoorRoomRows(store_id: string): Promise<RoomDoorRow[]>;
```

```ts
// apps/admin-service/src/room/repositories/room.repository.ts — modified (추가)
import type {RoomDoorRow, RoomListFilter, RoomRepositoryInterface, RoomRow /* … */} from '../interfaces/room.repository.interface.js';

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
     * 업체 호실 문 목록 행
     *
     * @param store_id 업체 ID
     * @returns 호실 행 (층 · 호실명 순)
     */
    async findStoreDoorRoomRows(store_id: string): Promise<RoomDoorRow[]> {
        try {
            return await this.buildStoreDoorRoomRowsQuery(store_id).getRawMany<RoomDoorRow>();
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 업체 호실 문 목록 쿼리 — 지워지지 않은 호실 · 그룹(조인), 층 · 호실명 순(페이지 없음 — 소켓 접속 때 업체 전체).
     * 매핑 민감(조인 · raw select — 별칭이 RoomDoorRow 키와 같다)이라 Data-Access Smoke spec 으로 SQL 을 고정한다.
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
```

```ts
// apps/admin-service/src/room/room.util.ts — modified
import type {RoomDoorSnapshotItemResultDto} from '@app/contracts/room/dto/room-door-snapshot.dto.js';
import type {DoorRecord} from '@app/integration/interfaces/integration.interface.js';
import type {RoomDoorRow /* …, RoomRow */} from './interfaces/room.repository.interface.js';

/**
 * 호실 목록 항목 — 문 상태 · 시각은 Redis 문 정보
 *
 * @param row 호실 목록 행
 * @param door 그 호실 문 상태
 * @returns 응답 항목
 */
export function toRoomListItem(row: RoomRow, door: DoorRecord): RoomListItemResultDto {
    return {
        room_id: row.room_id,
        room_group_id: row.room_group_id,
        room_group_name: row.room_group_name,
        room_name: row.room_name,
        floor: Number(row.floor),
        room_state_id: row.room_state_id,
        room_state_name: row.room_state_name,
        created_at: dayjs(row.created_at).toISOString(),
        door_state: door.state,
        door_changed_at: door.changed_at,
    };
}

/**
 * 문 소켓 접속 항목 — 호실 + 문 상태
 *
 * @param row 업체 호실 문 행
 * @param door 그 호실 문 상태
 * @returns 응답 항목
 */
export function toRoomDoorSnapshotItem(row: RoomDoorRow, door: DoorRecord): RoomDoorSnapshotItemResultDto {
    return {room_id: row.room_id, room_name: row.room_name, floor: Number(row.floor), door_state: door.state, door_changed_at: door.changed_at};
}
```

```ts
// apps/admin-service/src/room/room.service.ts — modified
// import 추가
import {BadRequestException, Inject, Injectable, NotFoundException, UnauthorizedException} from '@nestjs/common';
import {ILike, Not} from 'typeorm';
import {matchBcrypt} from '@app/common/utils/bcrypt.js';
import type {RoomDoorCloseDto, RoomDoorCloseResultDto} from '@app/contracts/room/dto/room-door-close.dto.js';
import type {RoomDoorOpenResultDto} from '@app/contracts/room/dto/room-door-open.dto.js';
import type {RoomDoorSnapshotDto, RoomDoorSnapshotResultDto} from '@app/contracts/room/dto/room-door-snapshot.dto.js';
import type {RoomDoorVerifyDto, RoomDoorVerifyResultDto} from '@app/contracts/room/dto/room-door-verify.dto.js';
import {DOOR_STATE} from '@app/integration/integration.constants.js';
import {DOOR_STORE, STORAGE_GATEWAY} from '@app/integration/integration.symbols.js';
import {toDoorTime} from '@app/integration/integration.util.js';
import type {DoorStoreInterface, StorageGatewayInterface} from '@app/integration/interfaces/integration.interface.js';
// room.constants.js 에서 ROOM_STORE_STATE_LEAVE 추가, room.util.js 에서 toRoomDoorSnapshotItem 추가

    /**
     * @param roomRepository room repository 포트
     * @param storageGateway 파일 저장소 포트 (S3)
     * @param doorStore 문 정보 포트 (Redis — 호실 목록 문 상태 · 바로 열기 · 소켓 접속 · QR 확인 · 잠금)
     */
    constructor(
        @Inject(ROOM_REPOSITORY)
        private readonly roomRepository: RoomRepositoryInterface,
        @Inject(STORAGE_GATEWAY)
        private readonly storageGateway: StorageGatewayInterface,
        @Inject(DOOR_STORE)
        private readonly doorStore: DoorStoreInterface,
    ) {}

    /**
     * 호실 목록 — 필터(층 · 그룹), 층 · 호실명 순. 그룹명 · 상태명 · 문 상태(Redis — 그 페이지 호실만 한 번에) 포함. Redis 에 닿지 못하면 503. (내부 HTTP: GET /internal/v1/admin-service/room)
     * …
     */
    async getMyRooms(user_id: string, dto: RoomListDto): Promise<RoomListResultDto> {
        // 1 ~ 3 (그대로)
        const rows = await this.roomRepository.findRoomRows(filter, pagination.limit, pagination.offset);

        // 4. 그 페이지 호실들의 문 상태 (MGET — 받은 순서대로)
        const doors = await this.doorStore.getMany(rows.map((row) => row.room_id));
        return {list: rows.map((row, index) => toRoomListItem(row, doors[index])), pagination: pagination.getPagination()};
    }

    /**
     * 호실 문 바로 열기 (업체 관리자) — 내 업체의 지워지지 않은 호실 문을 open + 지금 시각으로 쓰고 그 업체 소켓에 열기 명령(door.open)을 보낸다(Redis 채널).
     * 실제 문은 문 쪽 프로그램이 연다. 사용중지 · 예약 여부는 보지 않는다(관리자 판단). DB 쓰기가 없어 `@Transactional()` 이 없다. (내부 HTTP: POST /internal/v1/admin-service/room/:room_id/door-open)
     *
     * @param user_id 로그인 매니저 ID
     * @param room_id 호실 ID
     * @returns 연 문의 room_id · 상태 · 시각
     * @throws NotFoundException 소속 업체 · 호실이 없을 때
     */
    async openMyRoomDoor(user_id: string, room_id: string): Promise<RoomDoorOpenResultDto> {
        // 1. 내 업체 · 그 호실
        const store = await this.roomRepository.findManagerStore(user_id, false);
        if (!store) {
            throw new NotFoundException({message: ROOM_MANAGER_STORE_NOT_FOUND_MESSAGE});
        }
        const room = await this.roomRepository.findRoom({room_id, store_id: store.store_id});
        if (!room) {
            throw new NotFoundException({message: ROOM_NOT_FOUND_MESSAGE});
        }

        // 2. open + 지금 시각 + 열기 명령 (포트가 스크립트 1개로)
        const changed_at = toDoorTime(new Date());
        await this.doorStore.open(room.room_id, store.store_id, changed_at);
        return {room_id: room.room_id, door_state: DOOR_STATE.OPEN, door_changed_at: changed_at};
    }

    /**
     * 문 소켓 접속 확인 (gateway 문 소켓) — 지워지지 않고 탈퇴하지 않은 업체 · 시크릿 설정 · bcrypt 일치면 그 업체 호실 전체의 문 상태. 영업 상태는 보지 않는다(문은 영업과 별개).
     * 실패 이유(업체 없음 · 탈퇴 · 시크릿 미설정 · 불일치)는 가르지 않고 모두 401 — 업체가 있는지 알려 주지 않는다. (내부 HTTP: POST /internal/v1/admin-service/room/door-snapshot)
     *
     * @param dto 업체 ID · 시크릿 코드
     * @returns 업체 ID · 호실 문 목록
     * @throws UnauthorizedException 확인 실패
     */
    async getDoorSnapshot(dto: RoomDoorSnapshotDto): Promise<RoomDoorSnapshotResultDto> {
        // 1. 업체 · 시크릿
        const store = await this.roomRepository.findDoorStore({store_id: dto.store_id, store_state_id: Not(ROOM_STORE_STATE_LEAVE)});
        if (!store?.door_secret || !(await matchBcrypt(dto.door_secret, store.door_secret))) {
            throw new UnauthorizedException({message: '업체 ID 또는 시크릿 코드가 올바르지 않습니다.'});
        }

        // 2. 호실 · 문 상태 (업체 전체 — 페이지 없음)
        const rows = await this.roomRepository.findStoreDoorRoomRows(store.store_id);
        const doors = await this.doorStore.getMany(rows.map((row) => row.room_id));
        return {store_id: store.store_id, list: rows.map((row, index) => toRoomDoorSnapshotItem(row, doors[index]))};
    }

    /**
     * 문 소켓 QR 확인 (gateway 문 소켓) — 문이 읽은 QR 을 그 호실의 Redis 현재 QR 과 비교한다. 같으면 open + 지금 시각으로 쓰고 ok, 다르거나 없으면 그대로 두고 ok false.
     * QR 값은 서버 밖으로 나가지 않는다(사용자 결정 2026-11-04). (내부 HTTP: POST /internal/v1/admin-service/room/door-verify)
     *
     * @param dto 업체 ID(소켓이 확인한 값) · 호실 ID · 읽은 QR
     * @returns 호실 ID · 일치 여부
     * @throws NotFoundException 그 업체의 호실이 아닐 때
     */
    async verifyStoreDoor(dto: RoomDoorVerifyDto): Promise<RoomDoorVerifyResultDto> {
        // 1. 그 업체의 호실
        const room = await this.roomRepository.findRoom({room_id: dto.room_id, store_id: dto.store_id});
        if (!room) {
            throw new NotFoundException({message: ROOM_NOT_FOUND_MESSAGE});
        }

        // 2. 현재 QR 과 비교 + 같으면 열림 기록 (포트가 스크립트 1개로)
        const ok = await this.doorStore.verify(room.room_id, dto.qr, toDoorTime(new Date()));
        return {room_id: room.room_id, ok};
    }

    /**
     * 문 소켓 잠금 알림 (gateway 문 소켓) — 하드웨어가 잠겼다(잠금 버튼 · 자동 잠금, 인증된 소켓이라 QR 없이). 그 업체의 지워지지 않은 호실이면 close + 지금 시각.
     * (내부 HTTP: POST /internal/v1/admin-service/room/door-close)
     *
     * @param dto 업체 ID(소켓이 확인한 값) · 호실 ID
     * @returns 잠근 문의 room_id · 상태 · 시각
     * @throws NotFoundException 그 업체의 호실이 아닐 때
     */
    async closeStoreDoor(dto: RoomDoorCloseDto): Promise<RoomDoorCloseResultDto> {
        // 1. 그 업체의 호실
        const room = await this.roomRepository.findRoom({room_id: dto.room_id, store_id: dto.store_id});
        if (!room) {
            throw new NotFoundException({message: ROOM_NOT_FOUND_MESSAGE});
        }

        // 2. close + 지금 시각
        const changed_at = toDoorTime(new Date());
        await this.doorStore.close(room.room_id, changed_at);
        return {room_id: room.room_id, door_state: DOOR_STATE.CLOSE, door_changed_at: changed_at};
    }
```

```ts
// apps/admin-service/src/room/controllers/room.controller.ts — modified (정적 경로를 먼저 — 호실 목록 `/` 앞에)
import {RoomDoorCloseDto, RoomDoorCloseResultDto} from '@app/contracts/room/dto/room-door-close.dto.js';
import {RoomDoorOpenParamDto, RoomDoorOpenResultDto} from '@app/contracts/room/dto/room-door-open.dto.js';
import {RoomDoorSnapshotDto, RoomDoorSnapshotResultDto} from '@app/contracts/room/dto/room-door-snapshot.dto.js';
import {RoomDoorVerifyDto, RoomDoorVerifyResultDto} from '@app/contracts/room/dto/room-door-verify.dto.js';

    /**
     * 문 소켓 접속 확인 (gateway 문 소켓 — actor 없음, 내부 토큰만)
     */
    @Post('/door-snapshot')
    @HttpCode(200)
    async getDoorSnapshot(@Body() dto: RoomDoorSnapshotDto): Promise<RoomDoorSnapshotResultDto> {
        return this.roomService.getDoorSnapshot(dto);
    }

    /**
     * 문 소켓 QR 확인 (gateway 문 소켓 — actor 없음, 내부 토큰만)
     */
    @Post('/door-verify')
    @HttpCode(200)
    async verifyStoreDoor(@Body() dto: RoomDoorVerifyDto): Promise<RoomDoorVerifyResultDto> {
        return this.roomService.verifyStoreDoor(dto);
    }

    /**
     * 문 소켓 잠금 알림 (gateway 문 소켓 — actor 없음, 내부 토큰만)
     */
    @Post('/door-close')
    @HttpCode(200)
    async closeStoreDoor(@Body() dto: RoomDoorCloseDto): Promise<RoomDoorCloseResultDto> {
        return this.roomService.closeStoreDoor(dto);
    }

    /**
     * 호실 문 바로 열기 (업체 관리자)
     */
    @Post('/:room_id/door-open')
    @HttpCode(200)
    async openMyRoomDoor(@InternalActor('user_id') user_id: string, @Param() param: RoomDoorOpenParamDto): Promise<RoomDoorOpenResultDto> {
        return this.roomService.openMyRoomDoor(user_id, param.room_id);
    }
```

```ts
// apps/admin-service/src/admin-service.module.ts — modified
import {DoorStoreModule} from '@app/integration/door/door-store.module.js';
// JSDoc 목록에 추가: * - DoorStoreModule: 문 정보 포트(DOOR_STORE, Redis — RedisModule 연결 포함) — 호실 목록 문 상태 · 바로 열기 · 문 소켓 접속 · QR 확인 · 잠금
    imports: [
        // …
        SmsModule,
        StorageModule,
        DoorStoreModule,
        // …
    ],
```

```ts
// apps/admin-service/src/room/test/room.test-helper.ts — modified
import {DOOR_STORE, STORAGE_GATEWAY} from '@app/integration/integration.symbols.js';
import type {DoorStoreInterface} from '@app/integration/interfaces/integration.interface.js';

/** 문 정보 포트 mock 모양 */
export type DoorStoreMock = {[K in keyof DoorStoreInterface]: Mock};

/**
 * 문 정보 포트 mock — 여러 문 읽기는 받은 수만큼 기록 없는 문(close · 00000000000000), QR 확인은 일치(true), 쓰기는 성공.
 *
 * @returns mock
 */
export function createDoorStoreMock(): DoorStoreMock {
    return {
        getMany: vi.fn((room_ids: string[]) => Promise.resolve(room_ids.map(() => ({state: 'close', changed_at: '00000000000000'})))),
        setQr: vi.fn().mockResolvedValue(undefined),
        revokeQr: vi.fn().mockResolvedValue(undefined),
        verify: vi.fn().mockResolvedValue(true),
        open: vi.fn().mockResolvedValue(undefined),
        close: vi.fn().mockResolvedValue(undefined),
        subscribe: vi.fn(),
    };
}

// createRoomRepositoryMock() 에 추가
        findDoorStore: vi.fn(),
        findStoreDoorRoomRows: vi.fn().mockResolvedValue([]),

// bootCommandPath · bootHttpPath — 세 번째 인자 door: DoorStoreMock = createDoorStoreMock(), providers 에 {provide: DOOR_STORE, useValue: door}
```

### admin-service — 업체 문 시크릿 (store)

형제 `changeMyStoreReservationPolicy`(store.service.ts:1026 — `findStoreByManager(user_id, true)` 잠금 → `new StoreEntity()` 바꿀 필드만 → `updateStore`)와 같은 틀. 해시는 입점 신청의 업체 총관리자 비밀번호와 같은 `getBcrypt`(store.service.ts:169). 업체 총관리자만인 것은 게이트웨이 `RolesGuard` 가 가르고 service 는 다시 보지 않는다(AGENTS 그룹 안 권한).

```ts
// apps/admin-service/src/store/store.service.ts — modified (changeMyStoreReservationPolicy 뒤에 추가)
import type {StoreMineDoorSecretDto} from '@app/contracts/store/dto/store-mine-door-secret.dto.js';

    /**
     * 내 업체 문 소켓 시크릿 코드 설정 (업체 총관리자 — 그룹 안 권한은 게이트웨이 RolesGuard) — bcrypt 해시로 저장, 원문은 돌려주지 않는다.
     * 이미 붙어 있는 소켓은 끊지 않는다(다음 접속부터 새 코드). (RabbitMQ: admin.store.mine-door-secret)
     *
     * @param user_id 로그인 매니저 ID (업체 총관리자)
     * @param dto 시크릿 코드
     */
    @Transactional()
    async changeMyStoreDoorSecret(user_id: string, dto: StoreMineDoorSecretDto): Promise<void> {
        const store = await this.storeRepository.findStoreByManager(user_id, true);
        if (!store) {
            throw new NotFoundException({message: STORE_MANAGER_STORE_NOT_FOUND_MESSAGE});
        }
        const storeEntity = new StoreEntity();
        storeEntity.door_secret = await getBcrypt(dto.door_secret);
        await this.storeRepository.updateStore({store_id: store.store_id}, storeEntity);
    }
```

```ts
// apps/admin-service/src/store/controllers/store.controller.queue.ts — modified (MINE_RESERVATION_POLICY 핸들러 뒤에 추가)
import {StoreMineDoorSecretDto} from '@app/contracts/store/dto/store-mine-door-secret.dto.js';

    /**
     * 내 업체 문 소켓 시크릿 코드 설정 — 업체 총관리자
     *
     * @param command 명령 봉투 (actor 필수)
     */
    @OnCommand(STORE_COMMAND.MINE_DOOR_SECRET)
    async changeMyStoreDoorSecret(command: MessageEnvelope<StoreMineDoorSecretDto>): Promise<void> {
        return this.storeService.changeMyStoreDoorSecret(requireActor(command).user_id, command.payload);
    }
```

```ts
// apps/admin-service/src/store/store.util.ts — modified (toMineDetail 의 late_refund_percent 뒤에 추가)
        is_door_secret_set: entity.door_secret ? 1 : 0,
```

```ts
// apps/admin-service/src/store/test/store.test-helper.ts — modified (업체 엔티티 · 행 모양에 추가)
        door_secret: null,
```

### gateway — 공개 라우트 (Entry Point)

데코레이터 순서는 AGENTS API & Docs — 동기: verb → `@UseGuards` → `@HttpCode(200)` → `@ApiBearerAuth()` → `@ApiOperation` → `@ApiOkResponse` → 에러들. 큐: verb → `@UseGuards(그룹 가드, RolesGuard)` → `@Roles` → `@ApiBearerAuth` → `@ApiOperation` → `@ApiBody` → `@ApiProduces` → 에러들(`@ApiUnauthorizedResponse` 뒤 `@ApiForbiddenResponse`). 형제: `manager.controller.queue.ts` 의 업체 관리자 등록(`@Roles(AUTH_ID.HEAD_MANAGER)`).

```ts
// apps/gateway/src/api/v1/admin-service/room/controllers/room.controller.ts — modified (호실 목록 `/` 앞에 추가)
import {RoomDoorOpenParamDto, RoomDoorOpenResultDto} from '@app/contracts/room/dto/room-door-open.dto.js';

    /**
     * 호실 문 바로 열기 — 서버는 Redis 문 상태를 open + 지금 시각으로 바꾸고 그 업체 문 소켓에 열기 명령(door.open)을 보낸다. 실제 문은 문 쪽 프로그램이 연다
     */
    @Post('/:room_id/door-open')
    @UseGuards(PassportJwtManagerAuthGuard)
    @HttpCode(200)
    @ApiBearerAuth()
    @ApiOperation({summary: '호실 문 바로 열기'})
    @ApiOkResponse({type: RoomDoorOpenResultDto})
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async openMyRoomDoor(@PassportActor() actor: Actor, @Param() param: RoomDoorOpenParamDto): Promise<RoomDoorOpenResultDto> {
        return this.internalHttp.request<RoomDoorOpenResultDto>('admin', 'POST', ROOM_INTERNAL_PATH.doorOpen(param.room_id), {actor});
    }
```

```ts
// apps/gateway/src/api/v1/admin-service/store/controllers/store.controller.queue.ts — modified
import {ApiForbiddenResponse /* …기존 swagger import */} from '@nestjs/swagger';
import {AUTH_ID} from '@app/contracts/roles.js';
import {StoreMineDoorSecretDto} from '@app/contracts/store/dto/store-mine-door-secret.dto.js';
import {Roles} from '../../../../../guards/roles/roles.decorator.js';
import {RolesGuard} from '../../../../../guards/roles/roles.guard.js';

    /**
     * 내 업체 예약 · 환불 규정 설정 (업체 관리자) — 이용 시작 n시간 전부터 예약, n분 전까지 100% 환불, 그 뒤 ~ 이용 시작 전 취소는 비율 환불. done 의 data 는 null.
     */
    // ↑ 주석만 바로잡는다(지난 Phase 17 에서 바뀐 규정 — "n시간 전까지 100% 환불(이후 환불 불가)" 는 옛 문구)

    /**
     * 내 업체 문 소켓 시크릿 코드 설정 (업체 총관리자만) — bcrypt 해시로 저장해 원문은 다시 볼 수 없다. 문 쪽 프로그램이 소켓 접속 헤더 x-store-secret 으로 보낸다. done 의 data 는 null.
     */
    @Patch('/mine/door-secret')
    @UseGuards(PassportJwtManagerAuthGuard, RolesGuard)
    @Roles(AUTH_ID.HEAD_MANAGER)
    @ApiBearerAuth()
    @ApiOperation({summary: '내 업체 문 소켓 시크릿 코드 설정'})
    @ApiBody({type: StoreMineDoorSecretDto})
    @ApiProduces('text/event-stream')
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiForbiddenResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async changeMyStoreDoorSecret(@PassportActor() actor: Actor, @Body() dto: StoreMineDoorSecretDto, @Ip() ip: string, @Res() res: Response): Promise<void> {
        await this.commandStream.dispatch(res, {type: STORE_COMMAND.MINE_DOOR_SECRET, actor, payload: dto, client_ip: ip});
    }
```

```ts
// apps/gateway/src/api/v1/user-service/reservation/controllers/reservation.controller.ts — modified (상세 뒤에 추가)
import {ReservationQrParamDto, ReservationQrResultDto} from '@app/contracts/reservation/dto/reservation-qr.dto.js';

    /**
     * 내 예약 QR — 확정 · 이용 중 예약의 이용 시간에만. 아직 발급 전이면 그 자리에서 발급한다. 이용 끝이 지나거나 업체가 취소하면 그 QR 로는 열리지 않는다
     */
    @Get('/:reservation_id/qr')
    @UseGuards(PassportJwtAuthGuard)
    @HttpCode(200)
    @ApiBearerAuth()
    @ApiOperation({summary: '내 예약 QR'})
    @ApiOkResponse({type: ReservationQrResultDto})
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async getMyReservationQr(@PassportActor() actor: Actor, @Param() param: ReservationQrParamDto): Promise<ReservationQrResultDto> {
        return this.internalHttp.request<ReservationQrResultDto>('user', 'GET', RESERVATION_INTERNAL_PATH.qr(param.reservation_id), {actor});
    }
```


`apps/gateway/src/api/v1/user-service/door/`(controllers/door.controller.ts · door.module.ts)는 지운다 — HTTP 문 열기 · 닫기가 소켓으로 바뀌었다(§1.7). gateway 루트 모듈에서 `DoorModule` import 도 뺀다.

### gateway — 문 소켓 (`modules/door-socket`)

인프라 모듈(`src/modules/<module>/` — 형제: `modules/transport`)이라 Logger 를 쓰고 private 메서드를 둔다. `ws` 를 HTTP 서버의 `upgrade` 에 직접 붙인다(`noServer: true` — 포트를 따로 열지 않는다). 접속 확인 · QR 확인 · 잠금은 `InternalHttpClient`(admin-service 내부 HTTP — 내부 토큰), 바로 열기 명령은 `DOOR_STORE.subscribe`(Redis 채널 `door-commands`). 연결 목록은 인스턴스 메모리다 — 연결 자체가 이 인스턴스에 붙어 있으므로(상태 원본은 Redis · DB, 각 인스턴스가 따로 구독해 sticky 가 필요 없다).

```ts
// apps/gateway/src/modules/door-socket/door-socket.util.ts — new
import type {IncomingHttpHeaders} from 'node:http';
import {STATUS_CODES} from 'node:http';
import {HttpException} from '@nestjs/common';
import {DOOR_SOCKET_EVENT, DOOR_SOCKET_HEADER, DOOR_SOCKET_PATH} from '@app/contracts/door/door.commands.js';
import type {RoomDoorSnapshotResultDto} from '@app/contracts/room/dto/room-door-snapshot.dto.js';
import type {RoomDoorVerifyResultDto} from '@app/contracts/room/dto/room-door-verify.dto.js';
import type {DoorCommand} from '@app/integration/interfaces/integration.interface.js';

/** 서버가 ping 을 보내는 간격 — 다음 ping 때까지 pong 이 없으면 끊는다 */
export const DOOR_SOCKET_HEARTBEAT_MS = 30_000;

/** 접속 헤더가 없거나 모양이 틀렸을 때 — admin-service 의 확인 실패와 같은 문구(401) */
export const DOOR_SOCKET_AUTH_FAILED_MESSAGE = '업체 ID 또는 시크릿 코드가 올바르지 않습니다.';

/** 문 소켓이 아닌 경로의 업그레이드 */
export const DOOR_SOCKET_PATH_NOT_FOUND_MESSAGE = '없는 소켓 경로입니다.';

/** 받은 메시지를 읽지 못했을 때 */
export const DOOR_SOCKET_UNKNOWN_MESSAGE = '알 수 없는 메시지입니다.';

/** 예상하지 못한 실패 — 통일 500 문구 */
const DOOR_SOCKET_SERVER_ERROR_MESSAGE = '서버에서 오류가 발생했습니다. 관리자에게 문의해주세요.';

/** 32자 hex — 업체 ID · 호실 ID · QR */
const ID_PATTERN = /^[a-f0-9]{32}$/;

/** 시크릿 코드 — 영문 · 숫자 16 ~ 64자 */
const SECRET_PATTERN = /^[A-Za-z0-9]{16,64}$/;

/** 소켓 접속 자격 — 업그레이드 요청 헤더 (admin-service RoomDoorSnapshotDto 와 같은 모양) */
export interface DoorSocketCredential {
    store_id: string;
    door_secret: string;
}

/** 문 프로그램이 보낸 메시지 — QR 확인 · 잠금 알림 */
export type DoorSocketRequest = {event: 'door.verify'; room_id: string; qr: string} | {event: 'door.closed'; room_id: string};

/** 소켓 실패 — 상태 코드 · 메시지 */
export interface DoorSocketFailure {
    status_code: number;
    message: string;
}

/**
 * 문 소켓 경로인지 — 쿼리 문자열은 보지 않는다.
 *
 * @param url 업그레이드 요청 주소
 * @returns 문 소켓 경로면 true
 */
export function isDoorSocketPath(url: string | undefined): boolean {
    return (url ?? '').split('?')[0] === DOOR_SOCKET_PATH;
}

/**
 * 업그레이드 요청 헤더에서 업체 ID · 시크릿을 읽는다 — 없거나 모양이 틀리면 null(admin-service 에 묻지 않고 401).
 *
 * @param headers 요청 헤더
 * @returns 자격 또는 null
 */
export function readDoorSocketCredential(headers: IncomingHttpHeaders): DoorSocketCredential | null {
    const store_id = headers[DOOR_SOCKET_HEADER.STORE_ID];
    const door_secret = headers[DOOR_SOCKET_HEADER.STORE_SECRET];
    if (typeof store_id !== 'string' || !ID_PATTERN.test(store_id) || typeof door_secret !== 'string' || !SECRET_PATTERN.test(door_secret)) {
        return null;
    }
    return {store_id, door_secret};
}

/**
 * 받은 메시지(JSON)를 읽는다 — `door.verify {room_id, qr}` · `door.closed {room_id}`(32자 hex)만, 아니면 null.
 *
 * @param raw 받은 메시지 문자열
 * @returns 요청 또는 null
 */
export function readDoorSocketRequest(raw: string): DoorSocketRequest | null {
    try {
        const message = JSON.parse(raw) as {event?: unknown; data?: {room_id?: unknown; qr?: unknown}};
        const room_id = message.data?.room_id;
        if (typeof room_id !== 'string' || !ID_PATTERN.test(room_id)) {
            return null;
        }
        if (message.event === DOOR_SOCKET_EVENT.VERIFY) {
            const qr = message.data?.qr;
            return typeof qr === 'string' && ID_PATTERN.test(qr) ? {event: DOOR_SOCKET_EVENT.VERIFY, room_id, qr} : null;
        }
        return message.event === DOOR_SOCKET_EVENT.CLOSED ? {event: DOOR_SOCKET_EVENT.CLOSED, room_id} : null;
    } catch {
        return null;
    }
}

/**
 * 접속 직후 메시지 — 업체 호실 전체의 문 상태
 *
 * @param snapshot admin-service 접속 확인 결과
 * @returns JSON 문자열
 */
export function buildSnapshotMessage(snapshot: RoomDoorSnapshotResultDto): string {
    return JSON.stringify({event: DOOR_SOCKET_EVENT.SNAPSHOT, data: snapshot});
}

/**
 * QR 확인 결과 메시지 — 물어본 연결에만
 *
 * @param result admin-service QR 확인 결과
 * @returns JSON 문자열
 */
export function buildVerifiedMessage(result: RoomDoorVerifyResultDto): string {
    return JSON.stringify({event: DOOR_SOCKET_EVENT.VERIFIED, data: {room_id: result.room_id, ok: result.ok}});
}

/**
 * 바로 열기 명령 메시지 — 그 업체 연결에만 가므로 업체 ID 는 뺀다
 *
 * @param command Redis 문 명령
 * @returns JSON 문자열
 */
export function buildOpenMessage(command: DoorCommand): string {
    return JSON.stringify({event: DOOR_SOCKET_EVENT.OPEN, data: {room_id: command.room_id}});
}

/**
 * 실패 메시지 — 연결은 유지한다
 *
 * @param failure 상태 코드 · 메시지
 * @returns JSON 문자열
 */
export function buildErrorMessage(failure: DoorSocketFailure): string {
    return JSON.stringify({event: DOOR_SOCKET_EVENT.ERROR, data: failure});
}

/**
 * 업그레이드 거절 응답(HTTP/1.1) — 본문은 공통 실패 모양
 *
 * @param failure 상태 코드 · 메시지
 * @returns 응답 원문
 */
export function buildRejectResponse(failure: DoorSocketFailure): string {
    const body = JSON.stringify({message: failure.message, validation_errors: null});
    const status = `${failure.status_code} ${STATUS_CODES[failure.status_code] ?? ''}`.trim();
    return `HTTP/1.1 ${status}\r\nConnection: close\r\nContent-Type: application/json; charset=utf-8\r\nContent-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`;
}

/**
 * 실패를 상태 코드 · 메시지로 — 서비스가 준 실패(InternalHttpClient 가 되던진 HttpException · 503)는 그대로, 그 밖은 통일 500.
 *
 * @param error 잡은 오류
 * @returns 상태 코드 · 메시지
 */
export function toDoorSocketFailure(error: unknown): DoorSocketFailure {
    if (error instanceof HttpException) {
        const body = error.getResponse();
        const message = typeof body === 'object' && body !== null && typeof (body as {message?: unknown}).message === 'string' ? (body as {message: string}).message : error.message;
        return {status_code: error.getStatus(), message};
    }
    return {status_code: 500, message: DOOR_SOCKET_SERVER_ERROR_MESSAGE};
}
```

```ts
// apps/gateway/src/modules/door-socket/door-socket.server.ts — new
import type {IncomingMessage, Server} from 'node:http';
import type {Duplex} from 'node:stream';
import {Inject, Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy} from '@nestjs/common';
import {HttpAdapterHost} from '@nestjs/core';
import {WebSocket, WebSocketServer} from 'ws';
import type {RawData} from 'ws';
import {DOOR_SOCKET_EVENT} from '@app/contracts/door/door.commands.js';
import type {RoomDoorCloseResultDto} from '@app/contracts/room/dto/room-door-close.dto.js';
import type {RoomDoorSnapshotResultDto} from '@app/contracts/room/dto/room-door-snapshot.dto.js';
import type {RoomDoorVerifyResultDto} from '@app/contracts/room/dto/room-door-verify.dto.js';
import {ROOM_INTERNAL_PATH} from '@app/contracts/room/room.commands.js';
import {DOOR_STORE} from '@app/integration/integration.symbols.js';
import type {DoorCommand, DoorStoreInterface} from '@app/integration/interfaces/integration.interface.js';
import {InternalHttpClient} from '../transport/internal-http.client.js';
import {
    buildErrorMessage,
    buildOpenMessage,
    buildRejectResponse,
    buildSnapshotMessage,
    buildVerifiedMessage,
    DOOR_SOCKET_AUTH_FAILED_MESSAGE,
    DOOR_SOCKET_HEARTBEAT_MS,
    DOOR_SOCKET_PATH_NOT_FOUND_MESSAGE,
    DOOR_SOCKET_UNKNOWN_MESSAGE,
    isDoorSocketPath,
    readDoorSocketCredential,
    readDoorSocketRequest,
    toDoorSocketFailure,
} from './door-socket.util.js';
import type {DoorSocketFailure} from './door-socket.util.js';

/**
 * 문 소켓 — 문 쪽 타 업체 프로그램이 업체 단위로 붙는 표준 WebSocket(`/ws/v1/door`).
 * - HTTP 서버의 업그레이드를 직접 받아 헤더(x-store-id · x-store-secret)를 admin-service 에 확인한 뒤에만 연결한다(틀리면 업그레이드 전 HTTP 401).
 * - 연결 직후 그 업체 호실 전체의 문 상태(door.snapshot).
 * - 문 프로그램의 QR 확인(door.verify)은 admin-service 가 Redis 현재 QR 과 비교해 답하고(door.verified — 그 연결에만), 잠금 알림(door.closed)은 기록만 한다(성공은 답하지 않는다). 실패는 error 메시지(연결 유지).
 * - 관리자 바로 열기는 Redis 채널 door-commands 를 구독해 그 업체 연결 모두에 door.open 으로 보낸다.
 * - 30초마다 ping, 다음 ping 까지 pong 이 없으면 끊는다. 재연결은 문 프로그램이 한다.
 * - 연결 목록은 인스턴스 메모리다(연결 자체가 이 인스턴스에 붙어 있다) — 상태 원본은 Redis · DB, 인스턴스마다 따로 구독한다(sticky 불필요).
 */
@Injectable()
export class DoorSocketServer implements OnApplicationBootstrap, OnModuleDestroy {
    private readonly logger = new Logger(DoorSocketServer.name);
    /** 업그레이드를 넘겨받는 서버 — 포트를 따로 열지 않는다 */
    private readonly server = new WebSocketServer({noServer: true});
    /** 업체 ID → 이 인스턴스에 붙은 연결 */
    private readonly connections = new Map<string, Set<WebSocket>>();
    /** 연결 → 마지막 ping 뒤에 pong 을 받았는지 */
    private readonly alive = new WeakMap<WebSocket, boolean>();
    /** 하트비트 타이머 */
    private heartbeat: NodeJS.Timeout | null = null;

    /**
     * @param httpAdapterHost 게이트웨이 HTTP 서버(업그레이드를 받는다)
     * @param internalHttp admin-service 내부 HTTP (접속 확인 · QR 확인 · 잠금)
     * @param doorStore 문 정보 포트 (바로 열기 명령 구독)
     */
    constructor(
        private readonly httpAdapterHost: HttpAdapterHost,
        private readonly internalHttp: InternalHttpClient,
        @Inject(DOOR_STORE) private readonly doorStore: DoorStoreInterface,
    ) {}

    /**
     * 업그레이드를 받고 · 바로 열기 명령을 구독하고 · 하트비트를 시작한다.
     */
    onApplicationBootstrap(): void {
        const httpServer = this.httpAdapterHost.httpAdapter.getHttpServer() as Server;
        httpServer.on('upgrade', (request: IncomingMessage, socket: Duplex, head: Buffer) => void this.handleUpgrade(request, socket, head));
        this.doorStore.subscribe((command) => this.sendOpenCommand(command));
        this.heartbeat = setInterval(() => this.checkAlive(), DOOR_SOCKET_HEARTBEAT_MS);
    }

    /**
     * 종료 — 하트비트를 멈추고 연결을 닫는다(1001 — 문 프로그램은 다른 인스턴스로 다시 붙는다).
     */
    async onModuleDestroy(): Promise<void> {
        if (this.heartbeat) {
            clearInterval(this.heartbeat);
        }
        for (const client of this.server.clients) {
            client.close(1001, 'server shutdown');
        }
        await new Promise<void>((resolve) => this.server.close(() => resolve()));
    }

    /**
     * 업그레이드 요청 — 경로 · 헤더 모양을 보고, admin-service 에 업체 ID · 시크릿을 확인한 뒤에만 연결한다.
     *
     * @param request 업그레이드 요청
     * @param socket TCP 소켓
     * @param head 업그레이드 뒤 첫 바이트
     */
    private async handleUpgrade(request: IncomingMessage, socket: Duplex, head: Buffer): Promise<void> {
        socket.on('error', () => socket.destroy());
        if (!isDoorSocketPath(request.url)) {
            this.reject(socket, {status_code: 404, message: DOOR_SOCKET_PATH_NOT_FOUND_MESSAGE});
            return;
        }
        const credential = readDoorSocketCredential(request.headers);
        if (!credential) {
            this.reject(socket, {status_code: 401, message: DOOR_SOCKET_AUTH_FAILED_MESSAGE});
            return;
        }
        let snapshot: RoomDoorSnapshotResultDto;
        try {
            snapshot = await this.internalHttp.request<RoomDoorSnapshotResultDto>('admin', 'POST', ROOM_INTERNAL_PATH.DOOR_SNAPSHOT, {body: credential});
        } catch (error) {
            this.reject(socket, toDoorSocketFailure(error));
            return;
        }
        if (socket.destroyed) {
            return;
        }
        this.server.handleUpgrade(request, socket, head, (client) => this.accept(client, snapshot));
    }

    /**
     * 연결 등록 — 업체 묶음에 넣고 처음 상태를 보낸다.
     *
     * @param client 연결
     * @param snapshot 업체 호실 전체의 문 상태
     */
    private accept(client: WebSocket, snapshot: RoomDoorSnapshotResultDto): void {
        const store_id = snapshot.store_id;
        const group = this.connections.get(store_id) ?? new Set<WebSocket>();
        group.add(client);
        this.connections.set(store_id, group);
        this.alive.set(client, true);
        client.on('pong', () => this.alive.set(client, true));
        client.on('message', (data: RawData) => void this.handleMessage(client, store_id, data));
        client.on('close', () => this.remove(client, store_id));
        client.on('error', (error: Error) => this.logger.warn(`문 소켓 오류(${store_id}): ${error.message}`));
        this.send(client, buildSnapshotMessage(snapshot));
    }

    /**
     * 문 프로그램 메시지 — QR 확인은 결과를 그 연결에 답하고, 잠금 알림은 기록만 한다(성공은 답하지 않는다). 실패는 error 메시지.
     *
     * @param client 보낸 연결
     * @param store_id 그 연결의 업체 ID
     * @param data 받은 메시지
     */
    private async handleMessage(client: WebSocket, store_id: string, data: RawData): Promise<void> {
        const request = readDoorSocketRequest(data.toString());
        if (!request) {
            this.send(client, buildErrorMessage({status_code: 400, message: DOOR_SOCKET_UNKNOWN_MESSAGE}));
            return;
        }
        try {
            if (request.event === DOOR_SOCKET_EVENT.VERIFY) {
                const result = await this.internalHttp.request<RoomDoorVerifyResultDto>('admin', 'POST', ROOM_INTERNAL_PATH.DOOR_VERIFY, {body: {store_id, room_id: request.room_id, qr: request.qr}});
                this.send(client, buildVerifiedMessage(result));
            } else {
                await this.internalHttp.request<RoomDoorCloseResultDto>('admin', 'POST', ROOM_INTERNAL_PATH.DOOR_CLOSE, {body: {store_id, room_id: request.room_id}});
            }
        } catch (error) {
            this.send(client, buildErrorMessage(toDoorSocketFailure(error)));
        }
    }

    /**
     * 바로 열기 명령 — 그 업체의 이 인스턴스 연결 모두에(호실이 맞는 문만 연다).
     *
     * @param command Redis 문 명령
     */
    private sendOpenCommand(command: DoorCommand): void {
        const group = this.connections.get(command.store_id);
        if (!group) {
            return;
        }
        const message = buildOpenMessage(command);
        for (const client of group) {
            this.send(client, message);
        }
    }

    /**
     * 하트비트 — 지난 ping 뒤 pong 이 없던 연결은 끊고, 나머지에 ping.
     */
    private checkAlive(): void {
        for (const group of this.connections.values()) {
            for (const client of group) {
                if (this.alive.get(client) === false) {
                    client.terminate();
                    continue;
                }
                this.alive.set(client, false);
                client.ping();
            }
        }
    }

    /**
     * 연결 제거 — 업체 묶음이 비면 묶음도 지운다.
     *
     * @param client 닫힌 연결
     * @param store_id 그 연결의 업체 ID
     */
    private remove(client: WebSocket, store_id: string): void {
        const group = this.connections.get(store_id);
        group?.delete(client);
        if (group?.size === 0) {
            this.connections.delete(store_id);
        }
    }

    /**
     * 열린 연결에만 보낸다.
     *
     * @param client 연결
     * @param message JSON 문자열
     */
    private send(client: WebSocket, message: string): void {
        if (client.readyState === WebSocket.OPEN) {
            client.send(message);
        }
    }

    /**
     * 업그레이드 거절 — HTTP 응답을 쓰고 연결을 끊는다.
     *
     * @param socket TCP 소켓
     * @param failure 상태 코드 · 메시지
     */
    private reject(socket: Duplex, failure: DoorSocketFailure): void {
        if (!socket.destroyed) {
            socket.write(buildRejectResponse(failure));
        }
        socket.destroy();
    }
}
```

```ts
// apps/gateway/src/modules/door-socket/door-socket.module.ts — new
import {Module} from '@nestjs/common';
import {DoorSocketServer} from './door-socket.server.js';

/**
 * 문 소켓(`/ws/v1/door`) — 업체 단위 표준 WebSocket. 전달 수단(TransportModule — InternalHttpClient)과 문 정보 포트(DoorStoreModule — 명령 구독)는 전역이다.
 */
@Module({providers: [DoorSocketServer]})
export class DoorSocketModule {}
```

```ts
// apps/gateway/src/gateway.module.ts — modified
import {DoorStoreModule} from '@app/integration/door/door-store.module.js';
import {DoorSocketModule} from './modules/door-socket/door-socket.module.js';
// 삭제: import {DoorModule} from './api/v1/user-service/door/door.module.js';

/**
 * 게이트웨이 루트 모듈 — 유일한 외부 진입점.
 * DB 를 쓰지 않는다. 회원 상태 확인도 user-service 내부 HTTP 로 묻는다. Redis 는 문 명령 구독에만 쓴다.
 * - …(기존 목록 — 문 라우트 줄은 지운다)
 * - DoorStoreModule: 문 정보 포트(DOOR_STORE, Redis) — 문 소켓이 바로 열기 명령(door-commands)을 구독한다
 * - DoorSocketModule: 문 소켓(`/ws/v1/door` — 업체 ID + 시크릿, 표준 WebSocket) — QR 확인 · 잠금 알림 · 바로 열기 명령
 */
@Module({
    imports: [
        MessagingModule.forGateway(),
        TransportModule,
        DoorStoreModule,
        PassportJwtAuthModule,
        UserModule,
        ManagerModule,
        AdminModule,
        StoreModule,
        RoomModule,
        ReservationModule,
        DoorSocketModule,
    ],
})
export class GatewayModule {}
```

### 인프라 — nginx · compose · 의존성

```nginx
# docker/nginx/gateway.conf — modified (location / 앞에 추가)
    # 문 소켓(WebSocket) — 업그레이드 헤더를 넘기고, 서버 ping(30초)보다 길게 기다린다
    location /ws/ {
        proxy_pass http://gateway;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;
        proxy_send_timeout 120s;
    }
```

```yaml
# compose.gateway.yml — modified
        environment:
            # ── 환경 값: .env 그대로 (비어 있으면 띄우지 않는다) ──
            # … (기존)
            # 문 소켓 — Redis 채널 door-commands 구독
            REDIS_URL: '${REDIS_URL:?.env 에 REDIS_URL 이 필요합니다}'
            # ── 쓰지 않는 비밀값은 전달하지 않는다 (게이트웨이는 DB · 비밀번호 해시 · 토큰 암호화 · AWS · 토스를 쓰지 않는다 — Redis 는 구독만) ──
            # (REDIS_URL: '' 줄을 지운다 — REDIS_PASSWORD: '' 는 그대로)
        networks: [edge, service, broker, data]

networks:
    # … (기존)
    data:
        name: roomless-data
        external: true
```

```yaml
# compose.admin-service.yml — modified (REDIS_URL: '' → 필수 값으로)
            # 문 정보(Redis) — 호실 목록 문 상태 · 바로 열기 · 문 소켓 접속 · QR 확인 · 잠금
            REDIS_URL: '${REDIS_URL:?.env 에 REDIS_URL 이 필요합니다}'
```

```yaml
# compose.scheduler.yml — modified (환경 값 블록에 추가, 쓰지 않는 비밀값 블록의 REDIS_URL: '' 는 지운다 — REDIS_PASSWORD: '' 는 그대로)
            # 문 정보(Redis) — 이용 중 예약의 QR 을 현재 QR 로 맞춘다
            REDIS_URL: '${REDIS_URL:?.env 에 REDIS_URL 이 필요합니다}'
```

```json
// package.json — modified (build 첫 단계 npm install 로)
"dependencies": { "ws": "^8.22.1" },
"devDependencies": { "@types/ws": "^8.18.1" }
```

`.env.example` 은 바뀌지 않는다(REDIS_URL 은 Phase 14 에 있다 — gateway · admin-service · scheduler 도 같은 값을 쓴다). 검증: `docker compose -f compose.gateway.yml config --quiet` · `compose.admin-service.yml` · `compose.scheduler.yml`(더미 env — `.env` 는 보지 않는다).

### 문서 — README · AGENTS · docs

- **README.md** — API 표: `POST /api/v1/admin-service/room/:room_id/door-open` · `GET /api/v1/user-service/reservation/:reservation_id/qr` · `PATCH /api/v1/admin-service/store/mine/door-secret` 추가, `POST /api/v1/user-service/door/open` · `/close` 삭제(문 쪽 프로그램 규격 변경), 새 절 "문 소켓"(주소 `ws(s)://<게이트웨이>/ws/v1/door` · 헤더 · 메시지 6종 · 하트비트 · 재연결), Redis 를 쓰는 앱(user-service · admin-service · scheduler · gateway), scheduler crontab 목록에 QR 맞추기.
- **AGENTS.md** — 구조 트리(gateway `modules/door-socket/` · `api/v1/user-service/` 에서 door 제거 · user-service 에서 door 도메인 제거 · admin-service room(문 상태 · 바로 열기 · 소켓 접속 · QR 확인 · 잠금) · scheduler reservation crontab(QR 맞추기)), Auth "인증 없는 공개 라우트" 에서 문 줄 삭제(예약 가능 시간만), 외부 연동의 문 정보 줄(`door:<room_id>` = `상태:시각` · `door-qr:<room_id>` = 현재 QR(PXAT) · 바로 열기는 `door-commands` PUBLISH — 이력은 DB), Docker(.env 의 REDIS_URL 을 gateway · admin-service · scheduler 도), Testing Smoke 목록(예약 QR 발급 · scheduler QR 맞추기 대상 · 업체 호실 문 목록 · 업체 조회 find 조건).
- **docs/architecture.md** — gateway 인프라 모듈에 door-socket, user-service 문 도메인 삭제, Redis 를 쓰는 앱.
- **docs/integration.md** — 문 정보 절(저장 모양 · 현재 QR · 명령 채널 · `getMany` · `verify` · QR 이력은 DB · `toDoorTime` 위치).
- **docs/guides/redis-setup.md** — 저장 모양(`상태:시각`, Phase 14 값 호환 · `door-qr:<room_id>` 와 남은 시간 `PTTL`), `SUBSCRIBE door-commands` 로 바로 열기 명령 보기.
- **docs/data-layer.md** — `t_room_qr`(이력 · 유효 범위 · ON CONFLICT DO NOTHING 발급 — 트랜잭션 안 UK 위반을 피하는 방식, Redis 현재 QR 과의 맞추기).
- **docs/testing.md** — Smoke 적용 목록.
- **docs/realtime.md** · AGENTS "실시간 소켓" 절(초안 — 이미 씀) — build 가 코드에 맞춘다(알림이 상태 변경 브로드캐스트가 아니라 바로 열기 명령 · QR 확인은 요청 · 응답으로 바뀐 것 반영).

---

## Test Cases

service 기능 spec 은 두 경로 부팅(동기 — 실제 controller + service + ValidationPipe + 필터 + InternalAuthGuard · ReturnedExceptionInterceptor / 큐 — 실제 큐 컨트롤러 + CommandDispatcher), repository · 외부 포트(DOOR_STORE · bcrypt util)만 mock. 시간은 `vi.useFakeTimers({toFake: ['Date']})` + `vi.setSystemTime`. 메시지는 한국어 리터럴. user-service 문 spec(door-open · door-close · door.repository · door.test-helper)은 문 도메인과 함께 지운다.

```
[CASES:judgeReservationQr]  apps/user-service/src/reservation/test/reservation-qr.spec.ts — 동기 GET /internal/v1/user-service/reservation/:reservation_id/qr 로 판정(사용자 확정 2026-11-04)
  이용 10:00 ~ 13:00(한국 시각) 예약, QR 행 = 유효 10:00 ~ 13:00
  1. 확정 · 11:00 · QR 행 있음            → 200 그 QR (insertRoomQr 안 부름 · setQr 1번)
  2. 확정 · 10:00:00 정각                  → 200 그 QR (시작 포함)
  3. 확정 · 12:59:59                       → 200 그 QR
  4. 확정 · 13:00:00 정각                  → 400 'QR 은 이용 시간에만 볼 수 있습니다.' (끝 제외)
  5. 확정 · 09:59                          → 400 'QR 은 이용 시간에만 볼 수 있습니다.'
  6. 확정 · 10:00:30 · QR 행 없음(발급 전)  → 발급 후 200 (insertRoomQr 1번 → findRoomQr 다시 읽은 행 · setQr 1번)
  7. 이용 중(CHECKED_IN) · 11:00 · QR 행   → 200 그 QR
  8. 결제 대기(PENDING) · 11:00            → 400 'QR 을 볼 수 없는 예약입니다.'
  9. 취소(CANCELED) · 11:00 · QR 끝 10:30  → 400 'QR 을 볼 수 없는 예약입니다.'
  10. 1박 22:00 ~ 다음 날 09:00 · 다음 날 03:00 · QR 행 → 200 그 QR (날짜 넘김)

[SUCCESS] reservation-qr.spec
  - 그 QR: findReservation({reservation_id, user_id}) · findRoomQr({reservation_id}) 각 1번, setQr(room_id, qr, ends_at) 1번, 본문 {reservation_id, room_id, qr, qr_starts_at, qr_ends_at}(ISO), insertRoomQr 안 부름
  - 발급: insertRoomQr 1번 — 인자 toBeInstanceOf(RoomQrEntity), room_qr_id · qr 32자 hex(서로 다름), room_id · reservation_id = 예약, starts_at = start_at, ends_at = end_at
  - 발급 경합: 다시 읽은 행이 scheduler 가 먼저 넣은 다른 QR 이면 그 값을 돌려주고 setQr 도 그 값으로(findRoomQr 2번 — 두 번째 결과)
[FAIL:service] reservation-qr.spec
  - 내 예약이 아님(findReservation null) → 404 '예약을 찾을 수 없습니다.', findRoomQr · insertRoomQr · setQr 안 부름
  - 400 두 갈래(상태 · 이용 시간 밖) → insertRoomQr · setQr 안 부름
  - 발급 뒤 다시 읽어도 없음 → 500 'QR 정보를 발급하지 못했습니다. 관리자에게 문의해주세요.', setQr 안 부름
  - setQr 가 503 → 503 '상태 저장소에 연결할 수 없습니다. 잠시 후 다시 시도해주세요.'
[FAIL:validation] reservation-qr.spec — reservation_id 가 32자 hex 아님 → 400 validation_errors.reservation_id, findReservation 안 부름

[SUCCESS] reservation-store-cancel.spec (기존에 추가 — 부팅 도우미에 DOOR_STORE mock)
  - 이용 중(지금 < QR 유효 종료) 확정 예약 업체 취소 → findRoomQr({reservation_id}) · updateRoomQr({room_qr_id}, RoomQrEntity{ends_at: now}) · revokeQr(room_id, qr) 각 1번, 모두 SMS 보다 먼저(invocationCallOrder)
  - 시작 전(QR 행 없음) → updateRoomQr · revokeQr 안 부름
  - QR 유효 종료가 이미 지남 → updateRoomQr · revokeQr 안 부름
[FAIL:service] reservation-store-cancel.spec — revokeQr 가 503 → failed 503(재시도 대상 — requeue), SMS 안 보냄

[SUCCESS] room-list.spec (기존에 추가)
  - 목록 항목에 door_state · door_changed_at — getMany 가 돌려준 순서대로(두 호실 · 서로 다른 상태)
  - doorStore.getMany 는 그 페이지 room_id 목록(findRoomRows 순서)으로 1번, 빈 페이지면 [] 로
[FAIL:service] room-list.spec — getMany 가 503 → 503 '상태 저장소에 연결할 수 없습니다. 잠시 후 다시 시도해주세요.'

[SUCCESS] room-door-open.spec (admin-service, 동기 POST /internal/v1/admin-service/room/:room_id/door-open)
  - findManagerStore(user_id, false) · findRoom({room_id, store_id}) 1번씩, doorStore.open(room_id, store_id, changed_at — 한국 시각 yyyyMMddHHmmss), 본문 {room_id, door_state: 'open', door_changed_at}
[FAIL:service] room-door-open.spec — 소속 업체 없음 → 404 '소속 업체를 찾을 수 없습니다.'(findRoom 안 부름) / 호실 없음(다른 업체 포함) → 404 '호실을 찾을 수 없습니다.'(open 안 부름)
[FAIL:validation] room-door-open.spec — room_id 형식 → 400 validation_errors.room_id

[SUCCESS] room-door-snapshot.spec (동기 POST /internal/v1/admin-service/room/door-snapshot — actor 없음, bcrypt util vi.mock)
  - findDoorStore({store_id, store_state_id: Not('LEAVE')}) · matchBcrypt(door_secret, 저장 해시) · findStoreDoorRoomRows(store_id) · getMany(room_ids) 각 1번
  - 본문 {store_id, list: [{room_id, room_name, floor(숫자), door_state, door_changed_at}]} — 층 · 호실명 순 그대로
[FAIL:service] room-door-snapshot.spec — 모두 401 '업체 ID 또는 시크릿 코드가 올바르지 않습니다.', findStoreDoorRoomRows · getMany 안 부름
  - 업체 없음(null) — matchBcrypt 안 부름
  - 시크릿 미설정(door_secret null) — matchBcrypt 안 부름
  - 시크릿 불일치(matchBcrypt false)
[FAIL:validation] room-door-snapshot.spec — store_id 형식 / door_secret 15자 · 특수문자 → 400 validation_errors, findDoorStore 안 부름

[SUCCESS] room-door-verify.spec (동기 POST /internal/v1/admin-service/room/door-verify — actor 없음)
  - findRoom({room_id, store_id}) → doorStore.verify(room_id, qr, changed_at) 1번 — true 면 본문 {room_id, ok: true}, false 면 {room_id, ok: false}(둘 다 200)
[FAIL:service] room-door-verify.spec — 그 업체 호실 아님 → 404 '호실을 찾을 수 없습니다.', verify 안 부름 / verify 503 → 503
[FAIL:validation] room-door-verify.spec — store_id · room_id · qr 형식 → 400 validation_errors, findRoom 안 부름

[SUCCESS] room-door-close.spec (동기 POST /internal/v1/admin-service/room/door-close — actor 없음)
  - findRoom({room_id, store_id}) → doorStore.close(room_id, changed_at), 본문 {room_id, door_state: 'close', door_changed_at}
[CASES:toDoorTime] room-door-open.spec · room-door-close.spec — 기존 user-service 문 spec 의 표(지금 UTC → 한국 yyyyMMddHHmmss — 자정 · 날짜 넘김 · 밀리초 버림)를 옮겨 open · close 의 시각 인자로 확인
[FAIL:service] room-door-close.spec — 그 업체 호실 아님 → 404 '호실을 찾을 수 없습니다.', close 안 부름
[FAIL:validation] room-door-close.spec — store_id · room_id 형식 → 400

[SUCCESS] store-mine-door-secret.spec (admin-service, 큐 admin.store.mine-door-secret, bcrypt util vi.mock — getBcrypt → 'hashed-secret')
  - findStoreByManager(user_id, true) 1번, getBcrypt(원문) 1번, updateStore({store_id}, StoreEntity) — toBeInstanceOf(StoreEntity), door_secret = 'hashed-secret' 외 필드 없음, done data null · ack
[FAIL:service] store-mine-door-secret.spec — 소속 업체 없음 → failed 404 '소속 업체를 찾을 수 없습니다.', getBcrypt · updateStore 안 부름
[FAIL:validation] store-mine-door-secret.spec (validateBody — 게이트웨이 검증과 같은 DTO)
  - 15자 · 65자 · 특수문자 포함 → '시크릿 코드는 영문 · 숫자 16 ~ 64자로 입력해주세요.'
  - 빈 값 → '시크릿 코드를 입력해주세요.'

[SUCCESS] store-mine.spec (기존에 추가) — is_door_secret_set: door_secret null → 0, 해시 있음 → 1 (원문 · 해시는 응답에 없다)

[SMOKE:data-access]
  - user-service reservation.repository.spec: buildInsertRoomQrQuery(엔티티 — insertTimestamp() 를 부른 값) — INSERT INTO "t_room_qr" … ON CONFLICT DO NOTHING, 전체 SQL 고정 / findRoomQr 은 받은 조건 + loadRelationIds / updateRoomQr 은 받은 조건 · 엔티티 그대로 / 실패 → 통일 500
  - scheduler reservation.repository.spec: buildQrSyncTargetsQuery(now) — LEFT JOIN "t_room_qr" "q" ON reservation_id, 상태 IN (CONFIRMED, CHECKED_IN) · start_at <= · end_at >, 시작 순, 별칭 = QrSyncTargetRow 키, 전체 SQL 고정 / buildInsertRoomQrQuery — ON CONFLICT DO NOTHING / findRoomQr 조건 그대로 / 실패 → 통일 500
  - admin room.repository.spec: buildStoreDoorRoomRowsQuery(store_id) — t_room_group 조인 · 둘 다 is_deleted = 0 · 층 · 호실명 순, 별칭 = RoomDoorRow 키, 전체 SQL 고정 / findDoorStore 의 find 조건(service 가 넘기는 {store_id, store_state_id: Not('LEAVE')} + notDeleted)을 buildFindQuery 로 빌드 — "store_state_id" != $2 · "is_deleted" = $3
  - 스냅숏 갱신: t_store 에 door_secret 이 더해져 전체 컬럼을 고르는 업체 쿼리 스냅숏(admin room.repository.spec MANAGER_STORE_SQL · store.repository.spec 업체 select)이 바뀐다 — 실행 출력으로 다시 고정

테스트 생략(위임형):
  - gateway 공개 controller 3곳(바로 열기 · 내 예약 QR · 업체 문 시크릿) — 게이트웨이 controller spec 은 두지 않는다(AGENTS Testing)
  - gateway DoorSocketServer · door-socket.util — 게이트웨이 인프라 spec 은 두지 않는다(AGENTS Testing). 대신 build 가 typecheck · 코드 읽기로 확인하고, 사용자 확인 순서를 report 에 남긴다(헤더 틀림 401 · snapshot · door.verify 맞음 · 틀림 · door.closed · 바로 열기 → door.open · 잘못된 메시지 error · ping)
  - RedisDoorStore · RedisConnection(libs) · scheduler ReservationQrSyncCrontab — 라이브러리 · crontab spec 은 두지 않는다(AGENTS Testing)
  - 큐 컨트롤러 핸들러 · 모듈 등록 — 위임만
```

---

## Response Codes

| Code | Cause |
|------|------|
| 200 | 성공 — 바로 열기 `{room_id, door_state: 'open', door_changed_at}` · 내 예약 QR `{reservation_id, room_id, qr, qr_starts_at, qr_ends_at}` · 호실 목록(문 상태 포함) · 내부 소켓 접속 `{store_id, list}` · 내부 QR 확인 `{room_id, ok}`(맞지 않아도 200 · ok false) · 내부 잠금 `{room_id, door_state: 'close', door_changed_at}` |
| SSE done | 업체 문 시크릿 설정 — data null |
| 101 | 소켓 업그레이드 성공 → 첫 메시지 `door.snapshot` |
| 400 | 입력 형식(validation_errors) — 예약 ID · 호실 ID · 업체 ID · QR · 시크릿 코드 / 'QR 을 볼 수 없는 예약입니다.'(상태 · 업체가 끝낸 QR) / 'QR 은 이용 시간에만 볼 수 있습니다.' / 소켓 `error` 400 '알 수 없는 메시지입니다.' |
| 401 | 로그인 토큰 없음 · 만료(이용자 · 매니저 가드) / 소켓 업그레이드 '업체 ID 또는 시크릿 코드가 올바르지 않습니다.'(헤더 없음 · 형식 · 업체 없음 · 탈퇴 · 시크릿 미설정 · 불일치 — 이유를 가르지 않는다) |
| 403 | 업체 문 시크릿 설정을 업체 관리자(총관리자 아님)가 — '접근 권한이 없습니다.' |
| 404 | '예약을 찾을 수 없습니다.'(내 예약 QR) / '소속 업체를 찾을 수 없습니다.' / '호실을 찾을 수 없습니다.'(바로 열기 · 소켓 QR 확인 · 잠금 — 소켓은 `error` 404) / 소켓 업그레이드 '없는 소켓 경로입니다.' / `POST /api/v1/user-service/door/open` · `/close`(삭제 — 라우트 없음) |
| 500 | 통일 '서버에서 오류가 발생했습니다. 관리자에게 문의해주세요.'(DB) / 'QR 정보를 발급하지 못했습니다. 관리자에게 문의해주세요.'(발급 뒤 다시 읽기 실패) |
| 503 | '상태 저장소에 연결할 수 없습니다. 잠시 후 다시 시도해주세요.'(Redis — 호실 목록 · 바로 열기 · 내 예약 QR · 업체 취소 · 소켓 접속 · QR 확인 · 잠금) / 서비스 연결 실패(게이트웨이 내부 HTTP · 소켓 업그레이드 거절) / 브로커 없음(시크릿 설정 큐) |
