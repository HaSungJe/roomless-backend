import {ApiProperty} from '@nestjs/swagger';
import {IsIn, IsNotEmpty, MaxLength} from 'class-validator';

/**
 * 내 업체 사진 등록 — 업로드 주소로 올린 사진의 키를 업체에 붙인다(마지막 순서)
 */
export class StoreMineFileDto {
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
 * 내 업체 사진 등록 결과
 */
export class StoreMineFileResultDto {
    @ApiProperty({description: '업체 정보 파일 ID'})
    store_file_id: string;
}
