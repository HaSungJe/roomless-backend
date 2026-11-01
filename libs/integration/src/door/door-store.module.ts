import {Global, Module} from '@nestjs/common';
import {DOOR_STORE} from '../integration.symbols.js';
import {RedisModule} from '../redis/redis.module.js';
import {RedisDoorStore} from './redis-door.store.js';

/**
 * 문 정보 포트(DOOR_STORE) — Redis. Redis 연결(RedisModule)을 함께 가져온다.
 * 문 정보를 쓰는 앱의 루트 모듈에서 import 한다(전역 — 도메인 모듈은 import 없이 `@Inject(DOOR_STORE)` 로 주입받는다).
 */
@Global()
@Module({imports: [RedisModule], providers: [{provide: DOOR_STORE, useClass: RedisDoorStore}], exports: [DOOR_STORE]})
export class DoorStoreModule {}
