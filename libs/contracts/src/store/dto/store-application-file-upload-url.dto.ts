import {ApiProperty} from '@nestjs/swagger';
import {IsIn, IsNotEmpty, Matches} from 'class-validator';

/**
 * 업체 정보 파일 업로드 주소 path param
 */
export class StoreApplicationFileUploadUrlParamDto {
    @ApiProperty({description: '입점 신청 ID'})
    @Matches(/^[a-f0-9]{32}$/, {message: '입점 신청 ID가 올바르지 않습니다.'})
    @IsNotEmpty({message: '입점 신청 ID를 입력해주세요.'})
    store_application_id: string;
}

/**
 * 업체 정보 파일 업로드 주소 요청 — 대기 중 내 신청만
 */
export class StoreApplicationFileUploadUrlDto {
    @ApiProperty({description: '용도 (BUSINESS_LICENSE: 사업자등록증 1장, STORE_IMAGE: 업체 사진 5장까지)', enum: ['BUSINESS_LICENSE', 'STORE_IMAGE']})
    @IsIn(['BUSINESS_LICENSE', 'STORE_IMAGE'], {message: '파일 용도가 올바르지 않습니다.'})
    @IsNotEmpty({message: '파일 용도를 입력해주세요.'})
    store_file_purpose_id: string;

    @ApiProperty({description: '올릴 파일의 MIME 타입 — 업로드할 때 같은 Content-Type 헤더로 PUT 한다', enum: ['image/jpeg', 'image/png']})
    @IsIn(['image/jpeg', 'image/png'], {message: 'JPG · PNG 사진만 올릴 수 있습니다.'})
    @IsNotEmpty({message: '파일 형식을 입력해주세요.'})
    content_type: string;
}

/**
 * 업체 정보 파일 업로드 주소 — 이 주소로 PUT 한 뒤 file_key 로 파일을 등록한다
 */
export class StoreApplicationFileUploadUrlResultDto {
    @ApiProperty({description: '저장 키 — 파일 등록 때 보낸다'})
    file_key: string;

    @ApiProperty({description: '업로드 주소 (PUT, 10분 유효)'})
    upload_url: string;

    @ApiProperty({description: '업로드 주소 만료일시 (ISO 8601)'})
    expires_at: string;
}
