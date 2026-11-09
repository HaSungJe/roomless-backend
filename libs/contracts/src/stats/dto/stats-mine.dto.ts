import {ApiProperty} from '@nestjs/swagger';
import {IsIn, IsOptional, Matches} from 'class-validator';

/**
 * 내 업체 통계 query (업체 총관리자 · 업체 관리자) — 월 기간 · 결제 환경
 */
export class StatsMineDto {
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

    /**
     * @param data 요청 쿼리 — 빠진 월은 null(서비스가 기본 기간), 환경 LIVE
     */
    constructor(data?: Partial<StatsMineDto>) {
        this.start_month = data?.start_month ?? null;
        this.end_month = data?.end_month ?? null;
        this.environment = data?.environment ?? 'LIVE';
    }
}

/**
 * 내 업체 통계 기간
 */
export class StatsMinePeriodResultDto {
    @ApiProperty({description: '시작 월 (YYYY-MM)'})
    start_month: string;

    @ApiProperty({description: '끝 월 (YYYY-MM)'})
    end_month: string;

    @ApiProperty({description: '결제 환경 (LIVE · TEST)'})
    environment: string;
}

/**
 * 내 업체
 */
export class StatsMineStoreResultDto {
    @ApiProperty({description: '업체 ID'})
    store_id: string;

    @ApiProperty({description: '상호명'})
    store_name: string;
}

/**
 * 내 업체 통계 값
 */
export class StatsMineSummaryResultDto {
    @ApiProperty({description: '이용자 수 — 이용 끝이 기간 안인 이용 완료 예약의 서로 다른 이용자'})
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
 * 내 업체 월별 통계 1달
 */
export class StatsMineMonthResultDto extends StatsMineSummaryResultDto {
    @ApiProperty({description: '달 (YYYY-MM, 한국)'})
    month: string;
}

/**
 * 내 업체 통계
 */
export class StatsMineResultDto {
    @ApiProperty({description: '기간 · 결제 환경', type: () => StatsMinePeriodResultDto})
    period: StatsMinePeriodResultDto;

    @ApiProperty({description: '내 업체', type: () => StatsMineStoreResultDto})
    store: StatsMineStoreResultDto;

    @ApiProperty({description: '합계', type: () => StatsMineSummaryResultDto})
    total: StatsMineSummaryResultDto;

    @ApiProperty({description: '월별 (기간의 모든 달, 오래된 달부터 — 활동 없는 달 0)', type: () => [StatsMineMonthResultDto]})
    monthly: StatsMineMonthResultDto[];
}
