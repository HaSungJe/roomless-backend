import {Inject, Injectable} from '@nestjs/common';
import {Cron, CronExpression} from '@nestjs/schedule';
import {dayjs} from '@app/common/utils/dayjs.js';
import {JobLockService} from '@app/database/job-lock/job-lock.service.js';
import {DOOR_STORE} from '@app/integration/integration.symbols.js';
import type {DoorStoreInterface} from '@app/integration/interfaces/integration.interface.js';
import type {ReservationRepositoryInterface} from '../interfaces/reservation.repository.interface.js';
import {RESERVATION_REPOSITORY} from '../reservation.symbols.js';
import {buildRoomQr, buildUsageEndTransition, buildUsageStartTransition} from '../reservation.util.js';

/** 이용 전환 잠금 키 */
export const RESERVATION_USAGE_LOCK = 'reservation.usage';

/**
 * 이용 전환 스케줄러 — 체크인 · 체크아웃 없이 예약 시간이 곧 이용이다(사용자 결정 2026-11-07).
 * 끝(확정 · 이용 중 → 이용 완료 + 사용중 → 정비중)을 먼저, 시작(확정 → 이용 중 + 호실 사용중 + QR 발급 → Redis 현재 QR)을 나중에 — 같은 호실에 맞닿은 예약이면 호실이 사용중으로 끝난다.
 * 시작 시각에 손님이 오지 않아도 이용 중이다. 상태 조건 쓰기라 내 예약 QR · 결제 확인과 겹쳐도 한 번만 바뀐다. 건별 실패는 다음 회차에 다시 본다.
 */
@Injectable()
export class ReservationUsageCrontab {
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
                    await this.reservationRepository.endUsage(row, buildUsageEndTransition());
                } catch {
                    // 건별 실패는 건너뛰고 다음 회차에 다시 본다
                }
            }
            for (const row of await this.reservationRepository.findUsageStartRows(now)) {
                try {
                    if (!(await this.reservationRepository.startUsage(row, buildUsageStartTransition(), buildRoomQr(row)))) {
                        continue;
                    }
                    const roomQr = await this.reservationRepository.findRoomQr({reservation_id: row.reservation_id});
                    if (roomQr && dayjs(now).isBefore(roomQr.ends_at)) {
                        await this.doorStore.setQr(roomQr.room_id, roomQr.qr, roomQr.ends_at);
                    }
                } catch {
                    // Redis 503 · 건별 실패는 건너뛴다 — QR 동기화가 1분 안에 Redis 를 맞춘다
                }
            }
        });
    }
}
