# DTO — user

> `libs/contracts/src/user/dto/` 에서 Swagger 데코레이터(`@nestjs/swagger`)만 뺀 사본 — 기준: 백엔드 Phase 27(2026-11-10). `class-validator` · `class-transformer` 데코레이터와 한국어 메시지는 그대로다(화면 입력 검증에 그대로 쓴다). 프론트에는 `contracts/user/dto/<파일>` 로 둔다. 이후 바뀐 DTO 는 `changes/` 로 온다.

## user/dto/user-detail.dto.ts

```ts
import {IsNotEmpty, Matches} from 'class-validator';

/**
 * 이용자 상세 path param
 */
export class UserDetailParamDto {
    /** 이용자 회원 ID */
    @Matches(/^[a-f0-9]{32}$/, {message: '회원 ID가 올바르지 않습니다.'})
    @IsNotEmpty({message: '회원 ID를 입력해주세요.'})
    user_id: string;
}

/**
 * 이용자 예약 건수 요약 — 결제 대기 만료(EXPIRED)는 세지 않는다
 */
export class UserReservationSummaryResultDto {
    /** 전체 (결제 대기 만료 제외) */
    total: number;

    /** 진행 중 (결제 대기 · 확정 · 이용 중) */
    in_progress: number;

    /** 이용 완료 */
    completed: number;

    /** 취소 */
    canceled: number;
}

/**
 * 이용자 상세
 */
export class UserDetailResultDto {
    /** 회원 ID */
    user_id: string;

    /** 회원 식별 코드 */
    user_search_code: string;

    /** 닉네임 */
    nickname: string;

    /** 이름 */
    name: string;

    /** 성별 */
    gender: string;

    /** 생년월일 */
    birth: string;

    /** 휴대폰 번호 (미인증 · 탈퇴 null) */
    phone: string | null;

    /** 휴대폰 SMS 인증일시 (ISO 8601, 미인증 null) */
    phone_verified_at: string | null;

    /** 가입 SNS (없으면 null) */
    sns_id: string | null;

    /** 상태 (ACTIVE · BLOCK · LEAVE_WAIT · LEAVE) */
    state_id: string;

    /** 이용 제한 사유 (없으면 null) */
    block_comment: string | null;

    /** 탈퇴 예정 시각 (YYYY-MM-DD HH:mm:ss, 탈퇴 대기가 아니면 null) */
    leave_reserved_at: string | null;

    /** 가입일시 (ISO 8601) */
    created_at: string;

    /** 예약 건수 요약 */
    reservation_summary: UserReservationSummaryResultDto;
}
```

## user/dto/user-find-login-id-confirm.dto.ts

```ts
import {IsNotEmpty, Matches} from 'class-validator';

/**
 * 아이디 찾기 — 인증번호 확인 입력 (발송 결과의 인증 ID + 인증번호)
 */
export class UserFindLoginIdConfirmDto {
    /** 인증 ID (발송 결과의 sms_verification_id) */
    @Matches(/^[a-f0-9]{32}$/, {message: '인증 ID가 올바르지 않습니다.'})
    @IsNotEmpty({message: '인증 ID를 입력해주세요.'})
    sms_verification_id: string;

    /** 인증번호 6자리 */
    @Matches(/^\d{6}$/, {message: '인증번호 6자리를 입력해주세요.'})
    @IsNotEmpty({message: '인증번호를 입력해주세요.'})
    code: string;
}

/**
 * 아이디 찾기 결과 — 일반 계정은 login_id, SNS 계정은 sns_id (다른 쪽은 null), 그리고 가입일시
 */
export class UserFindLoginIdConfirmResultDto {
    /** 로그인 아이디 (SNS 계정이면 null) */
    login_id: string | null;

    /** 가입한 SNS (NAVER · KAKAO, 일반 계정이면 null) */
    sns_id: string | null;

    /** 가입일시 (ISO 8601) */
    created_at: string;
}
```

## user/dto/user-find-login-id.dto.ts

```ts
import {IsNotEmpty, Matches} from 'class-validator';

/**
 * 아이디 찾기 — 인증번호 발송 입력
 */
export class UserFindLoginIdDto {
    /** 가입할 때 인증한 휴대폰 번호 (숫자만) */
    @Matches(/^01[016789]\d{7,8}$/, {message: '휴대폰 번호를 숫자만 정확히 입력해주세요.'})
    @IsNotEmpty({message: '휴대폰 번호를 입력해주세요.'})
    phone: string;
}

/**
 * 아이디 찾기 — 인증번호 발송 결과
 */
export class UserFindLoginIdResultDto {
    /** 인증 ID — 확인할 때 인증번호와 함께 보낸다 */
    sms_verification_id: string;

    /** 인증번호 만료일시 (ISO 8601) — 발송 후 5분 */
    expires_at: string;
}
```

## user/dto/user-leave.dto.ts

```ts
import {IsOptional, MaxLength} from 'class-validator';

/** 회원 탈퇴 신청 입력 — 탈퇴 사유(선택). */
export class UserLeaveDto {
    /** 탈퇴 사유 (선택, 최대 255자) */
    @IsOptional()
    @MaxLength(255, {message: '탈퇴 사유는 최대 255자까지 입력할 수 있습니다.'})
    leave_comment?: string;
}
```

## user/dto/user-list.dto.ts

```ts
import {IsIn, IsOptional, MaxLength} from 'class-validator';
import {PaginationDto, PaginationResultDto} from '../../common/pagination.dto';

/**
 * 이용자 목록 query (총관리자 · 관리자) — 검색어(이름 · 닉네임 · 휴대폰 번호 · 회원 식별 코드 부분 일치) · 상태 · SNS
 */
export class UserListDto extends PaginationDto {
    /** 검색어 — 이름 · 닉네임 · 휴대폰 번호 · 회원 식별 코드 부분 일치 */
    @IsOptional()
    @MaxLength(100, {message: '검색어는 100자 이내로 입력해주세요.'})
    keyword: string | null;

    /** 상태 (ACTIVE: 정상, BLOCK: 이용 제한, LEAVE_WAIT: 탈퇴 대기, LEAVE: 탈퇴) — 없으면 전체 */
    @IsOptional()
    @IsIn(['ACTIVE', 'BLOCK', 'LEAVE_WAIT', 'LEAVE'], {message: '상태가 올바르지 않습니다.'})
    state_id: string | null;

    /** 가입 SNS (GOOGLE · FACEBOOK · APPLE · KAKAO · LINE · NAVER) — 없으면 전체 */
    @IsOptional()
    @IsIn(['GOOGLE', 'FACEBOOK', 'APPLE', 'KAKAO', 'LINE', 'NAVER'], {message: 'SNS 유형이 올바르지 않습니다.'})
    sns_id: string | null;

    /**
     * @param data 요청 쿼리 — 빠진 페이지 값은 PaginationDto 기본값, 빠진 필터는 null
     */
    constructor(data?: Partial<UserListDto>) {
        super(data);
        this.keyword = data?.keyword ?? null;
        this.state_id = data?.state_id ?? null;
        this.sns_id = data?.sns_id ?? null;
    }
}

/**
 * 이용자 목록 항목
 */
export class UserListItemResultDto {
    /** 회원 ID */
    user_id: string;

    /** 회원 식별 코드 */
    user_search_code: string;

    /** 닉네임 */
    nickname: string;

    /** 이름 */
    name: string;

    /** 휴대폰 번호 (미인증 · 탈퇴 null) */
    phone: string | null;

    /** 가입 SNS (없으면 null) */
    sns_id: string | null;

    /** 상태 (ACTIVE · BLOCK · LEAVE_WAIT · LEAVE) */
    state_id: string;

    /** 휴대폰 SMS 인증 여부(0: 미인증, 1: 인증) */
    is_phone_verified: number;

    /** 가입일시 (ISO 8601) */
    created_at: string;
}

/**
 * 이용자 목록
 */
export class UserListResultDto {
    /** 목록 (가입 최신순) */
    list: UserListItemResultDto[];

    /** 페이지 정보 */
    pagination: PaginationResultDto;
}
```

## user/dto/user-login.dto.ts

```ts
import {IsIn, IsNotEmpty, MaxLength, ValidateIf} from 'class-validator';

export class UserLoginDto {
    /** SNS 유형 — 값: NAVER · KAKAO */
    @IsIn(['NAVER', 'KAKAO'], {message: '유효하지 않은 SNS 유형입니다.'})
    @IsNotEmpty({message: 'SNS 유형을 입력해주세요.'})
    sns_id: string;

    /** SNS 사용자 ID */
    @MaxLength(255, {message: 'SNS 사용자 ID는 255자 이하여야 합니다.'})
    @IsNotEmpty({message: 'SNS 사용자 ID를 입력해주세요.'})
    sns_user_id: string;

    // device_os / device_token 한 세트: 둘 다 받거나 둘 다 없거나
    // ValidateIf — device_token 입력 시에만 device_os 검증. 양쪽 미입력이면 skip.
    /** 디바이스 OS (device_token 과 한 세트) */
    @ValidateIf((o) => o.device_token !== undefined && o.device_token !== null && o.device_token !== '')
    @MaxLength(20, {message: 'device_os 는 20자 이하여야 합니다.'})
    @IsNotEmpty({message: 'device_token 입력 시 device_os 도 입력해야 합니다.'})
    device_os?: string;

    /** 디바이스 토큰 (device_os 와 한 세트) */
    @ValidateIf((o) => o.device_os !== undefined && o.device_os !== null && o.device_os !== '')
    @MaxLength(255, {message: 'device_token 은 255자 이하여야 합니다.'})
    @IsNotEmpty({message: 'device_os 입력 시 device_token 도 입력해야 합니다.'})
    device_token?: string;
}

export class UserLoginResultDto {
    /** Access Token (유효 20분) */
    access_token: string;

    /** Refresh Token (유효 365일) */
    refresh_token: string;

    /** Access Token 만료일시 (ISO 8601) */
    access_token_expires_at: string;

    /** Refresh Token 만료일시 (ISO 8601) */
    refresh_token_expires_at: string;

    /** 휴대폰 SMS 인증 여부(0: 미인증, 1: 인증) — 0 이면 휴대폰 인증 화면으로 */
    is_phone_verified: number;

    /** 회원 상태 (ACTIVE: 정상, BLOCK: 이용 제한, LEAVE_WAIT: 탈퇴 대기 — 둘 다 로그인 · 기존 예약 이용은 되고 새 예약 · 연장만 막힌다, 탈퇴 대기는 철회할 수 있다) */
    state_id: string;

    /** 이용 제한 사유 (없으면 null) */
    block_comment: string | null;

    /** 탈퇴 예정 시각 (YYYY-MM-DD HH:mm:ss — 탈퇴 대기가 아니면 null). 이 시각이 지나면 탈퇴 처리된다 */
    leave_reserved_at: string | null;
}
```

## user/dto/user-me.dto.ts

```ts
/**
 * 내 정보 — 로그인한 이용자 본인의 회원 정보(마이페이지). 입력 없음(로그인 회원은 게이트웨이가 actor 로 넘긴다)
 */
export class UserMeResultDto {
    /** 회원 ID */
    user_id: string;

    /** 회원 식별 코드 (고객 문의 때 알려 주는 코드) */
    user_search_code: string;

    /** 닉네임 */
    nickname: string;

    /** 성별 (M: 남, F: 여) */
    gender: string;

    /** 생년월일 (YYYY-MM-DD) */
    birth: string;

    /** 가입한 SNS (KAKAO · NAVER, 없으면 null) */
    sns_id: string | null;

    /** 휴대폰 번호 (숫자만, 미인증 null) */
    phone: string | null;

    /** 휴대폰 SMS 인증 여부 (0: 미인증, 1: 인증) */
    is_phone_verified: number;

    /** 회원 상태 (ACTIVE: 정상, BLOCK: 이용 제한, LEAVE_WAIT: 탈퇴 대기) */
    state_id: string;

    /** 이용 제한 사유 (이용 제한이 아니면 null) */
    block_comment: string | null;

    /** 탈퇴 예정 시각 (YYYY-MM-DD HH:mm:ss 한국 시각, 탈퇴 대기가 아니면 null) */
    leave_reserved_at: string | null;

    /** 가입일시 (ISO 8601) */
    created_at: string;
}
```

## user/dto/user-phone-verification-confirm.dto.ts

```ts
import {IsNotEmpty, Matches} from 'class-validator';

/**
 * 휴대폰 인증번호 확인 입력 — 발송 결과의 인증 ID + 인증번호. 확인되면 그 기록의 번호를 회원정보에 저장한다
 */
export class UserPhoneVerificationConfirmDto {
    /** 인증 ID (발송 결과의 sms_verification_id) */
    @Matches(/^[a-f0-9]{32}$/, {message: '인증 ID가 올바르지 않습니다.'})
    @IsNotEmpty({message: '인증 ID를 입력해주세요.'})
    sms_verification_id: string;

    /** 인증번호 6자리 */
    @Matches(/^\d{6}$/, {message: '인증번호 6자리를 입력해주세요.'})
    @IsNotEmpty({message: '인증번호를 입력해주세요.'})
    code: string;
}
```

## user/dto/user-phone-verification.dto.ts

```ts
import {IsNotEmpty, Matches} from 'class-validator';

/**
 * 휴대폰 인증번호 발송 입력 (로그인 회원 — 가입 후 본인 휴대폰 인증)
 */
export class UserPhoneVerificationDto {
    /** 휴대폰 번호 (숫자만) */
    @Matches(/^01[016789]\d{7,8}$/, {message: '휴대폰 번호를 숫자만 정확히 입력해주세요.'})
    @IsNotEmpty({message: '휴대폰 번호를 입력해주세요.'})
    phone: string;
}

/**
 * 휴대폰 인증번호 발송 결과
 */
export class UserPhoneVerificationResultDto {
    /** 인증 ID — 확인할 때 인증번호와 함께 보낸다 */
    sms_verification_id: string;

    /** 인증번호 만료일시 (ISO 8601) — 발송 후 5분 */
    expires_at: string;
}
```

## user/dto/user-reservation-list.dto.ts

```ts
import {IsNotEmpty, Matches} from 'class-validator';
import {PaginationDto, PaginationResultDto} from '../../common/pagination.dto';

/**
 * 이용자 예약 이력 path param
 */
export class UserReservationListParamDto {
    /** 이용자 회원 ID */
    @Matches(/^[a-f0-9]{32}$/, {message: '회원 ID가 올바르지 않습니다.'})
    @IsNotEmpty({message: '회원 ID를 입력해주세요.'})
    user_id: string;
}

/**
 * 이용자 예약 이력 query — 페이지만
 */
export class UserReservationListDto extends PaginationDto {
    /**
     * @param data 요청 쿼리 — 빠진 페이지 값은 PaginationDto 기본값
     */
    constructor(data?: Partial<UserReservationListDto>) {
        super(data);
    }
}

/**
 * 이용자 예약 이력 항목
 */
export class UserReservationListItemResultDto {
    /** 예약 ID */
    reservation_id: string;

    /** 업체 ID */
    store_id: string;

    /** 상호명 */
    store_name: string;

    /** 호실명 */
    room_name: string;

    /** 객실 그룹명 */
    room_group_name: string;

    /** 상품 종류 (HOURLY · NIGHT · LONG) */
    room_plan_type_id: string;

    /** 상품 종류 이름 (시간 이용 · 1박 · 연박) */
    room_plan_type_name: string;

    /** 예약 상태 (PENDING · CONFIRMED · CHECKED_IN · COMPLETED · CANCELED) */
    reservation_state_id: string;

    /** 예약 상태 이름 */
    reservation_state_name: string;

    /** 이용 시작 (ISO 8601) */
    start_at: string;

    /** 이용 끝 (ISO 8601) */
    end_at: string;

    /** 합계 금액(원) */
    total_price: number;

    /** 취소 시각 (ISO 8601, 취소 아니면 null) */
    canceled_at: string | null;

    /** 취소 주체 (USER · STORE, 취소 아니면 null) */
    cancel_actor: string | null;

    /** 예약일시 (ISO 8601) */
    created_at: string;
}

/**
 * 이용자 예약 이력
 */
export class UserReservationListResultDto {
    /** 목록 (이용 시작 최신순, 결제 대기 만료 제외) */
    list: UserReservationListItemResultDto[];

    /** 페이지 정보 */
    pagination: PaginationResultDto;
}
```

## user/dto/user-sign.dto.ts

```ts
import {IsIn, IsNotEmpty, IsOptional, Matches, MaxLength} from 'class-validator';

export class UserSignDto {
    /** SNS 유형 — 값: NAVER · KAKAO */
    @IsIn(['NAVER', 'KAKAO'], {message: 'SNS 유형이 올바르지 않습니다.'})
    @IsNotEmpty({message: 'SNS 유형을 입력해주세요.'})
    sns_id: string;

    /** SNS 사용자 ID */
    @MaxLength(255, {message: 'SNS 사용자 ID는 최대 255자까지 입력할 수 있습니다.'})
    @IsNotEmpty({message: 'SNS 사용자 ID를 입력해주세요.'})
    sns_user_id: string;

    /** 성별 — 값: M · F */
    @IsIn(['M', 'F'], {message: '성별이 올바르지 않습니다.'})
    @IsNotEmpty({message: '성별을 입력해주세요.'})
    gender: string;

    /** 생년월일 (YYYY-MM-DD) */
    @Matches(/^\d{4}-\d{2}-\d{2}$/, {message: '생년월일은 YYYY-MM-DD 형식이어야 합니다.'})
    @IsNotEmpty({message: '생년월일을 입력해주세요.'})
    birth: string;

    /** 닉네임 (최대 12자, 특수문자 불가) */
    @MaxLength(12, {message: '닉네임은 최대 12자까지 입력할 수 있습니다.'})
    @Matches(/^[가-힣ㄱ-ㅎㅏ-ㅣa-zA-Z0-9\s]+$/, {message: '닉네임에 특수문자는 사용할 수 없습니다.'})
    @IsNotEmpty({message: '닉네임을 입력해주세요.'})
    nickname: string;

    /** 디바이스 OS */
    @IsOptional()
    @MaxLength(20, {message: '디바이스 OS는 최대 20자까지 입력할 수 있습니다.'})
    device_os?: string;

    /** 디바이스 토큰 */
    @IsOptional()
    @MaxLength(255, {message: '디바이스 토큰은 최대 255자까지 입력할 수 있습니다.'})
    device_token?: string;
}

export class UserSignResultDto {
    /** Access Token (유효 20분) */
    access_token: string;

    /** Refresh Token (유효 365일) */
    refresh_token: string;

    /** Access Token 만료일시 (ISO 8601) */
    access_token_expires_at: string;

    /** Refresh Token 만료일시 (ISO 8601) */
    refresh_token_expires_at: string;

    /** 휴대폰 SMS 인증 여부(0: 미인증, 1: 인증) — 0 이면 휴대폰 인증 화면으로 */
    is_phone_verified: number;
}
```

## user/dto/user-state.dto.ts

```ts
import {IsIn, IsNotEmpty, IsOptional, Matches, MaxLength} from 'class-validator';

/**
 * 이용자 이용 제한 · 해제 path param
 */
export class UserStateParamDto {
    /** 이용자 회원 ID */
    @Matches(/^[a-f0-9]{32}$/, {message: '회원 ID가 올바르지 않습니다.'})
    @IsNotEmpty({message: '회원 ID를 입력해주세요.'})
    user_id: string;
}

/**
 * 이용자 이용 제한 · 해제 입력 — 이용 제한(BLOCK)은 로그인 · 기존 예약 이용은 되고 새 예약 · 연장만 막힌다, 해제(ACTIVE)
 */
export class UserStateDto {
    /** 바꿀 상태 (ACTIVE: 해제, BLOCK: 이용 제한) — 값: ACTIVE · BLOCK */
    @IsIn(['ACTIVE', 'BLOCK'], {message: '상태가 올바르지 않습니다.'})
    @IsNotEmpty({message: '상태를 입력해주세요.'})
    state_id: string;

    /** 이용 제한 사유 (제한할 때만 남는다 — 이용자 로그인 결과에 보인다) */
    @IsOptional()
    @MaxLength(255, {message: '이용 제한 사유는 255자 이내로 입력해주세요.'})
    block_comment?: string;
}
```

## user/dto/user-token-refresh.dto.ts

```ts
import {IsNotEmpty} from 'class-validator';

export class UserTokenRefreshDto {
    /** 리프레시 토큰 */
    @IsNotEmpty({message: '리프레시 토큰을 입력해주세요.'})
    refresh_token: string;
}

export class UserTokenRefreshResultDto {
    /** Access Token (유효 20분) */
    access_token: string;

    /** Refresh Token (유효 365일) */
    refresh_token: string;

    /** Access Token 만료일시 (ISO 8601) */
    access_token_expires_at: string;

    /** Refresh Token 만료일시 (ISO 8601) */
    refresh_token_expires_at: string;
}
```
