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
import {SMS_SENDER, STORAGE_GATEWAY} from '@app/integration/integration.symbols.js';
import {CommandHandlerRegistry} from '@app/messaging/command-handler.registry.js';
import {CommandDispatcher, DispatchDecision} from '@app/messaging/command.dispatcher.js';
import {buildCommandEnvelope, encodeEnvelope} from '@app/messaging/messaging.util.js';
import {StoreController} from '../controllers/store.controller.js';
import {StoreQueueController} from '../controllers/store.controller.queue.js';
import type {StoreFileRow, StoreRepositoryInterface} from '../interfaces/store.repository.interface.js';
import {StoreService} from '../store.service.js';
import {STORE_REPOSITORY} from '../store.symbols.js';

/** 테스트용 게이트웨이 인스턴스 ID (결과 회신 주소) */
export const TEST_REPLY_TO = 'gw-test';

/** 테스트용 내부 요청 토큰 */
export const TEST_INTERNAL_TOKEN = 'test-internal-token';

/** 고정 시각 — 2026-01-01 00:00 (로컬) */
export const FIXED_TIME = new Date(2026, 0, 1);

/** 신청한 이용자 */
export const USER_ACTOR: Actor = {user_id: 'u'.repeat(32), auth_id: 'USER'};

/** 총관리자 */
export const ADMIN_ACTOR: Actor = {user_id: 'm'.repeat(32), auth_id: 'SUPER_ADMIN'};

/** 업체 관리자 (매니저 그룹 — 업체 총관리자 · 업체 관리자 모두 같은 경로) */
export const MANAGER_ACTOR: Actor = {user_id: 'h'.repeat(32), auth_id: 'MANAGER'};

/** 입점 신청 ID */
export const APPLICATION_ID = 'a'.repeat(32);

/** 업체 ID */
export const STORE_ID = 'b'.repeat(32);

/** 업체코드 */
export const STORE_CODE = 'c'.repeat(32);

/** store repository mock — 모든 메서드가 vi.fn() */
export type StoreRepositoryMock = {[K in keyof StoreRepositoryInterface]: Mock};

/** 파일 저장소 포트 mock */
export type StorageGatewayMock = {createUploadUrl: Mock; exists: Mock; getPublicUrl: Mock; remove: Mock; createDownloadUrl: Mock};

/** SMS 포트 mock */
export type SmsSenderMock = {send: Mock};

/**
 * store repository mock 을 만든다.
 *
 * @returns 메서드별 vi.fn()
 */
export function createStoreRepositoryMock(): StoreRepositoryMock {
    return {
        findApplication: vi.fn(),
        countApplications: vi.fn(),
        findApplicationList: vi.fn(),
        insertApplication: vi.fn(),
        updateApplication: vi.fn().mockResolvedValue(true),
        deleteApplication: vi.fn().mockResolvedValue(true),
        findStoreFilePurpose: vi.fn(),
        findApplicationFileRows: vi.fn(),
        findStoreFileRows: vi.fn(),
        countStoreFiles: vi.fn(),
        findStoreFile: vi.fn(),
        insertStoreFile: vi.fn(),
        deleteStoreFile: vi.fn(),
        deleteApplicationFiles: vi.fn(),
        assignStoreFiles: vi.fn(),
        findStore: vi.fn(),
        findStores: vi.fn(),
        countStores: vi.fn(),
        findStoreList: vi.fn(),
        insertStore: vi.fn(),
        updateStore: vi.fn(),
        findApplicant: vi.fn(),
        insertHeadManager: vi.fn(),
        updateStoreManagers: vi.fn(),
        updateStoreFile: vi.fn(),
        findStoreByManager: vi.fn(),
        findStoreHours: vi.fn().mockResolvedValue([]),
        deleteStoreHours: vi.fn(),
        insertStoreHours: vi.fn(),
        findStoreBreaks: vi.fn().mockResolvedValue([]),
        deleteStoreBreaks: vi.fn(),
        insertStoreBreaks: vi.fn(),
        countUnavailablePeriods: vi.fn(),
        findUnavailablePeriodList: vi.fn(),
        insertUnavailablePeriod: vi.fn(),
        deleteUnavailablePeriod: vi.fn().mockResolvedValue(true),
    };
}

/**
 * 파일 저장소 포트 mock — 서명 주소 · 공개 주소는 키로 만든 고정 값.
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
 * SMS 포트 mock — 기본은 발송 성공.
 *
 * @returns mock
 */
export function createSmsSenderMock(): SmsSenderMock {
    return {send: vi.fn().mockResolvedValue(undefined)};
}

/**
 * 큐 경로 부팅 — 실제 StoreQueueController · StoreService · CommandHandlerRegistry · CommandDispatcher 에 repository · 저장소 · SMS 포트만 mock.
 *
 * @param repo repository mock
 * @param storage 파일 저장소 포트 mock
 * @param sms SMS 포트 mock
 * @returns 디스패처와 테스트 모듈
 */
export async function bootCommandPath(
    repo: StoreRepositoryMock,
    storage: StorageGatewayMock = createStorageGatewayMock(),
    sms: SmsSenderMock = createSmsSenderMock(),
): Promise<{dispatcher: CommandDispatcher; module: TestingModule}> {
    const module = await Test.createTestingModule({
        imports: [DiscoveryModule],
        providers: [
            StoreService,
            StoreQueueController,
            CommandHandlerRegistry,
            CommandDispatcher,
            {provide: STORE_REPOSITORY, useValue: repo},
            {provide: STORAGE_GATEWAY, useValue: storage},
            {provide: SMS_SENDER, useValue: sms},
        ],
    }).compile();
    await module.init();
    return {dispatcher: module.get(CommandDispatcher), module};
}

/**
 * 동기 경로 부팅 — 실제 내부 StoreController · StoreService · ValidationPipe · 필터 · 전역 InternalAuthGuard(APP_GUARD) · ReturnedExceptionInterceptor(APP_INTERCEPTOR)
 * (admin-service.module 과 같다) 에 repository · 저장소 · SMS 포트만 mock.
 *
 * @param repo repository mock
 * @param storage 파일 저장소 포트 mock
 * @param sms SMS 포트 mock
 * @returns Nest 앱
 */
export async function bootHttpPath(repo: StoreRepositoryMock, storage: StorageGatewayMock = createStorageGatewayMock(), sms: SmsSenderMock = createSmsSenderMock()): Promise<INestApplication> {
    process.env.INTERNAL_API_TOKEN = TEST_INTERNAL_TOKEN;
    const module = await Test.createTestingModule({
        controllers: [StoreController],
        providers: [
            StoreService,
            {provide: STORE_REPOSITORY, useValue: repo},
            {provide: STORAGE_GATEWAY, useValue: storage},
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
 * @param params 명령 type · 본문 · actor · 이전 전달 횟수
 * @returns 판정 + 명령 봉투
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
 * 입점 신청 행 (대기)
 *
 * @param override 바꿀 필드
 * @returns 신청 행
 */
export function applicationRow(override: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        store_application_id: APPLICATION_ID,
        user_id: USER_ACTOR.user_id,
        store_application_state_id: 'WAIT',
        store_id: null,
        store_name: '룸리스 강남점',
        business_number: '1234567890',
        owner_name: '홍길동',
        owner_phone: '01012345678',
        head_manager_login_id: 'owner01',
        head_manager_login_pw: 'hashed-owner-password',
        phone: '0212345678',
        address: '서울시 강남구',
        address_detail: null,
        latitude: 37.4979,
        longitude: 127.0276,
        application_comment: null,
        reject_comment: null,
        reviewed_at: null,
        created_at: FIXED_TIME,
        updated_at: FIXED_TIME,
        ...override,
    };
}

/**
 * 업체 정보 파일 조회 행 (용도 조인 — is_private 포함)
 *
 * @param override 바꿀 필드
 * @returns 파일 행
 */
export function fileRow(override: Partial<StoreFileRow> = {}): StoreFileRow {
    return {
        store_file_id: 'f'.repeat(32),
        store_file_purpose_id: 'BUSINESS_LICENSE',
        store_application_id: APPLICATION_ID,
        store_id: null,
        file_key: `private/store-application/${APPLICATION_ID}/${'1'.repeat(32)}.jpg`,
        file_name: '사업자등록증.jpg',
        content_type: 'image/jpeg',
        sort_order: 0,
        created_at: FIXED_TIME,
        is_private: 1,
        ...override,
    };
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
        store_detail: {},
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
 * 게이트웨이와 같은 ValidationPipe 설정으로 본문을 검증한다 — 큐 경로 DTO 는 게이트웨이에서만 검증되므로(서비스 큐 컨트롤러는 재검증하지 않는다) 중첩 검증 · 점 경로를 여기서 확인한다.
 *
 * @param metatype 본문 DTO 클래스
 * @param body 요청 본문
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
 * 업체 사진 행 (공개 · 업체에 붙음)
 *
 * @param override 바꿀 필드
 * @returns 파일 행
 */
export function imageRow(override: Partial<StoreFileRow> = {}): StoreFileRow {
    return fileRow({
        store_file_purpose_id: 'STORE_IMAGE',
        store_application_id: null,
        store_id: STORE_ID,
        file_key: `store/${STORE_ID}/${'2'.repeat(32)}.jpg`,
        file_name: '사진.jpg',
        is_private: 0,
        ...override,
    });
}

/**
 * 요일 영업시간 행 (time 컬럼은 'HH:mm:ss' 로 온다)
 *
 * @param override 바꿀 필드
 * @returns 영업시간 행
 */
export function hourRow(override: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        store_hour_id: 'd'.repeat(32),
        store_id: STORE_ID,
        day_of_week: 1,
        is_closed: 0,
        open_time: '09:00:00',
        close_time: '18:00:00',
        created_at: FIXED_TIME,
        updated_at: FIXED_TIME,
        ...override,
    };
}

/**
 * 브레이크타임 행
 *
 * @param override 바꿀 필드
 * @returns 브레이크타임 행
 */
export function breakRow(override: Record<string, unknown> = {}): Record<string, unknown> {
    return {store_break_id: 'e'.repeat(32), store_id: STORE_ID, start_time: '12:00:00', end_time: '13:00:00', created_at: FIXED_TIME, updated_at: FIXED_TIME, ...override};
}

/**
 * 일시 예약불가 행
 *
 * @param override 바꿀 필드
 * @returns 일시 예약불가 행
 */
export function periodRow(override: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        store_unavailable_period_id: '9'.repeat(32),
        store_id: STORE_ID,
        starts_at: new Date('2026-11-02T00:00:00.000Z'),
        ends_at: new Date('2026-11-02T09:00:00.000Z'),
        memo: null,
        created_at: FIXED_TIME,
        updated_at: FIXED_TIME,
        ...override,
    };
}
