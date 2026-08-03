import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, Matches, MaxLength } from 'class-validator';

/**
 * 매니저 계정 생성 입력 (총괄매니저)
 * store_id 필드가 없다 — 요청자(총괄매니저)의 store_id 를 자동으로 쓴다.
 */
export class StoreManagerRegisterDto {
    @ApiProperty({description: '로그인 아이디 (4~30자, 영문/숫자/_)'})
    @Matches(/^[a-zA-Z0-9_]{4,30}$/, {message: '아이디는 4~30자의 영문, 숫자, 밑줄(_)만 사용할 수 있습니다.'})
    @IsNotEmpty({message: '아이디를 입력해주세요.'})
    login_id: string;

    @ApiProperty({description: '이름 (최대 50자)'})
    @MaxLength(50, {message: '이름은 최대 50자까지 입력할 수 있습니다.'})
    @IsNotEmpty({message: '이름을 입력해주세요.'})
    name: string;

    @ApiProperty({description: '성별', enum: ['M', 'F']})
    @IsIn(['M', 'F'], {message: '성별이 올바르지 않습니다.'})
    @IsNotEmpty({message: '성별을 입력해주세요.'})
    gender: string;

    @ApiProperty({description: '생년월일 (YYYY-MM-DD)', example: '1990-01-01'})
    @Matches(/^\d{4}-\d{2}-\d{2}$/, {message: '생년월일은 YYYY-MM-DD 형식이어야 합니다.'})
    @IsNotEmpty({message: '생년월일을 입력해주세요.'})
    birth: string;

    @ApiProperty({description: '닉네임 (최대 12자, 특수문자 불가)'})
    @MaxLength(12, {message: '닉네임은 최대 12자까지 입력할 수 있습니다.'})
    @Matches(/^[가-힣ㄱ-ㅎㅏ-ㅣa-zA-Z0-9\s]+$/, {message: '닉네임에 특수문자는 사용할 수 없습니다.'})
    @IsNotEmpty({message: '닉네임을 입력해주세요.'})
    nickname: string;
}

/**
 * 매니저 계정 생성 응답 — 임시 비밀번호는 여기서만 평문으로 노출된다.
 */
export class StoreManagerRegisterResultDto {
    @ApiProperty({description: '생성된 회원 ID'})
    user_id: string;

    @ApiProperty({description: '로그인 아이디'})
    login_id: string;

    @ApiProperty({description: '임시 비밀번호 (이 응답에서만 확인 가능)'})
    temporary_password: string;
}
