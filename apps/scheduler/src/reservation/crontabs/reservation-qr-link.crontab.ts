import {Inject, Injectable} from '@nestjs/common';
import {Cron, CronExpression} from '@nestjs/schedule';
import {dayjs} from '@app/common/utils/dayjs.js';
import {JobLockService} from '@app/database/job-lock/job-lock.service.js';
import {SMS_SENDER} from '@app/integration/integration.symbols.js';
import type {SmsSenderInterface} from '@app/integration/interfaces/integration.interface.js';
import type {ReservationRepositoryInterface} from '../interfaces/reservation.repository.interface.js';
import {RESERVATION_REPOSITORY} from '../reservation.symbols.js';
import {buildQrLinkSent, buildQrLinkSms, readUserWebUrl} from '../reservation.util.js';

/** QR 확인 링크 SMS 잠금 키 */
export const RESERVATION_QR_LINK_LOCK = 'reservation.qr-link';

/** 링크를 보내는 때 — 이용 시작 몇 분 전부터 */
export const RESERVATION_QR_LINK_BEFORE_MINUTES = 5;

/**
 * QR 확인 링크 SMS 스케줄러 — 이용 시작 5분 전(지금 바로 예약은 결제 확인 다음 회차)에 예약 1건 화면 링크를 예약당 1번 보낸다. QR 은 시작 시각부터 열린다(사용자 결정 2026-11-07).
 * 보낸 시각을 먼저 표시하고(비어 있을 때만 — 겹쳐 돌아도 1번) 보낸다. 발송이 실패하면 표시를 되돌려 다음 회차에 다시 보낸다. USER_WEB_URL 이 비면 보내지 않는다.
 */
@Injectable()
export class ReservationQrLinkCrontab {
    /**
     * @param reservationRepository 예약 repository 포트
     * @param smsSender SMS 발송 포트 (Amazon SNS)
     * @param jobLock 인스턴스 1대 실행 잠금
     */
    constructor(
        @Inject(RESERVATION_REPOSITORY) private readonly reservationRepository: ReservationRepositoryInterface,
        @Inject(SMS_SENDER) private readonly smsSender: SmsSenderInterface,
        private readonly jobLock: JobLockService,
    ) {}

    /**
     * 1분마다(운영 전용) — 곧 시작하는 예약에 QR 확인 링크 SMS.
     */
    @Cron(CronExpression.EVERY_MINUTE)
    async sendQrLinks(): Promise<void> {
        if (process.env.NODE_ENV !== 'production') {
            return;
        }
        const base = readUserWebUrl();
        if (!base) {
            return;
        }
        await this.jobLock.runExclusive(RESERVATION_QR_LINK_LOCK, async () => {
            const now = new Date();
            const rows = await this.reservationRepository.findQrLinkRows(now, dayjs(now).add(RESERVATION_QR_LINK_BEFORE_MINUTES, 'minute').toDate());
            for (const row of rows) {
                try {
                    if (!(await this.reservationRepository.claimQrLink(row.reservation_id, buildQrLinkSent(now)))) {
                        continue;
                    }
                } catch {
                    continue;
                }
                try {
                    await this.smsSender.send({to: row.user_phone, text: buildQrLinkSms(row.store_name, row.start_at, `${base}/reservation/${row.reservation_id}`)});
                } catch {
                    // 발송 실패 — 표시를 되돌려 다음 회차에 다시 보낸다(되돌리기도 실패하면 이 예약은 링크를 받지 못한다 — 예약 화면에서 볼 수 있다)
                    await this.reservationRepository.releaseQrLink(row.reservation_id, now, buildQrLinkSent(null)).catch(() => undefined);
                }
            }
        });
    }
}
