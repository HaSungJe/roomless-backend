import {ApiProperty} from '@nestjs/swagger';
import {IsIn, IsNotEmpty, Matches, MaxLength} from 'class-validator';

/**
 * 객실 그룹 사진 등록 path param — 내 업체의 지워지지 않은 그룹만(아니면 404)
 */
export class RoomGroupImageParamDto {
    @ApiProperty({description: '객실 그룹 ID'})
    @Matches(/^[a-f0-9]{32}$/, {message: '객실 그룹 ID가 올바르지 않습니다.'})
    @IsNotEmpty({message: '객실 그룹 ID를 입력해주세요.'})
    room_group_id: string;
}

/**
 * 객실 그룹 사진 등록 — 업로드 주소로 올린 사진의 키를 그룹에 붙인다(마지막 순서)
 */
export class RoomGroupImageDto {
    @ApiProperty({description: '저장 키 — 업로드 주소 응답의 file_key'})
    @MaxLength(255, {message: '저장 키가 올바르지 않습니다.'})
    @IsNotEmpty({message: '저장 키를 입력해주세요.'})
    file_key: string;

    @ApiProperty({description: '원본 파일명'})
    @MaxLength(255, {message: '파일명은 255자 이내로 입력해주세요.'})
    @IsNotEmpty({message: '파일명을 입력해주세요.'})
    file_name: string;

    @ApiProperty({description: 'MIME 타입 — 업로드 주소를 받을 때와 같다', enum: ['image/jpeg', 'image/png']})
    @IsIn(['image/jpeg', 'image/png'], {message: 'JPG · PNG 사진만 올릴 수 있습니다.'})
    @IsNotEmpty({message: '파일 형식을 입력해주세요.'})
    content_type: string;
}

/**
 * 객실 그룹 사진 등록 결과
 */
export class RoomGroupImageResultDto {
    @ApiProperty({description: '객실 그룹 사진 ID'})
    room_group_image_id: string;
}
