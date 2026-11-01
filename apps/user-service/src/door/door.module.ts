import {Module} from '@nestjs/common';
import {DoorController} from './controllers/door.controller.js';
import {DoorRepository} from './repositories/door.repository.js';
import {DoorService} from './door.service.js';
import {DOOR_REPOSITORY} from './door.symbols.js';

/**
 * 문 도메인 — 내부 HTTP(게이트웨이 동기 경로)만 있다. 문 정보 포트(DOOR_STORE)는 루트 모듈의 DoorStoreModule 이 전역으로 준다.
 * - DoorController(controllers/door.controller.ts): 문 열기 · 닫기
 */
@Module({controllers: [DoorController], providers: [DoorService, {provide: DOOR_REPOSITORY, useClass: DoorRepository}]})
export class DoorModule {}
