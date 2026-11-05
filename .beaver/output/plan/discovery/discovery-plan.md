# Plan — discovery

## Feature Summary
- **Feature**: 이용자 업체 둘러보기(Phase 18) — 반경 업체 조회(지도 · 목록 공용) · 업체 상세 · 객실 그룹 목록 · 예약 가능 시간을 그룹 → 시간대 → 호수로 · 시간 이용 '지금 바로' 예약 · 결제 확인 때 QR 발급
- **Entry point**: 새 공개(로그인 없음) 3개 + 기존 변경 3개(큐 경로는 그대로)
  - 새 공개: `GET /api/v1/user-service/discovery/store` · `GET /api/v1/user-service/discovery/store/:store_id` · `GET /api/v1/user-service/discovery/store/:store_id/room-group`
  - 기존 변경: `GET /api/v1/user-service/reservation/availability`(모양 변경 · 그룹 필터), `user.reservation.create`(`is_now`), `user.reservation.payment-confirm`(QR 발급)
- **Domain**: user-service `discovery`(새) · `reservation`(변경), gateway `api/v1/user-service/discovery`(새) — 로드맵 Phase 18 #74 · #75(합침) · #76 · #77 + 새 #116 · #117(제안)
- **Spec**: [discovery-spec.md](../../spec/discovery/discovery-spec.md)

---

## File List

| File | Action |
|------|------|
| `libs/contracts/src/discovery/discovery.commands.ts` | new — 내부 경로 |
| `libs/contracts/src/discovery/dto/discovery-store-list.dto.ts` | new — 반경 업체 조회 query · 결과 |
| `libs/contracts/src/discovery/dto/discovery-store-detail.dto.ts` | new — 업체 상세 param · 결과 |
| `libs/contracts/src/discovery/dto/discovery-room-group-list.dto.ts` | new — 객실 그룹 목록 param · 결과 |
| `libs/contracts/src/reservation/dto/reservation-availability.dto.ts` | modified — `room_group_id` 필터, 결과 그룹 → 시간대 → 호수 |
| `libs/contracts/src/reservation/dto/reservation.dto.ts` | modified — `is_now` |
| `apps/user-service/src/discovery/discovery.symbols.ts` | new |
| `apps/user-service/src/discovery/discovery.constants.ts` | new |
| `apps/user-service/src/discovery/interfaces/discovery.repository.interface.ts` | new |
| `apps/user-service/src/discovery/repositories/discovery.repository.ts` | new — 반경 업체(haversine · 사각형) · 업체 · 사진 · 영업시간 · 브레이크 · 상품 설정 · 그룹 · 호실 수 · 그룹 사진 · 그룹 상품 · 기간 가격 |
| `apps/user-service/src/discovery/discovery.util.ts` | new — `toRadiusBox` · 응답 조립 |
| `apps/user-service/src/discovery/discovery.service.ts` | new — public 3개 |
| `apps/user-service/src/discovery/controllers/discovery.controller.ts` | new — 내부 HTTP 3개 |
| `apps/user-service/src/discovery/discovery.module.ts` | new |
| `apps/user-service/src/user-service.module.ts` | modified — `StorageModule` · `DiscoveryModule` |
| `apps/user-service/src/reservation/reservation.constants.ts` | modified — `RESERVATION_QR_ISSUE_FAILED_MESSAGE` |
| `apps/user-service/src/reservation/reservation.util.ts` | modified — `Stay.is_now` · `toNowStay` · 시작 비교 분 단위 · `toAvailabilityGroups`(← `toAvailabilityRooms` 삭제) · `toSlot` · `toAvailabilityRoom` · `buildRoomQr` · `isReservationStarted` |
| `apps/user-service/src/reservation/reservation.service.ts` | modified — 예약 가능 시간 · 지금 바로 생성 · 결제 확인 QR · 내 예약 QR 은 `buildRoomQr` |
| `apps/user-service/src/reservation/controllers/reservation.controller.ts` | modified — 주석(객실 그룹별) |
| `apps/gateway/src/api/v1/user-service/discovery/controllers/discovery.controller.ts` | new — 공개 3개(가드 없음) |
| `apps/gateway/src/api/v1/user-service/discovery/discovery.module.ts` | new |
| `apps/gateway/src/gateway.module.ts` | modified — `DiscoveryModule` |
| `apps/gateway/src/api/v1/user-service/reservation/controllers/reservation.controller.ts` | modified — 예약 가능 시간 summary |
| `apps/user-service/src/discovery/test/discovery.test-helper.ts` | new |
| `apps/user-service/src/discovery/test/discovery-store-list.spec.ts` | new — `[CASES:radius-box]` |
| `apps/user-service/src/discovery/test/discovery-store-detail.spec.ts` | new |
| `apps/user-service/src/discovery/test/discovery-room-group-list.spec.ts` | new |
| `apps/user-service/src/discovery/test/discovery.repository.spec.ts` | new — 오류 변환 · 조건 · Smoke |
| `apps/user-service/src/reservation/test/reservation-availability.spec.ts` | modified — 새 모양 · `[CASES:now-stay]` · 그룹 필터 |
| `apps/user-service/src/reservation/test/reservation-create.spec.ts` | modified — 지금 바로 |
| `apps/user-service/src/reservation/test/reservation-payment-confirm.spec.ts` | modified — QR 발급 |
| `README.md` | modified — discovery 공개 API · 예약 가능 시간 모양 · 지금 바로 · 결제 확인 QR |
| `AGENTS.md` | modified — 구조(user-service discovery) · 인증 없는 공개 라우트 · Query DTO 목록 · 외부 연동 사용처 · Smoke 목록 |
| `docs/architecture.md` · `docs/integration.md` · `docs/testing.md` | modified — 도메인 · 모듈 · `STORAGE_GATEWAY` 사용처 · Smoke 목록 |
| `.beaver/output/roadmap/roomless-roadmap.md` (+ html) | modified — Phase 18 유닛 · 파일 집합(사용자 승인 뒤) |

변경 없음(확인): `compose.user-service.yml`(AWS 값을 빈 값으로 덮지 않음 — `AWS_S3_PUBLIC_URL` 이 이미 닿는다), `apps/user-service/src/reservation/repositories/reservation.repository.ts`(그룹 필터는 service 가 호실 목록에서), 총관리자 업체 목록 `GET /api/v1/admin-service/store`(좌표 무관 — 그대로).

삭제(§1.7): `toAvailabilityRooms`(그룹 단위 `toAvailabilityGroups` 로 바뀜), 내 예약 QR 의 인라인 QR 엔티티 조립(→ `buildRoomQr`), 내 예약 QR 의 인라인 실패 메시지(→ 상수). 응답 DTO 의 호실 단위 `price` · `room_group_id` · `room_group_name` · `slots` 필드(그룹으로 올라감).

---

## Design

### Input/Validation (DTO·Schema)

```ts
// libs/contracts/src/discovery/discovery.commands.ts — new
/** discovery 내부 HTTP 경로 접두 */
const DISCOVERY_INTERNAL_BASE = '/internal/v1/user-service/discovery';

/**
 * discovery 도메인 내부 HTTP 경로 (게이트웨이 → user-service). 이용자 둘러보기 — 로그인 없이 조회만(큐 명령 없음). 파라미터가 있는 경로는 함수로 만든다.
 */
export const DISCOVERY_INTERNAL_PATH = {
    /** 반경 업체 조회 (GET, 인증 없음) */
    STORE_LIST: `${DISCOVERY_INTERNAL_BASE}/store`,
    /** 업체 상세 (GET, 인증 없음) */
    storeDetail: (store_id: string) => `${DISCOVERY_INTERNAL_BASE}/store/${encodeURIComponent(store_id)}`,
    /** 업체의 객실 그룹 목록 (GET, 인증 없음) */
    roomGroupList: (store_id: string) => `${DISCOVERY_INTERNAL_BASE}/store/${encodeURIComponent(store_id)}/room-group`,
} as const;
```

```ts
// libs/contracts/src/discovery/dto/discovery-store-list.dto.ts — new
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
```

```ts
// libs/contracts/src/discovery/dto/discovery-store-detail.dto.ts — new
import {ApiProperty} from '@nestjs/swagger';
import {IsNotEmpty, Matches} from 'class-validator';

/**
 * 업체 상세 path param
 */
export class DiscoveryStoreDetailParamDto {
    @ApiProperty({description: '업체 ID'})
    @Matches(/^[a-f0-9]{32}$/, {message: '업체 ID가 올바르지 않습니다.'})
    @IsNotEmpty({message: '업체 ID를 입력해주세요.'})
    store_id: string;
}

/**
 * 업체 사진 1장
 */
export class DiscoveryStoreImageResultDto {
    @ApiProperty({description: '사진 주소 (CloudFront)'})
    image_url: string;

    @ApiProperty({description: '정렬 순서 (0 부터)'})
    sort_order: number;
}

/**
 * 요일 영업시간 1개
 */
export class DiscoveryStoreHourResultDto {
    @ApiProperty({description: '요일 (0: 일 ~ 6: 토)'})
    day_of_week: number;

    @ApiProperty({description: '휴무 여부 (0: 영업, 1: 휴무 — 시각 null)'})
    is_closed: number;

    @ApiProperty({description: '여는 시각 (HH:mm, 한국 시각) — 휴무면 null', nullable: true, type: String})
    open_time: string | null;

    @ApiProperty({description: '닫는 시각 (HH:mm — 여는 시각보다 이르면 다음 날) — 휴무면 null', nullable: true, type: String})
    close_time: string | null;
}

/**
 * 브레이크타임 1개 (매일)
 */
export class DiscoveryStoreBreakResultDto {
    @ApiProperty({description: '시작 시각 (HH:mm)'})
    start_time: string;

    @ApiProperty({description: '끝 시각 (HH:mm)'})
    end_time: string;
}

/**
 * 판매 중인 상품 설정 1개
 */
export class DiscoveryStorePlanResultDto {
    @ApiProperty({description: '상품 종류 (HOURLY: 시간 이용, NIGHT: 1박, LONG: 연박)'})
    room_plan_type_id: string;

    @ApiProperty({description: '상품 종류명'})
    room_plan_type_name: string;

    @ApiProperty({description: '예약 가능 요일 (비트 — 일 1 · 월 2 · … · 토 64, 매일 127, 1박 · 연박은 입실일 기준)'})
    days_of_week: number;

    @ApiProperty({description: '이용 시간(시간) — 시간 이용만, 그 밖은 null', nullable: true, type: Number})
    usage_hours: number | null;

    @ApiProperty({description: '입실 시각 (HH:mm) — 1박 · 연박만, 그 밖은 null', nullable: true, type: String})
    check_in_time: string | null;

    @ApiProperty({description: '퇴실 시각 (HH:mm — 다음 날 이후) — 1박 · 연박만, 그 밖은 null', nullable: true, type: String})
    check_out_time: string | null;

    @ApiProperty({description: '최소 박수 — 연박만, 그 밖은 null', nullable: true, type: Number})
    min_nights: number | null;

    @ApiProperty({description: '최대 박수 — 연박만, 그 밖은 null', nullable: true, type: Number})
    max_nights: number | null;
}

/**
 * 업체 상세 — 이용자 공개용(사업자 정보 · 업체코드 · 정지 사유 · 문 시크릿 여부 · 사업자등록증은 넣지 않는다)
 */
export class DiscoveryStoreDetailResultDto {
    @ApiProperty({description: '업체 ID'})
    store_id: string;

    @ApiProperty({description: '상호명'})
    store_name: string;

    @ApiProperty({description: '업체 연락처'})
    phone: string;

    @ApiProperty({description: '주소'})
    address: string;

    @ApiProperty({description: '상세주소', nullable: true, type: String})
    address_detail: string | null;

    @ApiProperty({description: '위도 (WGS84)'})
    latitude: number;

    @ApiProperty({description: '경도 (WGS84)'})
    longitude: number;

    @ApiProperty({description: '업체 소개', nullable: true, type: String})
    introduction: string | null;

    @ApiProperty({description: '영업중 여부 (0: 지금 영업하지 않음 — 예약 불가, 1: 영업중)'})
    is_open: number;

    @ApiProperty({description: '24시간 연중무휴 여부 (0: 요일별 영업시간, 1: 24시간 — hours 는 참고용)'})
    is_always_open: number;

    @ApiProperty({description: '예약 가능 시작(시간) — 이용 시작 n시간 전부터 예약을 받는다'})
    booking_open_hours: number;

    @ApiProperty({description: '100% 환불 마감(분) — 이용 시작 n분 전까지 취소하면 전액 환불'})
    refund_deadline_minutes: number;

    @ApiProperty({description: '마감 뒤 환불 비율(%) — 마감 뒤 ~ 이용 시작 전 취소'})
    late_refund_percent: number;

    @ApiProperty({description: '업체 사진 (정렬 순서)', type: () => [DiscoveryStoreImageResultDto]})
    images: DiscoveryStoreImageResultDto[];

    @ApiProperty({description: '요일별 영업시간 (일 ~ 토)', type: () => [DiscoveryStoreHourResultDto]})
    hours: DiscoveryStoreHourResultDto[];

    @ApiProperty({description: '브레이크타임 (시작 순, 매일)', type: () => [DiscoveryStoreBreakResultDto]})
    breaks: DiscoveryStoreBreakResultDto[];

    @ApiProperty({description: '판매 중인 상품 설정 (시간 이용 → 1박 → 연박)', type: () => [DiscoveryStorePlanResultDto]})
    plans: DiscoveryStorePlanResultDto[];
}
```

```ts
// libs/contracts/src/discovery/dto/discovery-room-group-list.dto.ts — new
import {ApiProperty} from '@nestjs/swagger';
import {IsNotEmpty, Matches} from 'class-validator';

/**
 * 업체의 객실 그룹 목록 path param
 */
export class DiscoveryRoomGroupListParamDto {
    @ApiProperty({description: '업체 ID'})
    @Matches(/^[a-f0-9]{32}$/, {message: '업체 ID가 올바르지 않습니다.'})
    @IsNotEmpty({message: '업체 ID를 입력해주세요.'})
    store_id: string;
}

/**
 * 객실 그룹 상세정보 (편의시설)
 */
export class DiscoveryRoomGroupDetailResultDto {
    @ApiProperty({description: '객실 안의 방 개수'})
    room_count: number;

    @ApiProperty({description: '샤워 시설 여부 (0 · 1)'})
    has_shower: number;

    @ApiProperty({description: 'TV 여부 (0 · 1)'})
    has_tv: number;

    @ApiProperty({description: 'PC 여부 (0 · 1)'})
    has_pc: number;
}

/**
 * 객실 그룹 사진 1장
 */
export class DiscoveryRoomGroupImageResultDto {
    @ApiProperty({description: '사진 주소 (CloudFront)'})
    image_url: string;

    @ApiProperty({description: '정렬 순서 (0 이 대표)'})
    sort_order: number;
}

/**
 * 기간 가격 1개 — 그 기간의 날짜는 기본 요금 대신 이 요금
 */
export class DiscoveryRoomGroupPeriodPriceResultDto {
    @ApiProperty({description: '시작 날짜 (YYYY-MM-DD, 포함)'})
    start_date: string;

    @ApiProperty({description: '끝 날짜 (YYYY-MM-DD, 포함)'})
    end_date: string;

    @ApiProperty({description: '요금(원)'})
    price: number;

    @ApiProperty({description: '메모 (예: 여름 성수기)', nullable: true, type: String})
    memo: string | null;
}

/**
 * 판매 중인 상품 1개
 */
export class DiscoveryRoomGroupPlanResultDto {
    @ApiProperty({description: '상품 종류 (HOURLY · NIGHT · LONG)'})
    room_plan_type_id: string;

    @ApiProperty({description: '상품 종류명'})
    room_plan_type_name: string;

    @ApiProperty({description: '기본 요금(원) — 시간 이용 1회 · 1박 · 연박 1박당'})
    price: number;

    @ApiProperty({description: '기간 가격 (끝 날짜가 오늘 이후, 시작 날짜 순)', type: () => [DiscoveryRoomGroupPeriodPriceResultDto]})
    period_prices: DiscoveryRoomGroupPeriodPriceResultDto[];
}

/**
 * 객실 그룹 1개 — 예약 받을 호실 · 판매 중인 상품이 있는 그룹만
 */
export class DiscoveryRoomGroupItemResultDto {
    @ApiProperty({description: '객실 그룹 ID'})
    room_group_id: string;

    @ApiProperty({description: '그룹명'})
    room_group_name: string;

    @ApiProperty({description: '설명', nullable: true, type: String})
    description: string | null;

    @ApiProperty({description: '상세정보 (편의시설)', type: () => DiscoveryRoomGroupDetailResultDto})
    room_group_detail: DiscoveryRoomGroupDetailResultDto;

    @ApiProperty({description: '예약 받을 호실 수 (지워지지 않고 사용중지가 아닌 호실)'})
    room_count: number;

    @ApiProperty({description: '사진 (정렬 순서)', type: () => [DiscoveryRoomGroupImageResultDto]})
    images: DiscoveryRoomGroupImageResultDto[];

    @ApiProperty({description: '판매 중인 상품 (시간 이용 → 1박 → 연박)', type: () => [DiscoveryRoomGroupPlanResultDto]})
    plans: DiscoveryRoomGroupPlanResultDto[];
}

/**
 * 업체의 객실 그룹 목록 — 그룹명 순. 시간대별 예약 가능한 호수는 예약 가능 시간 API(그룹 필터)로 본다
 */
export class DiscoveryRoomGroupListResultDto {
    @ApiProperty({description: '객실 그룹 목록 (그룹명 순)', type: () => [DiscoveryRoomGroupItemResultDto]})
    list: DiscoveryRoomGroupItemResultDto[];
}
```

```ts
// libs/contracts/src/reservation/dto/reservation-availability.dto.ts — modified (전체)
import {ApiProperty} from '@nestjs/swagger';
import {IsIn, IsNotEmpty, IsOptional, Matches, ValidateIf} from 'class-validator';

/**
 * 객실 그룹별 예약 가능 시간 query — 업체 · 날짜(한국 날짜) · 상품, 그룹 필터(선택). 연박은 박수가 필수다. 쿼리 값은 문자열이다.
 */
export class ReservationAvailabilityDto {
    @ApiProperty({description: '업체 ID'})
    @Matches(/^[a-f0-9]{32}$/, {message: '업체 ID가 올바르지 않습니다.'})
    @IsNotEmpty({message: '업체 ID를 입력해주세요.'})
    store_id: string;

    @ApiProperty({description: '날짜 (YYYY-MM-DD, 한국 날짜 — 시간 이용은 시작일, 1박 · 연박은 입실일)'})
    @Matches(/^\d{4}-\d{2}-\d{2}$/, {message: '날짜를 YYYY-MM-DD 로 입력해주세요.'})
    @IsNotEmpty({message: '날짜를 입력해주세요.'})
    date: string;

    @ApiProperty({description: '상품 종류 (HOURLY: 시간 이용, NIGHT: 1박, LONG: 연박)', enum: ['HOURLY', 'NIGHT', 'LONG']})
    @IsIn(['HOURLY', 'NIGHT', 'LONG'], {message: '상품 종류가 올바르지 않습니다.'})
    @IsNotEmpty({message: '상품 종류를 입력해주세요.'})
    room_plan_type_id: string;

    @ApiProperty({description: '박수 — 연박(LONG)이면 필수(업체 설정 최소 ~ 최대 박수), 그 밖은 무시', required: false})
    @ValidateIf((dto: ReservationAvailabilityDto) => dto.room_plan_type_id === 'LONG')
    @Matches(/^\d{1,3}$/, {message: '박수를 숫자로 입력해주세요.'})
    @IsNotEmpty({message: '연박은 박수를 입력해주세요.'})
    nights: string | null;

    @ApiProperty({description: '객실 그룹 ID — 그 그룹만(선택, 업체에 없는 그룹이면 빈 목록)', required: false, nullable: true, type: String})
    @IsOptional()
    @Matches(/^[a-f0-9]{32}$/, {message: '객실 그룹 ID가 올바르지 않습니다.'})
    room_group_id: string | null;

    /**
     * @param data 요청 쿼리 — 빠진 값은 빈 문자열(검증에서 걸린다), 박수 · 그룹은 null
     */
    constructor(data?: Partial<ReservationAvailabilityDto>) {
        this.store_id = data?.store_id ?? '';
        this.date = data?.date ?? '';
        this.room_plan_type_id = data?.room_plan_type_id ?? '';
        this.nights = data?.nights ?? null;
        this.room_group_id = data?.room_group_id ?? null;
    }
}

/**
 * 예약 가능한 호수 1개
 */
export class ReservationAvailabilityRoomResultDto {
    @ApiProperty({description: '호실 ID'})
    room_id: string;

    @ApiProperty({description: '호실명'})
    room_name: string;

    @ApiProperty({description: '층 (지하는 음수)'})
    floor: number;
}

/**
 * 시간대 1개 — 예약 가능한 호수가 1개 이상인 것만 나온다
 */
export class ReservationAvailabilitySlotResultDto {
    @ApiProperty({description: '시작(입실) 일시 (ISO 8601)'})
    start_at: string;

    @ApiProperty({description: '끝(퇴실) 일시 (ISO 8601)'})
    end_at: string;

    @ApiProperty({description: '지금 바로 여부 (1: 지금(분 단위)부터 — 시간 이용 · 오늘만, 예약 생성 때 is_now: 1 / 0: 30분 단위 시작 · 입실 시각)'})
    is_now: number;

    @ApiProperty({description: '이 시간대에 예약 가능한 호수 (층 · 호실명 순)', type: () => [ReservationAvailabilityRoomResultDto]})
    rooms: ReservationAvailabilityRoomResultDto[];
}

/**
 * 객실 그룹 1개 — 이 상품을 파는 그룹(그룹 상품 판매 · 요금 > 0)만 나온다. 예약할 수 있는 시간대가 없으면 slots 가 빈 배열이다
 */
export class ReservationAvailabilityGroupResultDto {
    @ApiProperty({description: '객실 그룹 ID'})
    room_group_id: string;

    @ApiProperty({description: '객실 그룹명'})
    room_group_name: string;

    @ApiProperty({description: '금액(원) — 시간 이용 1회 · 1박 · 연박 박수 합계(기간 가격 반영)'})
    price: number;

    @ApiProperty({description: '시간대 (시작 순 — 지금 바로가 맨 앞, 시간 이용은 30분 단위)', type: () => [ReservationAvailabilitySlotResultDto]})
    slots: ReservationAvailabilitySlotResultDto[];
}

/**
 * 객실 그룹별 예약 가능 시간
 */
export class ReservationAvailabilityResultDto {
    @ApiProperty({description: '상품 종류'})
    room_plan_type_id: string;

    @ApiProperty({description: '날짜 (YYYY-MM-DD)'})
    date: string;

    @ApiProperty({description: '박수 — 연박만, 그 밖은 null', nullable: true, type: Number})
    nights: number | null;

    @ApiProperty({description: '객실 그룹 목록 (그룹명 순)', type: () => [ReservationAvailabilityGroupResultDto]})
    list: ReservationAvailabilityGroupResultDto[];
}
```

```ts
// libs/contracts/src/reservation/dto/reservation.dto.ts — modified (import · date 뒤에 is_now, start_time 조건)
import {IsIn, IsInt, IsNotEmpty, IsOptional, Matches, Max, Min, ValidateIf} from 'class-validator';

    @ApiProperty({description: '날짜 (YYYY-MM-DD, 한국 날짜 — 시간 이용은 시작일, 1박 · 연박은 입실일)'})
    @Matches(/^\d{4}-\d{2}-\d{2}$/, {message: '날짜를 YYYY-MM-DD 로 입력해주세요.'})
    @IsNotEmpty({message: '날짜를 입력해주세요.'})
    date: string;

    @ApiProperty({description: '지금 바로 이용 (1: 지금(분 단위 내림)부터 이용 시간만큼 — 시간 이용 · 오늘 날짜만, 시작 시각은 보내지 않는다 / 0 또는 생략: 시작 시각대로)', required: false, enum: [0, 1]})
    @IsOptional()
    @IsIn([0, 1], {message: '지금 바로 이용 여부가 올바르지 않습니다.'})
    is_now?: number;

    @ApiProperty({description: '시작 시각 (HH:mm — 00분 · 30분, 한국 시각) — 시간 이용이면 필수(지금 바로는 빼고), 그 밖은 무시', required: false})
    @ValidateIf((dto: ReservationDto) => dto.room_plan_type_id === 'HOURLY' && dto.is_now !== 1)
    @Matches(/^([01]\d|2[0-3]):(00|30)$/, {message: '시작 시각을 30분 단위 HH:mm 으로 입력해주세요.'})
    @IsNotEmpty({message: '시간 이용은 시작 시각을 입력해주세요.'})
    start_time?: string;
```

### Data Access (Repository/DAO)

```ts
// apps/user-service/src/discovery/discovery.symbols.ts — new
/** discovery repository 포트 토큰 — 구현: DiscoveryRepository */
export const DISCOVERY_REPOSITORY = Symbol('DiscoveryRepositoryInterface');
```

```ts
// apps/user-service/src/discovery/discovery.constants.ts — new
/** 공개 업체 상태 — 활성(영업중지 · 탈퇴는 이용자에게 보이지 않는다 — 로드맵 횡단 규칙 "업체 공개") */
export const DISCOVERY_STORE_STATE_ACTIVE = 'ACTIVE';

/** 업체 사진 용도(공개 — CDN 주소) */
export const DISCOVERY_STORE_IMAGE_PURPOSE = 'STORE_IMAGE';

/** 사용중지 호실 상태 — 예약을 받지 않는다(호실 수 · 최저가에서 빠진다) */
export const DISCOVERY_ROOM_STATE_DISABLED = 'DISABLED';

/** 상품 종류 */
export const DISCOVERY_PLAN_TYPE = {HOURLY: 'HOURLY', NIGHT: 'NIGHT', LONG: 'LONG'} as const;

/** 상품 종류 나열 순서 — 시간 이용 → 1박 → 연박 */
export const DISCOVERY_PLAN_TYPE_ORDER: string[] = [DISCOVERY_PLAN_TYPE.HOURLY, DISCOVERY_PLAN_TYPE.NIGHT, DISCOVERY_PLAN_TYPE.LONG];

/** 반경 업체 조회 최대 개수 — 넘으면 is_truncated (사용자 결정 2026-11-06) */
export const DISCOVERY_STORE_LIMIT = 300;

/** 지구 반지름(km) — 반경 사각형(discovery.util.ts) · 거리 SQL(discovery.repository.ts)이 같은 값을 쓴다 */
export const DISCOVERY_EARTH_RADIUS_KM = 6371;

/** 날짜 형식 (한국 날짜) */
export const DISCOVERY_DATE_FORMAT = 'YYYY-MM-DD';

/** 업체 없음 — 상세 · 그룹 목록 두 곳 */
export const DISCOVERY_STORE_NOT_FOUND_MESSAGE = '업체를 찾을 수 없습니다.';
```

```ts
// apps/user-service/src/discovery/interfaces/discovery.repository.interface.ts — new
import type {FindOptionsWhere} from 'typeorm';
import type {RoomGroupImageEntity} from '@app/database/entities/room/room-group-image.entity.js';
import type {RoomGroupPlanPriceEntity} from '@app/database/entities/room/room-group-plan-price.entity.js';
import type {RoomGroupPlanEntity} from '@app/database/entities/room/room-group-plan.entity.js';
import type {RoomGroupEntity} from '@app/database/entities/room/room-group.entity.js';
import type {StoreBreakEntity} from '@app/database/entities/store/store-break.entity.js';
import type {StoreFileEntity} from '@app/database/entities/store/store-file.entity.js';
import type {StoreHourEntity} from '@app/database/entities/store/store-hour.entity.js';
import type {StoreEntity} from '@app/database/entities/store/store.entity.js';

/** 반경 업체 조회 조건 — 중심 · 반경(m) · 인덱스로 먼저 거를 위경도 사각형 */
export interface DiscoveryStoreFilter {
    latitude: number;
    longitude: number;
    radius_m: number;
    min_latitude: number;
    max_latitude: number;
    min_longitude: number;
    max_longitude: number;
}

/** 반경 업체 행 (QueryBuilder raw — 별칭이 이 키와 같다) */
export interface DiscoveryStoreRow {
    store_id: string;
    store_name: string;
    address: string;
    latitude: number;
    longitude: number;
    distance_m: number;
    cover_file_key: string | null;
    is_open: number;
    is_always_open: number;
    min_hourly_price: number | null;
    min_night_price: number | null;
}

/** 업체 상품 설정 행 — 상품 종류명 조인 (QueryBuilder raw) */
export interface DiscoveryStorePlanRow {
    room_plan_type_id: string;
    room_plan_type_name: string;
    is_used: number;
    days_of_week: number;
    usage_hours: number | null;
    check_in_time: string | null;
    check_out_time: string | null;
    min_nights: number | null;
    max_nights: number | null;
}

/** 그룹별 예약 받을 호실 수 (QueryBuilder raw) */
export interface DiscoveryRoomCountRow {
    room_group_id: string;
    room_count: number;
}

/**
 * discovery repository 포트 — 공유 DB 의 업체 · 객실 표를 둘러보기 어휘로 읽기만 한다(사용자 결정 2026-11-03 — 공유 DB 직접 읽기).
 * is_deleted 가 있는 표는 repository 가 지워지지 않은 행만 읽는다.
 */
export interface DiscoveryRepositoryInterface {
    /** 반경 안의 활성 업체 — 가까운 순, limit 개 */
    findStoreRows(filter: DiscoveryStoreFilter, limit: number): Promise<DiscoveryStoreRow[]>;
    /** 업체 단건 */
    findDiscoveryStore(where: FindOptionsWhere<StoreEntity>): Promise<StoreEntity | null>;
    /** 업체 정보 파일 — 정렬 순서 · 등록일 순 */
    findStoreImages(where: FindOptionsWhere<StoreFileEntity>): Promise<StoreFileEntity[]>;
    /** 요일 영업시간 — 요일 순 */
    findStoreHours(store_id: string): Promise<StoreHourEntity[]>;
    /** 브레이크타임 — 시작 순 */
    findStoreBreaks(store_id: string): Promise<StoreBreakEntity[]>;
    /** 업체 상품 설정 + 종류명 */
    findStorePlanRows(store_id: string): Promise<DiscoveryStorePlanRow[]>;
    /** 객실 그룹 — 그룹명 순 */
    findRoomGroups(where: FindOptionsWhere<RoomGroupEntity>): Promise<RoomGroupEntity[]>;
    /** 그룹별 예약 받을 호실 수(호실이 없는 그룹은 행이 없다) */
    countBookableRooms(room_group_ids: string[]): Promise<DiscoveryRoomCountRow[]>;
    /** 객실 그룹 사진 — 정렬 순서 · 등록일 순 */
    findRoomGroupImages(where: FindOptionsWhere<RoomGroupImageEntity>): Promise<RoomGroupImageEntity[]>;
    /** 그룹 상품 */
    findRoomGroupPlans(where: FindOptionsWhere<RoomGroupPlanEntity>): Promise<RoomGroupPlanEntity[]>;
    /** 기간 가격 — 시작 날짜 순 */
    findRoomGroupPlanPrices(where: FindOptionsWhere<RoomGroupPlanPriceEntity>): Promise<RoomGroupPlanPriceEntity[]>;
}
```

```ts
// apps/user-service/src/discovery/repositories/discovery.repository.ts — new
import {Injectable, InternalServerErrorException} from '@nestjs/common';
import {TransactionHost} from '@nestjs-cls/transactional';
import type {TransactionalAdapterTypeOrm} from '@nestjs-cls/transactional-adapter-typeorm';
import type {FindOptionsWhere, Repository, SelectQueryBuilder} from 'typeorm';
import {RoomGroupImageEntity} from '@app/database/entities/room/room-group-image.entity.js';
import {RoomGroupPlanPriceEntity} from '@app/database/entities/room/room-group-plan-price.entity.js';
import {RoomGroupPlanEntity} from '@app/database/entities/room/room-group-plan.entity.js';
import {RoomGroupEntity} from '@app/database/entities/room/room-group.entity.js';
import {RoomPlanTypeEntity} from '@app/database/entities/room/room-plan-type.entity.js';
import {RoomPlanEntity} from '@app/database/entities/room/room-plan.entity.js';
import {RoomEntity} from '@app/database/entities/room/room.entity.js';
import {StoreBreakEntity} from '@app/database/entities/store/store-break.entity.js';
import {StoreFileEntity} from '@app/database/entities/store/store-file.entity.js';
import {StoreHourEntity} from '@app/database/entities/store/store-hour.entity.js';
import {StoreEntity} from '@app/database/entities/store/store.entity.js';
import {notDeleted} from '@app/database/soft-delete.js';
import {DISCOVERY_EARTH_RADIUS_KM, DISCOVERY_PLAN_TYPE, DISCOVERY_ROOM_STATE_DISABLED, DISCOVERY_STORE_IMAGE_PURPOSE, DISCOVERY_STORE_STATE_ACTIVE} from '../discovery.constants.js';
import type {DiscoveryRepositoryInterface, DiscoveryRoomCountRow, DiscoveryStoreFilter, DiscoveryStorePlanRow, DiscoveryStoreRow} from '../interfaces/discovery.repository.interface.js';

/** DB 최종 실패 메시지 */
const SERVER_ERROR_MESSAGE = '서버에서 오류가 발생했습니다. 관리자에게 문의해주세요.';

/**
 * 중심(:latitude, :longitude)과 업체 "s" 사이 대원 거리(m) — haversine, 지구 반지름 DISCOVERY_EARTH_RADIUS_KM(반경 사각형과 같은 값).
 * 부동소수 오차로 ASIN 인자가 1 을 넘지 않게 LEAST 로 막는다.
 */
const DISTANCE_SQL = `(${2 * DISCOVERY_EARTH_RADIUS_KM * 1000} * ASIN(LEAST(1, SQRT(POWER(SIN(RADIANS("s"."latitude" - :latitude) / 2), 2) + COS(RADIANS(:latitude)) * COS(RADIANS("s"."latitude")) * POWER(SIN(RADIANS("s"."longitude" - :longitude) / 2), 2)))))`;

/** 그 그룹에 예약 받을 호실(지워지지 않고 사용중지 아님)이 있는지 — 최저가 서브쿼리용 */
const GROUP_HAS_BOOKABLE_ROOM_SQL = 'EXISTS (SELECT 1 FROM "t_room" "r" WHERE "r"."room_group_id" = "g"."room_group_id" AND "r"."is_deleted" = 0 AND "r"."room_state_id" <> :disabled_state)';

/**
 * discovery repository (아웃바운드 어댑터) — 공유 DB 의 업체 · 객실 표(store · room 도메인 표)를 둘러보기 어휘로 읽기만 한다.
 * is_deleted 가 있는 표의 조회에는 항상 is_deleted = 0 을 붙인다(notDeleted · QueryBuilder 는 서브쿼리 표까지).
 */
@Injectable()
export class DiscoveryRepository implements DiscoveryRepositoryInterface {
    /**
     * @param txHost 트랜잭션 호스트
     */
    constructor(private readonly txHost: TransactionHost<TransactionalAdapterTypeOrm>) {}

    /** t_store */
    private get stores(): Repository<StoreEntity> {
        return this.txHost.tx.getRepository(StoreEntity);
    }

    /** t_store_file */
    private get storeFiles(): Repository<StoreFileEntity> {
        return this.txHost.tx.getRepository(StoreFileEntity);
    }

    /** t_store_hour */
    private get storeHours(): Repository<StoreHourEntity> {
        return this.txHost.tx.getRepository(StoreHourEntity);
    }

    /** t_store_break */
    private get storeBreaks(): Repository<StoreBreakEntity> {
        return this.txHost.tx.getRepository(StoreBreakEntity);
    }

    /** t_room_plan */
    private get roomPlans(): Repository<RoomPlanEntity> {
        return this.txHost.tx.getRepository(RoomPlanEntity);
    }

    /** t_room_group */
    private get roomGroups(): Repository<RoomGroupEntity> {
        return this.txHost.tx.getRepository(RoomGroupEntity);
    }

    /** t_room */
    private get rooms(): Repository<RoomEntity> {
        return this.txHost.tx.getRepository(RoomEntity);
    }

    /** t_room_group_image */
    private get roomGroupImages(): Repository<RoomGroupImageEntity> {
        return this.txHost.tx.getRepository(RoomGroupImageEntity);
    }

    /** t_room_group_plan */
    private get roomGroupPlans(): Repository<RoomGroupPlanEntity> {
        return this.txHost.tx.getRepository(RoomGroupPlanEntity);
    }

    /** t_room_group_plan_price */
    private get roomGroupPlanPrices(): Repository<RoomGroupPlanPriceEntity> {
        return this.txHost.tx.getRepository(RoomGroupPlanPriceEntity);
    }

    /**
     * 반경 안의 활성 업체 — 가까운 순(같으면 업체 ID 순), limit 개
     *
     * @param filter 중심 · 반경 · 사각형
     * @param limit 개수(서비스가 잘림 판단용으로 1개 더)
     * @returns 업체 행
     */
    async findStoreRows(filter: DiscoveryStoreFilter, limit: number): Promise<DiscoveryStoreRow[]> {
        try {
            return await this.buildStoreRowsQuery(filter, limit).getRawMany<DiscoveryStoreRow>();
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 반경 업체 쿼리 — 활성 · 지워지지 않은 업체를 위경도 사각형(인덱스 IDX_Store_LatitudeLongitude)으로 먼저 거르고 대원 거리 ≤ 반경만 남긴다.
     * 대표 사진(지워지지 않은 업체 사진 중 정렬 순서 · 등록일이 가장 앞인 1장의 키)과 상품 종류별 최저가(업체 상품 설정 사용 · 그룹 상품 사용 · 요금 > 0 ·
     * 지워지지 않은 그룹 · 예약 받을 호실이 있는 그룹의 기본 요금 최솟값, 없으면 NULL)는 서브쿼리다.
     * 매핑 민감(서브쿼리 · raw select — 별칭이 DiscoveryStoreRow 키와 같다 · 같은 이름 파라미터 재사용)이라 Data-Access Smoke spec 으로 SQL 을 고정한다.
     *
     * @param filter 중심 · 반경 · 사각형
     * @param limit 개수
     * @returns 쿼리 빌더
     */
    buildStoreRowsQuery(filter: DiscoveryStoreFilter, limit: number): SelectQueryBuilder<StoreEntity> {
        return this.stores
            .createQueryBuilder('s')
            .select('s.store_id', 'store_id')
            .addSelect('s.store_name', 'store_name')
            .addSelect('s.address', 'address')
            .addSelect('s.latitude', 'latitude')
            .addSelect('s.longitude', 'longitude')
            .addSelect(`CAST(ROUND(${DISTANCE_SQL}) AS integer)`, 'distance_m')
            .addSelect(
                (sub) =>
                    sub
                        .select('"f"."file_key"')
                        .from(StoreFileEntity, 'f')
                        .where('"f"."store_id" = "s"."store_id"')
                        .andWhere('"f"."store_file_purpose_id" = :image_purpose')
                        .andWhere('"f"."is_deleted" = 0')
                        .orderBy('"f"."sort_order"', 'ASC')
                        .addOrderBy('"f"."created_at"', 'ASC')
                        .limit(1),
                'cover_file_key',
            )
            .addSelect('s.is_open', 'is_open')
            .addSelect('s.is_always_open', 'is_always_open')
            .addSelect(
                (sub) =>
                    sub
                        .select('MIN("gp"."price")')
                        .from(RoomGroupPlanEntity, 'gp')
                        .innerJoin(RoomGroupEntity, 'g', '"g"."room_group_id" = "gp"."room_group_id"')
                        .innerJoin(RoomPlanEntity, 'p', '"p"."store_id" = "g"."store_id" AND "p"."room_plan_type_id" = "gp"."room_plan_type_id"')
                        .where('"g"."store_id" = "s"."store_id"')
                        .andWhere('"g"."is_deleted" = 0')
                        .andWhere('"gp"."room_plan_type_id" = :hourly_type')
                        .andWhere('"gp"."is_used" = 1')
                        .andWhere('"gp"."price" > 0')
                        .andWhere('"p"."is_used" = 1')
                        .andWhere(GROUP_HAS_BOOKABLE_ROOM_SQL),
                'min_hourly_price',
            )
            .addSelect(
                (sub) =>
                    sub
                        .select('MIN("gp"."price")')
                        .from(RoomGroupPlanEntity, 'gp')
                        .innerJoin(RoomGroupEntity, 'g', '"g"."room_group_id" = "gp"."room_group_id"')
                        .innerJoin(RoomPlanEntity, 'p', '"p"."store_id" = "g"."store_id" AND "p"."room_plan_type_id" = "gp"."room_plan_type_id"')
                        .where('"g"."store_id" = "s"."store_id"')
                        .andWhere('"g"."is_deleted" = 0')
                        .andWhere('"gp"."room_plan_type_id" = :night_type')
                        .andWhere('"gp"."is_used" = 1')
                        .andWhere('"gp"."price" > 0')
                        .andWhere('"p"."is_used" = 1')
                        .andWhere(GROUP_HAS_BOOKABLE_ROOM_SQL),
                'min_night_price',
            )
            .where('s.store_state_id = :active_state')
            .andWhere('s.is_deleted = 0')
            .andWhere('s.latitude BETWEEN :min_latitude AND :max_latitude')
            .andWhere('s.longitude BETWEEN :min_longitude AND :max_longitude')
            .andWhere(`${DISTANCE_SQL} <= :radius_m`)
            .orderBy('"distance_m"', 'ASC')
            .addOrderBy('s.store_id', 'ASC')
            .limit(limit)
            .setParameters({
                ...filter,
                active_state: DISCOVERY_STORE_STATE_ACTIVE,
                image_purpose: DISCOVERY_STORE_IMAGE_PURPOSE,
                hourly_type: DISCOVERY_PLAN_TYPE.HOURLY,
                night_type: DISCOVERY_PLAN_TYPE.NIGHT,
                disabled_state: DISCOVERY_ROOM_STATE_DISABLED,
            });
    }

    /**
     * 업체 단건 — 지워지지 않은 업체
     *
     * @param where 조회 조건 (service 는 is_deleted 를 넣지 않는다)
     * @returns 업체 또는 null
     */
    async findDiscoveryStore(where: FindOptionsWhere<StoreEntity>): Promise<StoreEntity | null> {
        try {
            return await this.stores.findOne({where: notDeleted(where), loadRelationIds: true});
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 업체 정보 파일 — 지워지지 않은 행, 정렬 순서 · 등록일 순
     *
     * @param where 조회 조건 (업체 · 용도)
     * @returns 파일 목록
     */
    async findStoreImages(where: FindOptionsWhere<StoreFileEntity>): Promise<StoreFileEntity[]> {
        try {
            return await this.storeFiles.find({where: notDeleted(where), order: {sort_order: 'ASC', created_at: 'ASC'}, loadRelationIds: true});
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 요일 영업시간 — 지워지지 않은 행, 요일 순
     *
     * @param store_id 업체 ID
     * @returns 영업시간 목록
     */
    async findStoreHours(store_id: string): Promise<StoreHourEntity[]> {
        try {
            return await this.storeHours.find({where: notDeleted<StoreHourEntity>({store_id}), order: {day_of_week: 'ASC'}, loadRelationIds: true});
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 브레이크타임 — 지워지지 않은 행, 시작 순
     *
     * @param store_id 업체 ID
     * @returns 브레이크타임 목록
     */
    async findStoreBreaks(store_id: string): Promise<StoreBreakEntity[]> {
        try {
            return await this.storeBreaks.find({where: notDeleted<StoreBreakEntity>({store_id}), order: {start_time: 'ASC'}, loadRelationIds: true});
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 업체 상품 설정 + 종류명
     *
     * @param store_id 업체 ID
     * @returns 상품 설정 행
     */
    async findStorePlanRows(store_id: string): Promise<DiscoveryStorePlanRow[]> {
        try {
            return await this.buildStorePlanRowsQuery(store_id).getRawMany<DiscoveryStorePlanRow>();
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 업체 상품 설정 쿼리 — 상품 종류명 조인(삭제 표시 없는 표). 매핑 민감(조인 · raw select — 별칭이 DiscoveryStorePlanRow 키와 같다)이라 Data-Access Smoke spec 으로 SQL 을 고정한다.
     *
     * @param store_id 업체 ID
     * @returns 쿼리 빌더
     */
    buildStorePlanRowsQuery(store_id: string): SelectQueryBuilder<RoomPlanEntity> {
        return this.roomPlans
            .createQueryBuilder('p')
            .select('p.room_plan_type_id', 'room_plan_type_id')
            .addSelect('t.room_plan_type_name', 'room_plan_type_name')
            .addSelect('p.is_used', 'is_used')
            .addSelect('p.days_of_week', 'days_of_week')
            .addSelect('p.usage_hours', 'usage_hours')
            .addSelect('p.check_in_time', 'check_in_time')
            .addSelect('p.check_out_time', 'check_out_time')
            .addSelect('p.min_nights', 'min_nights')
            .addSelect('p.max_nights', 'max_nights')
            .innerJoin(RoomPlanTypeEntity, 't', 't.room_plan_type_id = p.room_plan_type_id')
            .where('p.store_id = :store_id', {store_id});
    }

    /**
     * 객실 그룹 — 지워지지 않은 그룹, 그룹명 순(엔티티로 읽어 상세정보 기본값을 @AfterLoad 가 채운다)
     *
     * @param where 조회 조건
     * @returns 그룹 목록
     */
    async findRoomGroups(where: FindOptionsWhere<RoomGroupEntity>): Promise<RoomGroupEntity[]> {
        try {
            return await this.roomGroups.find({where: notDeleted(where), order: {room_group_name: 'ASC'}, loadRelationIds: true});
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 그룹별 예약 받을 호실 수
     *
     * @param room_group_ids 그룹 ID 목록 (비어 있지 않다 — service 가 거른다)
     * @returns 그룹별 수
     */
    async countBookableRooms(room_group_ids: string[]): Promise<DiscoveryRoomCountRow[]> {
        try {
            return await this.buildBookableRoomCountsQuery(room_group_ids).getRawMany<DiscoveryRoomCountRow>();
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 그룹별 예약 받을 호실 수 쿼리 — 지워지지 않고 사용중지가 아닌 호실을 그룹으로 묶어 센다. 매핑 민감(IN 펼침 · GROUP BY · raw select)이라 Data-Access Smoke spec 으로 SQL 을 고정한다.
     *
     * @param room_group_ids 그룹 ID 목록
     * @returns 쿼리 빌더
     */
    buildBookableRoomCountsQuery(room_group_ids: string[]): SelectQueryBuilder<RoomEntity> {
        return this.rooms
            .createQueryBuilder('r')
            .select('r.room_group_id', 'room_group_id')
            .addSelect('CAST(COUNT(*) AS integer)', 'room_count')
            .where('r.room_group_id IN (:...room_group_ids)', {room_group_ids})
            .andWhere('r.is_deleted = 0')
            .andWhere('r.room_state_id <> :disabled_state', {disabled_state: DISCOVERY_ROOM_STATE_DISABLED})
            .groupBy('r.room_group_id');
    }

    /**
     * 객실 그룹 사진 — 지워지지 않은 행, 정렬 순서 · 등록일 순
     *
     * @param where 조회 조건 (그룹 In)
     * @returns 사진 목록
     */
    async findRoomGroupImages(where: FindOptionsWhere<RoomGroupImageEntity>): Promise<RoomGroupImageEntity[]> {
        try {
            return await this.roomGroupImages.find({where: notDeleted(where), order: {sort_order: 'ASC', created_at: 'ASC'}, loadRelationIds: true});
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 그룹 상품 — 받은 조건 그대로(삭제 표시 없는 표 — 종류마다 1행)
     *
     * @param where 조회 조건 (그룹 In)
     * @returns 그룹 상품 목록
     */
    async findRoomGroupPlans(where: FindOptionsWhere<RoomGroupPlanEntity>): Promise<RoomGroupPlanEntity[]> {
        try {
            return await this.roomGroupPlans.find({where, loadRelationIds: true});
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 기간 가격 — 지워지지 않은 행, 시작 날짜 순
     *
     * @param where 조회 조건 (그룹 상품 In · 끝 날짜 ≥ 오늘)
     * @returns 기간 가격 목록
     */
    async findRoomGroupPlanPrices(where: FindOptionsWhere<RoomGroupPlanPriceEntity>): Promise<RoomGroupPlanPriceEntity[]> {
        try {
            return await this.roomGroupPlanPrices.find({where: notDeleted(where), order: {start_date: 'ASC'}, loadRelationIds: true});
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }
}
```

### Business Logic (Service)

```ts
// apps/user-service/src/discovery/discovery.util.ts — new
import {dayjs, KST_TIMEZONE} from '@app/common/utils/dayjs.js';
import type {DiscoveryRoomGroupImageResultDto, DiscoveryRoomGroupItemResultDto, DiscoveryRoomGroupPlanResultDto} from '@app/contracts/discovery/dto/discovery-room-group-list.dto.js';
import type {
    DiscoveryStoreBreakResultDto,
    DiscoveryStoreDetailResultDto,
    DiscoveryStoreHourResultDto,
    DiscoveryStoreImageResultDto,
    DiscoveryStorePlanResultDto,
} from '@app/contracts/discovery/dto/discovery-store-detail.dto.js';
import type {DiscoveryStoreItemResultDto} from '@app/contracts/discovery/dto/discovery-store-list.dto.js';
import type {RoomGroupPlanPriceEntity} from '@app/database/entities/room/room-group-plan-price.entity.js';
import type {RoomGroupPlanEntity} from '@app/database/entities/room/room-group-plan.entity.js';
import type {RoomGroupEntity} from '@app/database/entities/room/room-group.entity.js';
import type {StoreBreakEntity} from '@app/database/entities/store/store-break.entity.js';
import type {StoreHourEntity} from '@app/database/entities/store/store-hour.entity.js';
import type {StoreEntity} from '@app/database/entities/store/store.entity.js';
import {DISCOVERY_DATE_FORMAT, DISCOVERY_EARTH_RADIUS_KM, DISCOVERY_PLAN_TYPE_ORDER} from './discovery.constants.js';
import type {DiscoveryRoomCountRow, DiscoveryStorePlanRow, DiscoveryStoreRow} from './interfaces/discovery.repository.interface.js';

/** 반경을 덮는 위경도 사각형 — 인덱스로 먼저 거를 범위 */
export interface RadiusBox {
    min_latitude: number;
    max_latitude: number;
    min_longitude: number;
    max_longitude: number;
}

/** 그룹 사진 + 그룹 ID — service 가 공개 주소를 붙여 넘긴다 */
export interface DiscoveryRoomGroupImage extends DiscoveryRoomGroupImageResultDto {
    room_group_id: string;
}

/**
 * 도 → 라디안
 *
 * @param degrees 도
 * @returns 라디안
 */
function toRadians(degrees: number): number {
    return (degrees * Math.PI) / 180;
}

/**
 * 라디안 → 도
 *
 * @param radians 라디안
 * @returns 도
 */
function toDegrees(radians: number): number {
    return (radians * 180) / Math.PI;
}

/**
 * 시각 → HH:mm (DB time 'HH:mm:ss')
 *
 * @param time 시각
 * @returns HH:mm
 */
function toHourMinute(time: string): string {
    return dayjs(time, ['HH:mm:ss', 'HH:mm'], true).format('HH:mm');
}

/**
 * 반경을 덮는 위경도 사각형 — 위도 폭 = 반경 / R, 경도 폭 = asin(sin(반경 / R) / cos(위도))(원의 가장 동서쪽 접점까지). 극에 닿으면 경도 전체.
 * 경도 ±180 넘김은 다루지 않는다(국내 서비스). 지구 반지름은 거리 SQL 과 같은 DISCOVERY_EARTH_RADIUS_KM.
 *
 * @param latitude 중심 위도
 * @param longitude 중심 경도
 * @param radius_km 반경(km)
 * @returns 사각형
 */
export function toRadiusBox(latitude: number, longitude: number, radius_km: number): RadiusBox {
    const angle = radius_km / DISCOVERY_EARTH_RADIUS_KM;
    const latitude_delta = toDegrees(angle);
    const longitude_delta = Math.abs(latitude) + latitude_delta >= 90 ? 180 : toDegrees(Math.asin(Math.min(1, Math.sin(angle) / Math.cos(toRadians(latitude)))));
    return {min_latitude: latitude - latitude_delta, max_latitude: latitude + latitude_delta, min_longitude: longitude - longitude_delta, max_longitude: longitude + longitude_delta};
}

/**
 * 오늘(한국 날짜)
 *
 * @returns YYYY-MM-DD
 */
export function todayKst(): string {
    return dayjs().tz(KST_TIMEZONE).format(DISCOVERY_DATE_FORMAT);
}

/**
 * 반경 업체 항목
 *
 * @param row 업체 행
 * @param image_url 대표 사진 공개 주소(없으면 null)
 * @returns 항목
 */
export function toDiscoveryStoreItem(row: DiscoveryStoreRow, image_url: string | null): DiscoveryStoreItemResultDto {
    return {
        store_id: row.store_id,
        store_name: row.store_name,
        address: row.address,
        latitude: Number(row.latitude),
        longitude: Number(row.longitude),
        distance_m: Number(row.distance_m),
        image_url,
        is_open: Number(row.is_open),
        is_always_open: Number(row.is_always_open),
        min_hourly_price: row.min_hourly_price === null ? null : Number(row.min_hourly_price),
        min_night_price: row.min_night_price === null ? null : Number(row.min_night_price),
    };
}

/**
 * 업체가 그 상품 종류를 파는지 — 업체 상품 설정 사용 중
 *
 * @param row 업체 상품 설정 행
 * @returns 팔면 true
 */
export function isStorePlanUsed(row: DiscoveryStorePlanRow): boolean {
    return Number(row.is_used) === 1;
}

/**
 * 그룹 상품을 파는지 — 업체가 그 종류를 팔고(사용 중인 업체 상품 설정) · 그룹 상품 사용 중 · 요금 > 0 (예약 판정 reservation.util.ts isGroupPlanOnSale 과 같은 기준)
 *
 * @param plan 그룹 상품
 * @param store_plans 사용 중인 업체 상품 설정
 * @returns 팔면 true
 */
export function isRoomGroupPlanOnSale(plan: RoomGroupPlanEntity, store_plans: DiscoveryStorePlanRow[]): boolean {
    return plan.is_used === 1 && plan.price > 0 && store_plans.some((row) => row.room_plan_type_id === plan.room_plan_type_id);
}

/**
 * 상품 종류 순(시간 이용 → 1박 → 연박)으로 정렬한 사본
 *
 * @param rows 업체 상품 설정 행
 * @returns 정렬한 사본
 */
export function sortStorePlanRows(rows: DiscoveryStorePlanRow[]): DiscoveryStorePlanRow[] {
    return [...rows].sort((a, b) => DISCOVERY_PLAN_TYPE_ORDER.indexOf(a.room_plan_type_id) - DISCOVERY_PLAN_TYPE_ORDER.indexOf(b.room_plan_type_id));
}

/**
 * 사진 항목 — 업체 사진 · 그룹 사진 공용
 *
 * @param image_url 공개 주소
 * @param sort_order 정렬 순서
 * @returns 항목
 */
export function toDiscoveryImage(image_url: string, sort_order: number): DiscoveryStoreImageResultDto {
    return {image_url, sort_order: Number(sort_order)};
}

/**
 * 영업시간 항목 — 휴무면 시각 null
 *
 * @param entity 요일 영업시간
 * @returns 항목
 */
export function toDiscoveryHour(entity: StoreHourEntity): DiscoveryStoreHourResultDto {
    return {
        day_of_week: entity.day_of_week,
        is_closed: entity.is_closed,
        open_time: entity.open_time ? toHourMinute(entity.open_time) : null,
        close_time: entity.close_time ? toHourMinute(entity.close_time) : null,
    };
}

/**
 * 브레이크타임 항목
 *
 * @param entity 브레이크타임
 * @returns 항목
 */
export function toDiscoveryBreak(entity: StoreBreakEntity): DiscoveryStoreBreakResultDto {
    return {start_time: toHourMinute(entity.start_time), end_time: toHourMinute(entity.end_time)};
}

/**
 * 상품 설정 항목 — 시각은 HH:mm
 *
 * @param row 업체 상품 설정 행
 * @returns 항목
 */
export function toDiscoveryStorePlan(row: DiscoveryStorePlanRow): DiscoveryStorePlanResultDto {
    return {
        room_plan_type_id: row.room_plan_type_id,
        room_plan_type_name: row.room_plan_type_name,
        days_of_week: Number(row.days_of_week),
        usage_hours: row.usage_hours === null ? null : Number(row.usage_hours),
        check_in_time: row.check_in_time ? toHourMinute(row.check_in_time) : null,
        check_out_time: row.check_out_time ? toHourMinute(row.check_out_time) : null,
        min_nights: row.min_nights === null ? null : Number(row.min_nights),
        max_nights: row.max_nights === null ? null : Number(row.max_nights),
    };
}

/**
 * 업체 상세 — 사업자 정보 · 업체코드 · 정지 사유 · 문 시크릿 · 정비시간은 넣지 않는다(사용자 결정 2026-11-06)
 *
 * @param store 업체
 * @param images 업체 사진 항목
 * @param hours 영업시간
 * @param breaks 브레이크타임
 * @param plans 사용 중인 상품 설정 행
 * @returns 상세
 */
export function toDiscoveryStoreDetail(
    store: StoreEntity,
    images: DiscoveryStoreImageResultDto[],
    hours: StoreHourEntity[],
    breaks: StoreBreakEntity[],
    plans: DiscoveryStorePlanRow[],
): DiscoveryStoreDetailResultDto {
    return {
        store_id: store.store_id,
        store_name: store.store_name,
        phone: store.phone,
        address: store.address,
        address_detail: store.address_detail ?? null,
        latitude: Number(store.latitude),
        longitude: Number(store.longitude),
        introduction: store.introduction ?? null,
        is_open: store.is_open,
        is_always_open: store.is_always_open,
        booking_open_hours: store.booking_open_hours,
        refund_deadline_minutes: store.refund_deadline_minutes,
        late_refund_percent: store.late_refund_percent,
        images,
        hours: hours.map(toDiscoveryHour),
        breaks: breaks.map(toDiscoveryBreak),
        plans: sortStorePlanRows(plans).map(toDiscoveryStorePlan),
    };
}

/**
 * 객실 그룹 목록 — 받은 그룹 순(그룹명 순)으로, 예약 받을 호실이 있고 판매 중인 상품이 있는 그룹만. 상품은 시간 이용 → 1박 → 연박, 기간 가격은 받은 순(시작 날짜 순).
 *
 * @param groups 객실 그룹
 * @param counts 그룹별 예약 받을 호실 수
 * @param store_plans 사용 중인 업체 상품 설정 행(종류명)
 * @param group_plans 판매 중인 그룹 상품
 * @param periods 그 그룹 상품들의 기간 가격(끝 날짜 ≥ 오늘)
 * @param images 그룹 사진(공개 주소)
 * @returns 그룹 목록
 */
export function toDiscoveryRoomGroups(
    groups: RoomGroupEntity[],
    counts: DiscoveryRoomCountRow[],
    store_plans: DiscoveryStorePlanRow[],
    group_plans: RoomGroupPlanEntity[],
    periods: RoomGroupPlanPriceEntity[],
    images: DiscoveryRoomGroupImage[],
): DiscoveryRoomGroupItemResultDto[] {
    const result: DiscoveryRoomGroupItemResultDto[] = [];
    for (const group of groups) {
        const room_count = Number(counts.find((row) => row.room_group_id === group.room_group_id)?.room_count ?? 0);
        const plans: DiscoveryRoomGroupPlanResultDto[] = [];
        for (const store_plan of sortStorePlanRows(store_plans)) {
            const plan = group_plans.find((item) => item.room_group_id === group.room_group_id && item.room_plan_type_id === store_plan.room_plan_type_id);
            if (plan) {
                plans.push({
                    room_plan_type_id: plan.room_plan_type_id,
                    room_plan_type_name: store_plan.room_plan_type_name,
                    price: plan.price,
                    period_prices: periods
                        .filter((item) => item.room_group_plan_id === plan.room_group_plan_id)
                        .map((item) => ({start_date: item.start_date, end_date: item.end_date, price: item.price, memo: item.memo ?? null})),
                });
            }
        }
        if (room_count === 0 || plans.length === 0) {
            continue;
        }
        result.push({
            room_group_id: group.room_group_id,
            room_group_name: group.room_group_name,
            description: group.description ?? null,
            room_group_detail: {
                room_count: group.room_group_detail.room_count,
                has_shower: group.room_group_detail.has_shower,
                has_tv: group.room_group_detail.has_tv,
                has_pc: group.room_group_detail.has_pc,
            },
            room_count,
            images: images.filter((image) => image.room_group_id === group.room_group_id).map((image) => toDiscoveryImage(image.image_url, image.sort_order)),
            plans,
        });
    }
    return result;
}
```

```ts
// apps/user-service/src/discovery/discovery.service.ts — new
import {Inject, Injectable, NotFoundException} from '@nestjs/common';
import {In, MoreThanOrEqual} from 'typeorm';
import type {DiscoveryRoomGroupListResultDto} from '@app/contracts/discovery/dto/discovery-room-group-list.dto.js';
import type {DiscoveryStoreDetailResultDto} from '@app/contracts/discovery/dto/discovery-store-detail.dto.js';
import type {DiscoveryStoreListDto, DiscoveryStoreListResultDto} from '@app/contracts/discovery/dto/discovery-store-list.dto.js';
import {STORAGE_GATEWAY} from '@app/integration/integration.symbols.js';
import type {StorageGatewayInterface} from '@app/integration/interfaces/integration.interface.js';
import {DISCOVERY_STORE_IMAGE_PURPOSE, DISCOVERY_STORE_LIMIT, DISCOVERY_STORE_NOT_FOUND_MESSAGE, DISCOVERY_STORE_STATE_ACTIVE} from './discovery.constants.js';
import {DISCOVERY_REPOSITORY} from './discovery.symbols.js';
import {isRoomGroupPlanOnSale, isStorePlanUsed, todayKst, toDiscoveryImage, toDiscoveryRoomGroups, toDiscoveryStoreDetail, toDiscoveryStoreItem, toRadiusBox} from './discovery.util.js';
import type {DiscoveryRepositoryInterface} from './interfaces/discovery.repository.interface.js';

/**
 * discovery 비즈니스 로직 — 이용자 업체 둘러보기(로그인 없음, 조회만). 활성 · 지워지지 않은 업체만 보인다(영업중 아님은 is_open 0 으로 보인다).
 * 시간대별 예약 가능한 호수는 reservation 도메인의 예약 가능 시간 API 가 맡는다(재고 계산 한 곳 — 사용자 결정 2026-11-06).
 */
@Injectable()
export class DiscoveryService {
    /**
     * @param discoveryRepository discovery repository 포트
     * @param storageGateway 파일 저장소 포트 (공개 주소만 — CloudFront)
     */
    constructor(
        @Inject(DISCOVERY_REPOSITORY) private readonly discoveryRepository: DiscoveryRepositoryInterface,
        @Inject(STORAGE_GATEWAY) private readonly storageGateway: StorageGatewayInterface,
    ) {}

    /**
     * 반경 업체 조회 — 중심 위경도 + 반경(5 · 10 · 20 · 50km)의 활성 업체를 가까운 순으로 최대 300개(넘으면 is_truncated 1). 지도 마커 · 목록 카드 공용.
     * (내부 HTTP: GET /internal/v1/user-service/discovery/store)
     *
     * @param dto 위도 · 경도 · 반경
     * @returns 업체 목록 · 잘림 여부
     */
    async getStores(dto: DiscoveryStoreListDto): Promise<DiscoveryStoreListResultDto> {
        // 1. 중심 · 반경 → 사각형(인덱스로 먼저 거른다) + 거리 조건, 잘림 판단용으로 1개 더
        const latitude = Number(dto.latitude);
        const longitude = Number(dto.longitude);
        const radius_km = Number(dto.radius_km);
        const rows = await this.discoveryRepository.findStoreRows({latitude, longitude, radius_m: radius_km * 1000, ...toRadiusBox(latitude, longitude, radius_km)}, DISCOVERY_STORE_LIMIT + 1);

        // 2. 대표 사진 공개 주소
        return {
            list: rows.slice(0, DISCOVERY_STORE_LIMIT).map((row) => toDiscoveryStoreItem(row, row.cover_file_key ? this.storageGateway.getPublicUrl(row.cover_file_key) : null)),
            is_truncated: rows.length > DISCOVERY_STORE_LIMIT ? 1 : 0,
        };
    }

    /**
     * 업체 상세 — 소개 · 사진 · 연락처 · 영업시간 · 브레이크타임 · 판매 중인 상품 설정 · 환불 규정. 사업자 정보는 넣지 않는다.
     * (내부 HTTP: GET /internal/v1/user-service/discovery/store/:store_id)
     *
     * @param store_id 업체 ID
     * @returns 상세
     * @throws NotFoundException 활성 · 지워지지 않은 업체가 아닐 때
     */
    async getStore(store_id: string): Promise<DiscoveryStoreDetailResultDto> {
        // 1. 활성 업체
        const store = await this.discoveryRepository.findDiscoveryStore({store_id, store_state_id: DISCOVERY_STORE_STATE_ACTIVE});
        if (!store) {
            throw new NotFoundException({message: DISCOVERY_STORE_NOT_FOUND_MESSAGE});
        }

        // 2. 사진(공개 주소) · 영업시간 · 브레이크 · 사용 중인 상품 설정
        const images = await this.discoveryRepository.findStoreImages({store_id: store.store_id, store_file_purpose_id: DISCOVERY_STORE_IMAGE_PURPOSE});
        const hours = await this.discoveryRepository.findStoreHours(store.store_id);
        const breaks = await this.discoveryRepository.findStoreBreaks(store.store_id);
        const plans = (await this.discoveryRepository.findStorePlanRows(store.store_id)).filter(isStorePlanUsed);
        return toDiscoveryStoreDetail(
            store,
            images.map((image) => toDiscoveryImage(this.storageGateway.getPublicUrl(image.file_key), image.sort_order)),
            hours,
            breaks,
            plans,
        );
    }

    /**
     * 업체의 객실 그룹 목록 — 그룹명 순, 예약 받을 호실이 있고 판매 중인 상품이 있는 그룹만. 그룹마다 사진 · 상세정보 · 호실 수 · 상품(기본 요금 · 남은 기간 가격).
     * (내부 HTTP: GET /internal/v1/user-service/discovery/store/:store_id/room-group)
     *
     * @param store_id 업체 ID
     * @returns 그룹 목록
     * @throws NotFoundException 활성 · 지워지지 않은 업체가 아닐 때
     */
    async getRoomGroups(store_id: string): Promise<DiscoveryRoomGroupListResultDto> {
        // 1. 활성 업체 · 업체가 파는 상품 종류
        const store = await this.discoveryRepository.findDiscoveryStore({store_id, store_state_id: DISCOVERY_STORE_STATE_ACTIVE});
        if (!store) {
            throw new NotFoundException({message: DISCOVERY_STORE_NOT_FOUND_MESSAGE});
        }
        const store_plans = (await this.discoveryRepository.findStorePlanRows(store.store_id)).filter(isStorePlanUsed);
        if (store_plans.length === 0) {
            return {list: []};
        }

        // 2. 그룹
        const groups = await this.discoveryRepository.findRoomGroups({store_id: store.store_id});
        if (groups.length === 0) {
            return {list: []};
        }
        const group_ids = groups.map((group) => group.room_group_id);

        // 3. 예약 받을 호실 수 · 판매 중인 그룹 상품 · 남은 기간 가격(끝 날짜 ≥ 오늘) · 사진
        const counts = await this.discoveryRepository.countBookableRooms(group_ids);
        const group_plans = (await this.discoveryRepository.findRoomGroupPlans({room_group_id: In(group_ids)})).filter((plan) => isRoomGroupPlanOnSale(plan, store_plans));
        if (group_plans.length === 0) {
            return {list: []};
        }
        const periods = await this.discoveryRepository.findRoomGroupPlanPrices({
            room_group_plan_id: In(group_plans.map((plan) => plan.room_group_plan_id)),
            end_date: MoreThanOrEqual(todayKst()),
        });
        const images = await this.discoveryRepository.findRoomGroupImages({room_group_id: In(group_ids)});
        return {
            list: toDiscoveryRoomGroups(
                groups,
                counts,
                store_plans,
                group_plans,
                periods,
                images.map((image) => ({room_group_id: image.room_group_id, ...toDiscoveryImage(this.storageGateway.getPublicUrl(image.file_key), image.sort_order)})),
            ),
        };
    }
}
```

```ts
// apps/user-service/src/discovery/discovery.module.ts — new
import {Module} from '@nestjs/common';
import {DiscoveryController} from './controllers/discovery.controller.js';
import {DiscoveryRepository} from './repositories/discovery.repository.js';
import {DiscoveryService} from './discovery.service.js';
import {DISCOVERY_REPOSITORY} from './discovery.symbols.js';

/**
 * 업체 둘러보기 도메인 — 이용자가 로그인 없이 업체를 찾는다(조회만 — 큐 경로 없음). 파일 저장소 포트(STORAGE_GATEWAY — 공개 주소)는 루트 모듈의 StorageModule 이 전역으로 준다.
 * - DiscoveryController(controllers/discovery.controller.ts): 내부 HTTP — 반경 업체 · 업체 상세 · 객실 그룹 목록
 */
@Module({controllers: [DiscoveryController], providers: [DiscoveryService, {provide: DISCOVERY_REPOSITORY, useClass: DiscoveryRepository}]})
export class DiscoveryModule {}
```

```ts
// apps/user-service/src/user-service.module.ts — modified (import · JSDoc · imports 배열)
import {StorageModule} from '@app/integration/storage/storage.module.js';
import {DiscoveryModule} from './discovery/discovery.module.js';

 * - StorageModule: 파일 저장소 포트(STORAGE_GATEWAY, Amazon S3 · CloudFront) — 업체 둘러보기의 업체 · 객실 그룹 사진 공개 주소(getPublicUrl)만
 * 도메인: UserModule(회원) · ReservationModule(예약) · DiscoveryModule(업체 둘러보기). crontab 은 scheduler 앱이 돌린다(이 서비스에는 ScheduleModule 이 없다).

        SmsModule,
        StorageModule,
        DoorStoreModule,
        PaymentModule,
        UserModule,
        ReservationModule,
        DiscoveryModule,
```

```ts
// apps/user-service/src/reservation/reservation.constants.ts — modified (추가 — 내 예약 QR · 결제 확인 두 곳)
/** QR 발급 뒤 다시 읽어도 없음 — 500 (내 예약 QR · 결제 확인) */
export const RESERVATION_QR_ISSUE_FAILED_MESSAGE = 'QR 정보를 발급하지 못했습니다. 관리자에게 문의해주세요.';
```

```ts
// apps/user-service/src/reservation/reservation.util.ts — modified
// import (위)
import type {
    ReservationAvailabilityGroupResultDto,
    ReservationAvailabilityRoomResultDto,
    ReservationAvailabilitySlotResultDto,
} from '@app/contracts/reservation/dto/reservation-availability.dto.js';
import {generateId} from '@app/common/utils/id.js';
import {RoomQrEntity} from '@app/database/entities/door/room-qr.entity.js';

/** 이용 구간 — 입실일(요일 · 요금 기준일, 한국 날짜 0시) · 시작 · 끝(한국 시각) · 지금 바로 여부 */
export interface Stay {
    day: Dayjs;
    start: Dayjs;
    end: Dayjs;
    is_now: boolean;
}

// toStay — 두 반환에 is_now: false
export function toStay(plan: RoomPlanEntity, day: Dayjs, start_time: string | null, nights: number | null): Stay {
    if (plan.room_plan_type_id === RESERVATION_PLAN_TYPE.HOURLY) {
        const start = atTimeOfDay(day, start_time as string);
        return {day, start, end: start.add(plan.usage_hours as number, 'hour'), is_now: false};
    }
    const start = atTimeOfDay(day, plan.check_in_time as string);
    const stay_nights = plan.room_plan_type_id === RESERVATION_PLAN_TYPE.NIGHT ? 1 : (nights as number);
    return {day, start, end: atTimeOfDay(day.add(stay_nights, 'day'), plan.check_out_time as string), is_now: false};
}

/**
 * 지금 바로 구간(시간 이용만) — 지금(한국 시각)을 분 단위로 내린 시각부터 업체 이용 시간만큼, 입실일은 오늘(사용자 결정 2026-11-06).
 * 예: 이용 시간 4시간 · 지금 2026-11-05 23:36:27 → 23:36 ~ 다음 날 03:36.
 *
 * @param plan 업체 상품 설정(시간 이용)
 * @param now 지금(한국 시각)
 * @returns 구간
 */
export function toNowStay(plan: RoomPlanEntity, now: Dayjs): Stay {
    const start = now.startOf('minute');
    return {day: toKstDay(now.format(RESERVATION_DATE_FORMAT)), start, end: start.add(plan.usage_hours as number, 'hour'), is_now: true};
}

// listStays — 시간 이용 후보에 is_now: false
        stays.push({day, start, end: start.add(plan.usage_hours as number, 'hour'), is_now: false});

// isStayBookable — 시작 ≥ 지금(분 단위 내림): 지금 바로 구간의 시작이 지금 분이다
    if (stay.start.isBefore(context.now.startOf('minute')) || stay.start.isAfter(context.now.add(context.booking_open_hours, 'hour'))) {
        return false;
    }

// toAvailabilityRooms 삭제 → 아래 셋으로
/**
 * 예약 가능 시간 — 객실 그룹 → 시간대 → 예약 가능한 호수(사용자 결정 2026-11-06). 그룹은 판매 중인 그룹 상품이 있는 것만(시간대가 없어도 나온다) 그룹명 순,
 * 시간대는 받은 구간 순(지금 바로가 맨 앞)으로 예약 가능한 호수가 1개 이상인 것만, 호수는 받은 호실 순(층 · 호실명). 금액은 그룹 요금(입실일 기준 — 기간 가격 반영).
 *
 * @param rooms 예약 가능 호실(층 · 호실명 순)
 * @param group_plans 판매 중인 그룹 상품
 * @param periods 기간 가격
 * @param stays 후보 구간
 * @param context 재고 판정 재료
 * @param occupied 점유 예약
 * @param nights 연박 박수 — 그 밖은 null
 * @returns 그룹 목록
 */
export function toAvailabilityGroups(
    rooms: BookableRoomRow[],
    group_plans: RoomGroupPlanEntity[],
    periods: RoomGroupPlanPriceEntity[],
    stays: Stay[],
    context: BookingContext,
    occupied: OccupiedRange[],
    nights: number | null,
): ReservationAvailabilityGroupResultDto[] {
    const groups: ReservationAvailabilityGroupResultDto[] = [];
    for (const room_group_id of new Set(rooms.map((room) => room.room_group_id))) {
        const plan = group_plans.find((item) => item.room_group_id === room_group_id);
        if (!plan) {
            continue;
        }
        const groupRooms = rooms.filter((room) => room.room_group_id === room_group_id).map((room) => ({room, occupied: occupied.filter((range) => range.room_id === room.room_id)}));
        const price = calculateStayPrice(
            context.room_plan_type_id,
            stays[0].day,
            nights,
            plan.price,
            periods.filter((item) => item.room_group_plan_id === plan.room_group_plan_id),
        );
        const slots = stays
            .map((stay) => toSlot(stay, groupRooms.filter((item) => isStayBookable(stay, context, item.room.room_state_id, item.occupied)).map((item) => toAvailabilityRoom(item.room))))
            .filter((slot) => slot.rooms.length > 0);
        groups.push({room_group_id, room_group_name: groupRooms[0].room.room_group_name, price, slots});
    }
    return groups.sort((a, b) => a.room_group_name.localeCompare(b.room_group_name, 'ko'));
}

/**
 * 예약 가능한 호수 응답
 *
 * @param room 예약 가능 호실 행
 * @returns 호수
 */
export function toAvailabilityRoom(room: BookableRoomRow): ReservationAvailabilityRoomResultDto {
    return {room_id: room.room_id, room_name: room.room_name, floor: Number(room.floor)};
}

/**
 * 구간 → 시간대 응답(ISO 8601).
 *
 * @param stay 이용 구간
 * @param rooms 이 구간에 예약 가능한 호수
 * @returns 시간대
 */
export function toSlot(stay: Stay, rooms: ReservationAvailabilityRoomResultDto[]): ReservationAvailabilitySlotResultDto {
    return {start_at: stay.start.toISOString(), end_at: stay.end.toISOString(), is_now: stay.is_now ? 1 : 0, rooms};
}

/**
 * 예약의 QR — 유효 = 이용 시작 ~ 끝, QR · ID 는 32자 무작위(내 예약 QR · 결제 확인 공용, scheduler buildRoomQr 과 같은 값).
 *
 * @param reservation 예약
 * @returns QR 엔티티
 */
export function buildRoomQr(reservation: Pick<ReservationEntity, 'reservation_id' | 'room_id' | 'start_at' | 'end_at'>): RoomQrEntity {
    const roomQr = new RoomQrEntity();
    roomQr.room_qr_id = generateId();
    roomQr.room_id = reservation.room_id;
    roomQr.reservation_id = reservation.reservation_id;
    roomQr.qr = generateId();
    roomQr.starts_at = reservation.start_at;
    roomQr.ends_at = reservation.end_at;
    return roomQr;
}

/**
 * 이용이 이미 시작됐는지 — [start_at, end_at) 안(결제 확인 때 QR 을 바로 발급할지).
 *
 * @param reservation 예약
 * @param now 지금
 * @returns 이용 중 시간이면 true
 */
export function isReservationStarted(reservation: Pick<ReservationEntity, 'start_at' | 'end_at'>, now: Date): boolean {
    const at = dayjs(now);
    return !at.isBefore(reservation.start_at) && at.isBefore(reservation.end_at);
}
```

```ts
// apps/user-service/src/reservation/reservation.service.ts — modified
// import: toAvailabilityRooms → toAvailabilityGroups, + buildRoomQr · isReservationStarted · toNowStay, + RESERVATION_DATE_FORMAT · RESERVATION_QR_ISSUE_FAILED_MESSAGE

    /**
     * 객실 그룹별 예약 가능 시간 — 그룹 → 시간대 → 예약 가능한 호수(사용자 결정 2026-11-06). 업체 활성 · 상품 판매 · 그룹 상품 판매 · 재고 판정(영업시간 · 브레이크 ·
     * 일시 예약불가 · 점유 + 정비시간 · 예약 가능 기간 · 즉시 입실은 예약가능 호실만). 시간 이용 · 오늘이면 '지금 바로' 시간대를 맨 앞에 둔다. 그룹 필터(room_group_id)는 선택.
     * (내부 HTTP: GET /internal/v1/user-service/reservation/availability)
     */
    async getAvailability(dto: ReservationAvailabilityDto): Promise<ReservationAvailabilityResultDto> {
        // 1. 날짜 · 박수 (그대로)
        ...
        // 4. 호실(그룹 필터) · 판매 중인 그룹 상품 · 기간 가격
        const rooms = (await this.reservationRepository.findBookableRooms(store.store_id)).filter((room) => !dto.room_group_id || room.room_group_id === dto.room_group_id);
        const group_ids = [...new Set(rooms.map((room) => room.room_group_id))];
        if (group_ids.length === 0) {
            return empty;
        }
        ... (group_plans · periods 그대로)

        // 5. 후보 구간 — 시간 이용 · 오늘이면 지금 바로를 맨 앞에(사용자 결정 2026-11-06), 재고 판정 재료(조회 범위 안의 일시 예약불가 · 점유 예약)
        const now = nowKst();
        const day_stays = listStays(plan, toKstDay(dto.date), nights);
        const stays = plan.room_plan_type_id === RESERVATION_PLAN_TYPE.HOURLY && dto.date === now.format(RESERVATION_DATE_FORMAT) ? [toNowStay(plan, now), ...day_stays] : day_stays;
        const range = toStaysRange(stays, store.maintenance_minutes);
        ... (hours · breaks · unavailable · occupied 그대로)
        const context = buildBookingContext(now, store, plan, hours, breaks, unavailable);

        // 6. 그룹 → 시간대 → 호수
        return {...empty, list: toAvailabilityGroups(rooms, group_plans, periods, stays, context, occupied, nights)};
    }

    /**
     * 예약 생성 — ... (기존 설명) 시간 이용은 is_now 1 이면 지금(분 단위)부터(오늘 날짜만 — 사용자 결정 2026-11-06). (RabbitMQ: user.reservation.create)
     */
    @Transactional()
    async createReservation(user_id: string, dto: ReservationDto): Promise<ReservationResultDto> {
        // 1. 날짜 · 지금 바로(시간 이용 · 오늘만)
        if (!isValidDate(dto.date)) {
            throw new BadRequestException({message: RESERVATION_DATE_INVALID_MESSAGE, validation_errors: createValidationError('date', RESERVATION_DATE_INVALID_MESSAGE)});
        }
        const now = nowKst();
        const is_now = dto.is_now === 1;
        if (is_now && dto.room_plan_type_id !== RESERVATION_PLAN_TYPE.HOURLY) {
            throw new BadRequestException({message: '지금 바로 이용은 시간 이용만 예약할 수 있습니다.', validation_errors: createValidationError('is_now', '지금 바로 이용은 시간 이용만 예약할 수 있습니다.')});
        }
        if (is_now && dto.date !== now.format(RESERVATION_DATE_FORMAT)) {
            throw new BadRequestException({message: '지금 바로 이용은 오늘 날짜로만 예약할 수 있습니다.', validation_errors: createValidationError('date', '지금 바로 이용은 오늘 날짜로만 예약할 수 있습니다.')});
        }
        const nights = dto.room_plan_type_id === RESERVATION_PLAN_TYPE.LONG ? (dto.nights as number) : null;
        const start_time = dto.room_plan_type_id === RESERVATION_PLAN_TYPE.HOURLY && !is_now ? (dto.start_time as string) : null;

        // 2 · 3 그대로

        // 4. 같은 호실 재예약 제한 — 결제 대기 만료 시각부터 10분 (지금은 1단계에서 읽었다 — `const now = nowKst();` 삭제)
        const recent = await this.reservationRepository.countRecentExpired(user_id, room.room_id, now.subtract(RESERVATION_REBOOK_BLOCK_MINUTES, 'minute').toDate());
        ...

        // 5. 이용 구간 · 재고 판정 — 지금 바로는 지금(분)부터
        const stay = is_now ? toNowStay(plan, now) : toStay(plan, toKstDay(dto.date), start_time, nights);
        ... (그대로)
    }

    // confirmPayment — 5단계(확정) 뒤에 추가, JSDoc 에 "이용이 이미 시작된 예약은 QR 을 바로 발급 · Redis 현재 QR(마지막 단계)" 한 줄
        if (!(await this.reservationRepository.updateReservation({reservation_id: reservation.reservation_id, reservation_state_id: RESERVATION_STATE.PENDING}, confirmed))) {
            throw new BadRequestException({message: RESERVATION_STATE_CHANGED_MESSAGE});
        }

        // 6. 이용이 이미 시작된 예약(지금 바로 · 시작 뒤 결제)은 QR 을 바로 발급하고 Redis 현재 QR 로 쓴다 — 외부 단계라 마지막(사용자 요청 2026-11-06)
        if (isReservationStarted(reservation, now)) {
            await this.reservationRepository.insertRoomQr(buildRoomQr(reservation));
            const roomQr = await this.reservationRepository.findRoomQr({reservation_id: reservation.reservation_id});
            if (!roomQr) {
                throw new InternalServerErrorException({message: RESERVATION_QR_ISSUE_FAILED_MESSAGE});
            }
            await this.doorStore.setQr(roomQr.room_id, roomQr.qr, roomQr.ends_at);
        }
        return {reservation_id: reservation.reservation_id, reservation_state_id: RESERVATION_STATE.CONFIRMED};

    // getMyReservationQr — 3단계를 util 로(인라인 조립 · 메시지 삭제)
        // 3. 없으면 발급 — 유효 = 이용 시작 ~ 이용 끝, QR 은 32자 무작위. 같은 예약에 이미 들어갔으면 DB 가 무시하고, 다시 읽은 행을 쓴다
        if (verdict === 'ISSUE') {
            await this.reservationRepository.insertRoomQr(buildRoomQr(reservation));
            roomQr = await this.reservationRepository.findRoomQr({reservation_id: reservation.reservation_id});
        }
        if (!roomQr) {
            throw new InternalServerErrorException({message: RESERVATION_QR_ISSUE_FAILED_MESSAGE});
        }
```

### Entry Point (Controller/Handler)

```ts
// apps/user-service/src/discovery/controllers/discovery.controller.ts — new
import {Controller, Get, HttpCode, Param, Query} from '@nestjs/common';
import {DiscoveryRoomGroupListParamDto, DiscoveryRoomGroupListResultDto} from '@app/contracts/discovery/dto/discovery-room-group-list.dto.js';
import {DiscoveryStoreDetailParamDto, DiscoveryStoreDetailResultDto} from '@app/contracts/discovery/dto/discovery-store-detail.dto.js';
import {DiscoveryStoreListDto, DiscoveryStoreListResultDto} from '@app/contracts/discovery/dto/discovery-store-list.dto.js';
import {DiscoveryService} from '../discovery.service.js';

/**
 * 업체 둘러보기 내부 HTTP 인바운드 어댑터 — 게이트웨이의 동기 경로(조회)만 받는다(외부 비공개, Swagger 없음, actor 없음). 내부 토큰 검사는 전역 InternalAuthGuard 가 한다.
 */
@Controller('/internal/v1/user-service/discovery')
export class DiscoveryController {
    /**
     * @param discoveryService discovery service
     */
    constructor(private readonly discoveryService: DiscoveryService) {}

    /**
     * 반경 업체 조회 (인증 없음)
     */
    @Get('/store')
    @HttpCode(200)
    async getStores(@Query() query: DiscoveryStoreListDto): Promise<DiscoveryStoreListResultDto> {
        const dto = new DiscoveryStoreListDto(query);
        return this.discoveryService.getStores(dto);
    }

    /**
     * 업체 상세 (인증 없음)
     */
    @Get('/store/:store_id')
    @HttpCode(200)
    async getStore(@Param() param: DiscoveryStoreDetailParamDto): Promise<DiscoveryStoreDetailResultDto> {
        return this.discoveryService.getStore(param.store_id);
    }

    /**
     * 업체의 객실 그룹 목록 (인증 없음)
     */
    @Get('/store/:store_id/room-group')
    @HttpCode(200)
    async getRoomGroups(@Param() param: DiscoveryRoomGroupListParamDto): Promise<DiscoveryRoomGroupListResultDto> {
        return this.discoveryService.getRoomGroups(param.store_id);
    }
}
```

```ts
// apps/gateway/src/api/v1/user-service/discovery/controllers/discovery.controller.ts — new
import {Controller, Get, HttpCode, Param, Query} from '@nestjs/common';
import {ApiBadRequestResponse, ApiInternalServerErrorResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiServiceUnavailableResponse, ApiTags} from '@nestjs/swagger';
import {ApiFailResultDto} from '@app/common/dto/global.result.dto.js';
import {DISCOVERY_INTERNAL_PATH} from '@app/contracts/discovery/discovery.commands.js';
import {DiscoveryRoomGroupListParamDto, DiscoveryRoomGroupListResultDto} from '@app/contracts/discovery/dto/discovery-room-group-list.dto.js';
import {DiscoveryStoreDetailParamDto, DiscoveryStoreDetailResultDto} from '@app/contracts/discovery/dto/discovery-store-detail.dto.js';
import {DiscoveryStoreListDto, DiscoveryStoreListResultDto} from '@app/contracts/discovery/dto/discovery-store-list.dto.js';
import {InternalHttpClient} from '../../../../../modules/transport/internal-http.client.js';

/**
 * 업체 둘러보기 공개 API — 동기 경로(내부 HTTP → user-service), 로그인 없음(이용자 진입 동선). 쓰기(큐)는 없다.
 * 시간대별 예약 가능한 호수는 예약 가능 시간 API(`/api/v1/user-service/reservation/availability` — room_group_id 필터)로 본다.
 */
@ApiTags('업체 둘러보기')
@Controller('/api/v1/user-service/discovery')
export class DiscoveryController {
    /**
     * @param internalHttp 내부 HTTP 클라이언트
     */
    constructor(private readonly internalHttp: InternalHttpClient) {}

    /**
     * 반경 업체 조회 (로그인 없음) — 지도 중심(처음엔 내 위치) + 반경 5 · 10 · 20 · 50km, 가까운 순 최대 300개. 지도 마커 · 목록 카드 공용
     */
    @Get('/store')
    @HttpCode(200)
    @ApiOperation({summary: '반경 업체 조회'})
    @ApiOkResponse({type: DiscoveryStoreListResultDto})
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async getStores(@Query() query: DiscoveryStoreListDto): Promise<DiscoveryStoreListResultDto> {
        const dto = new DiscoveryStoreListDto(query);
        return this.internalHttp.request<DiscoveryStoreListResultDto>('user', 'GET', DISCOVERY_INTERNAL_PATH.STORE_LIST, {query: dto});
    }

    /**
     * 업체 상세 (로그인 없음) — 소개 · 사진 · 연락처 · 영업시간 · 브레이크타임 · 판매 중인 상품 설정 · 환불 규정
     */
    @Get('/store/:store_id')
    @HttpCode(200)
    @ApiOperation({summary: '업체 상세'})
    @ApiOkResponse({type: DiscoveryStoreDetailResultDto})
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async getStore(@Param() param: DiscoveryStoreDetailParamDto): Promise<DiscoveryStoreDetailResultDto> {
        return this.internalHttp.request<DiscoveryStoreDetailResultDto>('user', 'GET', DISCOVERY_INTERNAL_PATH.storeDetail(param.store_id));
    }

    /**
     * 업체의 객실 그룹 목록 (로그인 없음) — 그룹명 순, 사진 · 상세정보 · 호실 수 · 판매 중인 상품(기본 요금 · 남은 기간 가격)
     */
    @Get('/store/:store_id/room-group')
    @HttpCode(200)
    @ApiOperation({summary: '업체의 객실 그룹 목록'})
    @ApiOkResponse({type: DiscoveryRoomGroupListResultDto})
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async getRoomGroups(@Param() param: DiscoveryRoomGroupListParamDto): Promise<DiscoveryRoomGroupListResultDto> {
        return this.internalHttp.request<DiscoveryRoomGroupListResultDto>('user', 'GET', DISCOVERY_INTERNAL_PATH.roomGroupList(param.store_id));
    }
}
```

```ts
// apps/gateway/src/api/v1/user-service/discovery/discovery.module.ts — new
import {Module} from '@nestjs/common';
import {DiscoveryController} from './controllers/discovery.controller.js';

/**
 * 게이트웨이 업체 둘러보기 라우트 — `/api/v1/user-service/discovery`. 동기 경로만(DiscoveryController — 로그인 없음), 큐 경로는 없다. 전달 수단(TransportModule)은 전역이다.
 */
@Module({controllers: [DiscoveryController]})
export class DiscoveryModule {}
```

```ts
// apps/gateway/src/gateway.module.ts — modified
import {DiscoveryModule} from './api/v1/user-service/discovery/discovery.module.js';
 * - 업체 둘러보기 라우트: DiscoveryModule(/api/v1/user-service/discovery — 가드 없음, 반경 업체 · 업체 상세 · 객실 그룹 목록)
        ReservationModule,
        DiscoveryModule,
        DoorSocketModule,
```

```ts
// apps/gateway/src/api/v1/user-service/reservation/controllers/reservation.controller.ts — modified (예약 가능 시간)
    /**
     * 객실 그룹별 예약 가능 시간 (로그인 없음) — 업체 · 날짜 · 상품(연박은 박수), 그룹 필터(선택). 그룹 → 시간대 → 예약 가능한 호수, 시간 이용 · 오늘이면 '지금 바로' 시간대가 맨 앞
     */
    @Get('/availability')
    @HttpCode(200)
    @ApiOperation({summary: '객실 그룹별 예약 가능 시간'})

// apps/user-service/src/reservation/controllers/reservation.controller.ts — 같은 핸들러 주석: "객실 그룹별 예약 가능 시간 (인증 없음)"
```

### 문서 (같은 변경에서)

```md
README.md
- gateway 공개 경로 목록에 업체 둘러보기 `/api/v1/user-service/discovery` 추가
- user-service 줄: 업체 둘러보기(반경 업체 5 · 10 · 20 · 50km — 지도 · 목록 공용, 업체 상세, 객실 그룹 목록 — 로그인 없음),
  예약 가능 시간은 객실 그룹 → 시간대 → 예약 가능한 호수(room_group_id 필터), 시간 이용 '지금 바로'(is_now), 결제 확인 때 이용이 시작된 예약은 QR 바로 발급
- 외부 연동: 업체 · 객실 사진 공개 주소는 user-service 도 쓴다(AWS_S3_PUBLIC_URL)

AGENTS.md
- 트리: user-service/src/discovery/ (업체 둘러보기 — 반경 업체 · 업체 상세 · 객실 그룹 목록, 로그인 없음 · 조회만) → DiscoveryService → 공유 DB · STORAGE_GATEWAY(공개 주소)
- 트리: gateway 공개 라우트 user-service/{user,reservation,discovery}, reservation 줄에 "지금 바로 · 결제 확인 QR"
- Auth "인증 없는 공개 라우트" 에 discovery 3개
- Validation `@Query()` DTO 적용 목록에 DiscoveryStoreListDto
- 외부 연동 사진 줄: 공개 주소(getPublicUrl)는 admin-service · user-service(둘러보기)
- Testing Smoke 목록에 user-service discovery.repository.spec.ts(반경 업체 · 그룹별 호실 수 · 상품 설정 + find 조건)

docs/architecture.md — user-service 도메인 표(discovery) · 루트 모듈(StorageModule · DiscoveryModule) · gateway 라우트 모듈(DiscoveryModule)
docs/integration.md — STORAGE_GATEWAY 사용처에 user-service 둘러보기(공개 주소만)
docs/testing.md — Data-Access Smoke 현재 적용 목록에 discovery
```

---

## Test Cases

```
[CASES:radius-box]  discovery-store-list.spec.ts — 동기 경로로 부르고 findStoreRows 에 넘긴 사각형(소수 6자리)을 본다(사용자 확정 2026-11-06)
  1. 서울(37.5665, 126.978) 5km   → 37.521534 ~ 37.611466 / 126.921271 ~ 127.034729
  2. 서울 50km                     → 37.116839 ~ 38.016161 / 126.410706 ~ 127.545294
  3. 제주(33.4996, 126.5312) 20km → 33.319736 ~ 33.679464 / 126.315507 ~ 126.746893
  4. 적도(0, 0) 10km               → -0.089932 ~ 0.089932 / -0.089932 ~ 0.089932 (위 · 경도 폭이 같다)
  5. 서울 50km — 원을 모두 덮음: 꼭짓점 4개까지 대원 거리 ≥ 50km, 원 위의 점(방위 10° 마다 36개)이 모두 사각형 안

[CASES:now-stay]  reservation-availability.spec.ts — 시간 이용 240분(4시간), 지금 2026-11-05 23:36:27(한국), 24시간 업체 · 정비 30분 · 호실 예약가능 기본(사용자 확정 2026-11-06)
  1. 비어 있음                                  → 지금 바로 23:36 ~ 다음 날 03:36(초는 버림), 맨 앞 · is_now 1 · 호수 [101호]
  2. 다음 날 02:00 ~ 06:00 시간 이용 확정 겹침   → 지금 바로 없음
  3. 다음 날 03:36 시작 예약 · 정비 0            → 가능(맞닿음)
  4. 정비 30분 · 앞 예약 점유 끝 23:40           → 없음
  5. 같은 호실 1박(오늘 22:00 ~ 내일 11:00)       → 없음
  6. 결제 대기 예약(점유) 겹침                   → 없음
  7. 호실 정비중(예약가능 아님)                  → 없음
  8. 영업시간 18:00 ~ 02:00(24시간 아님)         → 끝 03:36 이 밖 → 없음
  9. 브레이크 01:00 ~ 02:00                     → 없음
 10. 일시 예약불가 내일 00:00 ~ 09:00            → 없음
 11. 영업중 아님(is_open 0)                     → 없음
 12. 연도 경계 — 지금 2026-12-31 23:50:10        → 23:50 ~ 2027-01-01 03:50

[CASES:availability]  reservation-availability.spec.ts — 기존 14개를 새 모양(그룹 1개의 시간대 시작 시각 · 그룹 금액)으로 그대로 확인

[SUCCESS]
  discovery-store-list
    - 응답 매핑: 대표 사진 키 → getPublicUrl 주소, 키 없음 → image_url null(getPublicUrl 1번만), 숫자 필드, is_truncated 0
    - findStoreRows(필터: 중심 · radius_m = km × 1000 · 사각형, 301) — 잘림 판단용 1개 더
    - 301행이면 300개 + is_truncated 1
  discovery-store-detail
    - 응답 전체 toEqual — 사업자 정보 · 업체코드 · 정지 사유 · 문 시크릿 · 정비시간 없음, 시각 HH:mm
    - 상품 설정은 사용 중만 · 시간 이용 → 1박 → 연박 순(받은 순 LONG · HOURLY · NIGHT(미사용) → HOURLY · LONG)
    - 조회 조건 findDiscoveryStore({store_id, store_state_id: 'ACTIVE'}) · findStoreImages({store_id, store_file_purpose_id: 'STORE_IMAGE'}) · 영업시간 · 브레이크 · 상품 설정(STORE_ID)
  discovery-room-group-list (지금 2026-11-05T15:30Z = 한국 11-06 00:30)
    - 그룹명 순 그대로, 호실 수 0 그룹 제외, 판매 중인 상품만(그룹 상품 미사용 · 요금 0 · 업체가 안 파는 종류 제외), 상품 순서, 기간 가격은 그 상품에, 사진은 그 그룹에
    - 조회 조건: countBookableRooms([그룹 ID 들]) · findRoomGroupPlans({room_group_id: In}) · findRoomGroupPlanPrices({room_group_plan_id: In(판매 중), end_date: MoreThanOrEqual('2026-11-06')}) · findRoomGroupImages({room_group_id: In})
  reservation-availability
    - 응답 모양: list[0] = {room_group_id, room_group_name, price, slots}, 시간대 = {start_at, end_at, is_now: 0, rooms: [{room_id, room_name, floor}]}
    - 그룹 2개 · 같은 그룹 호실 2개: 그룹명 순(디럭스 → 스탠다드), 101호 점유 시간대에는 102호만, 뒤 시간대는 101호 · 102호
    - room_group_id 필터: 그 그룹만, findGroupPlans · findReservations 조건도 그 그룹 호실만
    - 영업중 아님 — 그룹은 나오고 slots []
  reservation-create
    - 지금 바로: 지금 10:21:45 → 예약 start_at 10:21 · end_at 13:21 · 점유 끝 13:51 · 환불 마감 09:21, 시작 시각 없이
  reservation-payment-confirm
    - 이용이 시작된 예약: 확정 뒤 insertRoomQr(RoomQrEntity — room_id · reservation_id · starts_at · ends_at, ID · QR 32자) → findRoomQr({reservation_id}) → setQr(room_id, qr, ends_at), 순서 updateReservation < insertRoomQr < setQr
    - 시작 전 예약: insertRoomQr · setQr 없음

[SKIP]
  discovery-room-group-list — 업체가 파는 상품 없음 → 빈 목록 · 그룹 조회 없음 / 그룹 없음 → 호실 수 조회 없음 / 판매 중인 그룹 상품 없음 → 기간 가격 조회 없음
  discovery-store-list — 반경 안에 없음 → {list: [], is_truncated: 0}
  reservation-availability — 업체가 상품을 팔지 않음(기존) · 그룹 상품 요금 0(기존 — 빈 목록)

[FAIL:validation]
  discovery-store-list — 위도 91 → latitude, 반경 7 → radius_km, 경도 없음 → longitude
  discovery-store-detail · discovery-room-group-list — store_id 'xyz'(동기 경로) → 400 validation_errors.store_id, 업체 조회 없음
  reservation-availability — room_group_id 'xyz' → room_group_id (+ 기존 2)
  reservation-create — is_now 2 → is_now, 시간 이용 + is_now 1 + 시작 시각 없음 → 통과(null) (+ 기존 2)

[FAIL:service]
  discovery-store-detail · discovery-room-group-list — 업체 없음(지움 · 영업중지 · 탈퇴) 404 '업체를 찾을 수 없습니다.', 다음 조회 없음
  reservation-create — 지금 바로 + 1박 → 400 validation_errors.is_now, 호실 조회 없음 / 지금 바로 + 내일 날짜 → 400 validation_errors.date, 호실 조회 없음 / 지금 바로 + 점유 겹침 → 400 '예약할 수 없는 시간입니다.', 결제 쓰기 없음
  reservation-payment-confirm — 발급 뒤 다시 읽어도 없음 → 재시도(500 → requeue), setQr 없음

[FAIL:external]
  reservation-payment-confirm — setQr 503 → requeue(확정은 롤백 — 다시 확인)

[FAIL:repository]
  discovery.repository.spec — 메서드마다 DB 실패 → 통일 500 (find · findOne · QueryBuilder 빌더 spy)
  + 조건: notDeleted 를 붙이는 메서드(업체 · 업체 사진 · 영업시간 · 브레이크 · 그룹 · 그룹 사진 · 기간 가격)와 붙이지 않는 메서드(그룹 상품), 정렬 · loadRelationIds

[SMOKE:data-access]  discovery.repository.spec — DB 연결 없이 SQL 빌드
  - buildStoreRowsQuery: 전체 SQL 고정(자리표시자 → 실행 출력), 파라미터(중심 · 사각형 · 반경 · ACTIVE · STORE_IMAGE · HOURLY · NIGHT · DISABLED), select 별칭 = DiscoveryStoreRow 키,
    대원 거리 식이 select · where 두 곳, 사각형 BETWEEN, 업체 · 사진 · 그룹 · 호실 is_deleted = 0, LIMIT 301
  - buildBookableRoomCountsQuery: IN 펼침 · is_deleted = 0 · 사용중지 제외 · GROUP BY, 별칭 = DiscoveryRoomCountRow 키
  - buildStorePlanRowsQuery: 종류명 조인 · 별칭 = DiscoveryStorePlanRow 키
  - find 조건(spyOn manager.find · findOne → setFindOptions): 업체(store_state_id · is_deleted) · 업체 사진(store_id · 용도 · is_deleted · 정렬) · 영업시간 · 브레이크 · 그룹(정렬) · 그룹 사진(In) · 그룹 상품(In) · 기간 가격(In · MoreThanOrEqual · is_deleted)

테스트 생략(위임형): 게이트웨이 discovery controller · 서비스 discovery controller(service spec 이 동기 경로로 지난다), DiscoveryModule · user-service 루트 모듈 등록(StorageModule), contracts 경로 상수, 게이트웨이 예약 가능 시간 summary 문구
```

### 테스트 코드 (build 가 먼저 쓴다)

```ts
// apps/user-service/src/discovery/test/discovery.test-helper.ts — new
import {BadRequestException, INestApplication, Type, ValidationPipe} from '@nestjs/common';
import {APP_GUARD, APP_INTERCEPTOR} from '@nestjs/core';
import {Test} from '@nestjs/testing';
import type {Mock} from 'vitest';
import {CustomErrorFilter} from '@app/common/exception/custom-error.filter.js';
import {ReturnedExceptionInterceptor} from '@app/common/exception/returned-exception.interceptor.js';
import {InternalAuthGuard} from '@app/common/internal/internal-auth.guard.js';
import {validationExceptionFactory} from '@app/common/utils/validation.js';
import {INTERNAL_HEADER} from '@app/contracts/actor.js';
import {STORAGE_GATEWAY} from '@app/integration/integration.symbols.js';
import {DiscoveryController} from '../controllers/discovery.controller.js';
import {DiscoveryService} from '../discovery.service.js';
import {DISCOVERY_REPOSITORY} from '../discovery.symbols.js';
import type {DiscoveryRepositoryInterface} from '../interfaces/discovery.repository.interface.js';

/** 테스트용 내부 요청 토큰 */
export const TEST_INTERNAL_TOKEN = 'test-internal-token';

export const STORE_ID = 'b'.repeat(32);
export const STORE_ID_2 = '6'.repeat(32);
export const ROOM_GROUP_ID = 'c'.repeat(32);
export const ROOM_GROUP_ID_2 = '7'.repeat(32);
export const ROOM_GROUP_ID_3 = '8'.repeat(32);

/** repository mock 모양 — 포트 메서드마다 vi.fn() */
export type DiscoveryRepositoryMock = {[K in keyof DiscoveryRepositoryInterface]: Mock};

/** 파일 저장소 포트 mock 모양 — 공개 주소만 쓴다 */
export type StorageGatewayMock = {getPublicUrl: Mock};

/**
 * discovery repository mock — 목록은 빈 배열, 업체는 활성 업체
 *
 * @returns mock
 */
export function createDiscoveryRepositoryMock(): DiscoveryRepositoryMock {
    return {
        findStoreRows: vi.fn().mockResolvedValue([]),
        findDiscoveryStore: vi.fn().mockResolvedValue(storeEntity()),
        findStoreImages: vi.fn().mockResolvedValue([]),
        findStoreHours: vi.fn().mockResolvedValue([]),
        findStoreBreaks: vi.fn().mockResolvedValue([]),
        findStorePlanRows: vi.fn().mockResolvedValue([]),
        findRoomGroups: vi.fn().mockResolvedValue([]),
        countBookableRooms: vi.fn().mockResolvedValue([]),
        findRoomGroupImages: vi.fn().mockResolvedValue([]),
        findRoomGroupPlans: vi.fn().mockResolvedValue([]),
        findRoomGroupPlanPrices: vi.fn().mockResolvedValue([]),
    };
}

/**
 * 파일 저장소 포트 mock — 공개 주소는 키로 만든 고정 값
 *
 * @returns mock
 */
export function createStorageGatewayMock(): StorageGatewayMock {
    return {getPublicUrl: vi.fn((key: string) => `https://cdn.test/${key}`)};
}

/**
 * 동기 경로 부팅 — 실제 DiscoveryController + DiscoveryService + ValidationPipe + 필터 + 전역 InternalAuthGuard · ReturnedExceptionInterceptor(user-service.module 과 같다), repository · 저장소 포트만 mock.
 *
 * @param repo repository mock
 * @param storage 파일 저장소 포트 mock
 * @returns Nest 앱
 */
export async function bootHttpPath(repo: DiscoveryRepositoryMock, storage: StorageGatewayMock = createStorageGatewayMock()): Promise<INestApplication> {
    process.env.INTERNAL_API_TOKEN = TEST_INTERNAL_TOKEN;
    const module = await Test.createTestingModule({
        controllers: [DiscoveryController],
        providers: [
            DiscoveryService,
            {provide: DISCOVERY_REPOSITORY, useValue: repo},
            {provide: STORAGE_GATEWAY, useValue: storage},
            {provide: APP_GUARD, useClass: InternalAuthGuard},
            {provide: APP_INTERCEPTOR, useClass: ReturnedExceptionInterceptor},
        ],
    }).compile();
    const app = module.createNestApplication();
    app.useGlobalFilters(new CustomErrorFilter());
    app.useGlobalPipes(new ValidationPipe({transform: true, forbidNonWhitelisted: true, exceptionFactory: validationExceptionFactory}));
    await app.init();
    return app;
}

/**
 * 게이트웨이가 붙이는 내부 요청 헤더(actor 없음 — 로그인 없는 공개 라우트)
 *
 * @returns 헤더
 */
export function internalHeaders(): Record<string, string> {
    return {[INTERNAL_HEADER.TOKEN]: TEST_INTERNAL_TOKEN, [INTERNAL_HEADER.CLIENT_IP]: '10.0.0.1'};
}

/**
 * 게이트웨이 ValidationPipe 로 쿼리 · path param 을 검증한다.
 *
 * @param metatype DTO 클래스
 * @param body 입력
 * @returns 실패 본문 또는 null
 */
export async function validateBody(metatype: Type<unknown>, body: unknown): Promise<Record<string, unknown> | null> {
    const pipe = new ValidationPipe({transform: true, forbidNonWhitelisted: true, exceptionFactory: validationExceptionFactory});
    try {
        await pipe.transform(body, {type: 'query', metatype});
        return null;
    } catch (error) {
        return (error as BadRequestException).getResponse() as Record<string, unknown>;
    }
}

/**
 * 업체 — 활성 · 영업중, 공개하지 않는 필드(사업자 정보 · 업체코드 · 정지 사유 · 문 시크릿 · 정비시간)까지 채운다
 *
 * @param override 바꿀 필드
 * @returns 업체 엔티티 모양
 */
export function storeEntity(override: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        store_id: STORE_ID,
        store_code: 'a'.repeat(32),
        store_state_id: 'ACTIVE',
        store_name: '루미 강남점',
        business_number: '1234567890',
        owner_name: '김대표',
        phone: '0212345678',
        address: '서울 강남구 테헤란로 1',
        address_detail: '3층',
        latitude: 37.4979,
        longitude: 127.0276,
        introduction: '역에서 1분',
        is_always_open: 0,
        is_open: 1,
        maintenance_minutes: 30,
        booking_open_hours: 72,
        refund_deadline_minutes: 60,
        late_refund_percent: 50,
        door_secret: '$2b$12$hashed',
        suspend_comment: null,
        is_deleted: 0,
        ...override,
    };
}

/**
 * 반경 업체 행
 *
 * @param override 바꿀 필드
 * @returns 행
 */
export function storeRow(override: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        store_id: STORE_ID,
        store_name: '루미 강남점',
        address: '서울 강남구 테헤란로 1',
        latitude: 37.4979,
        longitude: 127.0276,
        distance_m: 1234,
        cover_file_key: `store/${STORE_ID}/cover.jpg`,
        is_open: 1,
        is_always_open: 0,
        min_hourly_price: 30000,
        min_night_price: 70000,
        ...override,
    };
}

/**
 * 업체 상품 설정 행 — 종류별 기본(시간 이용 3시간 · 1박 22:00 → 09:00 · 연박 15:00 → 11:00 · 2 ~ 7박), 사용 · 매일
 *
 * @param room_plan_type_id 상품 종류
 * @param override 바꿀 필드
 * @returns 행
 */
export function storePlanRow(room_plan_type_id: string, override: Record<string, unknown> = {}): Record<string, unknown> {
    const byType: Record<string, Record<string, unknown>> = {
        HOURLY: {room_plan_type_name: '시간 이용', usage_hours: 3, check_in_time: null, check_out_time: null, min_nights: null, max_nights: null},
        NIGHT: {room_plan_type_name: '1박', usage_hours: null, check_in_time: '22:00:00', check_out_time: '09:00:00', min_nights: null, max_nights: null},
        LONG: {room_plan_type_name: '연박', usage_hours: null, check_in_time: '15:00:00', check_out_time: '11:00:00', min_nights: 2, max_nights: 7},
    };
    return {room_plan_type_id, is_used: 1, days_of_week: 127, ...byType[room_plan_type_id], ...override};
}

/**
 * 객실 그룹 — 상세정보(편의시설) 포함
 *
 * @param room_group_id 그룹 ID
 * @param room_group_name 그룹명
 * @returns 그룹 엔티티 모양
 */
export function roomGroupEntity(room_group_id: string, room_group_name: string): Record<string, unknown> {
    return {
        room_group_id,
        store_id: STORE_ID,
        room_group_name,
        description: `${room_group_name} 설명`,
        room_group_detail: {room_count: 1, has_shower: 1, has_tv: 1, has_pc: 0},
        is_deleted: 0,
    };
}

/**
 * 그룹 상품
 *
 * @param room_group_plan_id 그룹 상품 ID
 * @param room_group_id 그룹 ID
 * @param room_plan_type_id 상품 종류
 * @param is_used 사용 여부
 * @param price 기본 요금
 * @returns 그룹 상품 엔티티 모양
 */
export function groupPlanEntity(room_group_plan_id: string, room_group_id: string, room_plan_type_id: string, is_used: number, price: number): {room_group_plan_id: string} & Record<string, unknown> {
    return {room_group_plan_id, room_group_id, room_plan_type_id, is_used, price};
}
```

```ts
// apps/user-service/src/discovery/test/discovery-store-list.spec.ts — new
import {INestApplication} from '@nestjs/common';
import request from 'supertest';
import {DiscoveryStoreListDto} from '@app/contracts/discovery/dto/discovery-store-list.dto.js';
import {
    bootHttpPath,
    createDiscoveryRepositoryMock,
    createStorageGatewayMock,
    DiscoveryRepositoryMock,
    internalHeaders,
    STORE_ID,
    STORE_ID_2,
    StorageGatewayMock,
    storeRow,
    validateBody,
} from './discovery.test-helper.js';

const PATH = '/internal/v1/user-service/discovery/store';

/** 서울시청 */
const SEOUL = {latitude: '37.5665', longitude: '126.978'};

/** 지구 반지름(km) — 테스트 대조용(구현과 같은 값) */
const R = 6371;

/**
 * 대원 거리(km) — 테스트 대조용
 *
 * @param lat1 위도 1
 * @param lng1 경도 1
 * @param lat2 위도 2
 * @param lng2 경도 2
 * @returns 거리(km)
 */
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const rad = (degrees: number) => (degrees * Math.PI) / 180;
    const x = Math.sin(rad(lat2 - lat1) / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lng2 - lng1) / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(x)));
}

/**
 * 중심에서 방위로 거리만큼 간 점 — 테스트 대조용
 *
 * @param lat 위도
 * @param lng 경도
 * @param distance_km 거리(km)
 * @param bearing_deg 방위(도, 북쪽 0)
 * @returns [위도, 경도]
 */
function destination(lat: number, lng: number, distance_km: number, bearing_deg: number): [number, number] {
    const rad = (degrees: number) => (degrees * Math.PI) / 180;
    const deg = (radians: number) => (radians * 180) / Math.PI;
    const angle = distance_km / R;
    const lat2 = Math.asin(Math.sin(rad(lat)) * Math.cos(angle) + Math.cos(rad(lat)) * Math.sin(angle) * Math.cos(rad(bearing_deg)));
    const lng2 = rad(lng) + Math.atan2(Math.sin(rad(bearing_deg)) * Math.sin(angle) * Math.cos(rad(lat)), Math.cos(angle) - Math.sin(rad(lat)) * Math.sin(lat2));
    return [deg(lat2), deg(lng2)];
}

/** 위경도 사각형 */
type Box = {min_latitude: number; max_latitude: number; min_longitude: number; max_longitude: number};

/**
 * [CASES:radius-box] — 중심 + 반경 → 인덱스로 먼저 거를 위경도 사각형(사용자 확정 2026-11-06). 기대값은 소수 6자리.
 * [이름, query, 사각형]
 */
const RADIUS_BOX_CASES: [string, Record<string, string>, Box][] = [
    ['1. 서울 5km', {...SEOUL, radius_km: '5'}, {min_latitude: 37.521534, max_latitude: 37.611466, min_longitude: 126.921271, max_longitude: 127.034729}],
    ['2. 서울 50km', {...SEOUL, radius_km: '50'}, {min_latitude: 37.116839, max_latitude: 38.016161, min_longitude: 126.410706, max_longitude: 127.545294}],
    ['3. 제주 20km', {latitude: '33.4996', longitude: '126.5312', radius_km: '20'}, {min_latitude: 33.319736, max_latitude: 33.679464, min_longitude: 126.315507, max_longitude: 126.746893}],
    ['4. 적도 10km — 위 · 경도 폭이 같다', {latitude: '0', longitude: '0', radius_km: '10'}, {min_latitude: -0.089932, max_latitude: 0.089932, min_longitude: -0.089932, max_longitude: 0.089932}],
];

describe('GET /internal/v1/user-service/discovery/store — 반경 업체 조회 (동기 경로, 로그인 없음)', () => {
    let app: INestApplication;
    let repo: DiscoveryRepositoryMock;
    let storage: StorageGatewayMock;

    beforeEach(async () => {
        repo = createDiscoveryRepositoryMock();
        storage = createStorageGatewayMock();
        app = await bootHttpPath(repo, storage);
    });

    afterEach(async () => {
        vi.clearAllMocks();
        await app.close();
    });

    /**
     * 조회 1번 → findStoreRows 에 넘긴 조건
     *
     * @param query 쿼리
     * @returns 필터 · 개수
     */
    async function requestFilter(query: Record<string, string>): Promise<[Record<string, number>, number]> {
        const res = await request(app.getHttpServer()).get(PATH).query(query).set(internalHeaders());
        expect(res.status).toBe(200);
        return repo.findStoreRows.mock.calls[0] as [Record<string, number>, number];
    }

    describe('[CASES:radius-box] 중심 + 반경 → 위경도 사각형', () => {
        it.each(RADIUS_BOX_CASES)('%s', async (_label, query, box) => {
            const [filter] = await requestFilter(query);

            expect(filter.latitude).toBe(Number(query.latitude));
            expect(filter.longitude).toBe(Number(query.longitude));
            expect(filter.radius_m).toBe(Number(query.radius_km) * 1000);
            for (const key of Object.keys(box) as (keyof Box)[]) {
                expect(filter[key]).toBeCloseTo(box[key], 6);
            }
        });

        it('5. 서울 50km — 원을 모두 덮는다: 꼭짓점까지 거리 ≥ 반경, 원 위의 점(10° 마다)이 모두 사각형 안', async () => {
            const [filter] = await requestFilter({...SEOUL, radius_km: '50'});

            const corners: [number, number][] = [
                [filter.min_latitude, filter.min_longitude],
                [filter.min_latitude, filter.max_longitude],
                [filter.max_latitude, filter.min_longitude],
                [filter.max_latitude, filter.max_longitude],
            ];
            for (const [lat, lng] of corners) {
                expect(haversineKm(37.5665, 126.978, lat, lng)).toBeGreaterThanOrEqual(50);
            }
            for (let bearing = 0; bearing < 360; bearing += 10) {
                const [lat, lng] = destination(37.5665, 126.978, 50, bearing);
                expect(lat).toBeGreaterThanOrEqual(filter.min_latitude - 1e-9);
                expect(lat).toBeLessThanOrEqual(filter.max_latitude + 1e-9);
                expect(lng).toBeGreaterThanOrEqual(filter.min_longitude - 1e-9);
                expect(lng).toBeLessThanOrEqual(filter.max_longitude + 1e-9);
            }
        });
    });

    describe('[SUCCESS]', () => {
        it('대표 사진 키는 CDN 공개 주소로, 없으면 null — 잘림 판단용으로 301개를 묻는다', async () => {
            repo.findStoreRows.mockResolvedValueOnce([storeRow(), storeRow({store_id: STORE_ID_2, store_name: '루미 역삼점', distance_m: 2500, cover_file_key: null, min_hourly_price: null})]);

            const res = await request(app.getHttpServer()).get(PATH).query({...SEOUL, radius_km: '5'}).set(internalHeaders());

            expect(res.status).toBe(200);
            expect(res.body).toEqual({
                list: [
                    {
                        store_id: STORE_ID,
                        store_name: '루미 강남점',
                        address: '서울 강남구 테헤란로 1',
                        latitude: 37.4979,
                        longitude: 127.0276,
                        distance_m: 1234,
                        image_url: `https://cdn.test/store/${STORE_ID}/cover.jpg`,
                        is_open: 1,
                        is_always_open: 0,
                        min_hourly_price: 30000,
                        min_night_price: 70000,
                    },
                    {
                        store_id: STORE_ID_2,
                        store_name: '루미 역삼점',
                        address: '서울 강남구 테헤란로 1',
                        latitude: 37.4979,
                        longitude: 127.0276,
                        distance_m: 2500,
                        image_url: null,
                        is_open: 1,
                        is_always_open: 0,
                        min_hourly_price: null,
                        min_night_price: 70000,
                    },
                ],
                is_truncated: 0,
            });
            expect(storage.getPublicUrl).toHaveBeenCalledTimes(1);
            expect(storage.getPublicUrl).toHaveBeenCalledWith(`store/${STORE_ID}/cover.jpg`);
            expect(repo.findStoreRows).toHaveBeenCalledTimes(1);
            expect(repo.findStoreRows.mock.calls[0][1]).toBe(301);
        });

        it('301행이면 앞 300개만 · is_truncated 1', async () => {
            repo.findStoreRows.mockResolvedValueOnce(Array.from({length: 301}, (_, index) => storeRow({store_id: index.toString(16).padStart(32, '0'), cover_file_key: null})));

            const res = await request(app.getHttpServer()).get(PATH).query({...SEOUL, radius_km: '50'}).set(internalHeaders());

            expect(res.body.list).toHaveLength(300);
            expect(res.body.list[299].store_id).toBe((299).toString(16).padStart(32, '0'));
            expect(res.body.is_truncated).toBe(1);
        });
    });

    describe('[SKIP]', () => {
        it('반경 안에 업체가 없으면 빈 목록 · 잘림 0', async () => {
            const res = await request(app.getHttpServer()).get(PATH).query({...SEOUL, radius_km: '5'}).set(internalHeaders());

            expect(res.body).toEqual({list: [], is_truncated: 0});
            expect(storage.getPublicUrl).not.toHaveBeenCalled();
        });
    });

    describe('[FAIL:validation] 게이트웨이 ValidationPipe', () => {
        it.each([
            ['위도 91', {...SEOUL, latitude: '91', radius_km: '5'}, 'latitude', '위도가 올바르지 않습니다.'],
            ['반경 7km', {...SEOUL, radius_km: '7'}, 'radius_km', '반경은 5 · 10 · 20 · 50km 중에서 골라주세요.'],
            ['경도 없음', {latitude: '37.5665', radius_km: '5'}, 'longitude', '경도를 입력해주세요.'],
        ])('%s → %s', async (_label, query, property, message) => {
            await expect(validateBody(DiscoveryStoreListDto, query)).resolves.toEqual({message, validation_errors: [{property, message}]});
        });

        it('동기 경로에서도 같은 400 — 조회 없음', async () => {
            const res = await request(app.getHttpServer()).get(PATH).query({...SEOUL, radius_km: '7'}).set(internalHeaders());

            expect(res.status).toBe(400);
            expect(repo.findStoreRows).not.toHaveBeenCalled();
        });
    });

    describe('[FAIL:internal]', () => {
        it('게이트웨이 내부 토큰이 없으면 403, 조회 없음', async () => {
            const res = await request(app.getHttpServer()).get(PATH).query({...SEOUL, radius_km: '5'});

            expect(res.status).toBe(403);
            expect(repo.findStoreRows).not.toHaveBeenCalled();
        });
    });
});
```

```ts
// apps/user-service/src/discovery/test/discovery-store-detail.spec.ts — new
import {INestApplication} from '@nestjs/common';
import request from 'supertest';
import {bootHttpPath, createDiscoveryRepositoryMock, DiscoveryRepositoryMock, internalHeaders, STORE_ID, storeEntity, storePlanRow} from './discovery.test-helper.js';

const PATH = `/internal/v1/user-service/discovery/store/${STORE_ID}`;

describe('GET /internal/v1/user-service/discovery/store/:store_id — 업체 상세 (동기 경로, 로그인 없음)', () => {
    let app: INestApplication;
    let repo: DiscoveryRepositoryMock;

    beforeEach(async () => {
        repo = createDiscoveryRepositoryMock();
        repo.findStoreImages.mockResolvedValue([
            {store_file_id: '1'.repeat(32), file_key: `store/${STORE_ID}/a.jpg`, sort_order: 0},
            {store_file_id: '2'.repeat(32), file_key: `store/${STORE_ID}/b.png`, sort_order: 1},
        ]);
        repo.findStoreHours.mockResolvedValue([
            {day_of_week: 0, is_closed: 1, open_time: null, close_time: null},
            {day_of_week: 1, is_closed: 0, open_time: '18:00:00', close_time: '06:00:00'},
        ]);
        repo.findStoreBreaks.mockResolvedValue([{start_time: '13:00:00', end_time: '14:00:00'}]);
        repo.findStorePlanRows.mockResolvedValue([storePlanRow('LONG'), storePlanRow('HOURLY'), storePlanRow('NIGHT', {is_used: 0})]);
        app = await bootHttpPath(repo);
    });

    afterEach(async () => {
        vi.clearAllMocks();
        await app.close();
    });

    describe('[SUCCESS]', () => {
        it('공개 필드만 — 사업자 정보 · 업체코드 · 정지 사유 · 문 시크릿 · 정비시간 없음, 사진 CDN 주소, 시각 HH:mm, 사용 중인 상품만 시간 이용 → 연박 순', async () => {
            const res = await request(app.getHttpServer()).get(PATH).set(internalHeaders());

            expect(res.status).toBe(200);
            expect(res.body).toEqual({
                store_id: STORE_ID,
                store_name: '루미 강남점',
                phone: '0212345678',
                address: '서울 강남구 테헤란로 1',
                address_detail: '3층',
                latitude: 37.4979,
                longitude: 127.0276,
                introduction: '역에서 1분',
                is_open: 1,
                is_always_open: 0,
                booking_open_hours: 72,
                refund_deadline_minutes: 60,
                late_refund_percent: 50,
                images: [
                    {image_url: `https://cdn.test/store/${STORE_ID}/a.jpg`, sort_order: 0},
                    {image_url: `https://cdn.test/store/${STORE_ID}/b.png`, sort_order: 1},
                ],
                hours: [
                    {day_of_week: 0, is_closed: 1, open_time: null, close_time: null},
                    {day_of_week: 1, is_closed: 0, open_time: '18:00', close_time: '06:00'},
                ],
                breaks: [{start_time: '13:00', end_time: '14:00'}],
                plans: [
                    {room_plan_type_id: 'HOURLY', room_plan_type_name: '시간 이용', days_of_week: 127, usage_hours: 3, check_in_time: null, check_out_time: null, min_nights: null, max_nights: null},
                    {room_plan_type_id: 'LONG', room_plan_type_name: '연박', days_of_week: 127, usage_hours: null, check_in_time: '15:00', check_out_time: '11:00', min_nights: 2, max_nights: 7},
                ],
            });
            expect(repo.findDiscoveryStore).toHaveBeenCalledWith({store_id: STORE_ID, store_state_id: 'ACTIVE'});
            expect(repo.findStoreImages).toHaveBeenCalledWith({store_id: STORE_ID, store_file_purpose_id: 'STORE_IMAGE'});
            expect(repo.findStoreHours).toHaveBeenCalledWith(STORE_ID);
            expect(repo.findStoreBreaks).toHaveBeenCalledWith(STORE_ID);
            expect(repo.findStorePlanRows).toHaveBeenCalledWith(STORE_ID);
        });

        it('영업중 아님(is_open 0)도 상세는 보인다 — is_open 0', async () => {
            repo.findDiscoveryStore.mockResolvedValueOnce(storeEntity({is_open: 0}));

            const res = await request(app.getHttpServer()).get(PATH).set(internalHeaders());

            expect(res.status).toBe(200);
            expect(res.body.is_open).toBe(0);
        });
    });

    describe('[FAIL:service]', () => {
        it('업체가 없거나 활성이 아니면(지움 · 영업중지 · 탈퇴) 404, 사진 · 영업시간 조회 없음', async () => {
            repo.findDiscoveryStore.mockResolvedValueOnce(null);

            const res = await request(app.getHttpServer()).get(PATH).set(internalHeaders());

            expect(res.status).toBe(404);
            expect(res.body).toEqual({message: '업체를 찾을 수 없습니다.', validation_errors: null});
            expect(repo.findStoreImages).not.toHaveBeenCalled();
            expect(repo.findStoreHours).not.toHaveBeenCalled();
            expect(repo.findStorePlanRows).not.toHaveBeenCalled();
        });
    });

    describe('[FAIL:validation]', () => {
        it('업체 ID 가 32자 hex 가 아니면 400 validation_errors.store_id, 업체 조회 없음', async () => {
            const res = await request(app.getHttpServer()).get('/internal/v1/user-service/discovery/store/xyz').set(internalHeaders());

            expect(res.status).toBe(400);
            expect(res.body).toEqual({message: '업체 ID가 올바르지 않습니다.', validation_errors: [{property: 'store_id', message: '업체 ID가 올바르지 않습니다.'}]});
            expect(repo.findDiscoveryStore).not.toHaveBeenCalled();
        });
    });
});
```

```ts
// apps/user-service/src/discovery/test/discovery-room-group-list.spec.ts — new
import {INestApplication} from '@nestjs/common';
import request from 'supertest';
import {In, MoreThanOrEqual} from 'typeorm';
import {
    bootHttpPath,
    createDiscoveryRepositoryMock,
    DiscoveryRepositoryMock,
    groupPlanEntity,
    internalHeaders,
    ROOM_GROUP_ID,
    ROOM_GROUP_ID_2,
    ROOM_GROUP_ID_3,
    roomGroupEntity,
    STORE_ID,
    storePlanRow,
} from './discovery.test-helper.js';

const PATH = `/internal/v1/user-service/discovery/store/${STORE_ID}/room-group`;

/** 스탠다드(ROOM_GROUP_ID) · 디럭스(ROOM_GROUP_ID_2) · 빈 그룹(ROOM_GROUP_ID_3 — 예약 받을 호실 없음) */
const STANDARD_HOURLY = groupPlanEntity('1'.repeat(32), ROOM_GROUP_ID, 'HOURLY', 1, 30000);
const STANDARD_NIGHT_FREE = groupPlanEntity('2'.repeat(32), ROOM_GROUP_ID, 'NIGHT', 1, 0);
const STANDARD_LONG = groupPlanEntity('3'.repeat(32), ROOM_GROUP_ID, 'LONG', 1, 90000);
const DELUXE_HOURLY_OFF = groupPlanEntity('4'.repeat(32), ROOM_GROUP_ID_2, 'HOURLY', 0, 40000);
const DELUXE_NIGHT = groupPlanEntity('5'.repeat(32), ROOM_GROUP_ID_2, 'NIGHT', 1, 70000);
const EMPTY_HOURLY = groupPlanEntity('9'.repeat(32), ROOM_GROUP_ID_3, 'HOURLY', 1, 20000);

describe('GET /internal/v1/user-service/discovery/store/:store_id/room-group — 업체의 객실 그룹 목록 (동기 경로, 로그인 없음)', () => {
    let app: INestApplication;
    let repo: DiscoveryRepositoryMock;

    beforeEach(async () => {
        vi.useFakeTimers({toFake: ['Date']});
        vi.setSystemTime(new Date('2026-11-05T15:30:00Z'));
        repo = createDiscoveryRepositoryMock();
        repo.findStorePlanRows.mockResolvedValue([storePlanRow('HOURLY'), storePlanRow('NIGHT'), storePlanRow('LONG', {is_used: 0})]);
        repo.findRoomGroups.mockResolvedValue([roomGroupEntity(ROOM_GROUP_ID_2, '디럭스'), roomGroupEntity(ROOM_GROUP_ID_3, '빈 그룹'), roomGroupEntity(ROOM_GROUP_ID, '스탠다드')]);
        repo.countBookableRooms.mockResolvedValue([
            {room_group_id: ROOM_GROUP_ID, room_count: 3},
            {room_group_id: ROOM_GROUP_ID_2, room_count: 2},
        ]);
        repo.findRoomGroupPlans.mockResolvedValue([STANDARD_HOURLY, STANDARD_NIGHT_FREE, STANDARD_LONG, DELUXE_HOURLY_OFF, DELUXE_NIGHT, EMPTY_HOURLY]);
        repo.findRoomGroupPlanPrices.mockResolvedValue([{room_group_plan_id: STANDARD_HOURLY.room_group_plan_id, start_date: '2026-12-20', end_date: '2026-12-31', price: 45000, memo: '연말'}]);
        repo.findRoomGroupImages.mockResolvedValue([
            {room_group_id: ROOM_GROUP_ID, file_key: 'g/standard-1.jpg', sort_order: 0},
            {room_group_id: ROOM_GROUP_ID, file_key: 'g/standard-2.jpg', sort_order: 1},
        ]);
        app = await bootHttpPath(repo);
    });

    afterEach(async () => {
        vi.useRealTimers();
        vi.clearAllMocks();
        await app.close();
    });

    describe('[SUCCESS]', () => {
        it('그룹명 순 그대로, 호실 없는 그룹 제외, 판매 중인 상품만(미사용 · 요금 0 · 업체가 안 파는 종류 제외), 기간 가격 · 사진은 그 그룹에', async () => {
            const res = await request(app.getHttpServer()).get(PATH).set(internalHeaders());

            expect(res.status).toBe(200);
            expect(res.body).toEqual({
                list: [
                    {
                        room_group_id: ROOM_GROUP_ID_2,
                        room_group_name: '디럭스',
                        description: '디럭스 설명',
                        room_group_detail: {room_count: 1, has_shower: 1, has_tv: 1, has_pc: 0},
                        room_count: 2,
                        images: [],
                        plans: [{room_plan_type_id: 'NIGHT', room_plan_type_name: '1박', price: 70000, period_prices: []}],
                    },
                    {
                        room_group_id: ROOM_GROUP_ID,
                        room_group_name: '스탠다드',
                        description: '스탠다드 설명',
                        room_group_detail: {room_count: 1, has_shower: 1, has_tv: 1, has_pc: 0},
                        room_count: 3,
                        images: [
                            {image_url: 'https://cdn.test/g/standard-1.jpg', sort_order: 0},
                            {image_url: 'https://cdn.test/g/standard-2.jpg', sort_order: 1},
                        ],
                        plans: [
                            {
                                room_plan_type_id: 'HOURLY',
                                room_plan_type_name: '시간 이용',
                                price: 30000,
                                period_prices: [{start_date: '2026-12-20', end_date: '2026-12-31', price: 45000, memo: '연말'}],
                            },
                        ],
                    },
                ],
            });
        });

        it('조회 조건 — 활성 업체, 그룹 ID 들로 호실 수 · 그룹 상품 · 사진, 판매 중인 그룹 상품의 끝 날짜 ≥ 오늘(한국 11-06) 기간 가격', async () => {
            await request(app.getHttpServer()).get(PATH).set(internalHeaders());

            const group_ids = [ROOM_GROUP_ID_2, ROOM_GROUP_ID_3, ROOM_GROUP_ID];
            expect(repo.findDiscoveryStore).toHaveBeenCalledWith({store_id: STORE_ID, store_state_id: 'ACTIVE'});
            expect(repo.findRoomGroups).toHaveBeenCalledWith({store_id: STORE_ID});
            expect(repo.countBookableRooms).toHaveBeenCalledWith(group_ids);
            expect(repo.findRoomGroupPlans).toHaveBeenCalledWith({room_group_id: In(group_ids)});
            expect(repo.findRoomGroupPlanPrices).toHaveBeenCalledWith({
                room_group_plan_id: In([STANDARD_HOURLY.room_group_plan_id, DELUXE_NIGHT.room_group_plan_id, EMPTY_HOURLY.room_group_plan_id]),
                end_date: MoreThanOrEqual('2026-11-06'),
            });
            expect(repo.findRoomGroupImages).toHaveBeenCalledWith({room_group_id: In(group_ids)});
        });
    });

    describe('[SKIP]', () => {
        it('업체가 파는 상품 종류가 없으면 빈 목록 — 그룹 조회 없음', async () => {
            repo.findStorePlanRows.mockResolvedValueOnce([storePlanRow('HOURLY', {is_used: 0})]);

            const res = await request(app.getHttpServer()).get(PATH).set(internalHeaders());

            expect(res.body).toEqual({list: []});
            expect(repo.findRoomGroups).not.toHaveBeenCalled();
        });

        it('그룹이 없으면 빈 목록 — 호실 수 조회 없음', async () => {
            repo.findRoomGroups.mockResolvedValueOnce([]);

            const res = await request(app.getHttpServer()).get(PATH).set(internalHeaders());

            expect(res.body).toEqual({list: []});
            expect(repo.countBookableRooms).not.toHaveBeenCalled();
        });

        it('판매 중인 그룹 상품이 없으면 빈 목록 — 기간 가격 · 사진 조회 없음', async () => {
            repo.findRoomGroupPlans.mockResolvedValueOnce([DELUXE_HOURLY_OFF, STANDARD_NIGHT_FREE, STANDARD_LONG]);

            const res = await request(app.getHttpServer()).get(PATH).set(internalHeaders());

            expect(res.body).toEqual({list: []});
            expect(repo.findRoomGroupPlanPrices).not.toHaveBeenCalled();
            expect(repo.findRoomGroupImages).not.toHaveBeenCalled();
        });
    });

    describe('[FAIL:service]', () => {
        it('업체가 없거나 활성이 아니면 404, 상품 설정 조회 없음', async () => {
            repo.findDiscoveryStore.mockResolvedValueOnce(null);

            const res = await request(app.getHttpServer()).get(PATH).set(internalHeaders());

            expect(res.status).toBe(404);
            expect(res.body).toEqual({message: '업체를 찾을 수 없습니다.', validation_errors: null});
            expect(repo.findStorePlanRows).not.toHaveBeenCalled();
        });
    });

    describe('[FAIL:validation]', () => {
        it('업체 ID 가 32자 hex 가 아니면 400 validation_errors.store_id, 업체 조회 없음', async () => {
            const res = await request(app.getHttpServer()).get('/internal/v1/user-service/discovery/store/xyz/room-group').set(internalHeaders());

            expect(res.status).toBe(400);
            expect(res.body).toEqual({message: '업체 ID가 올바르지 않습니다.', validation_errors: [{property: 'store_id', message: '업체 ID가 올바르지 않습니다.'}]});
            expect(repo.findDiscoveryStore).not.toHaveBeenCalled();
        });
    });
});
```

```ts
// apps/user-service/src/discovery/test/discovery.repository.spec.ts — new
import {InternalServerErrorException} from '@nestjs/common';
import type {TransactionHost} from '@nestjs-cls/transactional';
import type {TransactionalAdapterTypeOrm} from '@nestjs-cls/transactional-adapter-typeorm';
import {DataSource, In, MoreThanOrEqual} from 'typeorm';
import type {EntityTarget, FindManyOptions, ObjectLiteral} from 'typeorm';
import {ENTITIES} from '@app/database/entities.js';
import {RoomGroupImageEntity} from '@app/database/entities/room/room-group-image.entity.js';
import {RoomGroupPlanPriceEntity} from '@app/database/entities/room/room-group-plan-price.entity.js';
import {RoomGroupPlanEntity} from '@app/database/entities/room/room-group-plan.entity.js';
import {RoomGroupEntity} from '@app/database/entities/room/room-group.entity.js';
import {RoomPlanEntity} from '@app/database/entities/room/room-plan.entity.js';
import {RoomEntity} from '@app/database/entities/room/room.entity.js';
import {StoreBreakEntity} from '@app/database/entities/store/store-break.entity.js';
import {StoreFileEntity} from '@app/database/entities/store/store-file.entity.js';
import {StoreHourEntity} from '@app/database/entities/store/store-hour.entity.js';
import {StoreEntity} from '@app/database/entities/store/store.entity.js';
import type {DiscoveryRoomCountRow, DiscoveryStorePlanRow, DiscoveryStoreRow} from '../interfaces/discovery.repository.interface.js';
import {DiscoveryRepository} from '../repositories/discovery.repository.js';

/** DiscoveryStoreRow 키 — raw select 별칭과 비교 */
const STORE_ROW_KEYS: (keyof DiscoveryStoreRow)[] = [
    'store_id',
    'store_name',
    'address',
    'latitude',
    'longitude',
    'distance_m',
    'cover_file_key',
    'is_open',
    'is_always_open',
    'min_hourly_price',
    'min_night_price',
];

/** DiscoveryStorePlanRow 키 */
const STORE_PLAN_ROW_KEYS: (keyof DiscoveryStorePlanRow)[] = [
    'room_plan_type_id',
    'room_plan_type_name',
    'is_used',
    'days_of_week',
    'usage_hours',
    'check_in_time',
    'check_out_time',
    'min_nights',
    'max_nights',
];

/** DiscoveryRoomCountRow 키 */
const ROOM_COUNT_ROW_KEYS: (keyof DiscoveryRoomCountRow)[] = ['room_group_id', 'room_count'];

/** 서울 5km 조건 */
const FILTER = {latitude: 37.5665, longitude: 126.978, radius_m: 5000, min_latitude: 37.521534, max_latitude: 37.611466, min_longitude: 126.921271, max_longitude: 127.034729};

/**
 * repository 가 manager.find · findOne 에 넘긴 옵션을 SQL 로 빌드한다 — EntityManager 와 같은 방식(실행만 뺀다).
 *
 * @param dataSource 메타데이터만 만든 DataSource
 * @param call 가로챈 호출 인자(대상 엔티티, 옵션)
 * @returns 공백을 하나로 줄인 SQL 과 파라미터
 */
function buildFindQuery(dataSource: DataSource, call: unknown[]): [string, unknown[]] {
    const [target, options] = call as [EntityTarget<ObjectLiteral>, FindManyOptions<ObjectLiteral>];
    const [sql, parameters] = dataSource.manager.createQueryBuilder(target, dataSource.getMetadata(target).name).setFindOptions(options).getQueryAndParameters();
    return [sql.replace(/\s+/g, ' '), parameters];
}

/**
 * raw select 의 별칭 목록 (` AS "<키>"`) — 서브쿼리 안의 별칭은 없다
 *
 * @param sql 공백을 한 칸으로 줄인 SQL
 * @returns 별칭 목록
 */
function selectAliases(sql: string): string[] {
    return [...sql.matchAll(/ AS "([a-z_]+)"/g)].map((match) => match[1]);
}

/**
 * txHost.tx(EntityManager)를 흉내 낸다 — getRepository(엔티티) 가 엔티티별 가짜 repository 를 돌려준다.
 *
 * @returns 저장소와 엔티티별 가짜 repository
 */
function makeRepository() {
    const fake = () => ({find: vi.fn().mockResolvedValue([]), findOne: vi.fn().mockResolvedValue(null)});
    const entities = [StoreEntity, StoreFileEntity, StoreHourEntity, StoreBreakEntity, RoomPlanEntity, RoomGroupEntity, RoomEntity, RoomGroupImageEntity, RoomGroupPlanEntity, RoomGroupPlanPriceEntity];
    const repos = new Map<unknown, ReturnType<typeof fake>>(entities.map((entity) => [entity, fake()]));
    const txHost = {tx: {getRepository: (entity: unknown) => repos.get(entity)}} as unknown as TransactionHost<TransactionalAdapterTypeOrm>;
    return {repository: new DiscoveryRepository(txHost), repo: (entity: unknown) => repos.get(entity)!};
}

describe('DiscoveryRepository — 조건 · 통일 500', () => {
    it('업체 · 업체 사진 · 영업시간 · 브레이크 · 그룹 · 그룹 사진 · 기간 가격은 is_deleted: 0 을 더하고, 그룹 상품은 받은 조건 그대로 — 정렬 · loadRelationIds', async () => {
        const {repository, repo} = makeRepository();

        await repository.findDiscoveryStore({store_id: 's1', store_state_id: 'ACTIVE'});
        await repository.findStoreImages({store_id: 's1', store_file_purpose_id: 'STORE_IMAGE'});
        await repository.findStoreHours('s1');
        await repository.findStoreBreaks('s1');
        await repository.findRoomGroups({store_id: 's1'});
        await repository.findRoomGroupImages({room_group_id: In(['g1'])});
        await repository.findRoomGroupPlans({room_group_id: In(['g1'])});
        await repository.findRoomGroupPlanPrices({room_group_plan_id: In(['gp1']), end_date: MoreThanOrEqual('2026-11-06')});

        expect(repo(StoreEntity).findOne).toHaveBeenCalledWith({where: {store_id: 's1', store_state_id: 'ACTIVE', is_deleted: 0}, loadRelationIds: true});
        expect(repo(StoreFileEntity).find).toHaveBeenCalledWith({
            where: {store_id: 's1', store_file_purpose_id: 'STORE_IMAGE', is_deleted: 0},
            order: {sort_order: 'ASC', created_at: 'ASC'},
            loadRelationIds: true,
        });
        expect(repo(StoreHourEntity).find).toHaveBeenCalledWith({where: {store_id: 's1', is_deleted: 0}, order: {day_of_week: 'ASC'}, loadRelationIds: true});
        expect(repo(StoreBreakEntity).find).toHaveBeenCalledWith({where: {store_id: 's1', is_deleted: 0}, order: {start_time: 'ASC'}, loadRelationIds: true});
        expect(repo(RoomGroupEntity).find).toHaveBeenCalledWith({where: {store_id: 's1', is_deleted: 0}, order: {room_group_name: 'ASC'}, loadRelationIds: true});
        expect(repo(RoomGroupImageEntity).find).toHaveBeenCalledWith({where: {room_group_id: In(['g1']), is_deleted: 0}, order: {sort_order: 'ASC', created_at: 'ASC'}, loadRelationIds: true});
        expect(repo(RoomGroupPlanEntity).find).toHaveBeenCalledWith({where: {room_group_id: In(['g1'])}, loadRelationIds: true});
        expect(repo(RoomGroupPlanPriceEntity).find).toHaveBeenCalledWith({
            where: {room_group_plan_id: In(['gp1']), end_date: MoreThanOrEqual('2026-11-06'), is_deleted: 0},
            order: {start_date: 'ASC'},
            loadRelationIds: true,
        });
    });

    it.each([
        ['findDiscoveryStore', StoreEntity, 'findOne', [{store_id: 's1'}]],
        ['findStoreImages', StoreFileEntity, 'find', [{store_id: 's1'}]],
        ['findStoreHours', StoreHourEntity, 'find', ['s1']],
        ['findStoreBreaks', StoreBreakEntity, 'find', ['s1']],
        ['findRoomGroups', RoomGroupEntity, 'find', [{store_id: 's1'}]],
        ['findRoomGroupImages', RoomGroupImageEntity, 'find', [{room_group_id: 'g1'}]],
        ['findRoomGroupPlans', RoomGroupPlanEntity, 'find', [{room_group_id: 'g1'}]],
        ['findRoomGroupPlanPrices', RoomGroupPlanPriceEntity, 'find', [{room_group_plan_id: 'gp1'}]],
    ] as const)('[FAIL:repository] %s — DB 실패는 통일 500', async (method, entity, fn, args) => {
        const {repository, repo} = makeRepository();
        repo(entity)[fn].mockRejectedValueOnce(new Error('db'));

        await expect((repository[method] as (...params: unknown[]) => Promise<unknown>)(...args)).rejects.toBeInstanceOf(InternalServerErrorException);
    });

    it.each([
        ['findStoreRows', 'buildStoreRowsQuery', [FILTER, 301]],
        ['findStorePlanRows', 'buildStorePlanRowsQuery', ['s1']],
        ['countBookableRooms', 'buildBookableRoomCountsQuery', [['g1']]],
    ] as const)('[FAIL:repository] %s 는 같은 인자로 %s 를 실행하고, 실패는 통일 500', async (method, builder, args) => {
        const {repository} = makeRepository();
        const spy = vi.spyOn(repository as unknown as Record<string, (...params: unknown[]) => unknown>, builder).mockReturnValue({getRawMany: vi.fn().mockRejectedValue(new Error('db'))});

        await expect((repository[method] as (...params: unknown[]) => Promise<unknown>)(...args)).rejects.toBeInstanceOf(InternalServerErrorException);
        expect(spy).toHaveBeenCalledWith(...args);
    });
});

describe('[SMOKE:data-access] 반경 업체 · 상품 설정 · 그룹별 호실 수 · find 조건 — DB 연결 없이 SQL 빌드, 지워지지 않은 행만', () => {
    let dataSource: DataSource;
    let repository: DiscoveryRepository;

    /** 반경 업체 — 서울 5km · 301개 */
    const STORE_ROWS_SQL = '<build: 실행 출력으로 채운다>';
    /** 그룹별 예약 받을 호실 수 */
    const ROOM_COUNTS_SQL = '<build: 실행 출력으로 채운다>';
    /** 업체 상품 설정 + 종류명 */
    const STORE_PLAN_ROWS_SQL = '<build: 실행 출력으로 채운다>';

    beforeAll(async () => {
        // 접속하지 않는다 — 엔티티 메타데이터만 만들어 QueryBuilder 가 SQL 을 조립하게 한다
        dataSource = new DataSource({type: 'postgres', database: 'smoke', entities: ENTITIES});
        await (dataSource as unknown as {buildMetadatas: () => Promise<void>}).buildMetadatas();
        repository = new DiscoveryRepository({tx: dataSource.manager} as unknown as TransactionHost<TransactionalAdapterTypeOrm>);
    });

    it('반경 업체 — 활성 · 지워지지 않음 · 사각형 BETWEEN · 대원 거리 ≤ 반경(select · where 두 곳) · 가까운 순 · LIMIT, 사진 · 최저가 서브쿼리, 별칭 = DiscoveryStoreRow 키', () => {
        const [sql, parameters] = repository.buildStoreRowsQuery(FILTER, 301).getQueryAndParameters();
        const flat = sql.replace(/\s+/g, ' ');

        expect(parameters).toEqual(expect.arrayContaining([37.5665, 126.978, 5000, 37.521534, 37.611466, 126.921271, 127.034729, 'ACTIVE', 'STORE_IMAGE', 'HOURLY', 'NIGHT', 'DISABLED']));
        expect(flat.match(/12742000 \* ASIN\(LEAST\(1, SQRT/g)).toHaveLength(2);
        expect(flat).toContain('"s"."latitude" BETWEEN');
        expect(flat).toContain('"s"."longitude" BETWEEN');
        expect(flat).toContain('"s"."is_deleted" = 0');
        expect(flat).toContain('"f"."is_deleted" = 0');
        expect(flat).toContain('"g"."is_deleted" = 0');
        expect(flat).toContain('"r"."is_deleted" = 0');
        expect(flat).toContain('ORDER BY "distance_m" ASC, "s"."store_id" ASC LIMIT 301');
        expect([...new Set(selectAliases(flat))].sort()).toEqual([...STORE_ROW_KEYS].sort());
        expect(flat).toBe(STORE_ROWS_SQL);
    });

    it('그룹별 예약 받을 호실 수 — IN 펼침 · 지워지지 않음 · 사용중지 제외 · GROUP BY, 별칭 = DiscoveryRoomCountRow 키', () => {
        const [sql, parameters] = repository.buildBookableRoomCountsQuery(['g1', 'g2']).getQueryAndParameters();
        const flat = sql.replace(/\s+/g, ' ');

        expect(parameters).toEqual(['g1', 'g2', 'DISABLED']);
        expect(flat).toContain('"r"."room_group_id" IN ($1, $2)');
        expect(flat).toContain('GROUP BY "r"."room_group_id"');
        expect(selectAliases(flat).sort()).toEqual([...ROOM_COUNT_ROW_KEYS].sort());
        expect(flat).toBe(ROOM_COUNTS_SQL);
    });

    it('업체 상품 설정 — 종류명 조인 · 그 업체만, 별칭 = DiscoveryStorePlanRow 키', () => {
        const [sql, parameters] = repository.buildStorePlanRowsQuery('s1').getQueryAndParameters();
        const flat = sql.replace(/\s+/g, ' ');

        expect(parameters).toEqual(['s1']);
        expect(flat).toContain('INNER JOIN "t_room_plan_type" "t"');
        expect(selectAliases(flat).sort()).toEqual([...STORE_PLAN_ROW_KEYS].sort());
        expect(flat).toBe(STORE_PLAN_ROWS_SQL);
    });

    it.each([
        ['업체(활성 · 지워지지 않음)', 'findOne', () => repository.findDiscoveryStore({store_id: 's1', store_state_id: 'ACTIVE'}), ['s1', 'ACTIVE', 0], ['"StoreEntity"."store_state_id" = $2', '"StoreEntity"."is_deleted" = $3']],
        [
            '업체 사진(용도 · 정렬)',
            'find',
            () => repository.findStoreImages({store_id: 's1', store_file_purpose_id: 'STORE_IMAGE'}),
            ['s1', 'STORE_IMAGE', 0],
            ['"StoreFileEntity"."store_id" = $1', '"StoreFileEntity"."store_file_purpose_id" = $2', 'ORDER BY "StoreFileEntity"."sort_order" ASC, "StoreFileEntity"."created_at" ASC'],
        ],
        ['영업시간(요일 순)', 'find', () => repository.findStoreHours('s1'), ['s1', 0], ['"StoreHourEntity"."store_id" = $1', 'ORDER BY "StoreHourEntity"."day_of_week" ASC']],
        ['브레이크(시작 순)', 'find', () => repository.findStoreBreaks('s1'), ['s1', 0], ['"StoreBreakEntity"."store_id" = $1', 'ORDER BY "StoreBreakEntity"."start_time" ASC']],
        ['그룹(그룹명 순)', 'find', () => repository.findRoomGroups({store_id: 's1'}), ['s1', 0], ['"RoomGroupEntity"."store_id" = $1', 'ORDER BY "RoomGroupEntity"."room_group_name" ASC']],
        ['그룹 사진(In)', 'find', () => repository.findRoomGroupImages({room_group_id: In(['g1', 'g2'])}), ['g1', 'g2', 0], ['"RoomGroupImageEntity"."room_group_id" IN ($1, $2)']],
        ['그룹 상품(In)', 'find', () => repository.findRoomGroupPlans({room_group_id: In(['g1'])}), ['g1'], ['"RoomGroupPlanEntity"."room_group_id" IN ($1)']],
        [
            '기간 가격(In · 끝 날짜 ≥ 오늘)',
            'find',
            () => repository.findRoomGroupPlanPrices({room_group_plan_id: In(['gp1']), end_date: MoreThanOrEqual('2026-11-06')}),
            ['gp1', '2026-11-06', 0],
            ['"RoomGroupPlanPriceEntity"."room_group_plan_id" IN ($1)', '"RoomGroupPlanPriceEntity"."end_date" >= $2', '"RoomGroupPlanPriceEntity"."is_deleted" = $3'],
        ],
    ] as const)('find 조건 — %s 넘긴 옵션 그대로', async (_label, fn, run, expectedParameters, fragments) => {
        const spy = vi.spyOn(dataSource.manager, fn).mockResolvedValue(fn === 'find' ? [] : null);

        await run();
        const [sql, parameters] = buildFindQuery(dataSource, spy.mock.calls[0]);
        spy.mockRestore();

        expect(parameters).toEqual(expectedParameters);
        for (const fragment of fragments) {
            expect(sql).toContain(fragment);
        }
    });
});
```

```ts
// apps/user-service/src/reservation/test/reservation-availability.spec.ts — modified (바뀌는 부분)
import {
    bookableRoom, bootHttpPath, createReservationRepositoryMock, everyDayHours, groupPlanEntity, internalHeaders, NOW, planEntity,
    ReservationRepositoryMock, ROOM_GROUP_ID, ROOM_GROUP_PLAN_ID, ROOM_ID, ROOM_ID_2, STORE_ID, storeEntity, validateBody,
} from './reservation.test-helper.js';

/** 둘째 그룹(디럭스) · 그 호실 · 그 그룹 상품 */
const ROOM_GROUP_ID_2 = '8'.repeat(32);
const ROOM_ID_3 = '7'.repeat(32);
const ROOM_GROUP_PLAN_ID_2 = '6'.repeat(32);

/** 지금 바로 케이스 입력 */
interface NowStayCase {
    now?: string;
    date?: string;
    store?: Record<string, unknown>;
    hours?: Record<string, unknown>[];
    breaks?: Record<string, unknown>[];
    unavailable?: Record<string, unknown>[];
    occupied?: Record<string, unknown>[];
    room_state_id?: string;
    slot: [string, string] | null;
}

/**
 * [CASES:now-stay] — 시간 이용 '지금 바로' 12개(사용자 확정 2026-11-06). 이용 시간 4시간(240분), 지금 2026-11-05 23:36:27(한국), 24시간 업체 · 정비 30분 · 예약가능 호실 기본.
 * [이름, 입력 · 기대(지금 바로 시간대 [start_at, end_at] — UTC ISO, 없으면 null)]
 */
const NOW_STAY_CASES: [string, NowStayCase][] = [
    ['1. 비어 있음 → 23:36 ~ 다음 날 03:36 (초는 버림)', {slot: ['2026-11-05T14:36:00.000Z', '2026-11-05T18:36:00.000Z']}],
    ['2. 다음 날 02:00 ~ 06:00 시간 이용 확정과 겹침 → 없음', {occupied: [{room_id: ROOM_ID, start_at: new Date('2026-11-05T17:00:00Z'), blocked_until: new Date('2026-11-05T21:30:00Z')}], slot: null}],
    [
        '3. 다음 날 03:36 시작 예약 · 정비 0 → 맞닿아 가능',
        {store: {maintenance_minutes: 0}, occupied: [{room_id: ROOM_ID, start_at: new Date('2026-11-05T18:36:00Z'), blocked_until: new Date('2026-11-05T22:36:00Z')}], slot: ['2026-11-05T14:36:00.000Z', '2026-11-05T18:36:00.000Z']},
    ],
    ['4. 앞 예약 점유 끝 23:40(정비 30분 포함) → 없음', {occupied: [{room_id: ROOM_ID, start_at: new Date('2026-11-05T11:10:00Z'), blocked_until: new Date('2026-11-05T14:40:00Z')}], slot: null}],
    ['5. 같은 호실 1박(오늘 22:00 ~ 내일 11:00) → 없음', {occupied: [{room_id: ROOM_ID, start_at: new Date('2026-11-05T13:00:00Z'), blocked_until: new Date('2026-11-06T02:30:00Z')}], slot: null}],
    ['6. 결제 대기 예약(점유) 00:00 ~ 02:00 과 겹침 → 없음', {occupied: [{room_id: ROOM_ID, start_at: new Date('2026-11-05T15:00:00Z'), blocked_until: new Date('2026-11-05T17:30:00Z')}], slot: null}],
    ['7. 호실 정비중(예약가능 아님) → 없음', {room_state_id: 'MAINTENANCE', slot: null}],
    ['8. 영업시간 18:00 ~ 02:00(24시간 아님) — 끝 03:36 이 밖 → 없음', {store: {is_always_open: 0}, hours: everyDayHours('18:00:00', '02:00:00'), slot: null}],
    ['9. 브레이크 01:00 ~ 02:00 → 없음', {breaks: [{start_time: '01:00:00', end_time: '02:00:00'}], slot: null}],
    ['10. 일시 예약불가 내일 00:00 ~ 09:00 → 없음', {unavailable: [{starts_at: new Date('2026-11-05T15:00:00Z'), ends_at: new Date('2026-11-06T00:00:00Z')}], slot: null}],
    ['11. 영업중 아님(is_open 0) → 없음', {store: {is_open: 0}, slot: null}],
    ['12. 연도 경계 — 지금 2026-12-31 23:50:10 → 23:50 ~ 2027-01-01 03:50', {now: '2026-12-31T14:50:10Z', date: '2026-12-31', slot: ['2026-12-31T14:50:00.000Z', '2026-12-31T18:50:00.000Z']}],
];

    // [CASES:availability] — 새 모양: 그룹 1개의 시간대 시작 시각 · 그룹 금액 (입력 표는 그대로)
            expect(res.status).toBe(200);
            expect(res.body.list).toHaveLength(1);
            const group = res.body.list[0];
            expect(group.slots.map((slot: {start_at: string}) => dayjs(slot.start_at).tz(KST_TIMEZONE).format('HH:mm'))).toEqual(input.slots);
            if (input.price !== undefined) {
                expect(group.price).toBe(input.price);
            }

    describe('[CASES:now-stay] 시간 이용 지금 바로', () => {
        it.each(NOW_STAY_CASES)('%s', async (_label, input) => {
            vi.setSystemTime(new Date(input.now ?? '2026-11-05T14:36:27Z'));
            repo.findReservationStore.mockResolvedValueOnce(storeEntity({is_always_open: 1, ...input.store}));
            repo.findStorePlan.mockResolvedValueOnce(planEntity('HOURLY', {usage_hours: 4}));
            repo.findBookableRooms.mockResolvedValueOnce([bookableRoom({room_state_id: input.room_state_id ?? 'AVAILABLE'})]);
            repo.findStoreHours.mockResolvedValueOnce(input.hours ?? everyDayHours('10:00:00', '22:00:00'));
            repo.findStoreBreaks.mockResolvedValueOnce(input.breaks ?? []);
            repo.findUnavailablePeriods.mockResolvedValueOnce(input.unavailable ?? []);
            repo.findReservations.mockResolvedValueOnce(input.occupied ?? []);

            const res = await request(app.getHttpServer())
                .get(PATH)
                .query({store_id: STORE_ID, date: input.date ?? '2026-11-05', room_plan_type_id: 'HOURLY'})
                .set(internalHeaders());

            expect(res.status).toBe(200);
            const slots: {is_now: number}[] = res.body.list[0].slots;
            const nowSlot = slots.find((slot) => slot.is_now === 1) ?? null;
            if (input.slot) {
                expect(slots[0]).toEqual({start_at: input.slot[0], end_at: input.slot[1], is_now: 1, rooms: [{room_id: ROOM_ID, room_name: '101호', floor: 1}]});
            } else {
                expect(nowSlot).toBeNull();
            }
        });

        it('오늘이 아닌 날짜 · 1박이면 지금 바로 시간대가 없다', async () => {
            const tomorrow = await request(app.getHttpServer()).get(PATH).query({store_id: STORE_ID, date: '2026-11-04', room_plan_type_id: 'HOURLY'}).set(internalHeaders());
            repo.findStorePlan.mockResolvedValueOnce(planEntity('NIGHT'));
            repo.findGroupPlans.mockResolvedValueOnce([groupPlanEntity('NIGHT')]);
            const night = await request(app.getHttpServer()).get(PATH).query({store_id: STORE_ID, date: '2026-11-03', room_plan_type_id: 'NIGHT'}).set(internalHeaders());

            expect(tomorrow.body.list[0].slots.every((slot: {is_now: number}) => slot.is_now === 0)).toBe(true);
            expect(night.body.list[0].slots.every((slot: {is_now: number}) => slot.is_now === 0)).toBe(true);
        });
    });

    describe('[SUCCESS]', () => {
        it('응답 모양 · 조회 조건 — 그룹 → 시간대 → 호수, 활성 업체, 판매 중인 그룹 상품의 호실만, 점유 상태 · 조회 범위', async () => {
            const res = await request(app.getHttpServer()).get(PATH).query({store_id: STORE_ID, date: '2026-11-04', room_plan_type_id: 'HOURLY'}).set(internalHeaders());

            expect(res.status).toBe(200);
            expect(res.body).toMatchObject({room_plan_type_id: 'HOURLY', date: '2026-11-04', nights: null});
            expect(res.body.list[0]).toMatchObject({room_group_id: ROOM_GROUP_ID, room_group_name: '스탠다드', price: 30000});
            expect(res.body.list[0].slots[0]).toEqual({start_at: '2026-11-04T01:00:00.000Z', end_at: '2026-11-04T04:00:00.000Z', is_now: 0, rooms: [{room_id: ROOM_ID, room_name: '101호', floor: 1}]});
            expect(repo.findReservationStore).toHaveBeenCalledWith({store_id: STORE_ID, store_state_id: 'ACTIVE'});
            expect(repo.findStorePlan).toHaveBeenCalledWith({store_id: STORE_ID, room_plan_type_id: 'HOURLY'});
            expect(repo.findGroupPlans).toHaveBeenCalledWith({room_group_id: In([ROOM_GROUP_ID]), room_plan_type_id: 'HOURLY'});
            expect(repo.findGroupPlanPrices).toHaveBeenCalledWith({room_group_plan_id: In([ROOM_GROUP_PLAN_ID])});
            const [occupiedWhere] = repo.findReservations.mock.calls[0] as [Record<string, unknown>];
            expect(occupiedWhere.room_id).toEqual(In([ROOM_ID]));
            expect(occupiedWhere.reservation_state_id).toEqual(In(['PENDING', 'CONFIRMED', 'CHECKED_IN']));
        });

        it('그룹 2개 · 같은 그룹 호실 2개 — 그룹명 순, 101호가 점유한 시간대에는 102호만, 뒤 시간대는 101호 · 102호', async () => {
            repo.findBookableRooms.mockResolvedValueOnce([
                bookableRoom(),
                bookableRoom({room_id: ROOM_ID_2, room_name: '102호'}),
                bookableRoom({room_id: ROOM_ID_3, room_name: '201호', floor: 2, room_group_id: ROOM_GROUP_ID_2, room_group_name: '디럭스'}),
            ]);
            repo.findGroupPlans.mockResolvedValueOnce([groupPlanEntity('HOURLY'), groupPlanEntity('HOURLY', {room_group_plan_id: ROOM_GROUP_PLAN_ID_2, room_group_id: ROOM_GROUP_ID_2, price: 50000})]);
            repo.findReservations.mockResolvedValueOnce([{room_id: ROOM_ID, start_at: new Date('2026-11-04T01:00:00Z'), blocked_until: new Date('2026-11-04T04:30:00Z')}]);

            const res = await request(app.getHttpServer()).get(PATH).query({store_id: STORE_ID, date: '2026-11-04', room_plan_type_id: 'HOURLY'}).set(internalHeaders());

            expect(res.body.list.map((group: {room_group_name: string}) => group.room_group_name)).toEqual(['디럭스', '스탠다드']);
            expect(res.body.list[0]).toMatchObject({room_group_id: ROOM_GROUP_ID_2, price: 50000});
            const standard = res.body.list[1];
            expect(standard.slots[0].rooms).toEqual([{room_id: ROOM_ID_2, room_name: '102호', floor: 1}]);
            const after = standard.slots.find((slot: {start_at: string}) => slot.start_at === '2026-11-04T04:30:00.000Z');
            expect(after.rooms.map((room: {room_name: string}) => room.room_name)).toEqual(['101호', '102호']);
        });

        it('room_group_id 필터 — 그 그룹의 호실만으로 그룹 상품 · 점유 예약을 본다', async () => {
            repo.findBookableRooms.mockResolvedValueOnce([bookableRoom(), bookableRoom({room_id: ROOM_ID_3, room_name: '201호', floor: 2, room_group_id: ROOM_GROUP_ID_2, room_group_name: '디럭스'})]);
            repo.findGroupPlans.mockResolvedValueOnce([groupPlanEntity('HOURLY', {room_group_plan_id: ROOM_GROUP_PLAN_ID_2, room_group_id: ROOM_GROUP_ID_2})]);

            const res = await request(app.getHttpServer())
                .get(PATH)
                .query({store_id: STORE_ID, date: '2026-11-04', room_plan_type_id: 'HOURLY', room_group_id: ROOM_GROUP_ID_2})
                .set(internalHeaders());

            expect(res.body.list).toHaveLength(1);
            expect(res.body.list[0].room_group_id).toBe(ROOM_GROUP_ID_2);
            expect(repo.findGroupPlans).toHaveBeenCalledWith({room_group_id: In([ROOM_GROUP_ID_2]), room_plan_type_id: 'HOURLY'});
            const [occupiedWhere] = repo.findReservations.mock.calls[0] as [Record<string, unknown>];
            expect(occupiedWhere.room_id).toEqual(In([ROOM_ID_3]));
        });

        it('업체에 없는 그룹이면 빈 목록 — 그룹 상품 조회 없음', async () => {
            const res = await request(app.getHttpServer())
                .get(PATH)
                .query({store_id: STORE_ID, date: '2026-11-04', room_plan_type_id: 'HOURLY', room_group_id: ROOM_GROUP_ID_2})
                .set(internalHeaders());

            expect(res.body.list).toEqual([]);
            expect(repo.findGroupPlans).not.toHaveBeenCalled();
        });

        it('영업중 아님(is_open 0) — 그룹은 나오지만 시간대가 없다', async () => {
            repo.findReservationStore.mockResolvedValueOnce(storeEntity({is_open: 0}));

            const res = await request(app.getHttpServer()).get(PATH).query({store_id: STORE_ID, date: '2026-11-04', room_plan_type_id: 'HOURLY'}).set(internalHeaders());

            expect(res.body.list).toHaveLength(1);
            expect(res.body.list[0].slots).toEqual([]);
        });
    });

    // [FAIL:validation] 추가
        it('객실 그룹 ID 형식이 아니면 → room_group_id', async () => {
            await expect(validateBody(ReservationAvailabilityDto, {store_id: STORE_ID, date: '2026-11-04', room_plan_type_id: 'HOURLY', room_group_id: 'xyz'})).resolves.toEqual({
                message: '객실 그룹 ID가 올바르지 않습니다.',
                validation_errors: [{property: 'room_group_id', message: '객실 그룹 ID가 올바르지 않습니다.'}],
            });
        });
```

```ts
// apps/user-service/src/reservation/test/reservation-create.spec.ts — modified (추가)
const NOW_HOURLY = {room_id: ROOM_ID, room_plan_type_id: 'HOURLY', date: '2026-11-03', is_now: 1};

    describe('[SUCCESS] 지금 바로', () => {
        it('지금 10:21:45 → 10:21 ~ 13:21 (분 단위 내림 · 시작 시각 없이), 점유 끝 13:51 · 환불 마감 09:21', async () => {
            vi.setSystemTime(new Date('2026-11-03T01:21:45Z'));

            const {decision} = await runCreate(NOW_HOURLY);

            expect(decision.action).toBe('ack');
            const [reservation] = repo.insertReservation.mock.calls[0] as [ReservationEntity];
            expect(reservation).toMatchObject({
                start_at: new Date('2026-11-03T01:21:00Z'),
                end_at: new Date('2026-11-03T04:21:00Z'),
                blocked_until: new Date('2026-11-03T04:51:00Z'),
                refund_deadline_at: new Date('2026-11-03T00:21:00Z'),
            });
        });
    });

    describe('[FAIL:service] 지금 바로', () => {
        it('1박이면 400 validation_errors.is_now, 호실 조회 없음', async () => {
            const {result} = await runCreate({...NOW_HOURLY, room_plan_type_id: 'NIGHT'});

            expect(result?.error).toEqual({
                status_code: 400,
                body: {message: '지금 바로 이용은 시간 이용만 예약할 수 있습니다.', validation_errors: [{property: 'is_now', message: '지금 바로 이용은 시간 이용만 예약할 수 있습니다.'}]},
            });
            expect(repo.findReservationRoom).not.toHaveBeenCalled();
        });

        it('오늘이 아닌 날짜면 400 validation_errors.date, 호실 조회 없음', async () => {
            const {result} = await runCreate({...NOW_HOURLY, date: '2026-11-04'});

            expect(result?.error).toEqual({
                status_code: 400,
                body: {message: '지금 바로 이용은 오늘 날짜로만 예약할 수 있습니다.', validation_errors: [{property: 'date', message: '지금 바로 이용은 오늘 날짜로만 예약할 수 있습니다.'}]},
            });
            expect(repo.findReservationRoom).not.toHaveBeenCalled();
        });

        it('점유와 겹치면 400 예약할 수 없는 시간, 결제 쓰기 없음', async () => {
            vi.setSystemTime(new Date('2026-11-03T01:21:45Z'));
            repo.findReservations.mockResolvedValueOnce([{room_id: ROOM_ID, start_at: new Date('2026-11-03T02:00:00Z'), blocked_until: new Date('2026-11-03T05:30:00Z')}]);

            const {result} = await runCreate(NOW_HOURLY);

            expect(result?.error).toEqual({status_code: 400, body: {message: '예약할 수 없는 시간입니다.', validation_errors: null}});
            expect(repo.insertPayment).not.toHaveBeenCalled();
        });
    });

    // [FAIL:validation] 추가
        it('지금 바로 이용 여부가 0 · 1 이 아니면 → is_now', async () => {
            await expect(validateBody(ReservationDto, {...NOW_HOURLY, is_now: 2})).resolves.toEqual({
                message: '지금 바로 이용 여부가 올바르지 않습니다.',
                validation_errors: [{property: 'is_now', message: '지금 바로 이용 여부가 올바르지 않습니다.'}],
            });
        });

        it('시간 이용 + 지금 바로 1 이면 시작 시각 없이 통과', async () => {
            await expect(validateBody(ReservationDto, NOW_HOURLY)).resolves.toBeNull();
        });
```

```ts
// apps/user-service/src/reservation/test/reservation-payment-confirm.spec.ts — modified (door mock 을 받아 부팅 · 추가)
import {ServiceUnavailableException} from '@nestjs/common';
import {RoomQrEntity} from '@app/database/entities/door/room-qr.entity.js';
import {createDoorStoreMock, createSmsSenderMock, DoorStoreMock, ID_PATTERN, QR, ROOM_ID, roomQrEntity} from './reservation.test-helper.js';

    let door: DoorStoreMock;
    // beforeEach
        door = createDoorStoreMock();
        ({dispatcher, module} = await bootCommandPath(repo, payment, createSmsSenderMock(), door));

    describe('[SUCCESS] 이용이 시작된 예약 — QR 바로 발급', () => {
        /** 지금 바로 예약 — 2026-11-03 08:59 ~ 12:59(한국), 지금 09:00 */
        const STARTED = {reservation_state_id: 'PENDING', start_at: new Date('2026-11-02T23:59:00Z'), end_at: new Date('2026-11-03T03:59:00Z')};

        it('확정 뒤 QR 발급(INSERT … ON CONFLICT) → 다시 읽기 → Redis 현재 QR — 모두 예약 확정 뒤', async () => {
            repo.findReservation.mockResolvedValue(reservationEntity(STARTED));
            repo.findRoomQr.mockResolvedValueOnce(roomQrEntity({starts_at: STARTED.start_at, ends_at: STARTED.end_at}));

            const {decision, result} = await runConfirm();

            expect(decision.action).toBe('ack');
            expect(result?.result).toEqual({reservation_id: RESERVATION_ID, reservation_state_id: 'CONFIRMED'});
            const [issued] = repo.insertRoomQr.mock.calls[0] as [RoomQrEntity];
            expect(issued).toBeInstanceOf(RoomQrEntity);
            expect(issued.room_qr_id).toMatch(ID_PATTERN);
            expect(issued.qr).toMatch(ID_PATTERN);
            expect(issued).toMatchObject({room_id: ROOM_ID, reservation_id: RESERVATION_ID, starts_at: STARTED.start_at, ends_at: STARTED.end_at});
            expect(repo.findRoomQr).toHaveBeenCalledWith({reservation_id: RESERVATION_ID});
            expect(door.setQr).toHaveBeenCalledTimes(1);
            expect(door.setQr).toHaveBeenCalledWith(ROOM_ID, QR, STARTED.end_at);
            expect(repo.insertRoomQr.mock.invocationCallOrder[0]).toBeGreaterThan(repo.updateReservation.mock.invocationCallOrder[0]);
            expect(door.setQr.mock.invocationCallOrder[0]).toBeGreaterThan(repo.findRoomQr.mock.invocationCallOrder[0]);
        });

        it('시작 전 예약이면 QR 을 발급하지 않는다(이용 시작 때 scheduler · 내 예약 QR)', async () => {
            await runConfirm();

            expect(repo.insertRoomQr).not.toHaveBeenCalled();
            expect(door.setQr).not.toHaveBeenCalled();
        });

        it('[FAIL:external] Redis 503 이면 재시도(requeue) — 확정은 롤백되어 다시 확인한다', async () => {
            repo.findReservation.mockResolvedValue(reservationEntity(STARTED));
            repo.findRoomQr.mockResolvedValueOnce(roomQrEntity());
            door.setQr.mockRejectedValueOnce(new ServiceUnavailableException({message: '상태 저장소에 연결할 수 없습니다. 잠시 후 다시 시도해주세요.'}));

            const {decision} = await runConfirm();

            expect(decision.action).toBe('requeue');
        });

        it('[FAIL:service] 발급 뒤 다시 읽어도 없으면 500 → 재시도, Redis 쓰기 없음', async () => {
            repo.findReservation.mockResolvedValue(reservationEntity(STARTED));

            const {decision} = await runConfirm();

            expect(decision.action).toBe('requeue');
            expect(door.setQr).not.toHaveBeenCalled();
        });
    });
```

---

## Response Codes
| Code | Cause |
|------|------|
| 200 | 반경 업체 · 업체 상세 · 객실 그룹 목록 · 예약 가능 시간 성공(빈 목록 포함 — 반경 안에 없음 · 상품 안 팖 · 그룹 없음 · 업체에 없는 그룹) |
| SSE done | 예약 생성(지금 바로 포함) · 결제 확인(이용이 시작됐으면 QR 발급까지) |
| 400 | 입력 검증(위도 · 경도 · 반경 5/10/20/50 · 업체 ID · 객실 그룹 ID · `is_now` 0/1) / '지금 바로 이용은 시간 이용만 예약할 수 있습니다.'(validation_errors.is_now) / '지금 바로 이용은 오늘 날짜로만 예약할 수 있습니다.'(validation_errors.date) / '예약할 수 없는 시간입니다.'(지금 바로 겹침) / 기존 예약 · 결제 400 그대로 |
| 401 | 예약 생성 · 결제 확인의 actor 없음(기존) — discovery · 예약 가능 시간은 로그인 없음 |
| 403 | 서비스 내부 토큰 없음(전역 InternalAuthGuard) |
| 404 | '업체를 찾을 수 없습니다.'(discovery 상세 · 그룹 목록 — 지움 · 영업중지 · 탈퇴, 예약 가능 시간 기존) |
| 500 | DB 실패(통일 '서버에서 오류가 발생했습니다. 관리자에게 문의해주세요.') / `AWS_S3_PUBLIC_URL` 이 비어 공개 주소를 못 만듦(STORAGE_PUBLIC_URL_MISSING_MESSAGE) / 결제 확인 · 내 예약 QR 의 'QR 정보를 발급하지 못했습니다. 관리자에게 문의해주세요.'(큐는 재시도) |
| 503 | user-service 에 닿지 못함(게이트웨이) / 결제 확인의 Redis 현재 QR 쓰기 실패(재시도) |
