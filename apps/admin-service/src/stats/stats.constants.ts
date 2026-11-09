/**
 * 통계 도메인 상수 — 기간 · 집계 대상 상태.
 */
import {PAYMENT_STATE} from '@app/contracts/reservation/reservation.constants.js';

/** 기본 기간 — 이번 달 포함 최근 3개월(사용자 결정 2026-11-09) */
export const STATS_DEFAULT_MONTHS = 3;

/** 최대 기간 — 12개월 */
export const STATS_MAX_MONTHS = 12;

/** 달 형식 */
export const STATS_MONTH_FORMAT = 'YYYY-MM';

/** 결제액에 드는 결제 상태 — 승인된 결제(뒤에 환불이 생겨도 결제액은 승인 시각에 센다) */
export const STATS_PAID_STATES: string[] = [PAYMENT_STATE.DONE, PAYMENT_STATE.REFUND_REQUESTED, PAYMENT_STATE.REFUNDED, PAYMENT_STATE.REFUND_FAILED];

/** 환불액에 드는 결제 상태 — 환불 신청 이후(실패도 돌려줘야 할 돈이라 센다) */
export const STATS_REFUND_STATES: string[] = [PAYMENT_STATE.REFUND_REQUESTED, PAYMENT_STATE.REFUNDED, PAYMENT_STATE.REFUND_FAILED];

/** 업체 범위 — 모든 업체 */
export const STATS_ALL_STORES = '0';

/** 탈퇴 업체 상태 — 업체 관리자 통계에서 소속 업체로 보지 않는다 */
export const STATS_STORE_STATE_LEAVE = 'LEAVE';
