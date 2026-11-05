import {Module} from '@nestjs/common';
import {DiscoveryController} from './controllers/discovery.controller.js';

/**
 * 게이트웨이 업체 둘러보기 라우트 — `/api/v1/user-service/discovery`. 동기 경로만(DiscoveryController — 로그인 없음), 큐 경로는 없다. 전달 수단(TransportModule)은 전역이다.
 */
@Module({controllers: [DiscoveryController]})
export class DiscoveryModule {}
