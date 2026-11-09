import {ApiProperty} from '@nestjs/swagger';
import {IsNotEmpty, Matches} from 'class-validator';

/**
 * 업체 관리자 상세 path param (총관리자 · 관리자)
 */
export class ManagerAccountDetailParamDto {
    @ApiProperty({description: '업체 총관리자 · 업체 관리자 회원 ID'})
    @Matches(/^[a-f0-9]{32}$/, {message: '회원 ID가 올바르지 않습니다.'})
    @IsNotEmpty({message: '회원 ID를 입력해주세요.'})
    user_id: string;
}

/**
 * 업체 관리자 상세 (총관리자 · 관리자)
 */
export class ManagerAccountDetailResultDto {
    @ApiProperty({description: '회원 ID'})
    user_id: string;

    @ApiProperty({description: '업체 ID'})
    store_id: string;

    @ApiProperty({description: '상호명'})
    store_name: string;

    @ApiProperty({description: '업체코드'})
    store_code: string;

    @ApiProperty({description: '업체 상태 (ACTIVE · SUSPEND · LEAVE)'})
    store_state_id: string;

    @ApiProperty({description: '로그인 아이디'})
    login_id: string;

    @ApiProperty({description: '이름'})
    name: string;

    @ApiProperty({description: '휴대폰 번호 (없으면 null)', nullable: true, type: String})
    phone: string | null;

    @ApiProperty({description: '성별 (M · F)'})
    gender: string;

    @ApiProperty({description: '생년월일 (YYYY-MM-DD)'})
    birth: string;

    @ApiProperty({description: '권한 (HEAD_MANAGER: 업체 총관리자, MANAGER: 업체 관리자)'})
    auth_id: string;

    @ApiProperty({description: '상태 (ACTIVE: 정상, BLOCK: 정지)'})
    state_id: string;

    @ApiProperty({description: '정지 사유 (없으면 null)', nullable: true, type: String})
    block_comment: string | null;

    @ApiProperty({description: '비밀번호 변경 필요 여부(0: 불필요, 1: 필요 — 임시 비밀번호)'})
    is_password_change_required: number;

    @ApiProperty({description: '등록일시 (ISO 8601)'})
    created_at: string;
}
