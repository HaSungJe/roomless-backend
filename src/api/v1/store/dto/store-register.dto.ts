import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, Matches, MaxLength } from 'class-validator';

export class StoreRegisterDto {
    @ApiProperty({description: '상호명 (최대 100자)'})
    @MaxLength(100, {message: '상호명은 최대 100자까지 입력할 수 있습니다.'})
    @IsNotEmpty({message: '상호명을 입력해주세요.'})
    store_name: string;

    @ApiProperty({description: '사업자등록번호 (숫자 10자리)', example: '1234567890'})
    @Matches(/^\d{10}$/, {message: '사업자등록번호는 숫자 10자리여야 합니다.'})
    @IsNotEmpty({message: '사업자등록번호를 입력해주세요.'})
    business_number: string;

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

export class StoreRegisterResultDto {
    @ApiProperty({description: '등록된 가맹점 ID'})
    store_id: string;
}
