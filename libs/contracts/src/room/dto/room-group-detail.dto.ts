import {ApiProperty} from '@nestjs/swagger';
import {IsNotEmpty, Matches} from 'class-validator';

/**
 * 객실 그룹 상세 path param — 내 업체의 지워지지 않은 그룹만(아니면 404)
 */
export class RoomGroupDetailParamDto {
    @ApiProperty({description: '객실 그룹 ID'})
    @Matches(/^[a-f0-9]{32}$/, {message: '객실 그룹 ID가 올바르지 않습니다.'})
    @IsNotEmpty({message: '객실 그룹 ID를 입력해주세요.'})
    room_group_id: string;
}

/**
 * 객실 그룹 상세정보 (t_room_group.room_group_detail) — 저장되지 않은 항목도 기본값으로 채워 모두 있다
 */
export class RoomGroupDetailValueResultDto {
    @ApiProperty({description: '객실 안의 방 개수 (원룸 1 · 투룸 2)'})
    room_count: number;

    @ApiProperty({description: '샤워실 유무 (0: 없음, 1: 있음)'})
    has_shower: number;

    @ApiProperty({description: 'TV 유무 (0: 없음, 1: 있음)'})
    has_tv: number;

    @ApiProperty({description: 'PC 유무 (0: 없음, 1: 있음)'})
    has_pc: number;
}

/**
 * 객실 그룹 사진
 */
export class RoomGroupDetailImageResultDto {
    @ApiProperty({description: '객실 그룹 사진 ID'})
    room_group_image_id: string;

    @ApiProperty({description: '원본 파일명'})
    file_name: string;

    @ApiProperty({description: 'MIME 타입'})
    content_type: string;

    @ApiProperty({description: '정렬 순서 (가장 앞이 대표)'})
    sort_order: number;

    @ApiProperty({description: '열람 주소 (CDN 공개 주소)'})
    image_url: string;
}

/**
 * 그룹 상품 — 그룹 × 상품 종류의 사용 여부 · 기본 요금
 */
export class RoomGroupDetailPlanResultDto {
    @ApiProperty({description: '상품 종류 ID (HOURLY: 시간 이용, NIGHT: 1박, LONG: 연박)'})
    room_plan_type_id: string;

    @ApiProperty({description: '상품 종류명'})
    room_plan_type_name: string;

    @ApiProperty({description: '사용 여부 (0: 이 그룹은 팔지 않음, 1: 판매 — 업체 상품 설정도 사용 중이어야 판다)'})
    is_used: number;

    @ApiProperty({description: '기본 요금(원) — 시간 이용 1회 · 1박 · 연박 1박당'})
    price: number;
}

/**
 * 객실 그룹 상세 — 그룹 정보 · 상세정보 · 사진 · 그룹 상품 3개
 */
export class RoomGroupDetailResultDto {
    @ApiProperty({description: '객실 그룹 ID'})
    room_group_id: string;

    @ApiProperty({description: '그룹명'})
    room_group_name: string;

    @ApiProperty({description: '설명', nullable: true, type: String})
    description: string | null;

    @ApiProperty({description: '상세정보 (항목 모두)', type: () => RoomGroupDetailValueResultDto})
    room_group_detail: RoomGroupDetailValueResultDto;

    @ApiProperty({description: '사진 (정렬 순서)', type: () => [RoomGroupDetailImageResultDto]})
    images: RoomGroupDetailImageResultDto[];

    @ApiProperty({description: '그룹 상품 (HOURLY · NIGHT · LONG 순)', type: () => [RoomGroupDetailPlanResultDto]})
    plans: RoomGroupDetailPlanResultDto[];

    @ApiProperty({description: '등록일시 (ISO 8601)'})
    created_at: string;

    @ApiProperty({description: '수정일시 (ISO 8601)'})
    updated_at: string;
}
