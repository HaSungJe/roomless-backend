import {MiddlewareConsumer, Module, NestModule} from '@nestjs/common';
import {DoorStoreModule} from '@app/integration/door/door-store.module.js';
import {MessagingModule} from '@app/messaging/messaging.module.js';
import {PassportJwtAuthModule} from './guards/passport.jwt.auth/passport.jwt.auth.module.js';
import {ApiLogMiddleware} from './modules/api-log/api-log.middleware.js';
import {ApiLogModule} from './modules/api-log/api-log.module.js';
import {DoorSocketModule} from './modules/door-socket/door-socket.module.js';
import {TransportModule} from './modules/transport/transport.module.js';
import {AdminModule} from './api/v1/admin-service/admin/admin.module.js';
import {ManagerModule} from './api/v1/admin-service/manager/manager.module.js';
import {ReservationModule as AdminReservationModule} from './api/v1/admin-service/reservation/reservation.module.js';
import {RoomModule} from './api/v1/admin-service/room/room.module.js';
import {StatsModule} from './api/v1/admin-service/stats/stats.module.js';
import {StoreModule} from './api/v1/admin-service/store/store.module.js';
import {UserModule as AdminUserModule} from './api/v1/admin-service/user/user.module.js';
import {DiscoveryModule} from './api/v1/user-service/discovery/discovery.module.js';
import {ReservationModule} from './api/v1/user-service/reservation/reservation.module.js';
import {StoreModule as UserStoreModule} from './api/v1/user-service/store/store.module.js';
import {UserModule} from './api/v1/user-service/user/user.module.js';

/**
 * 게이트웨이 루트 모듈 — 유일한 외부 진입점.
 * DB 는 API 로그 적재에만 쓴다(로그 전용 연결 — t_api_log 만). 회원 상태 확인도 user-service 내부 HTTP 로 묻는다. Redis 는 문 명령 구독에만 쓴다.
 * - MessagingModule.forGateway: 명령 발행 + 인스턴스 전용 결과 큐
 * - TransportModule: 동기(내부 HTTP) · 큐(RabbitMQ + SSE) 전달 수단
 * - DoorStoreModule: 문 정보 포트(DOOR_STORE, Redis) — 문 소켓이 바로 열기 명령(door-commands)을 구독한다
 * - PassportJwtAuthModule: JWT 전략 (guards/)
 * - 로그인 그룹별 라우트: UserModule(/api/v1/user-service/user) · ManagerModule(/api/v1/admin-service/manager) · AdminModule(/api/v1/admin-service/admin) · StoreModule(/api/v1/admin-service/store — 관리자 · 매니저 가드) · RoomModule(/api/v1/admin-service/room — 매니저 가드)
 * - 예약 라우트: ReservationModule(/api/v1/user-service/reservation — 예약 가능 시간은 가드 없음, 내 예약 · 내 예약 QR · 예약 쓰기는 이용자 가드) · AdminReservationModule(/api/v1/admin-service/reservation — 업체 현황 · 업체 취소 · 호실 이동, 매니저 가드)
 * - 입점 신청 라우트: UserStoreModule(/api/v1/user-service/store — 이용자 가드, 신청 · 취소 · 업체 정보 파일 · 내 신청)
 * - 이용자 관리 라우트: AdminUserModule(/api/v1/admin-service/user — 관리자 가드, 목록 · 상세 · 예약 이력 · 이용 제한 · 해제)
 * - 통계 라우트: StatsModule(/api/v1/admin-service/stats — 전체 · 업체별은 관리자 가드, /mine 내 업체는 매니저 가드)
 * - 같은 이름 도메인이 서비스마다 있으면(행위자별 서버 — 사용자 결정 2026-11-07) 별칭으로 들인다
 * - 업체 둘러보기 라우트: DiscoveryModule(/api/v1/user-service/discovery — 가드 없음, 반경 업체 · 업체 상세 · 객실 그룹 목록)
 * - DoorSocketModule: 문 소켓(`/ws/v1/door` — 업체 ID + 시크릿, 표준 WebSocket) — QR 확인 · 잠금 알림 · 바로 열기 명령
 * - ApiLogModule: API 로그 — 모든 HTTP 요청(가드보다 먼저 거는 미들웨어)을 응답이 끝난 뒤 로그 전용 연결로 t_api_log 에 넣는다(Swagger 문서 제외)
 */
@Module({
    imports: [
        MessagingModule.forGateway(),
        TransportModule,
        DoorStoreModule,
        PassportJwtAuthModule,
        ApiLogModule,
        UserModule,
        ManagerModule,
        AdminModule,
        StoreModule,
        RoomModule,
        ReservationModule,
        AdminReservationModule,
        UserStoreModule,
        DiscoveryModule,
        AdminUserModule,
        StatsModule,
        DoorSocketModule,
    ],
})
export class GatewayModule implements NestModule {
    /**
     * 모든 HTTP 요청에 API 로그 기록 미들웨어를 건다(가드보다 먼저 — 401 · 404 도 남는다).
     *
     * @param consumer 미들웨어 등록기
     */
    configure(consumer: MiddlewareConsumer): void {
        consumer.apply(ApiLogMiddleware).forRoutes('*');
    }
}
