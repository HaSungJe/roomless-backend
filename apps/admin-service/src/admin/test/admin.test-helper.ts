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
import {CommandHandlerRegistry} from '@app/messaging/command-handler.registry.js';
import {CommandDispatcher, DispatchDecision} from '@app/messaging/command.dispatcher.js';
import {buildCommandEnvelope, encodeEnvelope} from '@app/messaging/messaging.util.js';
import {ADMIN_REPOSITORY} from '../admin.symbols.js';
import {AdminService} from '../admin.service.js';
import {AdminController} from '../controllers/admin.controller.js';
import {AdminQueueController} from '../controllers/admin.controller.queue.js';
import type {AdminRepositoryInterface} from '../interfaces/admin.repository.interface.js';

/** 테스트용 게이트웨이 인스턴스 ID (결과 회신 주소) */
export const TEST_REPLY_TO = 'gw-test';

/** 테스트용 내부 요청 토큰 */
export const TEST_INTERNAL_TOKEN = 'test-internal-token';

/** 고정 시각 — 2026-01-01 00:00 (로컬) */
export const FIXED_TIME = new Date(2026, 0, 1);

/** 관리자 repository mock — 모든 메서드가 vi.fn() */
export type AdminRepositoryMock = {[K in keyof AdminRepositoryInterface]: Mock};

/** JwtService mock */
export type JwtServiceMock = {sign: Mock; verify: Mock};

/**
 * 관리자 repository mock 을 만든다.
 *
 * @returns 메서드별 vi.fn()
 */
export function createAdminRepositoryMock(): AdminRepositoryMock {
    return {
        findAdmin: vi.fn(),
        findLoginAdmin: vi.fn(),
        updateAdmin: vi.fn(),
        insertSession: vi.fn(),
        findSession: vi.fn(),
        insertSessionRefresh: vi.fn(),
        findSessionRefresh: vi.fn(),
        updateSessionRefresh: vi.fn(),
    };
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
 * 큐 경로 부팅 — 실제 AdminQueueController · AdminService · CommandHandlerRegistry · CommandDispatcher 에 repository · JwtService 만 mock.
 *
 * @param repo repository mock
 * @param jwt JwtService mock
 * @returns 디스패처와 테스트 모듈
 */
export async function bootCommandPath(repo: AdminRepositoryMock, jwt: JwtServiceMock): Promise<{dispatcher: CommandDispatcher; module: TestingModule}> {
    const module = await Test.createTestingModule({
        imports: [DiscoveryModule],
        providers: [AdminService, AdminQueueController, CommandHandlerRegistry, CommandDispatcher, {provide: ADMIN_REPOSITORY, useValue: repo}, {provide: JwtService, useValue: jwt}],
    }).compile();
    await module.init();
    return {dispatcher: module.get(CommandDispatcher), module};
}

/**
 * 동기 경로 부팅 — 실제 내부 AdminController · AdminService · ValidationPipe · 필터 · 전역 InternalAuthGuard(APP_GUARD) · ReturnedExceptionInterceptor(APP_INTERCEPTOR)
 * (admin-service.module 과 같다) 에 repository · JwtService 만 mock.
 *
 * @param repo repository mock
 * @param jwt JwtService mock
 * @returns Nest 앱
 */
export async function bootHttpPath(repo: AdminRepositoryMock, jwt: JwtServiceMock): Promise<INestApplication> {
    process.env.INTERNAL_API_TOKEN = TEST_INTERNAL_TOKEN;
    const module = await Test.createTestingModule({
        controllers: [AdminController],
        providers: [
            AdminService,
            {provide: ADMIN_REPOSITORY, useValue: repo},
            {provide: JwtService, useValue: jwt},
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

/** 게이트웨이가 붙이는 내부 요청 헤더 */
export function internalHeaders(clientIp = '10.0.0.1'): Record<string, string> {
    return {[INTERNAL_HEADER.TOKEN]: TEST_INTERNAL_TOKEN, [INTERNAL_HEADER.CLIENT_IP]: clientIp};
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
