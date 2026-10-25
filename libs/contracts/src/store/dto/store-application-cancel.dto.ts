import {ApiProperty} from '@nestjs/swagger';
import {IsNotEmpty, Matches} from 'class-validator';

/**
 * 입점 신청 취소 path param — 대기 중 내 신청만. 취소하면 신청 · 업체 정보 파일이 지워진다(목록에도 남지 않는다).
 */
export class StoreApplicationCancelParamDto {
    @ApiProperty({description: '입점 신청 ID'})
    @Matches(/^[a-f0-9]{32}$/, {message: '입점 신청 ID가 올바르지 않습니다.'})
    @IsNotEmpty({message: '입점 신청 ID를 입력해주세요.'})
    store_application_id: string;
}
