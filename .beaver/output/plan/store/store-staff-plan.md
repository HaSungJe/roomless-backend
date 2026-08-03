# Plan — store-staff

## Feature Summary
- **Feature**: 가맹점 인력 지정 — 총괄매니저·매니저 계정 생성, 인력 목록, 인력 삭제 + 비밀번호 변경(user 도메인)
- **Entry point**: `POST /api/v1/store/head-manager/register` · `POST /api/v1/store/manager/register` · `GET /api/v1/store/staff/list` · `DELETE /api/v1/store/staff/remove/:user_id` · `PATCH /api/v1/user/password`
- **Domain**: store (+ user 1건)

---

## 스키마 변경 (로컬은 자동 반영)

- `t_user.store_id` — nullable FK → `t_store`(`FK_User_Store`). 인력 계정의 소속 업체
- `t_user.is_password_change_required` — tinyint NOT NULL default 0
- `t_auth` 시드에 `HEAD_MANAGER` 1행 추가 → `SeederService` 가 부팅 시 멱등 입력하므로 **DB 수작업 불요**

로컬 개발 DB 는 `TYPEORM_SYNC=T` 로 부팅 시 자동 반영([.beaver/memory/db.md](../../../memory/db.md)). 운영 배포 시에만 아래를 적용한다.

- `t_user` 의 `UK_User_Phone` 유니크 제약 **제거** — 전화번호 중복 허용

```sql
ALTER TABLE t_user
    ADD COLUMN store_id VARCHAR(32) NULL COMMENT '소속 가맹점 ID (인력 계정만 보유)',
    ADD COLUMN is_password_change_required TINYINT NOT NULL DEFAULT 0 COMMENT '비밀번호 변경 필요 여부(0: 불필요, 1: 필요)',
    ADD CONSTRAINT FK_User_Store FOREIGN KEY (store_id) REFERENCES t_store(store_id) ON UPDATE CASCADE ON DELETE RESTRICT,
    DROP INDEX UK_User_Phone;
```

---

## File List

| File | Action |
|------|------|
| `src/modules/seeder/seeder.targets.ts` | modified (`HEAD_MANAGER` 시드 1행) |
| `src/api/v1/user/entities/user.entity.ts` | modified (`store_id` FK, `is_password_change_required`, **`UK_User_Phone` 제거**) |
| `src/api/v1/user/repositories/user.repository.ts` | modified (**`UK_User_Phone` 1062 분기 삭제** — 제약 제거로 도달 불가) |
| `src/api/v1/user/user.leave-cleanup.service.ts` | modified (주석만 — 마스킹 근거를 "UK 회피" → "PII 익명화") |
| `src/guards/passport.jwt.auth/passport.jwt.auth.dto.ts` | modified (`store_id` 필드) |
| `src/guards/passport.jwt.auth/passport.jwt.auth.service.ts` | modified (SELECT 에 `u.store_id`) |
| `src/api/v1/store/dto/store-head-manager-register.dto.ts` | new |
| `src/api/v1/store/dto/store-manager-register.dto.ts` | new |
| `src/api/v1/store/dto/store-staff-list.dto.ts` | new |
| `src/api/v1/store/dto/store-staff-remove.dto.ts` | new |
| `src/api/v1/store/store.util.ts` | modified (임시 비밀번호 생성, 인력 검색 WHERE) |
| `src/api/v1/store/interfaces/store.repository.interface.ts` | modified (인력 6메서드 + `findStores`) |
| `src/api/v1/store/repositories/store.repository.ts` | modified (동) |
| `src/api/v1/store/store.service.ts` | modified (public 4개 추가) |
| `src/api/v1/store/store.controller.ts` | modified (핸들러 4개 추가) |
| `src/api/v1/store/store.module.ts` | modified (`forFeature` 에 `UserEntity`·`UserSettingEntity`) |
| `src/api/v1/user/dto/user-password.dto.ts` | new |
| `src/api/v1/user/dto/user-general-login.dto.ts` | modified (`is_password_change_required` 응답 필드) |
| `src/api/v1/user/user.service.ts` | modified (`changePassword` + `generalLogin` 응답) |
| `src/api/v1/user/user.controller.ts` | modified (`PATCH /password`) |
| `src/api/v1/store/test/store-head-manager-register.spec.ts` | new |
| `src/api/v1/store/test/store-manager-register.spec.ts` | new |
| `src/api/v1/store/test/store-staff-list.spec.ts` | new (+ `[SMOKE:data-access]`) |
| `src/api/v1/store/test/store-staff-remove.spec.ts` | new |
| `src/api/v1/user/test/user-password.spec.ts` | new |
| `src/api/v1/user/test/user-general-login.spec.ts` | modified (응답 플래그 단언) |
| `src/modules/seeder/test/seeder.spec.ts` | modified (`HEAD_MANAGER` 시드 단언) |

---

## Design

### Seed

```typescript
// src/modules/seeder/seeder.targets.ts — AUTH_SEED_DATA 만 변경
/** 권한(t_auth) 기본 데이터 */
export const AUTH_SEED_DATA: AuthEntity[] = [
    {auth_id: 'SUPER_ADMIN', auth_name: '총괄관리자', level: 999},
    {auth_id: 'ADMIN', auth_name: '관리자', level: 998},
    {auth_id: 'HEAD_MANAGER', auth_name: '총괄매니저', level: 102},
    {auth_id: 'MANAGER', auth_name: '매니저', level: 101},
    {auth_id: 'USER', auth_name: '이용자', level: 1},
];
```

### Entity

```typescript
// src/api/v1/user/entities/user.entity.ts — import 1줄 + 컬럼 2개 추가 + @Unique 1개 제거
import { StoreEntity } from "@root/api/v1/store/entities/store.entity";

// 클래스 데코레이터 — UK_User_Phone 제거(전화번호 중복 허용), 나머지 3개는 유지
@Entity({name: 't_user', comment: '사용자 정보'})
@Unique('UK_User_LoginId', ['login_id'])
@Unique('UK_User_UserSearchCode', ['user_search_code'])
@Unique('UK_User_SnsSnsUserId', ['sns_id', 'sns_user_id'])
export class UserEntity {

// …(클래스 내부, sns_id 아래에 배치)…

    @ManyToOne(() => StoreEntity, {nullable: true, onUpdate: 'CASCADE', onDelete: 'RESTRICT'})
    @JoinColumn({name: 'store_id', referencedColumnName: 'store_id', foreignKeyConstraintName: 'FK_User_Store'})
    store_id: string | null;

// …(is_delete 성격 컬럼들과 함께, block_comment 위에 배치)…

    @Column({name: 'is_password_change_required', type: 'tinyint', nullable: false, comment: '비밀번호 변경 필요 여부(0: 불필요, 1: 필요)', default: 0})
    is_password_change_required: number;
```

### 죽은 코드 삭제 (전화번호 중복 허용의 동반 정리)

`UK_User_Phone` 이 사라지면 아래 분기는 **영원히 실행되지 않는다.** 추가만 하고 대체된 코드를 남기면 존재하지 않는 제약을 참조하는 유령 분기가 된다.

```typescript
// src/api/v1/user/repositories/user.repository.ts — insertUser, before
            } else if (error.errno === 1062 && error.sqlMessage.indexOf('UK_User_SnsSnsUserId') !== -1) {
                throw new BadRequestException({message: '이미 가입된 SNS 계정입니다.'});
            } else if (error.errno === 1062 && error.sqlMessage.indexOf('UK_User_Phone') !== -1) {
                throw new BadRequestException({message: '이미 가입된 번호입니다.'});
            } else if (error.errno === 1452 && error.sqlMessage.indexOf('FK_User_Auth') !== -1) {
```

```typescript
// src/api/v1/user/repositories/user.repository.ts — insertUser, after (UK_User_Phone 분기 삭제)
            } else if (error.errno === 1062 && error.sqlMessage.indexOf('UK_User_SnsSnsUserId') !== -1) {
                throw new BadRequestException({message: '이미 가입된 SNS 계정입니다.'});
            } else if (error.errno === 1452 && error.sqlMessage.indexOf('FK_User_Auth') !== -1) {
```

```typescript
// src/api/v1/user/user.leave-cleanup.service.ts — 주석만 정정 (동작 변경 없음)
                update.sns_user_id = masked;   // UK(sns_id,sns_user_id) — i 로 배치 내 구분
                update.name = masked;
                update.birth = masked;         // 컬럼 20자 한도 내
                update.phone = masked;         // PII 익명화 (UK_User_Phone 은 제거됨 — 유일성 목적 아님)
```

### 인증 컨텍스트 (guards)

`req.user` 는 토큰이 아니라 **매 요청 DB 조회** 결과다. `store_id` 를 한 줄 더 뽑으면 `@PassportUser('store_id')` 로 바로 쓸 수 있고 스테일 문제가 없다.

```typescript
// src/guards/passport.jwt.auth/passport.jwt.auth.dto.ts — PassportUserResultDto 에 필드 추가
    @ApiProperty({description: '권한 ID', required: true})
    auth_id: string;

    @ApiProperty({description: '소속 가맹점 ID (인력 계정만 보유, 없으면 null)', required: true})
    store_id: string | null;
```

```typescript
// src/guards/passport.jwt.auth/passport.jwt.auth.service.ts — SELECT 에 1줄 추가
            builder.select(`
                  u.user_id 
                , u.login_id 
                , u.name 
                , u.gender
                , u.birth
                , u.nickname 
                , u.store_id 
                , a.auth_id 
                , s.state_id 
                , s.is_login_able 
            `);
```

### Input/Validation (DTO)

```typescript
// src/api/v1/store/dto/store-head-manager-register.dto.ts — 신규
import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, Matches, MaxLength } from 'class-validator';

/** 총괄매니저 계정 생성 입력 (ADMIN) */
export class StoreHeadManagerRegisterDto {
    @ApiProperty({description: '배정할 가맹점 ID (32자)'})
    @Matches(/^[a-f0-9]{32}$/, {message: '가맹점 ID 형식이 올바르지 않습니다.'})
    @IsNotEmpty({message: '가맹점 ID를 입력해주세요.'})
    store_id: string;

    @ApiProperty({description: '로그인 아이디 (4~30자, 영문/숫자/_)'})
    @Matches(/^[a-zA-Z0-9_]{4,30}$/, {message: '아이디는 4~30자의 영문, 숫자, 밑줄(_)만 사용할 수 있습니다.'})
    @IsNotEmpty({message: '아이디를 입력해주세요.'})
    login_id: string;

    @ApiProperty({description: '이름 (최대 50자)'})
    @MaxLength(50, {message: '이름은 최대 50자까지 입력할 수 있습니다.'})
    @IsNotEmpty({message: '이름을 입력해주세요.'})
    name: string;

    @ApiProperty({description: '성별', enum: ['M', 'F']})
    @IsIn(['M', 'F'], {message: '성별이 올바르지 않습니다.'})
    @IsNotEmpty({message: '성별을 입력해주세요.'})
    gender: string;

    @ApiProperty({description: '생년월일 (YYYY-MM-DD)', example: '1990-01-01'})
    @Matches(/^\d{4}-\d{2}-\d{2}$/, {message: '생년월일은 YYYY-MM-DD 형식이어야 합니다.'})
    @IsNotEmpty({message: '생년월일을 입력해주세요.'})
    birth: string;

    @ApiProperty({description: '닉네임 (최대 12자, 특수문자 불가)'})
    @MaxLength(12, {message: '닉네임은 최대 12자까지 입력할 수 있습니다.'})
    @Matches(/^[가-힣ㄱ-ㅎㅏ-ㅣa-zA-Z0-9\s]+$/, {message: '닉네임에 특수문자는 사용할 수 없습니다.'})
    @IsNotEmpty({message: '닉네임을 입력해주세요.'})
    nickname: string;
}

/** 총괄매니저 계정 생성 응답 — 임시 비밀번호는 여기서만 평문으로 노출된다 */
export class StoreHeadManagerRegisterResultDto {
    @ApiProperty({description: '생성된 회원 ID'})
    user_id: string;

    @ApiProperty({description: '로그인 아이디'})
    login_id: string;

    @ApiProperty({description: '임시 비밀번호 (이 응답에서만 확인 가능)'})
    temporary_password: string;
}
```

```typescript
// src/api/v1/store/dto/store-manager-register.dto.ts — 신규
// store_id 없음: 요청자(총괄매니저)의 store_id 를 자동 사용한다.
import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, Matches, MaxLength } from 'class-validator';

/** 매니저 계정 생성 입력 (총괄매니저) */
export class StoreManagerRegisterDto {
    @ApiProperty({description: '로그인 아이디 (4~30자, 영문/숫자/_)'})
    @Matches(/^[a-zA-Z0-9_]{4,30}$/, {message: '아이디는 4~30자의 영문, 숫자, 밑줄(_)만 사용할 수 있습니다.'})
    @IsNotEmpty({message: '아이디를 입력해주세요.'})
    login_id: string;

    @ApiProperty({description: '이름 (최대 50자)'})
    @MaxLength(50, {message: '이름은 최대 50자까지 입력할 수 있습니다.'})
    @IsNotEmpty({message: '이름을 입력해주세요.'})
    name: string;

    @ApiProperty({description: '성별', enum: ['M', 'F']})
    @IsIn(['M', 'F'], {message: '성별이 올바르지 않습니다.'})
    @IsNotEmpty({message: '성별을 입력해주세요.'})
    gender: string;

    @ApiProperty({description: '생년월일 (YYYY-MM-DD)', example: '1990-01-01'})
    @Matches(/^\d{4}-\d{2}-\d{2}$/, {message: '생년월일은 YYYY-MM-DD 형식이어야 합니다.'})
    @IsNotEmpty({message: '생년월일을 입력해주세요.'})
    birth: string;

    @ApiProperty({description: '닉네임 (최대 12자, 특수문자 불가)'})
    @MaxLength(12, {message: '닉네임은 최대 12자까지 입력할 수 있습니다.'})
    @Matches(/^[가-힣ㄱ-ㅎㅏ-ㅣa-zA-Z0-9\s]+$/, {message: '닉네임에 특수문자는 사용할 수 없습니다.'})
    @IsNotEmpty({message: '닉네임을 입력해주세요.'})
    nickname: string;
}

/** 매니저 계정 생성 응답 */
export class StoreManagerRegisterResultDto {
    @ApiProperty({description: '생성된 회원 ID'})
    user_id: string;

    @ApiProperty({description: '로그인 아이디'})
    login_id: string;

    @ApiProperty({description: '임시 비밀번호 (이 응답에서만 확인 가능)'})
    temporary_password: string;
}
```

```typescript
// src/api/v1/store/dto/store-staff-list.dto.ts — 신규
import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsOptional, Matches, MaxLength } from 'class-validator';
import { PaginationDto, PaginationResultDto } from '@root/common/dto/pagination.dto';

/**
 * 업체 인력 목록 입력.
 * Query DTO 규약 — 생성자 세트, 파라미터는 선택(ValidationPipe 가 인자 없이 new 한다).
 * 부모 필드 재선언 ❌ (useDefineForClassFields 로 기본값이 덮인다).
 */
export class StoreStaffListDto extends PaginationDto {
    @ApiProperty({description: '가맹점 ID (ADMIN 만 유효, 총괄매니저는 자기 업체로 고정)', required: false})
    @IsOptional()
    @Matches(/^[a-f0-9]{32}$/, {message: '가맹점 ID 형식이 올바르지 않습니다.'})
    store_id: string | null;

    @ApiProperty({description: '역할 필터', required: false, enum: ['HEAD_MANAGER', 'MANAGER']})
    @IsOptional()
    @IsIn(['HEAD_MANAGER', 'MANAGER'], {message: '역할이 올바르지 않습니다.'})
    auth_id: string | null;

    @ApiProperty({description: '검색어 — 아이디·이름·닉네임 통합 (최대 100자)', required: false})
    @IsOptional()
    @MaxLength(100, {message: '검색어는 최대 100자까지 입력할 수 있습니다.'})
    search_keyword: string | null;

    constructor(data?: Partial<StoreStaffListDto>) {
        super(data);
        this.store_id = data?.store_id ?? null;
        this.auth_id = data?.auth_id ?? null;
        this.search_keyword = data?.search_keyword ?? null;
    }
}

/** 인력 목록 항목 */
export class StoreStaffItemDto {
    @ApiProperty({description: '회원 ID'})
    user_id: string;

    @ApiProperty({description: '로그인 아이디'})
    login_id: string;

    @ApiProperty({description: '이름'})
    name: string;

    @ApiProperty({description: '닉네임'})
    nickname: string;

    @ApiProperty({description: '권한 ID (HEAD_MANAGER / MANAGER)'})
    auth_id: string;

    @ApiProperty({description: '상태 ID'})
    state_id: string;

    @ApiProperty({description: '소속 가맹점 ID'})
    store_id: string | null;

    @ApiProperty({description: '소속 가맹점 상호명 (없으면 null)'})
    store_name: string | null;

    @ApiProperty({description: '등록일'})
    create_at: Date;
}

/** 인력 목록 응답 */
export class StoreStaffListResultDto {
    @ApiProperty({description: '인력 목록', isArray: true, type: () => StoreStaffItemDto})
    list: Array<StoreStaffItemDto>;

    @ApiProperty({description: '페이지 정보', type: () => PaginationResultDto})
    pagination: PaginationResultDto;
}
```

```typescript
// src/api/v1/store/dto/store-staff-remove.dto.ts — 신규
import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, Matches } from 'class-validator';

/** 인력 계정 삭제 입력 (path param) */
export class StoreStaffRemoveParamDto {
    @ApiProperty({description: '회원 ID (32자)'})
    @Matches(/^[a-f0-9]{32}$/, {message: '회원 ID 형식이 올바르지 않습니다.'})
    @IsNotEmpty({message: '회원 ID를 입력해주세요.'})
    user_id: string;
}
```

```typescript
// src/api/v1/user/dto/user-password.dto.ts — 신규
import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, Matches, MaxLength } from 'class-validator';

/** 비밀번호 변경 입력 (로그인 회원 공용) */
export class UserPasswordDto {
    @ApiProperty({description: '현재 비밀번호'})
    @MaxLength(20, {message: '비밀번호는 20자 이하여야 합니다.'})
    @IsNotEmpty({message: '현재 비밀번호를 입력해주세요.'})
    current_password: string;

    @ApiProperty({description: '새 비밀번호 (8~20자, 영문+숫자 필수, 특수문자 !@#$%^&* 허용)'})
    @Matches(/^(?=.*[a-zA-Z])(?=.*\d)[a-zA-Z0-9!@#$%^&*]{8,20}$/, {message: '비밀번호는 8~20자이며 영문과 숫자를 반드시 포함해야 합니다. (특수문자는 !@#$%^&* 만 허용)'})
    @IsNotEmpty({message: '새 비밀번호를 입력해주세요.'})
    new_password: string;
}
```

```typescript
// src/api/v1/user/dto/user-general-login.dto.ts — UserGeneralLoginResultDto 에 필드 추가
export class UserGeneralLoginResultDto {
    @ApiProperty({description: 'Access Token (유효 20분)'})
    access_token: string;

    @ApiProperty({description: 'Refresh Token (유효 365일)'})
    refresh_token: string;

    @ApiProperty({description: 'Access Token 만료일시 (ISO 8601)'})
    access_token_expires_at: string;

    @ApiProperty({description: 'Refresh Token 만료일시 (ISO 8601)'})
    refresh_token_expires_at: string;

    @ApiProperty({description: '비밀번호 변경 필요 여부(0: 불필요, 1: 필요) — 임시 비밀번호로 발급된 인력 계정은 1'})
    is_password_change_required: number;
}
```

### Domain Util

```typescript
// src/api/v1/store/store.util.ts — import 교체 + 함수 2개 추가 (기존 2함수는 변경 없음)
import { randomInt } from 'crypto';
import { FindOptionsWhere, In, Like, Not } from 'typeorm';
import { StoreEntity } from './entities/store.entity';
import { UserEntity } from '@root/api/v1/user/entities/user.entity';

// …buildStoreSearchWhere / buildStoreDeleteBackup 변경 없음…

/** 임시 비밀번호 문자 풀 — 혼동 문자(I/l/O/0/1) 제외 */
const TEMP_PW_UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const TEMP_PW_LOWER = 'abcdefghijkmnpqrstuvwxyz';
const TEMP_PW_DIGIT = '23456789';
const TEMP_PW_SPECIAL = '!@#$%^&*';

/**
 * 인력 계정용 임시 비밀번호 생성 (12자).
 * 기존 비밀번호 정규식(영문+숫자 필수, 8~20자, 특수문자 !@#$%^&*)을 반드시 만족해야 한다 —
 * 발급 직후 이 값으로 로그인해야 하기 때문. 각 풀에서 1자씩 보장한 뒤 채우고 섞는다.
 */
export function generateTemporaryPassword(): string {
    const pools = [TEMP_PW_UPPER, TEMP_PW_LOWER, TEMP_PW_DIGIT, TEMP_PW_SPECIAL];
    const chars: string[] = pools.map((pool) => pool[randomInt(pool.length)]);
    const all = pools.join('');
    while (chars.length < 12) {
        chars.push(all[randomInt(all.length)]);
    }

    // 앞 4자리가 항상 대문자·소문자·숫자·특수문자 순서가 되지 않도록 섞는다
    for (let i = chars.length - 1; i > 0; i--) {
        const j = randomInt(i + 1);
        [chars[i], chars[j]] = [chars[j], chars[i]];
    }
    return chars.join('');
}

/**
 * 인력 검색 WHERE 조립.
 * 인력 = auth_id 가 HEAD_MANAGER/MANAGER 이고 LEAVE 가 아닌 계정. USER·ADMIN 은 대상이 아니다.
 * 검색어는 login_id·name·nickname 의 OR — TypeORM 은 where 배열을 OR 로 해석하므로
 * AND 조건(소속·역할·상태)을 각 원소에 모두 실어야 한다.
 */
export function buildStaffSearchWhere(store_id: string | null, auth_id: string | null, search_keyword: string | null): FindOptionsWhere<UserEntity> | FindOptionsWhere<UserEntity>[] {
    const base: FindOptionsWhere<UserEntity> = {
        auth_id: auth_id ? auth_id : In(['HEAD_MANAGER', 'MANAGER']),
        state_id: Not('LEAVE'),
    };
    if (store_id) {
        base.store_id = store_id;
    }

    if (!search_keyword) {
        return base;
    }

    const keyword = Like(`%${search_keyword}%`);
    return [
        {...base, login_id: keyword},
        {...base, name: keyword},
        {...base, nickname: keyword},
    ];
}
```

### Data Access (Repository)

`t_user`/`t_user_setting` 을 store repository 가 직접 다룬다(도메인 경계 결정). sibling 계약 유지 — 단건 조회는 `entity | null` + 500 만, 404 판단은 service([user.repository.ts:102](../../../../src/api/v1/user/repositories/user.repository.ts)).

```typescript
// src/api/v1/store/interfaces/store.repository.interface.ts — 전체
import { FindOptionsWhere } from 'typeorm';
import { StoreEntity } from '../entities/store.entity';
import { UserEntity } from '@root/api/v1/user/entities/user.entity';
import { UserSettingEntity } from '@root/api/v1/user/entities/user-setting.entity';

export interface StoreRepositoryInterface {
    insertStore(entity: StoreEntity): Promise<void>;
    countStore(where: FindOptionsWhere<StoreEntity> | FindOptionsWhere<StoreEntity>[]): Promise<number>;
    findStoreList(where: FindOptionsWhere<StoreEntity> | FindOptionsWhere<StoreEntity>[], limit: number, offset: number): Promise<StoreEntity[]>;
    findStore(where: FindOptionsWhere<StoreEntity>): Promise<StoreEntity | null>;
    findStores(where: FindOptionsWhere<StoreEntity>): Promise<StoreEntity[]>;
    updateStore(where: FindOptionsWhere<StoreEntity>, entity: StoreEntity): Promise<void>;

    insertStaff(entity: UserEntity): Promise<void>;
    insertStaffSetting(entity: UserSettingEntity): Promise<void>;
    findStaff(where: FindOptionsWhere<UserEntity>): Promise<UserEntity | null>;
    countStaff(where: FindOptionsWhere<UserEntity> | FindOptionsWhere<UserEntity>[]): Promise<number>;
    findStaffList(where: FindOptionsWhere<UserEntity> | FindOptionsWhere<UserEntity>[], limit: number, offset: number): Promise<UserEntity[]>;
    updateStaff(where: FindOptionsWhere<UserEntity>, entity: UserEntity): Promise<void>;
}
```

```typescript
// src/api/v1/store/repositories/store.repository.ts — 생성자 확장 + 메서드 7개 추가
import { BadRequestException, Injectable, InternalServerErrorException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, Repository } from 'typeorm';
import { StoreEntity } from '../entities/store.entity';
import { UserEntity } from '@root/api/v1/user/entities/user.entity';
import { UserSettingEntity } from '@root/api/v1/user/entities/user-setting.entity';
import { StoreRepositoryInterface } from '../interfaces/store.repository.interface';

@Injectable()
export class StoreRepository implements StoreRepositoryInterface {
    constructor(
        @InjectRepository(StoreEntity)
        private readonly storeRepository: Repository<StoreEntity>,
        @InjectRepository(UserEntity)
        private readonly userRepository: Repository<UserEntity>,
        @InjectRepository(UserSettingEntity)
        private readonly userSettingRepository: Repository<UserSettingEntity>,
    ) {}

    // …insertStore / countStore / findStoreList / findStore / updateStore 변경 없음…

    /**
     * 가맹점 다건 조회 (인력 목록의 상호명 매핑용 — 페이지네이션 없음)
     */
    async findStores(where: FindOptionsWhere<StoreEntity>): Promise<StoreEntity[]> {
        try {
            return await this.storeRepository.find({where, loadRelationIds: true});
        } catch (error) {
            throw new InternalServerErrorException({message: '서버에서 오류가 발생했습니다. 관리자에게 문의해주세요.'});
        }
    }

    /**
     * 인력 계정 등록
     */
    async insertStaff(entity: UserEntity): Promise<void> {
        try {
            await this.userRepository.insert(entity);
        } catch (error) {
            if (error.errno === 1062 && error.sqlMessage.indexOf('UK_User_LoginId') !== -1) {
                throw new BadRequestException({message: '이미 존재하는 로그인 ID입니다.'});
            } else if (error.errno === 1062 && error.sqlMessage.indexOf('UK_User_UserSearchCode') !== -1) {
                throw new BadRequestException({message: '이미 존재하는 검색 코드입니다.'});
            } else if (error.errno === 1452 && error.sqlMessage.indexOf('FK_User_Auth') !== -1) {
                throw new BadRequestException({message: '존재하지 않는 권한입니다.'});
            } else if (error.errno === 1452 && error.sqlMessage.indexOf('FK_User_State') !== -1) {
                throw new BadRequestException({message: '존재하지 않는 상태입니다.'});
            } else if (error.errno === 1452 && error.sqlMessage.indexOf('FK_User_Store') !== -1) {
                throw new BadRequestException({message: '존재하지 않는 가맹점입니다.'});
            } else {
                throw new InternalServerErrorException({message: '서버에서 오류가 발생했습니다. 관리자에게 문의해주세요.'});
            }
        }
    }

    /**
     * 인력 계정 설정 등록 — 이 행이 없으면 getLoginUser 의 INNER JOIN 에서 걸려 로그인이 불가하다
     */
    async insertStaffSetting(entity: UserSettingEntity): Promise<void> {
        try {
            await this.userSettingRepository.insert(entity);
        } catch (error) {
            if (error.errno === 1452 && error.sqlMessage.indexOf('FK_UserSetting_User') !== -1) {
                throw new BadRequestException({message: '존재하지 않는 회원입니다.'});
            } else {
                throw new InternalServerErrorException({message: '서버에서 오류가 발생했습니다. 관리자에게 문의해주세요.'});
            }
        }
    }

    /**
     * 인력 단건 조회
     */
    async findStaff(where: FindOptionsWhere<UserEntity>): Promise<UserEntity | null> {
        try {
            return await this.userRepository.findOne({where, loadRelationIds: true});
        } catch (error) {
            throw new InternalServerErrorException({message: '서버에서 오류가 발생했습니다. 관리자에게 문의해주세요.'});
        }
    }

    /**
     * 인력 총 개수 조회 (페이지 계산용)
     */
    async countStaff(where: FindOptionsWhere<UserEntity> | FindOptionsWhere<UserEntity>[]): Promise<number> {
        try {
            return await this.userRepository.count({where});
        } catch (error) {
            throw new InternalServerErrorException({message: '서버에서 오류가 발생했습니다. 관리자에게 문의해주세요.'});
        }
    }

    /**
     * 인력 목록 조회 — 총괄매니저가 위로 오도록 권한 오름차순, 그다음 최근 등록 순
     */
    async findStaffList(where: FindOptionsWhere<UserEntity> | FindOptionsWhere<UserEntity>[], limit: number, offset: number): Promise<UserEntity[]> {
        try {
            return await this.userRepository.find({where, loadRelationIds: true, order: {auth_id: 'ASC', create_at: 'DESC'}, skip: offset, take: limit});
        } catch (error) {
            throw new InternalServerErrorException({message: '서버에서 오류가 발생했습니다. 관리자에게 문의해주세요.'});
        }
    }

    /**
     * 인력 계정 수정 — new UserEntity() + 필드 할당으로 호출(@BeforeUpdate update_at 트리거)
     */
    async updateStaff(where: FindOptionsWhere<UserEntity>, entity: UserEntity): Promise<void> {
        try {
            await this.userRepository.update(where, entity);
        } catch (error) {
            throw new InternalServerErrorException({message: '서버에서 오류가 발생했습니다. 관리자에게 문의해주세요.'});
        }
    }
}
```

### Business Logic (Service)

```typescript
// src/api/v1/store/store.service.ts — import 추가 + public 4개 추가
import { ForbiddenException, Inject, Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { Transactional } from 'typeorm-transactional';
import { v4 } from 'uuid';
import { In } from 'typeorm';
import { Pagination } from '@root/common/utils/pagination';
import { getBcrypt } from '@root/common/utils/bcrypt';
import { UserEntity } from '@root/api/v1/user/entities/user.entity';
import { UserSettingEntity } from '@root/api/v1/user/entities/user-setting.entity';
import { StoreHeadManagerRegisterDto, StoreHeadManagerRegisterResultDto } from './dto/store-head-manager-register.dto';
import { StoreManagerRegisterDto, StoreManagerRegisterResultDto } from './dto/store-manager-register.dto';
import { StoreStaffListDto, StoreStaffListResultDto } from './dto/store-staff-list.dto';
import { StoreStaffRemoveParamDto } from './dto/store-staff-remove.dto';
import { buildStoreSearchWhere, buildStoreDeleteBackup, buildStaffSearchWhere, generateTemporaryPassword } from './store.util';
// …기존 import 유지…

    /**
     * 총괄매니저 계정 생성 — ADMIN 이 업체를 지정해 만든다. 업체당 1명 고정.
     * 임시 비밀번호를 발급해 응답에 1회 노출하고, 저장은 bcrypt 해시만 한다.
     */
    @Transactional()
    async headManagerRegister(dto: StoreHeadManagerRegisterDto): Promise<StoreHeadManagerRegisterResultDto> {
        // 1. 대상 가맹점 확인 (삭제된 가맹점에는 배정 불가)
        const store = await this.storeRepository.findStore({store_id: dto.store_id, is_delete: 0});
        if (!store) {
            throw new NotFoundException({message: '가맹점을 찾을 수 없습니다.'});
        }

        // 2. 업체당 총괄매니저 1명 고정 — 이미 있으면 거부
        const existing = await this.storeRepository.findStaff({store_id: dto.store_id, auth_id: 'HEAD_MANAGER', state_id: In(['ACTIVE', 'BLOCK', 'LEAVE_WAIT'])});
        if (existing) {
            throw new BadRequestException({message: '이미 총괄매니저가 지정된 가맹점입니다.'});
        }

        // 3. 계정 생성 (login_id 중복은 UK_User_LoginId 분기 400)
        const temporary_password = generateTemporaryPassword();
        const user_id = v4().replace(/-/g, '');
        const userEntity = new UserEntity();
        userEntity.user_id = user_id;
        userEntity.user_search_code = v4().replace(/-/g, '');
        userEntity.auth_id = 'HEAD_MANAGER';
        userEntity.state_id = 'ACTIVE';
        userEntity.store_id = dto.store_id;
        userEntity.sns_id = null;
        userEntity.sns_user_id = null;
        userEntity.login_id = dto.login_id;
        userEntity.login_pw = await getBcrypt(temporary_password);
        userEntity.name = dto.name;
        userEntity.gender = dto.gender;
        userEntity.birth = dto.birth;
        userEntity.phone = null;
        userEntity.nickname = dto.nickname;
        userEntity.device_os = null;
        userEntity.device_token = null;
        userEntity.is_password_change_required = 1;
        await this.storeRepository.insertStaff(userEntity);

        // 4. t_user_setting 동반 생성 — 없으면 getLoginUser 의 INNER JOIN 에서 걸려 로그인 불가
        const userSettingEntity = new UserSettingEntity();
        userSettingEntity.user_setting_id = v4().replace(/-/g, '');
        userSettingEntity.user_id = user_id;
        userSettingEntity.bio = null;
        await this.storeRepository.insertStaffSetting(userSettingEntity);

        return {user_id, login_id: dto.login_id, temporary_password};
    }

    /**
     * 매니저 계정 생성 — 총괄매니저가 자기 업체에 만든다. store_id 는 요청자 것으로 자동 확정.
     */
    @Transactional()
    async managerRegister(store_id: string, dto: StoreManagerRegisterDto): Promise<StoreManagerRegisterResultDto> {
        // 1. 요청자 소속 확인 (데이터 이상 방어)
        if (!store_id) {
            throw new BadRequestException({message: '소속된 가맹점이 없습니다.'});
        }

        // 2. 대상 가맹점 확인 (폐점된 업체에는 충원 불가)
        const store = await this.storeRepository.findStore({store_id, is_delete: 0});
        if (!store) {
            throw new NotFoundException({message: '가맹점을 찾을 수 없습니다.'});
        }

        // 3. 계정 생성 — 매니저 수 상한 없음
        const temporary_password = generateTemporaryPassword();
        const user_id = v4().replace(/-/g, '');
        const userEntity = new UserEntity();
        userEntity.user_id = user_id;
        userEntity.user_search_code = v4().replace(/-/g, '');
        userEntity.auth_id = 'MANAGER';
        userEntity.state_id = 'ACTIVE';
        userEntity.store_id = store_id;
        userEntity.sns_id = null;
        userEntity.sns_user_id = null;
        userEntity.login_id = dto.login_id;
        userEntity.login_pw = await getBcrypt(temporary_password);
        userEntity.name = dto.name;
        userEntity.gender = dto.gender;
        userEntity.birth = dto.birth;
        userEntity.phone = null;
        userEntity.nickname = dto.nickname;
        userEntity.device_os = null;
        userEntity.device_token = null;
        userEntity.is_password_change_required = 1;
        await this.storeRepository.insertStaff(userEntity);

        // 4. t_user_setting 동반 생성
        const userSettingEntity = new UserSettingEntity();
        userSettingEntity.user_setting_id = v4().replace(/-/g, '');
        userSettingEntity.user_id = user_id;
        userSettingEntity.bio = null;
        await this.storeRepository.insertStaffSetting(userSettingEntity);

        return {user_id, login_id: dto.login_id, temporary_password};
    }

    /**
     * 업체 인력 목록 — ADMIN 은 전 업체(store_id 로 좁힐 수 있음), 총괄매니저는 자기 업체로 강제 고정.
     */
    async staffList(auth_id: string, my_store_id: string, dto: StoreStaffListDto): Promise<StoreStaffListResultDto> {
        // 1. 스코프 결정 — 총괄매니저는 파라미터를 보내도 무시하고 자기 업체로 고정
        const scoped_store_id = auth_id === 'HEAD_MANAGER' ? my_store_id : dto.store_id;
        const where = buildStaffSearchWhere(scoped_store_id, dto.auth_id, dto.search_keyword);

        // 2. 총 개수 → 페이지 계산
        const total_count = await this.storeRepository.countStaff(where);
        const pagination = new Pagination({
            all_search_yn: dto.all_search_yn as 'Y' | 'N',
            total_count,
            page: dto.page,
            size: dto.size,
            page_size: dto.page_size,
        });

        // 3. 목록 조회
        const staffs = await this.storeRepository.findStaffList(where, pagination.limit, pagination.offset);

        // 4. 상호명 매핑 (한 번의 추가 조회로 해결 — 행마다 조회하지 않는다)
        const store_ids = [...new Set(staffs.map((staff) => staff.store_id).filter((id) => !!id))];
        const stores = store_ids.length > 0 ? await this.storeRepository.findStores({store_id: In(store_ids)}) : [];
        const storeNames = new Map(stores.map((store) => [store.store_id, store.store_name]));

        return {
            list: staffs.map((staff) => ({
                user_id: staff.user_id,
                login_id: staff.login_id,
                name: staff.name,
                nickname: staff.nickname,
                auth_id: staff.auth_id,
                state_id: staff.state_id,
                store_id: staff.store_id,
                store_name: staff.store_id ? (storeNames.get(staff.store_id) ?? null) : null,
                create_at: staff.create_at,
            })),
            pagination: pagination.getPagination(),
        };
    }

    /**
     * 인력 계정 삭제 — state_id 를 LEAVE 로 전이하는 soft delete.
     * t_state 의 LEAVE 는 is_login_able=0 이라 getLoginUser 에서 걸러져 즉시 로그인이 차단된다.
     * store_id 는 지우지 않는다 — 소속 이력 보존 + 미배정 계정을 만들지 않기 위해.
     */
    @Transactional()
    async staffRemove(auth_id: string, my_store_id: string, param: StoreStaffRemoveParamDto): Promise<void> {
        // 1. 대상 확인 (이미 LEAVE 면 404)
        const staff = await this.storeRepository.findStaff({user_id: param.user_id, auth_id: In(['HEAD_MANAGER', 'MANAGER']), state_id: In(['ACTIVE', 'BLOCK', 'LEAVE_WAIT'])});
        if (!staff) {
            throw new NotFoundException({message: '인력을 찾을 수 없습니다.'});
        }

        // 2. 총괄매니저는 자기 업체의 MANAGER 만 삭제할 수 있다 (자신·타 총괄 삭제 불가)
        if (auth_id === 'HEAD_MANAGER' && (staff.store_id !== my_store_id || staff.auth_id !== 'MANAGER')) {
            throw new ForbiddenException({message: '접근 권한이 없습니다.'});
        }

        // 3. 상태 전이 — store_id 는 그대로 둔다
        const userEntity = new UserEntity();
        userEntity.state_id = 'LEAVE';
        await this.storeRepository.updateStaff({user_id: param.user_id}, userEntity);
    }
```

```typescript
// src/api/v1/user/user.service.ts — public 1개 추가 + generalLogin 반환 확장
    /**
     * 비밀번호 변경 — 로그인 회원 공용. 성공 시 변경 필요 플래그를 함께 내린다.
     */
    @Transactional()
    async changePassword(user_id: string, dto: UserPasswordDto): Promise<void> {
        // 1. 대상 조회
        const user = await this.userRepository.findUser({user_id});
        if (!user) {
            throw new NotFoundException({message: '회원 정보를 찾을 수 없습니다.'});
        }

        // 2. 현재 비밀번호 검증
        const matched = await matchBcrypt(dto.current_password, user.login_pw);
        if (!matched) {
            throw new BadRequestException({message: '현재 비밀번호가 일치하지 않습니다.'});
        }

        // 3. 동일 비밀번호 차단
        const same = await matchBcrypt(dto.new_password, user.login_pw);
        if (same) {
            throw new BadRequestException({message: '기존 비밀번호와 다른 비밀번호를 입력해주세요.'});
        }

        // 4. 변경 + 플래그 해제
        const userEntity = new UserEntity();
        userEntity.login_pw = await getBcrypt(dto.new_password);
        userEntity.is_password_change_required = 0;
        await this.userRepository.updateUser({user_id}, userEntity);
    }
```

```typescript
// src/api/v1/user/user.service.ts — generalLogin 의 return 문만 변경
        return {
            access_token: tokens.accessToken,
            refresh_token: tokens.refreshToken,
            access_token_expires_at: tokens.accessTokenExpiresAt.toISOString(),
            refresh_token_expires_at: tokens.refreshTokenExpiresAt.toISOString(),
            is_password_change_required: user.is_password_change_required,
        };
```

### Entry Point (Controller)

```typescript
// src/api/v1/store/store.controller.ts — 핸들러 4개 추가 (import 는 신규 DTO 4종 + PassportUser)
import { PassportUser } from '@root/guards/passport.jwt.auth/passport.jwt.auth.decorator';

    /**
     * 총괄매니저 계정 생성 (SUPER_ADMIN / ADMIN 전용)
     */
    @Post('/head-manager/register')
    @UseGuards(PassportJwtAuthGuard, RolesGuard)
    @Roles('SUPER_ADMIN', 'ADMIN')
    @HttpCode(200)
    @ApiOperation({summary: '총괄매니저 계정 생성'})
    @ApiBody({type: StoreHeadManagerRegisterDto})
    @ApiOkResponse({type: StoreHeadManagerRegisterResultDto})
    @ApiBadRequestResponse({type: ApiBadRequestResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiForbiddenResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async headManagerRegister(@Body() dto: StoreHeadManagerRegisterDto): Promise<StoreHeadManagerRegisterResultDto> {
        return this.storeService.headManagerRegister(dto);
    }

    /**
     * 매니저 계정 생성 (총괄매니저 전용 — 자기 업체에 충원)
     */
    @Post('/manager/register')
    @UseGuards(PassportJwtAuthGuard, RolesGuard)
    @Roles('HEAD_MANAGER')
    @HttpCode(200)
    @ApiOperation({summary: '매니저 계정 생성'})
    @ApiBody({type: StoreManagerRegisterDto})
    @ApiOkResponse({type: StoreManagerRegisterResultDto})
    @ApiBadRequestResponse({type: ApiBadRequestResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiForbiddenResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async managerRegister(@PassportUser('store_id') store_id: string, @Body() dto: StoreManagerRegisterDto): Promise<StoreManagerRegisterResultDto> {
        return this.storeService.managerRegister(store_id, dto);
    }

    /**
     * 업체 인력 목록 조회 (ADMIN 전체 / 총괄매니저 자기 업체)
     */
    @Get('/staff/list')
    @UseGuards(PassportJwtAuthGuard, RolesGuard)
    @Roles('SUPER_ADMIN', 'ADMIN', 'HEAD_MANAGER')
    @HttpCode(200)
    @ApiOperation({summary: '업체 인력 목록 조회'})
    @ApiOkResponse({type: StoreStaffListResultDto})
    @ApiBadRequestResponse({type: ApiBadRequestResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiForbiddenResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async staffList(@PassportUser('auth_id') auth_id: string, @PassportUser('store_id') store_id: string, @Query() query: StoreStaffListDto): Promise<StoreStaffListResultDto> {
        const dto = new StoreStaffListDto(query);
        return this.storeService.staffList(auth_id, store_id, dto);
    }

    /**
     * 인력 계정 삭제 (ADMIN 은 인력 전체 / 총괄매니저는 자기 업체 매니저만)
     */
    @Delete('/staff/remove/:user_id')
    @UseGuards(PassportJwtAuthGuard, RolesGuard)
    @Roles('SUPER_ADMIN', 'ADMIN', 'HEAD_MANAGER')
    @HttpCode(204)
    @ApiOperation({summary: '인력 계정 삭제'})
    @ApiNoContentResponse()
    @ApiBadRequestResponse({type: ApiBadRequestResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiForbiddenResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async staffRemove(@PassportUser('auth_id') auth_id: string, @PassportUser('store_id') store_id: string, @Param() param: StoreStaffRemoveParamDto): Promise<void> {
        return this.storeService.staffRemove(auth_id, store_id, param);
    }
```

```typescript
// src/api/v1/user/user.controller.ts — 핸들러 1개 추가
    /**
     * 비밀번호 변경 (로그인 회원 공용)
     */
    @Patch('/password')
    @UseGuards(PassportJwtAuthGuard)
    @HttpCode(204)
    @ApiOperation({summary: '비밀번호 변경'})
    @ApiBody({type: UserPasswordDto})
    @ApiNoContentResponse()
    @ApiBadRequestResponse({type: ApiBadRequestResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async changePassword(@PassportUser('user_id') user_id: string, @Body() dto: UserPasswordDto): Promise<void> {
        return this.userService.changePassword(user_id, dto);
    }
```

### Module

```typescript
// src/api/v1/store/store.module.ts — forFeature 확장 (providers/controllers 변경 없음)
import { UserEntity } from '@root/api/v1/user/entities/user.entity';
import { UserSettingEntity } from '@root/api/v1/user/entities/user-setting.entity';

@Module({
    imports: [
        TypeORMModule,
        TypeOrmModule.forFeature([StoreEntity, UserEntity, UserSettingEntity]),
        PassportJwtAuthModule,
    ],
    controllers: [StoreController],
    providers: [
        StoreService,
        {provide: STORE_REPOSITORY, useClass: StoreRepository},
    ],
})
export class StoreModule {}
```

---

## Test Cases

지배적 스타일 ① — 실제 controller+service+`ValidationPipe`+`CustomErrorFilter` 부팅, repository 만 Symbol 토큰 mock, `PassportJwtAuthGuard` 만 override 하고 `RolesGuard` 는 실제 구현. 상단 `typeorm-transactional` mock. `generateTemporaryPassword`/`getBcrypt` 는 `jest.spyOn`+`mockRestore`.

```
── store-head-manager-register.spec.ts ───────────────────────
[SUCCESS]            정상 생성 — 200, 응답 {user_id(32자 hex), login_id, temporary_password}. insertStaff entity 전 컬럼 단언(auth_id='HEAD_MANAGER', state_id='ACTIVE', store_id=요청값, is_password_change_required=1, sns_id/phone/device_* = null), login_pw 가 평문과 다름(해시됨)
[SUCCESS]            insertStaffSetting 이 1회 호출되고 user_id 가 insertStaff 의 user_id 와 동일 (로그인 가능 조건)
[SUCCESS]            임시 비밀번호가 비밀번호 정규식을 만족 — /^(?=.*[a-zA-Z])(?=.*\d)[a-zA-Z0-9!@#$%^&*]{8,20}$/
[FAIL:validation]    store_id 형식 오류 / login_id 3자 / gender 'X' / birth 형식 오류 / nickname 특수문자 — 각각 400 + property 단언, findStore 미호출
[FAIL:service]       findStore 가 null → 404 '가맹점을 찾을 수 없습니다.', insertStaff 미호출
[FAIL:service]       이미 총괄매니저 존재 → 400 '이미 총괄매니저가 지정된 가맹점입니다.', insertStaff 미호출
[FAIL:duplicate]     insertStaff 가 UK_User_LoginId 400 → 그대로 전달, insertStaffSetting 미호출
[FAIL:auth]          미인증 401 / USER 403 / MANAGER 403 / HEAD_MANAGER 403 — findStore 미호출
[FAIL:repository]    insertStaffSetting throw → 500

── store-manager-register.spec.ts ────────────────────────────
[SUCCESS]            정상 생성 — 200, insertStaff entity 의 auth_id='MANAGER', store_id 가 요청자(@PassportUser)의 store_id 와 동일
[SUCCESS]            DTO 에 store_id 를 끼워보내도 무시되고 요청자 store_id 가 쓰인다
[FAIL:service]       요청자 store_id 가 null → 400 '소속된 가맹점이 없습니다.', findStore 미호출
[FAIL:service]       findStore 가 null(폐점) → 404, insertStaff 미호출
[FAIL:auth]          ADMIN 403 / USER 403 / 미인증 401 — RolesGuard 가 HEAD_MANAGER 만 통과시킴
[FAIL:repository]    insertStaff throw → 500

── store-staff-list.spec.ts ──────────────────────────────────
[SUCCESS]            ADMIN 전체 조회 — where 의 auth_id 가 In(['HEAD_MANAGER','MANAGER']), state_id 가 Not('LEAVE'), store_id 조건 없음
[SUCCESS]            ADMIN + store_id 파라미터 → where 에 store_id 포함
[SUCCESS]            총괄매니저 — dto.store_id 에 남의 업체를 넣어도 무시되고 자기 store_id 로 고정 (권한 우회 방지)
[SUCCESS]            auth_id=MANAGER 필터 → where.auth_id 가 In 이 아니라 'MANAGER'
[SUCCESS]            search_keyword → 3원소 OR 배열(login_id·name·nickname), 각 원소가 base 조건을 모두 보유
[SUCCESS]            상호명 매핑 — findStores 가 In(중복제거된 store_ids) 로 1회만 호출되고 응답 store_name 이 매핑됨
[SUCCESS]            store_id 가 null 인 인력은 store_name 도 null
[SUCCESS]            쿼리 파라미터 전무 — 기본값으로 findStaffList(…, 20, 0), pagination.page=1
[FAIL:validation]    auth_id 허용값 밖 → 400, countStaff 미호출
[FAIL:auth]          USER 403 / MANAGER 403 / 미인증 401
[FAIL:repository]    countStaff throw → 500, findStaffList 미호출

── store-staff-remove.spec.ts ────────────────────────────────
[SUCCESS]            ADMIN 이 매니저 삭제 — 204, updateStaff 인자 entity.state_id==='LEAVE' 이고 store_id 는 손대지 않음(undefined)
[SUCCESS]            ADMIN 이 총괄매니저 삭제 — 204 (제한 없음)
[SUCCESS]            총괄매니저가 자기 업체 매니저 삭제 — 204
[FAIL:service]       총괄매니저가 다른 업체 매니저 삭제 → 403 '접근 권한이 없습니다.', updateStaff 미호출
[FAIL:service]       총괄매니저가 총괄매니저(자신 포함) 삭제 → 403, updateStaff 미호출
[FAIL:service]       findStaff 가 null(이미 LEAVE) → 404 '인력을 찾을 수 없습니다.', updateStaff 미호출
[FAIL:validation]    user_id 형식 오류 → 400, findStaff 미호출
[FAIL:auth]          USER 403 / 미인증 401
[FAIL:repository]    updateStaff throw → 500

── user-password.spec.ts ─────────────────────────────────────
[SUCCESS]            정상 변경 — 204, updateStaff… 아닌 updateUser 인자 entity.login_pw 가 해시이고 is_password_change_required===0
[FAIL:validation]    new_password 정규식 위반(영문만/7자/허용 외 특수문자) → 400, findUser 미호출
[FAIL:service]       findUser 가 null → 404 '회원 정보를 찾을 수 없습니다.'
[FAIL:service]       current_password 불일치 → 400 '현재 비밀번호가 일치하지 않습니다.', updateUser 미호출
[FAIL:service]       new_password 가 현재와 동일 → 400 '기존 비밀번호와 다른 비밀번호를 입력해주세요.', updateUser 미호출
[FAIL:auth]          미인증 401
[FAIL:repository]    updateUser throw → 500

── user-general-login.spec.ts (수정) ─────────────────────────
[SUCCESS]            응답에 is_password_change_required 가 포함되고 조회된 회원 값과 일치 (1/0 두 케이스)

── seeder.spec.ts (수정) ─────────────────────────────────────
[SUCCESS]            AUTH_SEED_DATA 에 HEAD_MANAGER(총괄매니저, level 102)가 포함되고 시드 대상이 5건

── 전화번호 중복 허용 (신규 단언 없음 — 회귀 확인만) ─────────
· UK_User_Phone 분기를 단언하는 기존 spec 은 0건(grep 확인) → 삭제로 깨지는 테스트 없음
· user-leave-cleanup.spec.ts 의 phone 마스킹 단언(_0/_1 서로 다름)은 그대로 통과 — 마스킹 로직을 건드리지 않기 때문
· 신규 케이스를 만들지 않는다: 전화번호를 저장하는 흐름이 아직 없어 "중복 저장이 성공한다"를 실행할 진입점이 없다.
  전화번호를 받는 기능이 생기는 시점에 그 기능의 spec 에서 중복 허용을 단언한다

── [SMOKE:data-access] (store-staff-list.spec.ts 내 별도 describe) ──
[SMOKE:data-access]  buildStaffSearchWhere 의 4가지 반환(기본·store_id 지정·auth_id 지정·검색어 OR 배열)을 DataSource 무연결로 쿼리 빌드 — auth_id/state_id/store_id 는 @ManyToOne 관계 필드라 매핑 민감. 생성 SQL 에 대상 컬럼명과 IN/LIKE 가 포함되는지 확인
[SMOKE:data-access]  findStaffList 의 order:{auth_id:'ASC', create_at:'DESC'} + skip/take 조합이 관계 필드 정렬에서 throw 없이 빌드되는지 확인
[SMOKE:data-access]  UserEntity 위험 매핑(프로퍼티명 ≠ 컬럼명) 스냅샷 — store_id 추가 후에도 [] 유지
```

> `[SMOKE:data-access]` 필수 사유 — `buildStaffSearchWhere` 는 `auth_id`·`state_id`·`store_id`(전부 `@ManyToOne` 관계 필드)에 `In`/`Not`/스칼라를 섞고 where 배열 OR 까지 쓴다. docs/testing.md 의 "관계 필드 where" 정의에 정면으로 해당하며, repository mock 스펙은 이 매핑 코드를 한 줄도 실행하지 않는다. `DataSource` 옵션에 `database` 를 반드시 넣는다(없으면 `buildMetadatas()` 가 `NoConnectionOptionError`).

---

## Response Codes

| Code | Cause |
|------|------|
| 200 | 총괄매니저·매니저 계정 생성 성공(`{user_id, login_id, temporary_password}`) / 인력 목록 조회 성공 |
| 204 | 인력 삭제 성공 / 비밀번호 변경 성공 |
| 400 | 입력 검증 실패 — `{message, validationErrors}` · 이미 총괄매니저 존재 · 소속 가맹점 없음 · `login_id` 중복 · 현재 비밀번호 불일치 · 기존과 동일한 비밀번호 (비즈니스 오류는 `{message}` 단독) |
| 401 | 미인증 — `PassportJwtAuthGuard` 거부 |
| 403 | 권한 불일치(`RolesGuard`) 또는 "내 업체 아님"(service 판정) — `{message: '접근 권한이 없습니다.'}` |
| 404 | 가맹점 없음 · 인력 없음(이미 `LEAVE` 포함) · 회원 없음 |
| 500 | repository 실패 — `{message: '서버에서 오류가 발생했습니다. 관리자에게 문의해주세요.'}` |
