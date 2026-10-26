import {ApiProperty} from '@nestjs/swagger';
import {IsNotEmpty, Matches} from 'class-validator';

/**
 * 입점 신청 상세 path param (총관리자)
 */
export class StoreApplicationDetailParamDto {
    @ApiProperty({description: '입점 신청 ID'})
    @Matches(/^[a-f0-9]{32}$/, {message: '입점 신청 ID가 올바르지 않습니다.'})
    @IsNotEmpty({message: '입점 신청 ID를 입력해주세요.'})
    store_application_id: string;
}

/**
 * 신청자 (t_user 이용자 그룹 — 없으면 상세의 applicant 가 null)
 */
export class StoreApplicationApplicantResultDto {
    @ApiProperty({description: '회원 ID'})
    user_id: string;

    @ApiProperty({description: '이름'})
    name: string;

    @ApiProperty({description: '닉네임'})
    nickname: string;

    @ApiProperty({description: '휴대폰 번호 (미인증 null)', nullable: true, type: String})
    phone: string | null;
}

/**
 * 입점 신청의 업체 정보 파일 (총관리자)
 */
export class StoreApplicationDetailFileResultDto {
    @ApiProperty({description: '업체 정보 파일 ID'})
    store_file_id: string;

    @ApiProperty({description: '용도 (BUSINESS_LICENSE · STORE_IMAGE)'})
    store_file_purpose_id: string;

    @ApiProperty({description: '원본 파일명'})
    file_name: string;

    @ApiProperty({description: 'MIME 타입'})
    content_type: string;

    @ApiProperty({description: '비공개 여부 (1: 서명된 열람 주소 · 10분 유효, 0: CDN 공개 주소)'})
    is_private: number;

    @ApiProperty({description: '열람 주소'})
    file_url: string;

    @ApiProperty({description: '등록일시 (ISO 8601)'})
    created_at: string;
}

/**
 * 입점 신청 상세 (총관리자)
 */
export class StoreApplicationDetailResultDto {
    @ApiProperty({description: '입점 신청 ID'})
    store_application_id: string;

    @ApiProperty({description: '신청한 이용자 ID'})
    user_id: string;

    @ApiProperty({description: '신청 상태 (WAIT · APPROVED · REJECTED)'})
    store_application_state_id: string;

    @ApiProperty({description: '승인으로 만든 업체 ID', nullable: true, type: String})
    store_id: string | null;

    @ApiProperty({description: '업체코드 (승인 전 null)', nullable: true, type: String})
    store_code: string | null;

    @ApiProperty({description: '상호명'})
    store_name: string;

    @ApiProperty({description: '사업자등록번호'})
    business_number: string;

    @ApiProperty({description: '대표자명'})
    owner_name: string;

    @ApiProperty({description: '대표자 휴대폰 번호 — 업체 총관리자 계정'})
    owner_phone: string;

    @ApiProperty({description: '업체 총관리자 아이디'})
    head_manager_login_id: string;

    @ApiProperty({description: '업체 연락처'})
    phone: string;

    @ApiProperty({description: '주소'})
    address: string;

    @ApiProperty({description: '상세주소', nullable: true, type: String})
    address_detail: string | null;

    @ApiProperty({description: '위도'})
    latitude: number;

    @ApiProperty({description: '경도'})
    longitude: number;

    @ApiProperty({description: '신청 메모', nullable: true, type: String})
    application_comment: string | null;

    @ApiProperty({description: '반려 사유', nullable: true, type: String})
    reject_comment: string | null;

    @ApiProperty({description: '처리일시 (ISO 8601)', nullable: true, type: String})
    reviewed_at: string | null;

    @ApiProperty({description: '신청일시 (ISO 8601)'})
    created_at: string;

    @ApiProperty({description: '신청자 (없으면 null)', nullable: true, type: () => StoreApplicationApplicantResultDto})
    applicant: StoreApplicationApplicantResultDto | null;

    @ApiProperty({description: '업체 정보 파일 (용도 · 정렬 순서)', type: () => [StoreApplicationDetailFileResultDto]})
    files: StoreApplicationDetailFileResultDto[];
}
