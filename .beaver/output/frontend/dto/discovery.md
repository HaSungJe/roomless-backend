# DTO — discovery

> `libs/contracts/src/discovery/dto/` 에서 Swagger 데코레이터(`@nestjs/swagger`)만 뺀 사본 — 기준: 백엔드 Phase 27(2026-11-10). `class-validator` · `class-transformer` 데코레이터와 한국어 메시지는 그대로다(화면 입력 검증에 그대로 쓴다). 프론트에는 `contracts/discovery/dto/<파일>` 로 둔다. 이후 바뀐 DTO 는 `changes/` 로 온다.

## discovery/dto/discovery-room-group-list.dto.ts

```ts
import {IsNotEmpty, Matches} from 'class-validator';

/**
 * 업체의 객실 그룹 목록 path param
 */
export class DiscoveryRoomGroupListParamDto {
    /** 업체 ID */
    @Matches(/^[a-f0-9]{32}$/, {message: '업체 ID가 올바르지 않습니다.'})
    @IsNotEmpty({message: '업체 ID를 입력해주세요.'})
    store_id: string;
}

/**
 * 객실 그룹 상세정보 (편의시설)
 */
export class DiscoveryRoomGroupDetailResultDto {
    /** 객실 안의 방 개수 */
    room_count: number;

    /** 샤워 시설 여부 (0 · 1) */
    has_shower: number;

    /** TV 여부 (0 · 1) */
    has_tv: number;

    /** PC 여부 (0 · 1) */
    has_pc: number;
}

/**
 * 객실 그룹 사진 1장
 */
export class DiscoveryRoomGroupImageResultDto {
    /** 사진 주소 (CloudFront) */
    image_url: string;

    /** 정렬 순서 (0 이 대표) */
    sort_order: number;
}

/**
 * 기간 가격 1개 — 그 기간의 날짜는 기본 요금 대신 이 요금
 */
export class DiscoveryRoomGroupPeriodPriceResultDto {
    /** 시작 날짜 (YYYY-MM-DD, 포함) */
    start_date: string;

    /** 끝 날짜 (YYYY-MM-DD, 포함) */
    end_date: string;

    /** 요금(원) */
    price: number;

    /** 메모 (예: 여름 성수기) */
    memo: string | null;
}

/**
 * 판매 중인 상품 1개
 */
export class DiscoveryRoomGroupPlanResultDto {
    /** 상품 종류 (HOURLY · NIGHT · LONG) */
    room_plan_type_id: string;

    /** 상품 종류명 */
    room_plan_type_name: string;

    /** 기본 요금(원) — 시간 이용 1회 · 1박 · 연박 1박당 */
    price: number;

    /** 기간 가격 (끝 날짜가 오늘 이후, 시작 날짜 순) */
    period_prices: DiscoveryRoomGroupPeriodPriceResultDto[];
}

/**
 * 객실 그룹 1개 — 예약 받을 호실 · 판매 중인 상품이 있는 그룹만
 */
export class DiscoveryRoomGroupItemResultDto {
    /** 객실 그룹 ID */
    room_group_id: string;

    /** 그룹명 */
    room_group_name: string;

    /** 설명 */
    description: string | null;

    /** 상세정보 (편의시설) */
    room_group_detail: DiscoveryRoomGroupDetailResultDto;

    /** 예약 받을 호실 수 (지워지지 않고 사용중지가 아닌 호실) */
    room_count: number;

    /** 사진 (정렬 순서) */
    images: DiscoveryRoomGroupImageResultDto[];

    /** 판매 중인 상품 (시간 이용 → 1박 → 연박) */
    plans: DiscoveryRoomGroupPlanResultDto[];
}

/**
 * 업체의 객실 그룹 목록 — 그룹명 순. 시간대별 예약 가능한 호수는 예약 가능 시간 API(그룹 필터)로 본다
 */
export class DiscoveryRoomGroupListResultDto {
    /** 객실 그룹 목록 (그룹명 순) */
    list: DiscoveryRoomGroupItemResultDto[];
}
```

## discovery/dto/discovery-store-detail.dto.ts

```ts
import {IsNotEmpty, Matches} from 'class-validator';

/**
 * 업체 상세 path param
 */
export class DiscoveryStoreDetailParamDto {
    /** 업체 ID */
    @Matches(/^[a-f0-9]{32}$/, {message: '업체 ID가 올바르지 않습니다.'})
    @IsNotEmpty({message: '업체 ID를 입력해주세요.'})
    store_id: string;
}

/**
 * 업체 사진 1장
 */
export class DiscoveryStoreImageResultDto {
    /** 사진 주소 (CloudFront) */
    image_url: string;

    /** 정렬 순서 (0 부터) */
    sort_order: number;
}

/**
 * 요일 영업시간 1개
 */
export class DiscoveryStoreHourResultDto {
    /** 요일 (0: 일 ~ 6: 토) */
    day_of_week: number;

    /** 휴무 여부 (0: 영업, 1: 휴무 — 시각 null) */
    is_closed: number;

    /** 여는 시각 (HH:mm, 한국 시각) — 휴무면 null */
    open_time: string | null;

    /** 닫는 시각 (HH:mm — 여는 시각보다 이르면 다음 날) — 휴무면 null */
    close_time: string | null;
}

/**
 * 브레이크타임 1개 (매일)
 */
export class DiscoveryStoreBreakResultDto {
    /** 시작 시각 (HH:mm) */
    start_time: string;

    /** 끝 시각 (HH:mm) */
    end_time: string;
}

/**
 * 판매 중인 상품 설정 1개
 */
export class DiscoveryStorePlanResultDto {
    /** 상품 종류 (HOURLY: 시간 이용, NIGHT: 1박, LONG: 연박) */
    room_plan_type_id: string;

    /** 상품 종류명 */
    room_plan_type_name: string;

    /** 예약 가능 요일 (비트 — 일 1 · 월 2 · … · 토 64, 매일 127, 1박 · 연박은 입실일 기준) */
    days_of_week: number;

    /** 이용 시간(시간) — 시간 이용만, 그 밖은 null */
    usage_hours: number | null;

    /** 입실 시각 (HH:mm) — 1박 · 연박만, 그 밖은 null */
    check_in_time: string | null;

    /** 퇴실 시각 (HH:mm — 다음 날 이후) — 1박 · 연박만, 그 밖은 null */
    check_out_time: string | null;

    /** 최소 박수 — 연박만, 그 밖은 null */
    min_nights: number | null;

    /** 최대 박수 — 연박만, 그 밖은 null */
    max_nights: number | null;

    /** 이용 중에 연장할 수 있는지 (0 · 1) */
    is_extendable: number;

    /** 최대 연장 횟수 (1 ~ 10) */
    max_extensions: number;
}

/**
 * 업체 상세 — 이용자 공개용(사업자 정보 · 업체코드 · 정지 사유 · 문 시크릿 여부 · 사업자등록증은 넣지 않는다)
 */
export class DiscoveryStoreDetailResultDto {
    /** 업체 ID */
    store_id: string;

    /** 상호명 */
    store_name: string;

    /** 업체 연락처 */
    phone: string;

    /** 주소 */
    address: string;

    /** 상세주소 */
    address_detail: string | null;

    /** 위도 (WGS84) */
    latitude: number;

    /** 경도 (WGS84) */
    longitude: number;

    /** 업체 소개 */
    introduction: string | null;

    /** 영업중 여부 (0: 지금 영업하지 않음 — 예약 불가, 1: 영업중) */
    is_open: number;

    /** 24시간 연중무휴 여부 (0: 요일별 영업시간, 1: 24시간 — hours 는 참고용) */
    is_always_open: number;

    /** 예약 가능 시작(시간) — 이용 시작 n시간 전부터 예약을 받는다 */
    booking_open_hours: number;

    /** 100% 환불 마감(분) — 이용 시작 n분 전까지 취소하면 전액 환불 */
    refund_deadline_minutes: number;

    /** 마감 뒤 환불 비율(%) — 마감 뒤 ~ 이용 시작 전 취소 */
    late_refund_percent: number;

    /** 업체 사진 (정렬 순서) */
    images: DiscoveryStoreImageResultDto[];

    /** 요일별 영업시간 (일 ~ 토) */
    hours: DiscoveryStoreHourResultDto[];

    /** 브레이크타임 (시작 순, 매일) */
    breaks: DiscoveryStoreBreakResultDto[];

    /** 판매 중인 상품 설정 (시간 이용 → 1박 → 연박) */
    plans: DiscoveryStorePlanResultDto[];
}
```

## discovery/dto/discovery-store-list.dto.ts

```ts
import {IsIn, IsLatitude, IsLongitude, IsNotEmpty} from 'class-validator';

/**
 * 반경 업체 조회 query — 지도 중심(처음엔 내 위치) 위경도 + 반경. 쿼리 값은 문자열이다.
 */
export class DiscoveryStoreListDto {
    /** 중심 위도 (WGS84 — 지도 중심 · 내 위치) */
    @IsLatitude({message: '위도가 올바르지 않습니다.'})
    @IsNotEmpty({message: '위도를 입력해주세요.'})
    latitude: string;

    /** 중심 경도 (WGS84) */
    @IsLongitude({message: '경도가 올바르지 않습니다.'})
    @IsNotEmpty({message: '경도를 입력해주세요.'})
    longitude: string;

    /** 반경(km) — 5 · 10 · 20 · 50 — 값: 5 · 10 · 20 · 50 */
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
    /** 업체 ID */
    store_id: string;

    /** 상호명 */
    store_name: string;

    /** 주소 */
    address: string;

    /** 위도 (WGS84) */
    latitude: number;

    /** 경도 (WGS84) */
    longitude: number;

    /** 중심에서 거리(m, 반올림 — 대원 거리) */
    distance_m: number;

    /** 대표 사진 주소 (업체 사진 첫 장 — CloudFront), 없으면 null */
    image_url: string | null;

    /** 영업중 여부 (0: 지금 영업하지 않음 — 예약 불가, 1: 영업중) */
    is_open: number;

    /** 24시간 연중무휴 여부 (0: 요일별 영업시간, 1: 24시간) */
    is_always_open: number;

    /** 시간 이용 최저가(원) — 판매 중인 그룹 상품의 기본 요금 중 가장 낮은 값, 팔지 않으면 null */
    min_hourly_price: number | null;

    /** 1박 최저가(원) — 판매 중인 그룹 상품의 기본 요금 중 가장 낮은 값, 팔지 않으면 null */
    min_night_price: number | null;
}

/**
 * 반경 업체 조회 결과 — 가까운 순, 최대 300개
 */
export class DiscoveryStoreListResultDto {
    /** 업체 목록 (가까운 순) */
    list: DiscoveryStoreItemResultDto[];

    /** 300개를 넘어 잘렸는지 (0: 아님, 1: 잘림 — 반경을 줄여 다시 조회) */
    is_truncated: number;
}
```
