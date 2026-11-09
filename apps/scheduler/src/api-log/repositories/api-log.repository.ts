import {Injectable, InternalServerErrorException} from '@nestjs/common';
import {TransactionHost} from '@nestjs-cls/transactional';
import type {TransactionalAdapterTypeOrm} from '@nestjs-cls/transactional-adapter-typeorm';
import {toCreateApiLogPartitionSql} from '@app/database/api-log-partition.js';
import type {ApiLogPartition} from '@app/database/api-log-partition.js';
import type {ApiLogRepositoryInterface} from '../interfaces/api-log.repository.interface.js';

/** DB 최종 실패 메시지 */
const SERVER_ERROR_MESSAGE = '서버에서 오류가 발생했습니다. 관리자에게 문의해주세요.';

/**
 * API 로그 파티션 repository(scheduler) — DDL 을 실행한다(엔티티 repository 가 아니라 EntityManager.query).
 */
@Injectable()
export class ApiLogRepository implements ApiLogRepositoryInterface {
    /**
     * @param txHost 트랜잭션 호스트
     */
    constructor(private readonly txHost: TransactionHost<TransactionalAdapterTypeOrm>) {}

    /**
     * 월 파티션 만들기 — 그 달의 행이 이미 기본 파티션에 있으면 PostgreSQL 이 거부한다(→ 500, crontab 이 그 달만 건너뛴다)
     *
     * @param partition 파티션
     */
    async createPartition(partition: ApiLogPartition): Promise<void> {
        try {
            await this.txHost.tx.query(toCreateApiLogPartitionSql(partition));
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }
}
