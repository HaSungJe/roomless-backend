# Plan — user-sms-verification (회원 스키마 확장 + SMS 인증)

## Feature Summary
- **Feature**: 회원 스키마 확장 + SMS 인증 — 컬럼 이름 정리(선행), 가입 후 휴대폰 SMS 인증, 아이디 찾기 · 비밀번호 초기화(SMS), 인증 기록 DB 보관 · 하루 발송 한도, 첫 총관리자 시드
- **Entry point**: `POST (큐 경로 6개) /api/v1/user/phone-verification · /phone-verification/confirm · /find-login-id · /find-login-id/confirm · /password-reset · /password-reset/confirm`
- **Domain**: user (로드맵 Phase 4 — #21 · #22 · #23 + Phase 5 에서 옮겨 온 #26 · #27)
- **Spec**: [user-sms-verification-spec.md](../../spec/user/user-sms-verification-spec.md)

---

## Prerequisites

- [x] AWS SMS 세팅은 build 를 막지 않는다. 코드 · 테스트는 AWS 없이 통과한다(SMS 포트는 spec 에서 mock). 실제 발송은 사용자가 `docs/guides/aws-setup.md` 대로 세팅한 뒤에 된다.
- [x] DB 스키마 반영(마이그레이션 적용)은 build 를 막지 않는다(AGENTS.md 주의사항). build 는 엔티티 수정 → `npm run db:generate -- SmsVerification` → `npm run db:check` 까지만 한다.

---

## File List

| File | Action |
|------|------|
| `libs/database/src/migrations/<ts>-RenameColumns.ts` · `libs/database/src/migrations.ts` | new · modified — 컬럼 이름 정리(손으로 쓴 RENAME, SmsVerification 보다 먼저) |
| `libs/database/src/entities/api-log/api-log.entity.ts` · `store/store.entity.ts` · `user/session.entity.ts` · `user/session-refresh.entity.ts` · `user/state.entity.ts` · `user/user-setting.entity.ts` | modified — 컬럼 이름 정리 |
| `libs/database/src/entities/user/sms-purpose.entity.ts` | new — `t_sms_purpose` 룩업 (#22) |
| `libs/database/src/entities/user/sms-verification.entity.ts` | new — `t_sms_verification` 발송 · 확인 기록 (#22) |
| `libs/database/src/entities/user/user.entity.ts` | modified — 컬럼 이름 정리 · `phone_verified_at` · `UK_User_Phone` · phone 주석 (#21) |
| `libs/database/src/entities.ts` | modified — `ENTITIES` 에 2개 |
| `libs/database/src/migrations/<ts>-SmsVerification.ts` · `libs/database/src/migrations.ts` | new · modified — `npm run db:generate -- SmsVerification` 결과 |
| `libs/database/src/seeder/seeder.targets.ts` | modified — `SMS_PURPOSE_SEED_DATA` · 첫 총관리자 · 회원설정 시드 · `SeedTarget.data` 함수 허용 (#22 · #23) |
| `libs/database/src/seeder/seeder.service.ts` · `seeder.util.ts` | modified — 만드는 함수 실행 · 확인 컬럼(key) 기준 멱등 (#23) |
| `libs/database/src/test/seeder.spec.ts` | modified — 새 대상 · 총관리자 시드(login_id 기준) · 함수 실패 격리 |
| `libs/contracts/src/user/user.commands.ts` | modified — 명령 6개 |
| `libs/contracts/src/user/dto/user-phone-verification.dto.ts` | new (#26) |
| `libs/contracts/src/user/dto/user-phone-verification-confirm.dto.ts` | new (#26) |
| `libs/contracts/src/user/dto/user-find-login-id.dto.ts` | new (#27) |
| `libs/contracts/src/user/dto/user-find-login-id-confirm.dto.ts` | new (#27) |
| `libs/contracts/src/user/dto/user-password-reset.dto.ts` | new (#27) |
| `libs/contracts/src/user/dto/user-password-reset-confirm.dto.ts` | new (#27) |
| `libs/contracts/src/user/dto/user-sign.dto.ts` · `user-login.dto.ts` | modified — `sns_id` 를 NAVER · KAKAO 로, 결과에 `is_phone_verified` |
| `libs/contracts/src/user/dto/user-general-sign.dto.ts` · `user-general-login.dto.ts` · `user-auth-user.dto.ts` | modified — 결과에 `is_phone_verified` |
| `apps/user-service/src/user/interfaces/user.repository.interface.ts` | modified — SMS 인증 메서드 5개, `LoginUserRow.phone_verified_at` |
| `apps/user-service/src/user/repositories/user.repository.ts` | modified — `is_login_allowed` · SMS 인증 메서드 5개 · `UK_User_Phone` 분기 · 로그인 회원 조회에 `phone_verified_at` |
| `apps/user-service/src/user/user.util.ts` | modified — 인증 상수 · 계산 util 7개 · auth-user 결과에 `is_phone_verified` |
| `apps/user-service/src/user/user.service.ts` | modified — 바뀐 컬럼 이름, SMS 포트 주입, 메서드 6개, 가입 · 로그인 결과에 `is_phone_verified` |
| `apps/user-service/src/user/user.handler.ts` | modified — `@OnCommand` 6개 |
| `apps/user-service/src/user-service.module.ts` | modified — `SmsModule` import (외부 연동 포트 첫 사용처) |
| `apps/user-service/src/user/test/user.test-helper.ts` | modified — `createSmsSenderMock` · 부팅 도우미에 `SMS_SENDER` · repository mock 5개 |
| `apps/user-service/src/user/test/user.util.spec.ts` | new — 계산형 `[CASES]` |
| `apps/user-service/src/user/test/user-phone-verification.spec.ts` | new — 큐 경로 발송 · 확인 |
| `apps/user-service/src/user/test/user-find-login-id.spec.ts` | new — 큐 경로 발송 · 확인 |
| `apps/user-service/src/user/test/user-password-reset.spec.ts` | new — 큐 경로 발송 · 확인 |
| `apps/user-service/src/user/test/user.repository.spec.ts` | modified — 새 메서드 매핑 · `UK_User_Phone` · `[SMOKE:data-access]` 2개 |
| `apps/user-service/src/user/test/user-{sign,general-sign,login,general-login,auth-user,token-refresh,leave,leave-cancel}.spec.ts` | modified — 결과의 `is_phone_verified` · 바뀐 컬럼 이름 |
| `apps/gateway/src/api/v1/user/user.controller.queue.ts` | modified — 큐 라우트 6개 |
| `apps/gateway/src/api/v1/user/test/user.controller.queue.spec.ts` | modified — 6개 라우트 · 인증 · 검증 |
| `.env.example` | modified — `SMS_VERIFICATION_DAILY_LIMIT=10` |
| `README.md` | modified — user-service 기능 · 하루 발송 한도 env |
| `AGENTS.md` | modified — Data Layer 의 컬럼 이름 규칙 · Transaction 예외(RequiresNew) · 외부 연동 첫 사용처 · Auth 의 `is_phone_verified` |
| `docs/data-layer.md` · `docs/architecture.md` · `docs/testing.md` · `docs/integration.md` | modified — 컬럼 이름 규칙 · 예시 · RequiresNew 예외 · `database → common` 의존 · `createSmsSenderMock` · 첫 사용처 |
| `.beaver/output/roadmap/roomless-roadmap.md` · `.html` | modified — #26 · #27 을 Phase 4 로 이동, 결정 반영 |
| `apps/gateway/src/api/v1/user/user.controller.ts` · `compose.*.yml` · `Dockerfile` | 변경 없음 — 로그인 결과는 내부 HTTP 그대로 전달되고, env 는 `env_file: .env` 로 들어간다 |
| `apps/user-service/src/user/user.util.ts` 의 `issueAccessAndRefresh` | 변경 없음 — refreshToken 은 이미 `365d` |

정리할 기존 코드(§1.7): `UserSignDto` · `UserLoginDto` 의 `sns_id` 허용값에서 GOOGLE · FACEBOOK · APPLE · LINE 을 뺀다(네이버 · 카카오만). 시드 `t_sns` 행은 FK 대상이라 남긴다.

---

## Design

### Data — 컬럼 이름 정리 (선행, #21)

어색한 컬럼 이름을 SMS 인증보다 먼저 바꾼다(사용자 결정 2026-10-20). 엔티티 속성 · 코드 변수 · 파라미터 · DTO 필드 · 테스트 · 문서를 같은 이름으로 맞춘다. `login_pw` 는 가입 · 로그인 API 입력 필드라 그대로 둔다(사용자 결정).

| 테이블 | 지금 | 바꾼 뒤 |
|---|---|---|
| `t_api_log` | `id`(PK) · `create_at`(PK 일부) · 인덱스 `IDX_ApiLog_CreateAt` · 시퀀스 `t_api_log_id_seq` | `api_log_id` · `created_at` · `IDX_ApiLog_CreatedAt` · `t_api_log_api_log_id_seq` |
| `t_store` | `create_at` · `update_at` · `is_delete` | `created_at` · `updated_at` · `is_deleted` |
| `t_user` | `create_at` · `update_at` · `leave_prev_state_id` | `created_at` · `updated_at` · `leave_previous_state_id` |
| `t_user_setting` | `create_at` · `update_at` | `created_at` · `updated_at` |
| `t_session` | `is_delete` | `is_deleted` |
| `t_session_refresh` | `create_at` · `end_at` · `before_refresh_hash` | `created_at` · `expires_at` · `previous_refresh_hash` |
| `t_state` | `is_login_able` | `is_login_allowed` |
| `t_sms_verification`(신규) | — | 처음부터 `created_at` · `updated_at` · `expires_at` |

이름 규칙 — AGENTS.md Data Layer · docs/data-layer.md 에 추가해 다시 생기지 않게 한다.
- 시각 컬럼은 `<과거분사>_at` 이다(`created_at` · `updated_at` · `verified_at` · `phone_verified_at` · `leave_reserved_at`). 만료는 `expires_at` 이다.
- 여부 플래그는 `is_<형용사 · 과거분사>` 이다(`is_deleted` · `is_login_allowed` · `is_password_change_required`).
- 직전 값을 가리키는 컬럼은 `previous_<이름>` 이다.
- PK 는 `<t_ 를 뗀 테이블 이름>_id` 이고, FK 는 가리키는 PK 와 같은 이름이다(`user_id` · `session_id` · `sms_purpose_id`).

**마이그레이션은 손으로 쓴다.** `db:generate` 는 이름 변경을 DROP + ADD 로 계산해서, 운영 데이터가 사라진다. RENAME 만 쓰면 데이터 · 제약 · 주석이 남는다.

순서는 다음과 같다.
1. 이 파일을 먼저 등록한다.
2. 엔티티를 고친다.
3. `npm run db:generate -- SmsVerification` 으로 남은 차이(신규 테이블 · phone 컬럼)를 만든다.
4. `npm run db:check` 로 일치를 확인한다.

```typescript
// libs/database/src/migrations/<ts>-RenameColumns.ts — new (손으로 쓴다, <ts> = 작성 시각 ms. Init 보다 크고 SmsVerification 보다 작다)
import type {MigrationInterface, QueryRunner} from 'typeorm';

/** 바꿀 컬럼 — [테이블, 지금 이름, 바꿀 이름] */
const RENAMES: [string, string, string][] = [
    ['t_api_log', 'id', 'api_log_id'],
    ['t_api_log', 'create_at', 'created_at'],
    ['t_store', 'create_at', 'created_at'],
    ['t_store', 'update_at', 'updated_at'],
    ['t_store', 'is_delete', 'is_deleted'],
    ['t_user', 'create_at', 'created_at'],
    ['t_user', 'update_at', 'updated_at'],
    ['t_user', 'leave_prev_state_id', 'leave_previous_state_id'],
    ['t_user_setting', 'create_at', 'created_at'],
    ['t_user_setting', 'update_at', 'updated_at'],
    ['t_session', 'is_delete', 'is_deleted'],
    ['t_session_refresh', 'create_at', 'created_at'],
    ['t_session_refresh', 'end_at', 'expires_at'],
    ['t_session_refresh', 'before_refresh_hash', 'previous_refresh_hash'],
    ['t_state', 'is_login_able', 'is_login_allowed'],
];

/**
 * 컬럼 이름 정리 — 시각 `<과거분사>_at` · 여부 `is_<형용사>` · 직전 값 `previous_` · PK `<테이블>_id`.
 * 데이터를 남기도록 RENAME 만 쓴다(db:generate 는 DROP + ADD 로 계산하므로 손으로 쓴 마이그레이션이다).
 */
export class RenameColumns<ts> implements MigrationInterface {
    name = 'RenameColumns<ts>';

    /**
     * 컬럼 · 인덱스 · 시퀀스 이름을 바꾼다 (데이터 · 제약 · 주석은 그대로)
     *
     * @param queryRunner 쿼리 실행기
     */
    async up(queryRunner: QueryRunner): Promise<void> {
        for (const [table, from, to] of RENAMES) {
            await queryRunner.query(`ALTER TABLE "${table}" RENAME COLUMN "${from}" TO "${to}"`);
        }
        await queryRunner.query(`ALTER INDEX "IDX_ApiLog_CreateAt" RENAME TO "IDX_ApiLog_CreatedAt"`);
        await queryRunner.query(`ALTER SEQUENCE "t_api_log_id_seq" RENAME TO "t_api_log_api_log_id_seq"`);
    }

    /**
     * 원래 이름으로 되돌린다
     *
     * @param queryRunner 쿼리 실행기
     */
    async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER SEQUENCE "t_api_log_api_log_id_seq" RENAME TO "t_api_log_id_seq"`);
        await queryRunner.query(`ALTER INDEX "IDX_ApiLog_CreatedAt" RENAME TO "IDX_ApiLog_CreateAt"`);
        for (const [table, from, to] of [...RENAMES].reverse()) {
            await queryRunner.query(`ALTER TABLE "${table}" RENAME COLUMN "${to}" TO "${from}"`);
        }
    }
}
```

엔티티 변경부 — 컬럼 `name` 과 속성 이름을 같이 바꾸고, 주석(comment)은 그대로 둔다(RENAME 은 주석을 유지한다).

```typescript
// libs/database/src/entities/api-log/api-log.entity.ts — 변경부
/**
 * API 호출 로그 (게이트웨이 이식 예정)
 * - PK 가 (api_log_id, created_at) 복합인 이유: PostgreSQL RANGE 파티셔닝은 파티션 키(created_at)가 PK 에 포함되어야 한다.
 * - 파티셔닝은 api-log 를 게이트웨이에 이식할 때 별도 마이그레이션으로 전환한다.
 */
@Entity({name: 't_api_log', comment: 'API 호출 로그'})
@Index('IDX_ApiLog_CreatedAt', ['created_at'])
@Index('IDX_ApiLog_Path', ['path'])
@Index('IDX_ApiLog_UserId', ['user_id'])
export class ApiLogEntity {
    @PrimaryGeneratedColumn({name: 'api_log_id', type: 'bigint', comment: '로그 ID', primaryKeyConstraintName: 'PK_ApiLog'})
    api_log_id: string;

    @PrimaryColumn({name: 'created_at', type: 'timestamptz', precision: 3, comment: '요청 시각', primaryKeyConstraintName: 'PK_ApiLog'})
    created_at: Date;
    // ...
    @BeforeInsert()
    insertTimestamp(): void {
        if (!this.created_at) this.created_at = new Date();
    }
}

// libs/database/src/entities/store/store.entity.ts · user.entity.ts · user-setting.entity.ts — 시각 컬럼 · 훅
    @Column({name: 'created_at', type: 'timestamptz', nullable: false, comment: '등록일'})
    created_at: Date;

    @Column({name: 'updated_at', type: 'timestamptz', nullable: false, comment: '수정일'})
    updated_at: Date;

    /**
     * insert 직전 등록일 · 수정일을 채운다.
     */
    @BeforeInsert()
    insertTimestamp(): void {
        const now = new Date();
        this.created_at = now;
        this.updated_at = now;
    }

    /**
     * update 직전 수정일을 갱신한다.
     */
    @BeforeUpdate()
    updateTimestamp(): void {
        this.updated_at = new Date();
    }

// libs/database/src/entities/store/store.entity.ts · session.entity.ts — 삭제 플래그
    @Column({name: 'is_deleted', type: 'smallint', nullable: false, default: 0, comment: '삭제여부(0: 정상, 1: 삭제)'})
    is_deleted: number;

// libs/database/src/entities/user/user.entity.ts — 탈퇴 직전 상태
    @Column({name: 'leave_previous_state_id', type: 'varchar', length: 20, nullable: true, comment: '탈퇴 직전 상태(철회 복원용 스냅샷, FK 아님)'})
    leave_previous_state_id: string | null;

// libs/database/src/entities/user/session-refresh.entity.ts — 직전 해시 · 등록 · 만료
    @Column({name: 'previous_refresh_hash', type: 'varchar', length: 64, nullable: true, comment: '직전 refresh-token 해시 (체인 링크, 최초 발급 시 NULL)'})
    previous_refresh_hash: string | null;

    @Column({name: 'created_at', type: 'timestamptz', nullable: false, comment: '등록일'})
    created_at: Date;

    @Column({name: 'expires_at', type: 'timestamptz', nullable: false, comment: '만료일'})
    expires_at: Date;

    @BeforeInsert()
    insertTimestamp(): void {
        this.created_at = new Date();
    }

// libs/database/src/entities/user/state.entity.ts
    @Column({name: 'is_login_allowed', type: 'smallint', nullable: false, default: 1, comment: '로그인 가능여부(0: 불가, 1: 가능)'})
    is_login_allowed: number;
```

코드 변경부 — 같은 이름으로 바꾼다. 동작은 바꾸지 않는다.

```typescript
// apps/user-service/src/user/user.service.ts — sign · generalSign · login · generalLogin 의 세션 · refresh 생성 (4곳 같다)
        sessionEntity.is_deleted = 0;
        // ...
        sessionRefreshEntity.previous_refresh_hash = null;
        sessionRefreshEntity.expires_at = tokens.refreshTokenExpiresAt;

// tokenRefresh — DB 만료 확인 · 안전망 단축 · 체인 연결
     * - refresh_hash 로 t_session_refresh 조회, 미존재 · DB expires_at 경과 → 401
     * - 회원이 ACTIVE 가 아니면 401 + 안전망으로 expires_at 단축
     * - old refresh expires_at = now + 1m 단축(grace) 후 새 토큰 발급, previous_refresh_hash 로 체인 연결
        if (oldRefresh.expires_at.getTime() < Date.now()) {
        // ...
            expireEntity.expires_at = dayjs().add(1, 'minute').toDate();
        // ...
        shrinkEntity.expires_at = dayjs().add(1, 'minute').toDate();
        // ...
        newRefreshEntity.previous_refresh_hash = refresh_hash;
        newRefreshEntity.expires_at = tokens.refreshTokenExpiresAt;

// leave · cancelLeave — 탈퇴 직전 상태 스냅샷 · 복원
        entity.leave_previous_state_id = user.state_id;
        // ...
        entity.state_id = user.leave_previous_state_id ?? 'ACTIVE';
        entity.leave_previous_state_id = null;

// getLoginUser JSDoc
     * 로그인 가능 상태(is_login_allowed = 1)이고 회원 설정이 있는 회원만 돌려준다.
```

```typescript
// apps/user-service/src/user/repositories/user.repository.ts — buildLoginUserQuery
            .addSelect('s.is_login_allowed', 'is_login_allowed')
            // ...
            .andWhere('s.is_login_allowed = 1');
// apps/user-service/src/user/interfaces/user.repository.interface.ts — LoginUserRow
    is_login_allowed: number;
// apps/user-service/src/user/user.util.ts — toUserAuthUserResult
    result.is_login_allowed = row.is_login_allowed;
// libs/contracts/src/user/dto/user-auth-user.dto.ts — UserAuthUserResultDto (게이트웨이 인증 회원, 내부 계약)
    @ApiProperty({description: '로그인 가능 여부(0: 불가, 1: 가능)'})
    is_login_allowed: number;
// libs/database/src/seeder/seeder.targets.ts — STATE_SEED_DATA
    {state_id: 'ACTIVE', state_name: '정상', is_login_allowed: 1},
    {state_id: 'BLOCK', state_name: '정지', is_login_allowed: 0},
    {state_id: 'LEAVE_WAIT', state_name: '탈퇴 대기', is_login_allowed: 1},
    {state_id: 'LEAVE', state_name: '탈퇴', is_login_allowed: 0},
```

테스트 · 문서의 같은 이름도 함께 바꾼다.
- 테스트: `user-token-refresh` · `user-sign` · `user-general-sign` · `user-login` · `user-leave` · `user-leave-cancel` · `user-auth-user` · `user.repository`(로그인 회원 SQL 고정값 · 별칭 목록) · 게이트웨이 `user.controller.queue`(인증 회원 mock)
- 문서: `docs/data-layer.md` 의 엔티티 예시와 "기본 필터 `is_deleted = 0`, 정렬 `created_at DESC`"
- `user-leave-cleanup.crontab.ts` 는 바뀐 컬럼을 쓰지 않는다. 확인만 한다.

### Data — 엔티티 (#21 · #22)

형제는 룩업 `t_sns`(libs/database/src/entities/user/sns.entity.ts)와 FK · 타임스탬프 훅 `t_user_setting`(user-setting.entity.ts)이다. FK 는 문자열 속성 + `@ManyToOne` 이고, NOT NULL 이면 `onDelete: 'CASCADE'` 다.

```typescript
// libs/database/src/entities/user/sms-purpose.entity.ts
import {Column, Entity, PrimaryColumn} from 'typeorm';

/**
 * SMS 인증 용도 (룩업) — 구조 컬럼만. 기본 데이터는 seeder.targets.ts
 */
@Entity({name: 't_sms_purpose', comment: 'SMS 인증 용도'})
export class SmsPurposeEntity {
    @PrimaryColumn({name: 'sms_purpose_id', length: 20, comment: 'SMS 인증 용도 ID', primaryKeyConstraintName: 'PK_SmsPurpose'})
    sms_purpose_id: string;

    @Column({name: 'sms_purpose_name', length: 50, nullable: false, comment: 'SMS 인증 용도명'})
    sms_purpose_name: string;
}
```

```typescript
// libs/database/src/entities/user/sms-verification.entity.ts
import {BeforeInsert, BeforeUpdate, Column, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn} from 'typeorm';
import {SmsPurposeEntity} from './sms-purpose.entity.js';
import {UserEntity} from './user.entity.js';

/**
 * SMS 인증 발송 · 확인 기록 — 발송 1건 = 1행. 인증번호는 해시로만 남기고, 확인 시도 · 완료 시각을 쌓는다.
 * 같은 번호 하루 발송 수를 (phone, created_at) 으로 센다.
 */
@Entity({name: 't_sms_verification', comment: 'SMS 인증 발송 · 확인 기록'})
@Index('IDX_SmsVerification_PhoneCreatedAt', ['phone', 'created_at'])
export class SmsVerificationEntity {
    @PrimaryColumn({name: 'sms_verification_id', length: 32, comment: 'SMS 인증 ID', primaryKeyConstraintName: 'PK_SmsVerification'})
    sms_verification_id: string;

    @ManyToOne(() => SmsPurposeEntity, {nullable: false, onUpdate: 'CASCADE', onDelete: 'CASCADE'})
    @JoinColumn({name: 'sms_purpose_id', referencedColumnName: 'sms_purpose_id', foreignKeyConstraintName: 'FK_SmsVerification_SmsPurpose'})
    sms_purpose_id: string;

    @ManyToOne(() => UserEntity, {nullable: false, onUpdate: 'CASCADE', onDelete: 'CASCADE'})
    @JoinColumn({name: 'user_id', referencedColumnName: 'user_id', foreignKeyConstraintName: 'FK_SmsVerification_User'})
    user_id: string;

    @Column({name: 'phone', length: 30, nullable: false, comment: '받는 번호(숫자만)'})
    phone: string;

    @Column({name: 'code_hash', length: 64, nullable: false, comment: '인증번호 SHA-256 해시'})
    code_hash: string;

    @Column({name: 'attempt_count', type: 'smallint', nullable: false, default: 0, comment: '확인 시도 횟수'})
    attempt_count: number;

    @Column({name: 'expires_at', type: 'timestamptz', nullable: false, comment: '인증번호 만료일'})
    expires_at: Date;

    @Column({name: 'verified_at', type: 'timestamptz', nullable: true, comment: '인증 완료일(미완료 NULL)'})
    verified_at: Date | null;

    @Column({name: 'ip', type: 'varchar', length: 100, nullable: true, comment: '요청 IP'})
    ip: string | null;

    @Column({name: 'created_at', type: 'timestamptz', nullable: false, comment: '발송일'})
    created_at: Date;

    @Column({name: 'updated_at', type: 'timestamptz', nullable: false, comment: '수정일'})
    updated_at: Date;

    /**
     * insert 직전 발송일 · 수정일을 채운다.
     */
    @BeforeInsert()
    insertTimestamp(): void {
        const now = new Date();
        this.created_at = now;
        this.updated_at = now;
    }

    /**
     * update 직전 수정일을 갱신한다.
     */
    @BeforeUpdate()
    updateTimestamp(): void {
        this.updated_at = new Date();
    }
}
```

```typescript
// libs/database/src/entities/user/user.entity.ts — 변경부
@Entity({name: 't_user', comment: '사용자 정보'})
@Unique('UK_User_LoginId', ['login_id'])
@Unique('UK_User_UserSearchCode', ['user_search_code'])
@Unique('UK_User_SnsSnsUserId', ['sns_id', 'sns_user_id'])
@Unique('UK_User_Phone', ['phone'])
export class UserEntity {
    // ...
    @Column({name: 'phone', type: 'varchar', length: 30, nullable: true, comment: '휴대폰 번호(숫자만, SMS 인증을 마친 번호 — 번호 1개 = 계정 1개, 미인증 NULL)'})
    phone: string | null;

    @Column({name: 'phone_verified_at', type: 'timestamptz', nullable: true, comment: '휴대폰 SMS 인증일(미인증 NULL)'})
    phone_verified_at: Date | null;
    // ...
}
```

```typescript
// libs/database/src/entities.ts — 변경부
import {SmsPurposeEntity} from './entities/user/sms-purpose.entity.js';
import {SmsVerificationEntity} from './entities/user/sms-verification.entity.js';

export const ENTITIES = [AuthEntity, StateEntity, SnsEntity, SmsPurposeEntity, StoreEntity, UserEntity, UserSettingEntity, SessionEntity, SessionRefreshEntity, SmsVerificationEntity, ApiLogEntity];
```

이 절의 마이그레이션은 `npm run db:generate -- SmsVerification` 으로 만든다(PGlite 계산, `MIGRATIONS` 등록 포함). 손으로 쓴 `RenameColumns` 를 먼저 등록한 뒤에 돌린다. 기대하는 내용은 아래와 같다. 이어서 `npm run db:check` 를 돌린다.
- `CREATE TABLE "t_sms_purpose"`
- `CREATE TABLE "t_sms_verification"` + `IDX_SmsVerification_PhoneCreatedAt` + FK 2개
- `ALTER TABLE "t_user" ADD "phone_verified_at"` · `ADD CONSTRAINT "UK_User_Phone" UNIQUE ("phone")` · phone COMMENT 변경
- 기존 행은 모두 `phone = NULL` 이라 UNIQUE 추가가 실패하지 않는다(user.service.ts:78 · 153).

### Data — 시드 (#22 · #23)

시드 행은 객체 리터럴 예외(AGENTS.md "기본 데이터 시드")다. 다만 총관리자는 시드 시점에 비밀번호를 해시해야 해서 **만드는 함수**로 둔다. 함수는 `new UserEntity()` + 할당으로 만들어, insert 때 타임스탬프 훅이 돌게 한다. 시더는 bcrypt util 을 쓰려고 `libs/common` 을 처음 import 한다.

총관리자는 `'admin'` / `'1234'` 를 시드 안에 값 그대로 넣는다. 고정 ID 상수는 두지 않는다(사용자 결정 2026-10-20).
- PK(`user_id`)는 다른 회원처럼 생성한 32자 ID 다.
- 그래서 이미 있는지는 PK 가 아니라 **유일 컬럼**으로 확인한다. 시드 대상에 확인 컬럼 `key` 를 더한다.
  - 총관리자는 `login_id`(UK_User_LoginId), 회원 설정은 `user_id`(UK_UserSetting_UserId)로 확인한다.
  - 다른 대상은 지금처럼 PK 로 확인한다.
- 회원 설정 함수는 DB 에서 `login_id = 'admin'` 인 회원을 찾아 그 `user_id` 로 만든다. 그래서 만드는 함수는 `DataSource` 를 받는다.

```typescript
// libs/database/src/seeder/seeder.targets.ts — 변경부
import {randomUUID} from 'node:crypto';
import type {DataSource, EntityTarget, ObjectLiteral} from 'typeorm';
import {getBcrypt} from '@app/common/utils/bcrypt.js';
import {AuthEntity} from '../entities/user/auth.entity.js';
import {SmsPurposeEntity} from '../entities/user/sms-purpose.entity.js';
import {SnsEntity} from '../entities/user/sns.entity.js';
import {StateEntity} from '../entities/user/state.entity.js';
import {UserSettingEntity} from '../entities/user/user-setting.entity.js';
import {UserEntity} from '../entities/user/user.entity.js';

/** 시드 대상 1건 — 엔티티 클래스 + 그 엔티티의 기본 데이터 */
export interface SeedTarget<T extends ObjectLiteral = ObjectLiteral> {
    entity: EntityTarget<T>;
    /** 기본 데이터 — 시드 시점에 계산해야 하면(비밀번호 해시 · 다른 행 참조) 만드는 함수 */
    data: T[] | ((dataSource: DataSource) => Promise<T[]>);
    /** 이미 있는지 확인할 유일 컬럼 — 없으면 PK. PK 를 생성하는 행(총관리자)은 유일 컬럼으로 확인한다 */
    key?: string;
}

// ... AUTH_SEED_DATA · STATE_SEED_DATA 그대로

/** SNS(t_sns) 기본 데이터 — 가입 · 로그인 DTO 의 sns_id 허용값(NAVER · KAKAO)을 모두 포함한다. 나머지는 기존 FK 대상이라 남긴다 */
export const SNS_SEED_DATA: SnsEntity[] = [
    // ... 그대로
];

/** SMS 인증 용도(t_sms_purpose) 기본 데이터 — user.util.ts 의 SMS_PURPOSE 와 같다 */
export const SMS_PURPOSE_SEED_DATA: SmsPurposeEntity[] = [
    {sms_purpose_id: 'PHONE_VERIFY', sms_purpose_name: '휴대폰 인증'},
    {sms_purpose_id: 'FIND_LOGIN_ID', sms_purpose_name: '아이디 찾기'},
    {sms_purpose_id: 'PASSWORD_RESET', sms_purpose_name: '비밀번호 초기화'},
];

/**
 * 첫 총관리자 `admin` / `1234` — 비밀번호는 시드 시점에 bcrypt + pepper 로 해시하고, 첫 로그인 때 변경 필요로 둔다.
 * login_id 로 이미 있는지 확인하므로(SEED_TARGETS 의 key), 비밀번호를 바꾼 뒤에는 덮지 않는다.
 *
 * @returns 총관리자 1행
 */
export async function buildSuperAdminSeed(): Promise<UserEntity[]> {
    const admin = new UserEntity();
    admin.user_id = randomUUID().replace(/-/g, '');
    admin.user_search_code = randomUUID().replace(/-/g, '');
    admin.auth_id = 'SUPER_ADMIN';
    admin.state_id = 'ACTIVE';
    admin.sns_id = null;
    admin.sns_user_id = null;
    admin.store_id = null;
    admin.login_id = 'admin';
    admin.login_pw = await getBcrypt('1234');
    admin.name = '총관리자';
    admin.gender = 'M';
    admin.birth = '1970-01-01';
    admin.phone = null;
    admin.phone_verified_at = null;
    admin.nickname = '총관리자';
    admin.device_os = null;
    admin.device_token = null;
    admin.is_password_change_required = 1;
    admin.block_comment = null;
    admin.leave_comment = null;
    admin.leave_reserved_at = null;
    admin.leave_previous_state_id = null;
    admin.leave_backup = null;
    return [admin];
}

/**
 * 첫 총관리자의 회원 설정 — 로그인 회원 조회가 회원 설정을 inner join 한다(findLoginUser).
 * login_id 가 admin 인 회원을 찾아 그 user_id 로 만든다. 총관리자가 없으면 만들지 않는다.
 *
 * @param dataSource 기본 DataSource
 * @returns 회원 설정 0 ~ 1행
 */
export async function buildSuperAdminSettingSeed(dataSource: DataSource): Promise<UserSettingEntity[]> {
    const admin = await dataSource.getRepository(UserEntity).findOne({where: {login_id: 'admin'}});
    if (!admin) {
        return [];
    }
    const setting = new UserSettingEntity();
    setting.user_setting_id = randomUUID().replace(/-/g, '');
    setting.user_id = admin.user_id;
    setting.bio = null;
    return [setting];
}

/**
 * 애플리케이션 시작 시 기본 데이터를 보장할 엔티티 목록 (기본 데이터 단일 관리 지점).
 * 새 기본 데이터는 위에 `<X>_SEED_DATA`(또는 만드는 함수)를 정의하고 여기에 한 줄 추가한다. FK 부모를 먼저 둔다.
 */
export const SEED_TARGETS: SeedTarget[] = [
    {entity: AuthEntity, data: AUTH_SEED_DATA},
    {entity: StateEntity, data: STATE_SEED_DATA},
    {entity: SnsEntity, data: SNS_SEED_DATA},
    {entity: SmsPurposeEntity, data: SMS_PURPOSE_SEED_DATA},
    {entity: UserEntity, data: buildSuperAdminSeed, key: 'login_id'},
    {entity: UserSettingEntity, data: buildSuperAdminSettingSeed, key: 'user_id'},
];
```

```typescript
// libs/database/src/seeder/seeder.service.ts — 변경부
    /**
     * 부팅 직후 전체 시드 대상을 순서대로 처리한다. 만드는 함수가 실패하면 그 대상만 경고하고 다음으로 넘어간다.
     */
    async onApplicationBootstrap(): Promise<void> {
        for (const target of SEED_TARGETS) {
            let rows: ObjectLiteral[];
            try {
                rows = typeof target.data === 'function' ? await target.data(this.dataSource) : target.data;
            } catch (e) {
                const reason = e instanceof Error ? e.message : String(e);
                this.logger.warn(`기본 데이터 준비 실패 — ${reason}`);
                continue;
            }
            await this.seedEntity(target.entity, rows, target.key);
        }
    }

    /**
     * 단일 엔티티 시드 — 확인 컬럼(key, 없으면 PK) 기준 미존재 행만 insert. 테이블 미생성 · 연결 오류 등은 warn 로그만 남긴다.
     *
     * @param entity 엔티티 클래스
     * @param rows 기본 데이터
     * @param key 이미 있는지 확인할 유일 컬럼 (없으면 PK)
     * @returns 입력 건수 (실패 시 null)
     */
    async seedEntity<T extends ObjectLiteral>(entity: EntityTarget<T>, rows: T[], key?: string): Promise<number | null> {
        if (!rows || rows.length === 0) return 0;
        const repo = this.dataSource.getRepository(entity);
        const column = key ?? repo.metadata.primaryColumns[0].propertyName;
        try {
            const values = rows.map((r) => (r as Record<string, unknown>)[column]);
            const existing = await repo.find({where: {[column]: In(values)} as never});
            const missing = pickMissingRows(rows, existing, column);
            if (missing.length === 0) return 0;

            await repo.insert(missing);
            const inserted = missing.map((m) => (m as Record<string, string>)[column]).join(', ');
            this.logger.log(`${repo.metadata.tableName}: 기본 데이터 ${missing.length}건 입력 (${inserted})`);
            return missing.length;
        } catch (e) {
            const reason = e instanceof Error ? e.message : String(e);
            this.logger.warn(`${repo.metadata.tableName}: 기본 데이터 입력 실패 — ${reason}`);
            return null;
        }
    }
```

`seeder.util.ts` 의 `pickMissingRows(rows, existing, pk)` 는 그대로 쓴다. 세 번째 인자 이름만 `key`(확인 컬럼)로 바꾸고 주석을 맞춘다.

### Input/Validation (DTO) — `libs/contracts/src/user/dto/` (#26 · #27)

형제는 `user-general-login.dto.ts`(login_id `MaxLength(30)`)와 `user-sign.dto.ts`(`@Matches` + 한국어 message, `@IsNotEmpty` 맨 마지막)다. 기능당 DTO 1개이고, 모양이 같아도 따로 선언한다.

```typescript
// libs/contracts/src/user/dto/user-phone-verification.dto.ts
import {ApiProperty} from '@nestjs/swagger';
import {IsNotEmpty, Matches} from 'class-validator';

/**
 * 휴대폰 인증번호 발송 입력 (로그인 회원 — 가입 후 본인 휴대폰 인증)
 */
export class UserPhoneVerificationDto {
    @ApiProperty({description: '휴대폰 번호 (숫자만)', example: '01012345678'})
    @Matches(/^01[016789]\d{7,8}$/, {message: '휴대폰 번호를 숫자만 정확히 입력해주세요.'})
    @IsNotEmpty({message: '휴대폰 번호를 입력해주세요.'})
    phone: string;
}

/**
 * 휴대폰 인증번호 발송 결과
 */
export class UserPhoneVerificationResultDto {
    @ApiProperty({description: '인증 ID — 확인할 때 인증번호와 함께 보낸다'})
    sms_verification_id: string;

    @ApiProperty({description: '인증번호 만료일시 (ISO 8601) — 발송 후 5분'})
    expires_at: string;
}
```

```typescript
// libs/contracts/src/user/dto/user-phone-verification-confirm.dto.ts
import {ApiProperty} from '@nestjs/swagger';
import {IsNotEmpty, Matches} from 'class-validator';

/**
 * 휴대폰 인증번호 확인 입력 — 발송 결과의 인증 ID + 인증번호. 확인되면 그 기록의 번호를 회원정보에 저장한다
 */
export class UserPhoneVerificationConfirmDto {
    @ApiProperty({description: '인증 ID (발송 결과의 sms_verification_id)', example: '0123456789abcdef0123456789abcdef'})
    @Matches(/^[a-f0-9]{32}$/, {message: '인증 ID가 올바르지 않습니다.'})
    @IsNotEmpty({message: '인증 ID를 입력해주세요.'})
    sms_verification_id: string;

    @ApiProperty({description: '인증번호 6자리', example: '123456'})
    @Matches(/^\d{6}$/, {message: '인증번호 6자리를 입력해주세요.'})
    @IsNotEmpty({message: '인증번호를 입력해주세요.'})
    code: string;
}
```

```typescript
// libs/contracts/src/user/dto/user-find-login-id.dto.ts
import {ApiProperty} from '@nestjs/swagger';
import {IsNotEmpty, Matches} from 'class-validator';

/**
 * 아이디 찾기 — 인증번호 발송 입력
 */
export class UserFindLoginIdDto {
    @ApiProperty({description: '가입할 때 인증한 휴대폰 번호 (숫자만)', example: '01012345678'})
    @Matches(/^01[016789]\d{7,8}$/, {message: '휴대폰 번호를 숫자만 정확히 입력해주세요.'})
    @IsNotEmpty({message: '휴대폰 번호를 입력해주세요.'})
    phone: string;
}

/**
 * 아이디 찾기 — 인증번호 발송 결과
 */
export class UserFindLoginIdResultDto {
    @ApiProperty({description: '인증 ID — 확인할 때 인증번호와 함께 보낸다'})
    sms_verification_id: string;

    @ApiProperty({description: '인증번호 만료일시 (ISO 8601) — 발송 후 5분'})
    expires_at: string;
}
```

```typescript
// libs/contracts/src/user/dto/user-find-login-id-confirm.dto.ts
import {ApiProperty} from '@nestjs/swagger';
import {IsNotEmpty, Matches} from 'class-validator';

/**
 * 아이디 찾기 — 인증번호 확인 입력 (발송 결과의 인증 ID + 인증번호)
 */
export class UserFindLoginIdConfirmDto {
    @ApiProperty({description: '인증 ID (발송 결과의 sms_verification_id)', example: '0123456789abcdef0123456789abcdef'})
    @Matches(/^[a-f0-9]{32}$/, {message: '인증 ID가 올바르지 않습니다.'})
    @IsNotEmpty({message: '인증 ID를 입력해주세요.'})
    sms_verification_id: string;

    @ApiProperty({description: '인증번호 6자리', example: '123456'})
    @Matches(/^\d{6}$/, {message: '인증번호 6자리를 입력해주세요.'})
    @IsNotEmpty({message: '인증번호를 입력해주세요.'})
    code: string;
}

/**
 * 아이디 찾기 결과 — 일반 계정은 login_id, SNS 계정은 sns_id (다른 쪽은 null), 그리고 가입일시
 */
export class UserFindLoginIdConfirmResultDto {
    @ApiProperty({description: '로그인 아이디 (SNS 계정이면 null)', nullable: true, type: String})
    login_id: string | null;

    @ApiProperty({description: '가입한 SNS (NAVER · KAKAO, 일반 계정이면 null)', nullable: true, type: String})
    sns_id: string | null;

    @ApiProperty({description: '가입일시 (ISO 8601)'})
    created_at: string;
}
```

```typescript
// libs/contracts/src/user/dto/user-password-reset.dto.ts
import {ApiProperty} from '@nestjs/swagger';
import {IsNotEmpty, Matches, MaxLength} from 'class-validator';

/**
 * 비밀번호 초기화 — 인증번호 발송 입력 (아이디 + 휴대폰 번호가 같은 계정일 때만 보낸다)
 */
export class UserPasswordResetDto {
    @ApiProperty({description: '로그인 아이디'})
    @MaxLength(30, {message: '아이디는 30자 이하여야 합니다.'})
    @IsNotEmpty({message: '아이디를 입력해주세요.'})
    login_id: string;

    @ApiProperty({description: '가입할 때 인증한 휴대폰 번호 (숫자만)', example: '01012345678'})
    @Matches(/^01[016789]\d{7,8}$/, {message: '휴대폰 번호를 숫자만 정확히 입력해주세요.'})
    @IsNotEmpty({message: '휴대폰 번호를 입력해주세요.'})
    phone: string;
}

/**
 * 비밀번호 초기화 — 인증번호 발송 결과
 */
export class UserPasswordResetResultDto {
    @ApiProperty({description: '인증 ID — 확인할 때 인증번호와 함께 보낸다'})
    sms_verification_id: string;

    @ApiProperty({description: '인증번호 만료일시 (ISO 8601) — 발송 후 5분'})
    expires_at: string;
}
```

```typescript
// libs/contracts/src/user/dto/user-password-reset-confirm.dto.ts
import {ApiProperty} from '@nestjs/swagger';
import {IsNotEmpty, Matches} from 'class-validator';

/**
 * 비밀번호 초기화 — 인증번호 확인 입력 (발송 결과의 인증 ID + 인증번호).
 * 확인되면 그 기록의 회원 비밀번호를 임시 비밀번호(영문 + 숫자 10자리)로 바꾸고 그 기록의 번호로 SMS 를 보낸다
 */
export class UserPasswordResetConfirmDto {
    @ApiProperty({description: '인증 ID (발송 결과의 sms_verification_id)', example: '0123456789abcdef0123456789abcdef'})
    @Matches(/^[a-f0-9]{32}$/, {message: '인증 ID가 올바르지 않습니다.'})
    @IsNotEmpty({message: '인증 ID를 입력해주세요.'})
    sms_verification_id: string;

    @ApiProperty({description: '인증번호 6자리', example: '123456'})
    @Matches(/^\d{6}$/, {message: '인증번호 6자리를 입력해주세요.'})
    @IsNotEmpty({message: '인증번호를 입력해주세요.'})
    code: string;
}
```

기존 DTO 변경부(`is_phone_verified` 는 응답 필드라 검증 데코레이터 없음):

```typescript
// libs/contracts/src/user/dto/user-sign.dto.ts · user-login.dto.ts — sns_id 변경부 (login 은 message 가 '유효하지 않은 SNS 유형입니다.')
    @ApiProperty({description: 'SNS 유형', enum: ['NAVER', 'KAKAO']})
    @IsIn(['NAVER', 'KAKAO'], {message: 'SNS 유형이 올바르지 않습니다.'})
    @IsNotEmpty({message: 'SNS 유형을 입력해주세요.'})
    sns_id: string;

// UserSignResultDto · UserGeneralSignResultDto · UserLoginResultDto · UserGeneralLoginResultDto — 끝에 추가
    @ApiProperty({description: '휴대폰 SMS 인증 여부(0: 미인증, 1: 인증) — 0 이면 휴대폰 인증 화면으로'})
    is_phone_verified: number;

// libs/contracts/src/user/dto/user-auth-user.dto.ts — UserAuthUserResultDto 끝에 추가
    @ApiProperty({description: '휴대폰 SMS 인증 여부(0: 미인증, 1: 인증)'})
    is_phone_verified: number;
```

```typescript
// libs/contracts/src/user/user.commands.ts — 변경부
/**
 * 회원 도메인 RabbitMQ 명령 종류 (= 라우팅 키, `user.#` 로 q.user.cmd 에 바인딩).
 * 게이트웨이가 발행하고 user-service 의 `@OnCommand` 핸들러가 받는다.
 *
 * 큐 경로 기준: 회원 상태를 바꾸는 쓰기(가입 · 탈퇴 · 철회 · 비밀번호 변경 · SMS 인증 · 아이디 찾기 · 비밀번호 초기화).
 * 토큰을 즉시 돌려줘야 하는 로그인 · 토큰 재발급은 내부 HTTP 동기 경로다.
 */
export const USER_COMMAND = {
    // ... 기존 5개 그대로
    /** 휴대폰 인증번호 발송 (로그인 회원) */
    PHONE_VERIFICATION: 'user.member.phone-verification',
    /** 휴대폰 인증번호 확인 → 회원정보에 번호 저장 (로그인 회원) */
    PHONE_VERIFICATION_CONFIRM: 'user.member.phone-verification-confirm',
    /** 아이디 찾기 — 인증번호 발송 */
    FIND_LOGIN_ID: 'user.member.find-login-id',
    /** 아이디 찾기 — 인증번호 확인 → 아이디 */
    FIND_LOGIN_ID_CONFIRM: 'user.member.find-login-id-confirm',
    /** 비밀번호 초기화 — 인증번호 발송 */
    PASSWORD_RESET: 'user.member.password-reset',
    /** 비밀번호 초기화 — 인증번호 확인 → 임시 비밀번호 SMS */
    PASSWORD_RESET_CONFIRM: 'user.member.password-reset-confirm',
} as const;
```

### Data Access (Repository) — `UserRepository`

형제 계약은 다음과 같다(user.repository.ts insertUser · findUser · updateUser).
- DB 실행 메서드는 모두 try/catch 하고, 최종 실패는 `SERVER_ERROR_MESSAGE` 500 이다.
- 제약 위반은 제약명별로 400 을 낸다.
- 조회는 `loadRelationIds: true` 를 쓴다.

**예외 하나** — `consumeSmsVerificationAttempt` 만 `@Transactional(Propagation.RequiresNew)` 로 독립 트랜잭션에서 커밋한다. 실패한 확인도 시도 횟수가 남아야 하기 때문이다(spec Notes). 이 메서드는 QueryBuilder 갱신이라 빌더를 분리해 Smoke spec 으로 SQL 을 고정한다.

```typescript
// apps/user-service/src/user/interfaces/user.repository.interface.ts — 변경부
import type {SmsVerificationEntity} from '@app/database/entities/user/sms-verification.entity.js';

/** 로그인 회원 조회 결과 (raw select 별칭 = 키) */
export interface LoginUserRow {
    // ... 기존 키 그대로
    state_id: string;
    /** 휴대폰 SMS 인증일 (미인증 null) */
    phone_verified_at: Date | null;
    is_login_allowed: number;
}

export interface UserRepositoryInterface {
    // ... 기존 11개 그대로

    /**
     * SMS 인증 발송 기록 등록.
     */
    insertSmsVerification(entity: SmsVerificationEntity): Promise<void>;

    /**
     * SMS 인증 기록 개수 — 같은 번호 하루 발송 수.
     */
    countSmsVerifications(where: FindOptionsWhere<SmsVerificationEntity>): Promise<number>;

    /**
     * SMS 인증 기록 단건 — 인증 ID + 용도(+ 회원)로 찾는다.
     */
    findSmsVerification(where: FindOptionsWhere<SmsVerificationEntity>): Promise<SmsVerificationEntity | null>;

    /**
     * 확인 시도 1회 소비 — 독립 트랜잭션. 한도에 닿았으면 false.
     */
    consumeSmsVerificationAttempt(sms_verification_id: string, max_attempts: number): Promise<boolean>;

    /**
     * SMS 인증 기록 수정 (verified_at).
     */
    updateSmsVerification(where: FindOptionsWhere<SmsVerificationEntity>, entity: SmsVerificationEntity): Promise<void>;
}
```

```typescript
// apps/user-service/src/user/repositories/user.repository.ts — 변경부
import {BadRequestException, Injectable, InternalServerErrorException} from '@nestjs/common';
import {Propagation, Transactional, TransactionHost} from '@nestjs-cls/transactional';
import type {TransactionalAdapterTypeOrm} from '@nestjs-cls/transactional-adapter-typeorm';
import type {FindOptionsWhere, Repository, SelectQueryBuilder, UpdateQueryBuilder} from 'typeorm';
import {SmsVerificationEntity} from '@app/database/entities/user/sms-verification.entity.js';
// ... 기존 import 그대로

    /** t_sms_verification repository (현재 트랜잭션 기준) */
    private get smsVerifications(): Repository<SmsVerificationEntity> {
        return this.txHost.tx.getRepository(SmsVerificationEntity);
    }

    // buildLoginUserQuery — state_id 다음에 한 줄 추가
            .addSelect('u.state_id', 'state_id')
            .addSelect('u.phone_verified_at', 'phone_verified_at')
            .addSelect('s.is_login_allowed', 'is_login_allowed')

    /**
     * 회원 정보 수정 — new UserEntity() + 할당으로 호출(@BeforeUpdate updated_at 트리거).
     * 휴대폰 번호를 저장할 때 다른 계정이 먼저 인증했으면(UK_User_Phone) 400.
     *
     * @param where 수정 조건
     * @param entity 바꿀 필드만 할당한 엔티티 (undefined 필드는 건드리지 않고, null 은 NULL 로 비운다)
     */
    async updateUser(where: FindOptionsWhere<UserEntity>, entity: UserEntity): Promise<void> {
        try {
            await this.users.update(where, entity);
        } catch (error) {
            if (isUniqueViolation(error, 'UK_User_Phone')) {
                throw new BadRequestException({message: '이미 가입된 번호입니다.'});
            } else {
                throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
            }
        }
    }

    /**
     * SMS 인증 발송 기록 등록 — FK 위반을 제약명별 400 으로 바꾼다.
     *
     * @param entity new SmsVerificationEntity() + 할당
     */
    async insertSmsVerification(entity: SmsVerificationEntity): Promise<void> {
        try {
            await this.smsVerifications.insert(entity);
        } catch (error) {
            if (isForeignKeyViolation(error, 'FK_SmsVerification_SmsPurpose')) {
                throw new BadRequestException({message: '존재하지 않는 SMS 인증 용도입니다.'});
            } else if (isForeignKeyViolation(error, 'FK_SmsVerification_User')) {
                throw new BadRequestException({message: '존재하지 않는 회원입니다.'});
            } else {
                throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
            }
        }
    }

    /**
     * SMS 인증 기록 개수
     *
     * @param where 조회 조건
     * @returns 개수
     */
    async countSmsVerifications(where: FindOptionsWhere<SmsVerificationEntity>): Promise<number> {
        try {
            return await this.smsVerifications.count({where});
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * SMS 인증 기록 단건 — 확인은 발송 결과로 내려준 인증 ID 로 한다.
     *
     * @param where 조회 조건 (인증 ID + 용도, 휴대폰 인증이면 회원까지)
     * @returns 인증 기록 또는 null
     */
    async findSmsVerification(where: FindOptionsWhere<SmsVerificationEntity>): Promise<SmsVerificationEntity | null> {
        try {
            return await this.smsVerifications.findOne({where, loadRelationIds: true});
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 확인 시도 1회 소비 — attempt_count < max 인 행만 원자적으로 +1 한다.
     * 독립 트랜잭션(RequiresNew)이라, 바깥 확인이 실패해 롤백돼도 소비한 횟수는 남는다(이 repository 의 유일한 예외).
     *
     * @param sms_verification_id 인증 기록 ID
     * @param max_attempts 시도 한도
     * @returns 소비했으면 true, 이미 한도에 닿았으면 false
     */
    @Transactional(Propagation.RequiresNew)
    async consumeSmsVerificationAttempt(sms_verification_id: string, max_attempts: number): Promise<boolean> {
        try {
            const result = await this.buildConsumeSmsVerificationAttemptQuery(sms_verification_id, max_attempts).execute();
            return result.affected === 1;
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 확인 시도 소비 쿼리 — 매핑 민감(QueryBuilder 갱신 · 식 할당)이라 Data-Access Smoke spec 으로 SQL 을 고정한다.
     *
     * @param sms_verification_id 인증 기록 ID
     * @param max_attempts 시도 한도
     * @returns 쿼리 빌더
     */
    buildConsumeSmsVerificationAttemptQuery(sms_verification_id: string, max_attempts: number): UpdateQueryBuilder<SmsVerificationEntity> {
        return this.smsVerifications
            .createQueryBuilder()
            .update(SmsVerificationEntity)
            .set({attempt_count: () => 'attempt_count + 1', updated_at: () => 'CURRENT_TIMESTAMP'})
            .where('sms_verification_id = :sms_verification_id', {sms_verification_id})
            .andWhere('attempt_count < :max_attempts', {max_attempts});
    }

    /**
     * SMS 인증 기록 수정 (verified_at)
     *
     * @param where 수정 조건
     * @param entity new SmsVerificationEntity() + 할당
     */
    async updateSmsVerification(where: FindOptionsWhere<SmsVerificationEntity>, entity: SmsVerificationEntity): Promise<void> {
        try {
            await this.smsVerifications.update(where, entity);
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }
```

### Business Logic (util) — `user.util.ts`

순수 함수다(service private 헬퍼 금지). 인증번호 · 임시 비밀번호는 `node:crypto` 의 `randomInt` 로 만든다. 결과 객체는 형제 util 처럼 `new X()` + 할당으로 만든다(user.util.ts:65).

```typescript
// apps/user-service/src/user/user.util.ts — 추가부
import {randomInt} from 'node:crypto';
import {sha256Hex} from '@app/common/utils/hash.js';
import {SmsVerificationEntity} from '@app/database/entities/user/sms-verification.entity.js';

/** SMS 인증 용도 — t_sms_purpose PK (seeder.targets.ts 의 SMS_PURPOSE_SEED_DATA 와 같다) */
export const SMS_PURPOSE = {PHONE_VERIFY: 'PHONE_VERIFY', FIND_LOGIN_ID: 'FIND_LOGIN_ID', PASSWORD_RESET: 'PASSWORD_RESET'} as const;

/** 인증번호 유효 시간(분) */
export const SMS_CODE_TTL_MINUTES = 5;

/** 인증번호 1건당 확인 시도 한도 */
export const SMS_MAX_ATTEMPTS = 3;

/** 같은 번호 하루 발송 한도 기본값 — env SMS_VERIFICATION_DAILY_LIMIT 가 없거나 잘못됐을 때 */
export const DEFAULT_SMS_DAILY_LIMIT = 10;

/** 임시 비밀번호 길이 */
export const TEMPORARY_PASSWORD_LENGTH = 10;

/** 한국 표준시 오프셋(ms) — 서머타임 없음 */
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** 임시 비밀번호에 쓰는 문자 — 영문 대소문자 + 숫자 */
const TEMPORARY_PASSWORD_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

/** SMS 인증 기록 상태 — 사용 가능 · 이미 사용 · 만료 */
export type SmsVerificationState = 'USABLE' | 'USED' | 'EXPIRED';

/** buildSmsVerification 입력 */
export interface SmsVerificationInput {
    sms_purpose_id: string;
    user_id: string;
    phone: string;
    /** 인증번호 원문 — 해시로만 저장한다 */
    code: string;
    ip: string;
    now: Date;
}

/**
 * 숫자 6자리 인증번호 (암호학적 난수, 앞자리 0 유지).
 *
 * @returns 000000 ~ 999999
 */
export function generateVerificationCode(): string {
    return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

/**
 * 영문 + 숫자 10자리 임시 비밀번호 — 영문 · 숫자가 각각 1자 이상이라 비밀번호 변경 규칙(영문 + 숫자 필수)을 통과한다.
 *
 * @returns 임시 비밀번호
 */
export function generateTemporaryPassword(): string {
    for (;;) {
        const password = Array.from({length: TEMPORARY_PASSWORD_LENGTH}, () => TEMPORARY_PASSWORD_CHARS[randomInt(TEMPORARY_PASSWORD_CHARS.length)]).join('');
        if (/[A-Za-z]/.test(password) && /\d/.test(password)) {
            return password;
        }
    }
}

/**
 * 그 시각이 속한 한국 날짜의 0시(KST) — 같은 번호 하루 발송 수를 세는 시작점.
 *
 * @param now 기준 시각
 * @returns 한국 날짜 0시의 Date
 */
export function kstDayStart(now: Date): Date {
    const kst = new Date(now.getTime() + KST_OFFSET_MS);
    kst.setUTCHours(0, 0, 0, 0);
    return new Date(kst.getTime() - KST_OFFSET_MS);
}

/**
 * 같은 번호 하루 발송 한도 — env SMS_VERIFICATION_DAILY_LIMIT. 없거나 숫자가 아니거나 0 이하면 기본 10.
 *
 * @returns 한도
 */
export function getSmsDailyLimit(): number {
    const parsed = parseInt(process.env.SMS_VERIFICATION_DAILY_LIMIT ?? '', 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_SMS_DAILY_LIMIT;
}

/**
 * SMS 인증 기록 상태 — 이미 인증했으면 USED, 만료 시각이 지났으면(같으면 포함) EXPIRED.
 *
 * @param verification 인증 기록
 * @param now 기준 시각
 * @returns 상태
 */
export function checkSmsVerification(verification: SmsVerificationEntity, now: Date): SmsVerificationState {
    if (verification.verified_at) {
        return 'USED';
    }
    if (verification.expires_at.getTime() <= now.getTime()) {
        return 'EXPIRED';
    }
    return 'USABLE';
}

/**
 * SMS 인증 발송 기록 — 인증번호는 SHA-256 해시로만, 만료는 발송 + 5분.
 *
 * @param input 용도 · 회원 · 번호 · 인증번호 · IP · 기준 시각
 * @returns 저장할 엔티티
 */
export function buildSmsVerification(input: SmsVerificationInput): SmsVerificationEntity {
    const entity = new SmsVerificationEntity();
    entity.sms_verification_id = generateId();
    entity.sms_purpose_id = input.sms_purpose_id;
    entity.user_id = input.user_id;
    entity.phone = input.phone;
    entity.code_hash = sha256Hex(input.code);
    entity.attempt_count = 0;
    entity.expires_at = new Date(input.now.getTime() + SMS_CODE_TTL_MINUTES * 60 * 1000);
    entity.verified_at = null;
    entity.ip = input.ip || null;
    return entity;
}

/**
 * 인증번호 SMS 본문 — 한글 70자 안(1건 과금).
 *
 * @param code 인증번호
 * @returns 본문
 */
export function smsVerificationText(code: string): string {
    return `[roomless] 인증번호 [${code}] — ${SMS_CODE_TTL_MINUTES}분 안에 입력해주세요.`;
}

/**
 * 임시 비밀번호 SMS 본문 — 한글 70자 안(1건 과금).
 *
 * @param password 임시 비밀번호
 * @returns 본문
 */
export function temporaryPasswordText(password: string): string {
    return `[roomless] 임시 비밀번호 ${password} — 로그인 후 비밀번호를 바꿔주세요.`;
}

// toUserAuthUserResult — 끝에 한 줄 추가
    result.is_phone_verified = row.phone_verified_at ? 1 : 0;
```

### Business Logic (Service) — `UserService`

형제는 `changePassword`(user.service.ts:462)다. `@Transactional()` 을 달고, 규칙 위반은 HTTP 예외 + 한국어 message 로 던지며, 엔티티는 `new` + 할당으로 만든다. 입력 필드에 귀속되는 오류는 `createValidationError` 로 담는다(sign 의 birth).

**SMS 발송은 각 메서드의 마지막 단계다** — 발송 뒤에 실패할 쓰기를 두지 않는다. 재시도되면 SMS 가 다시 나가기 때문이다(docs/integration.md).

```typescript
// apps/user-service/src/user/user.service.ts — 변경부 (import · 상수 · 생성자)
import {BadRequestException, HttpException, HttpStatus, Inject, Injectable, NotFoundException, UnauthorizedException} from '@nestjs/common';
import {In, MoreThanOrEqual} from 'typeorm';
import type {UserFindLoginIdConfirmDto, UserFindLoginIdConfirmResultDto} from '@app/contracts/user/dto/user-find-login-id-confirm.dto.js';
import type {UserFindLoginIdDto, UserFindLoginIdResultDto} from '@app/contracts/user/dto/user-find-login-id.dto.js';
import type {UserPasswordResetConfirmDto} from '@app/contracts/user/dto/user-password-reset-confirm.dto.js';
import type {UserPasswordResetDto, UserPasswordResetResultDto} from '@app/contracts/user/dto/user-password-reset.dto.js';
import type {UserPhoneVerificationConfirmDto} from '@app/contracts/user/dto/user-phone-verification-confirm.dto.js';
import type {UserPhoneVerificationDto, UserPhoneVerificationResultDto} from '@app/contracts/user/dto/user-phone-verification.dto.js';
import {SmsVerificationEntity} from '@app/database/entities/user/sms-verification.entity.js';
import {SMS_SENDER} from '@app/integration/integration.symbols.js';
import type {SmsSenderInterface} from '@app/integration/interfaces/integration.interface.js';
import {
    buildSmsVerification,
    checkSmsVerification,
    generateId,
    generateSnsLoginId,
    generateTemporaryPassword,
    generateVerificationCode,
    getSmsDailyLimit,
    isAdult,
    issueAccessAndRefresh,
    kstDayStart,
    SMS_MAX_ATTEMPTS,
    SMS_PURPOSE,
    smsVerificationText,
    temporaryPasswordText,
    toUserAuthUserResult,
} from './user.util.js';

/** 다른 계정이 이미 인증한 번호 (번호 1개 = 계정 1개) */
const PHONE_TAKEN_MESSAGE = '이미 가입된 번호입니다.';

/** 같은 번호 하루 발송 한도 초과 */
const SMS_DAILY_LIMIT_MESSAGE = '오늘은 이 번호로 인증번호를 더 보낼 수 없습니다. 내일 다시 시도해주세요.';

/** 확인할 인증 기록이 없을 때 — 인증 ID 가 틀렸거나 다른 회원 · 용도의 기록 */
const SMS_VERIFICATION_NOT_FOUND_MESSAGE = '인증 정보를 찾을 수 없습니다. 인증번호를 다시 요청해주세요.';

/** 인증 기록 상태별 거부 메시지 (checkSmsVerification) */
const SMS_STATE_MESSAGE: Record<'USED' | 'EXPIRED', string> = {
    USED: '이미 사용한 인증번호입니다. 인증번호를 다시 요청해주세요.',
    EXPIRED: '인증번호가 만료되었습니다. 인증번호를 다시 요청해주세요.',
};

/** 확인 시도 한도 초과 */
const SMS_ATTEMPTS_EXCEEDED_MESSAGE = '인증번호 입력 횟수를 초과했습니다. 인증번호를 다시 요청해주세요.';

/** 인증번호 불일치 */
const SMS_CODE_MISMATCH_MESSAGE = '인증번호가 일치하지 않습니다.';

/** 아이디 · 비밀번호 찾기에서 일치하는 회원이 없을 때 */
const ACCOUNT_NOT_FOUND_MESSAGE = '일치하는 회원 정보가 없습니다.';

/** 아이디 찾기 · 비밀번호 초기화 대상 상태 (탈퇴 완료 제외) */
const ACCOUNT_RECOVERY_STATES = ['ACTIVE', 'BLOCK', 'LEAVE_WAIT'];

    /**
     * @param userRepository 회원 repository 포트
     * @param jwtService 토큰 서명기
     * @param smsSender SMS 발송 포트 (Amazon SNS)
     */
    constructor(
        @Inject(USER_REPOSITORY)
        private readonly userRepository: UserRepositoryInterface,
        private readonly jwtService: JwtService,
        @Inject(SMS_SENDER)
        private readonly smsSender: SmsSenderInterface,
    ) {}
```

기존 메서드 변경부:

```typescript
// sign · generalSign — 반환 객체 끝에 (방금 가입한 회원은 항상 미인증)
            is_phone_verified: 0,

// login · generalLogin — 반환 객체 끝에 (조회한 회원 user)
            is_phone_verified: user.phone_verified_at ? 1 : 0,
```

새 메서드 6개:

```typescript
    /**
     * 휴대폰 인증번호 발송 — 가입 후 본인 휴대폰 인증(SNS · 일반 공통). (RabbitMQ: user.member.phone-verification)
     * 번호 1개 = 계정 1개, 같은 번호 하루 발송 한도(SMS_VERIFICATION_DAILY_LIMIT). SMS 발송은 마지막 단계.
     *
     * @param user_id 로그인 회원 ID
     * @param dto 휴대폰 번호
     * @param ip 클라이언트 IP
     * @returns 인증 ID · 만료 시각 (확인은 인증 ID + 인증번호)
     */
    @Transactional()
    async sendPhoneVerification(user_id: string, dto: UserPhoneVerificationDto, ip: string): Promise<UserPhoneVerificationResultDto> {
        // 1. 회원 — 이미 인증했으면 다시 할 수 없다
        const user = await this.userRepository.findUser({user_id});
        if (!user) {
            throw new NotFoundException({message: '회원 정보를 찾을 수 없습니다.'});
        }
        if (user.phone_verified_at) {
            throw new BadRequestException({message: '이미 휴대폰 인증을 마쳤습니다.'});
        }

        // 2. 번호 1개 = 계정 1개 — 다른 계정이 인증한 번호는 거부
        const owner = await this.userRepository.findUser({phone: dto.phone});
        if (owner) {
            throw new BadRequestException({message: PHONE_TAKEN_MESSAGE, validation_errors: createValidationError('phone', PHONE_TAKEN_MESSAGE)});
        }

        // 3. 같은 번호 하루 발송 한도 (한국 날짜)
        const now = new Date();
        const sentToday = await this.userRepository.countSmsVerifications({phone: dto.phone, created_at: MoreThanOrEqual(kstDayStart(now))});
        if (sentToday >= getSmsDailyLimit()) {
            throw new HttpException({message: SMS_DAILY_LIMIT_MESSAGE}, HttpStatus.TOO_MANY_REQUESTS);
        }

        // 4. 발송 기록 → SMS 발송(마지막)
        const code = generateVerificationCode();
        const verification = buildSmsVerification({sms_purpose_id: SMS_PURPOSE.PHONE_VERIFY, user_id, phone: dto.phone, code, ip, now});
        await this.userRepository.insertSmsVerification(verification);
        await this.smsSender.send({to: dto.phone, text: smsVerificationText(code)});
        return {sms_verification_id: verification.sms_verification_id, expires_at: verification.expires_at.toISOString()};
    }

    /**
     * 휴대폰 인증번호 확인 — 발송 결과의 인증 ID + 인증번호. 확인되면 그 기록의 번호를 회원정보에 저장한다. (RabbitMQ: user.member.phone-verification-confirm)
     * 시도 횟수는 비교 전에 독립 트랜잭션으로 소비한다(실패해도 남는다, 최대 3회).
     *
     * @param user_id 로그인 회원 ID
     * @param dto 인증 ID · 인증번호
     */
    @Transactional()
    async confirmPhoneVerification(user_id: string, dto: UserPhoneVerificationConfirmDto): Promise<void> {
        // 1. 회원 — 이미 인증했으면 다시 할 수 없다
        const user = await this.userRepository.findUser({user_id});
        if (!user) {
            throw new NotFoundException({message: '회원 정보를 찾을 수 없습니다.'});
        }
        if (user.phone_verified_at) {
            throw new BadRequestException({message: '이미 휴대폰 인증을 마쳤습니다.'});
        }

        // 2. 인증 기록 — 본인 · 휴대폰 인증 용도만. 사용함 · 만료
        const now = new Date();
        const verification = await this.userRepository.findSmsVerification({sms_verification_id: dto.sms_verification_id, sms_purpose_id: SMS_PURPOSE.PHONE_VERIFY, user_id});
        if (!verification) {
            throw new NotFoundException({message: SMS_VERIFICATION_NOT_FOUND_MESSAGE});
        }
        const state = checkSmsVerification(verification, now);
        if (state !== 'USABLE') {
            throw new BadRequestException({message: SMS_STATE_MESSAGE[state]});
        }

        // 3. 시도 1회 소비 (독립 트랜잭션) → 인증번호 비교
        const consumed = await this.userRepository.consumeSmsVerificationAttempt(verification.sms_verification_id, SMS_MAX_ATTEMPTS);
        if (!consumed) {
            throw new BadRequestException({message: SMS_ATTEMPTS_EXCEEDED_MESSAGE});
        }
        if (sha256Hex(dto.code) !== verification.code_hash) {
            throw new BadRequestException({message: SMS_CODE_MISMATCH_MESSAGE, validation_errors: createValidationError('code', SMS_CODE_MISMATCH_MESSAGE)});
        }

        // 4. 인증 완료 + 회원정보에 그 기록의 번호 저장 (다른 계정과 경쟁하면 UK_User_Phone → 400)
        const verifiedEntity = new SmsVerificationEntity();
        verifiedEntity.verified_at = now;
        await this.userRepository.updateSmsVerification({sms_verification_id: verification.sms_verification_id}, verifiedEntity);

        const userEntity = new UserEntity();
        userEntity.phone = verification.phone;
        userEntity.phone_verified_at = now;
        await this.userRepository.updateUser({user_id}, userEntity);
    }

    /**
     * 아이디 찾기 — 인증번호 발송. 그 번호로 인증한 회원이 있을 때만 보낸다. (RabbitMQ: user.member.find-login-id)
     *
     * @param dto 휴대폰 번호
     * @param ip 클라이언트 IP
     * @returns 인증 ID · 만료 시각 (확인은 인증 ID + 인증번호)
     */
    @Transactional()
    async sendFindLoginId(dto: UserFindLoginIdDto, ip: string): Promise<UserFindLoginIdResultDto> {
        // 1. 그 번호로 인증한 회원 (탈퇴 완료 제외)
        const user = await this.userRepository.findUser({phone: dto.phone, state_id: In(ACCOUNT_RECOVERY_STATES)});
        if (!user) {
            throw new NotFoundException({message: ACCOUNT_NOT_FOUND_MESSAGE});
        }

        // 2. 같은 번호 하루 발송 한도 (한국 날짜)
        const now = new Date();
        const sentToday = await this.userRepository.countSmsVerifications({phone: dto.phone, created_at: MoreThanOrEqual(kstDayStart(now))});
        if (sentToday >= getSmsDailyLimit()) {
            throw new HttpException({message: SMS_DAILY_LIMIT_MESSAGE}, HttpStatus.TOO_MANY_REQUESTS);
        }

        // 3. 발송 기록 → SMS 발송(마지막)
        const code = generateVerificationCode();
        const verification = buildSmsVerification({sms_purpose_id: SMS_PURPOSE.FIND_LOGIN_ID, user_id: user.user_id, phone: dto.phone, code, ip, now});
        await this.userRepository.insertSmsVerification(verification);
        await this.smsSender.send({to: dto.phone, text: smsVerificationText(code)});
        return {sms_verification_id: verification.sms_verification_id, expires_at: verification.expires_at.toISOString()};
    }

    /**
     * 아이디 찾기 — 인증 ID + 인증번호 확인 → 일반 계정은 login_id, SNS 계정은 sns_id, 그리고 가입일시. (RabbitMQ: user.member.find-login-id-confirm)
     *
     * @param dto 인증 ID · 인증번호
     * @returns 아이디 또는 가입한 SNS · 가입일시
     */
    @Transactional()
    async confirmFindLoginId(dto: UserFindLoginIdConfirmDto): Promise<UserFindLoginIdConfirmResultDto> {
        // 1. 인증 기록 — 아이디 찾기 용도만. 사용함 · 만료
        const now = new Date();
        const verification = await this.userRepository.findSmsVerification({sms_verification_id: dto.sms_verification_id, sms_purpose_id: SMS_PURPOSE.FIND_LOGIN_ID});
        if (!verification) {
            throw new NotFoundException({message: SMS_VERIFICATION_NOT_FOUND_MESSAGE});
        }
        const state = checkSmsVerification(verification, now);
        if (state !== 'USABLE') {
            throw new BadRequestException({message: SMS_STATE_MESSAGE[state]});
        }

        // 2. 그 기록의 회원 (탈퇴 완료 제외)
        const user = await this.userRepository.findUser({user_id: verification.user_id, state_id: In(ACCOUNT_RECOVERY_STATES)});
        if (!user) {
            throw new NotFoundException({message: ACCOUNT_NOT_FOUND_MESSAGE});
        }

        // 3. 시도 1회 소비 (독립 트랜잭션) → 인증번호 비교
        const consumed = await this.userRepository.consumeSmsVerificationAttempt(verification.sms_verification_id, SMS_MAX_ATTEMPTS);
        if (!consumed) {
            throw new BadRequestException({message: SMS_ATTEMPTS_EXCEEDED_MESSAGE});
        }
        if (sha256Hex(dto.code) !== verification.code_hash) {
            throw new BadRequestException({message: SMS_CODE_MISMATCH_MESSAGE, validation_errors: createValidationError('code', SMS_CODE_MISMATCH_MESSAGE)});
        }

        // 4. 인증 완료 → 결과 (SNS 계정은 자동 생성 아이디 대신 가입한 SNS)
        const verifiedEntity = new SmsVerificationEntity();
        verifiedEntity.verified_at = now;
        await this.userRepository.updateSmsVerification({sms_verification_id: verification.sms_verification_id}, verifiedEntity);
        return {login_id: user.sns_id ? null : user.login_id, sns_id: user.sns_id, created_at: user.created_at.toISOString()};
    }

    /**
     * 비밀번호 초기화 — 인증번호 발송. 아이디 + 휴대폰 번호가 같은 일반 계정일 때만 보낸다. (RabbitMQ: user.member.password-reset)
     *
     * @param dto 아이디 · 휴대폰 번호
     * @param ip 클라이언트 IP
     * @returns 인증 ID · 만료 시각 (확인은 인증 ID + 인증번호)
     */
    @Transactional()
    async sendPasswordReset(dto: UserPasswordResetDto, ip: string): Promise<UserPasswordResetResultDto> {
        // 1. 아이디 + 번호가 같은 회원 — SNS 계정은 비밀번호가 없다
        const user = await this.userRepository.findUser({login_id: dto.login_id, phone: dto.phone, state_id: In(ACCOUNT_RECOVERY_STATES)});
        if (!user) {
            throw new NotFoundException({message: ACCOUNT_NOT_FOUND_MESSAGE});
        }
        if (user.sns_id) {
            throw new BadRequestException({message: 'SNS로 가입한 계정은 비밀번호를 초기화할 수 없습니다. 가입한 SNS로 로그인해주세요.'});
        }

        // 2. 같은 번호 하루 발송 한도 (한국 날짜)
        const now = new Date();
        const sentToday = await this.userRepository.countSmsVerifications({phone: dto.phone, created_at: MoreThanOrEqual(kstDayStart(now))});
        if (sentToday >= getSmsDailyLimit()) {
            throw new HttpException({message: SMS_DAILY_LIMIT_MESSAGE}, HttpStatus.TOO_MANY_REQUESTS);
        }

        // 3. 발송 기록 → SMS 발송(마지막)
        const code = generateVerificationCode();
        const verification = buildSmsVerification({sms_purpose_id: SMS_PURPOSE.PASSWORD_RESET, user_id: user.user_id, phone: dto.phone, code, ip, now});
        await this.userRepository.insertSmsVerification(verification);
        await this.smsSender.send({to: dto.phone, text: smsVerificationText(code)});
        return {sms_verification_id: verification.sms_verification_id, expires_at: verification.expires_at.toISOString()};
    }

    /**
     * 비밀번호 초기화 — 인증 ID + 인증번호 확인 → 임시 비밀번호(영문 + 숫자 10자리)로 바꾸고 그 기록의 번호로 SMS 를 보낸다. (RabbitMQ: user.member.password-reset-confirm)
     * 다음 로그인 때 비밀번호 변경이 필요하다는 표시(is_password_change_required = 1)를 남긴다. SMS 발송은 마지막 단계.
     *
     * @param dto 인증 ID · 인증번호
     */
    @Transactional()
    async confirmPasswordReset(dto: UserPasswordResetConfirmDto): Promise<void> {
        // 1. 인증 기록 — 비밀번호 초기화 용도만. 사용함 · 만료
        const now = new Date();
        const verification = await this.userRepository.findSmsVerification({sms_verification_id: dto.sms_verification_id, sms_purpose_id: SMS_PURPOSE.PASSWORD_RESET});
        if (!verification) {
            throw new NotFoundException({message: SMS_VERIFICATION_NOT_FOUND_MESSAGE});
        }
        const state = checkSmsVerification(verification, now);
        if (state !== 'USABLE') {
            throw new BadRequestException({message: SMS_STATE_MESSAGE[state]});
        }

        // 2. 그 기록의 회원 (탈퇴 완료 제외)
        const user = await this.userRepository.findUser({user_id: verification.user_id, state_id: In(ACCOUNT_RECOVERY_STATES)});
        if (!user) {
            throw new NotFoundException({message: ACCOUNT_NOT_FOUND_MESSAGE});
        }

        // 3. 시도 1회 소비 (독립 트랜잭션) → 인증번호 비교
        const consumed = await this.userRepository.consumeSmsVerificationAttempt(verification.sms_verification_id, SMS_MAX_ATTEMPTS);
        if (!consumed) {
            throw new BadRequestException({message: SMS_ATTEMPTS_EXCEEDED_MESSAGE});
        }
        if (sha256Hex(dto.code) !== verification.code_hash) {
            throw new BadRequestException({message: SMS_CODE_MISMATCH_MESSAGE, validation_errors: createValidationError('code', SMS_CODE_MISMATCH_MESSAGE)});
        }

        // 4. 인증 완료 → 임시 비밀번호로 교체 + 변경 필요 표시 → SMS 발송(마지막)
        const verifiedEntity = new SmsVerificationEntity();
        verifiedEntity.verified_at = now;
        await this.userRepository.updateSmsVerification({sms_verification_id: verification.sms_verification_id}, verifiedEntity);

        const temporaryPassword = generateTemporaryPassword();
        const userEntity = new UserEntity();
        userEntity.login_pw = await getBcrypt(temporaryPassword);
        userEntity.is_password_change_required = 1;
        await this.userRepository.updateUser({user_id: user.user_id}, userEntity);
        await this.smsSender.send({to: verification.phone, text: temporaryPasswordText(temporaryPassword)});
    }
```

### Entry Point (Handler · Controller)

서비스 핸들러는 위임 한 줄이다. 형제는 user.handler.ts 의 `leave`(인증 → `requireActor`)와 `sign`(비인증 → payload · client_ip)이다.

```typescript
// apps/user-service/src/user/user.handler.ts — 추가부
import type {UserFindLoginIdConfirmDto, UserFindLoginIdConfirmResultDto} from '@app/contracts/user/dto/user-find-login-id-confirm.dto.js';
import type {UserFindLoginIdDto, UserFindLoginIdResultDto} from '@app/contracts/user/dto/user-find-login-id.dto.js';
import type {UserPasswordResetConfirmDto} from '@app/contracts/user/dto/user-password-reset-confirm.dto.js';
import type {UserPasswordResetDto, UserPasswordResetResultDto} from '@app/contracts/user/dto/user-password-reset.dto.js';
import type {UserPhoneVerificationConfirmDto} from '@app/contracts/user/dto/user-phone-verification-confirm.dto.js';
import type {UserPhoneVerificationDto, UserPhoneVerificationResultDto} from '@app/contracts/user/dto/user-phone-verification.dto.js';

    /**
     * 휴대폰 인증번호 발송 — 로그인 회원
     *
     * @param command 명령 봉투 (actor 필수)
     * @returns 인증 ID · 만료 시각
     */
    @OnCommand(USER_COMMAND.PHONE_VERIFICATION)
    async sendPhoneVerification(command: MessageEnvelope<UserPhoneVerificationDto>): Promise<UserPhoneVerificationResultDto> {
        return this.userService.sendPhoneVerification(requireActor(command).user_id, command.payload, command.meta.client_ip ?? '');
    }

    /**
     * 휴대폰 인증번호 확인 — 로그인 회원
     *
     * @param command 명령 봉투 (actor 필수)
     */
    @OnCommand(USER_COMMAND.PHONE_VERIFICATION_CONFIRM)
    async confirmPhoneVerification(command: MessageEnvelope<UserPhoneVerificationConfirmDto>): Promise<void> {
        return this.userService.confirmPhoneVerification(requireActor(command).user_id, command.payload);
    }

    /**
     * 아이디 찾기 — 인증번호 발송 (비로그인)
     *
     * @param command 명령 봉투
     * @returns 인증 ID · 만료 시각
     */
    @OnCommand(USER_COMMAND.FIND_LOGIN_ID)
    async sendFindLoginId(command: MessageEnvelope<UserFindLoginIdDto>): Promise<UserFindLoginIdResultDto> {
        return this.userService.sendFindLoginId(command.payload, command.meta.client_ip ?? '');
    }

    /**
     * 아이디 찾기 — 인증번호 확인 (비로그인)
     *
     * @param command 명령 봉투
     * @returns 아이디 또는 가입한 SNS
     */
    @OnCommand(USER_COMMAND.FIND_LOGIN_ID_CONFIRM)
    async confirmFindLoginId(command: MessageEnvelope<UserFindLoginIdConfirmDto>): Promise<UserFindLoginIdConfirmResultDto> {
        return this.userService.confirmFindLoginId(command.payload);
    }

    /**
     * 비밀번호 초기화 — 인증번호 발송 (비로그인)
     *
     * @param command 명령 봉투
     * @returns 인증 ID · 만료 시각
     */
    @OnCommand(USER_COMMAND.PASSWORD_RESET)
    async sendPasswordReset(command: MessageEnvelope<UserPasswordResetDto>): Promise<UserPasswordResetResultDto> {
        return this.userService.sendPasswordReset(command.payload, command.meta.client_ip ?? '');
    }

    /**
     * 비밀번호 초기화 — 인증번호 확인 → 임시 비밀번호 SMS (비로그인)
     *
     * @param command 명령 봉투
     */
    @OnCommand(USER_COMMAND.PASSWORD_RESET_CONFIRM)
    async confirmPasswordReset(command: MessageEnvelope<UserPasswordResetConfirmDto>): Promise<void> {
        return this.userService.confirmPasswordReset(command.payload);
    }
```

```typescript
// apps/user-service/src/user-service.module.ts — 변경부 (외부 연동 포트 첫 사용처)
import {SmsModule} from '@app/integration/sms/sms.module.js';

/**
 * ...
 * - SmsModule: SMS 발송 포트(SMS_SENDER, Amazon SNS) — 휴대폰 인증 · 아이디 찾기 · 비밀번호 초기화
 */
@Module({
    imports: [
        DatabaseModule,
        ScheduleModule.forRoot(),
        MessagingModule.forService({queue: USER_COMMAND_QUEUE, binding_keys: [USER_COMMAND_BINDING], broker_user: BROKER_USER.USER_SERVICE}),
        SmsModule,
        UserModule,
    ],
    providers: [{provide: APP_GUARD, useClass: InternalAuthGuard}, SeederService],
})
export class UserServiceModule {}
```

게이트웨이 큐 컨트롤러 — 형제는 `leave`(인증)와 `sign`(비인증)이다(user.controller.queue.ts:45 · 87). 데코레이터 순서는 verb → `@UseGuards` → `@ApiBearerAuth` → `@ApiOperation` → `@ApiBody` → `@ApiProduces` → `@ApiOkResponse` → 에러 응답들이고, 본문은 dispatch 한 줄이다.

```typescript
// apps/gateway/src/api/v1/user/user.controller.queue.ts — 추가부 (import 에 ApiTooManyRequestsResponse · 새 DTO 6개)
    /**
     * 휴대폰 인증번호 발송 — 가입 후 본인 휴대폰 인증. done 의 data 는 만료 시각.
     */
    @Post('/phone-verification')
    @UseGuards(PassportJwtAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({summary: '휴대폰 인증번호 발송'})
    @ApiBody({type: UserPhoneVerificationDto})
    @ApiProduces('text/event-stream')
    @ApiOkResponse({type: UserPhoneVerificationResultDto})
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiTooManyRequestsResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async sendPhoneVerification(@PassportActor() actor: Actor, @Body() dto: UserPhoneVerificationDto, @Ip() ip: string, @Res() res: Response): Promise<void> {
        await this.commandStream.dispatch(res, {type: USER_COMMAND.PHONE_VERIFICATION, actor, payload: dto, client_ip: ip});
    }

    /**
     * 휴대폰 인증번호 확인 — 확인되면 그 번호를 회원정보에 저장. done 의 data 는 null.
     */
    @Post('/phone-verification/confirm')
    @UseGuards(PassportJwtAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({summary: '휴대폰 인증번호 확인'})
    @ApiBody({type: UserPhoneVerificationConfirmDto})
    @ApiProduces('text/event-stream')
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async confirmPhoneVerification(@PassportActor() actor: Actor, @Body() dto: UserPhoneVerificationConfirmDto, @Ip() ip: string, @Res() res: Response): Promise<void> {
        await this.commandStream.dispatch(res, {type: USER_COMMAND.PHONE_VERIFICATION_CONFIRM, actor, payload: dto, client_ip: ip});
    }

    /**
     * 아이디 찾기 — 인증번호 발송. done 의 data 는 만료 시각.
     */
    @Post('/find-login-id')
    @ApiOperation({summary: '아이디 찾기 — 인증번호 발송'})
    @ApiBody({type: UserFindLoginIdDto})
    @ApiProduces('text/event-stream')
    @ApiOkResponse({type: UserFindLoginIdResultDto})
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiTooManyRequestsResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async sendFindLoginId(@Body() dto: UserFindLoginIdDto, @Ip() ip: string, @Res() res: Response): Promise<void> {
        await this.commandStream.dispatch(res, {type: USER_COMMAND.FIND_LOGIN_ID, actor: null, payload: dto, client_ip: ip});
    }

    /**
     * 아이디 찾기 — 인증번호 확인. done 의 data 는 아이디(일반) 또는 가입한 SNS.
     */
    @Post('/find-login-id/confirm')
    @ApiOperation({summary: '아이디 찾기 — 인증번호 확인'})
    @ApiBody({type: UserFindLoginIdConfirmDto})
    @ApiProduces('text/event-stream')
    @ApiOkResponse({type: UserFindLoginIdConfirmResultDto})
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async confirmFindLoginId(@Body() dto: UserFindLoginIdConfirmDto, @Ip() ip: string, @Res() res: Response): Promise<void> {
        await this.commandStream.dispatch(res, {type: USER_COMMAND.FIND_LOGIN_ID_CONFIRM, actor: null, payload: dto, client_ip: ip});
    }

    /**
     * 비밀번호 초기화 — 인증번호 발송(아이디 + 휴대폰 번호). done 의 data 는 만료 시각.
     */
    @Post('/password-reset')
    @ApiOperation({summary: '비밀번호 초기화 — 인증번호 발송'})
    @ApiBody({type: UserPasswordResetDto})
    @ApiProduces('text/event-stream')
    @ApiOkResponse({type: UserPasswordResetResultDto})
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiTooManyRequestsResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async sendPasswordReset(@Body() dto: UserPasswordResetDto, @Ip() ip: string, @Res() res: Response): Promise<void> {
        await this.commandStream.dispatch(res, {type: USER_COMMAND.PASSWORD_RESET, actor: null, payload: dto, client_ip: ip});
    }

    /**
     * 비밀번호 초기화 — 인증번호 확인 → 임시 비밀번호를 SMS 로 보낸다. done 의 data 는 null.
     */
    @Post('/password-reset/confirm')
    @ApiOperation({summary: '비밀번호 초기화 — 인증번호 확인'})
    @ApiBody({type: UserPasswordResetConfirmDto})
    @ApiProduces('text/event-stream')
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async confirmPasswordReset(@Body() dto: UserPasswordResetConfirmDto, @Ip() ip: string, @Res() res: Response): Promise<void> {
        await this.commandStream.dispatch(res, {type: USER_COMMAND.PASSWORD_RESET_CONFIRM, actor: null, payload: dto, client_ip: ip});
    }
```

### Test helper — `user.test-helper.ts`

```typescript
// apps/user-service/src/user/test/user.test-helper.ts — 변경부
import {SMS_SENDER} from '@app/integration/integration.symbols.js';

/** SMS 포트 mock */
export type SmsSenderMock = {send: Mock};

/**
 * SMS 포트 mock — 기본은 발송 성공.
 *
 * @returns mock
 */
export function createSmsSenderMock(): SmsSenderMock {
    return {send: vi.fn().mockResolvedValue(undefined)};
}

// createUserRepositoryMock — 끝에 5개
        insertSmsVerification: vi.fn(),
        countSmsVerifications: vi.fn(),
        findSmsVerification: vi.fn(),
        consumeSmsVerificationAttempt: vi.fn(),
        updateSmsVerification: vi.fn(),

// bootCommandPath · bootHttpPath — 세 번째 인자(기본값)로 SMS mock, providers 에 SMS_SENDER
export async function bootCommandPath(repo: UserRepositoryMock, jwt: JwtServiceMock, sms: SmsSenderMock = createSmsSenderMock()): Promise<{dispatcher: CommandDispatcher; module: TestingModule}> {
    const module = await Test.createTestingModule({
        imports: [DiscoveryModule],
        providers: [
            UserService,
            UserCommandHandler,
            CommandHandlerRegistry,
            CommandDispatcher,
            {provide: USER_REPOSITORY, useValue: repo},
            {provide: JwtService, useValue: jwt},
            {provide: SMS_SENDER, useValue: sms},
        ],
    }).compile();
    await module.init();
    return {dispatcher: module.get(CommandDispatcher), module};
}
// bootHttpPath 도 같은 방식 (providers 에 {provide: SMS_SENDER, useValue: sms})
```

### 설정 · 규약 문서

```bash
# .env.example — user-service 묶음(USER_SERVICE_HOST 다음)에 추가
# 같은 휴대폰 번호로 하루(한국 날짜)에 보낼 수 있는 인증 SMS 수 — 비우면 10
SMS_VERIFICATION_DAILY_LIMIT=10
```

```diff
 # README.md
-- **user-service** — 회원 도메인(:4001, 내부망). PostgreSQL 을 소유한다.
+- **user-service** — 회원 도메인(:4001, 내부망) — 가입 · 로그인 · 휴대폰 SMS 인증 · 아이디 찾기 · 비밀번호 초기화(임시 비밀번호 SMS). PostgreSQL 을 소유한다.
 # README.md — 실행 (Docker) 의 AWS 값 항목 다음
+- 같은 휴대폰 번호로 하루(한국 날짜)에 보내는 인증 SMS 수는 `SMS_VERIFICATION_DAILY_LIMIT`(기본 10)로 정한다.

 # AGENTS.md — Key Patterns
-- **Transaction**: service 쓰기 메서드에 `@Transactional()`, repository 는 `txHost.tx`. ...
+- **Transaction**: service 쓰기 메서드에 `@Transactional()`, repository 는 `txHost.tx`. 실패해도 남겨야 하는 쓰기(SMS 인증 시도 횟수 소비)만 repository 메서드에 `@Transactional(Propagation.RequiresNew)` — 독립 커밋(user.repository.ts `consumeSmsVerificationAttempt`). ...
-- **외부 연동 (미적용 규약 — 첫 사용처 Phase 5)**:
+- **외부 연동** (첫 사용처: user-service 휴대폰 SMS 인증 · 아이디 찾기 · 비밀번호 초기화 — `SmsModule`):
 # AGENTS.md — Auth 끝에 한 줄
+- 휴대폰 SMS 인증 여부는 `is_phone_verified`(가입 · 로그인 결과, auth-user) — 인증 전 회원을 막는 가드는 회원 전용 기능이 처음 생길 때 붙인다(지금은 막지 않는다).

 # AGENTS.md — Data Layer 엔티티 항목 끝에
+- **컬럼 이름**: 시각은 `<과거분사>_at`(`created_at` · `updated_at` · `verified_at`) · 만료는 `expires_at`, 여부 플래그는 `is_<형용사 · 과거분사>`(`is_deleted` · `is_login_allowed`), 직전 값은 `previous_<이름>`, PK 는 `<테이블>_id`(FK 는 가리키는 PK 와 같은 이름). 이름을 바꿀 때는 `db:generate`(DROP + ADD) 대신 손으로 쓴 RENAME 마이그레이션.
 # docs/data-layer.md — 엔티티 예시(49 ~ 61행)의 create_at · update_at → created_at · updated_at, 162행 → "기본 필터 `is_deleted = 0`, 정렬 `created_at DESC`", 같은 절에 위 이름 규칙 + RENAME 마이그레이션 한 단락
 # docs/data-layer.md:141 다음
+- 예외 — 실패해도 남겨야 하는 쓰기는 repository 메서드에 `@Transactional(Propagation.RequiresNew)`(독립 커밋). 현재 `consumeSmsVerificationAttempt` 1개(SMS 인증 시도 횟수 — 확인이 실패해 바깥 트랜잭션이 롤백돼도 횟수가 남아야 한다).
 # docs/architecture.md:41 — 의존 방향
-... `database` · `integration` 은 다른 lib 를 쓰지 않는다.
+... `database` → `common`(시더의 bcrypt — 첫 총관리자 비밀번호 해시), `integration` 은 다른 lib 를 쓰지 않는다.
 # docs/testing.md:43 다음 — 도우미 표
+| `createSmsSenderMock()` | `{send: vi.fn().mockResolvedValue(undefined)}` — `bootCommandPath` · `bootHttpPath` 의 세 번째 인자 기본값. 발송 인자 · 순서(`invocationCallOrder`) · 실패 후 미호출을 단언 |
 # docs/integration.md:3
-> 첫 사용처는 Phase 5(휴대폰 인증 · 비밀번호 초기화)다. ...
+> 첫 사용처는 user-service 의 휴대폰 SMS 인증 · 아이디 찾기 · 비밀번호 초기화다(`SmsModule`). ...
```

로드맵(`.beaver/output/roadmap/roomless-roadmap.md`) — build 때 상태 · 구조를 반영한다.
- Phase 4 표에 #26 · #27 을 옮긴다(유닛 5개). #21 · #22 문구를 확정 결정으로 바꾸고, 그래프의 유닛 수를 고친다.
- Phase 5 는 #24 · #25 만 남는다(유닛 2개). #25 에서 "일반 가입 휴대폰 필수" 를 지운다.
- Open Decisions "휴대폰 인증 규칙 · 비밀번호 초기화 방식" 을 닫힘으로 바꾼다.
- 공통 규칙 "휴대폰 인증" 을 확정 규칙으로 바꾼다.

---

## Test Cases

**케이스 상태 — 추천안이다.** 이 plan 을 검토하는 것이 곧 합의이고, 빼거나 더할 케이스는 `/beaver:build` 전에 말하면 반영한다. build 는 `[CASES]` 부터 쓴다.

**`apps/user-service/src/user/test/user.util.spec.ts`** — 순수 util 직접 호출. 형제는 `retry.spec.ts` 다. `randomInt` 는 `vi.mock('node:crypto', importOriginal)` 로 실제 함수를 감싼 `vi.fn` 으로 두고, 강제 케이스만 `mockReturnValueOnce` 로 바꾼다.

```
[CASES:kstDayStart]
 1. 2026-10-19T15:00:00.000Z (KST 10-20 00:00) → 2026-10-19T15:00:00.000Z (자기 자신)
 2. 2026-10-20T14:59:59.999Z (KST 10-20 23:59:59.999) → 2026-10-19T15:00:00.000Z
 3. 2026-10-20T15:00:00.000Z (KST 10-21 00:00) → 2026-10-20T15:00:00.000Z (날짜가 넘어간다)
 4. 2026-10-20T03:00:00.000Z (KST 10-20 12:00) → 2026-10-19T15:00:00.000Z
[CASES:getSmsDailyLimit]
 5. 없음 → 10 / '5' → 5 / 'abc' → 10 / '0' → 10 / '-3' → 10   (env 저장 · 복원)
[CASES:checkSmsVerification]
 6. verified_at 있음 → 'USED' (만료 전이어도)
 7. expires_at == now → 'EXPIRED' (경계 — 같으면 만료)
 8. expires_at < now → 'EXPIRED'
 9. verified_at null · expires_at > now → 'USABLE'
[CASES:generateVerificationCode]
10. 200회 모두 /^\d{6}$/ · randomInt 가 42 를 내면 '000042' (앞자리 0 유지)
[CASES:generateTemporaryPassword]
11. 200회 모두 길이 10 · /^[A-Za-z0-9]{10}$/ · 영문 1자 이상 · 숫자 1자 이상
12. 처음 10자가 숫자만 나오면 다시 뽑는다 — randomInt 를 숫자 인덱스 10번 → 섞인 값으로 강제, 결과에 영문 포함 · randomInt 호출 20회
[CASES:buildSmsVerification]
13. {sms_purpose_id:'PHONE_VERIFY', user_id, phone:'01012345678', code:'123456', ip:'', now} → SmsVerificationEntity 인스턴스 · ID 32자 hex · code_hash = sha256Hex('123456') · attempt_count 0 · expires_at = now + 5분 · verified_at null · ip null(빈 문자열 → null)
```

**큐 경로 service spec** — 실제 handler · service · CommandHandlerRegistry · CommandDispatcher 를 부팅한다(`bootCommandPath(repo, jwt, sms)`). repository · JwtService · SMS 포트만 mock 이다.
- `vi.mock(import('../user.util.js'), importOriginal)` 로 `generateVerificationCode` → '123456', `generateTemporaryPassword` → 'Abc123def4' 로 고정한다.
- bcrypt util 은 `vi.mock` 으로 막는다.
- 시각은 `vi.useFakeTimers({toFake: ['Date']})` + `FIXED_TIME` 이다.

`apps/user-service/src/user/test/user-phone-verification.spec.ts`:
```
[SUCCESS]  발송 — findUser(본인 · phone_verified_at null) → findUser({phone}) null → countSmsVerifications({phone, created_at: MoreThanOrEqual(kstDayStart(FIXED_TIME))}) 9
           → insertSmsVerification 1회(SmsVerificationEntity · purpose PHONE_VERIFY · user_id · phone · code_hash = sha256Hex('123456') · attempt 0 · expires_at = FIXED_TIME + 5분 · ip '10.0.0.1')
           → sms.send({to:'01012345678', text: '[roomless] 인증번호 [123456] — 5분 안에 입력해주세요.'}) · insert 다음에 send(invocationCallOrder) · done {sms_verification_id: insert 한 엔티티의 ID, expires_at}
[FAIL:service]  이미 인증한 회원 → 400 '이미 휴대폰 인증을 마쳤습니다.' · count · insert · send 미호출
[FAIL:duplicate] 다른 계정이 인증한 번호 → 400 '이미 가입된 번호입니다.' + validation_errors [{property:'phone'}] · insert · send 미호출
[FAIL:business] 오늘 이미 10건(env 없음 → 10) → 429 '오늘은 이 번호로 …' · insert · send 미호출 / SMS_VERIFICATION_DAILY_LIMIT='3' 이면 3건에서 429
[FAIL:service]  회원 없음 → 404
[FAIL:infra]    sms.send 가 ServiceUnavailableException(503) → 판정 requeue(재시도) / delivery_count 가 마지막이면 failed 503 + dead (insert 는 호출됨 — 롤백은 실제 DB 트랜잭션 몫)
[SUCCESS]  확인 — findSmsVerification({sms_verification_id, sms_purpose_id:'PHONE_VERIFY', user_id}) 사용 가능 → consumeSmsVerificationAttempt(id, 3) true → code 일치
           → updateSmsVerification({sms_verification_id}, {verified_at: FIXED_TIME}) → updateUser({user_id}, {phone: 기록의 phone, phone_verified_at: FIXED_TIME}) · done null
[FAIL:service]  인증 ID 의 기록 없음(틀린 ID · 다른 회원 · 다른 용도) → 404 '인증 정보를 찾을 수 없습니다. 인증번호를 다시 요청해주세요.' · consume 미호출
[FAIL:service]  이미 사용 / 만료 → 400 각 메시지 · consume 미호출
[FAIL:business] consume false(3회 소진) → 400 '인증번호 입력 횟수를 초과했습니다. …' · updateSmsVerification · updateUser 미호출
[FAIL:validation] code 불일치 → 400 '인증번호가 일치하지 않습니다.' + validation_errors [{property:'code'}] · consume 1회 호출 · update 미호출
[FAIL:auth]     actor 없는 명령 → requireActor 401 · findUser 미호출
```

`apps/user-service/src/user/test/user-find-login-id.spec.ts`:
```
[SUCCESS]  발송 — findUser({phone, state_id: In(['ACTIVE','BLOCK','LEAVE_WAIT'])}) → count → insert(purpose FIND_LOGIN_ID · user_id = 찾은 회원) → send · done {sms_verification_id, expires_at}
[FAIL:service]  그 번호의 회원 없음 → 404 '일치하는 회원 정보가 없습니다.' · insert · send 미호출
[FAIL:business] 하루 한도 → 429
[SUCCESS]  확인 — findSmsVerification({sms_verification_id, sms_purpose_id:'FIND_LOGIN_ID'}) → findUser({user_id: 기록의 user_id, state_id: In([...])}) 일반 계정 → done {login_id:'roomless_01', sns_id:null, created_at: 회원 created_at 의 ISO 문자열}
[SUCCESS]  확인 — SNS 계정 → done {login_id:null, sns_id:'KAKAO', created_at}
[FAIL:service]  인증 ID 의 기록 없음 → 404 · consume 미호출 / 그 기록의 회원이 탈퇴 완료 → 404 · consume 미호출
[FAIL:validation] 불일치 → 400 · updateSmsVerification 미호출
```

`apps/user-service/src/user/test/user-password-reset.spec.ts`:
```
[SUCCESS]  발송 — findUser({login_id, phone, state_id: In([...])}) 일반 계정 → count → insert(purpose PASSWORD_RESET) → send · done {sms_verification_id, expires_at}
[FAIL:service]  아이디 + 번호가 다른 계정 → 404 '일치하는 회원 정보가 없습니다.' · send 미호출
[FAIL:service]  SNS 계정 → 400 'SNS로 가입한 계정은 …' · count · insert · send 미호출
[FAIL:business] 하루 한도 → 429
[SUCCESS]  확인 — findSmsVerification({sms_verification_id, sms_purpose_id:'PASSWORD_RESET'}) → findUser({user_id: 기록의 user_id, state_id: In([...])}) → consume → 일치
           → updateSmsVerification verified_at → getBcrypt('Abc123def4') → updateUser({user_id}, {login_pw: 해시, is_password_change_required: 1})
           → sms.send({to: 기록의 phone, text: '[roomless] 임시 비밀번호 Abc123def4 — 로그인 후 비밀번호를 바꿔주세요.'}) · updateUser 다음에 send(마지막) · done null
[FAIL:service]  인증 ID 의 기록 없음 → 404 · findUser · consume 미호출 / 그 기록의 회원이 탈퇴 완료 → 404 · consume 미호출
[FAIL:validation] 불일치 → 400 · getBcrypt · updateUser · send 미호출
```

기존 spec 갱신(행동 단언 추가):
```
user-sign · user-general-sign      [SUCCESS] done 결과에 is_phone_verified: 0
user-login · user-general-login    [SUCCESS] phone_verified_at 있는 회원 → is_phone_verified 1 / null → 0
user-auth-user                     [SUCCESS] 결과에 is_phone_verified (phone_verified_at 있으면 1)
user-sign · user-login(DTO 검증)   [FAIL:validation] sns_id 'GOOGLE' → 400 (네이버 · 카카오만) — 이미 있는 검증 spec 이 있으면 그 표에 한 줄
```

**`apps/user-service/src/user/test/user.repository.spec.ts`** — 형제 케이스(TypeORM 오류 → HTTP 예외 매핑) 표에 더한다.
```
[FAIL:repository] insertSmsVerification — 23503 FK_SmsVerification_SmsPurpose → 400 '존재하지 않는 SMS 인증 용도입니다.' / FK_SmsVerification_User → 400 '존재하지 않는 회원입니다.' / 그 밖 → 500
[FAIL:duplicate]  updateUser — 23505 UK_User_Phone → 400 '이미 가입된 번호입니다.' / 그 밖 → 500
[SUCCESS]         consumeSmsVerificationAttempt — 가짜 createQueryBuilder 체인의 execute 가 {affected:1} → true, {affected:0} → false, 실패 → 500
[SMOKE:data-access] buildConsumeSmsVerificationAttemptQuery('v1', 3) — DB 연결 없이 (await buildMetadatas)
           → 'UPDATE "t_sms_verification" SET "attempt_count" = "attempt_count" + 1, "updated_at" = CURRENT_TIMESTAMP WHERE "sms_verification_id" = $1 AND "attempt_count" < $2', parameters ['v1', 3]
           (기획 때 같은 컬럼 구성의 EntitySchema 로 TypeORM 1.x 가 실제로 만든 SQL — 식 안 컬럼도 따옴표가 붙는다)
[SMOKE:data-access] buildLoginUserQuery — 기존 SQL 고정값 · 별칭 목록에 '"u"."phone_verified_at" AS "phone_verified_at"' 를 state_id 다음에, 's.is_login_able' 을 '"s"."is_login_allowed" AS "is_login_allowed"' · 'WHERE … "s"."is_login_allowed" = 1' 로 반영
```

**`libs/database/src/test/seeder.spec.ts`** — 가짜 DataSource 에 `SmsPurposeEntity` · `UserEntity`(find · findOne · insert) · `UserSettingEntity` 를 더하고, `getBcrypt` 는 `vi.mock` 으로 막는다.
```
[SUCCESS]  빈 DB 면 대상 순서대로 전부 insert — t_sms_purpose 에 SMS_PURPOSE_SEED_DATA, t_user 에 총관리자(UserEntity 인스턴스 · login_id 'admin' · user_id 32자 hex · auth_id 'SUPER_ADMIN' · login_pw = getBcrypt('1234') 결과 · is_password_change_required 1),
           t_user_setting 에 findOne({where:{login_id:'admin'}}) 이 돌려준 회원의 user_id 로 1행 · 순서 Auth → State → Sns → SmsPurpose → User → UserSetting
[SUCCESS]  총관리자 존재 확인은 login_id 기준 — t_user 의 find 가 {login_id: In(['admin'])} 로 불리고, 있으면 insert 하지 않는다(바꾼 비밀번호를 덮지 않는다)
[SUCCESS]  회원 설정 확인은 user_id 기준 — 이미 있으면 insert 하지 않는다 / 총관리자가 없으면(findOne null) 회원 설정을 만들지 않는다
[SUCCESS]  key 가 없는 대상(룩업)은 지금처럼 PK 기준
[FAIL:target] 만드는 함수가 실패(getBcrypt reject)하면 그 대상만 건너뛰고 다음 대상(회원 설정)은 계속
```

**`apps/gateway/src/api/v1/user/test/user.controller.queue.spec.ts`** — 가짜 브로커(FakeBroker)로 실제 HTTP · SSE 를 확인한다.
```
[SUCCESS]  POST /phone-verification · /phone-verification/confirm — 로그인 회원 actor + payload 로 user.member.phone-verification(-confirm) 발행, accepted → done
[SUCCESS]  POST /find-login-id · /find-login-id/confirm · /password-reset · /password-reset/confirm — actor null + payload 로 각 명령 발행, accepted → done
[FAIL:auth]     /phone-verification 인증 실패 → 401 · 발행 없음
[FAIL:validation] phone '010-1234-5678'(하이픈) → 400 property 'phone' · code '12345' → 400 property 'code' · sms_verification_id 'abc' → 400 property 'sms_verification_id' · 발행 없음
[FAIL:service]  서비스 failed 429 → SSE failed 이벤트 {status_code: 429, message, validation_errors: null}
```

```
테스트 생략(위임형):
- UserCommandHandler 새 메서드 6개 — 서비스 위임 한 줄. 큐 경로 service spec 이 실제 핸들러를 부팅해서 함께 지난다.
- SmsPurposeEntity · SmsVerificationEntity · UserEntity 컬럼 — 선언. 엔티티 ↔ 마이그레이션 일치는 `npm run db:check` 가 확인한다.
- user-service.module.ts 의 SmsModule import — 배선 글루. typecheck · build 로 확인.
- 새 DTO 6개의 검증 전부 — 대표 분기(phone 형식 · code 형식)만 게이트웨이 spec 에서. 나머지 필수 · 길이는 같은 데코레이터 반복.
- smsVerificationText · temporaryPasswordText — 문자열 조립. 큐 경로 spec 이 send 인자로 본문 전체를 단언한다.
```

검증(build 후 `/beaver:test`): `npm test` · `npm run typecheck` · `npm run lint` · `npm run build` · `npm run db:check`.

---

## Response Codes

큐 경로 — SSE `failed` 이벤트의 `status_code` + 본문(`{message, validation_errors}`)이다. 입력 검증 실패는 게이트웨이에서 스트림을 열기 전 일반 400 이다.

| Code | Cause |
|------|------|
| done | 발송 3개 → `{sms_verification_id, expires_at}` · 휴대폰 인증 확인 → null · 아이디 찾기 확인 → `{login_id, sns_id, created_at}` · 비밀번호 초기화 확인 → null |
| 400 (스트림 전) | phone · login_id · sms_verification_id · code 형식 · 필수 위반 — validation_errors 에 필드 |
| 401 (스트림 전) | `/phone-verification` · `/phone-verification/confirm` 인증 실패 |
| 400 `이미 휴대폰 인증을 마쳤습니다.` | 휴대폰 인증 발송 · 확인 — 이미 인증한 회원 |
| 400 `이미 가입된 번호입니다.` | 다른 계정이 인증한 번호(발송: validation_errors phone, 확인 경쟁: UK_User_Phone) |
| 400 `SNS로 가입한 계정은 비밀번호를 초기화할 수 없습니다. 가입한 SNS로 로그인해주세요.` | 비밀번호 초기화 발송 — SNS 계정 |
| 400 `이미 사용한 인증번호입니다. 인증번호를 다시 요청해주세요.` | 그 인증 ID 의 기록이 이미 인증됨 |
| 400 `인증번호가 만료되었습니다. 인증번호를 다시 요청해주세요.` | 발송 후 5분 경과 |
| 400 `인증번호 입력 횟수를 초과했습니다. 인증번호를 다시 요청해주세요.` | 그 기록의 시도 3회 소진 |
| 400 `인증번호가 일치하지 않습니다.` | 불일치 — validation_errors code (시도 1회 소비됨) |
| 401 `로그인이 필요합니다.` | 휴대폰 인증 명령에 actor 없음(requireActor) |
| 404 `회원 정보를 찾을 수 없습니다.` | 휴대폰 인증 — 로그인 회원 없음 |
| 404 `인증 정보를 찾을 수 없습니다. 인증번호를 다시 요청해주세요.` | 확인 3개 — 인증 ID 의 기록이 없음(틀린 ID · 다른 회원 · 다른 용도) |
| 404 `일치하는 회원 정보가 없습니다.` | 아이디 찾기(그 번호의 회원 없음) · 비밀번호 초기화(아이디 + 번호 불일치) · 확인 때 그 기록의 회원이 탈퇴 완료 |
| 429 `오늘은 이 번호로 인증번호를 더 보낼 수 없습니다. 내일 다시 시도해주세요.` | 발송 3개 — 같은 번호 오늘(KST) 발송 수 ≥ SMS_VERIFICATION_DAILY_LIMIT |
| 503 `SMS를 보내지 못했습니다. 잠시 후 다시 시도해주세요.` | SMS 포트 실패(AWS 미세팅 포함) — 재시도 3회 후 failed + DLQ, 트랜잭션 롤백으로 발송 기록 · 비밀번호 변경도 남지 않는다 |
| 500 `서버에서 오류가 발생했습니다. 관리자에게 문의해주세요.` | DB 실패 — 재시도 후 failed + DLQ |
