import { Inject, Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import dayjs from 'dayjs';
import { USER_REPOSITORY } from './user.symbols';
import type { UserRepositoryInterface } from './interfaces/user.repository.interface';
import { UserEntity } from './entities/user.entity';

/**
 * 회원 자동 탈퇴처리 스케줄러 — 예약시각이 지난 LEAVE_WAIT 회원을 백업 후 LEAVE 로 전환.
 * controller 없는 @Cron 전용 service(file.cleanup 선례).
 * (`ScheduleModule.forRoot()` 는 app.module 에 1회 등록돼 있어야 동작)
 */
@Injectable()
export class UserLeaveCleanupService {
    constructor(
        @Inject(USER_REPOSITORY)
        private readonly userRepository: UserRepositoryInterface,
    ) {}

    /**
     * 매시간(운영 전용) — 예약시각 경과 LEAVE_WAIT → leave_backup(원본 JSON) 저장 후 LEAVE 전환 + PII 익명화.
     * sns_user_id/name/birth/phone 은 `DEL_<분단위시각>_<배치순번>`(전역 유일), device_os/device_token 은 null.
     * 건별 실패는 건너뜀.
     */
    @Cron(CronExpression.EVERY_HOUR)
    async processLeaveWait(): Promise<void> {
        // 운영 환경에서만 실행 (로컬/dev 에서 실데이터 탈퇴처리 방지)
        if (process.env.NODE_ENV !== 'production') {
            return;
        }
        const targets = await this.userRepository.findLeaveReadyUsers(dayjs().format('YYYY-MM-DD HH:mm:ss'));
        const stamp = dayjs().format('YYYYMMDDHHmm');   // 배치 1회 산출(분단위) — 배치 간 상이
        for (const [i, user] of targets.entries()) {
            try {
                const update = new UserEntity();
                update.state_id = 'LEAVE';
                update.leave_backup = JSON.stringify(user);   // 익명화 전 원본 전체 보존(반드시 익명화 할당보다 먼저)
                const masked = `DEL_${stamp}_${i}`;            // 분단위 시각 + 배치 내 순번 → 전역 유일(UK 회피)
                update.sns_user_id = masked;   // UK(sns_id,sns_user_id) — i 로 배치 내 구분
                update.name = masked;
                update.birth = masked;         // 컬럼 20자 한도 내
                update.phone = masked;         // UK_User_Phone — i 로 배치 내 유일
                update.device_os = null;
                update.device_token = null;
                await this.userRepository.updateUser({user_id: user.user_id}, update);
            } catch {
                // 건별 실패는 건너뛰고 다음 주기에 재시도
            }
        }
    }
}
