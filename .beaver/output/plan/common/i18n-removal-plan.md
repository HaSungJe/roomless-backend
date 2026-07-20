# Plan — i18n-removal (다국어 전체 제거)

## Feature Summary
- **Feature**: 다국어(i18n) 기능 전체 제거 — 메시지는 한국어 리터럴 인라인 고정
- **Entry point**: `N/A` (횡단 변경 — 기존 user 5개 API의 동작·상태코드·응답 구조 불변)
- **Domain**: common (+ user, modules/queue, 루트 설정·문서)

---

## File List

| File | Action |
|------|------|
| `src/i18n/**` (ko/en/ja 21개 yaml) | **delete** |
| `src/common/i18n/translate.ts` | **delete** |
| `src/common/i18n/i18n.config.ts` | **delete** |
| `src/common/i18n/test-utils/load-ko-pack.ts` | **delete** |
| `src/common/language/language.constants.ts` | **delete** (유일 사용처 = ApiLanguageHeader) |
| `src/common/decorators/api-language-header.decorator.ts` | **delete** |
| `scripts/copy-i18n.js` | **delete** |
| `src/app.module.ts` | modified — `I18nModule.forRoot` 제거 |
| `src/main.ts` | modified — `setI18nService`/`I18nService` import 제거 |
| `src/modules/queue/write-queue.registry.ts` | modified — `I18nContext`/`fallbackLangStore`/`job.data.lang` 제거 |
| `src/api/v1/user/user.service.ts` | modified — `translate()` 11곳 → 한국어 리터럴 |
| `src/api/v1/user/repositories/user.repository.ts` | modified — `translate()` 16곳 → 한국어 리터럴 |
| `src/api/v1/user/user.controller.ts` | modified — `@ApiLanguageHeader()`·import 제거 |
| `src/api/v1/user/dto/user-sign.dto.ts` | modified — `i18nMsg` → 리터럴 |
| `src/api/v1/user/dto/user-login.dto.ts` | modified — `i18nMsg` → 리터럴 |
| `src/api/v1/user/dto/user-token-refresh.dto.ts` | modified — `i18nMsg` → 리터럴 |
| `src/api/v1/user/dto/user-leave.dto.ts` | modified — `i18nMsg` → 리터럴 |
| `src/api/v1/user/dto/user-nickname.dto.ts` | modified — `i18nMsg` → 리터럴 (yaml 부재 키 → 주석 문자열 채택) |
| `src/api/v1/user/test/user-sign.spec.ts` | modified — `I18nModule`/`loadKoPack` 제거, 리터럴 단언 |
| `src/api/v1/user/test/user-login.spec.ts` | modified — 〃 |
| `src/api/v1/user/test/user-token-refresh.spec.ts` | modified — 〃 |
| `src/api/v1/user/test/user-leave.spec.ts` | modified — 〃 |
| `src/api/v1/user/test/user-leave-cancel.spec.ts` | modified — 〃 |
| `package.json` | modified — `nestjs-i18n` 의존성 제거, `build` 스크립트 정리 |
| `package-lock.json` | modified — 사용자가 `npm install` 재실행으로 갱신(배포·의존성 설치는 사용자 몫) |
| `CLAUDE.md` | modified — i18n 절 삭제, Validation·Error·체크리스트·Architecture 표기 리터럴 기준 수정 |
| `docs/architecture.md` `docs/conventions.md` `docs/error-handling.md` `docs/api.md` `docs/data-layer.md` `docs/testing.md` | modified — i18n 언급 제거/수정 |

---

## 메시지 치환표 (i18n 키 → 한국어 리터럴, ko 언어팩 전수)

| i18n 키 | 리터럴 |
|---|---|
| `common.internal_server_error` | 서버에서 오류가 발생했습니다. 관리자에게 문의해주세요. |
| `user.service.sign.age_restriction` | 입력하신 정보로는 서비스 이용이 제한됩니다. 생년월일을 다시 확인해 주세요. |
| `user.service.login.invalid_login` | 잘못된 로그인 정보입니다. |
| `user.service.login.account_blocked` | 이용이 제한된 계정입니다. |
| `user.service.token_refresh.invalid_refresh_token` | 유효하지 않은 토큰입니다. |
| `user.service.token_refresh.unauthorized_user` | 유효하지 않은 토큰입니다. |
| `user.service.leave.member_not_found` / `user.service.cancel_leave.member_not_found` | 일치하는 회원이 없습니다. |
| `user.service.leave.invalid_state` | 탈퇴를 신청할 수 없는 상태입니다. |
| `user.service.cancel_leave.invalid_state` | 탈퇴 철회를 할 수 없는 상태입니다. |
| `user.repository.insert_user.login_id_duplicate` | 이미 존재하는 로그인 ID입니다. |
| `user.repository.insert_user.user_search_code_duplicate` | 이미 존재하는 검색 코드입니다. |
| `user.repository.insert_user.sns_account_duplicate` | 이미 가입된 SNS 계정입니다. |
| `user.repository.insert_user.phone_duplicate` | 이미 가입된 번호입니다. |
| `user.repository.insert_user.auth_not_found` | 존재하지 않는 권한입니다. |
| `user.repository.insert_user.state_not_found` | 존재하지 않는 상태입니다. |
| `user.repository.insert_user.sns_type_not_found` | 존재하지 않는 SNS 유형입니다. |
| `user.repository.insert_user_setting.user_not_found` / `insert_session.user_not_found` | 존재하지 않는 회원입니다. |
| `user.repository.insert_session_refresh.refresh_token_duplicate` | 이미 존재하는 Refresh Token입니다. |
| `user.repository.insert_session_refresh.session_not_found` | 존재하지 않는 세션입니다. |
| `user.dto.sign.*` `user.dto.login.*` `user.dto.token_refresh.*` `user.dto.leave.*` | 각 ko yaml 값 그대로 (Design 코드에 전수 반영) |
| `user.dto.nickname.max_length`/`.special_chars`/`.required` | yaml 부재 — 주석 채택: 닉네임은 최대 12자까지 입력할 수 있습니다. / 닉네임에 특수문자는 사용할 수 없습니다. / 닉네임을 입력해주세요. |

---

## Design

### Input/Validation (DTO)

패턴: `i18nMsg('<key>')` → 한국어 리터럴, `i18nMsg` import 삭제, 중복된 ko 주석 삭제. 5개 DTO 동일 — 대표 user-login.dto.ts 변경부:

```typescript
// src/api/v1/user/dto/user-login.dto.ts — 변경부 (i18nMsg import 줄 삭제)
import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, MaxLength, ValidateIf } from 'class-validator';

export class UserLoginDto {
    @ApiProperty({description: 'SNS 유형', enum: ['GOOGLE', 'FACEBOOK', 'APPLE', 'KAKAO', 'LINE']})
    @IsIn(['GOOGLE', 'FACEBOOK', 'APPLE', 'KAKAO', 'LINE'], {message: '유효하지 않은 SNS 유형입니다.'})
    @IsNotEmpty({message: 'SNS 유형을 입력해주세요.'})
    sns_id: string;

    @ApiProperty({description: 'SNS 사용자 ID'})
    @MaxLength(255, {message: 'SNS 사용자 ID는 255자 이하여야 합니다.'})
    @IsNotEmpty({message: 'SNS 사용자 ID를 입력해주세요.'})
    sns_user_id: string;

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
```

sign/token_refresh/leave/nickname DTO 도 치환표대로 동일 규칙 적용. 데코레이터 순서·`@IsNotEmpty` 맨 마지막 규약 불변.

### Data Access (Repository)

패턴: `translate('<key>')` → 리터럴, import 삭제, 중복 주석 삭제. 대표 insertUser (나머지 8개 메서드 동일):

```typescript
// src/api/v1/user/repositories/user.repository.ts — 변경부 (translate import 줄 삭제)
    async insertUser(entity: UserEntity): Promise<void> {
        try {
            await this.userRepository.insert(entity);
        } catch (error) {
            if (error.errno === 1062 && error.sqlMessage.indexOf('UK_User_LoginId') !== -1) {
                throw new BadRequestException({message: '이미 존재하는 로그인 ID입니다.'});
            } else if (error.errno === 1062 && error.sqlMessage.indexOf('UK_User_UserSearchCode') !== -1) {
                throw new BadRequestException({message: '이미 존재하는 검색 코드입니다.'});
            } else if (error.errno === 1062 && error.sqlMessage.indexOf('UK_User_SnsSnsUserId') !== -1) {
                throw new BadRequestException({message: '이미 가입된 SNS 계정입니다.'});
            } else if (error.errno === 1062 && error.sqlMessage.indexOf('UK_User_Phone') !== -1) {
                throw new BadRequestException({message: '이미 가입된 번호입니다.'});
            } else if (error.errno === 1452 && error.sqlMessage.indexOf('FK_User_Auth') !== -1) {
                throw new BadRequestException({message: '존재하지 않는 권한입니다.'});
            } else if (error.errno === 1452 && error.sqlMessage.indexOf('FK_User_State') !== -1) {
                throw new BadRequestException({message: '존재하지 않는 상태입니다.'});
            } else if (error.errno === 1452 && error.sqlMessage.indexOf('FK_User_Sns') !== -1) {
                throw new BadRequestException({message: '존재하지 않는 SNS 유형입니다.'});
            } else {
                throw new InternalServerErrorException({message: '서버에서 오류가 발생했습니다. 관리자에게 문의해주세요.'});
            }
        }
    }
```

`insertUserSetting`/`insertSession`/`insertSessionRefresh`/`findUser`/`findLeaveReadyUsers`/`findSessionRefresh`/`updateSessionRefresh`/`updateUser` 의 catch 도 치환표대로 동일 치환(통일 500 리터럴 포함, 총 16곳).

### Business Logic (Service)

패턴: `translate('<key>')` → 리터럴 11곳, import 삭제. 대표 변경부:

```typescript
// src/api/v1/user/user.service.ts — 변경부 (translate import 줄 삭제)

// sign():
        if (!isAdult(dto.birth)) {
            const message = '입력하신 정보로는 서비스 이용이 제한됩니다. 생년월일을 다시 확인해 주세요.';
            throw new BadRequestException({
                message,
                validationErrors: createValidationError('birth', message),
            });
        }

// login():
        if (!user) {
            throw new NotFoundException({message: '잘못된 로그인 정보입니다.'});
        }
        if (user.state_id === 'BLOCK') {
            throw new HttpException(
                {message: '이용이 제한된 계정입니다.', block_comment: user.block_comment},
                HttpStatus.FORBIDDEN,
            );
        }

// tokenRefresh(): invalid_refresh_token 4곳 + unauthorized_user 1곳 → 전부 '유효하지 않은 토큰입니다.'
// leave():       '일치하는 회원이 없습니다.' / '탈퇴를 신청할 수 없는 상태입니다.'
// cancelLeave(): '일치하는 회원이 없습니다.' / '탈퇴 철회를 할 수 없는 상태입니다.'
```

### Entry Point (Controller)

```typescript
// src/api/v1/user/user.controller.ts — 변경부: 데코레이터·import 삭제
// (삭제) import { ApiLanguageHeader } from '@root/common/decorators/api-language-header.decorator';

@ApiTags('회원')
@Controller('/api/v1/user')
export class UserController {
```

### 인프라 (app.module / main / queue / package.json)

```typescript
// src/app.module.ts — I18nModule·buildI18nOptions import 및 등록 줄 삭제
import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { UserModule } from './api/v1/user/user.module';
import { QueueModule } from './modules/queue/queue.module';
import { ApiLogModule } from './modules/api-log/api-log.module';
import { SeederModule } from './modules/seeder/seeder.module';

@Module({
    imports: [
        ScheduleModule.forRoot(), // CLAUDE.md "Key Patterns" — 중복 등록 금지, 본 파일에서만 1회 등록
        QueueModule.register(),
        ApiLogModule,
        UserModule,
        SeederModule, // 부팅 시 기본 데이터(SEED_TARGETS) 멱등 시드
    ],
})
export class AppModule {}
```

```typescript
// src/main.ts — 변경부
// (삭제) import { I18nService } from 'nestjs-i18n';
// (삭제) import { setI18nService } from './common/i18n/translate';
// (삭제) bootstrap 내 다국어 주석 2줄 + setI18nService(app.get(I18nService));
```

```typescript
// src/modules/queue/write-queue.registry.ts — 변경부
// (삭제) import { I18nContext } from 'nestjs-i18n';
// (삭제) import { fallbackLangStore } from '@root/common/i18n/translate';

// Worker 핸들러: 언어 복원 래퍼 제거 (주석 2줄 + lang 변수 포함)
                try {
                    return await queueProcessingContext.run(true, () =>
                        handler.originalFn.apply(handler.serviceInstance, job.data.args),
                    );
                } catch (e) {

// dispatch: job.data 에서 lang 제거
            const job = await queue.add(jobKey, { args }, {
```

```jsonc
// package.json — 변경부 (dependencies 에서 "nestjs-i18n" 줄 삭제)
  "scripts": {
    "build": "nest build",
    // ...나머지 불변
  }
// scripts/copy-i18n.js 파일 삭제
// package-lock.json 은 사용자가 npm install 로 재생성 (CLAUDE.md ⚠️ — 의존성 설치/배포는 사용자 몫)
```

### 테스트 (spec 5개)

패턴: 상단 `I18nModule`/`buildI18nOptions`/`loadKoPack` import + `const userKo = ...`(파생 상수 포함) 삭제, TestingModule `imports: [I18nModule.forRoot(buildI18nOptions())]` 제거, `userKo.*` 단언 → 치환표 리터럴. 대표 변경부:

```typescript
// src/api/v1/user/test/user-login.spec.ts — 변경부
        const module: TestingModule = await Test.createTestingModule({
            controllers: [UserController],
            providers: [
                UserService,
                {provide: USER_REPOSITORY, useValue: userRepository},
                {provide: JwtService, useValue: jwtServiceMock},
            ],
        }).compile();

// 단언 치환 (파일별 전수):
// user-login.spec.ts         → 'device_os 입력 시 device_token 도 입력해야 합니다.' / 'device_token 입력 시 device_os 도 입력해야 합니다.'
//                              / '잘못된 로그인 정보입니다.' / '이용이 제한된 계정입니다.'
// user-sign.spec.ts          → '입력하신 정보로는 서비스 이용이 제한됩니다. 생년월일을 다시 확인해 주세요.'
// user-token-refresh.spec.ts → '유효하지 않은 토큰입니다.' (4곳)
// user-leave.spec.ts         → '탈퇴 사유는 최대 255자까지 입력할 수 있습니다.' / '일치하는 회원이 없습니다.' / '탈퇴를 신청할 수 없는 상태입니다.'
// user-leave-cancel.spec.ts  → '일치하는 회원이 없습니다.' / '탈퇴 철회를 할 수 없는 상태입니다.'
```

### 규약 문서 (CLAUDE.md / docs)

```markdown
<!-- CLAUDE.md — 변경부 요약 -->
- Architecture 절: 스택 나열에서 "nestjs-i18n" 제거, 트리에서 `i18n/<lang>/` 줄 제거, common 설명에서 i18n·language 제거
- "## i18n / 다국어" 절 전체 삭제
- Validation 절: "`message: i18nMsg('<key>')` 필수" → "`message: '<한국어 문자열>'` 리터럴 필수", i18n 키·ko 주석 병기 규칙 삭제
- Error & Response 절: `translate('<key>')` → 한국어 리터럴 표기
- Testing 절: `loadKoPack` 단언 규칙 → 리터럴 단언
- Checklist: i18n 항목 삭제, DTO 검증 항목 리터럴 기준 수정

<!-- docs/*.md — 동일 기준으로 i18n 언급 제거/수정:
     architecture.md(스택·트리·부트스트랩 순서·새 도메인 절차 5번),
     conventions.md(Validation 절·i18n 키 규칙),
     error-handling.md(translate 표기), api.md(@ApiLanguageHeader 순서),
     data-layer.md(repository 예시 코드), testing.md(I18nModule 부팅·loadKoPack 단언) -->
```

---

## Test Cases

신규 로직 없음(문자열 소스 치환 + 삭제) — 기존 spec 이 회귀 게이트. 신규/변경 데이터 접근 메서드 없음 → `[SMOKE:data-access]` 해당 없음 (docs/testing.md 정의 기준).

```
[SUCCESS]          기존 5개 spec 정상 흐름 전부 통과 (mock 호출 횟수·인자 단언 불변)
[FAIL:validation]  message 단언을 리터럴로 치환 후 통과
[FAIL:service]     message 단언을 리터럴로 치환 후 통과
[FAIL:repository]  통일 500 메시지 리터럴 단언 통과
[검증 게이트]       ship 후 /beaver:test 전체 green + rg -i "i18n|translate|i18nMsg|loadKoPack|Accept-Language" src/ 0건
```

---

## Response Codes

변경 없음 — 기존 5개 API 의 상태코드·응답 구조 불변. `message` 값만 언어 협상 없이 한국어 고정.

| Code | Cause |
|------|------|
| 200/204 | 기존과 동일 (sign/login/token-refresh 200, leave/철회 204) |
| 400/401/403/404/500 | 기존 분기 동일 — message 가 한국어 리터럴 고정 |
