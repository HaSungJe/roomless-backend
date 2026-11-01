import {Global, Module} from '@nestjs/common';
import {RedisConnection} from './redis.connection.js';

/**
 * Redis 연결(RedisConnection) — 앱마다 1개. 전역이라 Redis 를 쓰는 포트 모듈(DoorStoreModule)이 import 해 같은 연결을 나눠 쓴다.
 */
@Global()
@Module({providers: [RedisConnection], exports: [RedisConnection]})
export class RedisModule {}
