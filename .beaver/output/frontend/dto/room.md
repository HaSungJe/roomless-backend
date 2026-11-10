# DTO — room

> `libs/contracts/src/room/dto/` 에서 Swagger 데코레이터(`@nestjs/swagger`)만 뺀 사본 — 기준: 백엔드 Phase 27(2026-11-10). `class-validator` · `class-transformer` 데코레이터와 한국어 메시지는 그대로다(화면 입력 검증에 그대로 쓴다). 프론트에는 `contracts/room/dto/<파일>` 로 둔다. 이후 바뀐 DTO 는 `changes/` 로 온다.

## room/dto/room-delete.dto.ts

```ts
import {IsNotEmpty, Matches} from 'class-validator';

/**
 * 호실 삭제 path param — 내 업체의 지워지지 않은 호실만(아니면 404)
 */
export class RoomDeleteParamDto {
    /** 호실 ID */
    @Matches(/^[a-f0-9]{32}$/, {message: '호실 ID가 올바르지 않습니다.'})
    @IsNotEmpty({message: '호실 ID를 입력해주세요.'})
    room_id: string;
}
```

## room/dto/room-door-open.dto.ts

```ts
import {IsNotEmpty, Matches} from 'class-validator';

/**
 * 호실 문 바로 열기 path — 내 업체의 지워지지 않은 호실만(없으면 404)
 */
export class RoomDoorOpenParamDto {
    /** 호실 ID */
    @Matches(/^[a-f0-9]{32}$/, {message: '호실 ID가 올바르지 않습니다.'})
    @IsNotEmpty({message: '호실 ID를 입력해주세요.'})
    room_id: string;
}

/**
 * 바로 열기 결과 — 서버는 Redis 상태만 바꾸고 그 업체 문 소켓에 열기 명령(door.open)을 보낸다. 실제 문은 문 쪽 프로그램이 연다
 */
export class RoomDoorOpenResultDto {
    /** 연 문의 호실 ID */
    room_id: string;

    /** 문 상태 (open: 열림) — 값: open · close */
    door_state: string;

    /** 문을 연 시각 — 한국 시각 yyyyMMddHHmmss */
    door_changed_at: string;
}
```

## room/dto/room-group-delete.dto.ts

```ts
import {IsNotEmpty, Matches} from 'class-validator';

/**
 * 객실 그룹 삭제 path param — 내 업체의 지워지지 않은 그룹만(아니면 404). 그 그룹의 호실 · 사진도 함께 지운다
 */
export class RoomGroupDeleteParamDto {
    /** 객실 그룹 ID */
    @Matches(/^[a-f0-9]{32}$/, {message: '객실 그룹 ID가 올바르지 않습니다.'})
    @IsNotEmpty({message: '객실 그룹 ID를 입력해주세요.'})
    room_group_id: string;
}
```

## room/dto/room-group-detail.dto.ts

```ts
import {IsNotEmpty, Matches} from 'class-validator';

/**
 * 객실 그룹 상세 path param — 내 업체의 지워지지 않은 그룹만(아니면 404)
 */
export class RoomGroupDetailParamDto {
    /** 객실 그룹 ID */
    @Matches(/^[a-f0-9]{32}$/, {message: '객실 그룹 ID가 올바르지 않습니다.'})
    @IsNotEmpty({message: '객실 그룹 ID를 입력해주세요.'})
    room_group_id: string;
}

/**
 * 객실 그룹 상세정보 (t_room_group.room_group_detail) — 저장되지 않은 항목도 기본값으로 채워 모두 있다
 */
export class RoomGroupDetailValueResultDto {
    /** 객실 안의 방 개수 (원룸 1 · 투룸 2) */
    room_count: number;

    /** 샤워실 유무 (0: 없음, 1: 있음) */
    has_shower: number;

    /** TV 유무 (0: 없음, 1: 있음) */
    has_tv: number;

    /** PC 유무 (0: 없음, 1: 있음) */
    has_pc: number;
}

/**
 * 객실 그룹 사진
 */
export class RoomGroupDetailImageResultDto {
    /** 객실 그룹 사진 ID */
    room_group_image_id: string;

    /** 원본 파일명 */
    file_name: string;

    /** MIME 타입 */
    content_type: string;

    /** 정렬 순서 (가장 앞이 대표) */
    sort_order: number;

    /** 열람 주소 (CDN 공개 주소) */
    image_url: string;
}

/**
 * 그룹 상품 — 그룹 × 상품 종류의 사용 여부 · 기본 요금
 */
export class RoomGroupDetailPlanResultDto {
    /** 상품 종류 ID (HOURLY: 시간 이용, NIGHT: 1박, LONG: 연박) */
    room_plan_type_id: string;

    /** 상품 종류명 */
    room_plan_type_name: string;

    /** 사용 여부 (0: 이 그룹은 팔지 않음, 1: 판매 — 업체 상품 설정도 사용 중이어야 판다) */
    is_used: number;

    /** 기본 요금(원) — 시간 이용 1회 · 1박 · 연박 1박당 */
    price: number;
}

/**
 * 객실 그룹 상세 — 그룹 정보 · 상세정보 · 사진 · 그룹 상품 3개
 */
export class RoomGroupDetailResultDto {
    /** 객실 그룹 ID */
    room_group_id: string;

    /** 그룹명 */
    room_group_name: string;

    /** 설명 */
    description: string | null;

    /** 상세정보 (항목 모두) */
    room_group_detail: RoomGroupDetailValueResultDto;

    /** 사진 (정렬 순서) */
    images: RoomGroupDetailImageResultDto[];

    /** 그룹 상품 (HOURLY · NIGHT · LONG 순) */
    plans: RoomGroupDetailPlanResultDto[];

    /** 등록일시 (ISO 8601) */
    created_at: string;

    /** 수정일시 (ISO 8601) */
    updated_at: string;
}
```

## room/dto/room-group-image-delete.dto.ts

```ts
import {IsNotEmpty, Matches} from 'class-validator';

/**
 * 객실 그룹 사진 삭제 path param — 내 업체 그룹의 지워지지 않은 사진만(아니면 404)
 */
export class RoomGroupImageDeleteParamDto {
    /** 객실 그룹 ID */
    @Matches(/^[a-f0-9]{32}$/, {message: '객실 그룹 ID가 올바르지 않습니다.'})
    @IsNotEmpty({message: '객실 그룹 ID를 입력해주세요.'})
    room_group_id: string;

    /** 객실 그룹 사진 ID */
    @Matches(/^[a-f0-9]{32}$/, {message: '사진 ID가 올바르지 않습니다.'})
    @IsNotEmpty({message: '사진 ID를 입력해주세요.'})
    room_group_image_id: string;
}
```

## room/dto/room-group-image-order.dto.ts

```ts
import {ArrayMaxSize, IsArray, IsNotEmpty, Matches} from 'class-validator';

/**
 * 객실 그룹 사진 순서 변경 path param — 내 업체의 지워지지 않은 그룹만(아니면 404)
 */
export class RoomGroupImageOrderParamDto {
    /** 객실 그룹 ID */
    @Matches(/^[a-f0-9]{32}$/, {message: '객실 그룹 ID가 올바르지 않습니다.'})
    @IsNotEmpty({message: '객실 그룹 ID를 입력해주세요.'})
    room_group_id: string;
}

/**
 * 객실 그룹 사진 순서 변경 — 지금 그룹 사진 ID 전부를 원하는 순서로(가장 앞이 대표)
 */
export class RoomGroupImageOrderDto {
    /** 그룹 사진 ID 전부를 원하는 순서로 — 빠지거나 남거나 겹치면 400 */
    @Matches(/^[a-f0-9]{32}$/, {each: true, message: '사진 ID가 올바르지 않습니다.'})
    @ArrayMaxSize(5, {message: '객실 그룹 사진은 5장까지입니다.'})
    @IsArray({message: '사진 ID를 배열로 입력해주세요.'})
    @IsNotEmpty({message: '사진 ID를 입력해주세요.'})
    room_group_image_ids: string[];
}
```

## room/dto/room-group-image-upload-url.dto.ts

```ts
import {IsIn, IsNotEmpty, Matches} from 'class-validator';

/**
 * 객실 그룹 사진 업로드 주소 path param — 내 업체의 지워지지 않은 그룹만(아니면 404)
 */
export class RoomGroupImageUploadUrlParamDto {
    /** 객실 그룹 ID */
    @Matches(/^[a-f0-9]{32}$/, {message: '객실 그룹 ID가 올바르지 않습니다.'})
    @IsNotEmpty({message: '객실 그룹 ID를 입력해주세요.'})
    room_group_id: string;
}

/**
 * 객실 그룹 사진 업로드 주소 요청 — 그룹마다 사진 5장까지
 */
export class RoomGroupImageUploadUrlDto {
    /** 올릴 사진의 MIME 타입 — 업로드할 때 같은 Content-Type 헤더로 PUT 한다 — 값: image/jpeg · image/png */
    @IsIn(['image/jpeg', 'image/png'], {message: 'JPG · PNG 사진만 올릴 수 있습니다.'})
    @IsNotEmpty({message: '파일 형식을 입력해주세요.'})
    content_type: string;
}

/**
 * 객실 그룹 사진 업로드 주소 — 이 주소로 PUT 한 뒤 file_key 로 사진을 등록한다
 */
export class RoomGroupImageUploadUrlResultDto {
    /** 저장 키 — 사진 등록 때 보낸다 */
    file_key: string;

    /** 업로드 주소 (PUT, 10분 유효) */
    upload_url: string;

    /** 업로드 주소 만료일시 (ISO 8601) */
    expires_at: string;
}
```

## room/dto/room-group-image.dto.ts

```ts
import {IsIn, IsNotEmpty, Matches, MaxLength} from 'class-validator';

/**
 * 객실 그룹 사진 등록 path param — 내 업체의 지워지지 않은 그룹만(아니면 404)
 */
export class RoomGroupImageParamDto {
    /** 객실 그룹 ID */
    @Matches(/^[a-f0-9]{32}$/, {message: '객실 그룹 ID가 올바르지 않습니다.'})
    @IsNotEmpty({message: '객실 그룹 ID를 입력해주세요.'})
    room_group_id: string;
}

/**
 * 객실 그룹 사진 등록 — 업로드 주소로 올린 사진의 키를 그룹에 붙인다(마지막 순서)
 */
export class RoomGroupImageDto {
    /** 저장 키 — 업로드 주소 응답의 file_key */
    @MaxLength(255, {message: '저장 키가 올바르지 않습니다.'})
    @IsNotEmpty({message: '저장 키를 입력해주세요.'})
    file_key: string;

    /** 원본 파일명 */
    @MaxLength(255, {message: '파일명은 255자 이내로 입력해주세요.'})
    @IsNotEmpty({message: '파일명을 입력해주세요.'})
    file_name: string;

    /** MIME 타입 — 업로드 주소를 받을 때와 같다 — 값: image/jpeg · image/png */
    @IsIn(['image/jpeg', 'image/png'], {message: 'JPG · PNG 사진만 올릴 수 있습니다.'})
    @IsNotEmpty({message: '파일 형식을 입력해주세요.'})
    content_type: string;
}

/**
 * 객실 그룹 사진 등록 결과
 */
export class RoomGroupImageResultDto {
    /** 객실 그룹 사진 ID */
    room_group_image_id: string;
}
```

## room/dto/room-group-list.dto.ts

```ts
import {IsOptional, MaxLength} from 'class-validator';
import {PaginationDto, PaginationResultDto} from '../../common/pagination.dto';

/**
 * 객실 그룹 목록 query — 검색어(그룹명 부분 일치). 지워지지 않은 그룹만, 등록일 최신순
 */
export class RoomGroupListDto extends PaginationDto {
    /** 검색어 — 그룹명 부분 일치 */
    @IsOptional()
    @MaxLength(100, {message: '검색어는 100자 이내로 입력해주세요.'})
    keyword: string | null;

    /**
     * @param data 요청 쿼리 — 빠진 페이지 값은 PaginationDto 기본값, 빠진 검색어는 null
     */
    constructor(data?: Partial<RoomGroupListDto>) {
        super(data);
        this.keyword = data?.keyword ?? null;
    }
}

/**
 * 객실 그룹 목록 항목
 */
export class RoomGroupListItemResultDto {
    /** 객실 그룹 ID */
    room_group_id: string;

    /** 그룹명 */
    room_group_name: string;

    /** 호실 수 (지워지지 않은 호실) */
    room_count: number;

    /** 대표 사진 열람 주소 (CDN — 순서가 가장 앞인 사진) — 사진이 없으면 null */
    image_url: string | null;

    /** 등록일시 (ISO 8601) */
    created_at: string;
}

/**
 * 객실 그룹 목록
 */
export class RoomGroupListResultDto {
    /** 목록 (등록일 최신순) */
    list: RoomGroupListItemResultDto[];

    /** 페이지 정보 */
    pagination: PaginationResultDto;
}
```

## room/dto/room-group-plan-price-delete.dto.ts

```ts
import {IsIn, IsNotEmpty, Matches} from 'class-validator';

/**
 * 상품별 기간 가격 삭제 path param — 내 업체 그룹 상품의 지워지지 않은 기간 가격만(아니면 404)
 */
export class RoomGroupPlanPriceDeleteParamDto {
    /** 객실 그룹 ID */
    @Matches(/^[a-f0-9]{32}$/, {message: '객실 그룹 ID가 올바르지 않습니다.'})
    @IsNotEmpty({message: '객실 그룹 ID를 입력해주세요.'})
    room_group_id: string;

    /** 상품 종류 ID (HOURLY: 시간 이용, NIGHT: 1박, LONG: 연박) — 값: HOURLY · NIGHT · LONG */
    @IsIn(['HOURLY', 'NIGHT', 'LONG'], {message: '상품 종류가 올바르지 않습니다.'})
    @IsNotEmpty({message: '상품 종류를 입력해주세요.'})
    room_plan_type_id: string;

    /** 기간 가격 ID */
    @Matches(/^[a-f0-9]{32}$/, {message: '기간 가격 ID가 올바르지 않습니다.'})
    @IsNotEmpty({message: '기간 가격 ID를 입력해주세요.'})
    room_group_plan_price_id: string;
}
```

## room/dto/room-group-plan-price-list.dto.ts

```ts
import {IsIn, IsNotEmpty, Matches} from 'class-validator';
import {PaginationDto, PaginationResultDto} from '../../common/pagination.dto';

/**
 * 상품별 기간 가격 목록 path param — 내 업체의 지워지지 않은 그룹 × 상품 종류
 */
export class RoomGroupPlanPriceListParamDto {
    /** 객실 그룹 ID */
    @Matches(/^[a-f0-9]{32}$/, {message: '객실 그룹 ID가 올바르지 않습니다.'})
    @IsNotEmpty({message: '객실 그룹 ID를 입력해주세요.'})
    room_group_id: string;

    /** 상품 종류 ID (HOURLY: 시간 이용, NIGHT: 1박, LONG: 연박) — 값: HOURLY · NIGHT · LONG */
    @IsIn(['HOURLY', 'NIGHT', 'LONG'], {message: '상품 종류가 올바르지 않습니다.'})
    @IsNotEmpty({message: '상품 종류를 입력해주세요.'})
    room_plan_type_id: string;
}

/**
 * 상품별 기간 가격 목록 query — 페이지만. 지워지지 않은 기간만, 시작 날짜 순
 */
export class RoomGroupPlanPriceListDto extends PaginationDto {
    /**
     * @param data 요청 쿼리 — 빠진 페이지 값은 PaginationDto 기본값
     */
    constructor(data?: Partial<RoomGroupPlanPriceListDto>) {
        super(data);
    }
}

/**
 * 상품별 기간 가격 목록 항목
 */
export class RoomGroupPlanPriceItemResultDto {
    /** 기간 가격 ID */
    room_group_plan_price_id: string;

    /** 시작 날짜 (YYYY-MM-DD, 한국 날짜 — 포함) */
    start_date: string;

    /** 종료 날짜 (YYYY-MM-DD, 한국 날짜 — 포함) */
    end_date: string;

    /** 이 기간의 요금(원) — 기본 요금 대신 */
    price: number;

    /** 메모 (예: 여름 성수기) */
    memo: string | null;
}

/**
 * 상품별 기간 가격 목록
 */
export class RoomGroupPlanPriceListResultDto {
    /** 목록 (시작 날짜 순) */
    list: RoomGroupPlanPriceItemResultDto[];

    /** 페이지 정보 */
    pagination: PaginationResultDto;
}
```

## room/dto/room-group-plan-price-update.dto.ts

```ts
import {IsIn, IsInt, IsNotEmpty, IsOptional, Matches, Max, MaxLength, Min} from 'class-validator';

/**
 * 상품별 기간 가격 수정 path param — 내 업체 그룹 상품의 지워지지 않은 기간 가격만(아니면 404)
 */
export class RoomGroupPlanPriceUpdateParamDto {
    /** 객실 그룹 ID */
    @Matches(/^[a-f0-9]{32}$/, {message: '객실 그룹 ID가 올바르지 않습니다.'})
    @IsNotEmpty({message: '객실 그룹 ID를 입력해주세요.'})
    room_group_id: string;

    /** 상품 종류 ID (HOURLY: 시간 이용, NIGHT: 1박, LONG: 연박) — 값: HOURLY · NIGHT · LONG */
    @IsIn(['HOURLY', 'NIGHT', 'LONG'], {message: '상품 종류가 올바르지 않습니다.'})
    @IsNotEmpty({message: '상품 종류를 입력해주세요.'})
    room_plan_type_id: string;

    /** 기간 가격 ID */
    @Matches(/^[a-f0-9]{32}$/, {message: '기간 가격 ID가 올바르지 않습니다.'})
    @IsNotEmpty({message: '기간 가격 ID를 입력해주세요.'})
    room_group_plan_price_id: string;
}

/**
 * 상품별 기간 가격 수정 — 등록과 같은 필드를 통째로. 같은 상품의 다른 기간(자기 자신 제외)과 날짜가 겹치면 400. 메모는 비우면 null
 */
export class RoomGroupPlanPriceUpdateDto {
    /** 시작 날짜 (YYYY-MM-DD, 한국 날짜 — 포함) */
    @Matches(/^\d{4}-\d{2}-\d{2}$/, {message: '시작 날짜를 YYYY-MM-DD 로 입력해주세요.'})
    @IsNotEmpty({message: '시작 날짜를 입력해주세요.'})
    start_date: string;

    /** 종료 날짜 (YYYY-MM-DD, 한국 날짜 — 포함, 시작 날짜와 같거나 늦다) */
    @Matches(/^\d{4}-\d{2}-\d{2}$/, {message: '종료 날짜를 YYYY-MM-DD 로 입력해주세요.'})
    @IsNotEmpty({message: '종료 날짜를 입력해주세요.'})
    end_date: string;

    /** 이 기간의 요금(원, 1 ~ 10,000,000) — 기본 요금 대신 */
    @IsInt({message: '기간 요금은 원 단위 정수로 입력해주세요.'})
    @Min(1, {message: '기간 요금은 1 ~ 10,000,000원 사이로 입력해주세요.'})
    @Max(10000000, {message: '기간 요금은 1 ~ 10,000,000원 사이로 입력해주세요.'})
    @IsNotEmpty({message: '기간 요금을 입력해주세요.'})
    price: number;

    /** 메모 (30자 — 예: 여름 성수기) */
    @IsOptional()
    @MaxLength(30, {message: '메모는 30자 이내로 입력해주세요.'})
    memo?: string;
}
```

## room/dto/room-group-plan-price.dto.ts

```ts
import {IsIn, IsInt, IsNotEmpty, IsOptional, Matches, Max, MaxLength, Min} from 'class-validator';

/**
 * 상품별 기간 가격 등록 path param — 내 업체의 지워지지 않은 그룹 × 상품 종류
 */
export class RoomGroupPlanPriceParamDto {
    /** 객실 그룹 ID */
    @Matches(/^[a-f0-9]{32}$/, {message: '객실 그룹 ID가 올바르지 않습니다.'})
    @IsNotEmpty({message: '객실 그룹 ID를 입력해주세요.'})
    room_group_id: string;

    /** 상품 종류 ID (HOURLY: 시간 이용, NIGHT: 1박, LONG: 연박) — 값: HOURLY · NIGHT · LONG */
    @IsIn(['HOURLY', 'NIGHT', 'LONG'], {message: '상품 종류가 올바르지 않습니다.'})
    @IsNotEmpty({message: '상품 종류를 입력해주세요.'})
    room_plan_type_id: string;
}

/**
 * 상품별 기간 가격 등록 — 시작 ~ 종료 날짜(둘 다 포함) 동안 기본 요금 대신 쓴다. 같은 상품의 다른 기간과 날짜가 겹치면 400. 메모는 비우면 null
 */
export class RoomGroupPlanPriceDto {
    /** 시작 날짜 (YYYY-MM-DD, 한국 날짜 — 포함) */
    @Matches(/^\d{4}-\d{2}-\d{2}$/, {message: '시작 날짜를 YYYY-MM-DD 로 입력해주세요.'})
    @IsNotEmpty({message: '시작 날짜를 입력해주세요.'})
    start_date: string;

    /** 종료 날짜 (YYYY-MM-DD, 한국 날짜 — 포함, 시작 날짜와 같거나 늦다) */
    @Matches(/^\d{4}-\d{2}-\d{2}$/, {message: '종료 날짜를 YYYY-MM-DD 로 입력해주세요.'})
    @IsNotEmpty({message: '종료 날짜를 입력해주세요.'})
    end_date: string;

    /** 이 기간의 요금(원, 1 ~ 10,000,000) — 기본 요금 대신 */
    @IsInt({message: '기간 요금은 원 단위 정수로 입력해주세요.'})
    @Min(1, {message: '기간 요금은 1 ~ 10,000,000원 사이로 입력해주세요.'})
    @Max(10000000, {message: '기간 요금은 1 ~ 10,000,000원 사이로 입력해주세요.'})
    @IsNotEmpty({message: '기간 요금을 입력해주세요.'})
    price: number;

    /** 메모 (30자 — 예: 여름 성수기) */
    @IsOptional()
    @MaxLength(30, {message: '메모는 30자 이내로 입력해주세요.'})
    memo?: string;
}

/**
 * 상품별 기간 가격 등록 결과
 */
export class RoomGroupPlanPriceResultDto {
    /** 기간 가격 ID */
    room_group_plan_price_id: string;
}
```

## room/dto/room-group-plan-update.dto.ts

```ts
import {IsIn, IsInt, IsNotEmpty, Matches, Max, Min} from 'class-validator';

/**
 * 그룹 상품 수정 path param — 내 업체의 지워지지 않은 그룹 × 상품 종류
 */
export class RoomGroupPlanUpdateParamDto {
    /** 객실 그룹 ID */
    @Matches(/^[a-f0-9]{32}$/, {message: '객실 그룹 ID가 올바르지 않습니다.'})
    @IsNotEmpty({message: '객실 그룹 ID를 입력해주세요.'})
    room_group_id: string;

    /** 상품 종류 ID (HOURLY: 시간 이용, NIGHT: 1박, LONG: 연박) — 값: HOURLY · NIGHT · LONG */
    @IsIn(['HOURLY', 'NIGHT', 'LONG'], {message: '상품 종류가 올바르지 않습니다.'})
    @IsNotEmpty({message: '상품 종류를 입력해주세요.'})
    room_plan_type_id: string;
}

/**
 * 그룹 상품 수정 — 사용 여부 · 기본 요금. 판매(is_used 1)인데 요금이 0 이면 400
 */
export class RoomGroupPlanUpdateDto {
    /** 사용 여부 (0: 이 그룹은 팔지 않음, 1: 판매 — 업체 상품 설정도 사용 중이어야 판다) — 값: 0 · 1 */
    @IsIn([0, 1], {message: '사용 여부가 올바르지 않습니다.'})
    @IsNotEmpty({message: '사용 여부를 입력해주세요.'})
    is_used: number;

    /** 기본 요금(원, 0 ~ 10,000,000 — 판매면 1원 이상) — 시간 이용 1회 · 1박 · 연박 1박당 */
    @IsInt({message: '요금은 원 단위 정수로 입력해주세요.'})
    @Min(0, {message: '요금은 0 ~ 10,000,000원 사이로 입력해주세요.'})
    @Max(10000000, {message: '요금은 0 ~ 10,000,000원 사이로 입력해주세요.'})
    @IsNotEmpty({message: '요금을 입력해주세요.'})
    price: number;
}
```

## room/dto/room-group-update.dto.ts

```ts
import {Type} from 'class-transformer';
import {IsIn, IsInt, IsNotEmpty, IsOptional, Matches, Max, MaxLength, Min, ValidateNested} from 'class-validator';

/**
 * 객실 그룹 수정 path param — 내 업체의 지워지지 않은 그룹만(아니면 404)
 */
export class RoomGroupUpdateParamDto {
    /** 객실 그룹 ID */
    @Matches(/^[a-f0-9]{32}$/, {message: '객실 그룹 ID가 올바르지 않습니다.'})
    @IsNotEmpty({message: '객실 그룹 ID를 입력해주세요.'})
    room_group_id: string;
}

/**
 * 객실 그룹 수정의 상세정보 — 보낸 알려진 항목만 받고, 빠진 항목은 service 가 지금 기본값으로 채워 통째로 저장한다. 선언하지 않은 항목은 버린다
 */
export class RoomGroupUpdateDetailDto {
    /** 객실 안의 방 개수 (1 ~ 20 — 원룸 1 · 투룸 2) */
    @IsOptional()
    @IsInt({message: '방 개수는 정수로 입력해주세요.'})
    @Min(1, {message: '방 개수는 1 ~ 20 사이로 입력해주세요.'})
    @Max(20, {message: '방 개수는 1 ~ 20 사이로 입력해주세요.'})
    room_count?: number;

    /** 샤워실 유무 (0: 없음, 1: 있음) — 값: 0 · 1 */
    @IsOptional()
    @IsIn([0, 1], {message: '샤워실 유무가 올바르지 않습니다.'})
    has_shower?: number;

    /** TV 유무 (0: 없음, 1: 있음) — 값: 0 · 1 */
    @IsOptional()
    @IsIn([0, 1], {message: 'TV 유무가 올바르지 않습니다.'})
    has_tv?: number;

    /** PC 유무 (0: 없음, 1: 있음) — 값: 0 · 1 */
    @IsOptional()
    @IsIn([0, 1], {message: 'PC 유무가 올바르지 않습니다.'})
    has_pc?: number;
}

/**
 * 객실 그룹 수정 — 그룹명 · 설명(비우면 null) · 상세정보(보내면 기본값으로 채워 통째로, 안 보내면 그대로). 업체 안 지워지지 않은 그룹명이 같으면 400
 */
export class RoomGroupUpdateDto {
    /** 그룹명 (100자 — 업체 안에서 유일) */
    @MaxLength(100, {message: '그룹명은 100자 이내로 입력해주세요.'})
    @IsNotEmpty({message: '그룹명을 입력해주세요.'})
    room_group_name: string;

    /** 설명 (2,000자) — 비우면 null */
    @IsOptional()
    @MaxLength(2000, {message: '설명은 2,000자 이내로 입력해주세요.'})
    description?: string;

    /** 상세정보 — 보내면 빠진 항목을 기본값(방 1 · 샤워실 · TV · PC 있음)으로 채워 통째로 바꾼다, 안 보내면 그대로 */
    @IsOptional()
    @Type(() => RoomGroupUpdateDetailDto)
    @ValidateNested({message: '상세정보 형식이 올바르지 않습니다.'})
    room_group_detail?: RoomGroupUpdateDetailDto;
}
```

## room/dto/room-group.dto.ts

```ts
import {Type} from 'class-transformer';
import {IsIn, IsInt, IsNotEmpty, IsOptional, Max, MaxLength, Min, ValidateNested} from 'class-validator';

/**
 * 객실 그룹 등록의 상세정보 — 보낸 알려진 항목만 받고, 빠진 항목은 service 가 지금 기본값으로 채워 전부 저장한다. 선언하지 않은 항목은 버린다
 */
export class RoomGroupDetailInputDto {
    /** 객실 안의 방 개수 (1 ~ 20 — 원룸 1 · 투룸 2) */
    @IsOptional()
    @IsInt({message: '방 개수는 정수로 입력해주세요.'})
    @Min(1, {message: '방 개수는 1 ~ 20 사이로 입력해주세요.'})
    @Max(20, {message: '방 개수는 1 ~ 20 사이로 입력해주세요.'})
    room_count?: number;

    /** 샤워실 유무 (0: 없음, 1: 있음) — 값: 0 · 1 */
    @IsOptional()
    @IsIn([0, 1], {message: '샤워실 유무가 올바르지 않습니다.'})
    has_shower?: number;

    /** TV 유무 (0: 없음, 1: 있음) — 값: 0 · 1 */
    @IsOptional()
    @IsIn([0, 1], {message: 'TV 유무가 올바르지 않습니다.'})
    has_tv?: number;

    /** PC 유무 (0: 없음, 1: 있음) — 값: 0 · 1 */
    @IsOptional()
    @IsIn([0, 1], {message: 'PC 유무가 올바르지 않습니다.'})
    has_pc?: number;
}

/**
 * 객실 그룹 등록 — 그룹 상품 3개(사용 안 함 · 요금 0)를 함께 만든다. 업체 안 지워지지 않은 그룹명이 같으면 400. 설명은 비우면 null
 */
export class RoomGroupDto {
    /** 그룹명 (100자 — 업체 안에서 유일) */
    @MaxLength(100, {message: '그룹명은 100자 이내로 입력해주세요.'})
    @IsNotEmpty({message: '그룹명을 입력해주세요.'})
    room_group_name: string;

    /** 설명 (2,000자) — 비우면 null */
    @IsOptional()
    @MaxLength(2000, {message: '설명은 2,000자 이내로 입력해주세요.'})
    description?: string;

    /** 상세정보 — 빠진 항목은 기본값(방 1 · 샤워실 · TV · PC 있음)으로 채워 저장한다, 안 보내면 모두 기본값 */
    @IsOptional()
    @Type(() => RoomGroupDetailInputDto)
    @ValidateNested({message: '상세정보 형식이 올바르지 않습니다.'})
    room_group_detail?: RoomGroupDetailInputDto;
}

/**
 * 객실 그룹 등록 결과
 */
export class RoomGroupResultDto {
    /** 객실 그룹 ID */
    room_group_id: string;
}
```

## room/dto/room-list.dto.ts

```ts
import {IsOptional, Matches} from 'class-validator';
import {PaginationDto, PaginationResultDto} from '../../common/pagination.dto';

/**
 * 호실 목록 query — 층 · 객실 그룹 필터. 지워지지 않은 호실만, 층 · 호실명 순
 */
export class RoomListDto extends PaginationDto {
    /** 층 (정수 — 지하는 음수, B1 = -1) — 없으면 전체 */
    @IsOptional()
    @Matches(/^-?\d{1,3}$/, {message: '층을 정수로 입력해주세요.'})
    floor: string | null;

    /** 객실 그룹 ID — 없으면 전체 */
    @IsOptional()
    @Matches(/^[a-f0-9]{32}$/, {message: '객실 그룹 ID가 올바르지 않습니다.'})
    room_group_id: string | null;

    /**
     * @param data 요청 쿼리 — 빠진 페이지 값은 PaginationDto 기본값, 빠진 필터는 null
     */
    constructor(data?: Partial<RoomListDto>) {
        super(data);
        this.floor = data?.floor ?? null;
        this.room_group_id = data?.room_group_id ?? null;
    }
}

/**
 * 호실 목록 항목
 */
export class RoomListItemResultDto {
    /** 호실 ID */
    room_id: string;

    /** 객실 그룹 ID */
    room_group_id: string;

    /** 그룹명 */
    room_group_name: string;

    /** 호실명 (예: 101호) */
    room_name: string;

    /** 층 (지하는 음수, B1 = -1) */
    floor: number;

    /** 호실 상태 (AVAILABLE: 예약가능, RESERVED: 예약완료, IN_USE: 사용중, MAINTENANCE: 정비중, DISABLED: 사용중지) */
    room_state_id: string;

    /** 호실 상태명 */
    room_state_name: string;

    /** 등록일시 (ISO 8601) */
    created_at: string;

    /** 문 상태 (open: 열림, close: 닫힘 — 기록이 없으면 close) — 값: open · close */
    door_state: string;

    /** 문을 마지막으로 열거나 닫은 시각 — 한국 시각 yyyyMMddHHmmss, 기록이 없으면 00000000000000 */
    door_changed_at: string;
}

/**
 * 호실 목록
 */
export class RoomListResultDto {
    /** 목록 (층 · 호실명 순) */
    list: RoomListItemResultDto[];

    /** 페이지 정보 */
    pagination: PaginationResultDto;
}
```

## room/dto/room-plan-list.dto.ts

```ts
/**
 * 업체 상품 설정 1개 — 업체 × 상품 종류. 이용 시간은 시간 이용만, 입실 · 퇴실 시각은 1박 · 연박만 값이 있다
 */
export class RoomPlanItemResultDto {
    /** 상품 종류 ID (HOURLY: 시간 이용, NIGHT: 1박, LONG: 연박) */
    room_plan_type_id: string;

    /** 상품 종류명 */
    room_plan_type_name: string;

    /** 사용 여부 (0: 팔지 않음, 1: 판매) */
    is_used: number;

    /** 예약 가능 요일 (비트 — 일 1 · 월 2 · 화 4 · 수 8 · 목 16 · 금 32 · 토 64, 매일 127) */
    days_of_week: number;

    /** 이용 시간(시간) — 시간 이용만, 1박 · 연박은 null */
    usage_hours: number | null;

    /** 입실 시각 (HH:mm, 한국 시각) — 1박 · 연박(첫날)만, 시간 이용은 null */
    check_in_time: string | null;

    /** 퇴실 시각 (HH:mm, 한국 시각 — 1박은 항상 다음 날, 연박은 마지막 날) — 시간 이용은 null */
    check_out_time: string | null;

    /** 최소 박수 — 연박만, 시간 이용 · 1박은 null */
    min_nights: number | null;

    /** 최대 박수 — 연박만, 시간 이용 · 1박은 null */
    max_nights: number | null;

    /** 연장 가능 여부 (0 · 1) */
    is_extendable: number;

    /** 최대 연장 횟수 (1 ~ 10) */
    max_extensions: number;
}

/**
 * 업체 상품 설정 목록 — 상품 종류마다 1개(3개)
 */
export class RoomPlanListResultDto {
    /** 목록 (HOURLY · NIGHT · LONG 순) */
    list: RoomPlanItemResultDto[];
}
```

## room/dto/room-plan-update.dto.ts

```ts
import {IsIn, IsInt, IsNotEmpty, IsOptional, Matches, Max, Min} from 'class-validator';

/**
 * 업체 상품 설정 수정 path param — 상품 종류
 */
export class RoomPlanUpdateParamDto {
    /** 상품 종류 ID (HOURLY: 시간 이용, NIGHT: 1박, LONG: 연박) — 값: HOURLY · NIGHT · LONG */
    @IsIn(['HOURLY', 'NIGHT', 'LONG'], {message: '상품 종류가 올바르지 않습니다.'})
    @IsNotEmpty({message: '상품 종류를 입력해주세요.'})
    room_plan_type_id: string;
}

/**
 * 업체 상품 설정 수정 — 종류별. 사용 여부 · 예약 가능 요일 · 연장 가능 여부 · 최대 연장 횟수는 모든 종류 필수.
 * 시간 이용(HOURLY)은 이용 시간 필수 · 시각은 받지 않고, 1박 · 연박은 입실 · 퇴실 시각 필수(서로 달라야 한다) · 이용 시간은 받지 않는다.
 * 연박(LONG)은 최소 · 최대 박수도 필수(1 ~ 180, 최소 ≤ 최대) · 시간 이용 · 1박은 받지 않는다.
 * 종류가 경로라 종류별 값은 선택 필드로 두고 service 가 종류로 가른다(없으면 400 — validation_errors 에 그 필드)
 */
export class RoomPlanUpdateDto {
    /** 사용 여부 (0: 팔지 않음, 1: 판매) — 값: 0 · 1 */
    @IsIn([0, 1], {message: '사용 여부가 올바르지 않습니다.'})
    @IsNotEmpty({message: '사용 여부를 입력해주세요.'})
    is_used: number;

    /** 예약 가능 요일 (비트 합 1 ~ 127 — 일 1 · 월 2 · 화 4 · 수 8 · 목 16 · 금 32 · 토 64, 매일 127. 팔지 않으려면 is_used 0) */
    @IsInt({message: '예약 가능 요일은 정수로 입력해주세요.'})
    @Min(1, {message: '예약 가능 요일은 1 ~ 127 사이로 입력해주세요.'})
    @Max(127, {message: '예약 가능 요일은 1 ~ 127 사이로 입력해주세요.'})
    @IsNotEmpty({message: '예약 가능 요일을 입력해주세요.'})
    days_of_week: number;

    /** 연장 가능 여부 (0: 이 상품 예약은 연장할 수 없다, 1: 연장 가능 — 최대 연장 횟수까지) — 값: 0 · 1 */
    @IsIn([0, 1], {message: '연장 가능 여부가 올바르지 않습니다.'})
    @IsNotEmpty({message: '연장 가능 여부를 입력해주세요.'})
    is_extendable: number;

    /** 최대 연장 횟수 (1 ~ 10 — 예약 1건에 확정되는 연장 수, 연장 불가여도 값은 남는다) */
    @IsInt({message: '최대 연장 횟수는 정수로 입력해주세요.'})
    @Min(1, {message: '최대 연장 횟수는 1 ~ 10회 사이로 입력해주세요.'})
    @Max(10, {message: '최대 연장 횟수는 1 ~ 10회 사이로 입력해주세요.'})
    @IsNotEmpty({message: '최대 연장 횟수를 입력해주세요.'})
    max_extensions: number;

    /** 이용 시간(시간, 1 ~ 24) — 시간 이용(HOURLY)이면 필수, 1박 · 연박은 받지 않는다 */
    @IsOptional()
    @IsInt({message: '이용 시간은 시간 단위 정수로 입력해주세요.'})
    @Min(1, {message: '이용 시간은 1 ~ 24시간 사이로 입력해주세요.'})
    @Max(24, {message: '이용 시간은 1 ~ 24시간 사이로 입력해주세요.'})
    usage_hours?: number;

    /** 입실 시각 (HH:mm, 한국 시각) — 1박 · 연박이면 퇴실 시각과 세트로 필수, 시간 이용은 받지 않는다 */
    @IsOptional()
    @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, {message: '입실 시각을 HH:mm 으로 입력해주세요.'})
    check_in_time?: string;

    /** 퇴실 시각 (HH:mm, 한국 시각 — 1박은 항상 다음 날, 연박은 마지막 날) — 1박 · 연박이면 입실 시각과 세트로 필수(입실과 달라야 한다), 시간 이용은 받지 않는다 */
    @IsOptional()
    @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, {message: '퇴실 시각을 HH:mm 으로 입력해주세요.'})
    check_out_time?: string;

    /** 최소 박수 (1 ~ 180) — 연박이면 최대 박수와 세트로 필수(최대 이하), 시간 이용 · 1박은 받지 않는다 */
    @IsOptional()
    @IsInt({message: '최소 박수는 정수로 입력해주세요.'})
    @Min(1, {message: '최소 박수는 1 ~ 180박 사이로 입력해주세요.'})
    @Max(180, {message: '최소 박수는 1 ~ 180박 사이로 입력해주세요.'})
    min_nights?: number;

    /** 최대 박수 (1 ~ 180) — 연박이면 최소 박수와 세트로 필수, 시간 이용 · 1박은 받지 않는다 */
    @IsOptional()
    @IsInt({message: '최대 박수는 정수로 입력해주세요.'})
    @Min(1, {message: '최대 박수는 1 ~ 180박 사이로 입력해주세요.'})
    @Max(180, {message: '최대 박수는 1 ~ 180박 사이로 입력해주세요.'})
    max_nights?: number;
}
```

## room/dto/room-state.dto.ts

```ts
import {IsIn, IsNotEmpty, Matches} from 'class-validator';

/**
 * 호실 상태 변경 path param — 내 업체의 지워지지 않은 호실만(아니면 404)
 */
export class RoomStateParamDto {
    /** 호실 ID */
    @Matches(/^[a-f0-9]{32}$/, {message: '호실 ID가 올바르지 않습니다.'})
    @IsNotEmpty({message: '호실 ID를 입력해주세요.'})
    room_id: string;
}

/**
 * 호실 상태 변경 — 업체 관리자는 정비 완료(정비중 → 예약가능) · 사용중지(예약가능 · 정비중 → 사용중지) · 사용 재개(사용중지 → 예약가능)만 바꾼다. 그 밖의 전환은 400
 */
export class RoomStateDto {
    /** 바꿀 상태 (AVAILABLE: 예약가능 — 정비 완료 · 사용 재개, DISABLED: 사용중지) — 값: AVAILABLE · DISABLED */
    @IsIn(['AVAILABLE', 'DISABLED'], {message: '바꿀 수 있는 호실 상태가 아닙니다.'})
    @IsNotEmpty({message: '호실 상태를 입력해주세요.'})
    room_state_id: string;
}
```

## room/dto/room-update.dto.ts

```ts
import {IsInt, IsNotEmpty, Matches, Max, MaxLength, Min} from 'class-validator';

/**
 * 호실 수정 path param — 내 업체의 지워지지 않은 호실만(아니면 404)
 */
export class RoomUpdateParamDto {
    /** 호실 ID */
    @Matches(/^[a-f0-9]{32}$/, {message: '호실 ID가 올바르지 않습니다.'})
    @IsNotEmpty({message: '호실 ID를 입력해주세요.'})
    room_id: string;
}

/**
 * 호실 수정 — 호실명 · 층을 통째로. 그룹은 등록 때만 정한다(바꾸지 않는다 — 잘못 등록했으면 지우고 다시 등록). 업체 안 지워지지 않은 호실명이 같으면 400
 */
export class RoomUpdateDto {
    /** 호실명 (50자 — 예: 101호, 업체 안에서 유일) */
    @MaxLength(50, {message: '호실명은 50자 이내로 입력해주세요.'})
    @IsNotEmpty({message: '호실명을 입력해주세요.'})
    room_name: string;

    /** 층 (-10 ~ 200 정수 — 지하는 음수, B1 = -1) */
    @IsInt({message: '층은 정수로 입력해주세요.'})
    @Min(-10, {message: '층은 -10 ~ 200 사이로 입력해주세요.'})
    @Max(200, {message: '층은 -10 ~ 200 사이로 입력해주세요.'})
    @IsNotEmpty({message: '층을 입력해주세요.'})
    floor: number;
}
```

## room/dto/room.dto.ts

```ts
import {IsInt, IsNotEmpty, Matches, Max, MaxLength, Min} from 'class-validator';

/**
 * 호실 등록 — 내 업체의 지워지지 않은 그룹에(없으면 404), 상태는 예약가능. 업체 안 지워지지 않은 호실명이 같으면 400
 */
export class RoomDto {
    /** 객실 그룹 ID */
    @Matches(/^[a-f0-9]{32}$/, {message: '객실 그룹 ID가 올바르지 않습니다.'})
    @IsNotEmpty({message: '객실 그룹 ID를 입력해주세요.'})
    room_group_id: string;

    /** 호실명 (50자 — 예: 101호, 업체 안에서 유일) */
    @MaxLength(50, {message: '호실명은 50자 이내로 입력해주세요.'})
    @IsNotEmpty({message: '호실명을 입력해주세요.'})
    room_name: string;

    /** 층 (-10 ~ 200 정수 — 지하는 음수, B1 = -1) */
    @IsInt({message: '층은 정수로 입력해주세요.'})
    @Min(-10, {message: '층은 -10 ~ 200 사이로 입력해주세요.'})
    @Max(200, {message: '층은 -10 ~ 200 사이로 입력해주세요.'})
    @IsNotEmpty({message: '층을 입력해주세요.'})
    floor: number;
}

/**
 * 호실 등록 결과
 */
export class RoomResultDto {
    /** 호실 ID */
    room_id: string;
}
```
