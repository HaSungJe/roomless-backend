import {Injectable, InternalServerErrorException} from '@nestjs/common';
import {TransactionHost} from '@nestjs-cls/transactional';
import type {TransactionalAdapterTypeOrm} from '@nestjs-cls/transactional-adapter-typeorm';
import {In, IsNull, MoreThanOrEqual} from 'typeorm';
import type {FindOptionsWhere, InsertQueryBuilder, Repository, SelectQueryBuilder} from 'typeorm';
import {PAYMENT_STATE, RESERVATION_STATE, USAGE_ROOM_STATE} from '@app/contracts/reservation/reservation.constants.js';
import {RoomQrEntity} from '@app/database/entities/door/room-qr.entity.js';
import {PaymentEntity} from '@app/database/entities/payment/payment.entity.js';
import {ReservationDetailEntity} from '@app/database/entities/reservation/reservation-detail.entity.js';
import {ReservationEntity} from '@app/database/entities/reservation/reservation.entity.js';
import {RoomEntity} from '@app/database/entities/room/room.entity.js';
import {StoreEntity} from '@app/database/entities/store/store.entity.js';
import {UserEntity} from '@app/database/entities/user/user.entity.js';
import {notDeleted} from '@app/database/soft-delete.js';
import type {ExpiredPendingRow, QrLinkRow, QrSyncTargetRow, ReservationRepositoryInterface, UsageRow} from '../interfaces/reservation.repository.interface.js';
import type {ExtensionTransition, PendingTransition, UsageTransition} from '../reservation.util.js';

/** DB 최종 실패 메시지 */
const SERVER_ERROR_MESSAGE = '서버에서 오류가 발생했습니다. 관리자에게 문의해주세요.';

/**
 * 예약 repository(scheduler) — crontab 이 쓰는 예약 · 구간 · 결제 · 호실 상태 · QR 접근. 한 건의 상태 전환(결제 · 구간 · 예약 / 예약 · 호실 · QR)은 withTransaction 으로 묶고,
 * 상태 조건(READY · PENDING · EXPIRED · REFUND_REQUESTED · CONFIRMED · 호실 상태)을 걸어 다른 요청(결제 확인 · 취소 · 내 예약 QR)과 겹쳐도 한쪽만 바꾼다.
 */
@Injectable()
export class ReservationRepository implements ReservationRepositoryInterface {
    /**
     * @param txHost 트랜잭션 호스트
     */
    constructor(private readonly txHost: TransactionHost<TransactionalAdapterTypeOrm>) {}

    /** t_reservation */
    private get reservations(): Repository<ReservationEntity> {
        return this.txHost.tx.getRepository(ReservationEntity);
    }

    /** t_reservation_detail */
    private get reservationDetails(): Repository<ReservationDetailEntity> {
        return this.txHost.tx.getRepository(ReservationDetailEntity);
    }

    /** t_payment */
    private get payments(): Repository<PaymentEntity> {
        return this.txHost.tx.getRepository(PaymentEntity);
    }

    /** t_room_qr */
    private get roomQrs(): Repository<RoomQrEntity> {
        return this.txHost.tx.getRepository(RoomQrEntity);
    }

    /** t_room */
    private get rooms(): Repository<RoomEntity> {
        return this.txHost.tx.getRepository(RoomEntity);
    }

    /**
     * 결제 대기 만료 시각이 지난 구간(기본 · 연장)
     *
     * @param now 지금
     * @returns 구간 행
     */
    async findExpiredPendingRows(now: Date): Promise<ExpiredPendingRow[]> {
        try {
            return await this.buildExpiredPendingQuery(now).getRawMany<ExpiredPendingRow>();
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 결제 대기 만료 쿼리 — 구간(기본 · 연장) PENDING · expires_at ≤ now · 결제 READY, 예약 상태 · 끝 · 합계 · 정비시간(연장 확정 · 되돌림).
     * 매핑 민감(결제 · 예약 조인 · raw select — 별칭이 ExpiredPendingRow 키와 같다)이라 Data-Access Smoke spec 으로 SQL 을 고정한다.
     *
     * @param now 지금
     * @returns 쿼리 빌더
     */
    buildExpiredPendingQuery(now: Date): SelectQueryBuilder<ReservationDetailEntity> {
        return this.reservationDetails
            .createQueryBuilder('d')
            .select('d.reservation_id', 'reservation_id')
            .addSelect('d.reservation_detail_id', 'reservation_detail_id')
            .addSelect('d.reservation_detail_type_id', 'reservation_detail_type_id')
            .addSelect('d.payment_id', 'payment_id')
            .addSelect('p.amount', 'amount')
            .addSelect('d.price', 'price')
            .addSelect('d.start_at', 'detail_start_at')
            .addSelect('d.end_at', 'detail_end_at')
            .addSelect('r.reservation_state_id', 'reservation_state_id')
            .addSelect('r.end_at', 'reservation_end_at')
            .addSelect('r.total_price', 'total_price')
            .addSelect('r.maintenance_minutes', 'maintenance_minutes')
            .innerJoin(PaymentEntity, 'p', 'p.payment_id = d.payment_id')
            .innerJoin(ReservationEntity, 'r', 'r.reservation_id = d.reservation_id')
            .where('d.reservation_state_id = :pending', {pending: RESERVATION_STATE.PENDING})
            .andWhere('d.expires_at <= :now', {now})
            .andWhere('p.payment_state_id = :ready', {ready: PAYMENT_STATE.READY})
            .orderBy('d.expires_at', 'ASC');
    }

    /**
     * 결제 대기 전환(기본 구간) — 결제(READY) → 구간(PENDING) → 예약(PENDING). 결제가 이미 바뀌었으면(결제 확인 · 취소가 먼저) 아무것도 바꾸지 않고 false, 그 뒤가 어긋나면 롤백(500).
     *
     * @param row 구간 행
     * @param transition 결제 · 구간 · 예약 엔티티
     * @returns 바꿨으면 true
     */
    async transitionPending(row: ExpiredPendingRow, transition: PendingTransition): Promise<boolean> {
        try {
            return await this.txHost.withTransaction(async () => {
                const payment = await this.payments.update({payment_id: row.payment_id, payment_state_id: PAYMENT_STATE.READY}, transition.payment);
                if (payment.affected !== 1) {
                    return false;
                }
                await this.reservationDetails.update({payment_id: row.payment_id, reservation_state_id: RESERVATION_STATE.PENDING}, transition.detail);
                const reservation = await this.reservations.update({reservation_id: row.reservation_id, reservation_state_id: RESERVATION_STATE.PENDING}, transition.reservation);
                if (reservation.affected !== 1) {
                    throw new Error('reservation state changed');
                }
                return true;
            });
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 연장 결제 대기 전환 — 결제(READY) → 구간(그 연장 구간 · PENDING) → 예약 · QR 을 한 트랜잭션으로. 예약은 끝 = 연장 시작 조건(그 사이 끝이 바뀌지 않았을 때만)으로,
     * 확정(QR 엔티티가 있다)이면 확정 · 이용 중 예약의 끝 · 합계를 늘리고(0행이면 롤백 500) QR 유효 끝(= 연장 시작인 것)을 연장 끝으로, 아니면(환불 · 만료) 점유 끝만 되돌린다.
     * 결제가 이미 바뀌었으면(결제 확인 · 취소가 먼저) 아무것도 바꾸지 않고 false.
     *
     * @param row 연장 구간 행
     * @param transition 결제 · 구간 · 예약 · QR(확정만) 엔티티
     * @returns 바꿨으면 true
     */
    async transitionExtension(row: ExpiredPendingRow, transition: ExtensionTransition): Promise<boolean> {
        try {
            return await this.txHost.withTransaction(async () => {
                const payment = await this.payments.update({payment_id: row.payment_id, payment_state_id: PAYMENT_STATE.READY}, transition.payment);
                if (payment.affected !== 1) {
                    return false;
                }
                await this.reservationDetails.update({reservation_detail_id: row.reservation_detail_id, reservation_state_id: RESERVATION_STATE.PENDING}, transition.detail);
                if (transition.room_qr) {
                    const reservation = await this.reservations.update(
                        {reservation_id: row.reservation_id, reservation_state_id: In([RESERVATION_STATE.CONFIRMED, RESERVATION_STATE.CHECKED_IN]), end_at: row.detail_start_at},
                        transition.reservation,
                    );
                    if (reservation.affected !== 1) {
                        throw new Error('reservation changed');
                    }
                    await this.roomQrs.update({reservation_id: row.reservation_id, ends_at: row.detail_start_at}, transition.room_qr);
                } else {
                    await this.reservations.update({reservation_id: row.reservation_id, end_at: row.detail_start_at}, transition.reservation);
                }
                return true;
            });
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 다시 확인할 만료 결제
     *
     * @param since 기준 시각(지금 − 30분)
     * @returns 결제 목록
     */
    async findRecheckPayments(since: Date): Promise<PaymentEntity[]> {
        try {
            return await this.payments.find({where: {payment_state_id: PAYMENT_STATE.EXPIRED, updated_at: MoreThanOrEqual(since)}, loadRelationIds: true});
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 환불 신청 결제
     *
     * @returns 결제 목록
     */
    async findRefundRequestedPayments(): Promise<PaymentEntity[]> {
        try {
            return await this.payments.find({where: {payment_state_id: PAYMENT_STATE.REFUND_REQUESTED}, loadRelationIds: true});
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 결제 수정 — 상태 조건을 건 쓰기
     *
     * @param payment_id 결제 ID
     * @param from_state 지금 상태(조건)
     * @param entity 바꿀 필드만 할당한 엔티티
     * @returns 1행이면 true
     */
    async updatePayment(payment_id: string, from_state: string, entity: PaymentEntity): Promise<boolean> {
        try {
            const result = await this.payments.update({payment_id, payment_state_id: from_state}, entity);
            return result.affected === 1;
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
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
     * QR 맞추기 대상 쿼리 — 이용 중 · start_at ≤ now < end_at, 그 예약의 QR 을 왼쪽 조인(없으면 qr · qr_ends_at NULL), 시작 순. 확정 예약은 이용 전환 crontab 이 시작 때 발급한다.
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
            .where('r.reservation_state_id = :state', {state: RESERVATION_STATE.CHECKED_IN})
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

    /**
     * 이용 시작 대상
     *
     * @param now 지금
     * @returns 예약 행
     */
    async findUsageStartRows(now: Date): Promise<UsageRow[]> {
        try {
            return await this.buildUsageStartRowsQuery(now).getRawMany<UsageRow>();
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 이용 시작 대상 쿼리 — 확정 · start_at ≤ now < end_at(시작 정각부터, 끝을 놓친 예약은 종료가 가져간다), 시작 순.
     * 매핑 민감(raw select — 별칭이 UsageRow 키와 같다 · 시각 경계)이라 Data-Access Smoke spec 으로 SQL 을 고정한다.
     *
     * @param now 지금
     * @returns 쿼리 빌더
     */
    buildUsageStartRowsQuery(now: Date): SelectQueryBuilder<ReservationEntity> {
        return this.reservations
            .createQueryBuilder('r')
            .select('r.reservation_id', 'reservation_id')
            .addSelect('r.room_id', 'room_id')
            .addSelect('r.start_at', 'start_at')
            .addSelect('r.end_at', 'end_at')
            .where('r.reservation_state_id = :state', {state: RESERVATION_STATE.CONFIRMED})
            .andWhere('r.start_at <= :now', {now})
            .andWhere('r.end_at > :now', {now})
            .orderBy('r.start_at', 'ASC');
    }

    /**
     * 이용 종료 대상
     *
     * @param now 지금
     * @returns 예약 행
     */
    async findUsageEndRows(now: Date): Promise<UsageRow[]> {
        try {
            return await this.buildUsageEndRowsQuery(now).getRawMany<UsageRow>();
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 이용 종료 대상 쿼리 — 확정 · 이용 중 · end_at ≤ now(끝 정각부터 — 시작을 놓친 확정도), 결제 대기 중인 연장이 있는 예약은 빼고 결제 결과를 기다린다(최대 5분), 끝 순.
     * 매핑 민감(raw select — 별칭이 UsageRow 키와 같다 · IN · 시각 경계 · NOT EXISTS 서브쿼리)이라 Data-Access Smoke spec 으로 SQL 을 고정한다.
     *
     * @param now 지금
     * @returns 쿼리 빌더
     */
    buildUsageEndRowsQuery(now: Date): SelectQueryBuilder<ReservationEntity> {
        return this.reservations
            .createQueryBuilder('r')
            .select('r.reservation_id', 'reservation_id')
            .addSelect('r.room_id', 'room_id')
            .addSelect('r.start_at', 'start_at')
            .addSelect('r.end_at', 'end_at')
            .where('r.reservation_state_id IN (:...states)', {states: [RESERVATION_STATE.CONFIRMED, RESERVATION_STATE.CHECKED_IN]})
            .andWhere('r.end_at <= :now', {now})
            .andWhere(
                (qb) =>
                    `NOT EXISTS ${qb.subQuery().select('1').from(ReservationDetailEntity, 'pd').where('pd.reservation_id = r.reservation_id').andWhere('pd.reservation_state_id = :pending').getQuery()}`,
            )
            .setParameter('pending', RESERVATION_STATE.PENDING)
            .orderBy('r.end_at', 'ASC');
    }

    /**
     * 이용 시작 — 예약(확정 → 이용 중, 상태 조건) · 호실(예약가능 · 예약완료 · 정비중 → 사용중, 지워지지 않은 호실 — 0행이면 그대로) · QR 발급(ON CONFLICT DO NOTHING)을 한 트랜잭션으로.
     * 예약이 이미 바뀌었으면(내 예약 QR · 결제 확인이 먼저) 아무것도 바꾸지 않고 false.
     *
     * @param row 이용 시작 대상
     * @param transition 예약 · 호실 엔티티
     * @param roomQr 발급할 QR
     * @returns 바꿨으면 true
     */
    async startUsage(row: UsageRow, transition: UsageTransition, roomQr: RoomQrEntity): Promise<boolean> {
        try {
            return await this.txHost.withTransaction(async () => {
                const reservation = await this.reservations.update({reservation_id: row.reservation_id, reservation_state_id: RESERVATION_STATE.CONFIRMED}, transition.reservation);
                if (reservation.affected !== 1) {
                    return false;
                }
                await this.rooms.update(notDeleted<RoomEntity>({room_id: row.room_id, room_state_id: In([...USAGE_ROOM_STATE.START_FROM])}), transition.room);
                await this.buildInsertRoomQrQuery(roomQr).execute();
                return true;
            });
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 이용 종료 — 예약(확정 · 이용 중 → 이용 완료, 상태 조건) · 호실(사용중 → 정비중, 지워지지 않은 호실 — 0행이면 그대로)을 한 트랜잭션으로.
     * QR 은 Redis 가 끝 시각에 저절로 지운다(PXAT). 예약이 이미 바뀌었으면(취소가 먼저) false.
     *
     * @param row 이용 종료 대상
     * @param transition 예약 · 호실 엔티티
     * @returns 바꿨으면 true
     */
    async endUsage(row: UsageRow, transition: UsageTransition): Promise<boolean> {
        try {
            return await this.txHost.withTransaction(async () => {
                const reservation = await this.reservations.update(
                    {reservation_id: row.reservation_id, reservation_state_id: In([RESERVATION_STATE.CONFIRMED, RESERVATION_STATE.CHECKED_IN])},
                    transition.reservation,
                );
                if (reservation.affected !== 1) {
                    return false;
                }
                await this.rooms.update(notDeleted<RoomEntity>({room_id: row.room_id, room_state_id: USAGE_ROOM_STATE.IN_USE}), transition.room);
                return true;
            });
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * QR 확인 링크 SMS 대상
     *
     * @param now 지금
     * @param until 지금 + 5분
     * @returns 예약 행
     */
    async findQrLinkRows(now: Date, until: Date): Promise<QrLinkRow[]> {
        try {
            return await this.buildQrLinkRowsQuery(now, until).getRawMany<QrLinkRow>();
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * QR 확인 링크 SMS 대상 쿼리 — 확정 · 이용 중 · start_at ≤ until · end_at > now · 링크 안 보냄 · 예약자 번호 있음, 업체 · 회원 조인(지운 업체도 기록이라 그대로 보낸다), 시작 순.
     * 매핑 민감(조인 · raw select — 별칭이 QrLinkRow 키와 같다 · NULL 조건)이라 Data-Access Smoke spec 으로 SQL 을 고정한다.
     *
     * @param now 지금
     * @param until 지금 + 5분
     * @returns 쿼리 빌더
     */
    buildQrLinkRowsQuery(now: Date, until: Date): SelectQueryBuilder<ReservationEntity> {
        return this.reservations
            .createQueryBuilder('r')
            .select('r.reservation_id', 'reservation_id')
            .addSelect('r.start_at', 'start_at')
            .addSelect('s.store_name', 'store_name')
            .addSelect('u.phone', 'user_phone')
            .innerJoin(StoreEntity, 's', 's.store_id = r.store_id')
            .innerJoin(UserEntity, 'u', 'u.user_id = r.user_id')
            .where('r.reservation_state_id IN (:...states)', {states: [RESERVATION_STATE.CONFIRMED, RESERVATION_STATE.CHECKED_IN]})
            .andWhere('r.start_at <= :until', {until})
            .andWhere('r.end_at > :now', {now})
            .andWhere('r.qr_link_sent_at IS NULL')
            .andWhere('u.phone IS NOT NULL')
            .orderBy('r.start_at', 'ASC');
    }

    /**
     * 링크 보냄 표시 — 비어 있을 때만(겹쳐 돌아도 1번)
     *
     * @param reservation_id 예약 ID
     * @param entity 보낸 시각을 할당한 엔티티
     * @returns 1행이면 true
     */
    async claimQrLink(reservation_id: string, entity: ReservationEntity): Promise<boolean> {
        try {
            const result = await this.reservations.update({reservation_id, qr_link_sent_at: IsNull()}, entity);
            return result.affected === 1;
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 링크 보냄 표시 되돌리기 — 그 표시일 때만(다음 회차에 다시 보낸다)
     *
     * @param reservation_id 예약 ID
     * @param sent_at 이번 회차가 표시한 시각
     * @param entity qr_link_sent_at = null 을 할당한 엔티티
     */
    async releaseQrLink(reservation_id: string, sent_at: Date, entity: ReservationEntity): Promise<void> {
        try {
            await this.reservations.update({reservation_id, qr_link_sent_at: sent_at}, entity);
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }
}
