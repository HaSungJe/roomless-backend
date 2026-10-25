import {ApiProperty} from '@nestjs/swagger';
import {IsIn, IsNotEmpty, Matches, MaxLength} from 'class-validator';

/**
 * 업체 정보 파일 등록 path param
 */
export class StoreApplicationFileParamDto {
    @ApiProperty({description: '입점 신청 ID'})
    @Matches(/^[a-f0-9]{32}$/, {message: '입점 신청 ID가 올바르지 않습니다.'})
    @IsNotEmpty({message: '입점 신청 ID를 입력해주세요.'})
    store_application_id: string;
}

/**
 * 업체 정보 파일 등록 — 업로드 주소로 올린 파일의 키를 신청에 붙인다(대기 중 내 신청만)
 */
export class StoreApplicationFileDto {
    @ApiProperty({description: '용도 (BUSINESS_LICENSE · STORE_IMAGE) — 업로드 주소를 받을 때와 같다', enum: ['BUSINESS_LICENSE', 'STORE_IMAGE']})
    @IsIn(['BUSINESS_LICENSE', 'STORE_IMAGE'], {message: '파일 용도가 올바르지 않습니다.'})
    @IsNotEmpty({message: '파일 용도를 입력해주세요.'})
    store_file_purpose_id: string;

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
 * 업체 정보 파일 등록 결과
 */
export class StoreApplicationFileResultDto {
    @ApiProperty({description: '업체 정보 파일 ID'})
    store_file_id: string;
}
