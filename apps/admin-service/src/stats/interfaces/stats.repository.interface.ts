import type {FindOptionsWhere} from 'typeorm';
import type {StoreEntity} from '@app/database/entities/store/store.entity.js';

/** 통계 집계 조건 — 한국 시각 기간 [from, to) · 결제 환경 · 업체(내 업체 통계 — 전체면 null) */
export interface StatsFilter {
    from: Date;
    to: Date;
    environment: string;
    store_id: string | null;
}

/** 이용 집계 행 — GROUPING SETS((업체), (달), ()) 결과. grouping_* 1 이면 그 축으로 묶지 않은 행 (QueryBuilder raw) */
export interface StatsUsageRow {
    store_id: string | null;
    month: string | null;
    grouping_store: number | string;
    grouping_month: number | string;
    user_count: number | string;
    completed_count: number | string;
}

/** 결제 · 환불 집계 행 — (업체, 달) 합 (QueryBuilder raw) */
export interface StatsAmountRow {
    store_id: string;
    month: string;
    amount: number | string;
}

/**
 * 통계 repository 포트 — 공유 DB 의 예약 · 구간 · 결제 · 업체 · 회원을 통계 어휘로 읽기만 한다(쓰기 없음).
 */
export interface StatsRepositoryInterface {
    /** 업체 관리자의 소속 업체 — 매니저 그룹 · 탈퇴 아닌 · 지워지지 않은 업체 */
    findManagerStore(user_id: string): Promise<StoreEntity | null>;
    /** 이용 집계 — 업체별 · 월별 · 전체(이용자 수는 범위마다 중복 제거) */
    findUsageRows(filter: StatsFilter): Promise<StatsUsageRow[]>;
    /** 결제 집계 — (업체, 승인 달) 결제액 */
    findPaymentRows(filter: StatsFilter): Promise<StatsAmountRow[]>;
    /** 환불 집계 — (업체, 환불 신청 달) 환불액 */
    findRefundRows(filter: StatsFilter): Promise<StatsAmountRow[]>;
    /** 업체별 목록에 넣을 업체 — 지워지지 않은 업체 */
    findStatsStores(where: FindOptionsWhere<StoreEntity>): Promise<StoreEntity[]>;
}
