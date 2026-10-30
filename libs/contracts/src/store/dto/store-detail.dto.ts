import {ApiProperty} from '@nestjs/swagger';
import {IsNotEmpty, Matches} from 'class-validator';

/**
 * 업체 상세 path param (총관리자)
 */
export class StoreDetailParamDto {
    @ApiProperty({description: '업체 ID'})
    @Matches(/^[a-f0-9]{32}$/, {message: '업체 ID가 올바르지 않습니다.'})
    @IsNotEmpty({message: '업체 ID를 입력해주세요.'})
    store_id: string;
}

/**
 * 업체 정보 파일 (총관리자 — 사업자등록증 · 업체 사진)
 */
export class StoreDetailFileResultDto {
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

    @ApiProperty({description: '정렬 순서 (업체 사진은 0 이 대표)'})
    sort_order: number;

    @ApiProperty({description: '등록일시 (ISO 8601)'})
    created_at: string;
}

/**
 * 업체 상세 (총관리자)
 */
export class StoreDetailResultDto {
    @ApiProperty({description: '업체 ID'})
    store_id: string;

    @ApiProperty({description: '업체코드 (매니저 로그인 · 매니저 화면 주소)'})
    store_code: string;

    @ApiProperty({description: '업체 상태 (ACTIVE · SUSPEND · LEAVE)'})
    store_state_id: string;

    @ApiProperty({description: '상호명'})
    store_name: string;

    @ApiProperty({description: '사업자등록번호'})
    business_number: string;

    @ApiProperty({description: '대표자명'})
    owner_name: string;

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

    @ApiProperty({description: '업체 소개', nullable: true, type: String})
    introduction: string | null;

    @ApiProperty({description: '24시간 연중무휴 여부 (0 · 1)'})
    is_always_open: number;

    @ApiProperty({description: '영업중 여부 (0: 영업중 아님 · 영업준비, 1: 영업중)'})
    is_open: number;

    @ApiProperty({description: '정비시간(분)'})
    maintenance_minutes: number;

    @ApiProperty({description: '예약 가능 시작(시간) — 이용 시작 n시간 전부터 예약'})
    booking_open_hours: number;

    @ApiProperty({description: '100% 환불 기준(시간) — 이용 시작 n시간 전까지 환불 신청, 이후 환불 불가'})
    refund_deadline_hours: number;

    @ApiProperty({description: '정지 사유 (영업중지일 때만)', nullable: true, type: String})
    suspend_comment: string | null;

    @ApiProperty({description: '등록일시 (ISO 8601)'})
    created_at: string;

    @ApiProperty({description: '수정일시 (ISO 8601)'})
    updated_at: string;

    @ApiProperty({description: '업체 정보 파일 (용도 · 정렬 순서)', type: () => [StoreDetailFileResultDto]})
    files: StoreDetailFileResultDto[];
}
