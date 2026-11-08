# Plan — reservation-usage (이용 · Phase 19)

## Feature Summary
- **Feature**: 체크인 · 체크아웃 없이 예약 시간이 곧 이용 권한이다.
  - 시작 시각: 이용 중 + 호실 사용중
  - 끝: 이용 완료 + 호실 정비중
  - 그 밖: QR 링크 SMS(5분 전) · QR 문 열림 로그 · 사용중지 호실 전액 환불 취소 · 이용 중 업체 취소는 이용자 동의(링크 · 로그인 승인 10분)
- **Entry point**:
  - scheduler crontab `reservation-usage` · `reservation-qr-link`
  - admin-service `POST /api/v1/admin-service/reservation/:reservation_id/use-cancel-request`(큐 `admin.reservation.use-cancel-request`)
  - user-service `GET /api/v1/user-service/reservation/:reservation_id/cancel-request`
  - user-service `PATCH …/cancel-request/approve` · `…/reject`(큐 `user.reservation.cancel-request-{approve,reject}`)
  - 기존 변경: 내 예약 QR · 목록 · 상세 · 이용자 취소 · 결제 확인 · 업체 취소 · 업체 현황 · 문 소켓 QR 확인
- **Domain**: reservation(user-service · admin-service · scheduler) · door(user-service) · libs/database. 로드맵 Phase 19 의 #78 · #79 · #83 · #121 · #122 · #123 이고, #82 는 dropped 다.
- **Spec**: [reservation-usage-spec.md](../../spec/reservation/reservation-usage-spec.md)

구현 단위 — 순서대로 한다.
- A. 스키마
- B. 이용 전환 — user-service · scheduler
- C. QR 링크 SMS
- D. 문 열림 로그
- E. 사용중지 환불
- F. 이용 중 취소 동의
- G. 문서

---

## File List

| File | Action |
|------|------|
| `libs/database/src/entities/reservation/reservation.entity.ts` | modified — `checked_in_at` · `completed_at` 삭제, `qr_link_sent_at` 추가, `end_at` 주석 |
| `libs/database/src/entities/door/door-open-log.entity.ts` | new — `t_door_open_log` |
| `libs/database/src/entities/reservation/reservation-cancel-request-state.entity.ts` · `reservation-cancel-request.entity.ts` | new — `t_reservation_cancel_request_state`(룩업) · `t_reservation_cancel_request` |
| `libs/database/src/entities.ts` · `libs/database/src/seeder/seeder.targets.ts` | modified — 엔티티 3개 등록 · 요청 상태 시드 4행 |
| `libs/database/src/migrations/<ts>-ReservationUsage.ts` · `libs/database/src/migrations.ts` | new · modified — `npm run db:generate -- ReservationUsage` |
| `libs/contracts/src/reservation/reservation.constants.ts` | modified — `USAGE_ROOM_STATE` · `RESERVATION_CANCEL_REQUEST_STATE` · `RESERVATION_CANCEL_REQUEST_MINUTES` · 환불 사유 `DISABLED_ROOM` |
| `libs/contracts/src/reservation/reservation.commands.ts` | modified — `RESERVATION_COMMAND.CANCEL_REQUEST_APPROVE · CANCEL_REQUEST_REJECT` · `RESERVATION_INTERNAL_PATH.cancelRequest()` · `RESERVATION_MANAGER_COMMAND.USE_CANCEL_REQUEST` |
| `libs/contracts/src/reservation/dto/reservation-use-cancel-request.dto.ts` · `reservation-cancel-request.dto.ts` · `reservation-cancel-request-approve.dto.ts` · `reservation-cancel-request-reject.dto.ts` | new |
| `libs/contracts/src/reservation/dto/reservation-list.dto.ts` · `reservation-detail.dto.ts` · `reservation-store.dto.ts` · `reservation-payment-confirm.dto.ts` | modified — `is_room_disabled`, `cancel_request_state_id` · `cancel_request_created_at`, 결제 확인 상태 설명 |
| `apps/user-service/src/reservation/reservation.util.ts` · `reservation.constants.ts` | modified — `judgeUsageTransition` · `nextUsageRoomState` · `calculateCancelRefund` · `cancelRequestState` · `judgeReservationQr`(이용 중만) · `toReservationListItem`(`is_room_disabled`) · `toCancelRequest` |
| `apps/user-service/src/reservation/reservation.service.ts` | modified — `confirmPayment`(시작이면 이용 중) · `getMyReservationQr` · `cancelReservation` · 새 `getMyCancelRequest` · `approveCancelRequest` · `rejectCancelRequest` |
| `apps/user-service/src/reservation/interfaces/reservation.repository.interface.ts` · `repositories/reservation.repository.ts` | modified — `ReservationListRow.room_state_id`(select `rm.room_state_id`) · `updateReservationRoom` · `updateRoomQr` · `findLatestCancelRequest` · `updateCancelRequest` |
| `apps/user-service/src/reservation/controllers/reservation.controller.ts` · `reservation.controller.queue.ts` | modified — GET cancel-request · approve · reject |
| `apps/user-service/src/door/door.service.ts` · `interfaces/door.repository.interface.ts` · `repositories/door.repository.ts` | modified — QR 확인: DB 먼저 · 맞으면 열림 로그 |
| `apps/admin-service/src/reservation/reservation.service.ts` · `reservation.util.ts` · `reservation.constants.ts` | modified — 업체 취소는 시작 전만(QR 끝내기 · `DOOR_STORE` 삭제) · 새 `requestUseCancel` · 현황에 요청 상태 |
| `apps/admin-service/src/reservation/interfaces/…` · `repositories/reservation.repository.ts` · `controllers/reservation.controller.queue.ts` | modified — `insertCancelRequest` · `expireCancelRequests` · 현황 쿼리 서브쿼리 · `updateRoomQr` 삭제, 새 `@OnCommand` |
| `apps/scheduler/src/scheduler.module.ts` · `apps/scheduler/src/reservation/reservation.module.ts` | modified — `SmsModule`, 새 crontab 2개 |
| `apps/scheduler/src/reservation/crontabs/reservation-usage.crontab.ts` · `reservation-qr-link.crontab.ts` | new |
| `apps/scheduler/src/reservation/crontabs/reservation-qr-sync.crontab.ts` · `repositories/reservation.repository.ts` · `interfaces/…` · `reservation.util.ts` | modified — QR 동기화 대상은 이용 중만, 전환 · 링크 쿼리 · 쓰기, SMS 문구 |
| `apps/gateway/src/api/v1/user-service/reservation/controllers/*` · `apps/gateway/src/api/v1/admin-service/reservation/controllers/reservation.controller.queue.ts` | modified — 공개 라우트 4개 |
| `compose.scheduler.yml` · `.env.example` | modified — scheduler 에 AWS 키를 넘김 · `USER_WEB_URL` |
| 테스트 — 아래 Test Cases 의 spec 파일들 | new · modified |
| `README.md` · `AGENTS.md` · `docs/{messaging,integration,testing,data-layer}.md` · `docs/guides/aws-setup.md` | modified |

---

## Design

### A. 스키마

```ts
// libs/database/src/entities/reservation/reservation.entity.ts — 바뀌는 컬럼
    @Column({name: 'end_at', type: 'timestamptz', nullable: false, comment: '이용 끝 시각(마지막 확정 구간의 끝 — 연장이 확정되면 늘어난다, 이 시각에 이용 완료)'})
    end_at: Date;
    // checked_in_at · completed_at 삭제 — 체크인 · 체크아웃 없음(사용자 결정 2026-11-07)
    @Column({name: 'qr_link_sent_at', type: 'timestamptz', nullable: true, comment: 'QR 확인 링크 SMS 를 보낸 시각(예약당 1번 — 보내기 전 NULL)'})
    qr_link_sent_at: Date | null;
```

```ts
// libs/database/src/entities/door/door-open-log.entity.ts
import {BeforeInsert, Column, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn} from 'typeorm';
import {ReservationEntity} from '../reservation/reservation.entity.js';
import {RoomEntity} from '../room/room.entity.js';
import {RoomQrEntity} from './room-qr.entity.js';

/**
 * QR 로 문을 연 기록 — 문 소켓 QR 확인이 맞을 때 한 줄(업체 관리자 바로 열기 · 틀린 QR 은 남기지 않는다 — 사용자 결정 2026-11-07). 지우지 않는다.
 */
@Entity({name: 't_door_open_log', comment: 'QR 로 문을 연 기록'})
@Index('IDX_DoorOpenLog_RoomIdOpenedAt', ['room_id', 'opened_at'])
@Index('IDX_DoorOpenLog_ReservationId', ['reservation_id'])
export class DoorOpenLogEntity {
    @PrimaryColumn({name: 'door_open_log_id', length: 32, comment: '문 열림 기록 ID', primaryKeyConstraintName: 'PK_DoorOpenLog'})
    door_open_log_id: string;

    @ManyToOne(() => RoomEntity, {nullable: false, onUpdate: 'CASCADE', onDelete: 'CASCADE'})
    @JoinColumn({name: 'room_id', referencedColumnName: 'room_id', foreignKeyConstraintName: 'FK_DoorOpenLog_Room'})
    room_id: string;

    @ManyToOne(() => ReservationEntity, {nullable: false, onUpdate: 'CASCADE', onDelete: 'CASCADE'})
    @JoinColumn({name: 'reservation_id', referencedColumnName: 'reservation_id', foreignKeyConstraintName: 'FK_DoorOpenLog_Reservation'})
    reservation_id: string;

    @ManyToOne(() => RoomQrEntity, {nullable: false, onUpdate: 'CASCADE', onDelete: 'CASCADE'})
    @JoinColumn({name: 'room_qr_id', referencedColumnName: 'room_qr_id', foreignKeyConstraintName: 'FK_DoorOpenLog_RoomQr'})
    room_qr_id: string;

    @Column({name: 'opened_at', type: 'timestamptz', nullable: false, comment: '문을 연 시각(QR 확인이 맞은 시각)'})
    opened_at: Date;

    @Column({name: 'created_at', type: 'timestamptz', nullable: false, comment: '등록일'})
    created_at: Date;

    /** 등록일 */
    @BeforeInsert()
    insertTimestamp(): void {
        this.created_at = new Date();
    }
}
```

```ts
// libs/database/src/entities/reservation/reservation-cancel-request-state.entity.ts — 룩업(시드 4행: REQUESTED 요청 중 · APPROVED 승인 · REJECTED 거절 · EXPIRED 만료)
@Entity({name: 't_reservation_cancel_request_state', comment: '이용 중 취소 요청 상태'})
export class ReservationCancelRequestStateEntity {
    @PrimaryColumn({name: 'reservation_cancel_request_state_id', length: 20, comment: '요청 상태 ID', primaryKeyConstraintName: 'PK_ReservationCancelRequestState'})
    reservation_cancel_request_state_id: string;

    @Column({name: 'reservation_cancel_request_state_name', length: 50, nullable: false, comment: '요청 상태 이름'})
    reservation_cancel_request_state_name: string;
}

// libs/database/src/entities/reservation/reservation-cancel-request.entity.ts
/**
 * 이용 중 예약의 업체 취소 요청 — 업체 관리자가 요청하고 예약자가 링크에서 승인 · 거절한다(사용자 결정 2026-11-07). 진행 중(REQUESTED)은 예약당 1건.
 * 만료는 저장하지 않고 읽을 때 계산한다(요청 중 + expires_at ≤ 지금 = 만료). 새 요청이 이전 요청 중을 만료로 바꾼다.
 */
@Entity({name: 't_reservation_cancel_request', comment: '이용 중 예약 업체 취소 요청(이용자 동의)'})
@Index('UK_ReservationCancelRequest_ReservationIdRequested', ['reservation_id'], {unique: true, where: `"reservation_cancel_request_state_id" = 'REQUESTED'`})
@Index('IDX_ReservationCancelRequest_ReservationIdCreatedAt', ['reservation_id', 'created_at'])
export class ReservationCancelRequestEntity {
    @PrimaryColumn({name: 'reservation_cancel_request_id', length: 32, comment: '취소 요청 ID', primaryKeyConstraintName: 'PK_ReservationCancelRequest'})
    reservation_cancel_request_id: string;
    // reservation_id → t_reservation (FK_ReservationCancelRequest_Reservation, CASCADE)
    // user_id → t_user (요청한 업체 관리자, FK_ReservationCancelRequest_User, CASCADE)
    // reservation_cancel_request_state_id → 룩업 (FK_ReservationCancelRequest_ReservationCancelRequestState, CASCADE)
    // cancel_reason varchar(255) · expires_at timestamptz · responded_at timestamptz NULL(승인 · 거절 시각) · created_at · updated_at(훅)
}
```

### B. 이용 시작 · 종료 전환

```ts
// libs/contracts/src/reservation/reservation.constants.ts — 추가
/** 이용 전환의 호실 상태 — 시작은 예약가능 · 예약완료 · 정비중일 때만 사용중(사용중지 · 사용중은 그대로), 끝 · 이용 중 업체 취소는 사용중일 때만 정비중. user-service · scheduler 공통(사용자 결정 2026-11-07) */
export const USAGE_ROOM_STATE = {IN_USE: 'IN_USE', MAINTENANCE: 'MAINTENANCE', START_FROM: ['AVAILABLE', 'RESERVED', 'MAINTENANCE']} as const;
```

```ts
// apps/user-service/src/reservation/reservation.util.ts — 추가
/** 이용 전환 — START: 확정 → 이용 중, END: 끝 시각 지남(이용 완료 — scheduler), NONE: 그대로 */
export type UsageTransition = 'START' | 'END' | 'NONE';

/**
 * 이용 전환 판정 — 확정 · 이용 중 예약만. 끝 시각 정각부터 END, 확정이 시작 정각부터 끝 전이면 START(사용자 결정 2026-11-07 — 체크인 없이 예약 시간이 곧 이용).
 *
 * @param reservation 예약 (상태 · 시작 · 끝)
 * @param now 지금
 * @returns 전환
 */
export function judgeUsageTransition(reservation: Pick<ReservationEntity, 'reservation_state_id' | 'start_at' | 'end_at'>, now: Date): UsageTransition {
    const state = reservation.reservation_state_id;
    if (state !== RESERVATION_STATE.CONFIRMED && state !== RESERVATION_STATE.CHECKED_IN) {
        return 'NONE';
    }
    const at = dayjs(now);
    if (!at.isBefore(reservation.end_at)) {
        return 'END';
    }
    return state === RESERVATION_STATE.CONFIRMED && !at.isBefore(reservation.start_at) ? 'START' : 'NONE';
}

/**
 * 전환 뒤 호실 상태 — 바꾸지 않으면 null.
 *
 * @param room_state_id 지금 호실 상태
 * @param transition 시작 · 끝(이용 중 업체 취소 승인도 끝과 같다)
 * @returns 새 상태 또는 null
 */
export function nextUsageRoomState(room_state_id: string, transition: 'START' | 'END'): string | null {
    if (transition === 'START') {
        return (USAGE_ROOM_STATE.START_FROM as readonly string[]).includes(room_state_id) ? USAGE_ROOM_STATE.IN_USE : null;
    }
    return room_state_id === USAGE_ROOM_STATE.IN_USE ? USAGE_ROOM_STATE.MAINTENANCE : null;
}

// judgeReservationQr — 이용 중에만(사용자 결정 2026-11-07): 판정 'START' 추가
export type ReservationQrVerdict = 'SHOW' | 'ISSUE' | 'START' | 'OUT_OF_TIME' | 'NO_QR';
export function judgeReservationQr(reservation, roomQr, now): ReservationQrVerdict {
    const transition = judgeUsageTransition(reservation, now);
    if (transition === 'START') {
        return 'START'; // 시작했는데 아직 확정 — 그 자리에서 이용 중으로 바꾸고 준다
    }
    if (reservation.reservation_state_id === RESERVATION_STATE.CONFIRMED || transition === 'END') {
        return 'OUT_OF_TIME'; // 시작 전 · 끝난 뒤 — QR 은 정확히 시작 시각부터(사용자 결정 2026-11-07)
    }
    if (reservation.reservation_state_id !== RESERVATION_STATE.CHECKED_IN) {
        return 'NO_QR';
    }
    if (!roomQr) {
        return 'ISSUE';
    }
    return isRoomQrActive(roomQr, now) ? 'SHOW' : 'NO_QR';
}
```

```ts
// apps/user-service/src/reservation/reservation.service.ts — getMyReservationQr 의 2 · 3 단계
        // 2. 판정 — 이용 중에만, 시작했는데 아직 확정이면 그 자리에서 이용 시작
        const verdict = judgeReservationQr(reservation, roomQr, now.toDate());
        // NO_QR · OUT_OF_TIME 400 은 지금 문구 그대로
        // START — 이용 시작 = 예약 상태 조건 쓰기 + 호실 조건 쓰기(같은 트랜잭션). service private 헬퍼 금지라 결제 확인도 같은 두 쓰기를 직접 쓴다
        if (verdict === 'START') {
            const started = new ReservationEntity();
            started.reservation_state_id = RESERVATION_STATE.CHECKED_IN;
            if (!(await this.reservationRepository.updateReservation({reservation_id, reservation_state_id: RESERVATION_STATE.CONFIRMED}, started))) {
                throw new BadRequestException({message: RESERVATION_STATE_CHANGED_MESSAGE});
            }
            const inUse = new RoomEntity();
            inUse.room_state_id = USAGE_ROOM_STATE.IN_USE;
            await this.reservationRepository.updateReservationRoom({room_id: reservation.room_id, room_state_id: In([...USAGE_ROOM_STATE.START_FROM])}, inUse);
        }
        // 3. QR 이 없으면(ISSUE · START) 발급 — 지금 그대로 → 4. Redis setQr(마지막)
```

```ts
// confirmPayment 6단계 — 이미 시작한 예약이면 확정 직후 이용 중 + 호실(위와 같은 두 쓰기) + QR 발급 + setQr(마지막), 결과 상태는 CHECKED_IN
        if (judgeUsageTransition({...reservation, reservation_state_id: RESERVATION_STATE.CONFIRMED}, now.toDate()) === 'START') { … }
        return {reservation_id: reservation.reservation_id, reservation_state_id: started ? RESERVATION_STATE.CHECKED_IN : RESERVATION_STATE.CONFIRMED};
```

```ts
// apps/user-service/src/reservation/repositories/reservation.repository.ts — 추가
    /**
     * 예약 호실 상태 쓰기 — 상태 조건(이용 시작 · 이용 중 업체 취소). 지워지지 않은 호실만, 0행이면 그대로(바꿀 상태가 아니다).
     */
    async updateReservationRoom(where: FindOptionsWhere<RoomEntity>, entity: RoomEntity): Promise<void> {
        try {
            await this.rooms.update(notDeleted(where), entity);
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }
```

```ts
// apps/scheduler/src/reservation/crontabs/reservation-usage.crontab.ts
/** 이용 전환 잠금 키 */
export const RESERVATION_USAGE_LOCK = 'reservation.usage';

/**
 * 이용 전환 스케줄러 — 체크인 · 체크아웃 없이 예약 시간이 곧 이용(사용자 결정 2026-11-07).
 * 끝(이용 완료 + 사용중 → 정비중)을 먼저, 시작(이용 중 + 호실 사용중 + QR 발급 → Redis 현재 QR)을 나중에 — 맞닿은 예약이면 호실이 사용중으로 끝난다.
 * 상태 조건 쓰기라 겹쳐 돌아도 한 번만 바뀐다. 건별 실패는 다음 회차에 다시 본다.
 */
@Injectable()
export class ReservationUsageCrontab {
    constructor(
        @Inject(RESERVATION_REPOSITORY) private readonly reservationRepository: ReservationRepositoryInterface,
        @Inject(DOOR_STORE) private readonly doorStore: DoorStoreInterface,
        private readonly jobLock: JobLockService,
    ) {}

    /**
     * 1분마다(운영 전용) — 이용 종료 · 시작 전환.
     */
    @Cron(CronExpression.EVERY_MINUTE)
    async transitionUsage(): Promise<void> {
        if (process.env.NODE_ENV !== 'production') {
            return;
        }
        await this.jobLock.runExclusive(RESERVATION_USAGE_LOCK, async () => {
            const now = new Date();
            for (const row of await this.reservationRepository.findUsageEndRows(now)) {
                try {
                    await this.reservationRepository.endUsage(row);
                } catch {
                    // 건별 실패는 다음 회차
                }
            }
            for (const row of await this.reservationRepository.findUsageStartRows(now)) {
                try {
                    if (!(await this.reservationRepository.startUsage(row, buildRoomQr(row)))) {
                        continue;
                    }
                    const roomQr = await this.reservationRepository.findRoomQr({reservation_id: row.reservation_id});
                    if (roomQr && dayjs(now).isBefore(roomQr.ends_at)) {
                        await this.doorStore.setQr(roomQr.room_id, roomQr.qr, roomQr.ends_at);
                    }
                } catch {
                    // Redis 503 · 건별 실패는 다음 회차(QR 동기화가 Redis 를 다시 맞춘다)
                }
            }
        });
    }
}
```

```ts
// apps/scheduler/src/reservation/repositories/reservation.repository.ts — 추가(빌더는 Smoke)
    /** 이용 시작 대상 — 확정 · start_at ≤ now < end_at */
    buildUsageStartRowsQuery(now: Date): SelectQueryBuilder<ReservationEntity> {
        return this.reservations.createQueryBuilder('r')
            .select('r.reservation_id', 'reservation_id').addSelect('r.room_id', 'room_id').addSelect('r.start_at', 'start_at').addSelect('r.end_at', 'end_at')
            .where('r.reservation_state_id = :state', {state: RESERVATION_STATE.CONFIRMED})
            .andWhere('r.start_at <= :now', {now}).andWhere('r.end_at > :now', {now});
    }
    /** 이용 종료 대상 — 확정 · 이용 중 · end_at ≤ now */
    buildUsageEndRowsQuery(now: Date): SelectQueryBuilder<ReservationEntity> { /* … IN (:...states) [CONFIRMED, CHECKED_IN] · r.end_at <= :now */ }

    /** 이용 시작 — 한 트랜잭션: 예약 확정 → 이용 중(상태 조건, 0행이면 false) · 호실 시작 상태 → 사용중 · QR INSERT … ON CONFLICT DO NOTHING */
    async startUsage(row: UsageRow, roomQr: RoomQrEntity): Promise<boolean> {
        try {
            return await this.txHost.withTransaction(async () => {
                const started = await this.reservations.update({reservation_id: row.reservation_id, reservation_state_id: RESERVATION_STATE.CONFIRMED}, Object.assign(new ReservationEntity(), {reservation_state_id: RESERVATION_STATE.CHECKED_IN}));
                if (started.affected !== 1) {
                    return false;
                }
                await this.rooms.update(notDeleted({room_id: row.room_id, room_state_id: In([...USAGE_ROOM_STATE.START_FROM])}), Object.assign(new RoomEntity(), {room_state_id: USAGE_ROOM_STATE.IN_USE}));
                await this.buildInsertRoomQrQuery(roomQr).execute();
                return true;
            });
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /** 이용 종료 — 한 트랜잭션: 예약 확정 · 이용 중 → 이용 완료 · 호실 사용중 → 정비중 */
    async endUsage(row: UsageRow): Promise<boolean> { /* reservations.update({id, state: In([CONFIRMED, CHECKED_IN])}, COMPLETED) · rooms.update(notDeleted({room_id, room_state_id: IN_USE}), MAINTENANCE) */ }
```

- `reservation-qr-sync` 대상(`buildQrSyncTargetsQuery`)은 `CHECKED_IN` 하나로 줄인다. QR 이 없으면 발급하는 것은 방어로 남긴다.

### C. QR 확인 링크 SMS

```ts
// apps/scheduler/src/reservation/crontabs/reservation-qr-link.crontab.ts
/** QR 링크 SMS 잠금 키 */
export const RESERVATION_QR_LINK_LOCK = 'reservation.qr-link';

/** 링크를 보내는 때 — 시작 몇 분 전부터 */
export const RESERVATION_QR_LINK_BEFORE_MINUTES = 5;

/**
 * QR 확인 링크 SMS — 시작 5분 전(지금 바로 예약은 결제 확인 다음 회차)에 예약 1건 화면 링크를 1번 보낸다(QR 은 시작 시각부터 열린다).
 * 보낸 시각을 먼저 표시하고(비어 있을 때만 — 겹쳐도 1번) 보낸다. 발송이 실패하면 표시를 되돌려 다음 회차에 다시 보낸다. USER_WEB_URL 이 비면 보내지 않는다.
 */
    @Cron(CronExpression.EVERY_MINUTE)
    async sendQrLinks(): Promise<void> {
        if (process.env.NODE_ENV !== 'production') {
            return;
        }
        const base = process.env.USER_WEB_URL?.trim();
        if (!base) {
            return;
        }
        await this.jobLock.runExclusive(RESERVATION_QR_LINK_LOCK, async () => {
            const now = new Date();
            const rows = await this.reservationRepository.findQrLinkRows(now, dayjs(now).add(RESERVATION_QR_LINK_BEFORE_MINUTES, 'minute').toDate());
            for (const row of rows) {
                if (!(await this.reservationRepository.claimQrLink(row.reservation_id, now))) {
                    continue;
                }
                try {
                    await this.smsSender.send({to: row.user_phone, text: buildQrLinkSms(row.store_name, row.start_at, `${base}/reservation/${row.reservation_id}`)});
                } catch {
                    await this.reservationRepository.releaseQrLink(row.reservation_id, now).catch(() => undefined);
                }
            }
        });
    }

// reservation.util.ts (scheduler)
export function buildQrLinkSms(store_name: string, start_at: Date, link: string): string {
    return `[roomless] ${store_name} ${dayjs(start_at).tz(KST_TIMEZONE).format('M/D HH:mm')} 예약 — QR 확인: ${link}`;
}
// repository: buildQrLinkRowsQuery(now, until) — r 조인 t_user u(phone IS NOT NULL) · t_store s, 상태 IN(확정 · 이용 중) · start_at <= until · end_at > now · qr_link_sent_at IS NULL
//             claimQrLink(id, at) — update({reservation_id, qr_link_sent_at: IsNull()}, {qr_link_sent_at: at}) affected === 1
//             releaseQrLink(id, at) — update({reservation_id, qr_link_sent_at: at}, {qr_link_sent_at: null})
```

- `scheduler.module.ts` 에 `SmsModule` 을 더한다. `compose.scheduler.yml` 의 `AWS_ACCESS_KEY_ID: ''` · `AWS_SECRET_ACCESS_KEY: ''` 덮어쓰기를 지우고 주석을 고친다. `.env.example` 에 `USER_WEB_URL` 을 둔다(admin-service · scheduler).

### D. QR 문 열림 로그

```ts
// apps/user-service/src/door/door.service.ts — verifyStoreDoor
    async verifyStoreDoor(dto: DoorVerifyDto): Promise<DoorVerifyResultDto> {
        // 1. 그 업체의 호실 (지금 그대로)
        // 2. 그 호실의 그 QR — 없으면 Redis 를 보지 않고 ok false(Redis 현재 QR 은 DB 에서만 온다)
        const roomQr = await this.doorRepository.findDoorRoomQr({room_id: room.room_id, qr: dto.qr});
        if (!roomQr) {
            return {room_id: room.room_id, ok: false};
        }
        // 3. Redis 현재 QR 과 비교 + 같으면 열림 기록(Lua — 지금 그대로)
        const opened_at = new Date();
        const ok = await this.doorStore.verify(room.room_id, dto.qr, toDoorTime(opened_at));
        // 4. 맞으면 QR 로 연 기록 한 줄(사용자 결정 2026-11-07)
        if (ok) {
            const log = new DoorOpenLogEntity();
            log.door_open_log_id = generateId();
            log.room_id = room.room_id;
            log.reservation_id = roomQr.reservation_id;
            log.room_qr_id = roomQr.room_qr_id;
            log.opened_at = opened_at;
            await this.doorRepository.insertDoorOpenLog(log);
        }
        return {room_id: room.room_id, ok};
    }
// door repository: findDoorRoomQr(where) — roomQrs.findOne(loadRelationIds) · insertDoorOpenLog(entity) — insert, 둘 다 통일 500
```

### E. 사용중지 호실 전액 환불 취소

```ts
// apps/user-service/src/reservation/reservation.util.ts
/**
 * 이용자 취소 환불액 — 사용중지 호실이면 확정 · 이용 중을 끝 전까지 100%(사용자 결정 2026-11-07), 아니면 확정만 지금 규칙(마감 전 100% · 마감 뒤 비율 · 시작 뒤 불가). 취소 불가면 null.
 */
export function calculateCancelRefund(
    reservation: Pick<ReservationEntity, 'reservation_state_id' | 'refund_deadline_at' | 'start_at' | 'end_at' | 'late_refund_percent'>,
    is_room_disabled: boolean,
    amount: number,
    now: Dayjs,
): number | null {
    const state = reservation.reservation_state_id;
    if (is_room_disabled && (state === RESERVATION_STATE.CONFIRMED || state === RESERVATION_STATE.CHECKED_IN)) {
        return now.isBefore(dayjs(reservation.end_at)) ? amount : null;
    }
    if (state !== RESERVATION_STATE.CONFIRMED) {
        return null;
    }
    return calculateRefundAmount(amount, now, reservation.refund_deadline_at, reservation.start_at, reservation.late_refund_percent);
}
```

- `cancelReservation` 변경 사항:
  - 받는 상태에 `CHECKED_IN` 을 더한다.
  - 호실을 `findReservationRoom` 으로 읽고, 결제마다 `calculateCancelRefund` 를 부른다. 값이 `null` 이면 400 `이용 시작 후에는 취소할 수 없습니다.` 이다.
  - 환불 사유: 사용중지면 `RESERVATION_REFUND_REASON.DISABLED_ROOM`(`사용중지 호실 취소`), 아니면 `USER` 다.
  - 이용 중이었으면 QR 을 끝낸다: `t_room_qr.ends_at` = 지금 → 마지막에 `revokeQr`.
  - 호실 상태는 바꾸지 않는다.
- `ReservationListRow.room_state_id`: 목록 · 상세 쿼리에 `rm.room_state_id` 를 select 한다. `toReservationListItem` 이 `is_room_disabled: room_state_id === 'DISABLED' ? 1 : 0` 을 넣는다(목록 · 상세 DTO 에 필드 추가).

### F. 이용 중 업체 취소 — 이용자 동의

```ts
// libs/contracts/src/reservation/reservation.constants.ts — 추가
/** 이용 중 취소 요청 상태(t_reservation_cancel_request_state) */
export const RESERVATION_CANCEL_REQUEST_STATE = {REQUESTED: 'REQUESTED', APPROVED: 'APPROVED', REJECTED: 'REJECTED', EXPIRED: 'EXPIRED'} as const;
/** 이용 중 취소 요청 유효(분) — 예약 끝이 먼저면 예약 끝(사용자 결정 2026-11-07) */
export const RESERVATION_CANCEL_REQUEST_MINUTES = 10;
```

```ts
// util — admin-service(만료 시각 · 현황 표시) · user-service(조회 · 승인 · 거절)에 같은 함수(앱끼리 import 하지 않는다)
/** 요청 만료 시각 — min(요청 + 10분, 예약 끝) */
export function cancelRequestExpiresAt(requested_at: Date, end_at: Date): Date {
    const limit = dayjs(requested_at).add(RESERVATION_CANCEL_REQUEST_MINUTES, 'minute');
    return limit.isBefore(end_at) ? limit.toDate() : dayjs(end_at).toDate();
}
/** 보이는 상태 · 승인 · 거절 가능 — 요청 중인데 만료 시각이 지났으면(정각 포함) 만료 */
export function cancelRequestState(request: Pick<ReservationCancelRequestEntity, 'reservation_cancel_request_state_id' | 'expires_at'>, now: Date): {state: string; respondable: boolean} {
    if (request.reservation_cancel_request_state_id !== RESERVATION_CANCEL_REQUEST_STATE.REQUESTED) {
        return {state: request.reservation_cancel_request_state_id, respondable: false};
    }
    return dayjs(now).isBefore(request.expires_at) ? {state: RESERVATION_CANCEL_REQUEST_STATE.REQUESTED, respondable: true} : {state: RESERVATION_CANCEL_REQUEST_STATE.EXPIRED, respondable: false};
}
```

```ts
// apps/admin-service/src/reservation/reservation.service.ts — 새 메서드
    /**
     * 이용 중 취소 요청 (매니저) — 시작 뒤 · 끝 전 확정 · 이용 중 예약을 이용자 동의로 취소한다(사용자 결정 2026-11-07).
     * 이전 요청 중은 만료로 바꾸고 새 요청(10분 · 예약 끝까지)을 넣은 뒤, 예약자에게 승인 링크 SMS(마지막). (RabbitMQ: admin.reservation.use-cancel-request)
     */
    @Transactional()
    async requestUseCancel(user_id: string, reservation_id: string, dto: ReservationUseCancelRequestDto): Promise<ReservationUseCancelRequestResultDto> {
        // 0. 링크 주소 — 비면 503(쓰기 전)
        // 1. 소속 업체(findManagerStore) · 그 업체 예약 — 없으면 404
        // 2. 이용 중인지 — 확정 · 이용 중 + start_at ≤ 지금 < end_at, 아니면 400 '이용 중인 예약만 이용자 동의 취소를 요청할 수 있습니다.'
        // 3. 예약자 번호 — 없으면 400 '예약자 휴대폰 번호가 없어 동의를 받을 수 없습니다.'
        // 4. 이전 요청 중 → 만료(expireCancelRequests) · 새 요청 insert(UK → 400 '이미 진행 중인 취소 요청이 있습니다.')
        // 5. SMS(마지막): '[roomless] <업체명>에서 이용 중인 예약 취소를 요청했습니다(전액 환불). 동의하려면 10분 안에 확인해주세요: <USER_WEB_URL>/reservation/<id>/cancel-request'
        return {reservation_cancel_request_id: request.reservation_cancel_request_id, expires_at: request.expires_at.toISOString()};
    }
```

- **업체 취소**(`cancelStoreReservation`):
  - 결제 대기 · 확정 확인 다음에 시작 전인지 본다. 시작 뒤면 400 `이용 중인 예약은 이용자 동의를 받아 취소합니다.` 이다.
  - 시작 전 예약에는 QR 이 없으므로 'QR 끝내기' 단계와 `DOOR_STORE` 주입, `findRoomQr` · `updateRoomQr` 를 지운다(§1.7).
- **업체 현황**(`buildStoreReservationsQuery`): 마지막 요청의 상태 · 만료 · 등록일을 상관 서브쿼리 3개로 select 한다(`ORDER BY c.created_at DESC LIMIT 1`). util 이 `cancel_request_state_id`(만료 계산)와 `cancel_request_created_at` 을 만든다(없으면 null).
- **user-service 의 새 메서드 3개**는 아래 순서로 동작한다.
  - `getMyCancelRequest`(동기)
    1. 내 예약(결제 대기 만료 제외)과 마지막 요청을 읽는다. 없으면 404 `취소 요청이 없습니다.` 이다.
    2. 응답: 업체 · 호실 이름, 사유, 보이는 상태, 환불 예정액(결제 완료 금액 합), 만료, 등록일.
  - `approveCancelRequest`(큐, `@Transactional`)
    1. 마지막 요청이 `respondable` 인지 본다. 아니면 400 `승인할 수 없는 취소 요청입니다(만료 · 처리됨).` 이다.
    2. 예약이 확정 · 이용 중이고 끝 전인지 본다. 아니면 400(상태 바뀜)이다.
    3. 예약 · 구간을 취소한다(주체 STORE · 사유 = 요청 사유).
    4. 결제마다 100% 환불 신청을 남긴다(STORE 사유).
    5. QR 을 끝내고(`ends_at` = 지금), 호실을 `nextUsageRoomState(…, 'END')` 로 바꾼다.
    6. 요청을 승인으로 바꾸고(상태 조건) `responded_at` 을 적는다.
    7. 마지막으로 `revokeQr` 한다.
  - `rejectCancelRequest`(큐)
    1. 마지막 요청이 `respondable` 인지 본다.
    2. 요청을 거절로 바꾸고(상태 조건) `responded_at` 을 적는다.

```ts
// libs/contracts/src/reservation/reservation.commands.ts — 추가
    CANCEL_REQUEST_APPROVE: 'user.reservation.cancel-request-approve', // RESERVATION_COMMAND
    CANCEL_REQUEST_REJECT: 'user.reservation.cancel-request-reject',
    cancelRequest: (reservation_id: string) => `${RESERVATION_INTERNAL_BASE}/${encodeURIComponent(reservation_id)}/cancel-request`, // RESERVATION_INTERNAL_PATH
    USE_CANCEL_REQUEST: 'admin.reservation.use-cancel-request', // RESERVATION_MANAGER_COMMAND

// libs/contracts/src/reservation/dto/reservation-use-cancel-request.dto.ts
export class ReservationUseCancelRequestParamDto {
    @ApiProperty({description: '예약 ID'})
    @Matches(/^[a-f0-9]{32}$/, {message: '예약 ID가 올바르지 않습니다.'})
    @IsNotEmpty({message: '예약 ID를 입력해주세요.'})
    reservation_id: string;
}
export class ReservationUseCancelRequestDto {
    @ApiProperty({description: '취소 사유 (255자) — 예약자 승인 화면에 보인다'})
    @MaxLength(255, {message: '취소 사유는 255자 이내로 입력해주세요.'})
    @IsNotEmpty({message: '취소 사유를 입력해주세요.'})
    cancel_reason: string;
}
export class ReservationUseCancelRequestResultDto {
    @ApiProperty({description: '취소 요청 ID'})
    reservation_cancel_request_id: string;
    @ApiProperty({description: '만료 시각(ISO) — 요청 + 10분, 예약 끝이 먼저면 예약 끝'})
    expires_at: string;
}
```

- gateway 라우트:
  - admin-service `reservation.controller.queue.ts`: `@Post('/:reservation_id/use-cancel-request')` + 매니저 가드
  - user-service `reservation.controller.ts`: `@Get('/:reservation_id/cancel-request')`
  - user-service `reservation.controller.queue.ts`: `@Patch('/:reservation_id/cancel-request/approve')` · `…/reject`
  - 모두 기존 데코레이터 순서를 따르고, 이용자 라우트에는 이용자 가드를 붙인다.

### G. 문서
- README: scheduler crontab 목록(이용 전환 · QR 링크), user-service(이용 중 QR · 사용중지 환불 · 동의 승인), admin-service(이용 중 취소 요청), `USER_WEB_URL`
- AGENTS: 트리(scheduler crontabs), 외부 연동 SMS 사용처(scheduler), Smoke 목록
- docs: messaging(명령 3개) · integration(SMS — scheduler) · testing(Smoke) · data-layer(새 표 2 · 룩업) · guides/aws-setup(scheduler 도 SNS 를 쓴다)

---

## Test Cases

```
[CASES:usage-transition] 확정 · 지금 = 시작 정각 → 시작
[CASES:usage-transition] 확정 · 지금 = 시작 − 1초 → 그대로
[CASES:usage-transition] 확정 · 지금 = 끝 − 1초(crontab 이 늦음) → 시작
[CASES:usage-transition] 확정 · 지금 = 끝 정각(시작을 놓침) → 종료
[CASES:usage-transition] 이용 중 · 지금 = 끝 − 1초 → 그대로
[CASES:usage-transition] 이용 중 · 지금 = 끝 정각 → 종료
[CASES:usage-transition] 결제 대기 · 지금 = 시작 → 그대로
[CASES:usage-transition] 이용 완료 · 취소 · 만료 → 그대로
[CASES:room-state] 예약가능 · 예약완료 · 정비중 + 시작 → 사용중
[CASES:room-state] 사용중 · 사용중지 + 시작 → 그대로
[CASES:room-state] 사용중 + 종료 → 정비중
[CASES:room-state] 예약가능 · 사용중지 · 정비중 + 종료 → 그대로
[CASES:cancel-refund] 확정 · 마감 전 · 30,000원 → 30,000
[CASES:cancel-refund] 확정 · 마감 정각 · 50% · 30,000원 → 15,000
[CASES:cancel-refund] 확정 · 마감 뒤 · 50% · 33,333원 → 16,666(원 단위 내림)
[CASES:cancel-refund] 확정 · 마감 뒤 · 0% → 0(환불 없이 취소)
[CASES:cancel-refund] 확정 · 시작 정각 · 사용중지 아님 → 취소 불가
[CASES:cancel-refund] 이용 중 · 사용중지 아님 → 취소 불가
[CASES:cancel-refund] 확정 · 마감 뒤 · 사용중지 → 30,000(100%)
[CASES:cancel-refund] 확정 · 시작 뒤 · 사용중지 → 30,000
[CASES:cancel-refund] 이용 중 · 끝 − 1초 · 사용중지 → 30,000
[CASES:cancel-refund] 이용 중 · 끝 정각 · 사용중지 → 취소 불가
[CASES:cancel-request] 요청 13:00 · 예약 끝 15:00 → 만료 13:10
[CASES:cancel-request] 요청 14:55 · 끝 15:00 → 만료 15:00(끝이 먼저)
[CASES:cancel-request] 요청 14:50 · 끝 15:00 → 만료 15:00(같음)
[CASES:cancel-request] 요청 중 · 지금 = 만료 − 1초 → 요청 중 · 승인 가능
[CASES:cancel-request] 요청 중 · 지금 = 만료 정각 → 만료 · 불가
[CASES:cancel-request] 승인 · 거절 · 만료(저장) → 그대로 · 불가
[FAIL:validation] 이용 중 취소 요청 — 사유 없음 · 너무 김 · 예약 ID 형식 → 400
[FAIL:validation] 승인 · 거절 · 요청 조회 — 예약 ID 형식 → 400
[FAIL:duplicate] 이용 중 취소 요청 — 진행 중 요청 부분 유니크 위반(겹친 요청) → 400 `이미 진행 중인 취소 요청이 있습니다.`
[SMOKE:data-access] 이용 전환 대상(시작 · 종료) · 링크 SMS 대상(번호 · 업체 조인) · 업체 현황 예약(마지막 취소 요청 서브쿼리) · 내 예약 목록 · 상세(호실 상태)
테스트 생략(위임형): gateway 라우트 · 모듈 등록 · contracts 경로 상수 · 시드 행 — 프로젝트 규칙상 gateway · controller spec 을 두지 않는다
```

계산 표는 service 기능 spec 이 지난다(util spec · crontab spec 을 두지 않는 규칙 — AGENTS Testing):

| 표 | 어디서 지나는가 | 바뀌는 · 새 spec |
|---|---|---|
| `usage-transition` | user-service 내 예약 QR spec — 판정 결과를 응답으로 확인한다(시작 → 이용 중 쓰기 + QR, 그대로 · 종료 → 400 문구 · 쓰기 없음). scheduler 의 대상 · 조건은 같은 경계를 SQL 로 갖는다(Smoke) | `reservation-qr.spec.ts`(수정) |
| `room-state` 시작 | 내 예약 QR spec — 호실 조건 쓰기의 `In(START_FROM)` 인자. 상태별로는 `nextUsageRoomState` 를 승인 spec 과 같이 쓴다 | 같은 파일 |
| `room-state` 종료 | 승인 spec — 호실 상태별로 정비중 쓰기 여부 | `reservation-cancel-request-approve.spec.ts`(새) |
| `cancel-refund` | 이용자 취소 spec — 큐 경로 done 의 `refund_amount` · 400 | `reservation-cancel.spec.ts`(수정) |
| `cancel-request` 만료 | admin-service 요청 spec — insert 엔티티의 `expires_at` | `apps/admin-service/src/reservation/test/reservation-use-cancel-request.spec.ts`(새) |
| `cancel-request` 상태 | 요청 조회 spec(보이는 상태) · 승인 · 거절 spec(가능 여부) | `reservation-cancel-request.spec.ts` · `-approve` · `-reject`(새) |

그 밖의 spec — 프로젝트 형태:
- user-service
  - `reservation-payment-confirm.spec.ts`: 시작한 예약이면 이용 중 · 호실 쓰기 · QR · setQr 순서, 결과 상태 `CHECKED_IN`
  - `reservation-list.spec.ts` · `reservation-detail.spec.ts`: `is_room_disabled`
  - `door-verify.spec.ts`: QR 행 없음 → Redis 미호출 · ok false, 맞음 → 열림 로그 엔티티 값, 틀림 → 로그 없음
  - repository spec: `updateReservationRoom` notDeleted · 마지막 요청 find(정렬) · 요청 상태 조건 쓰기 · 목록 select 의 `room_state_id` Smoke · door `findDoorRoomQr` · `insertDoorOpenLog` 500
- admin-service
  - `reservation-store-cancel.spec.ts`: 시작 뒤 400 · QR 단계 삭제에 맞춰 정리
  - `reservation-store.spec.ts`: 요청 상태 · 등록일, 없으면 null
  - repository spec: 요청 insert UK → 400 · 만료 일괄 쓰기 조건 · 현황 서브쿼리 Smoke
- scheduler
  - `reservation.repository.spec.ts`:
    - Smoke: 시작 · 종료 대상 · 링크 대상
    - `startUsage` · `endUsage` 의 조건 쓰기 인자(가짜 tx)
    - `claimQrLink` · `releaseQrLink` 조건
    - crontab spec 은 없다(규칙).

## Response Codes

| 진입점 | 성공 | 실패 |
|---|---|---|
| `POST /api/v1/admin-service/reservation/:reservation_id/use-cancel-request` | SSE done `{reservation_cancel_request_id, expires_at}` | 400 검증 · 이용 중 아님 · 번호 없음 · 진행 중 요청 겹침, 401, 404 소속 업체 · 예약, 503 링크 주소 · SMS(재시도), 500 |
| `GET /api/v1/user-service/reservation/:reservation_id/cancel-request` | 200 요청 내용 | 400 검증, 401, 404 예약 · 요청 없음, 500 |
| `PATCH …/cancel-request/approve` | SSE done `{refund_amount}` | 400 만료 · 처리됨 · 상태 바뀜, 401, 404, 503 Redis(재시도), 500 |
| `PATCH …/cancel-request/reject` | SSE done null | 400 만료 · 처리됨, 401, 404, 500 |
| 내 예약 QR(변경) | 200 QR(이용 중만) | 400 `QR 은 이용 시간에만 볼 수 있습니다.` · `QR 을 볼 수 없는 예약입니다.` (지금 문구) |
| 이용자 취소(변경) | done `{refund_amount}` | 400 `이용 시작 후에는 취소할 수 없습니다.`(사용중지가 아니면) |
| 업체 취소(변경) | done null | 400 `이용 중인 예약은 이용자 동의를 받아 취소합니다.` |
