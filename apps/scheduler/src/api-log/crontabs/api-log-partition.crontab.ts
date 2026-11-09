import {Inject, Injectable} from '@nestjs/common';
import {Cron, CronExpression} from '@nestjs/schedule';
import {dayjs} from '@app/common/utils/dayjs.js';
import {API_LOG_AHEAD_MONTHS, buildApiLogPartitions} from '@app/database/api-log-partition.js';
import {JobLockService} from '@app/database/job-lock/job-lock.service.js';
import {API_LOG_REPOSITORY} from '../api-log.symbols.js';
import type {ApiLogRepositoryInterface} from '../interfaces/api-log.repository.interface.js';

/** 파티션 만들기 잠금 키 — scheduler 가 여러 대여도 한 회차는 1대만 */
export const API_LOG_PARTITION_LOCK = 'api-log.partition';

/**
 * t_api_log 월 파티션 미리 만들기 — 이번 달 + 앞으로 3개월(한국 달)을 매일 확인해 없으면 만든다. 지우지 않는다(사용자 결정 2026-11-10).
 * 범위 밖 행은 기본 파티션이 받으므로 늦어도 insert 는 실패하지 않는다. 대상은 IF NOT EXISTS 라 두 번 돌아도 같다.
 */
@Injectable()
export class ApiLogPartitionCrontab {
    /**
     * @param apiLogRepository API 로그 파티션 repository 포트
     * @param jobLock 인스턴스 1대 실행 잠금
     */
    constructor(
        @Inject(API_LOG_REPOSITORY)
        private readonly apiLogRepository: ApiLogRepositoryInterface,
        private readonly jobLock: JobLockService,
    ) {}

    /**
     * 매일 03:00(운영 전용) — 파티션 미리 만들기. 그 달의 행이 이미 기본 파티션에 있어 못 만들면 그 달만 건너뛴다.
     * 다른 인스턴스가 이번 회차를 실행 중이면 건너뛴다.
     */
    @Cron(CronExpression.EVERY_DAY_AT_3AM)
    async ensurePartitions(): Promise<void> {
        if (process.env.NODE_ENV !== 'production') {
            return;
        }
        await this.jobLock.runExclusive(API_LOG_PARTITION_LOCK, async () => {
            for (const partition of buildApiLogPartitions(dayjs(), API_LOG_AHEAD_MONTHS)) {
                try {
                    await this.apiLogRepository.createPartition(partition);
                } catch {
                    // 건별 실패는 건너뛰고 다음 회차에 다시
                }
            }
        });
    }
}
