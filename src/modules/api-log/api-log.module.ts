import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { API_LOG_DATASOURCE_NAME, API_LOG_POOL_SIZE } from './api-log.constants';
import { ApiLogEntity } from './api-log.entity';
import { ApiLogInterceptor } from './api-log.interceptor';
import { ApiLogPartitionService } from './api-log.partition.service';
import { ApiLogRepository } from './api-log.repository';
import { API_LOG_REPOSITORY } from './api-log.symbols';

/**
 * 모든 API 호출을 자동 로깅하는 인프라 모듈.
 *
 * 비즈니스 쿼리와 격리하기 위해 **별도 DataSource (name: 'apiLog')** 를 등록.
 * - 비즈니스 connection pool 과 분리 → 로그 INSERT 가 비즈니스 응답 시간에 영향 0
 * - 같은 MySQL 서버를 가리키지만 connection pool 만 별도
 * - ApiLogEntity 는 이 DataSource 만 사용 (default DataSource 에는 등록되지 않음)
 *
 * 컴포넌트:
 * - Interceptor: main.ts 에서 `app.useGlobalInterceptors(app.get(ApiLogInterceptor))` 로 활성화
 * - Repository: 토큰(API_LOG_REPOSITORY) 으로 주입
 * - Partition: ApiLogPartitionService 가 부팅 + 매월 자동 관리
 */
@Global()
@Module({
    imports: [
        TypeOrmModule.forRootAsync({
            name: API_LOG_DATASOURCE_NAME,
            useFactory: () => ({
                type: 'mysql',
                name: API_LOG_DATASOURCE_NAME,
                host: process.env.MYSQL_HOST,
                port: parseInt(process.env.MYSQL_PORT || '3306'),
                database: process.env.MYSQL_DB,
                username: process.env.MYSQL_ID,
                password: process.env.MYSQL_PW,
                entities: [ApiLogEntity],
                synchronize: process.env.TYPEORM_SYNC === 'T',
                logging: false,
                extra: {
                    connectionLimit: API_LOG_POOL_SIZE,
                },
            }),
        }),
        TypeOrmModule.forFeature([ApiLogEntity], API_LOG_DATASOURCE_NAME),
    ],
    providers: [
        ApiLogInterceptor,
        ApiLogPartitionService,
        {provide: API_LOG_REPOSITORY, useClass: ApiLogRepository},
    ],
    exports: [
        ApiLogInterceptor,
    ],
})
export class ApiLogModule {}
