# Plan — general-sign (일반 회원가입 + 일반 로그인)

## Feature Summary
- **Feature**: 아이디(login_id)+비밀번호 기반 일반 회원가입·로그인 API 2개 추가 (스키마 변경 없음)
- **Entry point**: `POST /api/v1/user/general-sign` · `POST /api/v1/user/general-login`
- **Domain**: user

---

## File List

| File | Action |
|------|------|
| `src/api/v1/user/dto/user-general-sign.dto.ts` | **new** |
| `src/api/v1/user/dto/user-general-login.dto.ts` | **new** |
| `src/api/v1/user/user.service.ts` | modified — `generalSign`/`generalLogin` public 메서드 2개 추가 |
| `src/api/v1/user/user.controller.ts` | modified — 핸들러 2개 추가 |
| `src/api/v1/user/test/user-general-sign.spec.ts` | **new** |
| `src/api/v1/user/test/user-general-login.spec.ts` | **new** |
| `src/api/v1/user/entities/*` / `repositories/*` / `user.util.ts` / `user.module.ts` | 변경 없음 (재사용) |
| DB 실스키마 | 변경 없음 |

---

## Design

### Input/Validation (DTO)

```typescript
// src/api/v1/user/dto/user-general-sign.dto.ts — 신규 (전체)
import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsOptional, Matches, MaxLength } from 'class-validator';

export class UserGeneralSignDto {
    @ApiProperty({description: '로그인 아이디 (4~30자, 영문/숫자/_)'})
    @Matches(/^[a-zA-Z0-9_]{4,30}$/, {message: '아이디는 4~30자의 영문, 숫자, 밑줄(_)만 사용할 수 있습니다.'})
    @IsNotEmpty({message: '아이디를 입력해주세요.'})
    login_id: string;

    @ApiProperty({description: '비밀번호 (8~20자, 영문+숫자 필수, 특수문자 !@#$%^&* 허용)'})
    @Matches(/^(?=.*[a-zA-Z])(?=.*\d)[a-zA-Z0-9!@#$%^&*]{8,20}$/, {message: '비밀번호는 8~20자이며 영문과 숫자를 반드시 포함해야 합니다. (특수문자는 !@#$%^&* 만 허용)'})
    @IsNotEmpty({message: '비밀번호를 입력해주세요.'})
    login_pw: string;

    @ApiProperty({description: '성별', enum: ['M', 'F']})
    @IsIn(['M', 'F'], {message: '성별이 올바르지 않습니다.'})
    @IsNotEmpty({message: '성별을 입력해주세요.'})
    gender: string;

    @ApiProperty({description: '생년월일 (YYYY-MM-DD)', example: '1999-01-01'})
    @Matches(/^\d{4}-\d{2}-\d{2}$/, {message: '생년월일은 YYYY-MM-DD 형식이어야 합니다.'})
    @IsNotEmpty({message: '생년월일을 입력해주세요.'})
    birth: string;

    @ApiProperty({description: '닉네임 (최대 12자, 특수문자 불가)'})
    @MaxLength(12, {message: '닉네임은 최대 12자까지 입력할 수 있습니다.'})
    @Matches(/^[가-힣ㄱ-ㅎㅏ-ㅣa-zA-Z0-9\s]+$/, {message: '닉네임에 특수문자는 사용할 수 없습니다.'})
    @IsNotEmpty({message: '닉네임을 입력해주세요.'})
    nickname: string;

    @ApiProperty({description: '디바이스 OS', required: false})
    @IsOptional()
    @MaxLength(20, {message: '디바이스 OS는 최대 20자까지 입력할 수 있습니다.'})
    device_os?: string;

    @ApiProperty({description: '디바이스 토큰', required: false})
    @IsOptional()
    @MaxLength(255, {message: '디바이스 토큰은 최대 255자까지 입력할 수 있습니다.'})
    device_token?: string;
}

export class UserGeneralSignResultDto {
    @ApiProperty({description: 'Access Token (유효 20분)'})
    access_token: string;

    @ApiProperty({description: 'Refresh Token (유효 365일)'})
    refresh_token: string;

    @ApiProperty({description: 'Access Token 만료일시 (ISO 8601)'})
    access_token_expires_at: string;

    @ApiProperty({description: 'Refresh Token 만료일시 (ISO 8601)'})
    refresh_token_expires_at: string;
}
```

```typescript
// src/api/v1/user/dto/user-general-login.dto.ts — 신규 (전체)
import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, MaxLength, ValidateIf } from 'class-validator';

export class UserGeneralLoginDto {
    @ApiProperty({description: '로그인 아이디'})
    @MaxLength(30, {message: '아이디는 30자 이하여야 합니다.'})
    @IsNotEmpty({message: '아이디를 입력해주세요.'})
    login_id: string;

    @ApiProperty({description: '비밀번호'})
    @MaxLength(20, {message: '비밀번호는 20자 이하여야 합니다.'})
    @IsNotEmpty({message: '비밀번호를 입력해주세요.'})
    login_pw: string;

    // device_os / device_token 한 세트: 둘 다 받거나 둘 다 없거나
    // ValidateIf — device_token 입력 시에만 device_os 검증. 양쪽 미입력이면 skip.
    @ApiProperty({description: '디바이스 OS (device_token 과 한 세트)', required: false})
    @ValidateIf((o) => o.device_token !== undefined && o.device_token !== null && o.device_token !== '')
    @MaxLength(20, {message: 'device_os 는 20자 이하여야 합니다.'})
    @IsNotEmpty({message: 'device_token 입력 시 device_os 도 입력해야 합니다.'})
    device_os?: string;

    @ApiProperty({description: '디바이스 토큰 (device_os 와 한 세트)', required: false})
    @ValidateIf((o) => o.device_os !== undefined && o.device_os !== null && o.device_os !== '')
    @MaxLength(255, {message: 'device_token 은 255자 이하여야 합니다.'})
    @IsNotEmpty({message: 'device_os 입력 시 device_token 도 입력해야 합니다.'})
    device_token?: string;
}

export class UserGeneralLoginResultDto {
    @ApiProperty({description: 'Access Token (유효 20분)'})
    access_token: string;

    @ApiProperty({description: 'Refresh Token (유효 365일)'})
    refresh_token: string;

    @ApiProperty({description: 'Access Token 만료일시 (ISO 8601)'})
    access_token_expires_at: string;

    @ApiProperty({description: 'Refresh Token 만료일시 (ISO 8601)'})
    refresh_token_expires_at: string;
}
```

### Business Logic (Service)

```typescript
// src/api/v1/user/user.service.ts — 추가 (import: UserGeneralSignDto/UserGeneralLoginDto/ResultDto 2종 + matchBcrypt)
import { getBcrypt, matchBcrypt } from '@root/common/utils/bcrypt';

    /**
     * 일반 회원가입 — 아이디/비밀번호로 회원/설정/세션 생성 후 토큰 4종 반환. sns_id/sns_user_id 는 null.
     */
    @Transactional()
    async generalSign(dto: UserGeneralSignDto, ip: string): Promise<UserGeneralSignResultDto> {
        // 1. 만 18세 이하 가입 제한
        if (!isAdult(dto.birth)) {
            const message = '입력하신 정보로는 서비스 이용이 제한됩니다. 생년월일을 다시 확인해 주세요.';
            throw new BadRequestException({
                message,
                validationErrors: createValidationError('birth', message),
            });
        }

        // 2. ID 생성
        const user_id = v4().replace(/-/g, '');
        const user_setting_id = v4().replace(/-/g, '');
        const session_id = v4().replace(/-/g, '');
        const login_pw = await getBcrypt(dto.login_pw);
        const user_search_code = v4().replace(/-/g, '');

        // 3. t_user 생성 — 일반 회원: sns 미보유
        const userEntity = new UserEntity();
        userEntity.user_id = user_id;
        userEntity.user_search_code = user_search_code;
        userEntity.auth_id = 'USER';
        userEntity.state_id = 'ACTIVE';
        userEntity.sns_id = null;
        userEntity.sns_user_id = null;
        userEntity.login_id = dto.login_id;
        userEntity.login_pw = login_pw;
        userEntity.name = dto.nickname;
        userEntity.gender = dto.gender;
        userEntity.birth = dto.birth;
        userEntity.phone = null;
        userEntity.nickname = dto.nickname;
        userEntity.device_os = dto.device_os ?? null;
        userEntity.device_token = dto.device_token ?? null;
        await this.userRepository.insertUser(userEntity);   // 아이디 중복은 UK_User_LoginId 분기 400

        // 4. t_user_setting 생성 (sign 과 동일)
        const userSettingEntity = new UserSettingEntity();
        userSettingEntity.user_setting_id = user_setting_id;
        userSettingEntity.user_id = user_id;
        userSettingEntity.bio = null;
        await this.userRepository.insertUserSetting(userSettingEntity);

        // 5. t_session 생성 (sign 과 동일)
        const sessionEntity = new SessionEntity();
        sessionEntity.session_id = session_id;
        sessionEntity.user_id = user_id;
        sessionEntity.ip = ip ?? null;
        sessionEntity.device_os = dto.device_os ?? null;
        sessionEntity.device_token = dto.device_token ?? null;
        sessionEntity.is_delete = 0;
        await this.userRepository.insertSession(sessionEntity);

        // 6. 토큰 발급 (공통 util)
        const tokens = issueAccessAndRefresh(this.jwtService, {user_id, session_id});

        // 7. t_session_refresh 생성 (sign 과 동일)
        const sessionRefreshEntity = new SessionRefreshEntity();
        sessionRefreshEntity.session_id = session_id;
        sessionRefreshEntity.refresh_hash = sha256Hex(tokens.refreshToken);
        sessionRefreshEntity.refresh_encrypted = encryptAesGcm(tokens.refreshToken);
        sessionRefreshEntity.before_refresh_hash = null;
        sessionRefreshEntity.end_at = tokens.refreshTokenExpiresAt;
        await this.userRepository.insertSessionRefresh(sessionRefreshEntity);

        return {
            access_token: tokens.accessToken,
            refresh_token: tokens.refreshToken,
            access_token_expires_at: tokens.accessTokenExpiresAt.toISOString(),
            refresh_token_expires_at: tokens.refreshTokenExpiresAt.toISOString(),
        };
    }

    /**
     * 일반 로그인
     * - login_id + state_id IN (ACTIVE, BLOCK) 조회 → 미존재 404 "잘못된 로그인 정보입니다."
     * - matchBcrypt 불일치 → 동일 404 (아이디/비밀번호 구분 비노출)
     * - BLOCK → 403 + block_comment (비밀번호 검증 후 판정 — 정지 여부 탐지 방지)
     * - ACTIVE → device 동기화(둘 다 입력 시) + 세션/refresh 발급 (SNS login 과 동일)
     */
    @Transactional()
    async generalLogin(dto: UserGeneralLoginDto, ip: string): Promise<UserGeneralLoginResultDto> {
        // 1. 회원 조회 (ACTIVE / BLOCK 만)
        const user = await this.userRepository.findUser({
            login_id: dto.login_id,
            state_id: In(['ACTIVE', 'BLOCK']),
        });
        if (!user) {
            throw new NotFoundException({message: '잘못된 로그인 정보입니다.'});
        }

        // 2. 비밀번호 검증 — 실패 시 미존재와 동일 404
        const matched = await matchBcrypt(dto.login_pw, user.login_pw);
        if (!matched) {
            throw new NotFoundException({message: '잘못된 로그인 정보입니다.'});
        }

        // 3. BLOCK 차단 (비밀번호 검증 후)
        if (user.state_id === 'BLOCK') {
            throw new HttpException(
                {message: '이용이 제한된 계정입니다.', block_comment: user.block_comment},
                HttpStatus.FORBIDDEN,
            );
        }

        // 3-5. device 정보 입력 시 t_user 동기화 — SNS login 과 동일 규칙
        if (dto.device_os && dto.device_token) {
            const userDeviceEntity = new UserEntity();   // 객체리터럴 ❌ — new+할당(@BeforeUpdate update_at 트리거)
            userDeviceEntity.device_os = dto.device_os;
            userDeviceEntity.device_token = dto.device_token;
            await this.userRepository.updateUser({user_id: user.user_id}, userDeviceEntity);
        }

        // 4~6. session 생성 + 토큰 발급 + refresh 저장 — SNS login 과 동일
        const session_id = v4().replace(/-/g, '');
        const sessionEntity = new SessionEntity();
        sessionEntity.session_id = session_id;
        sessionEntity.user_id = user.user_id;
        sessionEntity.ip = ip ?? null;
        sessionEntity.device_os = dto.device_os ?? null;
        sessionEntity.device_token = dto.device_token ?? null;
        sessionEntity.is_delete = 0;
        await this.userRepository.insertSession(sessionEntity);

        const tokens = issueAccessAndRefresh(this.jwtService, {user_id: user.user_id, session_id});

        const sessionRefreshEntity = new SessionRefreshEntity();
        sessionRefreshEntity.session_id = session_id;
        sessionRefreshEntity.refresh_hash = sha256Hex(tokens.refreshToken);
        sessionRefreshEntity.refresh_encrypted = encryptAesGcm(tokens.refreshToken);
        sessionRefreshEntity.before_refresh_hash = null;
        sessionRefreshEntity.end_at = tokens.refreshTokenExpiresAt;
        await this.userRepository.insertSessionRefresh(sessionRefreshEntity);

        return {
            access_token: tokens.accessToken,
            refresh_token: tokens.refreshToken,
            access_token_expires_at: tokens.accessTokenExpiresAt.toISOString(),
            refresh_token_expires_at: tokens.refreshTokenExpiresAt.toISOString(),
        };
    }
```

### Entry Point (Controller)

```typescript
// src/api/v1/user/user.controller.ts — 추가 (import: 신규 DTO 4종)

    /**
     * 일반 회원가입 (아이디/비밀번호)
     */
    @Post('/general-sign')
    @HttpCode(200)
    @ApiOperation({summary: '일반 회원가입'})
    @ApiBody({type: UserGeneralSignDto})
    @ApiOkResponse({type: UserGeneralSignResultDto})
    @ApiBadRequestResponse({type: ApiBadRequestResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async generalSign(@Body() dto: UserGeneralSignDto, @Ip() ip: string): Promise<UserGeneralSignResultDto> {
        return this.userService.generalSign(dto, ip);
    }

    /**
     * 일반 로그인 (아이디/비밀번호)
     */
    @Post('/general-login')
    @HttpCode(200)
    @ApiOperation({summary: '일반 로그인'})
    @ApiBody({type: UserGeneralLoginDto})
    @ApiOkResponse({type: UserGeneralLoginResultDto})
    @ApiBadRequestResponse({type: ApiBadRequestResultDto})
    @ApiForbiddenResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async generalLogin(@Body() dto: UserGeneralLoginDto, @Ip() ip: string): Promise<UserGeneralLoginResultDto> {
        return this.userService.generalLogin(dto, ip);
    }
```

### 테스트 (신규 spec 2개 — 지배적 스타일 ①: HTTP boot + repository Symbol mock)

```typescript
// src/api/v1/user/test/user-general-sign.spec.ts — user-sign.spec.ts 구조 미러링
// 상단 typeorm-transactional mock · I18n 없음 · util spyOn: isAdult/getBcrypt/sha256Hex/encryptAesGcm/extractJwtExpiresAt
// VALID_DTO = {login_id: 'hong_gildong1', login_pw: 'abcd1234!', gender: 'M', birth: ADULT_BIRTH, nickname: '길동이', device_os, device_token}
//
// [SUCCESS] 정상 가입 — 200 토큰 4종 + insertUser entity 전 컬럼 단언:
//           sns_id/sns_user_id/phone toBeNull, login_id=dto.login_id, login_pw=MOCK(getBcrypt 반환),
//           getBcryptSpy toHaveBeenCalledWith(dto.login_pw), name=nickname, auth USER/state ACTIVE,
//           setting/session/refresh·jwt sign 순서 단언 — user-sign.spec [SUCCESS] 와 동일 강도
// [SUCCESS] device 미전송 → device_* null 저장
// [FAIL:validation] login_id 미전송 / 형식('a!' 3자·특수문자) → 400 property=login_id, write 전부 미호출
// [FAIL:validation] login_pw 정책 위반 대표 3종(숫자 없음 'abcdefgh' / 7자 'abc1234' / 허용외 특수문자 'abcd1234?') → 400 property=login_pw
// [FAIL:service]    isAdult false → 400 age_restriction, validationErrors property=birth, getBcrypt 미호출·write 미호출
// [FAIL:duplicate]  insertUser reject '이미 존재하는 로그인 ID입니다.' → 400 메시지 단언 + 후속 write 미호출
// [FAIL:repository] insertUser reject 통일 500 → 500 + 후속 write 미호출
```

```typescript
// src/api/v1/user/test/user-general-login.spec.ts — user-login.spec.ts 구조 미러링 + matchBcrypt spy
// matchBcryptSpy = jest.spyOn(bcryptUtil, 'matchBcrypt').mockResolvedValue(true) (실패 케이스는 false)
//
// [SUCCESS] ACTIVE 로그인 — findUser 인자 단언({login_id, state_id: FindOperator In [ACTIVE,BLOCK]}),
//           matchBcrypt(dto.login_pw, user.login_pw) 호출 인자·1회 단언, device 동기화 updateUser 인자,
//           session/refresh entity·토큰 4종 — user-login.spec [SUCCESS] 와 동일 강도
// [SUCCESS] device 미동봉 → updateUser 미호출, session device null
// [FAIL:validation] login_id/login_pw 누락 → 400, findUser 미호출
// [FAIL:service]    미존재(findUser null) → 404 '잘못된 로그인 정보입니다.', matchBcrypt 미호출
// [FAIL:service]    비밀번호 불일치(matchBcrypt false) → 404 동일 메시지, matchBcrypt 1회, updateUser/insertSession/insertSessionRefresh 미호출
// [FAIL:service]    BLOCK → 403 '이용이 제한된 계정입니다.' + block_comment, matchBcrypt 1회(비번 검증 후 차단), 후속 write 미호출
// [FAIL:repository] findUser reject 통일 500 → 후속 미호출 / insertSessionRefresh reject → 500
```

---

## Test Cases

```
[SUCCESS]            generalSign 정상(entity 전 컬럼·mock 횟수/인자/순서) · device null · generalLogin 정상(findUser 인자·matchBcrypt·device 동기화)
[FAIL:validation]    login_id 형식 2종 / login_pw 정책 3종 / 로그인 필수값 누락 — property·미호출 단언
[FAIL:duplicate]     UK_User_LoginId 중복 → 400 '이미 존재하는 로그인 ID입니다.' + 후속 write 미호출
[FAIL:service]       미성년 400 / 미존재 404 / 비밀번호 불일치 404(동일 메시지) / BLOCK 403+block_comment
[FAIL:repository]    insertUser·findUser·insertSessionRefresh 통일 500 + 후속 미호출
[SMOKE:data-access]  해당 없음 — repository 메서드 신규/변경 0건 (기존 findUser 재사용, where 는 service 구성)
```

---

## Response Codes

| Code | Cause |
|------|------|
| 200 | general-sign / general-login 성공 — 토큰 4종 |
| 400 | 입력 검증 실패(validationErrors) / 만 18세 이하(birth 귀속) / 아이디 중복(message 단독) |
| 403 | BLOCK 계정 로그인 — message + block_comment |
| 404 | 미존재 또는 비밀번호 불일치 — "잘못된 로그인 정보입니다." (구분 비노출) |
| 500 | repository 통일 오류 |
