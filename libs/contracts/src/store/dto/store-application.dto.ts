import {ApiProperty} from '@nestjs/swagger';
import {IsLatitude, IsLongitude, IsNotEmpty, IsOptional, Matches, MaxLength} from 'class-validator';

/**
 * 입점 신청 — 업체 정보 (이용자). 업체 정보 파일은 신청 뒤 따로 붙인다. 위경도는 클라이언트가 주소 검색으로 구해 보낸다.
 * 대표자가 업체 총관리자다 — 승인 때 대표자명 · 대표자 휴대폰 번호로 매니저 계정을 만든다.
 */
export class StoreApplicationDto {
    @ApiProperty({description: '상호명', example: '룸리스 강남점'})
    @MaxLength(100, {message: '상호명은 100자 이내로 입력해주세요.'})
    @IsNotEmpty({message: '상호명을 입력해주세요.'})
    store_name: string;

    @ApiProperty({description: '사업자등록번호 (숫자 10자리)', example: '1234567890'})
    @Matches(/^\d{10}$/, {message: '사업자등록번호 10자리를 숫자만 입력해주세요.'})
    @IsNotEmpty({message: '사업자등록번호를 입력해주세요.'})
    business_number: string;

    @ApiProperty({description: '대표자명 — 승인 때 업체 총관리자 계정의 이름'})
    @MaxLength(50, {message: '대표자명은 50자 이내로 입력해주세요.'})
    @IsNotEmpty({message: '대표자명을 입력해주세요.'})
    owner_name: string;

    @ApiProperty({description: '대표자 휴대폰 번호 (숫자만) — 승인 때 업체 총관리자 계정 · 안내 SMS', example: '01012345678'})
    @Matches(/^01[016789]\d{7,8}$/, {message: '대표자 휴대폰 번호를 숫자만 정확히 입력해주세요.'})
    @IsNotEmpty({message: '대표자 휴대폰 번호를 입력해주세요.'})
    owner_phone: string;

    @ApiProperty({description: '업체 총관리자 아이디 (영문 · 숫자 · _ 4~30자) — 승인 때 이 아이디로 업체 총관리자 계정을 만든다'})
    @Matches(/^[a-zA-Z0-9_]{4,30}$/, {message: '아이디는 영문 · 숫자 · _ 4~30자로 입력해주세요.'})
    @IsNotEmpty({message: '업체 총관리자 아이디를 입력해주세요.'})
    head_manager_login_id: string;

    @ApiProperty({description: '업체 총관리자 비밀번호 (8~20자, 영문+숫자 필수, 특수문자 !@#$%^&* 허용) — 해시로만 저장한다'})
    @Matches(/^(?=.*[a-zA-Z])(?=.*\d)[a-zA-Z0-9!@#$%^&*]{8,20}$/, {message: '비밀번호는 8~20자이며 영문과 숫자를 반드시 포함해야 합니다. (특수문자는 !@#$%^&* 만 허용)'})
    @IsNotEmpty({message: '업체 총관리자 비밀번호를 입력해주세요.'})
    head_manager_login_pw: string;

    @ApiProperty({description: '업체 연락처 (숫자만)', example: '0212345678'})
    @Matches(/^\d{8,11}$/, {message: '업체 연락처를 숫자만 정확히 입력해주세요.'})
    @IsNotEmpty({message: '업체 연락처를 입력해주세요.'})
    phone: string;

    @ApiProperty({description: '주소'})
    @MaxLength(255, {message: '주소는 255자 이내로 입력해주세요.'})
    @IsNotEmpty({message: '주소를 입력해주세요.'})
    address: string;

    @ApiProperty({description: '상세주소', required: false})
    @IsOptional()
    @MaxLength(255, {message: '상세주소는 255자 이내로 입력해주세요.'})
    address_detail?: string;

    @ApiProperty({description: '위도 (WGS84)', example: 37.4979})
    @IsLatitude({message: '위도가 올바르지 않습니다.'})
    @IsNotEmpty({message: '위도를 입력해주세요.'})
    latitude: number;

    @ApiProperty({description: '경도 (WGS84)', example: 127.0276})
    @IsLongitude({message: '경도가 올바르지 않습니다.'})
    @IsNotEmpty({message: '경도를 입력해주세요.'})
    longitude: number;

    @ApiProperty({description: '신청 메모', required: false})
    @IsOptional()
    @MaxLength(500, {message: '신청 메모는 500자 이내로 입력해주세요.'})
    application_comment?: string;
}

/**
 * 입점 신청 결과
 */
export class StoreApplicationResultDto {
    @ApiProperty({description: '입점 신청 ID — 업체 정보 파일을 붙일 때 쓴다'})
    store_application_id: string;
}
