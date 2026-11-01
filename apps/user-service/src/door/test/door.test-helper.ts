import {INestApplication, ValidationPipe} from '@nestjs/common';
import {APP_GUARD, APP_INTERCEPTOR} from '@nestjs/core';
import {Test} from '@nestjs/testing';
import type {Mock} from 'vitest';
import {CustomErrorFilter} from '@app/common/exception/custom-error.filter.js';
import {ReturnedExceptionInterceptor} from '@app/common/exception/returned-exception.interceptor.js';
import {InternalAuthGuard} from '@app/common/internal/internal-auth.guard.js';
import {validationExceptionFactory} from '@app/common/utils/validation.js';
import {INTERNAL_HEADER} from '@app/contracts/actor.js';
import {DOOR_STORE} from '@app/integration/integration.symbols.js';
import type {DoorStoreInterface} from '@app/integration/interfaces/integration.interface.js';
import {DoorController} from '../controllers/door.controller.js';
import type {DoorRepositoryInterface} from '../interfaces/door.repository.interface.js';
import {DoorService} from '../door.service.js';
import {DOOR_REPOSITORY} from '../door.symbols.js';

/** 테스트용 내부 요청 비밀값 */
export const TEST_INTERNAL_TOKEN = 'test-internal-token';

/** QR 정보 (32자 hex) */
export const QR = 'a1'.repeat(16);

/** 호실 ID */
export const ROOM_ID = 'b2'.repeat(16);

/** 상태 저장소(Redis) 503 메시지 */
export const REDIS_UNAVAILABLE = '상태 저장소에 연결할 수 없습니다. 잠시 후 다시 시도해주세요.';

/**
 * [CASES:toDoorTime] — 지금(UTC) → 저장되는 문 시각(한국 시각 yyyyMMddHHmmss). 사용자 결정 2026-11-01
 * [이름, 지금, 문 시각]
 */
export const DOOR_TIME_CASES: [string, string, string][] = [
    ['한국은 다음 날', '2026-10-31T17:24:59Z', '20261101022459'],
    ['한국 09시', '2026-11-01T00:00:00Z', '20261101090000'],
    ['연도 경계', '2026-12-31T15:00:00Z', '20270101000000'],
    ['밀리초는 버림', '2026-11-01T14:59:59.999Z', '20261101235959'],
    ['윤년 2월 29일', '2028-02-28T15:30:00Z', '20280229003000'],
];

/** 문 repository 포트 mock */
export type DoorRepositoryMock = {[K in keyof DoorRepositoryInterface]: Mock};

/** 문 정보 포트 mock */
export type DoorStoreMock = {[K in keyof DoorStoreInterface]: Mock};

/**
 * 문 repository mock — 포트 메서드마다 vi.fn()
 *
 * @returns mock
 */
export function createDoorRepositoryMock(): DoorRepositoryMock {
    return {findDoorRoom: vi.fn()};
}

/**
 * 문 정보 포트 mock — 포트 메서드마다 vi.fn()
 *
 * @returns mock
 */
export function createDoorStoreMock(): DoorStoreMock {
    return {get: vi.fn(), issueQr: vi.fn(), open: vi.fn(), close: vi.fn()};
}

/**
 * 동기 경로 부팅 — 실제 DoorController + DoorService + ValidationPipe + 필터 + 전역 InternalAuthGuard · ReturnedExceptionInterceptor, repository · 문 정보 포트만 mock.
 *
 * @param repo repository mock
 * @param store 문 정보 포트 mock
 * @returns Nest 앱
 */
export async function bootHttpPath(repo: DoorRepositoryMock, store: DoorStoreMock): Promise<INestApplication> {
    process.env.INTERNAL_API_TOKEN = TEST_INTERNAL_TOKEN;
    const module = await Test.createTestingModule({
        controllers: [DoorController],
        providers: [
            DoorService,
            {provide: DOOR_REPOSITORY, useValue: repo},
            {provide: DOOR_STORE, useValue: store},
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
 * @returns 헤더
 */
export function internalHeaders(): Record<string, string> {
    return {[INTERNAL_HEADER.TOKEN]: TEST_INTERNAL_TOKEN};
}
