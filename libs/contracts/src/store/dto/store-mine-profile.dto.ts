import {ApiProperty} from '@nestjs/swagger';
import {Type} from 'class-transformer';
import {IsIn, IsInt, IsNotEmpty, IsOptional, Matches, Max, MaxLength, Min, ValidateNested} from 'class-validator';

/**
 * 업체 편의시설 (t_store.store_detail) — 보낸 항목만 남는다(통째로 교체). 선언하지 않은 항목은 service 가 버린다
 */
export class StoreMineProfileDetailDto {
    @ApiProperty({description: '방 칸수 (0 ~ 100)', required: false})
    @IsOptional()
    @IsInt({message: '방 칸수는 정수로 입력해주세요.'})
    @Min(0, {message: '방 칸수는 0 ~ 100 사이로 입력해주세요.'})
    @Max(100, {message: '방 칸수는 0 ~ 100 사이로 입력해주세요.'})
    room_count?: number;

    @ApiProperty({description: '샤워실 유무 (0 · 1)', required: false, enum: [0, 1]})
    @IsOptional()
    @IsIn([0, 1], {message: '샤워실 유무가 올바르지 않습니다.'})
    has_shower?: number;

    @ApiProperty({description: 'TV 유무 (0 · 1)', required: false, enum: [0, 1]})
    @IsOptional()
    @IsIn([0, 1], {message: 'TV 유무가 올바르지 않습니다.'})
    has_tv?: number;

    @ApiProperty({description: 'PC 유무 (0 · 1)', required: false, enum: [0, 1]})
    @IsOptional()
    @IsIn([0, 1], {message: 'PC 유무가 올바르지 않습니다.'})
    has_pc?: number;
}

/**
 * 내 업체 소개 수정 — 소개 · 연락처 · 편의시설. 상호명 · 주소 · 위경도 · 사업자등록번호는 총관리자가 바꾼다. 소개는 비우면 null
 */
export class StoreMineProfileDto {
    @ApiProperty({description: '업체 소개 (2,000자)', required: false})
    @IsOptional()
    @MaxLength(2000, {message: '업체 소개는 2,000자 이내로 입력해주세요.'})
    introduction?: string;

    @ApiProperty({description: '업체 연락처 (숫자만)'})
    @Matches(/^\d{8,11}$/, {message: '업체 연락처를 숫자만 정확히 입력해주세요.'})
    @IsNotEmpty({message: '업체 연락처를 입력해주세요.'})
    phone: string;

    @ApiProperty({description: '편의시설 — 보낸 항목으로 통째로 바꾼다(빠진 항목은 지운다, 모두 지우려면 {})', type: () => StoreMineProfileDetailDto})
    @Type(() => StoreMineProfileDetailDto)
    @ValidateNested({message: '편의시설 형식이 올바르지 않습니다.'})
    @IsNotEmpty({message: '편의시설을 입력해주세요.'})
    store_detail: StoreMineProfileDetailDto;
}
