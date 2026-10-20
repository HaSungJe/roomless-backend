import {ApiProperty} from '@nestjs/swagger';
import {IsNotEmpty, MaxLength} from 'class-validator';

/**
 * 로그인 회원 조회 path param (게이트웨이 JWT 전략 → user-service 내부 HTTP)
 */
export class UserAuthUserParamDto {
    @ApiProperty({description: '회원 ID'})
    @MaxLength(32, {message: '회원 ID가 올바르지 않습니다.'})
    @IsNotEmpty({message: '회원 ID를 입력해주세요.'})
    user_id: string;
}

/**
 * 로그인 회원 정보 — 게이트웨이가 `request.user` 로 쓰고, RolesGuard 가 auth_id 를 본다.
 * 로그인 불가 상태(is_login_allowed = 0)거나 회원 설정이 없으면 user-service 가 404 를 돌려준다.
 */
export class UserAuthUserResultDto {
    @ApiProperty({description: '회원 ID'})
    user_id: string;

    @ApiProperty({description: '로그인 ID'})
    login_id: string;

    @ApiProperty({description: '이름'})
    name: string;

    @ApiProperty({description: '성별'})
    gender: string;

    @ApiProperty({description: '생년월일'})
    birth: string;

    @ApiProperty({description: '닉네임'})
    nickname: string;

    @ApiProperty({description: '권한 ID'})
    auth_id: string;

    @ApiProperty({description: '소속 가맹점 ID (인력 계정만 보유, 없으면 null)', nullable: true, type: String})
    store_id: string | null;

    @ApiProperty({description: '상태 ID'})
    state_id: string;

    @ApiProperty({description: '로그인 가능 여부(0: 불가, 1: 가능)'})
    is_login_allowed: number;

    @ApiProperty({description: '휴대폰 SMS 인증 여부(0: 미인증, 1: 인증)'})
    is_phone_verified: number;
}
