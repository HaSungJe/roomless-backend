import {ApiProperty} from '@nestjs/swagger';

/**
 * 내 정보 — 로그인한 이용자 본인의 회원 정보(마이페이지). 입력 없음(로그인 회원은 게이트웨이가 actor 로 넘긴다)
 */
export class UserMeResultDto {
    @ApiProperty({description: '회원 ID'})
    user_id: string;

    @ApiProperty({description: '회원 식별 코드 (고객 문의 때 알려 주는 코드)'})
    user_search_code: string;

    @ApiProperty({description: '닉네임'})
    nickname: string;

    @ApiProperty({description: '성별 (M: 남, F: 여)'})
    gender: string;

    @ApiProperty({description: '생년월일 (YYYY-MM-DD)'})
    birth: string;

    @ApiProperty({description: '가입한 SNS (KAKAO · NAVER, 없으면 null)', nullable: true, type: String})
    sns_id: string | null;

    @ApiProperty({description: '휴대폰 번호 (숫자만, 미인증 null)', nullable: true, type: String})
    phone: string | null;

    @ApiProperty({description: '휴대폰 SMS 인증 여부 (0: 미인증, 1: 인증)'})
    is_phone_verified: number;

    @ApiProperty({description: '회원 상태 (ACTIVE: 정상, BLOCK: 이용 제한, LEAVE_WAIT: 탈퇴 대기)'})
    state_id: string;

    @ApiProperty({description: '이용 제한 사유 (이용 제한이 아니면 null)', nullable: true, type: String})
    block_comment: string | null;

    @ApiProperty({description: '탈퇴 예정 시각 (YYYY-MM-DD HH:mm:ss 한국 시각, 탈퇴 대기가 아니면 null)', nullable: true, type: String})
    leave_reserved_at: string | null;

    @ApiProperty({description: '가입일시 (ISO 8601)'})
    created_at: string;
}
