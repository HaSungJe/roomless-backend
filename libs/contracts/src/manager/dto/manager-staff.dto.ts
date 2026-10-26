import {ApiProperty} from '@nestjs/swagger';
import {IsIn, IsNotEmpty, Matches, MaxLength} from 'class-validator';

/**
 * 업체 관리자 등록 입력 (업체 총관리자) — 업체는 로그인한 업체 총관리자의 업체다. 임시 비밀번호는 그 휴대폰으로 SMS.
 */
export class ManagerStaffDto {
    @ApiProperty({description: '로그인 아이디 (영문 · 숫자 · _ 4~30자, 업체 안에서 유일)'})
    @Matches(/^[a-zA-Z0-9_]{4,30}$/, {message: '아이디는 영문 · 숫자 · _ 4~30자로 입력해주세요.'})
    @IsNotEmpty({message: '아이디를 입력해주세요.'})
    login_id: string;

    @ApiProperty({description: '이름 (닉네임도 같은 값)'})
    @MaxLength(50, {message: '이름은 50자 이내로 입력해주세요.'})
    @IsNotEmpty({message: '이름을 입력해주세요.'})
    name: string;

    @ApiProperty({description: '휴대폰 번호 (숫자만, 업체 안에서 유일) — 임시 비밀번호 · 아이디 찾기 · 비밀번호 초기화', example: '01012345678'})
    @Matches(/^01[016789]\d{7,8}$/, {message: '휴대폰 번호를 숫자만 정확히 입력해주세요.'})
    @IsNotEmpty({message: '휴대폰 번호를 입력해주세요.'})
    phone: string;

    @ApiProperty({description: '성별', enum: ['M', 'F']})
    @IsIn(['M', 'F'], {message: '성별이 올바르지 않습니다.'})
    @IsNotEmpty({message: '성별을 입력해주세요.'})
    gender: string;

    @ApiProperty({description: '생년월일 (YYYY-MM-DD)', example: '1990-01-01'})
    @Matches(/^\d{4}-\d{2}-\d{2}$/, {message: '생년월일은 YYYY-MM-DD 형식이어야 합니다.'})
    @IsNotEmpty({message: '생년월일을 입력해주세요.'})
    birth: string;
}

/**
 * 업체 관리자 등록 결과
 */
export class ManagerStaffResultDto {
    @ApiProperty({description: '등록한 업체 관리자 회원 ID'})
    user_id: string;
}
