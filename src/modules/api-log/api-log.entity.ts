import { BeforeInsert, Column, Entity, Index, PrimaryColumn, PrimaryGeneratedColumn } from 'typeorm';

/**
 * API 호출 로그
 *
 * - PK 가 (id, create_at) composite — MySQL RANGE 파티셔닝 제약상 파티션 키(create_at)가 PK 에 포함되어야 함.
 * - 파티션 정의 자체는 ApiLogPartitionService 가 onModuleInit 시점에 raw SQL 로 적용.
 */
@Entity({name: 't_api_log', comment: 'API 호출 로그'})
@Index('IDX_ApiLog_CreateAt', ['create_at'])
@Index('IDX_ApiLog_Path', ['path'])
@Index('IDX_ApiLog_UserId', ['user_id'])
export class ApiLogEntity {
    @PrimaryGeneratedColumn({type: 'bigint', name: 'id', comment: '로그 ID', primaryKeyConstraintName: 'PK_ApiLog'})
    id: string;

    @PrimaryColumn({name: 'create_at', type: 'datetime', precision: 3, comment: '요청 시각', primaryKeyConstraintName: 'PK_ApiLog'})
    create_at: Date;

    @Column({name: 'method', type: 'varchar', length: 10, nullable: false, comment: 'HTTP 메서드'})
    method: string;

    @Column({name: 'path', type: 'varchar', length: 500, nullable: false, comment: '요청 경로 (실제 URL)'})
    path: string;

    @Column({name: 'request_param', type: 'json', nullable: true, comment: 'path param'})
    request_param: any;

    @Column({name: 'request_query', type: 'json', nullable: true, comment: 'query string'})
    request_query: any;

    @Column({name: 'request_body', type: 'json', nullable: true, comment: '요청 body (multipart 의 경우 파일 메타만)'})
    request_body: any;

    @Column({name: 'status_code', type: 'int', nullable: false, comment: '응답 상태 코드'})
    status_code: number;

    @Column({name: 'response_body', type: 'json', nullable: true, comment: '응답 body'})
    response_body: any;

    @Column({name: 'error_stack', type: 'text', nullable: true, comment: 'unhandled 예외의 stack trace'})
    error_stack: string | null;

    @Column({name: 'user_id', type: 'varchar', length: 36, nullable: true, comment: '인증된 사용자 ID (JWT)'})
    user_id: string | null;

    @Column({name: 'ip', type: 'varchar', length: 45, nullable: true, comment: '클라이언트 IP'})
    ip: string | null;

    @Column({name: 'user_agent', type: 'varchar', length: 500, nullable: true, comment: 'User-Agent'})
    user_agent: string | null;

    @Column({name: 'duration_ms', type: 'int', nullable: false, comment: '처리 시간 (ms)'})
    duration_ms: number;

    @BeforeInsert()
    insertTimestamp() {
        if (!this.create_at) this.create_at = new Date();
    }
}
