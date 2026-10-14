import {Inject, Injectable} from '@nestjs/common';
import {Cron, CronExpression} from '@nestjs/schedule';
import dayjs from 'dayjs';
import {LessThanOrEqual} from 'typeorm';
import {UserEntity} from '@app/database/entities/user/user.entity.js';
import type {UserRepositoryInterface} from '../interfaces/user.repository.interface.js';
import {USER_REPOSITORY} from '../user.symbols.js';

/**
 * 회원 자동 탈퇴처리 스케줄러 — 예약시각이 지난 LEAVE_WAIT 회원을 백업 후 LEAVE 로 전환한다.
 * crontab 은 도메인 안의 crontabs 폴더에서 따로 관리한다 — 시간이 트리거인 인바운드 어댑터라 controller · handler 와 같은 층이다.
 * user-service 인스턴스를 여러 대 띄우면 각 인스턴스가 모두 실행하므로, 그때는 실행 인스턴스를 1대로 제한해야 한다.
 */
@Injectable()
export class UserLeaveCleanupCrontab {
    /**
     * @param userRepository 회원 repository 포트
     */
    constructor(
        @Inject(USER_REPOSITORY)
        private readonly userRepository: UserRepositoryInterface,
    ) {}

    /**
     * 매시간(운영 전용) — 예약시각 경과 LEAVE_WAIT → leave_backup(원본 JSON) 저장 후 LEAVE 전환 + PII 익명화.
     * sns_user_id/name/birth/phone 은 `DEL_<분단위시각>_<배치순번>`(전역 유일), device_os/device_token 은 null. 건별 실패는 건너뛴다.
     */
    @Cron(CronExpression.EVERY_HOUR)
    async processLeaveWait(): Promise<void> {
        // 운영 환경에서만 실행 (로컬/dev 에서 실데이터 탈퇴처리 방지)
        if (process.env.NODE_ENV !== 'production') {
            return;
        }
        // leave_reserved_at 은 'YYYY-MM-DD HH:mm:ss' 사전식 정렬 가능 문자열 → 문자열 비교로 경과 판단
        const targets = await this.userRepository.findUsers({state_id: 'LEAVE_WAIT', leave_reserved_at: LessThanOrEqual(dayjs().format('YYYY-MM-DD HH:mm:ss'))});
        const stamp = dayjs().format('YYYYMMDDHHmm'); // 배치 1회 산출(분단위)
        for (const [i, user] of targets.entries()) {
            try {
                const masked = `DEL_${stamp}_${i}`; // 분단위 시각 + 배치 내 순번 → 전역 유일(UK 회피)
                const update = new UserEntity();
                update.state_id = 'LEAVE';
                update.leave_backup = JSON.stringify(user); // 익명화 전 원본 전체 보존(반드시 익명화 할당보다 먼저)
                update.sns_user_id = masked;
                update.name = masked;
                update.birth = masked;
                update.phone = masked;
                update.device_os = null;
                update.device_token = null;
                await this.userRepository.updateUser({user_id: user.user_id}, update);
            } catch {
                // 건별 실패는 건너뛰고 다음 주기에 재시도
            }
        }
    }
}
