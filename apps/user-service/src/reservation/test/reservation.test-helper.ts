import {BadRequestException, INestApplication, Type, ValidationPipe} from '@nestjs/common';
import {APP_GUARD, APP_INTERCEPTOR, DiscoveryModule} from '@nestjs/core';
import {Test, TestingModule} from '@nestjs/testing';
import type {Mock} from 'vitest';
import {CustomErrorFilter} from '@app/common/exception/custom-error.filter.js';
import {ReturnedExceptionInterceptor} from '@app/common/exception/returned-exception.interceptor.js';
import {InternalAuthGuard} from '@app/common/internal/internal-auth.guard.js';
import {validationExceptionFactory} from '@app/common/utils/validation.js';
import type {Actor} from '@app/contracts/actor.js';
import {INTERNAL_HEADER} from '@app/contracts/actor.js';
import type {MessageEnvelope, ResultPayload} from '@app/contracts/message-envelope.js';
import {DOOR_STORE, PAYMENT_GATEWAY} from '@app/integration/integration.symbols.js';
import type {PaymentLookupResult} from '@app/integration/interfaces/integration.interface.js';
import {CommandHandlerRegistry} from '@app/messaging/command-handler.registry.js';
import {CommandDispatcher, DispatchDecision} from '@app/messaging/command.dispatcher.js';
import {buildCommandEnvelope, encodeEnvelope} from '@app/messaging/messaging.util.js';
import {ReservationController} from '../controllers/reservation.controller.js';
import {ReservationQueueController} from '../controllers/reservation.controller.queue.js';
import type {ReservationRepositoryInterface} from '../interfaces/reservation.repository.interface.js';
import {ReservationService} from '../reservation.service.js';
import {RESERVATION_REPOSITORY} from '../reservation.symbols.js';

/** 결과 큐 이름 */
export const TEST_REPLY_TO = 'gw-test';

/** 테스트용 내부 요청 비밀값 */
export const TEST_INTERNAL_TOKEN = 'test-internal-token';

/** 지금 — 2026-11-03(화) 09:00 한국 시각 */
export const NOW = new Date('2026-11-03T00:00:00Z');

/** 32자 hex ID 형식 */
export const ID_PATTERN = /^[a-f0-9]{32}$/;

/** 이용자 · 매니저 actor */
export const USER_ACTOR: Actor = {user_id: 'a'.repeat(32), auth_id: 'USER'};

/** 업체 · 그룹 · 호실 · 그룹 상품 · 예약 · 결제 · 구간 ID */
export const STORE_ID = 'b'.repeat(32);
export const ROOM_GROUP_ID = 'c'.repeat(32);
export const ROOM_ID = 'd'.repeat(32);
export const ROOM_ID_2 = 'e'.repeat(32);
export const ROOM_GROUP_PLAN_ID = 'f'.repeat(32);
export const RESERVATION_ID = '1'.repeat(32);
export const PAYMENT_ID = '2'.repeat(32);
export const DETAIL_ID = '3'.repeat(32);

/** 호실 QR ID */
export const ROOM_QR_ID = '4'.repeat(32);

/** QR 정보 */
export const QR = '5'.repeat(32);

/** 토스 결제 키 */
export const PAYMENT_KEY = 'tgen_20261103000000abcde';

/** 예약 repository mock */
export type ReservationRepositoryMock = {[K in keyof ReservationRepositoryInterface]: Mock};

/** 결제 포트 mock */
export type PaymentGatewayMock = {environment: Mock; getPayment: Mock; findByPaymentId: Mock; cancel: Mock};

/** 문 정보 포트 mock — 이 도메인은 현재 QR 쓰기 · 지우기만 쓴다 */
export type DoorStoreMock = {setQr: Mock; revokeQr: Mock};

/**
 * 예약 repository mock — 포트 메서드마다 vi.fn(), 목록은 빈 배열 · 쓰기는 성공 기본값
 *
 * @returns mock
 */
export function createReservationRepositoryMock(): ReservationRepositoryMock {
    return {
        findReservationStore: vi.fn().mockResolvedValue(storeEntity()),
        findReservationRoom: vi.fn().mockResolvedValue(roomEntity()),
        findReservationRoomGroup: vi.fn().mockResolvedValue({room_group_id: ROOM_GROUP_ID, store_id: STORE_ID, room_group_name: '스탠다드', is_deleted: 0}),
        findBookableRooms: vi.fn().mockResolvedValue([bookableRoom()]),
        findStorePlan: vi.fn().mockResolvedValue(planEntity('HOURLY')),
        findGroupPlans: vi.fn().mockResolvedValue([groupPlanEntity('HOURLY')]),
        findGroupPlanPrices: vi.fn().mockResolvedValue([]),
        findStoreHours: vi.fn().mockResolvedValue(everyDayHours('10:00:00', '22:00:00')),
        findStoreBreaks: vi.fn().mockResolvedValue([]),
        findUnavailablePeriods: vi.fn().mockResolvedValue([]),
        findReservations: vi.fn().mockResolvedValue([]),
        countRecentExpired: vi.fn().mockResolvedValue(0),
        findReservation: vi.fn().mockResolvedValue(reservationEntity()),
        findReservationDetails: vi.fn().mockResolvedValue([detailEntity()]),
        findPayment: vi.fn().mockResolvedValue(paymentEntity()),
        insertPayment: vi.fn(),
        insertReservation: vi.fn(),
        insertReservationDetail: vi.fn(),
        updateReservation: vi.fn().mockResolvedValue(true),
        updateReservationDetails: vi.fn(),
        updatePayment: vi.fn().mockResolvedValue(true),
        countReservations: vi.fn().mockResolvedValue(0),
        findMyReservationRows: vi.fn().mockResolvedValue([]),
        findMyReservationRow: vi.fn().mockResolvedValue(null),
        findReservationSegmentRows: vi.fn().mockResolvedValue([]),
        findRoomQr: vi.fn().mockResolvedValue(null),
        insertRoomQr: vi.fn(),
    };
}

/**
 * 결제 포트 mock — 테스트 키(TEST), 조회 기본값은 결제됨
 *
 * @returns mock
 */
export function createPaymentGatewayMock(): PaymentGatewayMock {
    return {environment: vi.fn().mockReturnValue('TEST'), getPayment: vi.fn().mockResolvedValue(tossLookup()), findByPaymentId: vi.fn().mockResolvedValue(tossLookup()), cancel: vi.fn()};
}

/**
 * 문 정보 포트 mock — 현재 QR 쓰기 · 지우기는 성공
 *
 * @returns mock
 */
export function createDoorStoreMock(): DoorStoreMock {
    return {setQr: vi.fn().mockResolvedValue(undefined), revokeQr: vi.fn().mockResolvedValue(undefined)};
}

/**
 * 큐 경로 부팅 — 실제 ReservationQueueController · ReservationService · CommandHandlerRegistry · CommandDispatcher, repository · 결제 · 문 정보 포트만 mock.
 *
 * @param repo repository mock
 * @param payment 결제 포트 mock
 * @param door 문 정보 포트 mock
 * @returns dispatcher · module
 */
export async function bootCommandPath(
    repo: ReservationRepositoryMock,
    payment: PaymentGatewayMock = createPaymentGatewayMock(),
    door: DoorStoreMock = createDoorStoreMock(),
): Promise<{dispatcher: CommandDispatcher; module: TestingModule}> {
    const module = await Test.createTestingModule({
        imports: [DiscoveryModule],
        providers: [
            ReservationService,
            ReservationQueueController,
            CommandHandlerRegistry,
            CommandDispatcher,
            {provide: RESERVATION_REPOSITORY, useValue: repo},
            {provide: PAYMENT_GATEWAY, useValue: payment},
            {provide: DOOR_STORE, useValue: door},
        ],
    }).compile();
    await module.init();
    return {dispatcher: module.get(CommandDispatcher), module};
}

/**
 * 동기 경로 부팅 — 실제 ReservationController + ReservationService + ValidationPipe + 필터 + 전역 InternalAuthGuard · ReturnedExceptionInterceptor.
 *
 * @param repo repository mock
 * @param door 문 정보 포트 mock
 * @returns Nest 앱
 */
export async function bootHttpPath(repo: ReservationRepositoryMock, door: DoorStoreMock = createDoorStoreMock()): Promise<INestApplication> {
    process.env.INTERNAL_API_TOKEN = TEST_INTERNAL_TOKEN;
    const module = await Test.createTestingModule({
        controllers: [ReservationController],
        providers: [
            ReservationService,
            {provide: RESERVATION_REPOSITORY, useValue: repo},
            {provide: PAYMENT_GATEWAY, useValue: createPaymentGatewayMock()},
            {provide: DOOR_STORE, useValue: door},
            {provide: APP_GUARD, useClass: InternalAuthGuard},
            {provide: APP_INTERCEPTOR, useClass: ReturnedExceptionInterceptor},
        ],
    }).compile();
    const app = module.createNestApplication();
    app.useGlobalFilters(new CustomErrorFilter());
    app.useGlobalPipes(new ValidationPipe({transform: true, forbidNonWhitelisted: true, exceptionFactory: validationExceptionFactory}));
    await app.init();
    return app;
}

/**
 * 게이트웨이가 붙이는 내부 요청 헤더
 *
 * @param actor 로그인 회원(없으면 인증 없음)
 * @returns 헤더
 */
export function internalHeaders(actor: Actor | null = null): Record<string, string> {
    const headers: Record<string, string> = {[INTERNAL_HEADER.TOKEN]: TEST_INTERNAL_TOKEN, [INTERNAL_HEADER.CLIENT_IP]: '10.0.0.1'};
    if (actor) {
        headers[INTERNAL_HEADER.ACTOR_USER_ID] = actor.user_id;
        headers[INTERNAL_HEADER.ACTOR_AUTH_ID] = actor.auth_id;
    }
    return headers;
}

/**
 * 명령 1건을 디스패처에 넣는다.
 *
 * @param dispatcher 디스패처
 * @param params 종류 · payload · actor
 * @returns 판정 · 봉투 · 결과
 */
export async function runCommand(
    dispatcher: CommandDispatcher,
    params: {type: string; payload: unknown; actor?: Actor | null; delivery_count?: number},
): Promise<{decision: DispatchDecision; command: MessageEnvelope<unknown>; result: ResultPayload<unknown> | null}> {
    const command = buildCommandEnvelope({type: params.type, actor: params.actor ?? null, payload: params.payload, reply_to: TEST_REPLY_TO, client_ip: '10.0.0.1'});
    const decision = await dispatcher.dispatch(encodeEnvelope(command), params.delivery_count ?? 0);
    return {decision, command, result: decision.result?.payload ?? null};
}

/**
 * 게이트웨이 ValidationPipe 로 본문(또는 쿼리 · path param)을 검증한다.
 *
 * @param metatype DTO 클래스
 * @param body 입력
 * @returns 실패 본문 또는 null
 */
export async function validateBody(metatype: Type<unknown>, body: unknown): Promise<Record<string, unknown> | null> {
    const pipe = new ValidationPipe({transform: true, forbidNonWhitelisted: true, exceptionFactory: validationExceptionFactory});
    try {
        await pipe.transform(body, {type: 'body', metatype});
        return null;
    } catch (error) {
        return (error as BadRequestException).getResponse() as Record<string, unknown>;
    }
}

/**
 * 업체 — 활성 · 영업중 · 영업시간 사용 · 정비 30분 · 예약 72시간 전부터 · 환불 마감 60분 · 마감 뒤 50%
 *
 * @param override 바꿀 필드
 * @returns 업체 엔티티 모양
 */
export function storeEntity(override: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        store_id: STORE_ID,
        store_state_id: 'ACTIVE',
        store_name: '루미 강남점',
        is_always_open: 0,
        is_open: 1,
        maintenance_minutes: 30,
        booking_open_hours: 72,
        refund_deadline_minutes: 60,
        late_refund_percent: 50,
        is_deleted: 0,
        ...override,
    };
}

/**
 * 호실 — 예약가능
 *
 * @param override 바꿀 필드
 * @returns 호실 엔티티 모양
 */
export function roomEntity(override: Record<string, unknown> = {}): Record<string, unknown> {
    return {room_id: ROOM_ID, store_id: STORE_ID, room_group_id: ROOM_GROUP_ID, room_name: '101호', floor: 1, room_state_id: 'AVAILABLE', is_deleted: 0, ...override};
}

/**
 * 예약 가능 호실 행
 *
 * @param override 바꿀 필드
 * @returns 행
 */
export function bookableRoom(override: Record<string, unknown> = {}): Record<string, unknown> {
    return {room_id: ROOM_ID, room_name: '101호', floor: 1, room_state_id: 'AVAILABLE', room_group_id: ROOM_GROUP_ID, room_group_name: '스탠다드', ...override};
}

/**
 * 업체 상품 설정 — 종류별 기본(시간 이용 3시간 · 1박 22:00 → 09:00 · 연박 15:00 → 11:00 · 1 ~ 30박), 매일
 *
 * @param room_plan_type_id 상품 종류
 * @param override 바꿀 필드
 * @returns 상품 설정 엔티티 모양
 */
export function planEntity(room_plan_type_id: string, override: Record<string, unknown> = {}): Record<string, unknown> {
    const byType: Record<string, Record<string, unknown>> = {
        HOURLY: {usage_hours: 3, check_in_time: null, check_out_time: null, min_nights: null, max_nights: null},
        NIGHT: {usage_hours: null, check_in_time: '22:00:00', check_out_time: '09:00:00', min_nights: null, max_nights: null},
        LONG: {usage_hours: null, check_in_time: '15:00:00', check_out_time: '11:00:00', min_nights: 1, max_nights: 30},
    };
    return {room_plan_id: '9'.repeat(32), store_id: STORE_ID, room_plan_type_id, is_used: 1, days_of_week: 127, ...byType[room_plan_type_id], ...override};
}

/**
 * 그룹 상품 — 판매 · 30,000원
 *
 * @param room_plan_type_id 상품 종류
 * @param override 바꿀 필드
 * @returns 그룹 상품 엔티티 모양
 */
export function groupPlanEntity(room_plan_type_id: string, override: Record<string, unknown> = {}): Record<string, unknown> {
    return {room_group_plan_id: ROOM_GROUP_PLAN_ID, room_group_id: ROOM_GROUP_ID, room_plan_type_id, is_used: 1, price: 30000, ...override};
}

/**
 * 매일 같은 영업시간(일 ~ 토 7행)
 *
 * @param open_time 여는 시각
 * @param close_time 닫는 시각
 * @returns 영업시간 행
 */
export function everyDayHours(open_time: string, close_time: string): Record<string, unknown>[] {
    return [0, 1, 2, 3, 4, 5, 6].map((day_of_week) => ({store_id: STORE_ID, day_of_week, is_closed: 0, open_time, close_time, is_deleted: 0}));
}

/**
 * 예약 — 확정, 2026-11-10 13:00 ~ 16:00(한국 시각), 환불 마감 12:00, 30,000원
 *
 * @param override 바꿀 필드
 * @returns 예약 엔티티 모양
 */
export function reservationEntity(override: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        reservation_id: RESERVATION_ID,
        user_id: USER_ACTOR.user_id,
        store_id: STORE_ID,
        room_id: ROOM_ID,
        room_plan_type_id: 'HOURLY',
        reservation_state_id: 'CONFIRMED',
        start_at: new Date('2026-11-10T04:00:00Z'),
        end_at: new Date('2026-11-10T07:00:00Z'),
        maintenance_minutes: 30,
        blocked_until: new Date('2026-11-10T07:30:00Z'),
        total_price: 30000,
        refund_deadline_at: new Date('2026-11-10T03:00:00Z'),
        late_refund_percent: 50,
        checked_in_at: null,
        completed_at: null,
        canceled_at: null,
        cancel_actor: null,
        cancel_reason: null,
        ...override,
    };
}

/**
 * 결제 — 확정(DONE), 30,000원
 *
 * @param override 바꿀 필드
 * @returns 결제 엔티티 모양
 */
export function paymentEntity(override: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        payment_id: PAYMENT_ID,
        user_id: USER_ACTOR.user_id,
        payment_state_id: 'DONE',
        environment: 'TEST',
        order_name: '루미 강남점 101호 시간 이용',
        amount: 30000,
        payment_key: PAYMENT_KEY,
        method: '카드',
        approved_at: new Date('2026-11-03T00:01:00Z'),
        receipt_url: 'https://receipt.test/1',
        refund_amount: null,
        refund_reason: null,
        refund_requested_at: null,
        refunded_at: null,
        failure_code: null,
        failure_message: null,
        ...override,
    };
}

/**
 * 기본 구간 — 확정, 결제 1건
 *
 * @param override 바꿀 필드
 * @returns 구간 엔티티 모양
 */
export function detailEntity(override: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        reservation_detail_id: DETAIL_ID,
        reservation_id: RESERVATION_ID,
        reservation_detail_type_id: 'BASE',
        room_plan_type_id: 'HOURLY',
        reservation_state_id: 'CONFIRMED',
        payment_id: PAYMENT_ID,
        start_at: new Date('2026-11-10T04:00:00Z'),
        end_at: new Date('2026-11-10T07:00:00Z'),
        price: 30000,
        expires_at: new Date('2026-11-03T00:05:00Z'),
        ...override,
    };
}

/**
 * 토스 조회 결과 — 승인 완료 · 우리 결제 ID · 30,000원
 *
 * @param override 바꿀 필드
 * @returns 조회 결과
 */
export function tossLookup(override: Partial<PaymentLookupResult> = {}): PaymentLookupResult {
    return {
        payment_key: PAYMENT_KEY,
        order_id: PAYMENT_ID,
        status: 'DONE',
        total_amount: 30000,
        method: '카드',
        approved_at: new Date('2026-11-03T00:01:00Z'),
        receipt_url: 'https://receipt.test/1',
        ...override,
    };
}
/**
 * 내 예약 목록 · 상세 행 — 확정, 2026-11-10 13:00 ~ 16:00
 *
 * @returns 행
 */
export function listRow(): Record<string, unknown> {
    return {
        reservation_id: RESERVATION_ID,
        store_id: STORE_ID,
        store_name: '루미 강남점',
        room_id: ROOM_ID,
        room_name: '101호',
        room_group_name: '스탠다드',
        room_plan_type_id: 'HOURLY',
        room_plan_type_name: '시간 이용',
        reservation_state_id: 'CONFIRMED',
        reservation_state_name: '예약 확정',
        start_at: new Date('2026-11-10T04:00:00Z'),
        end_at: new Date('2026-11-10T07:00:00Z'),
        total_price: 30000,
        refund_deadline_at: new Date('2026-11-10T03:00:00Z'),
        late_refund_percent: 50,
        canceled_at: null,
        cancel_actor: null,
        cancel_reason: null,
        created_at: new Date('2026-11-03T00:00:00Z'),
    };
}

/**
 * 호실 QR — 예약 이용 구간(2026-11-10 13:00 ~ 16:00 한국 시각) 동안 유효
 *
 * @param override 바꿀 필드
 * @returns QR 엔티티 모양
 */
export function roomQrEntity(override: Record<string, unknown> = {}): Record<string, unknown> {
    return {room_qr_id: ROOM_QR_ID, room_id: ROOM_ID, reservation_id: RESERVATION_ID, qr: QR, starts_at: new Date('2026-11-10T04:00:00Z'), ends_at: new Date('2026-11-10T07:00:00Z'), ...override};
}
