import {ApiProperty} from '@nestjs/swagger';
import {IsLatitude, IsLongitude, IsNotEmpty, IsOptional, Matches, MaxLength} from 'class-validator';

/**
 * 업체 정보 수정 path param (총관리자)
 */
export class StoreUpdateParamDto {
    @ApiProperty({description: '업체 ID'})
    @Matches(/^[a-f0-9]{32}$/, {message: '업체 ID가 올바르지 않습니다.'})
    @IsNotEmpty({message: '업체 ID를 입력해주세요.'})
    store_id: string;
}

/**
 * 업체 정보 수정 — 사업자등록번호는 바꾸지 않는다. 상세주소는 비우면 null
 */
export class StoreUpdateDto {
    @ApiProperty({description: '상호명'})
    @MaxLength(100, {message: '상호명은 100자 이내로 입력해주세요.'})
    @IsNotEmpty({message: '상호명을 입력해주세요.'})
    store_name: string;

    @ApiProperty({description: '대표자명'})
    @MaxLength(50, {message: '대표자명은 50자 이내로 입력해주세요.'})
    @IsNotEmpty({message: '대표자명을 입력해주세요.'})
    owner_name: string;

    @ApiProperty({description: '업체 연락처 (숫자만)'})
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

    @ApiProperty({description: '위도 (WGS84)'})
    @IsLatitude({message: '위도가 올바르지 않습니다.'})
    @IsNotEmpty({message: '위도를 입력해주세요.'})
    latitude: number;

    @ApiProperty({description: '경도 (WGS84)'})
    @IsLongitude({message: '경도가 올바르지 않습니다.'})
    @IsNotEmpty({message: '경도를 입력해주세요.'})
    longitude: number;
}
