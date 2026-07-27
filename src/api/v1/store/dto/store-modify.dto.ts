import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, Matches, MaxLength } from 'class-validator';

/**
 * 가맹점 수정 입력 (path param)
 */
export class StoreModifyParamDto {
    @ApiProperty({description: '가맹점 ID (32자)'})
    @Matches(/^[a-f0-9]{32}$/, {message: '가맹점 ID 형식이 올바르지 않습니다.'})
    @IsNotEmpty({message: '가맹점 ID를 입력해주세요.'})
    store_id: string;
}

/**
 * 가맹점 수정 입력 (body) — 사업자등록번호는 수정 대상이 아니라 필드 자체가 없다.
 */
export class StoreModifyDto {
    @ApiProperty({description: '상호명 (최대 100자)'})
    @MaxLength(100, {message: '상호명은 최대 100자까지 입력할 수 있습니다.'})
    @IsNotEmpty({message: '상호명을 입력해주세요.'})
    store_name: string;

    @ApiProperty({description: '대표자명 (최대 50자)'})
    @MaxLength(50, {message: '대표자명은 최대 50자까지 입력할 수 있습니다.'})
    @IsNotEmpty({message: '대표자명을 입력해주세요.'})
    owner_name: string;

    @ApiProperty({description: '가맹점 연락처', example: '02-1234-5678'})
    @Matches(/^\d{2,4}-?\d{3,4}-?\d{4}$/, {message: '연락처 형식이 올바르지 않습니다.'})
    @IsNotEmpty({message: '연락처를 입력해주세요.'})
    phone: string;

    @ApiProperty({description: '주소 (최대 255자)'})
    @MaxLength(255, {message: '주소는 최대 255자까지 입력할 수 있습니다.'})
    @IsNotEmpty({message: '주소를 입력해주세요.'})
    address: string;

    @ApiProperty({description: '상세주소 (선택, 최대 255자)', required: false})
    @IsOptional()
    @MaxLength(255, {message: '상세주소는 최대 255자까지 입력할 수 있습니다.'})
    address_detail?: string;
}
