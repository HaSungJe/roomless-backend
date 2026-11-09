import type {ApiLogPartition} from '@app/database/api-log-partition.js';

/**
 * API 로그 파티션 repository 포트(scheduler) — t_api_log 월 파티션을 만든다(지우지 않는다).
 */
export interface ApiLogRepositoryInterface {
    /** 월 파티션 만들기 — 이미 있으면 그대로(IF NOT EXISTS) */
    createPartition(partition: ApiLogPartition): Promise<void>;
}
