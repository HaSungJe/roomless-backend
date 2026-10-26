import {ApiProperty} from '@nestjs/swagger';
import {IsNotEmpty, Matches} from 'class-validator';

/**
 * 업체 관리자 상세 path param
 */
export class ManagerStaffDetailParamDto {
    @ApiProperty({description: '업체 관리자 회원 ID'})
    @Matches(/^[a-f0-9]{32}$/, {message: '회원 ID가 올바르지 않습니다.'})
    @IsNotEmpty({message: '회원 ID를 입력해주세요.'})
    user_id: string;
}

/**
 * 업체 관리자 상세
 */
export class ManagerStaffDetailResultDto {
    @ApiProperty({description: '회원 ID'})
    user_id: string;

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

    @ApiProperty({description: '권한 (MANAGER)'})
    auth_id: string;

    @ApiProperty({description: '상태 (ACTIVE: 정상, BLOCK: 정지)'})
    state_id: string;

    @ApiProperty({description: '정지 사유 (없으면 null)', nullable: true, type: String})
    block_comment: string | null;

    @ApiProperty({description: '비밀번호 변경 필요 여부(0: 불필요, 1: 필요 — 임시 비밀번호)'})
    is_password_change_required: number;

    @ApiProperty({description: '등록일시 (ISO 8601)'})
    created_at: string;

    @ApiProperty({description: '수정일시 (ISO 8601)'})
    updated_at: string;
}
