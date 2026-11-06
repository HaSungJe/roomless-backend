import {Module} from '@nestjs/common';
import {DoorController} from './controllers/door.controller.js';
import {DoorService} from './door.service.js';
import {DOOR_REPOSITORY} from './door.symbols.js';
import {DoorRepository} from './repositories/door.repository.js';

/**
 * 문 도메인 — gateway 문 소켓의 접속 확인 · QR 확인 · 잠금 알림(내부 HTTP 만 — 큐 경로 없음). 문 정보 포트(DOOR_STORE — Redis)는 루트 모듈의 DoorStoreModule 이 전역으로 준다.
 * - DoorController(controllers/door.controller.ts): 내부 HTTP — snapshot · verify · close
 */
@Module({controllers: [DoorController], providers: [DoorService, {provide: DOOR_REPOSITORY, useClass: DoorRepository}]})
export class DoorModule {}
