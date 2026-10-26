import {ApiProperty} from '@nestjs/swagger';
import {IsNotEmpty, Matches} from 'class-validator';

/**
 * 내 업체 사진 삭제 path param — 업체 사진만(사업자등록증은 지울 수 없다)
 */
export class StoreMineFileDeleteParamDto {
    @ApiProperty({description: '업체 정보 파일 ID'})
    @Matches(/^[a-f0-9]{32}$/, {message: '업체 정보 파일 ID가 올바르지 않습니다.'})
    @IsNotEmpty({message: '업체 정보 파일 ID를 입력해주세요.'})
    store_file_id: string;
}
