import {ApiProperty} from '@nestjs/swagger';
import {IsNotEmpty, MaxLength, ValidateIf} from 'class-validator';

/**
 * 매니저(총매니저 · 매니저) 로그인 입력 (아이디 · 비밀번호)
 */
export class ManagerLoginDto {
    @ApiProperty({description: '로그인 아이디'})
    @MaxLength(30, {message: '아이디는 30자 이하여야 합니다.'})
    @IsNotEmpty({message: '아이디를 입력해주세요.'})
    login_id: string;

    @ApiProperty({description: '비밀번호'})
    @MaxLength(20, {message: '비밀번호는 20자 이하여야 합니다.'})
    @IsNotEmpty({message: '비밀번호를 입력해주세요.'})
    login_pw: string;

    // device_os / device_token 한 세트: 둘 다 받거나 둘 다 없거나
    // ValidateIf — device_token 입력 시에만 device_os 검증. 양쪽 미입력이면 skip.
    @ApiProperty({description: '디바이스 OS (device_token 과 한 세트)', required: false})
    @ValidateIf((o) => o.device_token !== undefined && o.device_token !== null && o.device_token !== '')
    @MaxLength(20, {message: 'device_os 는 20자 이하여야 합니다.'})
    @IsNotEmpty({message: 'device_token 입력 시 device_os 도 입력해야 합니다.'})
    device_os?: string;

    @ApiProperty({description: '디바이스 토큰 (device_os 와 한 세트)', required: false})
    @ValidateIf((o) => o.device_os !== undefined && o.device_os !== null && o.device_os !== '')
    @MaxLength(255, {message: 'device_token 은 255자 이하여야 합니다.'})
    @IsNotEmpty({message: 'device_os 입력 시 device_token 도 입력해야 합니다.'})
    device_token?: string;
}

/**
 * 매니저 로그인 결과
 */
export class ManagerLoginResultDto {
    @ApiProperty({description: 'Access Token (유효 20분)'})
    access_token: string;

    @ApiProperty({description: 'Refresh Token (유효 365일)'})
    refresh_token: string;

    @ApiProperty({description: 'Access Token 만료일시 (ISO 8601)'})
    access_token_expires_at: string;

    @ApiProperty({description: 'Refresh Token 만료일시 (ISO 8601)'})
    refresh_token_expires_at: string;

    @ApiProperty({description: '비밀번호 변경 필요 여부(0: 불필요, 1: 필요) — 임시 비밀번호로 바뀐 계정은 1'})
    is_password_change_required: number;

    @ApiProperty({description: '권한(HEAD_MANAGER: 총매니저, MANAGER: 매니저) — 관리자 페이지 메뉴 구분'})
    auth_id: string;

    @ApiProperty({description: '소속 업체 ID (없으면 null)', type: String, nullable: true})
    store_id: string | null;
}
