# Plan — server-split

## Feature Summary
- **Feature**: 서버 분할 — crontab 전용 scheduler 서버 · 서버별 인스턴스 수(env) · 인증번호 확인의 DB 연결 풀 교착 수정(실패를 return)
- **Entry point**: `@Cron · @OnCommand · 내부 HTTP` — `apps/scheduler/src/main.ts(NestFactory.createApplicationContext) · user.member.phone-verification-confirm · user.member.find-login-id-confirm · user.member.password-reset-confirm`
- **Domain**: platform (로드맵 Phase 5 — #88 · #89 · #90 · #91)
- **Spec**: [server-split-spec.md](../../spec/platform/server-split-spec.md)

---

## File List

| File | Action |
|------|------|
| `apps/scheduler/tsconfig.app.json` | new — 앱 빌드 설정 (user-service 와 같은 형태) |
| `apps/scheduler/src/main.ts` | new — `NestFactory.createApplicationContext` (listen 없음) (#88) |
| `apps/scheduler/src/scheduler.module.ts` | new — `DatabaseModule` · `ScheduleModule.forRoot()` · `UserModule` (#88) |
| `apps/scheduler/src/user/user.module.ts` · `user.symbols.ts` | new — crontab + repository 포트 (#89) |
| `apps/scheduler/src/user/interfaces/user.repository.interface.ts` | new — `findUsers` · `updateUser` (#89) |
| `apps/scheduler/src/user/repositories/user.repository.ts` | new — `buildUsersQuery`(QueryBuilder + setFindOptions) · `findUsers` · `updateUser` (#89) |
| `apps/user-service/src/user/crontabs/user-leave-cleanup.crontab.ts` → `apps/scheduler/src/user/crontabs/user-leave-cleanup.crontab.ts` | moved (git mv) — 주석만 수정 (#89) |
| `apps/user-service/src/user/test/user-leave-cleanup.crontab.spec.ts` → `apps/scheduler/src/user/test/user-leave-cleanup.crontab.spec.ts` | moved (git mv) — 제목 한 곳 수정 (#89) |
| `apps/scheduler/src/user/test/user.test-helper.ts` | new — `createUserRepositoryMock` (findUsers · updateUser) |
| `apps/scheduler/src/user/test/user.repository.spec.ts` | new — `[SMOKE:data-access]` 탈퇴 대상 조회 SQL |
| `nest-cli.json` | modified — `scheduler` 프로젝트 (#88) |
| `package.json` | modified — `build:scheduler` · `start:scheduler` · `start:prod:scheduler` · `docker:scheduler` · `docker:logs:scheduler`, `build` · `docker:up` · `docker:down` 에 scheduler (#88 · #90) |
| `compose.scheduler.yml` | new — scheduler × `SCHEDULER_REPLICAS`(기본 1), `roomless-data` 만 (#90) |
| `Dockerfile` | modified — 주석의 앱 목록에 scheduler (구조 변경 없음) |
| `.env.example` | modified — `SCHEDULER_REPLICAS=1` · `DATABASE_CONNECTION_TIMEOUT_MS=30000` (#90 · #91) |
| `apps/user-service/src/user-service.module.ts` | modified — `ScheduleModule` 제거, `APP_INTERCEPTOR` `ReturnedExceptionInterceptor` 등록 (#89 · #91) |
| `apps/user-service/src/user/user.module.ts` | modified — crontab provider 제거 (#89) |
| `apps/user-service/src/user/user.service.ts` | modified — 확인 3개: 불일치는 return, 반환 타입 · JSDoc (#91) |
| `apps/user-service/src/user/controllers/user.controller.queue.ts` | modified — 확인 3개 반환 타입 · JSDoc (#91) |
| `apps/user-service/src/user/repositories/user.repository.ts` | modified — `findUsers` 제거, `consumeSmsVerificationAttempt` 의 `@Transactional(Propagation.RequiresNew)` 제거 (#89 · #91) |
| `apps/user-service/src/user/interfaces/user.repository.interface.ts` | modified — `findUsers` 제거 · 시도 소비 주석 (#89 · #91) |
| `apps/user-service/src/user/test/user.test-helper.ts` | modified — `findUsers` mock 제거, `bootHttpPath` 에 `APP_INTERCEPTOR` (#89 · #91) |
| `apps/user-service/src/user/test/user.repository.spec.ts` | modified — `findUsers` 케이스 제거 (#89) |
| `libs/messaging/src/command.dispatcher.ts` | modified — 핸들러가 반환한 `HttpException` → failed + ack (#91) |
| `libs/messaging/src/test/command.dispatcher.spec.ts` | modified — `[CASES:returned-exception]` ①②③ (#91) |
| `libs/common/src/exception/returned-exception.interceptor.ts` | new — 내부 HTTP 에서 반환된 예외를 다시 throw (#91) |
| `libs/common/src/exception/test/returned-exception.interceptor.spec.ts` | new — `[CASES:returned-exception]` ⑤⑥ (#91) |
| `libs/common/src/utils/env.ts` | new — `readPositiveInt` (gateway transport.util 에서 이동) (#91) |
| `libs/common/src/utils/test/env.spec.ts` | new — `[CASES:readPositiveInt]` (internal-http.client.spec.ts 에서 이동) |
| `apps/gateway/src/modules/transport/transport.util.ts` | modified — `readPositiveInt` 제거 |
| `apps/gateway/src/modules/transport/command-stream.service.ts` · `internal-http.client.ts` | modified — `readPositiveInt` import 를 `@app/common/utils/env.js` 로 |
| `apps/gateway/src/modules/transport/test/internal-http.client.spec.ts` | modified — `readPositiveInt` 케이스 · import 제거 (env.spec.ts 로 이동) |
| `libs/database/src/typeorm.config.ts` | modified — `connectTimeoutMS: readPositiveInt(DATABASE_CONNECTION_TIMEOUT_MS, 30000)` (#91) |
| `README.md` | modified — scheduler 서버 · 실행 · 명령 · 구조 · 연결 대기 env |
| `AGENTS.md` | modified — 구조 트리 · Transaction(RequiresNew 예외 → 실패 return) · Error & Response · 스케줄러(scheduler 앱에만) · Docker 묶음 5개 · Data-Access Smoke 적용처 · Checklist |
| `docs/architecture.md` · `docs/messaging.md` · `docs/error-handling.md` · `docs/data-layer.md` · `docs/testing.md` · `docs/conventions.md` | modified — 같은 내용 상세 |
| `.beaver/output/roadmap/roomless-roadmap.md` · `.html` | modified — Phase 5 진행 상태 |
| `apps/user-service/src/user/test/user-{phone-verification,find-login-id,password-reset}.spec.ts` | 변경 없음 — 디스패처까지 부팅해 결과(failed 400 · ack · update 미호출)를 단언하므로, throw → return 이어도 단언이 그대로 맞다 |
| `apps/gateway/**`(transport 외) · `libs/database/src/job-lock/*` · `scripts/docker-network.mjs` | 변경 없음 — scheduler 는 기존 `roomless-data` 네트워크 · `JobLockService` 를 그대로 쓴다 |

정리할 기존 코드(§1.7)
- user-service: `ScheduleModule.forRoot()`, `crontabs/`(→ scheduler), `UserLeaveCleanupCrontab` provider
- `findUsers`(crontab 만 사용 — repository · 인터페이스 · 테스트 mock · repository spec 2곳)
- repository 의 `Propagation` · `Transactional` import
- gateway `transport.util.ts` 의 `readPositiveInt` 와 그 케이스
- AGENTS.md · data-layer.md 의 "RequiresNew 예외" 문단

---

## Design

### Entry Point — scheduler 앱 (#88)

user-service 루트 모듈(apps/user-service/src/user-service.module.ts:21)과 같은 조립이다. 들어오는 연결이 없어 `APP_GUARD` · `MessagingModule` · `SmsModule` · `SeederService` 를 뺐다. 시드 · 마이그레이션은 DB 를 소유한 user-service 몫이다.

```typescript
// apps/scheduler/src/main.ts — 새 파일
import 'dotenv/config';
import {NestFactory} from '@nestjs/core';
import {SchedulerModule} from './scheduler.module.js';

/**
 * scheduler 부트스트랩 — crontab 만 도는 서버.
 * HTTP 리스너 · 큐 소비가 없어 들어오는 연결이 없다(createApplicationContext — listen 하지 않는다).
 * 종료 훅으로 DB 연결을 정리한다. 등록된 @Cron 타이머가 프로세스를 살려 둔다.
 */
async function bootstrap(): Promise<void> {
    const app = await NestFactory.createApplicationContext(SchedulerModule);
    app.enableShutdownHooks();
}

await bootstrap();
```

```typescript
// apps/scheduler/src/scheduler.module.ts — 새 파일
import {Module} from '@nestjs/common';
import {ScheduleModule} from '@nestjs/schedule';
import {DatabaseModule} from '@app/database/database.module.js';
import {UserModule} from './user/user.module.js';

/**
 * scheduler 루트 모듈 — crontab 만 돈다. 들어오는 연결이 없어 APP_GUARD · MessagingModule · 컨트롤러가 없다.
 * - DatabaseModule: TypeORM(PostgreSQL) + JobLockService(여러 대여도 회차마다 1대만 실행)
 * - ScheduleModule: 도메인별 crontabs 폴더의 @Cron 을 돌린다 (앱마다 forRoot 1회)
 * - 기본 데이터 시드 · 마이그레이션은 DB 를 소유한 user-service 가 맡는다
 */
@Module({
    imports: [DatabaseModule, ScheduleModule.forRoot(), UserModule],
})
export class SchedulerModule {}
```

```json
// apps/scheduler/tsconfig.app.json — 새 파일 (apps/user-service/tsconfig.app.json 과 같은 형태)
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "outDir": "../../dist/apps/scheduler",
    "rootDir": "../.."
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "**/*.spec.ts", "**/test/**"]
}
```

```json
// nest-cli.json — projects 에 추가
    "scheduler": {
      "type": "application",
      "root": "apps/scheduler",
      "entryFile": "apps/scheduler/src/main",
      "sourceRoot": "apps/scheduler/src",
      "compilerOptions": {"tsConfigPath": "apps/scheduler/tsconfig.app.json"}
    }
```

```json
// package.json — scripts 변경부
    "build": "npm run build:gateway && npm run build:user-service && npm run build:scheduler",
    "build:scheduler": "nest build scheduler",
    "start:scheduler": "nest start scheduler --watch",
    "start:prod:scheduler": "node dist/apps/scheduler/apps/scheduler/src/main.js",
    "docker:scheduler": "docker compose -f compose.scheduler.yml up -d --build",
    "docker:up": "npm run docker:infra && npm run docker:user-service && npm run docker:scheduler && npm run docker:gateway",
    "docker:down": "docker compose -f compose.gateway.yml down && docker compose -f compose.scheduler.yml down && docker compose -f compose.user-service.yml down && docker compose -f compose.rabbitmq.yml down && docker compose -f compose.postgres.yml down",
    "docker:logs:scheduler": "docker compose -f compose.scheduler.yml logs -f scheduler",
```

### Data Access — scheduler 회원 repository (#89)

형제는 user-service `UserRepository` 다(apps/user-service/src/user/repositories/user.repository.ts — `users` getter · try/catch 500 · `findUsers` · `updateUser`). 같은 계약을 따른다.

조회는 형제의 `this.users.find({where, loadRelationIds: true})` 대신 같은 동작의 QueryBuilder 빌더로 분리한다. TypeORM 의 `find` 가 내부에서 `createQueryBuilder().setFindOptions(options).getMany()` 를 부른다.
- 이유: `state_id` FK 문자열 where 는 docs/testing.md "Data-Access Smoke" 의 매핑 민감 쿼리라 smoke 로 SQL 을 고정해야 한다.
- 빌드 결과(기획 때 접속 없는 DataSource 로 확인): `FROM "t_user" "u" WHERE (("u"."state_id" = $1) AND ("u"."leave_reserved_at" <= $2))`, 파라미터 `['LEAVE_WAIT', '2026-01-15 09:30:00']`.

`updateUser` 는 형제와 달리 `UK_User_Phone` → 400 분기를 두지 않는다. 사용자에게 돌려줄 응답이 없고, crontab 이 건별 실패를 잡고 건너뛰기 때문이다(user-leave-cleanup.crontab.ts 의 건별 try/catch).

```typescript
// apps/scheduler/src/user/user.symbols.ts — 새 파일
/** 회원 repository 포트 토큰 (scheduler) */
export const USER_REPOSITORY = Symbol('UserRepositoryInterface');
```

```typescript
// apps/scheduler/src/user/interfaces/user.repository.interface.ts — 새 파일
import type {FindOptionsWhere} from 'typeorm';
import type {UserEntity} from '@app/database/entities/user/user.entity.js';

/**
 * scheduler 의 회원 repository 포트 — crontab 이 쓰는 조회 · 수정만 둔다.
 * 공유 DB 단계라 user-service 와 같은 엔티티(t_user)를 다룬다.
 */
export interface UserRepositoryInterface {
    /** 회원 목록 조회 — FK 는 loadRelationIds 로 ID 를 채운다 */
    findUsers(where: FindOptionsWhere<UserEntity>): Promise<UserEntity[]>;
    /** 회원 정보 수정 — new UserEntity() + 할당으로 호출(@BeforeUpdate updated_at 트리거) */
    updateUser(where: FindOptionsWhere<UserEntity>, entity: UserEntity): Promise<void>;
}
```

```typescript
// apps/scheduler/src/user/repositories/user.repository.ts — 새 파일
import {Injectable, InternalServerErrorException} from '@nestjs/common';
import {TransactionHost} from '@nestjs-cls/transactional';
import type {TransactionalAdapterTypeOrm} from '@nestjs-cls/transactional-adapter-typeorm';
import type {FindOptionsWhere, Repository, SelectQueryBuilder} from 'typeorm';
import {UserEntity} from '@app/database/entities/user/user.entity.js';
import type {UserRepositoryInterface} from '../interfaces/user.repository.interface.js';

/** DB 최종 실패 메시지 */
const SERVER_ERROR_MESSAGE = '서버에서 오류가 발생했습니다. 관리자에게 문의해주세요.';

/**
 * scheduler 의 회원 repository (아웃바운드 어댑터) — crontab 이 쓰는 t_user 조회 · 수정.
 * crontab 은 트랜잭션 없이 건별로 처리하므로 `txHost.tx` 는 기본 EntityManager 다.
 */
@Injectable()
export class UserRepository implements UserRepositoryInterface {
    /**
     * @param txHost 트랜잭션 호스트
     */
    constructor(private readonly txHost: TransactionHost<TransactionalAdapterTypeOrm>) {}

    /** t_user repository (현재 트랜잭션 기준) */
    private get users(): Repository<UserEntity> {
        return this.txHost.tx.getRepository(UserEntity);
    }

    /**
     * 회원 목록 조회
     *
     * @param where 조회 조건
     * @returns 회원 목록
     */
    async findUsers(where: FindOptionsWhere<UserEntity>): Promise<UserEntity[]> {
        try {
            return await this.buildUsersQuery(where).getMany();
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 회원 목록 조회 쿼리 — find 와 같은 동작(setFindOptions + loadRelationIds). FK 문자열 where 가 매핑 민감이라 Data-Access Smoke spec 으로 SQL 을 고정한다.
     *
     * @param where 조회 조건
     * @returns 쿼리 빌더
     */
    buildUsersQuery(where: FindOptionsWhere<UserEntity>): SelectQueryBuilder<UserEntity> {
        return this.users.createQueryBuilder('u').setFindOptions({where, loadRelationIds: true});
    }

    /**
     * 회원 정보 수정 — new UserEntity() + 할당으로 호출(@BeforeUpdate updated_at 트리거)
     *
     * @param where 수정 조건
     * @param entity 수정할 값
     */
    async updateUser(where: FindOptionsWhere<UserEntity>, entity: UserEntity): Promise<void> {
        try {
            await this.users.update(where, entity);
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }
}
```

### Entry Point — 탈퇴 자동처리 crontab 이전 (#89)

```typescript
// apps/scheduler/src/user/user.module.ts — 새 파일
import {Module} from '@nestjs/common';
import {UserLeaveCleanupCrontab} from './crontabs/user-leave-cleanup.crontab.js';
import {UserRepository} from './repositories/user.repository.js';
import {USER_REPOSITORY} from './user.symbols.js';

/**
 * scheduler 의 회원 도메인 — crontab(시간 트리거 인바운드 어댑터)이 repository 포트를 직접 쓴다(service 없음).
 */
@Module({
    providers: [UserLeaveCleanupCrontab, {provide: USER_REPOSITORY, useClass: UserRepository}],
})
export class UserModule {}
```

crontab 은 `git mv` 로 옮긴다. import(`../interfaces/user.repository.interface.js` · `../user.symbols.js`)는 같은 폴더 구조라 그대로 맞는다. 본문 · 잠금 키(`user.leave-cleanup`)는 그대로다. 바꾸는 것은 클래스 주석뿐이다.

```typescript
// apps/scheduler/src/user/crontabs/user-leave-cleanup.crontab.ts — 클래스 주석 변경부
/**
 * 회원 자동 탈퇴처리 스케줄러 — 예약시각이 지난 LEAVE_WAIT 회원을 백업 후 LEAVE 로 전환한다.
 * crontab 은 scheduler 앱의 도메인 crontabs 폴더에만 둔다 — 시간이 트리거인 인바운드 어댑터라 controller 와 같은 층이다(서비스 앱에는 두지 않는다).
 * scheduler 는 SCHEDULER_REPLICAS 로 여러 대일 수 있고 배포 중 두 대가 겹칠 수 있다 — JobLockService(DB advisory lock)로 회차마다 1대만 실행한다.
 * 앞 인스턴스가 끝난 뒤 다른 인스턴스가 잠금을 잡아도 대상은 LEAVE_WAIT 상태로만 고르므로 다시 처리되지 않는다.
 */
```

```typescript
// apps/user-service/src/user/user.module.ts — 변경부 (crontab 제거)
import {Module} from '@nestjs/common';
import {JwtModule} from '@nestjs/jwt';
import {UserController} from './controllers/user.controller.js';
import {UserQueueController} from './controllers/user.controller.queue.js';
import {UserRepository} from './repositories/user.repository.js';
import {UserService} from './user.service.js';
import {USER_REPOSITORY} from './user.symbols.js';

/**
 * 회원 도메인 — 인바운드 어댑터 2종이 같은 service 를 부른다(crontab 은 scheduler 앱).
 * - UserController(controllers/user.controller.ts): 내부 HTTP (게이트웨이 동기 경로) — controllers 에 등록
 * - UserQueueController(controllers/user.controller.queue.ts): RabbitMQ (게이트웨이 큐 경로) — `@OnCommand` provider 라 providers 에 등록
 */
@Module({
    imports: [JwtModule.registerAsync({useFactory: () => ({secret: process.env.JWT_SECRET})})],
    controllers: [UserController],
    providers: [UserService, UserQueueController, {provide: USER_REPOSITORY, useClass: UserRepository}],
})
export class UserModule {}
```

```typescript
// apps/user-service/src/user-service.module.ts — 변경부
import {Module} from '@nestjs/common';
import {APP_GUARD, APP_INTERCEPTOR} from '@nestjs/core';
import {ReturnedExceptionInterceptor} from '@app/common/exception/returned-exception.interceptor.js';
import {InternalAuthGuard} from '@app/common/internal/internal-auth.guard.js';
// (ScheduleModule import 삭제)

/**
 * user-service 루트 모듈 — 게이트웨이를 거친 요청만 받는다.
 * - APP_GUARD(InternalAuthGuard): 모든 HTTP 요청에 게이트웨이의 내부 토큰을 요구한다
 * - APP_INTERCEPTOR(ReturnedExceptionInterceptor): 내부 HTTP 컨트롤러가 반환한 HttpException 을 실패 응답으로 바꾼다(커밋 뒤 실패 — 큐 경로는 CommandDispatcher)
 * - DatabaseModule: TypeORM(PostgreSQL) + `@Transactional()` (nestjs-cls)
 * - MessagingModule.forService: q.user.cmd 소비 → `@OnCommand` 핸들러 디스패치 (user_id 가 gateway 인 명령만 처리)
 * - SmsModule: SMS 발송 포트(SMS_SENDER, Amazon SNS) — 휴대폰 인증 · 아이디 찾기 · 비밀번호 초기화
 * - SeederService: DB 를 소유하는 이 서비스가 룩업 기본 데이터 · 첫 총관리자를 보장한다
 * crontab 은 scheduler 앱이 돌린다(이 서비스에는 ScheduleModule 이 없다).
 */
@Module({
    imports: [
        DatabaseModule,
        MessagingModule.forService({queue: USER_COMMAND_QUEUE, binding_keys: [USER_COMMAND_BINDING], broker_user: BROKER_USER.USER_SERVICE}),
        SmsModule,
        UserModule,
    ],
    providers: [{provide: APP_GUARD, useClass: InternalAuthGuard}, {provide: APP_INTERCEPTOR, useClass: ReturnedExceptionInterceptor}, SeederService],
})
export class UserServiceModule {}
```

### Data Access — user-service 정리 (#89 · #91)

```typescript
// apps/user-service/src/user/repositories/user.repository.ts — 변경부
import {TransactionHost} from '@nestjs-cls/transactional'; // Propagation · Transactional 삭제

// findUsers(where) 메서드 전체 삭제 — crontab 만 썼고 crontab 은 scheduler 로 옮겼다

    /**
     * 확인 시도 1회 소비 — attempt_count < max 인 행만 원자적으로 +1 한다.
     * 확인과 같은 트랜잭션에서 실행한다 — 인증번호 불일치는 service 가 예외를 return 해 트랜잭션이 커밋되므로 소비한 횟수가 남는다.
     * 갱신이 그 행을 잠가 같은 인증 기록의 동시 확인은 차례로 처리된다(한도를 넘겨 소비되지 않는다).
     *
     * @param sms_verification_id 인증 기록 ID
     * @param max_attempts 시도 한도
     * @returns 소비했으면 true, 이미 한도에 닿았으면 false
     */
    async consumeSmsVerificationAttempt(sms_verification_id: string, max_attempts: number): Promise<boolean> {
        try {
            const result = await this.buildConsumeSmsVerificationAttemptQuery(sms_verification_id, max_attempts).execute();
            return result.affected === 1;
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }
```

```typescript
// apps/user-service/src/user/interfaces/user.repository.interface.ts — 변경부
    findUser(where: FindOptionsWhere<UserEntity>): Promise<UserEntity | null>;
    // findUsers 삭제
    findLoginUser(user_id: string): Promise<LoginUserRow | null>;
    ...
    /** 확인 시도 1회 소비 — 한도 미만일 때만 +1, 확인과 같은 트랜잭션 */
    consumeSmsVerificationAttempt(sms_verification_id: string, max_attempts: number): Promise<boolean>;
```

### Business Logic — 확인 3개: 불일치는 return (#91)

형제는 같은 service 의 다른 실패 분기(throw)다. 그 분기는 그대로 둔다.
- 쓰기가 없는 실패: 회원 · 인증 기록 없음, 사용함 · 만료, 시도 한도 초과
- 롤백해야 하는 실패: SMS 503, `UK_User_Phone`

쓰기(시도 소비)를 커밋한 채 실패를 알려야 하는 **불일치만** return 한다(spec Decisions).

```typescript
// apps/user-service/src/user/user.service.ts — 변경부 (confirmPhoneVerification)
    /**
     * 휴대폰 인증번호 확인 — 발송 결과의 인증 ID + 인증번호. 확인되면 그 기록의 번호를 회원정보에 저장한다. (RabbitMQ: user.member.phone-verification-confirm)
     * 시도 횟수는 비교 전에 같은 트랜잭션에서 소비한다(최대 3회). 불일치는 예외를 throw 하지 않고 return 한다 —
     * 트랜잭션이 커밋돼 소비한 횟수가 남고, CommandDispatcher 가 반환된 예외를 failed(400)로 회신한다.
     *
     * @param user_id 로그인 회원 ID
     * @param dto 인증 ID · 인증번호
     * @returns 없음 — 불일치면 BadRequestException(반환, 커밋 뒤 실패)
     */
    @Transactional()
    async confirmPhoneVerification(user_id: string, dto: UserPhoneVerificationConfirmDto): Promise<void | BadRequestException> {
        // ... 1 · 2 그대로

        // 3. 시도 1회 소비 → 인증번호 비교 (불일치는 return — 소비한 횟수를 커밋한다)
        const consumed = await this.userRepository.consumeSmsVerificationAttempt(verification.sms_verification_id, SMS_MAX_ATTEMPTS);
        if (!consumed) {
            throw new BadRequestException({message: SMS_ATTEMPTS_EXCEEDED_MESSAGE});
        }
        if (sha256Hex(dto.code) !== verification.code_hash) {
            return new BadRequestException({message: SMS_CODE_MISMATCH_MESSAGE, validation_errors: createValidationError('code', SMS_CODE_MISMATCH_MESSAGE)});
        }

        // ... 4 그대로
    }
```

```typescript
// apps/user-service/src/user/user.service.ts — 변경부 (confirmFindLoginId)
    /**
     * 아이디 찾기 — 인증 ID + 인증번호 확인 → 일반 계정은 login_id, SNS 계정은 sns_id, 그리고 가입일시. (RabbitMQ: user.member.find-login-id-confirm)
     * 불일치는 예외를 return 한다 — 소비한 시도 횟수를 커밋하고 CommandDispatcher 가 failed(400)로 회신한다.
     *
     * @param dto 인증 ID · 인증번호
     * @returns 아이디 또는 가입한 SNS · 가입일시 — 불일치면 BadRequestException(반환, 커밋 뒤 실패)
     */
    @Transactional()
    async confirmFindLoginId(dto: UserFindLoginIdConfirmDto): Promise<UserFindLoginIdConfirmResultDto | BadRequestException> {
        // ... 1 · 2 그대로

        // 3. 시도 1회 소비 → 인증번호 비교 (불일치는 return — 소비한 횟수를 커밋한다)
        const consumed = await this.userRepository.consumeSmsVerificationAttempt(verification.sms_verification_id, SMS_MAX_ATTEMPTS);
        if (!consumed) {
            throw new BadRequestException({message: SMS_ATTEMPTS_EXCEEDED_MESSAGE});
        }
        if (sha256Hex(dto.code) !== verification.code_hash) {
            return new BadRequestException({message: SMS_CODE_MISMATCH_MESSAGE, validation_errors: createValidationError('code', SMS_CODE_MISMATCH_MESSAGE)});
        }

        // ... 4 그대로
    }
```

```typescript
// apps/user-service/src/user/user.service.ts — 변경부 (confirmPasswordReset)
    /**
     * 비밀번호 초기화 — 인증 ID + 인증번호 확인 → 임시 비밀번호(영문 + 숫자 10자리)로 바꾸고 그 기록의 번호로 SMS 를 보낸다. (RabbitMQ: user.member.password-reset-confirm)
     * 다음 로그인 때 비밀번호 변경이 필요하다는 표시(is_password_change_required = 1)를 남긴다. SMS 발송은 마지막 단계.
     * 불일치는 예외를 return 한다(소비한 시도 횟수 커밋). SMS 실패(503)는 throw — 비밀번호 변경과 시도 소비가 함께 롤백되고 재시도된다.
     *
     * @param dto 인증 ID · 인증번호
     * @returns 없음 — 불일치면 BadRequestException(반환, 커밋 뒤 실패)
     */
    @Transactional()
    async confirmPasswordReset(dto: UserPasswordResetConfirmDto): Promise<void | BadRequestException> {
        // ... 1 · 2 그대로

        // 3. 시도 1회 소비 → 인증번호 비교 (불일치는 return — 소비한 횟수를 커밋한다)
        const consumed = await this.userRepository.consumeSmsVerificationAttempt(verification.sms_verification_id, SMS_MAX_ATTEMPTS);
        if (!consumed) {
            throw new BadRequestException({message: SMS_ATTEMPTS_EXCEEDED_MESSAGE});
        }
        if (sha256Hex(dto.code) !== verification.code_hash) {
            return new BadRequestException({message: SMS_CODE_MISMATCH_MESSAGE, validation_errors: createValidationError('code', SMS_CODE_MISMATCH_MESSAGE)});
        }

        // ... 4 그대로
    }
```

### Entry Point — 큐 컨트롤러 반환 타입 (#91)

```typescript
// apps/user-service/src/user/controllers/user.controller.queue.ts — 변경부
import type {BadRequestException} from '@nestjs/common';

    /**
     * 휴대폰 인증번호 확인 — 로그인 회원. 불일치는 service 가 반환한 BadRequestException 을 그대로 돌려준다(CommandDispatcher 가 failed 로 회신).
     *
     * @param command 명령 봉투 (actor 필수)
     * @returns 없음 또는 반환된 실패
     */
    @OnCommand(USER_COMMAND.PHONE_VERIFICATION_CONFIRM)
    async confirmPhoneVerification(command: MessageEnvelope<UserPhoneVerificationConfirmDto>): Promise<void | BadRequestException> {
        return this.userService.confirmPhoneVerification(requireActor(command).user_id, command.payload);
    }

    /**
     * 아이디 찾기 — 인증번호 확인 (비로그인). 불일치는 반환된 BadRequestException.
     *
     * @param command 명령 봉투
     * @returns 아이디 또는 가입한 SNS — 또는 반환된 실패
     */
    @OnCommand(USER_COMMAND.FIND_LOGIN_ID_CONFIRM)
    async confirmFindLoginId(command: MessageEnvelope<UserFindLoginIdConfirmDto>): Promise<UserFindLoginIdConfirmResultDto | BadRequestException> {
        return this.userService.confirmFindLoginId(command.payload);
    }

    /**
     * 비밀번호 초기화 — 인증번호 확인 → 임시 비밀번호 SMS (비로그인). 불일치는 반환된 BadRequestException.
     *
     * @param command 명령 봉투
     * @returns 없음 또는 반환된 실패
     */
    @OnCommand(USER_COMMAND.PASSWORD_RESET_CONFIRM)
    async confirmPasswordReset(command: MessageEnvelope<UserPasswordResetConfirmDto>): Promise<void | BadRequestException> {
        return this.userService.confirmPasswordReset(command.payload);
    }
```

### Entry Point — 반환된 예외를 실패로 (큐 · 내부 HTTP) (#91)

형제
- 큐: `CommandDispatcher` 의 throw 분기(libs/messaging/src/command.dispatcher.ts — `toFailResult` → failed 결과)
- HTTP: `CustomErrorFilter`(libs/common/src/exception/custom-error.filter.ts — `toFailResult` → 상태 코드 + 본문)

같은 `toFailResult()` 를 거쳐 실패 본문은 하나로 유지한다. 반환된 실패는 이미 커밋됐으므로 큐에서는 상태 코드와 무관하게 재시도하지 않는다(ack).

```typescript
// libs/messaging/src/command.dispatcher.ts — 변경부
import {HttpException, Injectable, Logger} from '@nestjs/common';

/**
 * 명령 1건을 핸들러에 넘기고 결과를 판정한다. 브로커를 직접 만지지 않아 단위 테스트할 수 있다.
 *
 * - 형식 오류 · 핸들러 없음 → dead (회신 불가)
 * - 성공 → done 결과 + ack
 * - 핸들러가 HttpException 을 반환(service 가 쓰기를 커밋한 뒤 실패를 return) → failed 결과 + ack — 이미 커밋됐으므로 상태 코드와 무관하게 재시도하지 않는다
 * - 비즈니스 실패(4xx throw) → failed 결과 + ack — 재시도해도 결과가 같으므로
 * - 인프라 실패(5xx throw) → 재시도 여유가 있으면 requeue, 마지막 시도면 failed 결과 + dead
 *
 * 비즈니스 규칙 위반은 service 가 HttpException(4xx)으로 던지고, repository 의 DB 장애는 500 으로 던진다는 기존 규약을 그대로 쓴다.
 */

        try {
            const value = await handler(command);
            if (value instanceof HttpException) {
                // 커밋 뒤 실패 — 같은 실패 본문(toFailResult)으로 회신하고 재시도하지 않는다
                const fail = toFailResult(value);
                const failed = canReply ? buildResultEnvelope(command, RESULT_STATUS.FAILED, {result: null, error: {status_code: fail.status_code, body: fail.body}}, attempt) : null;
                return {action: 'ack', result: failed};
            }
            const result = canReply ? buildResultEnvelope(command, RESULT_STATUS.DONE, {result: value ?? null, error: null}, attempt) : null;
            return {action: 'ack', result};
        } catch (error) {
            // 그대로
        }
```

```typescript
// libs/common/src/exception/returned-exception.interceptor.ts — 새 파일
import {CallHandler, ExecutionContext, HttpException, Injectable, NestInterceptor} from '@nestjs/common';
import {map, type Observable} from 'rxjs';

/**
 * 내부 HTTP 컨트롤러가 반환한 HttpException 을 실패 응답으로 바꾼다.
 * service 가 쓰기를 커밋한 뒤 실패를 알릴 때 예외를 throw 하지 않고 return 한다. 반환값을 여기서 다시 throw 하면
 * CustomErrorFilter 가 상태 코드 + 실패 본문(toFailResult)으로 응답한다. 큐 경로는 CommandDispatcher 가 같은 일을 한다.
 * 서비스 루트 모듈에 `{provide: APP_INTERCEPTOR, useClass: ReturnedExceptionInterceptor}` 로 전역 등록한다.
 */
@Injectable()
export class ReturnedExceptionInterceptor implements NestInterceptor {
    /**
     * 반환값이 HttpException 이면 에러로 바꾸고, 아니면 그대로 흘려보낸다.
     *
     * @param _context 실행 컨텍스트
     * @param next 다음 핸들러
     * @returns 반환값 스트림
     */
    intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown> {
        return next.handle().pipe(
            map((value: unknown) => {
                if (value instanceof HttpException) {
                    throw value;
                }
                return value;
            }),
        );
    }
}
```

```typescript
// apps/user-service/src/user/test/user.test-helper.ts — 변경부
import {APP_GUARD, APP_INTERCEPTOR, DiscoveryModule} from '@nestjs/core';
import {ReturnedExceptionInterceptor} from '@app/common/exception/returned-exception.interceptor.js';

// createUserRepositoryMock() 에서 findUsers: vi.fn() 삭제

/**
 * 동기 경로 부팅 — 실제 내부 UserController · UserService · ValidationPipe · 필터 · 전역 InternalAuthGuard(APP_GUARD) · ReturnedExceptionInterceptor(APP_INTERCEPTOR)
 * (user-service.module 과 같다) 에 repository · JwtService · SMS 포트만 mock.
 */
        providers: [
            UserService,
            {provide: USER_REPOSITORY, useValue: repo},
            {provide: JwtService, useValue: jwt},
            {provide: SMS_SENDER, useValue: sms},
            {provide: APP_GUARD, useClass: InternalAuthGuard},
            {provide: APP_INTERCEPTOR, useClass: ReturnedExceptionInterceptor},
        ],
```

### 설정 — 연결 대기 제한 · env 파서 이동 (#91)

```typescript
// libs/common/src/utils/env.ts — 새 파일 (apps/gateway/src/modules/transport/transport.util.ts:31 에서 이동, 본문 그대로)
/**
 * 양의 정수 환경변수를 읽는다. 없거나 잘못된 값이면 기본값.
 *
 * @param value 환경변수 값
 * @param fallback 기본값
 * @returns 정수
 */
export function readPositiveInt(value: string | undefined, fallback: number): number {
    const parsed = Number.parseInt(value ?? '', 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
```

```typescript
// apps/gateway/src/modules/transport/transport.util.ts — readPositiveInt 삭제
// apps/gateway/src/modules/transport/command-stream.service.ts — 변경부
import {readPositiveInt} from '@app/common/utils/env.js';
import {COMMAND_PENDING_MESSAGE, DEFAULT_COMMAND_STREAM_TIMEOUT_MS, formatSseEvent} from './transport.util.js';
// apps/gateway/src/modules/transport/internal-http.client.ts — 변경부
import {readPositiveInt} from '@app/common/utils/env.js';
import {DEFAULT_INTERNAL_HTTP_TIMEOUT_MS, SERVICE_UNAVAILABLE_MESSAGE} from './transport.util.js';
```

```typescript
// libs/database/src/typeorm.config.ts — 변경부
import type {DataSourceOptions} from 'typeorm';
import {readPositiveInt} from '@app/common/utils/env.js';
import {ENTITIES} from './entities.js';
import {MIGRATIONS} from './migrations.js';

/** 풀에서 DB 연결을 기다리는 기본 시간(ms) — DATABASE_CONNECTION_TIMEOUT_MS 가 없거나 잘못됐을 때. 넘기면 그 요청은 500(큐 경로는 재시도) */
export const DEFAULT_DATABASE_CONNECTION_TIMEOUT_MS = 30_000;

/**
 * 비즈니스 DB(PostgreSQL) DataSource 설정 — 앱(TypeOrmModule)과 마이그레이션 실행기가 같은 설정을 쓴다.
 * 스키마는 마이그레이션으로만 바꾼다(synchronize 는 항상 끈다). 풀 연결 대기는 DATABASE_CONNECTION_TIMEOUT_MS 로 제한한다(영구 대기 방지).
 *
 * @returns DataSource 옵션
 */
export function buildDataSourceOptions(): DataSourceOptions {
    return {
        type: 'postgres',
        url: process.env.DATABASE_URL,
        entities: ENTITIES,
        migrations: MIGRATIONS,
        migrationsTableName: 't_migration',
        synchronize: false,
        logging: false,
        connectTimeoutMS: readPositiveInt(process.env.DATABASE_CONNECTION_TIMEOUT_MS, DEFAULT_DATABASE_CONNECTION_TIMEOUT_MS),
        extra: {max: parseInt(process.env.DATABASE_POOL_SIZE || '10')},
    };
}
```

### 설정 — Docker 묶음 · env (#90)

compose.user-service.yml 의 설정 원칙을 그대로 따른다. env 는 .env 그대로 쓰고, 서버 구성만 고정하고, 쓰지 않는 비밀값은 빈 값으로 덮는다. gateway 묶음은 쓰지 않는 비밀값 목록의 형제다(compose.gateway.yml:56-63). 포트 · 로드밸런서는 없다.

```yaml
# compose.scheduler.yml — 새 파일
# scheduler — crontab 만 도는 서버. 들어오는 연결이 없다(포트 · 로드밸런서 없음). 단독 실행
#   npm run docker:scheduler   (docker compose -f compose.scheduler.yml up -d --build)
#   인스턴스 수: .env 의 SCHEDULER_REPLICAS(기본 1) — 여러 대여도 JobLockService(DB 잠금)로 회차마다 1대만 실행한다
#   마이그레이션은 user-service 묶음의 migrate 가 적용한다 — user-service 묶음을 먼저 띄운다(docker:up 순서)
#
# 설정 원칙 — compose.user-service.yml 과 같다
#   - 환경 값(NODE_ENV · DATABASE_URL)은 .env 를 그대로 쓴다. compose 는 바꾸지 않고, 필수값이 비어 있으면 띄우지 않는다.
#   - 서버 구성(TZ)만 아래에 고정한다.
#   - 쓰지 않는 비밀값(브로커 · JWT · 토큰 암호화 · 내부 토큰 · 비밀번호 해시 · AWS · DB 관리자)은 빈 값으로 덮어 전달하지 않는다.
#
# 네트워크 — DB 로 나가는 roomless-data 하나뿐이다(서비스 · 브로커 · 외부 진입 네트워크에 붙지 않는다)
name: roomless-scheduler

x-logging: &logging
    driver: json-file
    options:
        max-size: '10m'
        max-file: '5'

services:
    scheduler:
        image: roomless/scheduler
        build:
            context: .
            args:
                APP: scheduler
        env_file:
            - path: .env
              required: true
        environment:
            # ── 환경 값: .env 그대로 (비어 있으면 띄우지 않는다) ──
            NODE_ENV: '${NODE_ENV:?.env 에 NODE_ENV 가 필요합니다}'
            DATABASE_URL: '${DATABASE_URL:?.env 에 DATABASE_URL 이 필요합니다}'
            # ── 서버 구성: 어느 환경이든 같다 ──
            TZ: Asia/Seoul
            # ── 쓰지 않는 비밀값은 전달하지 않는다 ──
            RABBITMQ_GATEWAY_PASSWORD: ''
            RABBITMQ_USER_SERVICE_PASSWORD: ''
            RABBITMQ_PASSWORD: ''
            POSTGRES_PASSWORD: ''
            JWT_SECRET: ''
            TOKEN_CIPHER_KEY: ''
            INTERNAL_API_TOKEN: ''
            BCRYPT_CODE: ''
            AWS_ACCESS_KEY_ID: ''
            AWS_SECRET_ACCESS_KEY: ''
        deploy:
            replicas: ${SCHEDULER_REPLICAS:-1}
        networks: [data]
        logging: *logging
        restart: unless-stopped

networks:
    data:
        name: roomless-data
        external: true
```

```dotenv
# .env.example — 변경부
# ── 인스턴스 수 (Docker) ────────────────────
GATEWAY_REPLICAS=2
USER_SERVICE_REPLICAS=2
# scheduler(crontab 전용 — 들어오는 연결 없음). 여러 대여도 DB 잠금으로 회차마다 1대만 실행한다
SCHEDULER_REPLICAS=1

# ── PostgreSQL ── (DATABASE_POOL_SIZE 다음)
# 풀에서 DB 연결을 기다리는 최대 시간(ms) — 넘기면 그 요청은 500(큐 경로는 재시도). 비우면 30000
DATABASE_CONNECTION_TIMEOUT_MS=30000
```

```dockerfile
# Dockerfile — 주석 변경부 (구조 그대로)
# 앱 하나를 이미지 하나로 — APP 인자로 고른다 (gateway | user-service | scheduler)
RUN test -n "$APP" || (echo "APP build-arg 가 필요합니다 (gateway | user-service | scheduler)" && exit 1)
```

### 설정 · 규약 문서

```markdown
 # README.md
 - **scheduler** — crontab 전용 서버(탈퇴 자동처리). 들어오는 연결이 없고(포트 없음) DB 에만 붙는다. 여러 대여도 DB 잠금으로 회차마다 1대만 실행한다.
 - 실행: docker:up 순서에 scheduler(user-service 뒤), 묶음 설명에 scheduler, 인스턴스 수 SCHEDULER_REPLICAS(기본 1)
 - 연결 대기: DATABASE_CONNECTION_TIMEOUT_MS(기본 30000)
 - 로컬: npm run start:scheduler
 - 명령 표: build(세 앱) · start:prod:scheduler · docker:scheduler · docker:logs:scheduler · docker:up/down "다섯 묶음"
 - 구조: apps/gateway  apps/user-service  apps/scheduler

 # AGENTS.md
 - 구조 트리: apps/scheduler/src/ — user/crontabs/(탈퇴 자동처리) · repositories/ — 들어오는 연결 없음
 - user-service 트리: "/ crontabs/ → repository 직접" 삭제
 - 헥사고날 · 레이어: crontab 은 scheduler 앱의 인바운드 어댑터(service 없이 repository 포트 직접)
 - 서비스 계층 규칙: "규칙 위반 시 HTTP 예외 throw" 에 — 쓰기를 커밋한 채 실패를 알릴 때(인증번호 불일치)만 예외를 return(큐 CommandDispatcher · 내부 HTTP ReturnedExceptionInterceptor 가 실패로 바꾼다, 재시도 없음)
 - Error & Response: service 항목에 같은 예외, "4xx 는 비즈니스 …" 에 반환된 실패는 상태 코드와 무관하게 재시도 없음
 - 스케줄러: crontab 은 scheduler 앱(apps/scheduler)의 도메인 crontabs/ 에만, 서비스 앱에는 ScheduleModule · crontab 을 두지 않는다, ScheduleModule.forRoot() 는 scheduler 루트 모듈에 1회, scheduler 도 여러 대일 수 있어 JobLockService
 - Transaction: RequiresNew 예외 문장 삭제 → "커밋해야 하는 실패는 return" 으로
 - 서비스는 게이트웨이를 거친 요청만: 서비스 루트 모듈의 APP_INTERCEPTOR(ReturnedExceptionInterceptor) 한 줄
 - Docker: 묶음 4개 → 5개(compose.scheduler.yml — scheduler × SCHEDULER_REPLICAS, roomless-data 만), 연결 대기 DATABASE_CONNECTION_TIMEOUT_MS
 - Data-Access Smoke 적용처에 scheduler user.repository.spec.ts buildUsersQuery
 - Checklist: crontab 은 scheduler 앱에만

 # docs/architecture.md — 앱 표(scheduler 행, user-service 의 "탈퇴 자동처리 crontab" 삭제) · 헥사고날 그림의 crontabs 화살표(scheduler) · user-service 모듈(ScheduleModule 삭제 · APP_INTERCEPTOR) · scheduler 모듈 · 스케줄러 절 · 실행(Docker) 묶음 5개 · crontab 행 · 인스턴스 수 · 새 앱 절차(crontab 은 scheduler)
 # docs/messaging.md — CommandDispatcher 판정에 "반환된 HttpException → failed + ack(재시도 없음)"
 # docs/error-handling.md — service · controller 표에 return 실패, 큐/HTTP 출구(ReturnedExceptionInterceptor)
 # docs/data-layer.md — 트랜잭션 절의 RequiresNew 예외 → 커밋해야 하는 실패는 return, crontab 은 scheduler 의 repository, 연결 대기 env
 # docs/testing.md — crontab spec 위치(apps/scheduler/src/<domain>/test/), bootHttpPath 의 APP_INTERCEPTOR, smoke 적용처, CommandDispatcher 반환 케이스
 # docs/conventions.md — crontab 파일 위치(apps/scheduler/src/<domain>/crontabs/)
```

---

## Test Cases

**케이스 상태 — 합의함(2026-10-21).** build 는 `[CASES]` 부터 쓴다.

**`libs/messaging/src/test/command.dispatcher.spec.ts`** — 형제 `[FAIL:business]` 와 같은 형태(makeDispatcher · command()).
```
[CASES:returned-exception]
 ① 핸들러가 BadRequestException({message, validation_errors:[{property:'code', message}]}) 반환
     → action 'ack', result.type 'test.cmd.failed', payload {result: null, error: {status_code: 400, body: {message, validation_errors}}}, meta.attempt 1
 ② 핸들러가 InternalServerErrorException({message:'서버 오류'}) 반환(이전 전달 0회)
     → action 'ack'(requeue 아님 — 이미 커밋), payload.error {status_code: 500, body: {message:'서버 오류', validation_errors: null}}
 ③ reply_to 없음 + 예외 반환 → {action: 'ack', result: null}
 ④ 일반 값 반환 → done (기존 [SUCCESS] 케이스가 그대로 덮는다 — 새로 쓰지 않음)
```

**`libs/common/src/exception/test/returned-exception.interceptor.spec.ts`** — 형제 custom-error.filter.spec.ts 처럼 spec 안 테스트 컨트롤러 + `CustomErrorFilter` + `APP_INTERCEPTOR`, supertest.
```
[CASES:returned-exception]
 ⑤ GET /test/fail — 컨트롤러가 BadRequestException 반환 → 400, body {message:'인증번호가 일치하지 않습니다.', validation_errors:[{property:'code', message:'인증번호가 일치하지 않습니다.'}]}
 ⑥ GET /test/ok — 컨트롤러가 {id: 7} 반환 → 200, body {id: 7}
```

**`libs/common/src/utils/test/env.spec.ts`** — 기존 케이스를 옮긴다(internal-http.client.spec.ts:89-96).
```
[CASES:readPositiveInt]
 '5000' → 5000 / undefined → 30000 / 'abc' → 30000 / '-1' → 30000 / '0' → 30000   (fallback 30000)
```

**`apps/scheduler/src/user/test/user.repository.spec.ts`**
```
[SMOKE:data-access] buildUsersQuery({state_id: 'LEAVE_WAIT', leave_reserved_at: LessThanOrEqual('2026-01-15 09:30:00')})
     → parameters ['LEAVE_WAIT', '2026-01-15 09:30:00'],
       SQL 에 'FROM "t_user" "u" WHERE (("u"."state_id" = $1) AND ("u"."leave_reserved_at" <= $2))' 포함, JOIN 없음
```

**`apps/scheduler/src/user/test/user-leave-cleanup.crontab.spec.ts`** — git mv. 케이스(운영 가드 · 잠금 건너뜀 · 백업 + 익명화 · 건별 실패)는 그대로다. `createUserRepositoryMock` 은 scheduler test-helper 에서 가져오고, 제목의 "다른 user-service 인스턴스" 를 "다른 scheduler 인스턴스" 로 바꾼다.

**기존 spec 그대로 통과해야 하는 것** — `user-phone-verification` · `user-find-login-id` · `user-password-reset` 의 불일치 케이스(failed 400 · `validation_errors` code · ack · `updateSmsVerification`/`updateUser` 미호출)는 throw → return 후에도 디스패처 결과가 같다.

```
테스트 생략(위임형):
- SchedulerModule · scheduler UserModule · main.ts — 배선 글루. typecheck · build(nest build scheduler)로 확인.
- scheduler UserRepository.findUsers · updateUser 의 try/catch 500 — user-service repository 와 같은 통일 패턴(그쪽 spec 이 표로 고정).
- typeorm.config 의 connectTimeoutMS — readPositiveInt 위임. 파서는 env.spec 이 덮는다.
- user-service.module 의 APP_INTERCEPTOR 등록 — 배선. bootHttpPath 가 같은 등록으로 동기 경로 spec 을 돈다.
- compose.scheduler.yml · package.json · nest-cli.json — 설정. `docker compose -f compose.scheduler.yml config --quiet`(값 출력 없이 검증) · build 로 확인.
```

검증(build 후 `/beaver:test`): `npm test` · `npm run typecheck` · `npm run lint` · `npm run build`(세 앱) · `docker compose -f compose.scheduler.yml config --quiet`.

---

## Response Codes

| Code | Cause |
|------|------|
| done | 인증번호 확인 성공 (변경 없음) |
| failed 400 `{message: '인증번호가 일치하지 않습니다.', validation_errors: [code]}` | 불일치 — 반환된 예외, 시도 횟수 커밋, ack(재시도 없음) |
| failed 400 | 시도 한도 초과 · 사용함 · 만료 (throw, 변경 없음) |
| failed 404 | 인증 기록 · 회원 없음 (throw, 변경 없음) |
| failed 503 → 재시도 | 비밀번호 초기화 SMS 실패 — 비밀번호 변경 · 시도 소비 함께 롤백 |
| 500(요청) | 풀에서 연결을 `DATABASE_CONNECTION_TIMEOUT_MS`(기본 30초) 넘게 기다림 — 큐 경로는 재시도 |
| (crontab) | 결과 없음 — 운영 가드 · 잠금 건너뜀 · 건별 실패 건너뜀 (변경 없음) |
