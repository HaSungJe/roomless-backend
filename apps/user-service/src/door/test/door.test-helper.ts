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
import {DoorService} from '../door.service.js';
import {DOOR_REPOSITORY} from '../door.symbols.js';
import type {DoorRepositoryInterface} from '../interfaces/door.repository.interface.js';

/** 테스트용 내부 요청 토큰 */
export const TEST_INTERNAL_TOKEN = 'test-internal-token';

/** 고정 시각 — 엔티티 생성 · 수정 시각 */
export const FIXED_TIME = new Date(2026, 0, 1);

/** 업체 · 업체코드 */
export const STORE_ID = 'b'.repeat(32);
export const STORE_CODE = 'c'.repeat(32);

/** 객실 그룹 · 호실 */
export const ROOM_GROUP_ID = 'd'.repeat(32);
export const ROOM_ID = 'f'.repeat(32);

/** door repository mock 모양 — 포트 메서드마다 vi.fn() */
export type DoorRepositoryMock = {[K in keyof DoorRepositoryInterface]: Mock};

/** 문 정보 포트 mock — 포트 메서드마다 vi.fn() */
export type DoorStoreMock = {[K in keyof DoorStoreInterface]: Mock};

/**
 * door repository mock — 업체 · 호실은 없음(null), 호실 목록은 빈 배열
 *
 * @returns mock
 */
export function createDoorRepositoryMock(): DoorRepositoryMock {
    return {findDoorStore: vi.fn().mockResolvedValue(null), findDoorRoom: vi.fn().mockResolvedValue(null), findStoreDoorRoomRows: vi.fn().mockResolvedValue([])};
}

/**
 * 문 정보 포트 mock — 여러 문 읽기는 받은 수만큼 기록 없는 문(close · 00000000000000), QR 확인은 일치(true), 쓰기는 성공.
 *
 * @returns mock
 */
export function createDoorStoreMock(): DoorStoreMock {
    return {
        getMany: vi.fn((room_ids: string[]) => Promise.resolve(room_ids.map(() => ({state: 'close', changed_at: '00000000000000'})))),
        setQr: vi.fn().mockResolvedValue(undefined),
        revokeQr: vi.fn().mockResolvedValue(undefined),
        verify: vi.fn().mockResolvedValue(true),
        open: vi.fn().mockResolvedValue(undefined),
        close: vi.fn().mockResolvedValue(undefined),
        disconnect: vi.fn().mockResolvedValue(undefined),
        subscribe: vi.fn(),
    };
}

/**
 * 동기 경로 부팅 — 실제 DoorController + DoorService + ValidationPipe + 필터 + 전역 InternalAuthGuard · ReturnedExceptionInterceptor(user-service.module 과 같다), repository · 문 정보 포트만 mock.
 *
 * @param repo repository mock
 * @param door 문 정보 포트 mock
 * @returns Nest 앱
 */
export async function bootHttpPath(repo: DoorRepositoryMock, door: DoorStoreMock = createDoorStoreMock()): Promise<INestApplication> {
    process.env.INTERNAL_API_TOKEN = TEST_INTERNAL_TOKEN;
    const module = await Test.createTestingModule({
        controllers: [DoorController],
        providers: [
            DoorService,
            {provide: DOOR_REPOSITORY, useValue: repo},
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
 * 게이트웨이가 붙이는 내부 요청 헤더 — 문 소켓 처리는 actor 가 없다(업체는 소켓 접속 때 확인한 값).
 *
 * @returns 헤더
 */
export function internalHeaders(): Record<string, string> {
    return {[INTERNAL_HEADER.TOKEN]: TEST_INTERNAL_TOKEN, [INTERNAL_HEADER.CLIENT_IP]: '10.0.0.1'};
}

/**
 * 업체 행 (활성)
 *
 * @param override 바꿀 필드
 * @returns 업체 행
 */
export function storeRow(override: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        store_id: STORE_ID,
        store_code: STORE_CODE,
        store_state_id: 'ACTIVE',
        store_name: '룸리스 강남점',
        business_number: '1234567890',
        owner_name: '홍길동',
        phone: '0212345678',
        address: '서울시 강남구',
        address_detail: null,
        latitude: 37.4979,
        longitude: 127.0276,
        introduction: null,
        is_always_open: 0,
        is_open: 0,
        maintenance_minutes: 0,
        booking_open_hours: 72,
        refund_deadline_minutes: 60,
        late_refund_percent: 50,
        suspend_comment: null,
        is_deleted: 0,
        delete_backup: null,
        created_at: FIXED_TIME,
        updated_at: FIXED_TIME,
        ...override,
    };
}

/**
 * 호실 엔티티 (예약가능)
 *
 * @param override 바꿀 필드
 * @returns 호실
 */
export function roomEntity(override: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        room_id: ROOM_ID,
        store_id: STORE_ID,
        room_group_id: ROOM_GROUP_ID,
        room_state_id: 'AVAILABLE',
        room_name: '101호',
        floor: 1,
        is_deleted: 0,
        created_at: FIXED_TIME,
        updated_at: FIXED_TIME,
        ...override,
    };
}

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
