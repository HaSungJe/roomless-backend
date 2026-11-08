import {BadRequestException, INestApplication, Type, ValidationPipe} from '@nestjs/common';
import {APP_GUARD, APP_INTERCEPTOR} from '@nestjs/core';
import {Test} from '@nestjs/testing';
import type {Mock} from 'vitest';
import {CustomErrorFilter} from '@app/common/exception/custom-error.filter.js';
import {ReturnedExceptionInterceptor} from '@app/common/exception/returned-exception.interceptor.js';
import {InternalAuthGuard} from '@app/common/internal/internal-auth.guard.js';
import {validationExceptionFactory} from '@app/common/utils/validation.js';
import {INTERNAL_HEADER} from '@app/contracts/actor.js';
import {STORAGE_GATEWAY} from '@app/integration/integration.symbols.js';
import {DiscoveryController} from '../controllers/discovery.controller.js';
import {DiscoveryService} from '../discovery.service.js';
import {DISCOVERY_REPOSITORY} from '../discovery.symbols.js';
import type {DiscoveryRepositoryInterface} from '../interfaces/discovery.repository.interface.js';

/** 테스트용 내부 요청 토큰 */
export const TEST_INTERNAL_TOKEN = 'test-internal-token';

/** 업체 · 둘째 업체 */
export const STORE_ID = 'b'.repeat(32);
export const STORE_ID_2 = '6'.repeat(32);

/** 객실 그룹 — 스탠다드 · 디럭스 · 빈 그룹 */
export const ROOM_GROUP_ID = 'c'.repeat(32);
export const ROOM_GROUP_ID_2 = '7'.repeat(32);
export const ROOM_GROUP_ID_3 = '8'.repeat(32);

/** repository mock 모양 — 포트 메서드마다 vi.fn() */
export type DiscoveryRepositoryMock = {[K in keyof DiscoveryRepositoryInterface]: Mock};

/** 파일 저장소 포트 mock 모양 — 공개 주소만 쓴다 */
export type StorageGatewayMock = {getPublicUrl: Mock};

/**
 * discovery repository mock — 목록은 빈 배열, 업체는 활성 업체
 *
 * @returns mock
 */
export function createDiscoveryRepositoryMock(): DiscoveryRepositoryMock {
    return {
        findStoreRows: vi.fn().mockResolvedValue([]),
        findDiscoveryStore: vi.fn().mockResolvedValue(storeEntity()),
        findStoreImages: vi.fn().mockResolvedValue([]),
        findStoreHours: vi.fn().mockResolvedValue([]),
        findStoreBreaks: vi.fn().mockResolvedValue([]),
        findStorePlanRows: vi.fn().mockResolvedValue([]),
        findRoomGroups: vi.fn().mockResolvedValue([]),
        countBookableRooms: vi.fn().mockResolvedValue([]),
        findRoomGroupImages: vi.fn().mockResolvedValue([]),
        findRoomGroupPlans: vi.fn().mockResolvedValue([]),
        findRoomGroupPlanPrices: vi.fn().mockResolvedValue([]),
    };
}

/**
 * 파일 저장소 포트 mock — 공개 주소는 키로 만든 고정 값
 *
 * @returns mock
 */
export function createStorageGatewayMock(): StorageGatewayMock {
    return {getPublicUrl: vi.fn((key: string) => `https://cdn.test/${key}`)};
}

/**
 * 동기 경로 부팅 — 실제 DiscoveryController + DiscoveryService + ValidationPipe + 필터 + 전역 InternalAuthGuard · ReturnedExceptionInterceptor(user-service.module 과 같다), repository · 저장소 포트만 mock.
 *
 * @param repo repository mock
 * @param storage 파일 저장소 포트 mock
 * @returns Nest 앱
 */
export async function bootHttpPath(repo: DiscoveryRepositoryMock, storage: StorageGatewayMock = createStorageGatewayMock()): Promise<INestApplication> {
    process.env.INTERNAL_API_TOKEN = TEST_INTERNAL_TOKEN;
    const module = await Test.createTestingModule({
        controllers: [DiscoveryController],
        providers: [
            DiscoveryService,
            {provide: DISCOVERY_REPOSITORY, useValue: repo},
            {provide: STORAGE_GATEWAY, useValue: storage},
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
 * 게이트웨이가 붙이는 내부 요청 헤더(actor 없음 — 로그인 없는 공개 라우트)
 *
 * @returns 헤더
 */
export function internalHeaders(): Record<string, string> {
    return {[INTERNAL_HEADER.TOKEN]: TEST_INTERNAL_TOKEN, [INTERNAL_HEADER.CLIENT_IP]: '10.0.0.1'};
}

/**
 * 게이트웨이 ValidationPipe 로 쿼리 · path param 을 검증한다.
 *
 * @param metatype DTO 클래스
 * @param body 입력
 * @returns 실패 본문 또는 null
 */
export async function validateBody(metatype: Type<unknown>, body: unknown): Promise<Record<string, unknown> | null> {
    const pipe = new ValidationPipe({transform: true, forbidNonWhitelisted: true, exceptionFactory: validationExceptionFactory});
    try {
        await pipe.transform(body, {type: 'query', metatype});
        return null;
    } catch (error) {
        return (error as BadRequestException).getResponse() as Record<string, unknown>;
    }
}

/**
 * 업체 — 활성 · 영업중, 공개하지 않는 필드(사업자 정보 · 업체코드 · 정지 사유 · 문 시크릿 · 정비시간)까지 채운다
 *
 * @param override 바꿀 필드
 * @returns 업체 엔티티 모양
 */
export function storeEntity(override: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        store_id: STORE_ID,
        store_code: 'a'.repeat(32),
        store_state_id: 'ACTIVE',
        store_name: '루미 강남점',
        business_number: '1234567890',
        owner_name: '김대표',
        phone: '0212345678',
        address: '서울 강남구 테헤란로 1',
        address_detail: '3층',
        latitude: 37.4979,
        longitude: 127.0276,
        introduction: '역에서 1분',
        is_always_open: 0,
        is_open: 1,
        maintenance_minutes: 30,
        booking_open_hours: 72,
        refund_deadline_minutes: 60,
        late_refund_percent: 50,
        door_secret: '$2b$12$hashed',
        suspend_comment: null,
        is_deleted: 0,
        ...override,
    };
}

/**
 * 반경 업체 행
 *
 * @param override 바꿀 필드
 * @returns 행
 */
export function storeRow(override: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        store_id: STORE_ID,
        store_name: '루미 강남점',
        address: '서울 강남구 테헤란로 1',
        latitude: 37.4979,
        longitude: 127.0276,
        distance_m: 1234,
        cover_file_key: `store/${STORE_ID}/cover.jpg`,
        is_open: 1,
        is_always_open: 0,
        min_hourly_price: 30000,
        min_night_price: 70000,
        ...override,
    };
}

/**
 * 업체 상품 설정 행 — 종류별 기본(시간 이용 3시간 · 1박 22:00 → 09:00 · 연박 15:00 → 11:00 · 2 ~ 7박), 사용 · 매일
 *
 * @param room_plan_type_id 상품 종류
 * @param override 바꿀 필드
 * @returns 행
 */
export function storePlanRow(room_plan_type_id: string, override: Record<string, unknown> = {}): Record<string, unknown> {
    const byType: Record<string, Record<string, unknown>> = {
        HOURLY: {room_plan_type_name: '시간 이용', usage_hours: 3, check_in_time: null, check_out_time: null, min_nights: null, max_nights: null},
        NIGHT: {room_plan_type_name: '1박', usage_hours: null, check_in_time: '22:00:00', check_out_time: '09:00:00', min_nights: null, max_nights: null},
        LONG: {room_plan_type_name: '연박', usage_hours: null, check_in_time: '15:00:00', check_out_time: '11:00:00', min_nights: 2, max_nights: 7},
    };
    return {room_plan_type_id, is_used: 1, days_of_week: 127, is_extendable: 1, max_extensions: 3, ...byType[room_plan_type_id], ...override};
}

/**
 * 객실 그룹 — 상세정보(편의시설) 포함
 *
 * @param room_group_id 그룹 ID
 * @param room_group_name 그룹명
 * @returns 그룹 엔티티 모양
 */
export function roomGroupEntity(room_group_id: string, room_group_name: string): Record<string, unknown> {
    return {room_group_id, store_id: STORE_ID, room_group_name, description: `${room_group_name} 설명`, room_group_detail: {room_count: 1, has_shower: 1, has_tv: 1, has_pc: 0}, is_deleted: 0};
}

/**
 * 그룹 상품
 *
 * @param room_group_plan_id 그룹 상품 ID
 * @param room_group_id 그룹 ID
 * @param room_plan_type_id 상품 종류
 * @param is_used 사용 여부
 * @param price 기본 요금
 * @returns 그룹 상품 엔티티 모양
 */
export function groupPlanEntity(room_group_plan_id: string, room_group_id: string, room_plan_type_id: string, is_used: number, price: number): {room_group_plan_id: string} & Record<string, unknown> {
    return {room_group_plan_id, room_group_id, room_plan_type_id, is_used, price};
}
