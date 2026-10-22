# Data Layer

TypeORM 1.x · PostgreSQL 17 · `pg` 드라이버. 접속은 `DATABASE_URL` 하나 — 앱([DatabaseModule](../libs/database/src/database.module.ts))과 마이그레이션 실행기([data-source.ts](../libs/database/src/data-source.ts))가 같은 설정([typeorm.config.ts](../libs/database/src/typeorm.config.ts))을 쓴다. `synchronize` 는 항상 끄고 스키마는 마이그레이션으로만 바꾼다.

## 위치

```
libs/database/src/
├── entities/
│   ├── user/        auth · state · sns(룩업) · user · user-setting · session · session-refresh
│   ├── store/       store
│   └── api-log/     api-log
├── entities.ts      # ENTITIES — DataSource 에 등록할 엔티티 목록 (ESM 이라 glob 대신 명시)
├── migrations/      # <timestamp>-<Name>.ts
├── migrations.ts    # MIGRATIONS — 실행할 마이그레이션 목록
├── typeorm.config.ts · data-source.ts · database.module.ts
├── typeorm-error.ts # isUniqueViolation · isForeignKeyViolation
├── job-lock/        # JobLockService — 인스턴스 여러 대 중 1대만 실행하는 잠금(scheduler 의 crontab 용)
└── seeder/          # 룩업 기본 데이터
scripts/db-schema.mjs   # 오프라인 마이그레이션 생성 · 검사
apps/user-service/src/migrate.ts   # 마이그레이션 실행기 (db:migrate · Docker migrate)
```

### 왜 엔티티가 앱이 아니라 libs 에 있나

지금은 **공유 DB 단계**다. 한 테이블 = 엔티티 한 벌을 여러 앱이 같이 쓰고(예: user-service 의 회원이 admin-service 소유가 될 가맹점을 FK 로 참조), 앱끼리는 서로의 코드를 import 하지 않는다. 그래서 엔티티는 공용 라이브러리에 두되 **소유 도메인 폴더**로 나눈다.

MSA 정석은 서비스별 DB(database per service)와 앱 안의 엔티티다. 이 구조는 그 전 단계이며, DB 를 나눌 때 `entities/<domain>/` 폴더를 담당 앱으로 옮기면 되도록 경계를 미리 그어 둔 것이다. 그때까지 지킬 규칙:

- 한 서비스의 repository 는 **자기 소유 도메인의 엔티티만** 다룬다(같은 서비스 안의 도메인 간 접근은 [architecture.md](architecture.md) 규칙대로).
- **다른 서비스 소유 테이블로 가는 FK 를 새로 만들지 않는다.** 필요하면 ID 컬럼만 두고 정합성은 내부 HTTP · 이벤트로 맞춘다. (기존 `t_user.store_id` FK 는 서비스 분리 때 끊을 대상이다)

## 엔티티

```ts
@Entity({name: 't_user_setting', comment: '회원 설정'})
@Unique('UK_UserSetting_UserId', ['user_id'])
export class UserSettingEntity {
    @PrimaryColumn({name: 'user_setting_id', length: 32, comment: '회원 설정 ID', primaryKeyConstraintName: 'PK_UserSetting'})
    user_setting_id: string;

    @ManyToOne(() => UserEntity, {nullable: false, onUpdate: 'CASCADE', onDelete: 'CASCADE'})
    @JoinColumn({name: 'user_id', referencedColumnName: 'user_id', foreignKeyConstraintName: 'FK_UserSetting_User'})
    user_id: string;

    @Column({name: 'bio', type: 'text', nullable: true, comment: '자기소개'})
    bio: string | null;

    @Column({name: 'created_at', type: 'timestamptz', nullable: false, comment: '등록일'})
    created_at: Date;

    @Column({name: 'updated_at', type: 'timestamptz', nullable: false, comment: '수정일'})
    updated_at: Date;

    /** insert 직전 등록일 · 수정일을 채운다. */
    @BeforeInsert()
    insertTimestamp(): void { const now = new Date(); this.created_at = now; this.updated_at = now; }

    /** update 직전 수정일을 갱신한다. */
    @BeforeUpdate()
    updateTimestamp(): void { this.updated_at = new Date(); }
}
```

규칙:
- **파일** `entities/<domain>/<feature>.entity.ts`, 클래스 `<Feature>Entity`, 새 엔티티는 [entities.ts](../libs/database/src/entities.ts) `ENTITIES` 에 한 줄 추가.
- **테이블** `t_<feature snake>` — 엔티티 파일명과 같은 이름이다(`t_user` · `t_user_setting` · `t_session_refresh` 모두 user 도메인). `@Entity({name, comment})` — 테이블 주석도 DB COMMENT 로 들어간다.
- **제약명 PascalCase**: `PK_<Model>`(`primaryKeyConstraintName`) · `UK_<Model>_<Cols>`(`@Unique('UK_…', [...])`, ❌ `@Column({unique})` — 여러 컬럼은 이어 붙인다: 로그인 그룹 단위 `UK_User_LoginIdLoginScope(login_id, login_scope)` · `UK_User_PhoneLoginScope(phone, login_scope)`) · `FK_<Model>_<Target>`(`@JoinColumn({foreignKeyConstraintName})`) · `IDX_<Model>_<Cols>`(`@Index('IDX_…', [...])`). PostgreSQL 은 인덱스 · 제약 이름이 스키마 전역에서 유일해야 하므로 모델명을 반드시 접두로 둔다.
- **모든 컬럼에 `comment`** — 마이그레이션 생성 시 `COMMENT ON` 으로 들어간다. FK 컬럼은 참조 대상 PK 의 주석을 따른다(TypeORM 동작).
- **FK 는 문자열 속성 + `@ManyToOne(() => X, {nullable, onUpdate: 'CASCADE', onDelete})` + `@JoinColumn({name, referencedColumnName, foreignKeyConstraintName})`** — `nullable: false` 면 `onDelete: 'CASCADE'`, `nullable: true` 면 `onDelete: 'RESTRICT'`(user.entity.ts:23-39, 6건 모두). 조회 시 `loadRelationIds: true` 로 ID 를 채운다. 관계 속성을 엔티티 타입(`auth: AuthEntity`)으로 두지 않는다: ESM 에서 데코레이터 메타데이터가 클래스를 즉시 참조해 순환 import 가 깨진다. 역방향(`@OneToMany`)도 두지 않는다.
- **컬럼 이름은 항상 명시** — `@Column({name: 'bio', ...})`.
- **타입** — 문자열 `length: n`(nullable 이면 `type: 'varchar'` 명시), 긴 문자열 `text`, 시각 `timestamptz`, 플래그 `smallint`(0/1), 자동 증가 `bigint` + `@PrimaryGeneratedColumn`(값은 문자열로 온다), JSON `jsonb`.
  - **jsonb** 는 항목이 자주 바뀌는 상세정보에 쓴다 — 컬럼 하나 + 같은 엔티티 파일의 TS 인터페이스(항목은 모두 선택), `nullable: false` + `default: () => "'{}'"`. 예: `t_store.store_detail: StoreDetail`(`room_count` · `has_shower` · `has_tv` · `has_pc`, 플래그는 0/1 — store.entity.ts). 항목을 바꿀 때는 인터페이스만 고치고 마이그레이션이 없다.
  - 예외(기존 컬럼): `t_user.leave_reserved_at` 은 `varchar(40)` 에 dayjs `'YYYY-MM-DD HH:mm:ss'` 문자열을 넣고 문자열 비교로 경과를 판단한다(user.entity.ts:78, user-leave-cleanup.crontab.ts:43-44). 새 시각 컬럼은 `timestamptz`.
- **타임스탬프는 `@BeforeInsert`/`@BeforeUpdate` 훅**(❌ `@CreateDateColumn`/`@UpdateDateColumn`). 훅 메서드 이름은 `insertTimestamp()` · `updateTimestamp()`. 훅은 `insert`/`update` 에 **엔티티 인스턴스**를 넘길 때만 돈다 — 그래서 service 는 `new XEntity()` + 할당으로 만든다.
- **룩업 엔티티**(auth/state/sns)는 구조 컬럼만. 기본 데이터는 seeder.

## 마이그레이션

적용은 **사용자 몫**이다. Claude 는 DB 없이 파일까지 만든다.

1. 엔티티를 고친다(새 엔티티면 `ENTITIES` 등록).
2. `npm run db:generate -- <PascalCase 이름>` — user-service 를 빌드한 뒤 [db-schema.mjs](../scripts/db-schema.mjs) 가 PGlite(WASM PostgreSQL)를 프로세스 안에 띄워 기존 마이그레이션을 적용하고, 엔티티 기준으로 남은 DDL(컬럼 · 제약 · 인덱스 · COMMENT 포함)을 `libs/database/src/migrations/<ts>-<Name>.ts` 로 쓴 뒤 `MIGRATIONS` 에 등록한다. `typeorm migration:generate` 와 같은 계산이다.
3. 생성 파일 상단 JSDoc 의 TODO 를 바꾼 내용 설명으로 고친다.
4. `npm run db:check` — 엔티티와 마이그레이션이 일치하면 통과, 남은 차이가 있으면 DDL 을 출력하고 실패한다.
5. 적용(사용자): Docker 로 띄우면 `migrate` 컨테이너가 자동 적용, 로컬은 `npm run db:migrate`, 되돌리기 `npm run db:revert`. 운영은 배포 절차에서 같은 실행기(`migrate.js`)를 돌린다.

- 데이터 이전 · 파티셔닝처럼 엔티티로 표현할 수 없는 작업은 생성된 파일에 `queryRunner.query(...)` 를 직접 추가한다.
- **기존 행이 있는 테이블에 NOT NULL 컬럼을 더할 때**: 생성된 `ADD ... NOT NULL` 을 `DEFAULT <임시값>` 으로 추가 → `UPDATE` 로 실제 값 채우기 → `ALTER COLUMN ... DROP DEFAULT` 로 고친다(엔티티에 기본값이 없으면 `db:check` 가 일치로 본다). 예: `t_user.login_scope` 를 권한으로 채움(`1792682222497-LoginScopeStoreDetail.ts`).
- 마이그레이션 목록 테이블은 `t_migration`.

## Repository

```ts
@Injectable()
export class UserRepository implements UserRepositoryInterface {
    constructor(private readonly txHost: TransactionHost<TransactionalAdapterTypeOrm>) {}

    /** t_user repository (현재 트랜잭션 기준) */
    private get users(): Repository<UserEntity> {
        return this.txHost.tx.getRepository(UserEntity);
    }

    /** 회원 등록 — UK/FK 위반을 제약명별 400 으로 바꾼다. */
    async insertUser(entity: UserEntity): Promise<void> {
        try {
            await this.users.insert(entity);
        } catch (error) {
            if (isUniqueViolation(error, 'UK_User_LoginIdLoginScope')) {
                throw new BadRequestException({message: '이미 존재하는 로그인 ID입니다.'});
            } else if (isForeignKeyViolation(error, 'FK_User_Auth')) {
                throw new BadRequestException({message: '존재하지 않는 권한입니다.'});
            } else {
                throw new InternalServerErrorException({message: '서버에서 오류가 발생했습니다. 관리자에게 문의해주세요.'});
            }
        }
    }

    /** 회원 단건 조회 */
    async findUser(where: FindOptionsWhere<UserEntity>): Promise<UserEntity | null> {
        try {
            return await this.users.findOne({where, loadRelationIds: true});
        } catch {
            throw new InternalServerErrorException({message: '서버에서 오류가 발생했습니다. 관리자에게 문의해주세요.'});
        }
    }
}
```

규칙:
- **`txHost.tx.getRepository(XEntity)` 로만 접근** — `@Transactional()` 범위면 트랜잭션 EntityManager, 밖이면 기본 EntityManager. `@InjectRepository` 는 쓰지 않는다(트랜잭션 전파가 안 된다). 엔티티별 private getter 로 묶는다.
- **DB 를 실행하는 메서드는 모두 try/catch**, 최종 실패는 통일 500 — 문구는 파일 상수 `SERVER_ERROR_MESSAGE`(user.repository.ts:14). 조회 · update 는 `catch {` + 500.
- **제약 위반은 그 제약이 걸릴 수 있는 쓰기에서 제약명별 `if … else if … else` 분기** — `isUniqueViolation(error, 'UK_…')`(23505) · `isForeignKeyViolation(error, 'FK_…')`(23503), 마지막 else 는 500. 지금은 insert 만 분기하고 update 2개는 500 만 던진다(user.repository.ts:230-250). 멱등 insert 는 UK 중복을 `return` 으로 무시(`insertUserSetting`).
- **QueryBuilder 빌더 메서드는 예외** — 쿼리만 만들고 실행하지 않으므로 try/catch 없이 public 으로 두고 포트 인터페이스에 넣지 않는다(`buildLoginUserQuery` — user.repository.ts:177). 실행하는 메서드(`findLoginUser`)가 try/catch 를 가진다. 빌더를 public 으로 두는 이유는 Data-Access Smoke spec 이 SQL 을 고정하기 위해서다.
- **범용 메서드 우선**(`insertX`/`findX`/`findXs`/`updateX`). WHERE 는 service 가 `FindOptionsWhere<XEntity>`(❌ `Partial`)로 만들고 repository 는 실행만.
- 조회 시 `loadRelationIds: true`.
- `update(where, entity)` 의 `entity` 는 호출자가 `new XEntity()` + 바꿀 필드만 할당해 넘긴다(`@BeforeUpdate` 트리거). `undefined` 필드는 건드리지 않고 `null` 은 NULL 로 비운다 — 수정 API 의 선택 필드는 `?? null`.
- **조인 · raw select · 동적 조립은 QueryBuilder 빌더 메서드로 분리**(`buildLoginUserQuery`)하고 Data-Access Smoke spec 으로 SQL 을 고정한다([testing.md](testing.md)).
- 메서드명은 소유 도메인 어휘.

- **로그인 그룹 조건** — 회원 조회는 자기 도메인의 로그인 그룹(`login_scope`)을 WHERE 에 넣어 다른 그룹 계정을 없는 계정처럼 다룬다(`findManager({login_id, login_scope: LOGIN_SCOPE.MANAGER, state_id: In([...])})`). 휴대폰 번호 중복 확인도 같은 그룹 안에서 한다.
- **다른 앱의 데이터(공유 DB)** — admin-service 의 manager · admin repository 는 t_user · t_session · t_session_refresh · t_sms_verification 을 같은 엔티티로 직접 다룬다(소유 도메인 어휘: `findManager` · `updateAdmin`). 오류 변환은 user.repository.ts 와 같다. 스키마 변경(마이그레이션)은 user-service 묶음 한 곳이다.

### 컬럼 이름 규칙

- 시각은 `<과거분사>_at` 이다 — `created_at` · `updated_at` · `verified_at` · `phone_verified_at` · `leave_reserved_at`. 만료는 `expires_at` 이다.
- 여부 플래그는 `is_<형용사 · 과거분사>` 이다 — `is_deleted` · `is_login_allowed` · `is_password_change_required`.
- 직전 값을 가리키는 컬럼은 `previous_<이름>` 이다 — `previous_refresh_hash` · `leave_previous_state_id`.
- PK 는 `<t_ 를 뗀 테이블 이름>_id`, FK 는 가리키는 PK 와 같은 이름이다 — `api_log_id` · `user_id` · `sms_purpose_id`.
- **이름을 바꿀 때는 마이그레이션을 손으로 쓴다.** `db:generate` 는 이름 변경을 DROP + ADD 로 계산해 데이터가 사라진다. `ALTER TABLE ... RENAME COLUMN` · `ALTER INDEX ... RENAME` · `ALTER SEQUENCE ... RENAME` 만 쓰고(데이터 · 제약 · 주석 유지), `RenameColumns` 처럼 먼저 등록한 뒤 남은 차이만 생성한다(`1792477492198-RenameColumns.ts`).
- 단일 컬럼 `@Unique` 는 생성기가 `UQ_<해시>` 제약명을 만들 수 있다. `db:check` 는 이 이름 차이를 잡지 못하므로, 생성된 마이그레이션의 제약명을 `UK_<Model>_<Cols>` 로 맞춘다(repository 의 `isUniqueViolation(error, 'UK_…')` 분기가 제약명에 기댄다).

## 트랜잭션

- service 의 쓰기가 있는 메서드에 `@Transactional()`(`@nestjs-cls/transactional`) — 세션을 insert 하는 로그인 · 토큰 재발급도 포함(8개), 읽기만 하는 `getLoginUser` 는 없음. 그 안에서 호출된 repository 의 `txHost.tx` 가 같은 트랜잭션을 쓴다.
- 실패해도 남겨야 하는 쓰기(SMS 인증 시도 횟수)는 별도 트랜잭션으로 빼지 않는다. 확인과 같은 트랜잭션에서 소비하고, 불일치는 service 가 예외를 **return** 해 트랜잭션을 커밋한다([error-handling.md](error-handling.md)). 그래서 요청 1건이 DB 연결 1개만 쓴다 — 연결을 잡은 채 하나를 더 기다리는 구조(RequiresNew)는 동시 요청이 풀만큼 몰리면 교착된다.
- 풀에서 연결을 기다리는 시간은 `DATABASE_CONNECTION_TIMEOUT_MS`(기본 30000, typeorm.config.ts `connectTimeoutMS`)로 제한한다 — 막혀도 영구 대기 대신 500(큐 경로는 재시도).
- crontab(scheduler)은 트랜잭션 없이 건별로 처리한다(한 건 실패가 나머지를 막지 않도록). 데이터 접근은 scheduler 안의 도메인 repository(apps/scheduler/src/user/repositories/user.repository.ts)다.
- DB 를 쓰는 앱 루트 모듈은 `DatabaseModule` 을 import 한다 — `TypeOrmModule.forRootAsync(buildDataSourceOptions)` + `ClsModule.forRoot({plugins: [new ClsPluginTransactional({adapter: new TransactionalAdapterTypeOrm({dataSourceToken: getDataSourceToken()})})]})`.
- 큐 경로에서 5xx 로 재시도해도 롤백 덕분에 안전하다.

## 기본 데이터 시드

[SeederService](../libs/database/src/seeder/seeder.service.ts)(`OnApplicationBootstrap`)가 [seeder.targets.ts](../libs/database/src/seeder/seeder.targets.ts) `SEED_TARGETS` 의 엔티티별 기본 데이터 중 **PK 기준으로 없는 행만** insert 한다(`pickMissingRows`). 대상별 실패는 경고 로그만 남기고 부팅을 막지 않는다. DB 를 소유한 서비스 한 곳(user-service)에서만 등록한다.

- 새 기본 데이터: 엔티티는 그대로 두고 `<X>_SEED_DATA` 배열 + `SEED_TARGETS` 에 `{entity, data}` 한 줄. FK 부모를 먼저.
- 시드 행은 엔티티 타입의 객체 리터럴로 쓴다(정적 정의 데이터 — `new XEntity()` 규칙의 유일한 예외).

## Pagination / 목록 조회 (미적용 규약)

> 현재 목록 API · `@Query()` 0건. 공통 `PaginationDto`(`libs/common/src/dto/pagination.dto.ts`) · `Pagination`(`libs/common/src/utils/pagination.ts`)은 있다 — 첫 목록 API 에서 이 형태를 따른다. Query DTO 생성자 규칙은 [conventions.md](conventions.md).

- 응답 `{list, pagination}`.
- 순서 **count → `Pagination` → 목록** — `Pagination` 이 `total_count` 로 `limit`/`offset` 을 산출한다. repository 는 `countX(where)` 와 `findXList(where, limit, offset)` 두 메서드로 둔다(`findAndCount` ❌).
- 쓰는 모양: `const pagination = new Pagination({...dto, total_count});` → `findXList(where, pagination.limit, pagination.offset)` → `{list, pagination: pagination.getPagination()}`.
- Query DTO 는 `extends PaginationDto`(기본값은 부모 생성자).
- 검색 WHERE 는 도메인 util 이 `FindOptionsWhere<X>` 로 조립(통합검색은 배열 = OR), repository 는 실행만. `Like()` · 관계 필드 where 를 쓰면 Data-Access Smoke 대상이다.
- 기본 필터 `is_deleted = 0`, 정렬 `created_at DESC`.
