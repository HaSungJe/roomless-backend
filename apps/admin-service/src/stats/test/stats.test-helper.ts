import {INestApplication, ValidationPipe} from '@nestjs/common';
import {APP_GUARD, APP_INTERCEPTOR} from '@nestjs/core';
import {Test} from '@nestjs/testing';
import type {Mock} from 'vitest';
import {CustomErrorFilter} from '@app/common/exception/custom-error.filter.js';
import {ReturnedExceptionInterceptor} from '@app/common/exception/returned-exception.interceptor.js';
import {InternalAuthGuard} from '@app/common/internal/internal-auth.guard.js';
import {validationExceptionFactory} from '@app/common/utils/validation.js';
import type {Actor} from '@app/contracts/actor.js';
import {INTERNAL_HEADER} from '@app/contracts/actor.js';
import {StatsController} from '../controllers/stats.controller.js';
import type {StatsAmountRow, StatsRepositoryInterface, StatsUsageRow} from '../interfaces/stats.repository.interface.js';
import {STATS_REPOSITORY} from '../stats.symbols.js';
import {StatsService} from '../stats.service.js';

/** 테스트용 내부 토큰 */
export const TEST_INTERNAL_TOKEN = 'test-internal-token';

/** 지금 — 2026-11-09 12:00 한국(03:00 UTC) */
export const NOW = new Date('2026-11-09T03:00:00Z');

/** 로그인 총관리자 (게이트웨이 관리자 가드를 통과한 actor) */
export const ADMIN_ACTOR: Actor = {user_id: 'd'.repeat(32), auth_id: 'SUPER_ADMIN'};

/** 로그인 업체 관리자 (게이트웨이 매니저 가드를 통과한 actor) */
export const MANAGER_ACTOR: Actor = {user_id: 'e'.repeat(32), auth_id: 'MANAGER'};

/** 업체 ID */
export const STORE_A = 'a'.repeat(32);
export const STORE_B = 'b'.repeat(32);
export const STORE_C = 'c'.repeat(32);

/** 통계 repository mock 타입 */
export type StatsRepositoryMock = {[K in keyof StatsRepositoryInterface]: Mock};

/**
 * 통계 repository mock — 집계 행 · 업체 목록은 빈 배열, 소속 업체는 없음 기본값.
 *
 * @returns 메서드별 vi.fn()
 */
export function createStatsRepositoryMock(): StatsRepositoryMock {
    return {
        findManagerStore: vi.fn().mockResolvedValue(null),
        findUsageRows: vi.fn().mockResolvedValue([]),
        findPaymentRows: vi.fn().mockResolvedValue([]),
        findRefundRows: vi.fn().mockResolvedValue([]),
        findStatsStores: vi.fn().mockResolvedValue([]),
    };
}

/**
 * 동기 경로 부팅 — 실제 내부 StatsController · StatsService · ValidationPipe · 필터 · 전역 InternalAuthGuard(APP_GUARD) · ReturnedExceptionInterceptor(APP_INTERCEPTOR)
 * (admin-service.module 과 같다) 에 repository 만 mock. 통계는 조회만이라 큐 경로가 없다.
 *
 * @param repo repository mock
 * @returns Nest 앱
 */
export async function bootHttpPath(repo: StatsRepositoryMock): Promise<INestApplication> {
    process.env.INTERNAL_API_TOKEN = TEST_INTERNAL_TOKEN;
    const module = await Test.createTestingModule({
        controllers: [StatsController],
        providers: [StatsService, {provide: STATS_REPOSITORY, useValue: repo}, {provide: APP_GUARD, useClass: InternalAuthGuard}, {provide: APP_INTERCEPTOR, useClass: ReturnedExceptionInterceptor}],
    }).compile();
    const app = module.createNestApplication();
    app.useGlobalFilters(new CustomErrorFilter());
    app.useGlobalPipes(new ValidationPipe({transform: true, forbidNonWhitelisted: true, exceptionFactory: validationExceptionFactory}));
    await app.init();
    return app;
}

/**
 * 게이트웨이가 붙이는 내부 요청 헤더 — actor 헤더 포함.
 *
 * @param actor 로그인 계정
 * @returns 헤더
 */
export function internalHeaders(actor: Actor = ADMIN_ACTOR): Record<string, string> {
    return {[INTERNAL_HEADER.TOKEN]: TEST_INTERNAL_TOKEN, [INTERNAL_HEADER.CLIENT_IP]: '10.0.0.1', [INTERNAL_HEADER.ACTOR_USER_ID]: actor.user_id, [INTERNAL_HEADER.ACTOR_AUTH_ID]: actor.auth_id};
}

/**
 * 업체 행 (정상)
 *
 * @param override 바꿀 필드
 * @returns 업체 행
 */
export function storeRow(override: Record<string, unknown> = {}): Record<string, unknown> {
    return {store_id: STORE_A, store_code: 'k'.repeat(32), store_name: '가업체', store_state_id: 'ACTIVE', is_deleted: 0, ...override};
}

/**
 * 이용 집계 행 — 업체별(GROUPING(업체) 0 · GROUPING(달) 1)
 *
 * @param store_id 업체 ID
 * @param user_count 이용자 수
 * @param completed_count 이용 건수
 * @returns 행
 */
export function usageStoreRow(store_id: string, user_count: number | string, completed_count: number | string): StatsUsageRow {
    return {store_id, month: null, grouping_store: 0, grouping_month: 1, user_count, completed_count};
}

/**
 * 이용 집계 행 — 월별(GROUPING(업체) 1 · GROUPING(달) 0)
 *
 * @param month 달
 * @param user_count 이용자 수
 * @param completed_count 이용 건수
 * @returns 행
 */
export function usageMonthRow(month: string, user_count: number | string, completed_count: number | string): StatsUsageRow {
    return {store_id: null, month, grouping_store: 1, grouping_month: 0, user_count, completed_count};
}

/**
 * 이용 집계 행 — 전체(GROUPING 둘 다 1)
 *
 * @param user_count 이용자 수
 * @param completed_count 이용 건수
 * @returns 행
 */
export function usageTotalRow(user_count: number | string, completed_count: number | string): StatsUsageRow {
    return {store_id: null, month: null, grouping_store: 1, grouping_month: 1, user_count, completed_count};
}

/**
 * 결제 · 환불 집계 행
 *
 * @param store_id 업체 ID
 * @param month 달
 * @param amount 금액
 * @returns 행
 */
export function amountRow(store_id: string, month: string, amount: number | string): StatsAmountRow {
    return {store_id, month, amount};
}

/**
 * 모두 0 인 통계 값
 *
 * @returns 통계 값
 */
export function zeroSummary(): Record<string, number> {
    return {user_count: 0, completed_count: 0, paid_amount: 0, refund_amount: 0, profit: 0};
}
