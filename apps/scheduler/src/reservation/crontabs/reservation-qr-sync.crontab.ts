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
 * QR 맞추기 스케줄러 — 이용 중 예약마다 QR 이 있게 하고(시작 때 이용 전환이 발급한다 — 없으면 방어로 발급, 미래 예약에 미리 주지 않는다), 그 QR 을 Redis 현재 QR 로 다시 쓴다.
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
