import {ApiProperty} from '@nestjs/swagger';
import {IsOptional, MaxLength} from 'class-validator';
import {PaginationDto, PaginationResultDto} from '@app/common/dto/pagination.dto.js';

/**
 * 업체 관리자 목록 query (업체 총관리자) — 검색어(아이디 · 이름 · 휴대폰 번호 부분 일치)
 */
export class ManagerStaffListDto extends PaginationDto {
    @ApiProperty({description: '검색어 — 아이디 · 이름 · 휴대폰 번호 부분 일치', required: false})
    @IsOptional()
    @MaxLength(100, {message: '검색어는 100자 이내로 입력해주세요.'})
    keyword: string | null;

    /**
     * @param data 요청 쿼리 — 빠진 페이지 값은 PaginationDto 기본값, 빠진 필터는 null
     */
    constructor(data?: Partial<ManagerStaffListDto>) {
        super(data);
        this.keyword = data?.keyword ?? null;
    }
}

/**
 * 업체 관리자 목록 항목 — 업체 총관리자도 함께(위에) 나온다
 */
export class ManagerStaffListItemResultDto {
    @ApiProperty({description: '회원 ID'})
    user_id: string;

    @ApiProperty({description: '로그인 아이디'})
    login_id: string;

    @ApiProperty({description: '이름'})
    name: string;

    @ApiProperty({description: '휴대폰 번호 (없으면 null)', nullable: true, type: String})
    phone: string | null;

    @ApiProperty({description: '권한 (HEAD_MANAGER: 업체 총관리자, MANAGER: 업체 관리자)'})
    auth_id: string;

    @ApiProperty({description: '상태 (ACTIVE: 정상, BLOCK: 정지)'})
    state_id: string;

    @ApiProperty({description: '비밀번호 변경 필요 여부(0: 불필요, 1: 필요 — 임시 비밀번호)'})
    is_password_change_required: number;

    @ApiProperty({description: '등록일시 (ISO 8601)'})
    created_at: string;
}

/**
 * 업체 관리자 목록
 */
export class ManagerStaffListResultDto {
    @ApiProperty({description: '목록 (업체 총관리자가 위, 등록일 최신순)', type: () => [ManagerStaffListItemResultDto]})
    list: ManagerStaffListItemResultDto[];

    @ApiProperty({description: '페이지 정보', type: () => PaginationResultDto})
    pagination: PaginationResultDto;
}
