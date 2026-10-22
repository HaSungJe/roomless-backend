import {ApiProperty} from '@nestjs/swagger';
import {IsNotEmpty, MaxLength} from 'class-validator';

/**
 * 로그인 매니저 조회 path param (게이트웨이 JWT 전략 → admin-service 내부 HTTP)
 */
export class ManagerAuthUserParamDto {
    @ApiProperty({description: '회원 ID'})
    @MaxLength(32, {message: '회원 ID가 올바르지 않습니다.'})
    @IsNotEmpty({message: '회원 ID를 입력해주세요.'})
    user_id: string;
}

/**
 * 로그인 매니저 정보 — 게이트웨이 jwt-manager 전략이 `request.user` 로 쓴다.
 * 매니저 그룹이 아니거나 로그인 불가 상태(is_login_allowed = 0)면 admin-service 가 404 를 돌려준다.
 */
export class ManagerAuthUserResultDto {
    @ApiProperty({description: '회원 ID'})
    user_id: string;

    @ApiProperty({description: '로그인 ID'})
    login_id: string;

    @ApiProperty({description: '이름'})
    name: string;

    @ApiProperty({description: '권한 ID (HEAD_MANAGER · MANAGER)'})
    auth_id: string;

    @ApiProperty({description: '소속 업체 ID (없으면 null)', nullable: true, type: String})
    store_id: string | null;

    @ApiProperty({description: '상태 ID'})
    state_id: string;

    @ApiProperty({description: '로그인 가능 여부(0: 불가, 1: 가능)'})
    is_login_allowed: number;
}
