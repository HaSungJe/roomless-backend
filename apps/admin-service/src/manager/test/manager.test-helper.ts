import {INestApplication, ValidationPipe} from '@nestjs/common';
import {APP_GUARD, APP_INTERCEPTOR, DiscoveryModule} from '@nestjs/core';
import {JwtService} from '@nestjs/jwt';
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
import {ManagerController} from '../controllers/manager.controller.js';
import {ManagerQueueController} from '../controllers/manager.controller.queue.js';
import type {ManagerRepositoryInterface} from '../interfaces/manager.repository.interface.js';
import {MANAGER_REPOSITORY} from '../manager.symbols.js';
import {ManagerService} from '../manager.service.js';

/** 테스트용 게이트웨이 인스턴스 ID (결과 회신 주소) */
export const TEST_REPLY_TO = 'gw-test';

/** 테스트용 내부 요청 토큰 */
export const TEST_INTERNAL_TOKEN = 'test-internal-token';

/** 고정 시각 — 2026-01-01 00:00 (로컬) */
export const FIXED_TIME = new Date(2026, 0, 1);

/** 업체 ID */
export const STORE_ID = 'b'.repeat(32);

/** 업체코드 (PK 와 별개) */
export const STORE_CODE = 'c'.repeat(32);

/** 로그인한 업체 총관리자 */
export const HEAD_ACTOR: Actor = {user_id: 'h'.repeat(32), auth_id: 'HEAD_MANAGER'};

/** 업체 관리자 회원 ID */
export const STAFF_ID = 'e'.repeat(32);

/** 매니저 repository mock — 모든 메서드가 vi.fn() */
export type ManagerRepositoryMock = {[K in keyof ManagerRepositoryInterface]: Mock};

/** JwtService mock */
export type JwtServiceMock = {sign: Mock; verify: Mock};

/** SMS 포트 mock */
export type SmsSenderMock = {send: Mock};

/**
 * 매니저 repository mock 을 만든다.
 *
 * @returns 메서드별 vi.fn()
 */
export function createManagerRepositoryMock(): ManagerRepositoryMock {
    return {
        findManager: vi.fn(),
        findLoginManager: vi.fn(),
        updateManager: vi.fn(),
        findManagerStore: vi.fn(),
        countStaff: vi.fn(),
        findStaffList: vi.fn(),
        insertStaff: vi.fn(),
        updateStaff: vi.fn(),
        insertSession: vi.fn(),
        findSession: vi.fn(),
        insertSessionRefresh: vi.fn(),
        findSessionRefresh: vi.fn(),
        updateSessionRefresh: vi.fn(),
        insertSmsVerification: vi.fn(),
        countSmsVerifications: vi.fn(),
        findSmsVerification: vi.fn(),
        consumeSmsVerificationAttempt: vi.fn(),
        updateSmsVerification: vi.fn(),
    };
}

/**
 * SMS 포트 mock — 기본은 발송 성공.
 *
 * @returns mock
 */
export function createSmsSenderMock(): SmsSenderMock {
    return {send: vi.fn().mockResolvedValue(undefined)};
}

/**
 * JwtService mock — sign 은 type 에 따라 고정 토큰을 돌려준다.
 *
 * @param accessToken access 토큰
 * @param refreshToken refresh 토큰
 * @returns mock
 */
export function createJwtServiceMock(accessToken: string, refreshToken: string): JwtServiceMock {
    return {sign: vi.fn((payload: {type: string}) => (payload.type === 'access' ? accessToken : refreshToken)), verify: vi.fn()};
}

/**
 * 큐 경로 부팅 — 실제 ManagerQueueController · ManagerService · CommandHandlerRegistry · CommandDispatcher 에 repository · JwtService · SMS 포트만 mock.
 *
 * @param repo repository mock
 * @param jwt JwtService mock
 * @param sms SMS 포트 mock (기본: 발송 성공)
 * @returns 디스패처와 테스트 모듈
 */
export async function bootCommandPath(repo: ManagerRepositoryMock, jwt: JwtServiceMock, sms: SmsSenderMock = createSmsSenderMock()): Promise<{dispatcher: CommandDispatcher; module: TestingModule}> {
    const module = await Test.createTestingModule({
        imports: [DiscoveryModule],
        providers: [
            ManagerService,
            ManagerQueueController,
            CommandHandlerRegistry,
            CommandDispatcher,
            {provide: MANAGER_REPOSITORY, useValue: repo},
            {provide: JwtService, useValue: jwt},
            {provide: SMS_SENDER, useValue: sms},
        ],
    }).compile();
    await module.init();
    return {dispatcher: module.get(CommandDispatcher), module};
}

/**
 * 동기 경로 부팅 — 실제 내부 ManagerController · ManagerService · ValidationPipe · 필터 · 전역 InternalAuthGuard(APP_GUARD) · ReturnedExceptionInterceptor(APP_INTERCEPTOR)
 * (admin-service.module 과 같다) 에 repository · JwtService · SMS 포트만 mock.
 *
 * @param repo repository mock
 * @param jwt JwtService mock
 * @param sms SMS 포트 mock (기본: 발송 성공)
 * @returns Nest 앱
 */
export async function bootHttpPath(repo: ManagerRepositoryMock, jwt: JwtServiceMock, sms: SmsSenderMock = createSmsSenderMock()): Promise<INestApplication> {
    process.env.INTERNAL_API_TOKEN = TEST_INTERNAL_TOKEN;
    const module = await Test.createTestingModule({
        controllers: [ManagerController],
        providers: [
            ManagerService,
            {provide: MANAGER_REPOSITORY, useValue: repo},
            {provide: JwtService, useValue: jwt},
            {provide: SMS_SENDER, useValue: sms},
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
 * 게이트웨이가 붙이는 내부 요청 헤더 — actor 가 있으면 로그인 회원 헤더도.
 *
 * @param clientIp 클라이언트 IP
 * @param actor 로그인 회원
 * @returns 헤더
 */
export function internalHeaders(clientIp = '10.0.0.1', actor: Actor | null = null): Record<string, string> {
    const headers: Record<string, string> = {[INTERNAL_HEADER.TOKEN]: TEST_INTERNAL_TOKEN, [INTERNAL_HEADER.CLIENT_IP]: clientIp};
    if (actor) {
        headers[INTERNAL_HEADER.ACTOR_USER_ID] = actor.user_id;
        headers[INTERNAL_HEADER.ACTOR_AUTH_ID] = actor.auth_id;
    }
    return headers;
}

/**
 * 업체 행 — 매니저 로그인 · 계정 찾기 · 업체 관리자 등록 안내가 쓴다
 *
 * @param override 바꿀 필드
 * @returns 업체 행
 */
export function storeRow(override: Record<string, unknown> = {}): Record<string, unknown> {
    return {store_id: STORE_ID, store_code: STORE_CODE, store_name: '룸리스 강남점', store_state_id: 'ACTIVE', ...override};
}

/**
 * 업체 총관리자 행 (HEAD_ACTOR)
 *
 * @param override 바꿀 필드
 * @returns 회원 행
 */
export function headManagerRow(override: Record<string, unknown> = {}): Record<string, unknown> {
    return {user_id: HEAD_ACTOR.user_id, auth_id: 'HEAD_MANAGER', login_scope: 'MANAGER', state_id: 'ACTIVE', store_id: STORE_ID, login_id: 'owner01', ...override};
}

/**
 * 업체 관리자 행 (정상)
 *
 * @param override 바꿀 필드
 * @returns 회원 행
 */
export function staffRow(override: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        user_id: STAFF_ID,
        auth_id: 'MANAGER',
        login_scope: 'MANAGER',
        state_id: 'ACTIVE',
        store_id: STORE_ID,
        login_id: 'staff01',
        name: '김직원',
        nickname: '김직원',
        gender: 'M',
        birth: '1995-05-05',
        phone: '01022223333',
        block_comment: null,
        is_password_change_required: 1,
        created_at: FIXED_TIME,
        updated_at: FIXED_TIME,
        ...override,
    };
}

/**
 * 게이트웨이가 발행하는 것과 같은 명령 봉투를 디스패처에 넣는다.
 *
 * @param dispatcher 디스패처
 * @param params 명령 type · 본문 · actor · 클라이언트 IP · 이전 전달 횟수
 * @returns 판정 + 명령 봉투
 */
export async function runCommand(
    dispatcher: CommandDispatcher,
    params: {type: string; payload: unknown; actor?: Actor | null; client_ip?: string | null; delivery_count?: number},
): Promise<{decision: DispatchDecision; command: MessageEnvelope<unknown>; result: ResultPayload<unknown> | null}> {
    const command = buildCommandEnvelope({
        type: params.type,
        actor: params.actor ?? null,
        payload: params.payload,
        reply_to: TEST_REPLY_TO,
        client_ip: params.client_ip === undefined ? '10.0.0.1' : params.client_ip,
    });
    const decision = await dispatcher.dispatch(encodeEnvelope(command), params.delivery_count ?? 0);
    return {decision, command, result: decision.result?.payload ?? null};
}
