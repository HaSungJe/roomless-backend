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
import {SMS_SENDER} from '@app/integration/integration.symbols.js';
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

/** 이용자(예약자) · 매니저 actor */
export const USER_ACTOR: Actor = {user_id: 'a'.repeat(32), auth_id: 'USER'};
export const MANAGER_ACTOR: Actor = {user_id: 'm'.repeat(32), auth_id: 'MANAGER'};

/** 업체 · 그룹 · 호실 · 예약 · 결제 · 구간 ID */
export const STORE_ID = 'b'.repeat(32);
export const ROOM_GROUP_ID = 'c'.repeat(32);
export const ROOM_ID = 'd'.repeat(32);
export const ROOM_ID_2 = 'e'.repeat(32);
export const RESERVATION_ID = '1'.repeat(32);
export const PAYMENT_ID = '2'.repeat(32);
export const DETAIL_ID = '3'.repeat(32);

/** 이용 중 취소 요청 ID */
export const CANCEL_REQUEST_ID = '6'.repeat(32);

/** repository mock 모양 — 포트 메서드마다 vi.fn() */
export type ReservationRepositoryMock = {[K in keyof ReservationRepositoryInterface]: Mock};

/** SMS 포트 mock */
export type SmsSenderMock = {send: Mock};

/**
 * 예약 repository mock (매니저 예약) — 매니저의 소속 업체는 활성 업체, 예약자 연락처는 인증된 번호, 쓰기는 성공 기본값
 *
 * @returns mock
 */
export function createReservationRepositoryMock(): ReservationRepositoryMock {
    return {
        findManagerStore: vi.fn().mockResolvedValue(storeEntity()),
        findReservationUser: vi.fn().mockResolvedValue({user_id: USER_ACTOR.user_id, name: '김이용', phone: '01012345678'}),
        findReservationStore: vi.fn().mockResolvedValue(storeEntity()),
        findReservationRoom: vi.fn().mockResolvedValue(roomEntity()),
        findReservation: vi.fn().mockResolvedValue(reservationEntity()),
        findReservationDetails: vi.fn().mockResolvedValue([detailEntity()]),
        updateReservation: vi.fn().mockResolvedValue(true),
        changeReservationRoom: vi.fn().mockResolvedValue(true),
        updateReservationDetails: vi.fn(),
        updatePayment: vi.fn().mockResolvedValue(true),
        findStoreRoomRows: vi.fn().mockResolvedValue([]),
        findStoreReservationRows: vi.fn().mockResolvedValue([]),
        expireCancelRequests: vi.fn(),
        insertCancelRequest: vi.fn(),
    };
}

/**
 * SMS 포트 mock
 *
 * @returns mock
 */
export function createSmsSenderMock(): SmsSenderMock {
    return {send: vi.fn().mockResolvedValue(undefined)};
}

/**
 * 큐 경로 부팅 — 실제 ReservationQueueController · ReservationService · CommandHandlerRegistry · CommandDispatcher, repository · SMS 포트만 mock.
 * registry 가 @OnCommand 를 찾도록 DiscoveryModule + module.init() 이 필수다.
 *
 * @param repo repository mock
 * @param sms SMS 포트 mock
 * @returns dispatcher · module
 */
export async function bootCommandPath(repo: ReservationRepositoryMock, sms: SmsSenderMock = createSmsSenderMock()): Promise<{dispatcher: CommandDispatcher; module: TestingModule}> {
    const module = await Test.createTestingModule({
        imports: [DiscoveryModule],
        providers: [ReservationService, ReservationQueueController, CommandHandlerRegistry, CommandDispatcher, {provide: RESERVATION_REPOSITORY, useValue: repo}, {provide: SMS_SENDER, useValue: sms}],
    }).compile();
    await module.init();
    return {dispatcher: module.get(CommandDispatcher), module};
}

/**
 * 동기 경로 부팅 — 실제 ReservationController + ReservationService + ValidationPipe + 필터 + 전역 InternalAuthGuard · ReturnedExceptionInterceptor(admin-service.module 과 같다).
 *
 * @param repo repository mock
 * @returns Nest 앱
 */
export async function bootHttpPath(repo: ReservationRepositoryMock): Promise<INestApplication> {
    process.env.INTERNAL_API_TOKEN = TEST_INTERNAL_TOKEN;
    const module = await Test.createTestingModule({
        controllers: [ReservationController],
        providers: [
            ReservationService,
            {provide: RESERVATION_REPOSITORY, useValue: repo},
            {provide: SMS_SENDER, useValue: createSmsSenderMock()},
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
        qr_link_sent_at: null,
        canceled_at: null,
        cancel_actor: null,
        cancel_reason: null,
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
 * 업체 현황 예약 행 — 확정, 2026-11-10 13:00 ~ 16:00, 취소 요청 없음
 *
 * @param override 바꿀 필드
 * @returns 행
 */
export function storeReservationRow(override: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        reservation_id: RESERVATION_ID,
        room_id: ROOM_ID,
        reservation_state_id: 'CONFIRMED',
        reservation_state_name: '예약 확정',
        room_plan_type_id: 'HOURLY',
        room_plan_type_name: '시간 이용',
        start_at: new Date('2026-11-10T04:00:00Z'),
        end_at: new Date('2026-11-10T07:00:00Z'),
        blocked_until: new Date('2026-11-10T07:30:00Z'),
        total_price: 30000,
        user_name: '김이용',
        user_phone: '01012345678',
        cancel_request_state_id: null,
        cancel_request_expires_at: null,
        cancel_request_created_at: null,
        ...override,
    };
}
