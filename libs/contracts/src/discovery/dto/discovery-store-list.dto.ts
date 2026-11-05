import {ApiProperty} from '@nestjs/swagger';
import {IsIn, IsLatitude, IsLongitude, IsNotEmpty} from 'class-validator';

/**
 * 반경 업체 조회 query — 지도 중심(처음엔 내 위치) 위경도 + 반경. 쿼리 값은 문자열이다.
 */
export class DiscoveryStoreListDto {
    @ApiProperty({description: '중심 위도 (WGS84 — 지도 중심 · 내 위치)', example: '37.5665'})
    @IsLatitude({message: '위도가 올바르지 않습니다.'})
    @IsNotEmpty({message: '위도를 입력해주세요.'})
    latitude: string;

    @ApiProperty({description: '중심 경도 (WGS84)', example: '126.978'})
    @IsLongitude({message: '경도가 올바르지 않습니다.'})
    @IsNotEmpty({message: '경도를 입력해주세요.'})
    longitude: string;

    @ApiProperty({description: '반경(km) — 5 · 10 · 20 · 50', enum: ['5', '10', '20', '50']})
    @IsIn(['5', '10', '20', '50'], {message: '반경은 5 · 10 · 20 · 50km 중에서 골라주세요.'})
    @IsNotEmpty({message: '반경을 입력해주세요.'})
    radius_km: string;

    /**
     * @param data 요청 쿼리 — 빠진 값은 빈 문자열(검증에서 걸린다)
     */
    constructor(data?: Partial<DiscoveryStoreListDto>) {
        this.latitude = data?.latitude ?? '';
        this.longitude = data?.longitude ?? '';
        this.radius_km = data?.radius_km ?? '';
    }
}

/**
 * 반경 업체 1개 — 지도 마커 · 목록 카드 공용
 */
export class DiscoveryStoreItemResultDto {
    @ApiProperty({description: '업체 ID'})
    store_id: string;

    @ApiProperty({description: '상호명'})
    store_name: string;

    @ApiProperty({description: '주소'})
    address: string;

    @ApiProperty({description: '위도 (WGS84)'})
    latitude: number;

    @ApiProperty({description: '경도 (WGS84)'})
    longitude: number;

    @ApiProperty({description: '중심에서 거리(m, 반올림 — 대원 거리)'})
    distance_m: number;

    @ApiProperty({description: '대표 사진 주소 (업체 사진 첫 장 — CloudFront), 없으면 null', nullable: true, type: String})
    image_url: string | null;

    @ApiProperty({description: '영업중 여부 (0: 지금 영업하지 않음 — 예약 불가, 1: 영업중)'})
    is_open: number;

    @ApiProperty({description: '24시간 연중무휴 여부 (0: 요일별 영업시간, 1: 24시간)'})
    is_always_open: number;

    @ApiProperty({description: '시간 이용 최저가(원) — 판매 중인 그룹 상품의 기본 요금 중 가장 낮은 값, 팔지 않으면 null', nullable: true, type: Number})
    min_hourly_price: number | null;

    @ApiProperty({description: '1박 최저가(원) — 판매 중인 그룹 상품의 기본 요금 중 가장 낮은 값, 팔지 않으면 null', nullable: true, type: Number})
    min_night_price: number | null;
}

/**
 * 반경 업체 조회 결과 — 가까운 순, 최대 300개
 */
export class DiscoveryStoreListResultDto {
    @ApiProperty({description: '업체 목록 (가까운 순)', type: () => [DiscoveryStoreItemResultDto]})
    list: DiscoveryStoreItemResultDto[];

    @ApiProperty({description: '300개를 넘어 잘렸는지 (0: 아님, 1: 잘림 — 반경을 줄여 다시 조회)'})
    is_truncated: number;
}
