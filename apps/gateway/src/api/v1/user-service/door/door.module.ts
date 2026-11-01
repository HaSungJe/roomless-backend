import {Module} from '@nestjs/common';
import {DoorController} from './controllers/door.controller.js';

/**
 * 게이트웨이 문 라우트 — `/api/v1/user-service/door`. 동기 경로만(DoorController — 내부 HTTP), 큐 경로는 없다.
 * 로그인 가드가 없다 — 문 쪽 타 업체 프로그램이 부르고 QR 자체가 열쇠다. 전달 수단(TransportModule)은 전역이다.
 */
@Module({controllers: [DoorController]})
export class DoorModule {}
