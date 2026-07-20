import { ApiProperty } from "@nestjs/swagger";

/**
 * 로그인한 회원의 정보
 */
export class PassportUserResultDto {
    @ApiProperty({description: '회원 ID', required: true})
    user_id: string;

    @ApiProperty({description: '로그인 ID', required: true})
    login_id: string;
    
    @ApiProperty({description: '이름', required: true})
    name: string;

    @ApiProperty({description: '성별', required: true})
    gender: string;

    @ApiProperty({description: '생년월일', required: true})
    birth: string;

    @ApiProperty({description: '닉네임', required: true})
    nickname: string;

    @ApiProperty({description: '권한 ID', required: true})
    auth_id: string;

    @ApiProperty({description: '상태 ID', required: true})
    state_id: string;

    @ApiProperty({description: '로그인 가능 여부(0: 불가, 1: 가능)', required: true})
    is_login_able: number;
}

/**
 * 로그인한 회원의 정보 - 성공
 */
export class PassportUserSuccessResultDto {
    @ApiProperty(({description: '회원 정보', required: true, type: PassportUserResultDto}))
    info: PassportUserResultDto;
}