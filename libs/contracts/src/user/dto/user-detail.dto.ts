import {ApiProperty} from '@nestjs/swagger';
import {IsNotEmpty, Matches} from 'class-validator';

/**
 * 이용자 상세 path param
 */
export class UserDetailParamDto {
    @ApiProperty({description: '이용자 회원 ID'})
    @Matches(/^[a-f0-9]{32}$/, {message: '회원 ID가 올바르지 않습니다.'})
    @IsNotEmpty({message: '회원 ID를 입력해주세요.'})
    user_id: string;
}

/**
 * 이용자 예약 건수 요약 — 결제 대기 만료(EXPIRED)는 세지 않는다
 */
export class UserReservationSummaryResultDto {
    @ApiProperty({description: '전체 (결제 대기 만료 제외)'})
    total: number;

    @ApiProperty({description: '진행 중 (결제 대기 · 확정 · 이용 중)'})
    in_progress: number;

    @ApiProperty({description: '이용 완료'})
    completed: number;

    @ApiProperty({description: '취소'})
    canceled: number;
}

/**
 * 이용자 상세
 */
export class UserDetailResultDto {
    @ApiProperty({description: '회원 ID'})
    user_id: string;

    @ApiProperty({description: '회원 식별 코드'})
    user_search_code: string;

    @ApiProperty({description: '닉네임'})
    nickname: string;

    @ApiProperty({description: '이름'})
    name: string;

    @ApiProperty({description: '성별'})
    gender: string;

    @ApiProperty({description: '생년월일'})
    birth: string;

    @ApiProperty({description: '휴대폰 번호 (미인증 · 탈퇴 null)', nullable: true, type: String})
    phone: string | null;

    @ApiProperty({description: '휴대폰 SMS 인증일시 (ISO 8601, 미인증 null)', nullable: true, type: String})
    phone_verified_at: string | null;

    @ApiProperty({description: '가입 SNS (없으면 null)', nullable: true, type: String})
    sns_id: string | null;

    @ApiProperty({description: '상태 (ACTIVE · BLOCK · LEAVE_WAIT · LEAVE)'})
    state_id: string;

    @ApiProperty({description: '이용 제한 사유 (없으면 null)', nullable: true, type: String})
    block_comment: string | null;

    @ApiProperty({description: '탈퇴 예정 시각 (YYYY-MM-DD HH:mm:ss, 탈퇴 대기가 아니면 null)', nullable: true, type: String})
    leave_reserved_at: string | null;

    @ApiProperty({description: '가입일시 (ISO 8601)'})
    created_at: string;

    @ApiProperty({description: '예약 건수 요약', type: () => UserReservationSummaryResultDto})
    reservation_summary: UserReservationSummaryResultDto;
}
