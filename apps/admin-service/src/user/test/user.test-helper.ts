import {BadRequestException, INestApplication, ValidationPipe} from '@nestjs/common';
import type {Type} from '@nestjs/common';
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
import {CommandHandlerRegistry} from '@app/messaging/command-handler.registry.js';
import {CommandDispatcher, DispatchDecision} from '@app/messaging/command.dispatcher.js';
import {buildCommandEnvelope, encodeEnvelope} from '@app/messaging/messaging.util.js';
import {UserController} from '../controllers/user.controller.js';
import {UserQueueController} from '../controllers/user.controller.queue.js';
import type {UserRepositoryInterface} from '../interfaces/user.repository.interface.js';
import {USER_REPOSITORY} from '../user.symbols.js';
import {UserService} from '../user.service.js';

/** 테스트용 게이트웨이 인스턴스 ID (결과 회신 주소) */
export const TEST_REPLY_TO = 'gw-test';

/** 테스트용 내부 토큰 */
export const TEST_INTERNAL_TOKEN = 'test-internal-token';

/** 고정 시각 */
export const FIXED_TIME = new Date('2026-01-01T00:00:00Z');

/** 관리 대상 이용자 ID */
export const USER_ID = 'c'.repeat(32);

/** 로그인 총관리자 (게이트웨이 관리자 가드를 통과한 actor) */
export const ADMIN_ACTOR: Actor = {user_id: 'd'.repeat(32), auth_id: 'SUPER_ADMIN'};

/** 이용자 관리 repository mock 타입 */
export type UserRepositoryMock = {[K in keyof UserRepositoryInterface]: Mock};

/**
 * 이용자 관리 repository mock — 목록은 빈 배열 · 개수 0 · 상태 쓰기는 1행(true) 기본값.
 *
 * @returns 메서드별 vi.fn()
 */
export function createUserRepositoryMock(): UserRepositoryMock {
    return {
        findUser: vi.fn().mockResolvedValue(null),
        countUsers: vi.fn().mockResolvedValue(0),
        findUserList: vi.fn().mockResolvedValue([]),
        updateUser: vi.fn().mockResolvedValue(true),
        findReservationCounts: vi.fn().mockResolvedValue([]),
        countUserReservations: vi.fn().mockResolvedValue(0),
        findUserReservationRows: vi.fn().mockResolvedValue([]),
    };
}

/**
 * 큐 경로 부팅 — 실제 UserQueueController · UserService · CommandHandlerRegistry · CommandDispatcher 에 repository 만 mock.
 *
 * @param repo repository mock
 * @returns 디스패처와 테스트 모듈
 */
export async function bootCommandPath(repo: UserRepositoryMock): Promise<{dispatcher: CommandDispatcher; module: TestingModule}> {
    const module = await Test.createTestingModule({
        imports: [DiscoveryModule],
        providers: [UserService, UserQueueController, CommandHandlerRegistry, CommandDispatcher, {provide: USER_REPOSITORY, useValue: repo}],
    }).compile();
    await module.init();
    return {dispatcher: module.get(CommandDispatcher), module};
}

/**
 * 동기 경로 부팅 — 실제 내부 UserController · UserService · ValidationPipe · 필터 · 전역 InternalAuthGuard(APP_GUARD) · ReturnedExceptionInterceptor(APP_INTERCEPTOR)
 * (admin-service.module 과 같다) 에 repository 만 mock.
 *
 * @param repo repository mock
 * @returns Nest 앱
 */
export async function bootHttpPath(repo: UserRepositoryMock): Promise<INestApplication> {
    process.env.INTERNAL_API_TOKEN = TEST_INTERNAL_TOKEN;
    const module = await Test.createTestingModule({
        controllers: [UserController],
        providers: [UserService, {provide: USER_REPOSITORY, useValue: repo}, {provide: APP_GUARD, useClass: InternalAuthGuard}, {provide: APP_INTERCEPTOR, useClass: ReturnedExceptionInterceptor}],
    }).compile();
    const app = module.createNestApplication();
    app.useGlobalFilters(new CustomErrorFilter());
    app.useGlobalPipes(new ValidationPipe({transform: true, forbidNonWhitelisted: true, exceptionFactory: validationExceptionFactory}));
    await app.init();
    return app;
}

/**
 * 게이트웨이가 붙이는 내부 요청 헤더 — 관리자 actor 헤더 포함.
 *
 * @param actor 로그인 관리자
 * @returns 헤더
 */
export function internalHeaders(actor: Actor = ADMIN_ACTOR): Record<string, string> {
    return {[INTERNAL_HEADER.TOKEN]: TEST_INTERNAL_TOKEN, [INTERNAL_HEADER.CLIENT_IP]: '10.0.0.1', [INTERNAL_HEADER.ACTOR_USER_ID]: actor.user_id, [INTERNAL_HEADER.ACTOR_AUTH_ID]: actor.auth_id};
}

/**
 * 게이트웨이 ValidationPipe 로 본문(또는 path param)을 검증한다.
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
 * 이용자 행 (정상 · SNS 카카오 · 휴대폰 인증)
 *
 * @param override 바꿀 필드
 * @returns 회원 행
 */
export function userRow(override: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        user_id: USER_ID,
        user_search_code: 's'.repeat(32),
        auth_id: 'USER',
        login_scope: 'USER',
        state_id: 'ACTIVE',
        sns_id: 'KAKAO',
        nickname: '여행자',
        name: '김이용',
        gender: 'F',
        birth: '1995-05-05',
        phone: '01011112222',
        phone_verified_at: new Date('2025-12-01T00:00:00Z'),
        block_comment: null,
        leave_reserved_at: null,
        created_at: FIXED_TIME,
        updated_at: FIXED_TIME,
        ...override,
    };
}

/**
 * 게이트웨이가 발행하는 것과 같은 명령 봉투를 디스패처에 넣는다.
 *
 * @param dispatcher 디스패처
 * @param params 명령 type · 본문 · actor
 * @returns 판정 + 결과
 */
export async function runCommand(
    dispatcher: CommandDispatcher,
    params: {type: string; payload: unknown; actor?: Actor | null},
): Promise<{decision: DispatchDecision; command: MessageEnvelope<unknown>; result: ResultPayload<unknown> | null}> {
    const command = buildCommandEnvelope({type: params.type, actor: params.actor === undefined ? ADMIN_ACTOR : params.actor, payload: params.payload, reply_to: TEST_REPLY_TO, client_ip: '10.0.0.1'});
    const decision = await dispatcher.dispatch(encodeEnvelope(command), 0);
    return {decision, command, result: decision.result?.payload ?? null};
}
