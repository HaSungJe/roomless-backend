import {BeforeInsert, Column, Entity, Index, PrimaryColumn, PrimaryGeneratedColumn} from 'typeorm';

/**
 * API 호출 로그 — 게이트웨이가 모든 HTTP 요청을 응답이 끝난 뒤 로그 전용 연결로 넣는다(사용자 결정 2026-11-10).
 * - created_at RANGE 월 파티션 테이블(한국 달 — `t_api_log_YYYYMM` + `t_api_log_default`, 1794253561123-ApiLogPartition). 파티션은 scheduler 가 3개월 앞서 만들고 지우지 않는다.
 * - PK 가 (api_log_id, created_at) 복합인 이유: PostgreSQL RANGE 파티셔닝은 파티션 키(created_at)가 PK 에 포함되어야 한다.
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

    @Column({name: 'path', length: 500, nullable: false, comment: '요청 경로 (라우트 패턴, 없는 경로는 실제 경로)'})
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
