import {Global, Module} from '@nestjs/common';
import {DOOR_STORE} from '../integration.symbols.js';
import {RedisModule} from '../redis/redis.module.js';
import {RedisDoorStore} from './redis-door.store.js';

/**
 * 문 정보 포트(DOOR_STORE) — Redis(문 상태 · 현재 QR · 명령 채널). Redis 연결(RedisModule)을 함께 가져온다.
 * 쓰는 앱의 루트 모듈에서 import 한다 — user-service(문 소켓 접속 · QR 확인 · 잠금 · QR 발급) · admin-service(호실 목록 · 바로 열기 · 업체 취소 때 QR 지우기) · scheduler(QR 맞추기) · gateway(명령 구독).
 * 전역 — 도메인 모듈 · 인프라 모듈은 import 없이 `@Inject(DOOR_STORE)` 로 주입받는다.
 */
@Global()
@Module({imports: [RedisModule], providers: [{provide: DOOR_STORE, useClass: RedisDoorStore}], exports: [DOOR_STORE]})
export class DoorStoreModule {}
