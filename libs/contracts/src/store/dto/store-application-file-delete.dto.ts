import {ApiProperty} from '@nestjs/swagger';
import {IsNotEmpty, Matches} from 'class-validator';

/**
 * 업체 정보 파일 삭제 path param — 대기 중 내 신청의 파일만
 */
export class StoreApplicationFileDeleteParamDto {
    @ApiProperty({description: '입점 신청 ID'})
    @Matches(/^[a-f0-9]{32}$/, {message: '입점 신청 ID가 올바르지 않습니다.'})
    @IsNotEmpty({message: '입점 신청 ID를 입력해주세요.'})
    store_application_id: string;

    @ApiProperty({description: '업체 정보 파일 ID'})
    @Matches(/^[a-f0-9]{32}$/, {message: '업체 정보 파일 ID가 올바르지 않습니다.'})
    @IsNotEmpty({message: '업체 정보 파일 ID를 입력해주세요.'})
    store_file_id: string;
}
