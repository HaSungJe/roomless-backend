import {ApiProperty} from '@nestjs/swagger';
import {IsIn, IsOptional, MaxLength} from 'class-validator';
import {PaginationDto, PaginationResultDto} from '@app/common/dto/pagination.dto.js';

/**
 * 이용자 목록 query (총관리자 · 관리자) — 검색어(이름 · 닉네임 · 휴대폰 번호 · 회원 식별 코드 부분 일치) · 상태 · SNS
 */
export class UserListDto extends PaginationDto {
    @ApiProperty({description: '검색어 — 이름 · 닉네임 · 휴대폰 번호 · 회원 식별 코드 부분 일치', required: false})
    @IsOptional()
    @MaxLength(100, {message: '검색어는 100자 이내로 입력해주세요.'})
    keyword: string | null;

    @ApiProperty({description: '상태 (ACTIVE: 정상, BLOCK: 이용 제한, LEAVE_WAIT: 탈퇴 대기, LEAVE: 탈퇴) — 없으면 전체', required: false})
    @IsOptional()
    @IsIn(['ACTIVE', 'BLOCK', 'LEAVE_WAIT', 'LEAVE'], {message: '상태가 올바르지 않습니다.'})
    state_id: string | null;

    @ApiProperty({description: '가입 SNS (GOOGLE · FACEBOOK · APPLE · KAKAO · LINE · NAVER) — 없으면 전체', required: false})
    @IsOptional()
    @IsIn(['GOOGLE', 'FACEBOOK', 'APPLE', 'KAKAO', 'LINE', 'NAVER'], {message: 'SNS 유형이 올바르지 않습니다.'})
    sns_id: string | null;

    /**
     * @param data 요청 쿼리 — 빠진 페이지 값은 PaginationDto 기본값, 빠진 필터는 null
     */
    constructor(data?: Partial<UserListDto>) {
        super(data);
        this.keyword = data?.keyword ?? null;
        this.state_id = data?.state_id ?? null;
        this.sns_id = data?.sns_id ?? null;
    }
}

/**
 * 이용자 목록 항목
 */
export class UserListItemResultDto {
    @ApiProperty({description: '회원 ID'})
    user_id: string;

    @ApiProperty({description: '회원 식별 코드'})
    user_search_code: string;

    @ApiProperty({description: '닉네임'})
    nickname: string;

    @ApiProperty({description: '이름'})
    name: string;

    @ApiProperty({description: '휴대폰 번호 (미인증 · 탈퇴 null)', nullable: true, type: String})
    phone: string | null;

    @ApiProperty({description: '가입 SNS (없으면 null)', nullable: true, type: String})
    sns_id: string | null;

    @ApiProperty({description: '상태 (ACTIVE · BLOCK · LEAVE_WAIT · LEAVE)'})
    state_id: string;

    @ApiProperty({description: '휴대폰 SMS 인증 여부(0: 미인증, 1: 인증)'})
    is_phone_verified: number;

    @ApiProperty({description: '가입일시 (ISO 8601)'})
    created_at: string;
}

/**
 * 이용자 목록
 */
export class UserListResultDto {
    @ApiProperty({description: '목록 (가입 최신순)', type: () => [UserListItemResultDto]})
    list: UserListItemResultDto[];

    @ApiProperty({description: '페이지 정보', type: () => PaginationResultDto})
    pagination: PaginationResultDto;
}
