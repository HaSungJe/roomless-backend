import {ApiProperty} from '@nestjs/swagger';

/**
 * 내 업체의 업체 정보 파일 (사업자등록증 · 업체 사진)
 */
export class StoreMineFileItemResultDto {
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

    @ApiProperty({description: '정렬 순서 (업체 사진은 가장 앞이 대표)'})
    sort_order: number;

    @ApiProperty({description: '등록일시 (ISO 8601)'})
    created_at: string;
}

/**
 * 내 업체의 요일 영업시간
 */
export class StoreMineHourItemResultDto {
    @ApiProperty({description: '요일 (0: 일 ~ 6: 토)'})
    day_of_week: number;

    @ApiProperty({description: '휴무 여부 (0: 영업, 1: 휴무)'})
    is_closed: number;

    @ApiProperty({description: '영업 시작 시각 (HH:mm, 한국 시각) — 휴무면 null', nullable: true, type: String})
    open_time: string | null;

    @ApiProperty({description: '영업 마감 시각 (HH:mm — 시작보다 이르면 다음 날) — 휴무면 null', nullable: true, type: String})
    close_time: string | null;
}

/**
 * 내 업체의 브레이크타임 (매일)
 */
export class StoreMineBreakItemResultDto {
    @ApiProperty({description: '브레이크타임 ID'})
    store_break_id: string;

    @ApiProperty({description: '시작 시각 (HH:mm, 한국 시각)'})
    start_time: string;

    @ApiProperty({description: '마감 시각 (HH:mm — 시작보다 이르면 다음 날)'})
    end_time: string;
}

/**
 * 내 업체 상세 (업체 관리자)
 */
export class StoreMineResultDto {
    @ApiProperty({description: '업체 ID'})
    store_id: string;

    @ApiProperty({description: '업체코드 (매니저 로그인 · 매니저 화면 주소)'})
    store_code: string;

    @ApiProperty({description: '업체 상태 (ACTIVE · SUSPEND)'})
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

    @ApiProperty({description: '편의시설 (room_count · has_shower · has_tv · has_pc — 없는 항목은 빠진다)', type: Object})
    store_detail: Record<string, number>;

    @ApiProperty({description: '24시간 연중무휴 여부 (0 · 1 — 1 이면 요일별 영업시간이 비어 있다)'})
    is_always_open: number;

    @ApiProperty({description: '영업중 여부 (0: 영업중 아님, 1: 영업중)'})
    is_open: number;

    @ApiProperty({description: '정비시간(분)'})
    maintenance_minutes: number;

    @ApiProperty({description: '요일별 영업시간 (일 ~ 토 순)', type: () => [StoreMineHourItemResultDto]})
    hours: StoreMineHourItemResultDto[];

    @ApiProperty({description: '브레이크타임 (매일 · 시작 시각 순)', type: () => [StoreMineBreakItemResultDto]})
    breaks: StoreMineBreakItemResultDto[];

    @ApiProperty({description: '업체 정보 파일 (용도 · 정렬 순서)', type: () => [StoreMineFileItemResultDto]})
    files: StoreMineFileItemResultDto[];

    @ApiProperty({description: '수정일시 (ISO 8601)'})
    updated_at: string;
}
