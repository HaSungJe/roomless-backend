import {ApiProperty} from '@nestjs/swagger';
import {IsNotEmpty, Matches} from 'class-validator';

/**
 * 입점 승인 path param (총관리자)
 */
export class StoreApplicationApproveParamDto {
    @ApiProperty({description: '입점 신청 ID'})
    @Matches(/^[a-f0-9]{32}$/, {message: '입점 신청 ID가 올바르지 않습니다.'})
    @IsNotEmpty({message: '입점 신청 ID를 입력해주세요.'})
    store_application_id: string;
}

/**
 * 입점 승인 결과 — 임시 비밀번호는 대표자 휴대폰으로만 보낸다(응답에 없음)
 */
export class StoreApplicationApproveResultDto {
    @ApiProperty({description: '등록한 업체 ID'})
    store_id: string;

    @ApiProperty({description: '업체 총관리자 아이디'})
    login_id: string;
}
