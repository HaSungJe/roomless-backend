import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, Matches } from 'class-validator';

/**
 * 가맹점 상세 조회 입력 (path param)
 */
export class StoreDetailParamDto {
    @ApiProperty({description: '가맹점 ID (32자)'})
    @Matches(/^[a-f0-9]{32}$/, {message: '가맹점 ID 형식이 올바르지 않습니다.'})
    @IsNotEmpty({message: '가맹점 ID를 입력해주세요.'})
    store_id: string;
}

/**
 * 가맹점 상세 조회 응답
 */
export class StoreDetailResultDto {
    @ApiProperty({description: '가맹점 ID'})
    store_id: string;

    @ApiProperty({description: '상호명'})
    store_name: string;

    @ApiProperty({description: '사업자등록번호'})
    business_number: string;

    @ApiProperty({description: '대표자명'})
    owner_name: string;

    @ApiProperty({description: '가맹점 연락처'})
    phone: string;

    @ApiProperty({description: '주소'})
    address: string;

    @ApiProperty({description: '상세주소 (없으면 null)'})
    address_detail: string | null;

    @ApiProperty({description: '등록일'})
    create_at: Date;

    @ApiProperty({description: '수정일'})
    update_at: Date;
}
