import {ApiProperty} from '@nestjs/swagger';
import {IsIn, IsOptional, Matches} from 'class-validator';
import {PaginationDto, PaginationResultDto} from '@app/common/dto/pagination.dto.js';

/**
 * 전체 통계 query (총관리자 · 관리자) — 월 기간 · 결제 환경 · 업체 범위, 업체별 목록 페이지
 */
export class StatsDto extends PaginationDto {
    @ApiProperty({description: '시작 월 (YYYY-MM, 한국) — 없으면 끝 월 − 2개월(3개월)', required: false})
    @IsOptional()
    @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, {message: '시작 월을 YYYY-MM 으로 입력해주세요.'})
    start_month: string | null;

    @ApiProperty({description: '끝 월 (YYYY-MM, 한국) — 없으면 이번 달', required: false})
    @IsOptional()
    @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, {message: '끝 월을 YYYY-MM 으로 입력해주세요.'})
    end_month: string | null;

    @ApiProperty({description: '결제 환경 (LIVE: 실결제, TEST: 토스 테스트 키) — 기본 LIVE', required: false, enum: ['LIVE', 'TEST']})
    @IsOptional()
    @IsIn(['LIVE', 'TEST'], {message: '결제 환경이 올바르지 않습니다.'})
    environment: string;

    @ApiProperty({description: '업체별 목록 범위 (1: 기간 안 활동이 있는 업체만, 0: 모든 업체) — 기본 1', required: false, enum: ['1', '0']})
    @IsOptional()
    @IsIn(['1', '0'], {message: '업체 범위가 올바르지 않습니다.'})
    has_activity: string;

    /**
     * @param data 요청 쿼리 — 빠진 페이지 값은 PaginationDto 기본값, 빠진 월은 null(서비스가 기본 기간), 환경 LIVE · 범위 1
     */
    constructor(data?: Partial<StatsDto>) {
        super(data);
        this.start_month = data?.start_month ?? null;
        this.end_month = data?.end_month ?? null;
        this.environment = data?.environment ?? 'LIVE';
        this.has_activity = data?.has_activity ?? '1';
    }
}

/**
 * 통계 기간
 */
export class StatsPeriodResultDto {
    @ApiProperty({description: '시작 월 (YYYY-MM)'})
    start_month: string;

    @ApiProperty({description: '끝 월 (YYYY-MM)'})
    end_month: string;

    @ApiProperty({description: '결제 환경 (LIVE · TEST)'})
    environment: string;
}

/**
 * 통계 값 — 이용자 수(이용 완료한 서로 다른 이용자) · 이용 건수 · 결제액 · 환불액 · 수익
 */
export class StatsSummaryResultDto {
    @ApiProperty({description: '이용자 수 — 이용 끝이 기간 안인 이용 완료 예약의 서로 다른 이용자(이 범위에서 중복 제거)'})
    user_count: number;

    @ApiProperty({description: '이용 건수 — 이용 끝이 기간 안인 이용 완료 예약 수'})
    completed_count: number;

    @ApiProperty({description: '결제액(원) — 승인 시각이 기간 안인 승인 결제 금액 합(기본 · 연장)'})
    paid_amount: number;

    @ApiProperty({description: '환불액(원) — 환불 신청 시각이 기간 안인 환불 금액 합'})
    refund_amount: number;

    @ApiProperty({description: '수익(원) — 결제액 − 환불액(음수일 수 있다)'})
    profit: number;
}

/**
 * 월별 통계 1달
 */
export class StatsMonthResultDto extends StatsSummaryResultDto {
    @ApiProperty({description: '달 (YYYY-MM, 한국)'})
    month: string;
}

/**
 * 업체별 통계 1업체
 */
export class StatsStoreResultDto extends StatsSummaryResultDto {
    @ApiProperty({description: '업체 ID'})
    store_id: string;

    @ApiProperty({description: '상호명'})
    store_name: string;

    @ApiProperty({description: '업체코드'})
    store_code: string;

    @ApiProperty({description: '업체 상태 (ACTIVE · SUSPEND · LEAVE)'})
    store_state_id: string;
}

/**
 * 업체별 통계 목록
 */
export class StatsStoreListResultDto {
    @ApiProperty({description: '목록 (수익 내림차순, 같으면 상호명 순)', type: () => [StatsStoreResultDto]})
    list: StatsStoreResultDto[];

    @ApiProperty({description: '페이지 정보', type: () => PaginationResultDto})
    pagination: PaginationResultDto;
}

/**
 * 전체 통계
 */
export class StatsResultDto {
    @ApiProperty({description: '기간 · 결제 환경', type: () => StatsPeriodResultDto})
    period: StatsPeriodResultDto;

    @ApiProperty({description: '합계 (이용자 수는 전체에서 중복 제거)', type: () => StatsSummaryResultDto})
    total: StatsSummaryResultDto;

    @ApiProperty({description: '월별 (기간의 모든 달, 오래된 달부터 — 활동 없는 달 0)', type: () => [StatsMonthResultDto]})
    monthly: StatsMonthResultDto[];

    @ApiProperty({description: '업체별', type: () => StatsStoreListResultDto})
    stores: StatsStoreListResultDto;
}
