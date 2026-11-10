# DTO — manager

> `libs/contracts/src/manager/dto/` 에서 Swagger 데코레이터(`@nestjs/swagger`)만 뺀 사본 — 기준: 백엔드 Phase 27(2026-11-10). `class-validator` · `class-transformer` 데코레이터와 한국어 메시지는 그대로다(화면 입력 검증에 그대로 쓴다). 프론트에는 `contracts/manager/dto/<파일>` 로 둔다. 이후 바뀐 DTO 는 `changes/` 로 온다.

## manager/dto/manager-account-detail.dto.ts

```ts
import {IsNotEmpty, Matches} from 'class-validator';

/**
 * 업체 관리자 상세 path param (총관리자 · 관리자)
 */
export class ManagerAccountDetailParamDto {
    /** 업체 총관리자 · 업체 관리자 회원 ID */
    @Matches(/^[a-f0-9]{32}$/, {message: '회원 ID가 올바르지 않습니다.'})
    @IsNotEmpty({message: '회원 ID를 입력해주세요.'})
    user_id: string;
}

/**
 * 업체 관리자 상세 (총관리자 · 관리자)
 */
export class ManagerAccountDetailResultDto {
    /** 회원 ID */
    user_id: string;

    /** 업체 ID */
    store_id: string;

    /** 상호명 */
    store_name: string;

    /** 업체코드 */
    store_code: string;

    /** 업체 상태 (ACTIVE · SUSPEND · LEAVE) */
    store_state_id: string;

    /** 로그인 아이디 */
    login_id: string;

    /** 이름 */
    name: string;

    /** 휴대폰 번호 (없으면 null) */
    phone: string | null;

    /** 성별 (M · F) */
    gender: string;

    /** 생년월일 (YYYY-MM-DD) */
    birth: string;

    /** 권한 (HEAD_MANAGER: 업체 총관리자, MANAGER: 업체 관리자) */
    auth_id: string;

    /** 상태 (ACTIVE: 정상, BLOCK: 정지) */
    state_id: string;

    /** 정지 사유 (없으면 null) */
    block_comment: string | null;

    /** 비밀번호 변경 필요 여부(0: 불필요, 1: 필요 — 임시 비밀번호) */
    is_password_change_required: number;

    /** 등록일시 (ISO 8601) */
    created_at: string;
}
```

## manager/dto/manager-account-list.dto.ts

```ts
import {IsIn, IsOptional, Matches, MaxLength} from 'class-validator';
import {PaginationDto, PaginationResultDto} from '../../common/pagination.dto';

/**
 * 업체 관리자 목록 query (총관리자 · 관리자 — 전체 업체) — 검색어(상호명 · 업체코드 · 아이디 · 이름 · 휴대폰 번호 부분 일치) · 업체 · 권한 · 상태
 */
export class ManagerAccountListDto extends PaginationDto {
    /** 검색어 — 상호명 · 업체코드 · 아이디 · 이름 · 휴대폰 번호 부분 일치 */
    @IsOptional()
    @MaxLength(100, {message: '검색어는 100자 이내로 입력해주세요.'})
    keyword: string | null;

    /** 업체 ID — 없으면 전체 업체 */
    @IsOptional()
    @Matches(/^[a-f0-9]{32}$/, {message: '업체 ID가 올바르지 않습니다.'})
    store_id: string | null;

    /** 권한 (HEAD_MANAGER: 업체 총관리자, MANAGER: 업체 관리자) — 없으면 전체 */
    @IsOptional()
    @IsIn(['HEAD_MANAGER', 'MANAGER'], {message: '권한이 올바르지 않습니다.'})
    auth_id: string | null;

    /** 상태 (ACTIVE: 정상, BLOCK: 정지) — 없으면 전체 */
    @IsOptional()
    @IsIn(['ACTIVE', 'BLOCK'], {message: '상태가 올바르지 않습니다.'})
    state_id: string | null;

    /**
     * @param data 요청 쿼리 — 빠진 페이지 값은 PaginationDto 기본값, 빠진 필터는 null
     */
    constructor(data?: Partial<ManagerAccountListDto>) {
        super(data);
        this.keyword = data?.keyword ?? null;
        this.store_id = data?.store_id ?? null;
        this.auth_id = data?.auth_id ?? null;
        this.state_id = data?.state_id ?? null;
    }
}

/**
 * 업체 관리자 목록 항목 — 업체(상호명 · 업체코드 · 업체 상태)와 함께
 */
export class ManagerAccountListItemResultDto {
    /** 회원 ID */
    user_id: string;

    /** 업체 ID */
    store_id: string;

    /** 상호명 */
    store_name: string;

    /** 업체코드 */
    store_code: string;

    /** 업체 상태 (ACTIVE · SUSPEND · LEAVE) */
    store_state_id: string;

    /** 로그인 아이디 */
    login_id: string;

    /** 이름 */
    name: string;

    /** 휴대폰 번호 (없으면 null) */
    phone: string | null;

    /** 권한 (HEAD_MANAGER: 업체 총관리자, MANAGER: 업체 관리자) */
    auth_id: string;

    /** 상태 (ACTIVE: 정상, BLOCK: 정지) */
    state_id: string;

    /** 비밀번호 변경 필요 여부(0: 불필요, 1: 필요 — 임시 비밀번호) */
    is_password_change_required: number;

    /** 등록일시 (ISO 8601) */
    created_at: string;
}

/**
 * 업체 관리자 목록
 */
export class ManagerAccountListResultDto {
    /** 목록 (등록 최신순) */
    list: ManagerAccountListItemResultDto[];

    /** 페이지 정보 */
    pagination: PaginationResultDto;
}
```

## manager/dto/manager-account-password-reset.dto.ts

```ts
import {IsNotEmpty, Matches} from 'class-validator';

/**
 * 업체 관리자 비밀번호 초기화 path param (총관리자 · 관리자) — 임시 비밀번호는 그 계정 휴대폰으로 SMS
 */
export class ManagerAccountPasswordResetParamDto {
    /** 업체 총관리자 · 업체 관리자 회원 ID */
    @Matches(/^[a-f0-9]{32}$/, {message: '회원 ID가 올바르지 않습니다.'})
    @IsNotEmpty({message: '회원 ID를 입력해주세요.'})
    user_id: string;
}
```

## manager/dto/manager-find-login-id-confirm.dto.ts

```ts
import {IsNotEmpty, Matches} from 'class-validator';

/**
 * 매니저 아이디 찾기 — 인증번호 확인 입력 (발송 결과의 인증 ID + 인증번호)
 */
export class ManagerFindLoginIdConfirmDto {
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
 * 매니저 아이디 찾기 결과 — 아이디 · 등록일시
 */
export class ManagerFindLoginIdConfirmResultDto {
    /** 로그인 아이디 */
    login_id: string;

    /** 계정 등록일시 (ISO 8601) */
    created_at: string;
}
```

## manager/dto/manager-find-login-id.dto.ts

```ts
import {IsNotEmpty, Matches} from 'class-validator';

/**
 * 매니저 아이디 찾기 — 인증번호 발송 입력 (업체코드 + 그 업체 계정에 등록된 휴대폰 번호)
 */
export class ManagerFindLoginIdDto {
    /** 업체코드 (32자 — 매니저 화면 주소에 들어 있다) */
    @Matches(/^[a-f0-9]{32}$/, {message: '업체코드가 올바르지 않습니다.'})
    @IsNotEmpty({message: '업체코드를 입력해주세요.'})
    store_code: string;

    /** 계정에 등록된 휴대폰 번호 (숫자만) */
    @Matches(/^01[016789]\d{7,8}$/, {message: '휴대폰 번호를 숫자만 정확히 입력해주세요.'})
    @IsNotEmpty({message: '휴대폰 번호를 입력해주세요.'})
    phone: string;
}

/**
 * 매니저 아이디 찾기 — 인증번호 발송 결과
 */
export class ManagerFindLoginIdResultDto {
    /** 인증 ID — 확인할 때 인증번호와 함께 보낸다 */
    sms_verification_id: string;

    /** 인증번호 만료일시 (ISO 8601) — 발송 후 5분 */
    expires_at: string;
}
```

## manager/dto/manager-login.dto.ts

```ts
import {IsNotEmpty, Matches, MaxLength, ValidateIf} from 'class-validator';

/**
 * 매니저(총매니저 · 매니저) 로그인 입력 (업체코드 · 아이디 · 비밀번호) — 매니저 계정은 업체 안에서만 유일하다
 */
export class ManagerLoginDto {
    /** 업체코드 (32자 — 매니저 화면 주소에 들어 있다) */
    @Matches(/^[a-f0-9]{32}$/, {message: '업체코드가 올바르지 않습니다.'})
    @IsNotEmpty({message: '업체코드를 입력해주세요.'})
    store_code: string;

    /** 로그인 아이디 */
    @MaxLength(30, {message: '아이디는 30자 이하여야 합니다.'})
    @IsNotEmpty({message: '아이디를 입력해주세요.'})
    login_id: string;

    /** 비밀번호 */
    @MaxLength(20, {message: '비밀번호는 20자 이하여야 합니다.'})
    @IsNotEmpty({message: '비밀번호를 입력해주세요.'})
    login_pw: string;

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

/**
 * 매니저 로그인 결과
 */
export class ManagerLoginResultDto {
    /** Access Token (유효 20분) */
    access_token: string;

    /** Refresh Token (유효 365일) */
    refresh_token: string;

    /** Access Token 만료일시 (ISO 8601) */
    access_token_expires_at: string;

    /** Refresh Token 만료일시 (ISO 8601) */
    refresh_token_expires_at: string;

    /** 비밀번호 변경 필요 여부(0: 불필요, 1: 필요) — 임시 비밀번호로 바뀐 계정은 1 */
    is_password_change_required: number;

    /** 권한(HEAD_MANAGER: 총매니저, MANAGER: 매니저) — 관리자 페이지 메뉴 구분 */
    auth_id: string;

    /** 소속 업체 ID (없으면 null) */
    store_id: string | null;
}
```

## manager/dto/manager-password-reset-confirm.dto.ts

```ts
import {IsNotEmpty, Matches} from 'class-validator';

/**
 * 매니저 비밀번호 초기화 — 인증번호 확인 입력 (발송 결과의 인증 ID + 인증번호).
 * 확인되면 그 기록의 매니저 비밀번호를 임시 비밀번호(영문 + 숫자 10자리)로 바꾸고 그 기록의 번호로 SMS 를 보낸다
 */
export class ManagerPasswordResetConfirmDto {
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

## manager/dto/manager-password-reset.dto.ts

```ts
import {IsNotEmpty, Matches, MaxLength} from 'class-validator';

/**
 * 매니저 비밀번호 초기화 — 인증번호 발송 입력 (그 업체에서 아이디 + 휴대폰 번호가 같은 매니저 계정일 때만 보낸다)
 */
export class ManagerPasswordResetDto {
    /** 업체코드 (32자 — 매니저 화면 주소에 들어 있다) */
    @Matches(/^[a-f0-9]{32}$/, {message: '업체코드가 올바르지 않습니다.'})
    @IsNotEmpty({message: '업체코드를 입력해주세요.'})
    store_code: string;

    /** 로그인 아이디 */
    @MaxLength(30, {message: '아이디는 30자 이하여야 합니다.'})
    @IsNotEmpty({message: '아이디를 입력해주세요.'})
    login_id: string;

    /** 계정에 등록된 휴대폰 번호 (숫자만) */
    @Matches(/^01[016789]\d{7,8}$/, {message: '휴대폰 번호를 숫자만 정확히 입력해주세요.'})
    @IsNotEmpty({message: '휴대폰 번호를 입력해주세요.'})
    phone: string;
}

/**
 * 매니저 비밀번호 초기화 — 인증번호 발송 결과
 */
export class ManagerPasswordResetResultDto {
    /** 인증 ID — 확인할 때 인증번호와 함께 보낸다 */
    sms_verification_id: string;

    /** 인증번호 만료일시 (ISO 8601) — 발송 후 5분 */
    expires_at: string;
}
```

## manager/dto/manager-password.dto.ts

```ts
import {IsNotEmpty, Matches, MaxLength} from 'class-validator';

/**
 * 매니저 비밀번호 변경 입력
 */
export class ManagerPasswordDto {
    /** 현재 비밀번호 */
    @MaxLength(20, {message: '비밀번호는 20자 이하여야 합니다.'})
    @IsNotEmpty({message: '현재 비밀번호를 입력해주세요.'})
    current_password: string;

    /** 새 비밀번호 (8~20자, 영문+숫자 필수, 특수문자 !@#$%^&* 허용) */
    @Matches(/^(?=.*[a-zA-Z])(?=.*\d)[a-zA-Z0-9!@#$%^&*]{8,20}$/, {message: '비밀번호는 8~20자이며 영문과 숫자를 반드시 포함해야 합니다. (특수문자는 !@#$%^&* 만 허용)'})
    @IsNotEmpty({message: '새 비밀번호를 입력해주세요.'})
    new_password: string;
}
```

## manager/dto/manager-staff-delete.dto.ts

```ts
import {IsNotEmpty, Matches} from 'class-validator';

/**
 * 업체 관리자 삭제 path param — 탈퇴(LEAVE) 처리, 같은 아이디 · 번호로 다시 등록할 수 있다
 */
export class ManagerStaffDeleteParamDto {
    /** 업체 관리자 회원 ID */
    @Matches(/^[a-f0-9]{32}$/, {message: '회원 ID가 올바르지 않습니다.'})
    @IsNotEmpty({message: '회원 ID를 입력해주세요.'})
    user_id: string;
}
```

## manager/dto/manager-staff-detail.dto.ts

```ts
import {IsNotEmpty, Matches} from 'class-validator';

/**
 * 업체 관리자 상세 path param
 */
export class ManagerStaffDetailParamDto {
    /** 업체 관리자 회원 ID */
    @Matches(/^[a-f0-9]{32}$/, {message: '회원 ID가 올바르지 않습니다.'})
    @IsNotEmpty({message: '회원 ID를 입력해주세요.'})
    user_id: string;
}

/**
 * 업체 관리자 상세
 */
export class ManagerStaffDetailResultDto {
    /** 회원 ID */
    user_id: string;

    /** 로그인 아이디 */
    login_id: string;

    /** 이름 */
    name: string;

    /** 휴대폰 번호 (없으면 null) */
    phone: string | null;

    /** 성별 (M · F) */
    gender: string;

    /** 생년월일 (YYYY-MM-DD) */
    birth: string;

    /** 권한 (MANAGER) */
    auth_id: string;

    /** 상태 (ACTIVE: 정상, BLOCK: 정지) */
    state_id: string;

    /** 정지 사유 (없으면 null) */
    block_comment: string | null;

    /** 비밀번호 변경 필요 여부(0: 불필요, 1: 필요 — 임시 비밀번호) */
    is_password_change_required: number;

    /** 등록일시 (ISO 8601) */
    created_at: string;

    /** 수정일시 (ISO 8601) */
    updated_at: string;
}
```

## manager/dto/manager-staff-list.dto.ts

```ts
import {IsOptional, MaxLength} from 'class-validator';
import {PaginationDto, PaginationResultDto} from '../../common/pagination.dto';

/**
 * 업체 관리자 목록 query (업체 총관리자) — 검색어(아이디 · 이름 · 휴대폰 번호 부분 일치)
 */
export class ManagerStaffListDto extends PaginationDto {
    /** 검색어 — 아이디 · 이름 · 휴대폰 번호 부분 일치 */
    @IsOptional()
    @MaxLength(100, {message: '검색어는 100자 이내로 입력해주세요.'})
    keyword: string | null;

    /**
     * @param data 요청 쿼리 — 빠진 페이지 값은 PaginationDto 기본값, 빠진 필터는 null
     */
    constructor(data?: Partial<ManagerStaffListDto>) {
        super(data);
        this.keyword = data?.keyword ?? null;
    }
}

/**
 * 업체 관리자 목록 항목 — 업체 총관리자도 함께(위에) 나온다
 */
export class ManagerStaffListItemResultDto {
    /** 회원 ID */
    user_id: string;

    /** 로그인 아이디 */
    login_id: string;

    /** 이름 */
    name: string;

    /** 휴대폰 번호 (없으면 null) */
    phone: string | null;

    /** 권한 (HEAD_MANAGER: 업체 총관리자, MANAGER: 업체 관리자) */
    auth_id: string;

    /** 상태 (ACTIVE: 정상, BLOCK: 정지) */
    state_id: string;

    /** 비밀번호 변경 필요 여부(0: 불필요, 1: 필요 — 임시 비밀번호) */
    is_password_change_required: number;

    /** 등록일시 (ISO 8601) */
    created_at: string;
}

/**
 * 업체 관리자 목록
 */
export class ManagerStaffListResultDto {
    /** 목록 (업체 총관리자가 위, 등록일 최신순) */
    list: ManagerStaffListItemResultDto[];

    /** 페이지 정보 */
    pagination: PaginationResultDto;
}
```

## manager/dto/manager-staff-password-reset.dto.ts

```ts
import {IsNotEmpty, Matches} from 'class-validator';

/**
 * 업체 관리자 비밀번호 초기화 path param — 임시 비밀번호는 그 업체 관리자 휴대폰으로 SMS
 */
export class ManagerStaffPasswordResetParamDto {
    /** 업체 관리자 회원 ID */
    @Matches(/^[a-f0-9]{32}$/, {message: '회원 ID가 올바르지 않습니다.'})
    @IsNotEmpty({message: '회원 ID를 입력해주세요.'})
    user_id: string;
}
```

## manager/dto/manager-staff-state.dto.ts

```ts
import {IsIn, IsNotEmpty, IsOptional, Matches, MaxLength} from 'class-validator';

/**
 * 업체 관리자 정지 · 해제 path param
 */
export class ManagerStaffStateParamDto {
    /** 업체 관리자 회원 ID */
    @Matches(/^[a-f0-9]{32}$/, {message: '회원 ID가 올바르지 않습니다.'})
    @IsNotEmpty({message: '회원 ID를 입력해주세요.'})
    user_id: string;
}

/**
 * 업체 관리자 정지 · 해제 입력 — 정지(BLOCK)는 로그인 · 재발급이 막히고, 해제(ACTIVE)는 다시 쓸 수 있다
 */
export class ManagerStaffStateDto {
    /** 바꿀 상태 (ACTIVE: 해제, BLOCK: 정지) — 값: ACTIVE · BLOCK */
    @IsIn(['ACTIVE', 'BLOCK'], {message: '상태가 올바르지 않습니다.'})
    @IsNotEmpty({message: '상태를 입력해주세요.'})
    state_id: string;

    /** 정지 사유 (정지할 때만 남는다 — 로그인 때 보인다) */
    @IsOptional()
    @MaxLength(255, {message: '정지 사유는 255자 이내로 입력해주세요.'})
    block_comment?: string;
}
```

## manager/dto/manager-staff-update.dto.ts

```ts
import {IsIn, IsNotEmpty, Matches, MaxLength} from 'class-validator';

/**
 * 업체 관리자 수정 path param
 */
export class ManagerStaffUpdateParamDto {
    /** 업체 관리자 회원 ID */
    @Matches(/^[a-f0-9]{32}$/, {message: '회원 ID가 올바르지 않습니다.'})
    @IsNotEmpty({message: '회원 ID를 입력해주세요.'})
    user_id: string;
}

/**
 * 업체 관리자 수정 입력 — 전체 교체, 아이디는 바꾸지 않는다
 */
export class ManagerStaffUpdateDto {
    /** 이름 (닉네임도 같은 값) */
    @MaxLength(50, {message: '이름은 50자 이내로 입력해주세요.'})
    @IsNotEmpty({message: '이름을 입력해주세요.'})
    name: string;

    /** 휴대폰 번호 (숫자만, 업체 안에서 유일) */
    @Matches(/^01[016789]\d{7,8}$/, {message: '휴대폰 번호를 숫자만 정확히 입력해주세요.'})
    @IsNotEmpty({message: '휴대폰 번호를 입력해주세요.'})
    phone: string;

    /** 성별 — 값: M · F */
    @IsIn(['M', 'F'], {message: '성별이 올바르지 않습니다.'})
    @IsNotEmpty({message: '성별을 입력해주세요.'})
    gender: string;

    /** 생년월일 (YYYY-MM-DD) */
    @Matches(/^\d{4}-\d{2}-\d{2}$/, {message: '생년월일은 YYYY-MM-DD 형식이어야 합니다.'})
    @IsNotEmpty({message: '생년월일을 입력해주세요.'})
    birth: string;
}
```

## manager/dto/manager-staff.dto.ts

```ts
import {IsIn, IsNotEmpty, Matches, MaxLength} from 'class-validator';

/**
 * 업체 관리자 등록 입력 (업체 총관리자) — 업체는 로그인한 업체 총관리자의 업체다. 임시 비밀번호는 그 휴대폰으로 SMS.
 */
export class ManagerStaffDto {
    /** 로그인 아이디 (영문 · 숫자 · _ 4~30자, 업체 안에서 유일) */
    @Matches(/^[a-zA-Z0-9_]{4,30}$/, {message: '아이디는 영문 · 숫자 · _ 4~30자로 입력해주세요.'})
    @IsNotEmpty({message: '아이디를 입력해주세요.'})
    login_id: string;

    /** 이름 (닉네임도 같은 값) */
    @MaxLength(50, {message: '이름은 50자 이내로 입력해주세요.'})
    @IsNotEmpty({message: '이름을 입력해주세요.'})
    name: string;

    /** 휴대폰 번호 (숫자만, 업체 안에서 유일) — 임시 비밀번호 · 아이디 찾기 · 비밀번호 초기화 */
    @Matches(/^01[016789]\d{7,8}$/, {message: '휴대폰 번호를 숫자만 정확히 입력해주세요.'})
    @IsNotEmpty({message: '휴대폰 번호를 입력해주세요.'})
    phone: string;

    /** 성별 — 값: M · F */
    @IsIn(['M', 'F'], {message: '성별이 올바르지 않습니다.'})
    @IsNotEmpty({message: '성별을 입력해주세요.'})
    gender: string;

    /** 생년월일 (YYYY-MM-DD) */
    @Matches(/^\d{4}-\d{2}-\d{2}$/, {message: '생년월일은 YYYY-MM-DD 형식이어야 합니다.'})
    @IsNotEmpty({message: '생년월일을 입력해주세요.'})
    birth: string;
}

/**
 * 업체 관리자 등록 결과
 */
export class ManagerStaffResultDto {
    /** 등록한 업체 관리자 회원 ID */
    user_id: string;
}
```

## manager/dto/manager-token-refresh.dto.ts

```ts
import {IsNotEmpty} from 'class-validator';

/**
 * 매니저 토큰 재발급 입력
 */
export class ManagerTokenRefreshDto {
    /** 리프레시 토큰 */
    @IsNotEmpty({message: '리프레시 토큰을 입력해주세요.'})
    refresh_token: string;
}

/**
 * 매니저 토큰 재발급 결과
 */
export class ManagerTokenRefreshResultDto {
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
