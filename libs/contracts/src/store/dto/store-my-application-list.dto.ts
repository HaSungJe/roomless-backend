import {ApiProperty} from '@nestjs/swagger';
import {PaginationDto, PaginationResultDto} from '@app/common/dto/pagination.dto.js';

/**
 * 내 입점 신청 목록 query — 페이지만. 대기 · 반려 · 승인 모두 나온다(승인 신청은 업체코드 포함).
 */
export class StoreMyApplicationListDto extends PaginationDto {
    /**
     * @param data 요청 쿼리 — 빠진 페이지 값은 PaginationDto 기본값
     */
    constructor(data?: Partial<StoreMyApplicationListDto>) {
        super(data);
    }
}

/**
 * 내 입점 신청 목록 항목
 */
export class StoreMyApplicationItemResultDto {
    @ApiProperty({description: '입점 신청 ID'})
    store_application_id: string;

    @ApiProperty({description: '신청 상태 (WAIT: 대기, REJECTED: 반려)'})
    store_application_state_id: string;

    @ApiProperty({description: '상호명'})
    store_name: string;

    @ApiProperty({description: '사업자등록번호'})
    business_number: string;

    @ApiProperty({description: '반려 사유 (반려가 아니면 null)', nullable: true, type: String})
    reject_comment: string | null;

    @ApiProperty({description: '처리일시 (ISO 8601, 대기면 null)', nullable: true, type: String})
    reviewed_at: string | null;

    @ApiProperty({description: '신청일시 (ISO 8601)'})
    created_at: string;

    @ApiProperty({description: '업체코드 — 승인 신청이면 그 업체의 코드(매니저 로그인 · 매니저 화면 주소), 아니면 null', nullable: true, type: String})
    store_code: string | null;
}

/**
 * 내 입점 신청 목록
 */
export class StoreMyApplicationListResultDto {
    @ApiProperty({description: '목록 (신청일 최신순)', type: () => [StoreMyApplicationItemResultDto]})
    list: StoreMyApplicationItemResultDto[];

    @ApiProperty({description: '페이지 정보', type: () => PaginationResultDto})
    pagination: PaginationResultDto;
}
