import {ApiProperty} from '@nestjs/swagger';
import {IsNotEmpty, IsOptional, Matches, MaxLength} from 'class-validator';

/**
 * 내 업체 소개 수정 — 소개 · 연락처. 상호명 · 주소 · 위경도 · 사업자등록번호는 총관리자가 바꾼다. 소개는 비우면 null.
 * 편의시설은 객실 그룹 상세정보(t_room_group.room_group_detail)로 옮겼다.
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
}
