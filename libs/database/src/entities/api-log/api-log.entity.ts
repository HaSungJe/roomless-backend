import {BeforeInsert, Column, Entity, Index, PrimaryColumn, PrimaryGeneratedColumn} from 'typeorm';

/**
 * API 호출 로그 (게이트웨이 이식 예정)
 * - PK 가 (api_log_id, created_at) 복합인 이유: PostgreSQL RANGE 파티셔닝은 파티션 키(created_at)가 PK 에 포함되어야 한다.
 * - 파티셔닝은 api-log 를 게이트웨이에 이식할 때 별도 마이그레이션으로 전환한다.
 */
@Entity({name: 't_api_log', comment: 'API 호출 로그'})
@Index('IDX_ApiLog_CreatedAt', ['created_at'])
@Index('IDX_ApiLog_Path', ['path'])
@Index('IDX_ApiLog_UserId', ['user_id'])
export class ApiLogEntity {
    @PrimaryGeneratedColumn({name: 'api_log_id', type: 'bigint', comment: '로그 ID', primaryKeyConstraintName: 'PK_ApiLog'})
    api_log_id: string;

    @PrimaryColumn({name: 'created_at', type: 'timestamptz', precision: 3, comment: '요청 시각', primaryKeyConstraintName: 'PK_ApiLog'})
    created_at: Date;

    @Column({name: 'method', length: 10, nullable: false, comment: 'HTTP 메서드'})
    method: string;

    @Column({name: 'path', length: 500, nullable: false, comment: '요청 경로 (실제 URL)'})
    path: string;

    @Column({name: 'request_param', type: 'jsonb', nullable: true, comment: 'path param'})
    request_param: unknown;

    @Column({name: 'request_query', type: 'jsonb', nullable: true, comment: 'query string'})
    request_query: unknown;

    @Column({name: 'request_body', type: 'jsonb', nullable: true, comment: '요청 body (multipart 의 경우 파일 메타만)'})
    request_body: unknown;

    @Column({name: 'status_code', type: 'integer', nullable: false, comment: '응답 상태 코드'})
    status_code: number;

    @Column({name: 'response_body', type: 'jsonb', nullable: true, comment: '응답 body'})
    response_body: unknown;

    @Column({name: 'error_stack', type: 'text', nullable: true, comment: 'unhandled 예외의 stack trace'})
    error_stack: string | null;

    @Column({name: 'user_id', type: 'varchar', length: 36, nullable: true, comment: '인증된 사용자 ID (JWT)'})
    user_id: string | null;

    @Column({name: 'ip', type: 'varchar', length: 45, nullable: true, comment: '클라이언트 IP'})
    ip: string | null;

    @Column({name: 'user_agent', type: 'varchar', length: 500, nullable: true, comment: 'User-Agent'})
    user_agent: string | null;

    @Column({name: 'duration_ms', type: 'integer', nullable: false, comment: '처리 시간 (ms)'})
    duration_ms: number;

    /**
     * insert 직전 요청 시각이 없으면 채운다.
     */
    @BeforeInsert()
    insertTimestamp(): void {
        if (!this.created_at) this.created_at = new Date();
    }
}
