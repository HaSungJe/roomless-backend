/**
 * API 로그 보존 기간 (월 단위)
 * 이 값을 초과한 파티션은 매월 1일 00:00 자동 DROP 됩니다.
 */
export const API_LOG_RETENTION_MONTHS = 24;

/**
 * 부팅 및 매월 cron 시점에 미리 보장해두는 향후 파티션 개수.
 * pmax 에 데이터가 들어가지 않도록 충분히 앞서서 만들어 둡니다.
 */
export const API_LOG_AHEAD_PARTITIONS = 3;

/**
 * 파티션 작업 시 사용하는 MySQL advisory lock 이름.
 * 멀티 인스턴스 환경에서 한 인스턴스만 작업하도록 보장합니다.
 */
export const API_LOG_PARTITION_LOCK = 'api_log_partition_lock';

/**
 * 비즈니스 쿼리와 격리하기 위한 API 로그 전용 DataSource 이름.
 * TypeOrmModule.forRoot({name}) / @InjectRepository(Entity, name) 에서 사용.
 */
export const API_LOG_DATASOURCE_NAME = 'apiLog';

/**
 * API 로그 전용 DataSource 의 connection pool 크기.
 * 비즈니스 pool 과 완전히 분리되므로 로그 INSERT 가 비즈니스 응답 시간에 영향 0.
 */
export const API_LOG_POOL_SIZE = 5;
