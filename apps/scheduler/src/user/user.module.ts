import {Module} from '@nestjs/common';
import {UserLeaveCleanupCrontab} from './crontabs/user-leave-cleanup.crontab.js';
import {UserRepository} from './repositories/user.repository.js';
import {USER_REPOSITORY} from './user.symbols.js';

/**
 * scheduler 의 회원 도메인 — crontab(시간 트리거 인바운드 어댑터)이 repository 포트를 직접 쓴다(service 없음).
 */
@Module({providers: [UserLeaveCleanupCrontab, {provide: USER_REPOSITORY, useClass: UserRepository}]})
export class UserModule {}
