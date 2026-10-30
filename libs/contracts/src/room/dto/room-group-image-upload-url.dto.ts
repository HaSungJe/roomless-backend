import {ApiProperty} from '@nestjs/swagger';
import {IsIn, IsNotEmpty, Matches} from 'class-validator';

/**
 * 객실 그룹 사진 업로드 주소 path param — 내 업체의 지워지지 않은 그룹만(아니면 404)
 */
export class RoomGroupImageUploadUrlParamDto {
    @ApiProperty({description: '객실 그룹 ID'})
    @Matches(/^[a-f0-9]{32}$/, {message: '객실 그룹 ID가 올바르지 않습니다.'})
    @IsNotEmpty({message: '객실 그룹 ID를 입력해주세요.'})
    room_group_id: string;
}

/**
 * 객실 그룹 사진 업로드 주소 요청 — 그룹마다 사진 5장까지
 */
export class RoomGroupImageUploadUrlDto {
    @ApiProperty({description: '올릴 사진의 MIME 타입 — 업로드할 때 같은 Content-Type 헤더로 PUT 한다', enum: ['image/jpeg', 'image/png']})
    @IsIn(['image/jpeg', 'image/png'], {message: 'JPG · PNG 사진만 올릴 수 있습니다.'})
    @IsNotEmpty({message: '파일 형식을 입력해주세요.'})
    content_type: string;
}

/**
 * 객실 그룹 사진 업로드 주소 — 이 주소로 PUT 한 뒤 file_key 로 사진을 등록한다
 */
export class RoomGroupImageUploadUrlResultDto {
    @ApiProperty({description: '저장 키 — 사진 등록 때 보낸다'})
    file_key: string;

    @ApiProperty({description: '업로드 주소 (PUT, 10분 유효)'})
    upload_url: string;

    @ApiProperty({description: '업로드 주소 만료일시 (ISO 8601)'})
    expires_at: string;
}
