# DTO — admin

> `libs/contracts/src/admin/dto/` 에서 Swagger 데코레이터(`@nestjs/swagger`)만 뺀 사본 — 기준: 백엔드 Phase 27(2026-11-10). `class-validator` · `class-transformer` 데코레이터와 한국어 메시지는 그대로다(화면 입력 검증에 그대로 쓴다). 프론트에는 `contracts/admin/dto/<파일>` 로 둔다. 이후 바뀐 DTO 는 `changes/` 로 온다.

## admin/dto/admin-login.dto.ts

```ts
import {IsNotEmpty, MaxLength, ValidateIf} from 'class-validator';

/**
 * 관리자(총관리자 · 관리자) 로그인 입력 (아이디 · 비밀번호)
 */
export class AdminLoginDto {
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
 * 관리자 로그인 결과
 */
export class AdminLoginResultDto {
    /** Access Token (유효 20분) */
    access_token: string;

    /** Refresh Token (유효 365일) */
    refresh_token: string;

    /** Access Token 만료일시 (ISO 8601) */
    access_token_expires_at: string;

    /** Refresh Token 만료일시 (ISO 8601) */
    refresh_token_expires_at: string;

    /** 비밀번호 변경 필요 여부(0: 불필요, 1: 필요) — 첫 총관리자(시드)는 1 */
    is_password_change_required: number;

    /** 권한(SUPER_ADMIN: 총관리자, ADMIN: 관리자) — 관리자 페이지 메뉴 구분 */
    auth_id: string;
}
```

## admin/dto/admin-password.dto.ts

```ts
import {IsNotEmpty, Matches, MaxLength} from 'class-validator';

/**
 * 관리자 비밀번호 변경 입력
 */
export class AdminPasswordDto {
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

## admin/dto/admin-token-refresh.dto.ts

```ts
import {IsNotEmpty} from 'class-validator';

/**
 * 관리자 토큰 재발급 입력
 */
export class AdminTokenRefreshDto {
    /** 리프레시 토큰 */
    @IsNotEmpty({message: '리프레시 토큰을 입력해주세요.'})
    refresh_token: string;
}

/**
 * 관리자 토큰 재발급 결과
 */
export class AdminTokenRefreshResultDto {
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
