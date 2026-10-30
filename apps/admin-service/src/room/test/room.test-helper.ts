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
import {STORAGE_GATEWAY} from '@app/integration/integration.symbols.js';
import {CommandHandlerRegistry} from '@app/messaging/command-handler.registry.js';
import {CommandDispatcher, DispatchDecision} from '@app/messaging/command.dispatcher.js';
import {buildCommandEnvelope, encodeEnvelope} from '@app/messaging/messaging.util.js';
import {RoomController} from '../controllers/room.controller.js';
import {RoomQueueController} from '../controllers/room.controller.queue.js';
import type {RoomGroupPlanRow, RoomGroupRow, RoomPlanRow, RoomRepositoryInterface, RoomRow} from '../interfaces/room.repository.interface.js';
import {RoomService} from '../room.service.js';
import {ROOM_REPOSITORY} from '../room.symbols.js';

/** 테스트용 게이트웨이 인스턴스 ID (결과 회신 주소) */
export const TEST_REPLY_TO = 'gw-test';

/** 테스트용 내부 요청 토큰 */
export const TEST_INTERNAL_TOKEN = 'test-internal-token';

/** 고정 시각 — 2026-01-01 00:00 (로컬) */
export const FIXED_TIME = new Date(2026, 0, 1);

/** 생성 ID 형식 (generateId — 32자 hex) */
export const ID_PATTERN = /^[a-f0-9]{32}$/;

/** 업체 관리자 (매니저 그룹 — 업체 총관리자 · 업체 관리자 모두 같은 경로) */
export const MANAGER_ACTOR: Actor = {user_id: 'h'.repeat(32), auth_id: 'MANAGER'};

/** 업체 ID */
export const STORE_ID = 'b'.repeat(32);

/** 업체코드 */
export const STORE_CODE = 'c'.repeat(32);

/** 업체 상품 설정 ID */
export const ROOM_PLAN_ID = '7'.repeat(32);

/** 객실 그룹 ID */
export const ROOM_GROUP_ID = 'd'.repeat(32);

/** 그룹 상품 ID */
export const ROOM_GROUP_PLAN_ID = '8'.repeat(32);

/** 기간 가격 ID */
export const ROOM_GROUP_PLAN_PRICE_ID = '9'.repeat(32);

/** 그룹 사진 ID */
export const ROOM_GROUP_IMAGE_ID = 'e'.repeat(32);

/** 호실 ID */
export const ROOM_ID = 'f'.repeat(32);

/** 그룹 사진 저장 키 — 그 업체 · 그 그룹 · jpg (공개 store/ 접두) */
export const IMAGE_KEY = `store/${STORE_ID}/room-group/${ROOM_GROUP_ID}/${'2'.repeat(32)}.jpg`;

/** room repository mock — 포트 인터페이스의 모든 메서드가 vi.fn() (빌더는 인터페이스 밖이라 없다) */
export type RoomRepositoryMock = {[K in keyof RoomRepositoryInterface]: Mock};

/** 파일 저장소 포트 mock */
export type StorageGatewayMock = {createUploadUrl: Mock; exists: Mock; getPublicUrl: Mock; remove: Mock; createDownloadUrl: Mock};

/**
 * room repository mock 을 만든다 — 목록 조회는 빈 배열, 기간 가격 겹침 개수는 0, 기간 가격 삭제는 성공(true)이 기본값.
 *
 * @returns 메서드별 vi.fn()
 */
export function createRoomRepositoryMock(): RoomRepositoryMock {
    return {
        findManagerStore: vi.fn(),
        findRoomPlanRows: vi.fn().mockResolvedValue([]),
        findRoomPlan: vi.fn(),
        updateRoomPlan: vi.fn(),
        countRoomGroups: vi.fn(),
        findRoomGroupRows: vi.fn().mockResolvedValue([]),
        findRoomGroup: vi.fn(),
        insertRoomGroup: vi.fn(),
        updateRoomGroup: vi.fn(),
        deleteRoomGroup: vi.fn(),
        insertRoomGroupPlans: vi.fn(),
        findRoomGroupPlanRows: vi.fn().mockResolvedValue([]),
        findRoomGroupPlan: vi.fn(),
        updateRoomGroupPlan: vi.fn(),
        findRoomGroupImages: vi.fn().mockResolvedValue([]),
        findRoomGroupImage: vi.fn(),
        insertRoomGroupImage: vi.fn(),
        updateRoomGroupImage: vi.fn(),
        deleteRoomGroupImage: vi.fn(),
        deleteRoomGroupImages: vi.fn(),
        countRoomGroupPlanPrices: vi.fn().mockResolvedValue(0),
        findRoomGroupPlanPriceList: vi.fn().mockResolvedValue([]),
        findRoomGroupPlanPrice: vi.fn(),
        insertRoomGroupPlanPrice: vi.fn(),
        updateRoomGroupPlanPrice: vi.fn(),
        deleteRoomGroupPlanPrice: vi.fn().mockResolvedValue(true),
        countRooms: vi.fn(),
        findRoomRows: vi.fn().mockResolvedValue([]),
        findRoom: vi.fn(),
        insertRoom: vi.fn(),
        updateRoom: vi.fn(),
        deleteRoom: vi.fn(),
        deleteRooms: vi.fn(),
    };
}

/**
 * 파일 저장소 포트 mock — 업로드 주소 · 공개 주소는 키로 만든 고정 값, 존재 확인 · 삭제는 성공.
 *
 * @returns mock
 */
export function createStorageGatewayMock(): StorageGatewayMock {
    return {
        createUploadUrl: vi.fn().mockResolvedValue({upload_url: 'https://s3.test/upload', expires_at: new Date(2026, 0, 1, 0, 10)}),
        exists: vi.fn().mockResolvedValue(true),
        getPublicUrl: vi.fn((key: string) => `https://cdn.test/${key}`),
        remove: vi.fn().mockResolvedValue(undefined),
        createDownloadUrl: vi.fn((key: string) => Promise.resolve({download_url: `https://s3.test/signed/${key}`, expires_at: new Date(2026, 0, 1, 0, 10)})),
    };
}

/**
 * 큐 경로 부팅 — 실제 RoomQueueController · RoomService · CommandHandlerRegistry · CommandDispatcher 에 repository · 저장소 포트만 mock.
 * registry 가 @OnCommand 를 찾도록 DiscoveryModule + module.init() 이 필수다.
 *
 * @param repo repository mock
 * @param storage 파일 저장소 포트 mock
 * @returns 디스패처와 테스트 모듈
 */
export async function bootCommandPath(repo: RoomRepositoryMock, storage: StorageGatewayMock = createStorageGatewayMock()): Promise<{dispatcher: CommandDispatcher; module: TestingModule}> {
    const module = await Test.createTestingModule({
        imports: [DiscoveryModule],
        providers: [RoomService, RoomQueueController, CommandHandlerRegistry, CommandDispatcher, {provide: ROOM_REPOSITORY, useValue: repo}, {provide: STORAGE_GATEWAY, useValue: storage}],
    }).compile();
    await module.init();
    return {dispatcher: module.get(CommandDispatcher), module};
}

/**
 * 동기 경로 부팅 — 실제 내부 RoomController · RoomService · ValidationPipe · 필터 · 전역 InternalAuthGuard(APP_GUARD) · ReturnedExceptionInterceptor(APP_INTERCEPTOR)
 * (admin-service.module 과 같다) 에 repository · 저장소 포트만 mock.
 *
 * @param repo repository mock
 * @param storage 파일 저장소 포트 mock
 * @returns Nest 앱
 */
export async function bootHttpPath(repo: RoomRepositoryMock, storage: StorageGatewayMock = createStorageGatewayMock()): Promise<INestApplication> {
    process.env.INTERNAL_API_TOKEN = TEST_INTERNAL_TOKEN;
    const module = await Test.createTestingModule({
        controllers: [RoomController],
        providers: [
            RoomService,
            {provide: ROOM_REPOSITORY, useValue: repo},
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
 * 게이트웨이가 붙이는 내부 요청 헤더 — actor 가 있으면 로그인 회원 헤더도.
 *
 * @param actor 로그인 회원
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
 * 게이트웨이가 발행하는 것과 같은 명령 봉투를 디스패처에 넣는다.
 *
 * @param dispatcher 디스패처
 * @param params 명령 type · 본문(path param + 본문 DTO) · actor · 이전 전달 횟수
 * @returns 판정 + 명령 봉투 + 결과 본문
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
 * 게이트웨이와 같은 ValidationPipe 설정으로 본문 · path param 을 검증한다 — 큐 경로 DTO 는 게이트웨이에서만 검증되므로(서비스 큐 컨트롤러는 재검증하지 않는다) 여기서 확인한다.
 *
 * @param metatype 본문 · param DTO 클래스
 * @param body 요청 본문 또는 path param 객체
 * @returns 실패 본문 또는 null(통과)
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
        refund_deadline_hours: 1,
        suspend_comment: null,
        is_deleted: 0,
        delete_backup: null,
        created_at: FIXED_TIME,
        updated_at: FIXED_TIME,
        ...override,
    };
}

/**
 * 업체 상품 설정 행 (종류명 조인 — 기본은 1박, time 컬럼은 'HH:mm:ss' 로 온다). findRoomPlan 의 엔티티 자리에도 쓴다.
 *
 * @param override 바꿀 필드
 * @returns 상품 설정 행
 */
export function planRow(override: Partial<RoomPlanRow> = {}): RoomPlanRow {
    return {
        room_plan_id: ROOM_PLAN_ID,
        store_id: STORE_ID,
        room_plan_type_id: 'NIGHT',
        room_plan_type_name: '1박',
        is_used: 1,
        days_of_week: 127,
        usage_hours: null,
        check_in_time: '15:00:00',
        check_out_time: '11:00:00',
        ...override,
    };
}

/**
 * 객실 그룹 목록 행 (지워지지 않은 호실 수 · 대표 사진 키)
 *
 * @param override 바꿀 필드
 * @returns 그룹 목록 행
 */
export function roomGroupRow(override: Partial<RoomGroupRow> = {}): RoomGroupRow {
    return {room_group_id: ROOM_GROUP_ID, room_group_name: '스탠다드', created_at: FIXED_TIME, room_count: 3, cover_file_key: IMAGE_KEY, ...override};
}

/**
 * 객실 그룹 엔티티 (조회 뒤 상세정보 항목이 모두 채워진 모양 — @AfterLoad)
 *
 * @param override 바꿀 필드
 * @returns 그룹
 */
export function roomGroupEntity(override: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        room_group_id: ROOM_GROUP_ID,
        store_id: STORE_ID,
        room_group_name: '스탠다드',
        description: null,
        room_group_detail: {room_count: 1, has_shower: 1, has_tv: 1, has_pc: 1},
        is_deleted: 0,
        created_at: FIXED_TIME,
        updated_at: FIXED_TIME,
        ...override,
    };
}

/**
 * 그룹 사진 행 (그 그룹 · jpg · 순서 0)
 *
 * @param override 바꿀 필드
 * @returns 사진 행
 */
export function imageRow(override: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        room_group_image_id: ROOM_GROUP_IMAGE_ID,
        room_group_id: ROOM_GROUP_ID,
        file_key: IMAGE_KEY,
        file_name: '객실.jpg',
        content_type: 'image/jpeg',
        sort_order: 0,
        is_deleted: 0,
        created_at: FIXED_TIME,
        updated_at: FIXED_TIME,
        ...override,
    };
}

/**
 * 그룹 상품 행 (종류명 조인 — 기본은 1박 · 사용 안 함 · 0원). findRoomGroupPlan 의 엔티티 자리에도 쓴다.
 *
 * @param override 바꿀 필드
 * @returns 그룹 상품 행
 */
export function groupPlanRow(override: Partial<RoomGroupPlanRow> = {}): RoomGroupPlanRow {
    return {room_group_plan_id: ROOM_GROUP_PLAN_ID, room_group_id: ROOM_GROUP_ID, room_plan_type_id: 'NIGHT', room_plan_type_name: '1박', is_used: 0, price: 0, ...override};
}

/**
 * 기간 가격 행 (date 컬럼은 'YYYY-MM-DD' 문자열로 온다)
 *
 * @param override 바꿀 필드
 * @returns 기간 가격 행
 */
export function priceRow(override: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        room_group_plan_price_id: ROOM_GROUP_PLAN_PRICE_ID,
        room_group_plan_id: ROOM_GROUP_PLAN_ID,
        start_date: '2026-07-01',
        end_date: '2026-08-31',
        price: 120000,
        memo: '여름 성수기',
        is_deleted: 0,
        created_at: FIXED_TIME,
        updated_at: FIXED_TIME,
        ...override,
    };
}

/**
 * 호실 목록 행 (그룹명 · 상태명 조인)
 *
 * @param override 바꿀 필드
 * @returns 호실 목록 행
 */
export function roomRow(override: Partial<RoomRow> = {}): RoomRow {
    return {
        room_id: ROOM_ID,
        room_group_id: ROOM_GROUP_ID,
        room_group_name: '스탠다드',
        room_name: '101호',
        floor: 1,
        room_state_id: 'AVAILABLE',
        room_state_name: '예약가능',
        created_at: FIXED_TIME,
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
