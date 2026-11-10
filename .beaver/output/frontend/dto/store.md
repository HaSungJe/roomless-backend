# DTO — store

> `libs/contracts/src/store/dto/` 에서 Swagger 데코레이터(`@nestjs/swagger`)만 뺀 사본 — 기준: 백엔드 Phase 27(2026-11-10). `class-validator` · `class-transformer` 데코레이터와 한국어 메시지는 그대로다(화면 입력 검증에 그대로 쓴다). 프론트에는 `contracts/store/dto/<파일>` 로 둔다. 이후 바뀐 DTO 는 `changes/` 로 온다.

## store/dto/store-application-approve.dto.ts

```ts
import {IsNotEmpty, Matches} from 'class-validator';

/**
 * 입점 승인 path param (총관리자)
 */
export class StoreApplicationApproveParamDto {
    /** 입점 신청 ID */
    @Matches(/^[a-f0-9]{32}$/, {message: '입점 신청 ID가 올바르지 않습니다.'})
    @IsNotEmpty({message: '입점 신청 ID를 입력해주세요.'})
    store_application_id: string;
}

/**
 * 입점 승인 결과 — 업체 총관리자는 신청 때 정한 아이디 · 비밀번호로 로그인한다
 */
export class StoreApplicationApproveResultDto {
    /** 등록한 업체 ID */
    store_id: string;

    /** 업체코드 (매니저 로그인 · 매니저 화면 주소) */
    store_code: string;
}
```

## store/dto/store-application-cancel.dto.ts

```ts
import {IsNotEmpty, Matches} from 'class-validator';

/**
 * 입점 신청 취소 path param — 대기 중 내 신청만. 취소하면 신청 · 업체 정보 파일이 지워진다(목록에도 남지 않는다).
 */
export class StoreApplicationCancelParamDto {
    /** 입점 신청 ID */
    @Matches(/^[a-f0-9]{32}$/, {message: '입점 신청 ID가 올바르지 않습니다.'})
    @IsNotEmpty({message: '입점 신청 ID를 입력해주세요.'})
    store_application_id: string;
}
```

## store/dto/store-application-detail.dto.ts

```ts
import {IsNotEmpty, Matches} from 'class-validator';

/**
 * 입점 신청 상세 path param (총관리자)
 */
export class StoreApplicationDetailParamDto {
    /** 입점 신청 ID */
    @Matches(/^[a-f0-9]{32}$/, {message: '입점 신청 ID가 올바르지 않습니다.'})
    @IsNotEmpty({message: '입점 신청 ID를 입력해주세요.'})
    store_application_id: string;
}

/**
 * 신청자 (t_user 이용자 그룹 — 없으면 상세의 applicant 가 null)
 */
export class StoreApplicationApplicantResultDto {
    /** 회원 ID */
    user_id: string;

    /** 이름 */
    name: string;

    /** 닉네임 */
    nickname: string;

    /** 휴대폰 번호 (미인증 null) */
    phone: string | null;
}

/**
 * 입점 신청의 업체 정보 파일 (총관리자)
 */
export class StoreApplicationDetailFileResultDto {
    /** 업체 정보 파일 ID */
    store_file_id: string;

    /** 용도 (BUSINESS_LICENSE · STORE_IMAGE) */
    store_file_purpose_id: string;

    /** 원본 파일명 */
    file_name: string;

    /** MIME 타입 */
    content_type: string;

    /** 비공개 여부 (1: 서명된 열람 주소 · 10분 유효, 0: CDN 공개 주소) */
    is_private: number;

    /** 열람 주소 */
    file_url: string;

    /** 등록일시 (ISO 8601) */
    created_at: string;
}

/**
 * 입점 신청 상세 (총관리자)
 */
export class StoreApplicationDetailResultDto {
    /** 입점 신청 ID */
    store_application_id: string;

    /** 신청한 이용자 ID */
    user_id: string;

    /** 신청 상태 (WAIT · APPROVED · REJECTED) */
    store_application_state_id: string;

    /** 승인으로 만든 업체 ID */
    store_id: string | null;

    /** 업체코드 (승인 전 null) */
    store_code: string | null;

    /** 상호명 */
    store_name: string;

    /** 사업자등록번호 */
    business_number: string;

    /** 대표자명 */
    owner_name: string;

    /** 대표자 휴대폰 번호 — 업체 총관리자 계정 */
    owner_phone: string;

    /** 업체 총관리자 아이디 */
    head_manager_login_id: string;

    /** 업체 연락처 */
    phone: string;

    /** 주소 */
    address: string;

    /** 상세주소 */
    address_detail: string | null;

    /** 위도 */
    latitude: number;

    /** 경도 */
    longitude: number;

    /** 신청 메모 */
    application_comment: string | null;

    /** 반려 사유 */
    reject_comment: string | null;

    /** 처리일시 (ISO 8601) */
    reviewed_at: string | null;

    /** 신청일시 (ISO 8601) */
    created_at: string;

    /** 신청자 (없으면 null) */
    applicant: StoreApplicationApplicantResultDto | null;

    /** 업체 정보 파일 (용도 · 정렬 순서) */
    files: StoreApplicationDetailFileResultDto[];
}
```

## store/dto/store-application-file-delete.dto.ts

```ts
import {IsNotEmpty, Matches} from 'class-validator';

/**
 * 업체 정보 파일 삭제 path param — 대기 중 내 신청의 파일만
 */
export class StoreApplicationFileDeleteParamDto {
    /** 입점 신청 ID */
    @Matches(/^[a-f0-9]{32}$/, {message: '입점 신청 ID가 올바르지 않습니다.'})
    @IsNotEmpty({message: '입점 신청 ID를 입력해주세요.'})
    store_application_id: string;

    /** 업체 정보 파일 ID */
    @Matches(/^[a-f0-9]{32}$/, {message: '업체 정보 파일 ID가 올바르지 않습니다.'})
    @IsNotEmpty({message: '업체 정보 파일 ID를 입력해주세요.'})
    store_file_id: string;
}
```

## store/dto/store-application-file-upload-url.dto.ts

```ts
import {IsIn, IsNotEmpty, Matches} from 'class-validator';

/**
 * 업체 정보 파일 업로드 주소 path param
 */
export class StoreApplicationFileUploadUrlParamDto {
    /** 입점 신청 ID */
    @Matches(/^[a-f0-9]{32}$/, {message: '입점 신청 ID가 올바르지 않습니다.'})
    @IsNotEmpty({message: '입점 신청 ID를 입력해주세요.'})
    store_application_id: string;
}

/**
 * 업체 정보 파일 업로드 주소 요청 — 대기 중 내 신청만
 */
export class StoreApplicationFileUploadUrlDto {
    /** 용도 (BUSINESS_LICENSE: 사업자등록증 1장, STORE_IMAGE: 업체 사진 5장까지) — 값: BUSINESS_LICENSE · STORE_IMAGE */
    @IsIn(['BUSINESS_LICENSE', 'STORE_IMAGE'], {message: '파일 용도가 올바르지 않습니다.'})
    @IsNotEmpty({message: '파일 용도를 입력해주세요.'})
    store_file_purpose_id: string;

    /** 올릴 파일의 MIME 타입 — 업로드할 때 같은 Content-Type 헤더로 PUT 한다 — 값: image/jpeg · image/png */
    @IsIn(['image/jpeg', 'image/png'], {message: 'JPG · PNG 사진만 올릴 수 있습니다.'})
    @IsNotEmpty({message: '파일 형식을 입력해주세요.'})
    content_type: string;
}

/**
 * 업체 정보 파일 업로드 주소 — 이 주소로 PUT 한 뒤 file_key 로 파일을 등록한다
 */
export class StoreApplicationFileUploadUrlResultDto {
    /** 저장 키 — 파일 등록 때 보낸다 */
    file_key: string;

    /** 업로드 주소 (PUT, 10분 유효) */
    upload_url: string;

    /** 업로드 주소 만료일시 (ISO 8601) */
    expires_at: string;
}
```

## store/dto/store-application-file.dto.ts

```ts
import {IsIn, IsNotEmpty, Matches, MaxLength} from 'class-validator';

/**
 * 업체 정보 파일 등록 path param
 */
export class StoreApplicationFileParamDto {
    /** 입점 신청 ID */
    @Matches(/^[a-f0-9]{32}$/, {message: '입점 신청 ID가 올바르지 않습니다.'})
    @IsNotEmpty({message: '입점 신청 ID를 입력해주세요.'})
    store_application_id: string;
}

/**
 * 업체 정보 파일 등록 — 업로드 주소로 올린 파일의 키를 신청에 붙인다(대기 중 내 신청만)
 */
export class StoreApplicationFileDto {
    /** 용도 (BUSINESS_LICENSE · STORE_IMAGE) — 업로드 주소를 받을 때와 같다 — 값: BUSINESS_LICENSE · STORE_IMAGE */
    @IsIn(['BUSINESS_LICENSE', 'STORE_IMAGE'], {message: '파일 용도가 올바르지 않습니다.'})
    @IsNotEmpty({message: '파일 용도를 입력해주세요.'})
    store_file_purpose_id: string;

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
 * 업체 정보 파일 등록 결과
 */
export class StoreApplicationFileResultDto {
    /** 업체 정보 파일 ID */
    store_file_id: string;
}
```

## store/dto/store-application-list.dto.ts

```ts
import {IsIn, IsOptional, MaxLength} from 'class-validator';
import {PaginationDto, PaginationResultDto} from '../../common/pagination.dto';

/**
 * 입점 신청 목록 query (총관리자) — 상태 · 검색어(상호명 · 사업자등록번호 부분 일치)
 */
export class StoreApplicationListDto extends PaginationDto {
    /** 신청 상태 (WAIT · APPROVED · REJECTED) — 없으면 전체 */
    @IsOptional()
    @IsIn(['WAIT', 'APPROVED', 'REJECTED'], {message: '신청 상태가 올바르지 않습니다.'})
    store_application_state_id: string | null;

    /** 검색어 — 상호명 · 사업자등록번호 부분 일치 */
    @IsOptional()
    @MaxLength(100, {message: '검색어는 100자 이내로 입력해주세요.'})
    keyword: string | null;

    /**
     * @param data 요청 쿼리 — 빠진 페이지 값은 PaginationDto 기본값, 빠진 필터는 null
     */
    constructor(data?: Partial<StoreApplicationListDto>) {
        super(data);
        this.store_application_state_id = data?.store_application_state_id ?? null;
        this.keyword = data?.keyword ?? null;
    }
}

/**
 * 입점 신청 목록 항목 (총관리자)
 */
export class StoreApplicationListItemResultDto {
    /** 입점 신청 ID */
    store_application_id: string;

    /** 신청한 이용자 ID */
    user_id: string;

    /** 신청 상태 (WAIT · APPROVED · REJECTED) */
    store_application_state_id: string;

    /** 상호명 */
    store_name: string;

    /** 사업자등록번호 */
    business_number: string;

    /** 대표자명 */
    owner_name: string;

    /** 승인으로 만든 업체 ID (승인 전 null) */
    store_id: string | null;

    /** 처리일시 (ISO 8601) */
    reviewed_at: string | null;

    /** 신청일시 (ISO 8601) */
    created_at: string;
}

/**
 * 입점 신청 목록 (총관리자)
 */
export class StoreApplicationListResultDto {
    /** 목록 (신청일 최신순) */
    list: StoreApplicationListItemResultDto[];

    /** 페이지 정보 */
    pagination: PaginationResultDto;
}
```

## store/dto/store-application-reject.dto.ts

```ts
import {IsNotEmpty, Matches, MaxLength} from 'class-validator';

/**
 * 입점 반려 path param (총관리자)
 */
export class StoreApplicationRejectParamDto {
    /** 입점 신청 ID */
    @Matches(/^[a-f0-9]{32}$/, {message: '입점 신청 ID가 올바르지 않습니다.'})
    @IsNotEmpty({message: '입점 신청 ID를 입력해주세요.'})
    store_application_id: string;
}

/**
 * 입점 반려 — 사유 필수
 */
export class StoreApplicationRejectDto {
    /** 반려 사유 — 신청자가 내 신청에서 본다 */
    @MaxLength(255, {message: '반려 사유는 255자 이내로 입력해주세요.'})
    @IsNotEmpty({message: '반려 사유를 입력해주세요.'})
    reject_comment: string;
}
```

## store/dto/store-application.dto.ts

```ts
import {IsLatitude, IsLongitude, IsNotEmpty, IsOptional, Matches, MaxLength} from 'class-validator';

/**
 * 입점 신청 — 업체 정보 (이용자). 업체 정보 파일은 신청 뒤 따로 붙인다. 위경도는 클라이언트가 주소 검색으로 구해 보낸다.
 * 대표자가 업체 총관리자다 — 승인 때 대표자명 · 대표자 휴대폰 번호로 매니저 계정을 만든다.
 */
export class StoreApplicationDto {
    /** 상호명 */
    @MaxLength(100, {message: '상호명은 100자 이내로 입력해주세요.'})
    @IsNotEmpty({message: '상호명을 입력해주세요.'})
    store_name: string;

    /** 사업자등록번호 (숫자 10자리) */
    @Matches(/^\d{10}$/, {message: '사업자등록번호 10자리를 숫자만 입력해주세요.'})
    @IsNotEmpty({message: '사업자등록번호를 입력해주세요.'})
    business_number: string;

    /** 대표자명 — 승인 때 업체 총관리자 계정의 이름 */
    @MaxLength(50, {message: '대표자명은 50자 이내로 입력해주세요.'})
    @IsNotEmpty({message: '대표자명을 입력해주세요.'})
    owner_name: string;

    /** 대표자 휴대폰 번호 (숫자만) — 승인 때 업체 총관리자 계정 · 안내 SMS */
    @Matches(/^01[016789]\d{7,8}$/, {message: '대표자 휴대폰 번호를 숫자만 정확히 입력해주세요.'})
    @IsNotEmpty({message: '대표자 휴대폰 번호를 입력해주세요.'})
    owner_phone: string;

    /** 업체 총관리자 아이디 (영문 · 숫자 · _ 4~30자) — 승인 때 이 아이디로 업체 총관리자 계정을 만든다 */
    @Matches(/^[a-zA-Z0-9_]{4,30}$/, {message: '아이디는 영문 · 숫자 · _ 4~30자로 입력해주세요.'})
    @IsNotEmpty({message: '업체 총관리자 아이디를 입력해주세요.'})
    head_manager_login_id: string;

    /** 업체 총관리자 비밀번호 (8~20자, 영문+숫자 필수, 특수문자 !@#$%^&* 허용) — 해시로만 저장한다 */
    @Matches(/^(?=.*[a-zA-Z])(?=.*\d)[a-zA-Z0-9!@#$%^&*]{8,20}$/, {message: '비밀번호는 8~20자이며 영문과 숫자를 반드시 포함해야 합니다. (특수문자는 !@#$%^&* 만 허용)'})
    @IsNotEmpty({message: '업체 총관리자 비밀번호를 입력해주세요.'})
    head_manager_login_pw: string;

    /** 업체 연락처 (숫자만) */
    @Matches(/^\d{8,11}$/, {message: '업체 연락처를 숫자만 정확히 입력해주세요.'})
    @IsNotEmpty({message: '업체 연락처를 입력해주세요.'})
    phone: string;

    /** 주소 */
    @MaxLength(255, {message: '주소는 255자 이내로 입력해주세요.'})
    @IsNotEmpty({message: '주소를 입력해주세요.'})
    address: string;

    /** 상세주소 */
    @IsOptional()
    @MaxLength(255, {message: '상세주소는 255자 이내로 입력해주세요.'})
    address_detail?: string;

    /** 위도 (WGS84) */
    @IsLatitude({message: '위도가 올바르지 않습니다.'})
    @IsNotEmpty({message: '위도를 입력해주세요.'})
    latitude: number;

    /** 경도 (WGS84) */
    @IsLongitude({message: '경도가 올바르지 않습니다.'})
    @IsNotEmpty({message: '경도를 입력해주세요.'})
    longitude: number;

    /** 신청 메모 */
    @IsOptional()
    @MaxLength(500, {message: '신청 메모는 500자 이내로 입력해주세요.'})
    application_comment?: string;
}

/**
 * 입점 신청 결과
 */
export class StoreApplicationResultDto {
    /** 입점 신청 ID — 업체 정보 파일을 붙일 때 쓴다 */
    store_application_id: string;
}
```

## store/dto/store-detail.dto.ts

```ts
import {IsNotEmpty, Matches} from 'class-validator';

/**
 * 업체 상세 path param (총관리자)
 */
export class StoreDetailParamDto {
    /** 업체 ID */
    @Matches(/^[a-f0-9]{32}$/, {message: '업체 ID가 올바르지 않습니다.'})
    @IsNotEmpty({message: '업체 ID를 입력해주세요.'})
    store_id: string;
}

/**
 * 업체 정보 파일 (총관리자 — 사업자등록증 · 업체 사진)
 */
export class StoreDetailFileResultDto {
    /** 업체 정보 파일 ID */
    store_file_id: string;

    /** 용도 (BUSINESS_LICENSE · STORE_IMAGE) */
    store_file_purpose_id: string;

    /** 원본 파일명 */
    file_name: string;

    /** MIME 타입 */
    content_type: string;

    /** 비공개 여부 (1: 서명된 열람 주소 · 10분 유효, 0: CDN 공개 주소) */
    is_private: number;

    /** 열람 주소 */
    file_url: string;

    /** 정렬 순서 (업체 사진은 0 이 대표) */
    sort_order: number;

    /** 등록일시 (ISO 8601) */
    created_at: string;
}

/**
 * 업체 상세 (총관리자)
 */
export class StoreDetailResultDto {
    /** 업체 ID */
    store_id: string;

    /** 업체코드 (매니저 로그인 · 매니저 화면 주소) */
    store_code: string;

    /** 업체 상태 (ACTIVE · SUSPEND · LEAVE) */
    store_state_id: string;

    /** 상호명 */
    store_name: string;

    /** 사업자등록번호 */
    business_number: string;

    /** 대표자명 */
    owner_name: string;

    /** 업체 연락처 */
    phone: string;

    /** 주소 */
    address: string;

    /** 상세주소 */
    address_detail: string | null;

    /** 위도 */
    latitude: number;

    /** 경도 */
    longitude: number;

    /** 업체 소개 */
    introduction: string | null;

    /** 24시간 연중무휴 여부 (0 · 1) */
    is_always_open: number;

    /** 영업중 여부 (0: 영업중 아님 · 영업준비, 1: 영업중) */
    is_open: number;

    /** 정비시간(분) */
    maintenance_minutes: number;

    /** 예약 가능 시작(시간) — 이용 시작 n시간 전부터 예약 */
    booking_open_hours: number;

    /** 100% 환불 마감(분) — 이용 시작 n분 전까지 취소하면 100% 환불 */
    refund_deadline_minutes: number;

    /** 마감 뒤 환불 비율(%) — 환불 마감 뒤 ~ 이용 시작 전 취소 */
    late_refund_percent: number;

    /** 정지 사유 (영업중지일 때만) */
    suspend_comment: string | null;

    /** 등록일시 (ISO 8601) */
    created_at: string;

    /** 수정일시 (ISO 8601) */
    updated_at: string;

    /** 업체 정보 파일 (용도 · 정렬 순서) */
    files: StoreDetailFileResultDto[];
}
```

## store/dto/store-list.dto.ts

```ts
import {IsIn, IsOptional, MaxLength} from 'class-validator';
import {PaginationDto, PaginationResultDto} from '../../common/pagination.dto';

/**
 * 업체 목록 query (총관리자) — 상태 · 검색어(상호명 · 사업자등록번호 · 대표자명 부분 일치)
 */
export class StoreListDto extends PaginationDto {
    /** 업체 상태 (ACTIVE · SUSPEND · LEAVE) — 없으면 전체 */
    @IsOptional()
    @IsIn(['ACTIVE', 'SUSPEND', 'LEAVE'], {message: '업체 상태가 올바르지 않습니다.'})
    store_state_id: string | null;

    /** 검색어 — 상호명 · 사업자등록번호 · 대표자명 부분 일치 */
    @IsOptional()
    @MaxLength(100, {message: '검색어는 100자 이내로 입력해주세요.'})
    keyword: string | null;

    /**
     * @param data 요청 쿼리 — 빠진 페이지 값은 PaginationDto 기본값, 빠진 필터는 null
     */
    constructor(data?: Partial<StoreListDto>) {
        super(data);
        this.store_state_id = data?.store_state_id ?? null;
        this.keyword = data?.keyword ?? null;
    }
}

/**
 * 업체 목록 항목
 */
export class StoreListItemResultDto {
    /** 업체 ID */
    store_id: string;

    /** 업체코드 (매니저 로그인 · 매니저 화면 주소) */
    store_code: string;

    /** 업체 상태 (ACTIVE · SUSPEND · LEAVE) */
    store_state_id: string;

    /** 상호명 */
    store_name: string;

    /** 사업자등록번호 (탈퇴 업체는 DELETE_<store_id>) */
    business_number: string;

    /** 대표자명 */
    owner_name: string;

    /** 업체 연락처 */
    phone: string;

    /** 주소 */
    address: string;

    /** 영업중 여부 (0: 영업중 아님 · 영업준비, 1: 영업중) */
    is_open: number;

    /** 등록일시 (ISO 8601) */
    created_at: string;
}

/**
 * 업체 목록
 */
export class StoreListResultDto {
    /** 목록 (등록일 최신순) */
    list: StoreListItemResultDto[];

    /** 페이지 정보 */
    pagination: PaginationResultDto;
}
```

## store/dto/store-mine-breaks.dto.ts

```ts
import {Type} from 'class-transformer';
import {ArrayMaxSize, IsArray, IsNotEmpty, Matches, ValidateNested} from 'class-validator';

/**
 * 브레이크타임 1개 — 매일 같은 시각. 마감이 시작보다 이르면 다음 날까지(23:00 ~ 02:00)
 */
export class StoreMineBreakDto {
    /** 브레이크 시작 시각 (HH:mm, 한국 시각) */
    @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, {message: '브레이크 시작 시각을 HH:mm 으로 입력해주세요.'})
    @IsNotEmpty({message: '브레이크 시작 시각을 입력해주세요.'})
    start_time: string;

    /** 브레이크 마감 시각 (HH:mm — 시작보다 이르면 다음 날) */
    @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, {message: '브레이크 마감 시각을 HH:mm 으로 입력해주세요.'})
    @IsNotEmpty({message: '브레이크 마감 시각을 입력해주세요.'})
    end_time: string;
}

/**
 * 내 업체 브레이크타임 설정 — 통째로 교체(빈 배열이면 모두 지운다). 서로 겹치면 안 된다(끝점이 맞닿는 것은 된다)
 */
export class StoreMineBreaksDto {
    /** 브레이크타임 (매일 · 10개까지 · 서로 겹치면 400) */
    @Type(() => StoreMineBreakDto)
    @ValidateNested({each: true, message: '브레이크타임 형식이 올바르지 않습니다.'})
    @ArrayMaxSize(10, {message: '브레이크타임은 10개까지 입력할 수 있습니다.'})
    @IsArray({message: '브레이크타임을 배열로 입력해주세요.'})
    @IsNotEmpty({message: '브레이크타임을 입력해주세요.'})
    breaks: StoreMineBreakDto[];
}
```

## store/dto/store-mine-door-secret.dto.ts

```ts
import {IsNotEmpty, Matches} from 'class-validator';

/**
 * 내 업체 문 소켓 시크릿 코드 — 업체 총관리자만. bcrypt 해시로 저장하고 원문은 돌려주지 않는다(잊으면 새로 정한다).
 * 바꿔도 이미 붙어 있는 소켓은 끊지 않는다 — 다음 접속부터 새 코드
 */
export class StoreMineDoorSecretDto {
    /** 시크릿 코드 (영문 · 숫자 16 ~ 64자 — 문 쪽 프로그램이 소켓 접속 헤더 x-store-secret 으로 보낸다) */
    @Matches(/^[A-Za-z0-9]{16,64}$/, {message: '시크릿 코드는 영문 · 숫자 16 ~ 64자로 입력해주세요.'})
    @IsNotEmpty({message: '시크릿 코드를 입력해주세요.'})
    door_secret: string;
}
```

## store/dto/store-mine-file-delete.dto.ts

```ts
import {IsNotEmpty, Matches} from 'class-validator';

/**
 * 내 업체 사진 삭제 path param — 업체 사진만(사업자등록증은 지울 수 없다)
 */
export class StoreMineFileDeleteParamDto {
    /** 업체 정보 파일 ID */
    @Matches(/^[a-f0-9]{32}$/, {message: '업체 정보 파일 ID가 올바르지 않습니다.'})
    @IsNotEmpty({message: '업체 정보 파일 ID를 입력해주세요.'})
    store_file_id: string;
}
```

## store/dto/store-mine-file-order.dto.ts

```ts
import {ArrayMaxSize, IsArray, IsNotEmpty, Matches} from 'class-validator';

/**
 * 내 업체 사진 순서 변경 — 지금 업체 사진 ID 전부를 원하는 순서로(가장 앞이 대표)
 */
export class StoreMineFileOrderDto {
    /** 업체 사진 ID 전부를 원하는 순서로 — 빠지거나 남거나 겹치면 400 */
    @Matches(/^[a-f0-9]{32}$/, {each: true, message: '업체 사진 ID가 올바르지 않습니다.'})
    @ArrayMaxSize(5, {message: '업체 사진은 5장까지입니다.'})
    @IsArray({message: '업체 사진 ID를 배열로 입력해주세요.'})
    @IsNotEmpty({message: '업체 사진 ID를 입력해주세요.'})
    store_file_ids: string[];
}
```

## store/dto/store-mine-file-upload-url.dto.ts

```ts
import {IsIn, IsNotEmpty} from 'class-validator';

/**
 * 내 업체 사진 업로드 주소 요청 — 업체 사진 5장까지(승인 때 넘어온 사진 포함)
 */
export class StoreMineFileUploadUrlDto {
    /** 올릴 사진의 MIME 타입 — 업로드할 때 같은 Content-Type 헤더로 PUT 한다 — 값: image/jpeg · image/png */
    @IsIn(['image/jpeg', 'image/png'], {message: 'JPG · PNG 사진만 올릴 수 있습니다.'})
    @IsNotEmpty({message: '파일 형식을 입력해주세요.'})
    content_type: string;
}

/**
 * 내 업체 사진 업로드 주소 — 이 주소로 PUT 한 뒤 file_key 로 사진을 등록한다
 */
export class StoreMineFileUploadUrlResultDto {
    /** 저장 키 — 사진 등록 때 보낸다 */
    file_key: string;

    /** 업로드 주소 (PUT, 10분 유효) */
    upload_url: string;

    /** 업로드 주소 만료일시 (ISO 8601) */
    expires_at: string;
}
```

## store/dto/store-mine-file.dto.ts

```ts
import {IsIn, IsNotEmpty, MaxLength} from 'class-validator';

/**
 * 내 업체 사진 등록 — 업로드 주소로 올린 사진의 키를 업체에 붙인다(마지막 순서)
 */
export class StoreMineFileDto {
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
 * 내 업체 사진 등록 결과
 */
export class StoreMineFileResultDto {
    /** 업체 정보 파일 ID */
    store_file_id: string;
}
```

## store/dto/store-mine-hours.dto.ts

```ts
import {Type} from 'class-transformer';
import {ArrayMaxSize, IsArray, IsIn, IsNotEmpty, Matches, ValidateIf, ValidateNested} from 'class-validator';

/**
 * 요일 영업시간 1개 — 휴무가 아니면 시작 · 마감 시각이 세트로 필수(t_store_hour CHK_StoreHour_OpenCloseTime). 휴무면 보낸 시각은 버린다
 */
export class StoreMineHourDto {
    /** 요일 (0: 일 ~ 6: 토) — 값: 0 · 1 · 2 · 3 · 4 · 5 · 6 */
    @IsIn([0, 1, 2, 3, 4, 5, 6], {message: '요일이 올바르지 않습니다.'})
    @IsNotEmpty({message: '요일을 입력해주세요.'})
    day_of_week: number;

    /** 휴무 여부 (0: 영업, 1: 휴무) — 값: 0 · 1 */
    @IsIn([0, 1], {message: '휴무 여부가 올바르지 않습니다.'})
    @IsNotEmpty({message: '휴무 여부를 입력해주세요.'})
    is_closed: number;

    // open_time / close_time 한 세트: 휴무가 아니면 둘 다 받는다. 휴무면 검증하지 않는다(service 가 NULL 로 저장)
    /** 영업 시작 시각 (HH:mm, 한국 시각) — 휴무가 아니면 close_time 과 세트로 필수 */
    @ValidateIf((o) => o.is_closed !== 1)
    @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, {message: '영업 시작 시각을 HH:mm 으로 입력해주세요.'})
    @IsNotEmpty({message: '휴무가 아니면 영업 시작 시각을 입력해주세요.'})
    open_time?: string;

    /** 영업 마감 시각 (HH:mm — 시작보다 이르면 다음 날 마감) — 휴무가 아니면 open_time 과 세트로 필수 */
    @ValidateIf((o) => o.is_closed !== 1)
    @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, {message: '영업 마감 시각을 HH:mm 으로 입력해주세요.'})
    @IsNotEmpty({message: '휴무가 아니면 영업 마감 시각을 입력해주세요.'})
    close_time?: string;
}

/**
 * 내 업체 영업시간 설정 — 통째로 교체. 연중무휴 1 이면 요일별 영업시간을 비우고, 0 이면 일 ~ 토 7개를 한 번씩 보낸다
 */
export class StoreMineHoursDto {
    /** 24시간 연중무휴 여부 (0: 요일별 영업시간, 1: 24시간 연중무휴) — 값: 0 · 1 */
    @IsIn([0, 1], {message: '연중무휴 여부가 올바르지 않습니다.'})
    @IsNotEmpty({message: '연중무휴 여부를 입력해주세요.'})
    is_always_open: number;

    /** 요일별 영업시간 — 연중무휴 0 이면 일 ~ 토 7개, 1 이면 빈 배열 */
    @Type(() => StoreMineHourDto)
    @ValidateNested({each: true, message: '요일별 영업시간 형식이 올바르지 않습니다.'})
    @ArrayMaxSize(7, {message: '요일별 영업시간은 7개까지 입력할 수 있습니다.'})
    @IsArray({message: '요일별 영업시간을 배열로 입력해주세요.'})
    @IsNotEmpty({message: '요일별 영업시간을 입력해주세요.'})
    hours: StoreMineHourDto[];
}
```

## store/dto/store-mine-maintenance.dto.ts

```ts
import {IsInt, IsNotEmpty, Max, Min} from 'class-validator';

/**
 * 내 업체 정비시간 설정 — 퇴실 후 다음 이용까지 호실을 막는 분
 */
export class StoreMineMaintenanceDto {
    /** 정비시간(분, 0 ~ 240) */
    @IsInt({message: '정비시간은 분 단위 정수로 입력해주세요.'})
    @Min(0, {message: '정비시간은 0 ~ 240분 사이로 입력해주세요.'})
    @Max(240, {message: '정비시간은 0 ~ 240분 사이로 입력해주세요.'})
    @IsNotEmpty({message: '정비시간을 입력해주세요.'})
    maintenance_minutes: number;
}
```

## store/dto/store-mine-open.dto.ts

```ts
import {IsIn, IsNotEmpty} from 'class-validator';

/**
 * 내 업체 영업중 여부 변경 — 0 이면 연중무휴 · 영업시간과 무관하게 영업중 아님
 */
export class StoreMineOpenDto {
    /** 영업중 여부 (0: 영업중 아님, 1: 영업중) — 값: 0 · 1 */
    @IsIn([0, 1], {message: '영업중 여부가 올바르지 않습니다.'})
    @IsNotEmpty({message: '영업중 여부를 입력해주세요.'})
    is_open: number;
}
```

## store/dto/store-mine-profile.dto.ts

```ts
import {IsNotEmpty, IsOptional, Matches, MaxLength} from 'class-validator';

/**
 * 내 업체 소개 수정 — 소개 · 연락처. 상호명 · 주소 · 위경도 · 사업자등록번호는 총관리자가 바꾼다. 소개는 비우면 null.
 * 편의시설은 객실 그룹 상세정보(t_room_group.room_group_detail)로 옮겼다.
 */
export class StoreMineProfileDto {
    /** 업체 소개 (2,000자) */
    @IsOptional()
    @MaxLength(2000, {message: '업체 소개는 2,000자 이내로 입력해주세요.'})
    introduction?: string;

    /** 업체 연락처 (숫자만) */
    @Matches(/^\d{8,11}$/, {message: '업체 연락처를 숫자만 정확히 입력해주세요.'})
    @IsNotEmpty({message: '업체 연락처를 입력해주세요.'})
    phone: string;
}
```

## store/dto/store-mine-reservation-policy.dto.ts

```ts
import {IsInt, IsNotEmpty, Max, Min} from 'class-validator';

/**
 * 내 업체 예약 · 환불 규정 — 이용 시작 n시간 전부터 예약, n분 전까지 취소는 100% 환불, 그 뒤 ~ 이용 시작 전 취소는 비율 환불(원 단위 내림).
 * 예약할 때 마감 시각 · 비율을 예약에 저장한다 — 바꿔도 기존 예약은 그대로다
 */
export class StoreMineReservationPolicyDto {
    /** 예약 가능 시작 — 이용 시작 n시간 전부터 예약을 받는다 (1 ~ 4,320시간) */
    @IsInt({message: '예약 가능 시간은 시간 단위 정수로 입력해주세요.'})
    @Min(1, {message: '예약 가능 시간은 1 ~ 4,320시간 사이로 입력해주세요.'})
    @Max(4320, {message: '예약 가능 시간은 1 ~ 4,320시간 사이로 입력해주세요.'})
    @IsNotEmpty({message: '예약 가능 시간을 입력해주세요.'})
    booking_open_hours: number;

    /** 100% 환불 마감 — 이용 시작 n분 전까지 취소하면 100% 환불 (0 ~ 10,080분) */
    @IsInt({message: '환불 마감은 분 단위 정수로 입력해주세요.'})
    @Min(0, {message: '환불 마감은 0 ~ 10,080분 사이로 입력해주세요.'})
    @Max(10080, {message: '환불 마감은 0 ~ 10,080분 사이로 입력해주세요.'})
    @IsNotEmpty({message: '환불 마감을 입력해주세요.'})
    refund_deadline_minutes: number;

    /** 마감 뒤 환불 비율 — 환불 마감 뒤 ~ 이용 시작 전 취소의 환불 비율 (0 ~ 100%, 0 이면 환불 없이 취소) */
    @IsInt({message: '마감 뒤 환불 비율은 정수로 입력해주세요.'})
    @Min(0, {message: '마감 뒤 환불 비율은 0 ~ 100% 사이로 입력해주세요.'})
    @Max(100, {message: '마감 뒤 환불 비율은 0 ~ 100% 사이로 입력해주세요.'})
    @IsNotEmpty({message: '마감 뒤 환불 비율을 입력해주세요.'})
    late_refund_percent: number;
}
```

## store/dto/store-mine-unavailable-period-delete.dto.ts

```ts
import {IsNotEmpty, Matches} from 'class-validator';

/**
 * 내 업체 일시 예약불가 삭제 path param — 그 업체 것만(아니면 404)
 */
export class StoreMineUnavailablePeriodDeleteParamDto {
    /** 일시 예약불가 ID */
    @Matches(/^[a-f0-9]{32}$/, {message: '일시 예약불가 ID가 올바르지 않습니다.'})
    @IsNotEmpty({message: '일시 예약불가 ID를 입력해주세요.'})
    store_unavailable_period_id: string;
}
```

## store/dto/store-mine-unavailable-period-list.dto.ts

```ts
import {PaginationDto, PaginationResultDto} from '../../common/pagination.dto';

/**
 * 내 업체 일시 예약불가 목록 query — 페이지만. 끝나지 않은 것(종료 일시가 지금 이후)만, 시작 순
 */
export class StoreMineUnavailablePeriodListDto extends PaginationDto {
    /**
     * @param data 요청 쿼리 — 빠진 페이지 값은 PaginationDto 기본값
     */
    constructor(data?: Partial<StoreMineUnavailablePeriodListDto>) {
        super(data);
    }
}

/**
 * 일시 예약불가 목록 항목
 */
export class StoreMineUnavailablePeriodItemResultDto {
    /** 일시 예약불가 ID */
    store_unavailable_period_id: string;

    /** 시작 일시 (ISO 8601) */
    starts_at: string;

    /** 종료 일시 (ISO 8601 — 이 시각부터 다시 예약을 받는다) */
    ends_at: string;

    /** 메모 (간단한 사유) */
    memo: string | null;

    /** 등록일시 (ISO 8601) */
    created_at: string;
}

/**
 * 일시 예약불가 목록
 */
export class StoreMineUnavailablePeriodListResultDto {
    /** 목록 (시작 순) */
    list: StoreMineUnavailablePeriodItemResultDto[];

    /** 페이지 정보 */
    pagination: PaginationResultDto;
}
```

## store/dto/store-mine-unavailable-period.dto.ts

```ts
import {IsNotEmpty, IsOptional, Matches, MaxLength} from 'class-validator';

/**
 * 내 업체 일시 예약불가 등록 — 시작 일시 ~ 종료 일시(한국 시각 분 단위) 동안 예약을 받지 않는다. 다른 일시 예약불가와 겹치면 400
 */
export class StoreMineUnavailablePeriodDto {
    /** 시작 일시 (YYYY-MM-DD HH:mm, 한국 시각) */
    @Matches(/^\d{4}-\d{2}-\d{2} ([01]\d|2[0-3]):[0-5]\d$/, {message: '시작 일시를 YYYY-MM-DD HH:mm 으로 입력해주세요.'})
    @IsNotEmpty({message: '시작 일시를 입력해주세요.'})
    starts_at: string;

    /** 종료 일시 (YYYY-MM-DD HH:mm, 한국 시각 — 시작보다 늦고 지금 이후, 이 시각부터 다시 예약을 받는다) */
    @Matches(/^\d{4}-\d{2}-\d{2} ([01]\d|2[0-3]):[0-5]\d$/, {message: '종료 일시를 YYYY-MM-DD HH:mm 으로 입력해주세요.'})
    @IsNotEmpty({message: '종료 일시를 입력해주세요.'})
    ends_at: string;

    /** 메모 (30자 — 간단한 사유, 예: 내부 공사) */
    @IsOptional()
    @MaxLength(30, {message: '메모는 30자 이내로 입력해주세요.'})
    memo?: string;
}

/**
 * 일시 예약불가 등록 결과
 */
export class StoreMineUnavailablePeriodResultDto {
    /** 일시 예약불가 ID */
    store_unavailable_period_id: string;
}
```

## store/dto/store-mine.dto.ts

```ts
/**
 * 내 업체의 업체 정보 파일 (사업자등록증 · 업체 사진)
 */
export class StoreMineFileItemResultDto {
    /** 업체 정보 파일 ID */
    store_file_id: string;

    /** 용도 (BUSINESS_LICENSE · STORE_IMAGE) */
    store_file_purpose_id: string;

    /** 원본 파일명 */
    file_name: string;

    /** MIME 타입 */
    content_type: string;

    /** 비공개 여부 (1: 서명된 열람 주소 · 10분 유효, 0: CDN 공개 주소) */
    is_private: number;

    /** 열람 주소 */
    file_url: string;

    /** 정렬 순서 (업체 사진은 가장 앞이 대표) */
    sort_order: number;

    /** 등록일시 (ISO 8601) */
    created_at: string;
}

/**
 * 내 업체의 요일 영업시간
 */
export class StoreMineHourItemResultDto {
    /** 요일 (0: 일 ~ 6: 토) */
    day_of_week: number;

    /** 휴무 여부 (0: 영업, 1: 휴무) */
    is_closed: number;

    /** 영업 시작 시각 (HH:mm, 한국 시각) — 휴무면 null */
    open_time: string | null;

    /** 영업 마감 시각 (HH:mm — 시작보다 이르면 다음 날) — 휴무면 null */
    close_time: string | null;
}

/**
 * 내 업체의 브레이크타임 (매일)
 */
export class StoreMineBreakItemResultDto {
    /** 브레이크타임 ID */
    store_break_id: string;

    /** 시작 시각 (HH:mm, 한국 시각) */
    start_time: string;

    /** 마감 시각 (HH:mm — 시작보다 이르면 다음 날) */
    end_time: string;
}

/**
 * 내 업체 상세 (업체 관리자)
 */
export class StoreMineResultDto {
    /** 업체 ID */
    store_id: string;

    /** 업체코드 (매니저 로그인 · 매니저 화면 주소) */
    store_code: string;

    /** 업체 상태 (ACTIVE · SUSPEND) */
    store_state_id: string;

    /** 상호명 */
    store_name: string;

    /** 사업자등록번호 */
    business_number: string;

    /** 대표자명 */
    owner_name: string;

    /** 업체 연락처 */
    phone: string;

    /** 주소 */
    address: string;

    /** 상세주소 */
    address_detail: string | null;

    /** 위도 */
    latitude: number;

    /** 경도 */
    longitude: number;

    /** 업체 소개 */
    introduction: string | null;

    /** 24시간 연중무휴 여부 (0 · 1 — 1 이면 요일별 영업시간이 비어 있다) */
    is_always_open: number;

    /** 영업중 여부 (0: 영업중 아님, 1: 영업중) */
    is_open: number;

    /** 정비시간(분) */
    maintenance_minutes: number;

    /** 예약 가능 시작(시간) — 이용 시작 n시간 전부터 예약 */
    booking_open_hours: number;

    /** 100% 환불 마감(분) — 이용 시작 n분 전까지 취소하면 100% 환불 */
    refund_deadline_minutes: number;

    /** 마감 뒤 환불 비율(%) — 환불 마감 뒤 ~ 이용 시작 전 취소 */
    late_refund_percent: number;

    /** 문 소켓 시크릿 코드 설정 여부 (0: 안 함 — 문 쪽 프로그램이 소켓에 붙을 수 없다, 1: 설정함 — 원문은 볼 수 없다) */
    is_door_secret_set: number;

    /** 정지 사유 (영업중지일 때만) */
    suspend_comment: string | null;

    /** 요일별 영업시간 (일 ~ 토 순) */
    hours: StoreMineHourItemResultDto[];

    /** 브레이크타임 (매일 · 시작 시각 순) */
    breaks: StoreMineBreakItemResultDto[];

    /** 업체 정보 파일 (용도 · 정렬 순서) */
    files: StoreMineFileItemResultDto[];

    /** 수정일시 (ISO 8601) */
    updated_at: string;
}
```

## store/dto/store-my-application-list.dto.ts

```ts
import {PaginationDto, PaginationResultDto} from '../../common/pagination.dto';

/**
 * 내 입점 신청 목록 query — 페이지만. 대기 · 반려 · 승인 모두 나온다(승인 신청은 업체코드 포함).
 */
export class StoreMyApplicationListDto extends PaginationDto {
    /**
     * @param data 요청 쿼리 — 빠진 페이지 값은 PaginationDto 기본값
     */
    constructor(data?: Partial<StoreMyApplicationListDto>) {
        super(data);
    }
}

/**
 * 내 입점 신청 목록 항목
 */
export class StoreMyApplicationItemResultDto {
    /** 입점 신청 ID */
    store_application_id: string;

    /** 신청 상태 (WAIT: 대기, REJECTED: 반려) */
    store_application_state_id: string;

    /** 상호명 */
    store_name: string;

    /** 사업자등록번호 */
    business_number: string;

    /** 반려 사유 (반려가 아니면 null) */
    reject_comment: string | null;

    /** 처리일시 (ISO 8601, 대기면 null) */
    reviewed_at: string | null;

    /** 신청일시 (ISO 8601) */
    created_at: string;

    /** 업체코드 — 승인 신청이면 그 업체의 코드(매니저 로그인 · 매니저 화면 주소), 아니면 null */
    store_code: string | null;
}

/**
 * 내 입점 신청 목록
 */
export class StoreMyApplicationListResultDto {
    /** 목록 (신청일 최신순) */
    list: StoreMyApplicationItemResultDto[];

    /** 페이지 정보 */
    pagination: PaginationResultDto;
}
```

## store/dto/store-my-application.dto.ts

```ts
import {IsNotEmpty, Matches} from 'class-validator';

/**
 * 내 입점 신청 상세 path param
 */
export class StoreMyApplicationParamDto {
    /** 입점 신청 ID */
    @Matches(/^[a-f0-9]{32}$/, {message: '입점 신청 ID가 올바르지 않습니다.'})
    @IsNotEmpty({message: '입점 신청 ID를 입력해주세요.'})
    store_application_id: string;
}

/**
 * 내 입점 신청의 업체 정보 파일
 */
export class StoreMyApplicationFileResultDto {
    /** 업체 정보 파일 ID */
    store_file_id: string;

    /** 용도 (BUSINESS_LICENSE: 사업자등록증, STORE_IMAGE: 업체 사진) */
    store_file_purpose_id: string;

    /** 원본 파일명 */
    file_name: string;

    /** MIME 타입 */
    content_type: string;

    /** 비공개 여부 (1: 서명된 열람 주소 · 10분 유효, 0: CDN 공개 주소) */
    is_private: number;

    /** 열람 주소 */
    file_url: string;

    /** 등록일시 (ISO 8601) */
    created_at: string;
}

/**
 * 내 입점 신청 상세 — 모든 상태(승인 신청은 업체코드 포함), 남의 신청은 404
 */
export class StoreMyApplicationResultDto {
    /** 입점 신청 ID */
    store_application_id: string;

    /** 신청 상태 (WAIT · REJECTED) */
    store_application_state_id: string;

    /** 상호명 */
    store_name: string;

    /** 사업자등록번호 */
    business_number: string;

    /** 대표자명 */
    owner_name: string;

    /** 대표자 휴대폰 번호 — 업체 총관리자 계정 */
    owner_phone: string;

    /** 업체 총관리자 아이디 */
    head_manager_login_id: string;

    /** 업체 연락처 */
    phone: string;

    /** 주소 */
    address: string;

    /** 상세주소 */
    address_detail: string | null;

    /** 위도 */
    latitude: number;

    /** 경도 */
    longitude: number;

    /** 신청 메모 */
    application_comment: string | null;

    /** 반려 사유 */
    reject_comment: string | null;

    /** 처리일시 (ISO 8601) */
    reviewed_at: string | null;

    /** 신청일시 (ISO 8601) */
    created_at: string;

    /** 업체코드 — 승인 신청이면 그 업체의 코드, 아니면 null */
    store_code: string | null;

    /** 업체 정보 파일 (용도 · 정렬 순서) */
    files: StoreMyApplicationFileResultDto[];
}
```

## store/dto/store-open.dto.ts

```ts
import {IsIn, IsNotEmpty, Matches} from 'class-validator';

/**
 * 업체 영업중 여부 변경 path param (총관리자 · 관리자)
 */
export class StoreOpenParamDto {
    /** 업체 ID */
    @Matches(/^[a-f0-9]{32}$/, {message: '업체 ID가 올바르지 않습니다.'})
    @IsNotEmpty({message: '업체 ID를 입력해주세요.'})
    store_id: string;
}

/**
 * 업체 영업중 여부 변경 (총관리자 · 관리자) — 0 이면 연중무휴 · 영업시간과 무관하게 영업중 아님
 */
export class StoreOpenDto {
    /** 영업중 여부 (0: 영업중 아님, 1: 영업중) — 값: 0 · 1 */
    @IsIn([0, 1], {message: '영업중 여부가 올바르지 않습니다.'})
    @IsNotEmpty({message: '영업중 여부를 입력해주세요.'})
    is_open: number;
}
```

## store/dto/store-state.dto.ts

```ts
import {IsIn, IsNotEmpty, IsOptional, Matches, MaxLength} from 'class-validator';

/**
 * 업체 상태 변경 path param (총관리자)
 */
export class StoreStateParamDto {
    /** 업체 ID */
    @Matches(/^[a-f0-9]{32}$/, {message: '업체 ID가 올바르지 않습니다.'})
    @IsNotEmpty({message: '업체 ID를 입력해주세요.'})
    store_id: string;
}

/**
 * 업체 상태 변경 — 탈퇴(LEAVE)는 되돌릴 수 없고 그 업체 매니저 계정을 정지한다. 영업중지(SUSPEND)면 정지 사유를 남길 수 있다
 */
export class StoreStateDto {
    /** 바꿀 상태 (ACTIVE: 활성, SUSPEND: 영업중지, LEAVE: 탈퇴) — 값: ACTIVE · SUSPEND · LEAVE */
    @IsIn(['ACTIVE', 'SUSPEND', 'LEAVE'], {message: '업체 상태가 올바르지 않습니다.'})
    @IsNotEmpty({message: '업체 상태를 입력해주세요.'})
    store_state_id: string;

    /** 정지 사유 (영업중지로 바꿀 때만 남는다 — 업체 관리자의 내 업체 상세에 보인다, 255자) */
    @IsOptional()
    @MaxLength(255, {message: '정지 사유는 255자 이내로 입력해주세요.'})
    suspend_comment?: string;
}
```

## store/dto/store-update.dto.ts

```ts
import {IsLatitude, IsLongitude, IsNotEmpty, IsOptional, Matches, MaxLength} from 'class-validator';

/**
 * 업체 정보 수정 path param (총관리자)
 */
export class StoreUpdateParamDto {
    /** 업체 ID */
    @Matches(/^[a-f0-9]{32}$/, {message: '업체 ID가 올바르지 않습니다.'})
    @IsNotEmpty({message: '업체 ID를 입력해주세요.'})
    store_id: string;
}

/**
 * 업체 정보 수정 — 사업자등록번호는 바꾸지 않는다. 상세주소는 비우면 null
 */
export class StoreUpdateDto {
    /** 상호명 */
    @MaxLength(100, {message: '상호명은 100자 이내로 입력해주세요.'})
    @IsNotEmpty({message: '상호명을 입력해주세요.'})
    store_name: string;

    /** 대표자명 */
    @MaxLength(50, {message: '대표자명은 50자 이내로 입력해주세요.'})
    @IsNotEmpty({message: '대표자명을 입력해주세요.'})
    owner_name: string;

    /** 업체 연락처 (숫자만) */
    @Matches(/^\d{8,11}$/, {message: '업체 연락처를 숫자만 정확히 입력해주세요.'})
    @IsNotEmpty({message: '업체 연락처를 입력해주세요.'})
    phone: string;

    /** 주소 */
    @MaxLength(255, {message: '주소는 255자 이내로 입력해주세요.'})
    @IsNotEmpty({message: '주소를 입력해주세요.'})
    address: string;

    /** 상세주소 */
    @IsOptional()
    @MaxLength(255, {message: '상세주소는 255자 이내로 입력해주세요.'})
    address_detail?: string;

    /** 위도 (WGS84) */
    @IsLatitude({message: '위도가 올바르지 않습니다.'})
    @IsNotEmpty({message: '위도를 입력해주세요.'})
    latitude: number;

    /** 경도 (WGS84) */
    @IsLongitude({message: '경도가 올바르지 않습니다.'})
    @IsNotEmpty({message: '경도를 입력해주세요.'})
    longitude: number;
}
```
