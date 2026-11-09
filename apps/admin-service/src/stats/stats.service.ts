import {BadRequestException, Inject, Injectable, NotFoundException} from '@nestjs/common';
import {In} from 'typeorm';
import {dayjs} from '@app/common/utils/dayjs.js';
import {Pagination} from '@app/common/utils/pagination.js';
import {createValidationError} from '@app/common/utils/validation.js';
import type {StatsMineDto, StatsMineResultDto} from '@app/contracts/stats/dto/stats-mine.dto.js';
import type {StatsDto, StatsResultDto} from '@app/contracts/stats/dto/stats.dto.js';
import type {StatsFilter, StatsRepositoryInterface} from './interfaces/stats.repository.interface.js';
import {STATS_ALL_STORES} from './stats.constants.js';
import {STATS_REPOSITORY} from './stats.symbols.js';
import {collectStatsStoreIds, resolveStatsPeriod, toStats} from './stats.util.js';

/**
 * 통계 service(admin-service) — 관리자 메인 화면의 이용자 수 · 이용 건수 · 결제액 · 환불액 · 수익(사용자 결정 2026-11-09).
 * 전체(총관리자 · 관리자 — 업체별 목록 포함) · 내 업체(업체 관리자). 읽기만이라 @Transactional 없음.
 */
@Injectable()
export class StatsService {
    /**
     * @param statsRepository 통계 repository 포트
     */
    constructor(@Inject(STATS_REPOSITORY) private readonly statsRepository: StatsRepositoryInterface) {}

    /**
     * 전체 통계 — 합계 · 월별 · 업체별(기본 활동 있는 업체, has_activity 0 이면 모든 업체 — 수익 내림차순 · 페이지). (내부 HTTP: GET /internal/v1/admin-service/stats)
     *
     * @param dto 월 기간 · 결제 환경 · 업체 범위 · 페이지
     * @returns 전체 통계
     */
    async getStats(dto: StatsDto): Promise<StatsResultDto> {
        // 1. 기간 — 시작 > 끝 · 12개월 초과는 입력 필드 오류
        const period = resolveStatsPeriod(dto.start_month, dto.end_month, dayjs());
        if (typeof period === 'string') {
            throw new BadRequestException({message: period, validation_errors: createValidationError('start_month', period)});
        }

        // 2. 집계 — 이용(업체 · 달 · 전체) · 결제 · 환불
        const filter: StatsFilter = {from: period.from, to: period.to, environment: dto.environment, store_id: null};
        const usage = await this.statsRepository.findUsageRows(filter);
        const payments = await this.statsRepository.findPaymentRows(filter);
        const refunds = await this.statsRepository.findRefundRows(filter);

        // 3. 목록에 넣을 업체 — 모든 업체 또는 활동 있는 업체(없으면 조회 없이 빈 목록)
        const ids = collectStatsStoreIds(usage, payments, refunds);
        const stores = dto.has_activity === STATS_ALL_STORES ? await this.statsRepository.findStatsStores({}) : ids.length > 0 ? await this.statsRepository.findStatsStores({store_id: In(ids)}) : [];

        // 4. 모으기 → 업체별은 계산한 목록을 페이지로 자른다
        const stats = toStats(period.months, usage, payments, refunds, stores);
        const pagination = new Pagination({...dto, total_count: stats.stores.length});
        return {
            period: {start_month: period.start_month, end_month: period.end_month, environment: dto.environment},
            total: stats.total,
            monthly: stats.monthly,
            stores: {list: stats.stores.slice(pagination.offset, pagination.offset + pagination.limit), pagination: pagination.getPagination()},
        };
    }

    /**
     * 내 업체 통계 — 로그인 업체 관리자의 소속 업체만 합계 · 월별. (내부 HTTP: GET /internal/v1/admin-service/stats/mine)
     *
     * @param user_id 로그인 매니저 ID
     * @param dto 월 기간 · 결제 환경
     * @returns 내 업체 통계
     */
    async getMyStats(user_id: string, dto: StatsMineDto): Promise<StatsMineResultDto> {
        // 1. 소속 업체
        const store = await this.statsRepository.findManagerStore(user_id);
        if (!store) {
            throw new NotFoundException({message: '소속 업체를 찾을 수 없습니다.'});
        }

        // 2. 기간
        const period = resolveStatsPeriod(dto.start_month, dto.end_month, dayjs());
        if (typeof period === 'string') {
            throw new BadRequestException({message: period, validation_errors: createValidationError('start_month', period)});
        }

        // 3. 집계 — 그 업체만
        const filter: StatsFilter = {from: period.from, to: period.to, environment: dto.environment, store_id: store.store_id};
        const usage = await this.statsRepository.findUsageRows(filter);
        const payments = await this.statsRepository.findPaymentRows(filter);
        const refunds = await this.statsRepository.findRefundRows(filter);
        const stats = toStats(period.months, usage, payments, refunds, [store]);
        return {
            period: {start_month: period.start_month, end_month: period.end_month, environment: dto.environment},
            store: {store_id: store.store_id, store_name: store.store_name},
            total: stats.total,
            monthly: stats.monthly,
        };
    }
}
