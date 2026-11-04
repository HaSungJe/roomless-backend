import {Module} from '@nestjs/common';
import {DoorSocketServer} from './door-socket.server.js';

/**
 * 문 소켓(`/ws/v1/door`) — 업체 단위 표준 WebSocket. 전달 수단(TransportModule — InternalHttpClient)과 문 정보 포트(DoorStoreModule — 명령 구독)는 전역이다.
 */
@Module({providers: [DoorSocketServer]})
export class DoorSocketModule {}
