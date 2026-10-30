# Data Layer

TypeORM 1.x · PostgreSQL 17 · `pg` 드라이버. 접속은 `DATABASE_URL` 하나 — 앱([DatabaseModule](../libs/database/src/database.module.ts))과 마이그레이션 실행기([data-source.ts](../libs/database/src/data-source.ts))가 같은 설정([typeorm.config.ts](../libs/database/src/typeorm.config.ts))을 쓴다. `synchronize` 는 항상 끄고 스키마는 마이그레이션으로만 바꾼다.

## 위치

```
libs/database/src/
├── entities/
│   ├── user/        auth · state · sns · sms-purpose(룩업) · user · user-setting · session · session-refresh · sms-verification
│   ├── store/       store-state · store-application-state · store-file-purpose(룩업) · store · store-application · store-file · store-hour · store-break · store-unavailable-period
│   ├── room/        room-state · room-plan-type(룩업) · room-plan · room-group · room-group-image · room · room-group-plan · room-group-plan-price
│   └── api-log/     api-log
├── entities.ts      # ENTITIES — DataSource 에 등록할 엔티티 목록 (ESM 이라 glob 대신 명시)
├── migrations/      # <timestamp>-<Name>.ts
├── migrations.ts    # MIGRATIONS — 실행할 마이그레이션 목록
├── typeorm.config.ts · data-source.ts · database.module.ts
├── typeorm-error.ts # isUniqueViolation · isForeignKeyViolation · isExclusionViolation
├── soft-delete.ts   # notDeleted — 조회 · 개수 · 수정 조건에 is_deleted = 0(repository 가 감싼다)
├── job-lock/        # JobLockService — 인스턴스 여러 대 중 1대만 실행하는 잠금(scheduler 의 crontab 용)
└── seeder/          # 룩업 기본 데이터
scripts/db-schema.mjs   # 오프라인 마이그레이션 생성 · 검사
apps/user-service/src/migrate.ts   # 마이그레이션 실행기 (db:migrate · Docker migrate)
```

### 왜 엔티티가 앱이 아니라 libs 에 있나

지금은 **공유 DB 단계**다. 한 테이블 = 엔티티 한 벌을 여러 앱이 같이 쓰고(예: user-service 의 회원이 admin-service 소유가 될 가맹점을 FK 로 참조), 앱끼리는 서로의 코드를 import 하지 않는다. 그래서 엔티티는 공용 라이브러리에 두되 **소유 도메인 폴더**로 나눈다.

MSA 정석은 서비스별 DB(database per service)와 앱 안의 엔티티다. 이 구조는 그 전 단계이며, DB 를 나눌 때 `entities/<domain>/` 폴더를 담당 앱으로 옮기면 되도록 경계를 미리 그어 둔 것이다. 그때까지 지킬 규칙:

- 한 서비스의 repository 는 **자기 소유 도메인의 엔티티만** 다룬다(같은 서비스 안의 도메인 간 접근은 [architecture.md](architecture.md) 규칙대로).
- **다른 서비스 소유 테이블로 가는 FK 를 새로 만들지 않는다.** 필요하면 ID 컬럼만 두고 정합성은 내부 HTTP · 이벤트로 맞춘다. 예: `t_store_application.user_id`(신청한 이용자 — ID + 인덱스만, store-application.entity.ts). (기존 `t_user.store_id` FK 는 서비스 분리 때 끊을 대상이다)

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
- **제약명 PascalCase**: `PK_<Model>`(`primaryKeyConstraintName`) · `UK_<Model>_<Cols>`(`@Unique('UK_…', [...])`, ❌ `@Column({unique})` — 여러 컬럼은 이어 붙인다: `UK_User_SnsSnsUserId(sns_id, sns_user_id)`) · `FK_<Model>_<Target>`(`@JoinColumn({foreignKeyConstraintName})`) · `IDX_<Model>_<Cols>`(`@Index('IDX_…', [...])`) · `CHK_<Model>_<내용>`(`@Check('CHK_…', '<SQL 식>')` — 컬럼 조합 규칙을 DB 가 막을 때. 예: `CHK_StoreHour_OpenCloseTime` 휴무가 아니면 open_time · close_time 둘 다, 휴무면 둘 다 NULL — store-hour.entity.ts. 스키마 비교(`db:check`)는 CHECK 를 이름으로 맞추므로 식을 바꾸면 이름도 바꾼다) · `EXC_<Model>_<내용>`(`@Exclusion('EXC_…', 'USING gist (…)')` — 범위 겹침을 DB 가 막을 때. 예: `EXC_RoomGroupPlanPrice_RoomGroupPlanIdDateRange` 같은 상품의 지워지지 않은 기간끼리 겹침 — room-group-plan-price.entity.ts. PostgreSQL 확장 `btree_gist` 가 필요하고(마이그레이션이 `CREATE EXTENSION IF NOT EXISTS "btree_gist"` — 적용 계정 권한), 위반은 오류 코드 23P01 · 제약명. 이름으로 비교하므로 식을 바꾸면 이름도 바꾼다). PostgreSQL 은 인덱스 · 제약 이름이 스키마 전역에서 유일해야 하므로 모델명을 반드시 접두로 둔다.
- **모든 컬럼에 `comment`** — 마이그레이션 생성 시 `COMMENT ON` 으로 들어간다. FK 컬럼은 참조 대상 PK 의 주석을 따른다(TypeORM 동작).
- **FK 는 문자열 속성 + `@ManyToOne(() => X, {nullable, onUpdate: 'CASCADE', onDelete})` + `@JoinColumn({name, referencedColumnName, foreignKeyConstraintName})`** — `nullable: false` 면 `onDelete: 'CASCADE'`, `nullable: true` 면 `onDelete: 'RESTRICT'`(user.entity.ts:23-39, 6건 모두). 조회 시 `loadRelationIds: true` 로 ID 를 채운다. 관계 속성을 엔티티 타입(`auth: AuthEntity`)으로 두지 않는다: ESM 에서 데코레이터 메타데이터가 클래스를 즉시 참조해 순환 import 가 깨진다. 역방향(`@OneToMany`)도 두지 않는다.
- **컬럼 이름은 항상 명시** — `@Column({name: 'bio', ...})`.
- **타입** — 문자열 `length: n`(nullable 이면 `type: 'varchar'` 명시), 긴 문자열 `text`, 시각 `timestamptz`, 하루 안 시각 `time`, 날짜 `date`, 좌표 `double precision`, 금액 `integer`(원), 플래그 `smallint`(0/1), 자동 증가 `bigint` + `@PrimaryGeneratedColumn`(값은 문자열로 온다), JSON `jsonb`.
  - **하루 안 시각 `time`** 은 영업시간 · 브레이크타임처럼 날짜 없이 반복되는 시각이다. 한국 시각, 분 단위(`HH:mm`, 초는 0)이고 값은 문자열(`'18:00:00'`)로 온다. **마감이 시작보다 이르면 다음 날**이다(18:00 ~ 06:00 · 23:00 ~ 02:00). 24시간 · 휴무는 시각이 아니라 플래그로 둔다(`t_store.is_always_open` · `t_store_hour.is_closed`) — store-hour.entity.ts · store-break.entity.ts.
  - **영업시간은 휴무가 아니면 `open_time` · `close_time` 둘 다(세트)** — `t_store_hour` 에서 휴무가 아닌 요일(`is_closed = 0`)은 둘 다 채우고, 하나만 있는 행을 만들지 않는다. 휴무(`is_closed = 1`)면 둘 다 NULL. DB 는 CHECK `CHK_StoreHour_OpenCloseTime`, 입력 DTO 는 짝 필드(`@ValidateIf(휴무 아님)` → 제약 → `@IsNotEmpty` — store-mine-hours.dto.ts), service 는 휴무면 보낸 시각을 버리고 NULL 로 저장한다. 시드 · 테스트 데이터도 이 조합만 쓴다(사용자 결정 2026-10-24). 시작 = 마감은 두지 않는다 — 24시간은 `t_store.is_always_open`(사용자 결정 2026-10-27).
  - **브레이크타임은 매일** — `t_store_break` 에 요일이 없다. 한 업체의 브레이크타임끼리 겹치지 않는다(반열린 구간 — 끝점 맞닿음은 허용. 기준일 위 dayjs 시각으로 놓고 자정을 넘는 범위는 다음 날 마감, 한쪽을 하루 앞 · 뒤로도 옮겨 비교 — store.util.ts `hasOverlappingBreaks`).
  - **일시 범위는 `timestamptz` 두 개** — 일시 예약불가 `t_store_unavailable_period.starts_at` · `ends_at`(반열린 구간, CHECK `CHK_StoreUnavailablePeriod_StartsAtEndsAt`). 입력은 한국 시각 `YYYY-MM-DD HH:mm`(분 단위)을 dayjs 로 읽고(`dayjs(값, 형식, true).isValid()` 로 없는 날짜를 거른 뒤 `dayjs.tz(값, 형식, KST_TIMEZONE)` — store.service.ts), 겹침은 `starts_at < 새 종료 AND ends_at > 새 시작` 개수로 본다(store.util.ts `buildUnavailablePeriodOverlapWhere`).
  - **날짜 범위는 `date` 두 개** — 상품별 기간 가격 `t_room_group_plan_price.start_date` · `end_date`(한국 날짜, 둘 다 포함, CHECK `start_date <= end_date`). 엔티티로 읽으면 문자열 `'YYYY-MM-DD'` 로 온다(TypeORM 이 `date` 를 문자열로 바꾼다) — 엔티티 타입 `string`. 겹침은 배타 제약 `daterange(start_date, end_date, '[]')` + service 검사 둘 다(사용자 결정 2026-10-30).
  - **요일 비트는 `smallint`** — 일 ~ 토 가능 여부를 비트로(비트 = `1 << day_of_week`, `day_of_week` 는 0: 일 ~ 6: 토 — dayjs `day()` · `t_store_hour`). 일 1 · 월 2 · 화 4 · 수 8 · 목 16 · 금 32 · 토 64, 매일 127. 예: `t_room_plan.days_of_week`.
  - **좌표 `double precision`** — 위도 · 경도(WGS84). JS number 로 온다(`numeric` 은 문자열로 온다). 지도 범위 조회용 `IDX_Store_LatitudeLongitude` — store.entity.ts.
  - **jsonb** 는 항목이 자주 바뀌는 상세정보에 쓴다 — 컬럼 하나 + 같은 엔티티 파일의 TS 인터페이스(항목 타입 — 플래그는 `0 | 1`) + **기본값 상수**, `nullable: false` + `default: () => "'{}'"`. 조회 뒤 엔티티의 `@AfterLoad` 훅(`fillDetailDefaults()`)이 `{...기본값, ...저장된 값}` 으로 저장된 JSON 에 없는 항목을 채운다 — 그래서 인터페이스 항목은 조회 뒤 값 기준으로 모두 필수다. 항목을 더할 때는 인터페이스 · 기본값만 고치고, 기존 행을 고치는 마이그레이션이 없다(기존 행은 새 항목이 기본값으로 보인다). 엔티티로 읽지 않는 조회(raw select)는 같은 상수로 채운다. 예: `t_room_group.room_group_detail: RoomGroupDetail` · `ROOM_GROUP_DETAIL_DEFAULTS`(객실 그룹 = 객실 유형별 상세정보 — `room_count` 객실 안의 방 개수 · `has_shower` · `has_tv` · `has_pc` — room-group.entity.ts, 업체의 `t_store.store_detail` 에서 옮겼다 — 사용자 결정 2026-10-31). 로그 원본(`t_api_log` 요청 · 응답 본문)처럼 항목이 정해지지 않은 jsonb 는 대상이 아니다.
  - **종류마다 반복되는 설정은 (주체 × 종류) 1행 테이블** — `<종류>_<설정>` 컬럼(`day_use_hours` · `night_stay_check_in_time` …)을 늘어놓지 않는다. 종류는 룩업 FK, 컬럼은 종류와 무관한 이름이고, 종류별로 쓰지 않는 컬럼은 NULL + CHECK 로 조합을 막는다. 행은 반드시 종류마다 1행이고 지우지 않는다(판매 여부는 `is_used` 0/1). 예: 업체 상품 설정 `t_room_plan`(업체 × 상품 종류 — 입점 승인 · 마이그레이션이 넣는다, CHECK `CHK_RoomPlan_UsageHoursCheckInOutTime`) · 그룹 상품 `t_room_group_plan`(그룹 × 상품 종류) — 사용자 결정 2026-10-31.
  - 예외(기존 컬럼): `t_user.leave_reserved_at` 은 `varchar(40)` 에 dayjs `'YYYY-MM-DD HH:mm:ss'` 문자열을 넣고 문자열 비교로 경과를 판단한다(user.entity.ts:78, user-leave-cleanup.crontab.ts:43-44). 새 시각 컬럼은 `timestamptz`.
- **타임스탬프는 `@BeforeInsert`/`@BeforeUpdate` 훅**(❌ `@CreateDateColumn`/`@UpdateDateColumn`). 훅 메서드 이름은 `insertTimestamp()` · `updateTimestamp()`(jsonb 상세정보의 기본값 채움은 `@AfterLoad` `fillDetailDefaults()`). 훅은 `insert`/`update` 에 **엔티티 인스턴스**를 넘길 때만 돈다 — 그래서 service 는 `new XEntity()` + 할당으로 만든다.
- **룩업 엔티티**(auth · state · sns · sms-purpose · store-state · store-application-state · store-file-purpose · room-state · room-plan-type)는 구조 컬럼 + 그 값으로 동작이 갈리는 플래그만 둔다 — `t_state.is_login_allowed`(로그인 가능), `t_store_file_purpose.is_private`(1 이면 서명된 열람 주소 · `private/` 키, 0 이면 CDN 공개 주소 · `store/` 키). 동작을 코드의 값 목록이 아니라 룩업 행이 정하므로, 조회는 룩업을 조인해 플래그를 읽는다(`buildLoginUserQuery` · `buildStoreFileRowsQuery`). 기본 데이터는 seeder.

## 마이그레이션

적용은 **사용자 몫**이다. Claude 는 DB 없이 파일까지 만든다.

1. 엔티티를 고친다(새 엔티티면 `ENTITIES` 등록).
2. `npm run db:generate -- <PascalCase 이름>` — user-service 를 빌드한 뒤 [db-schema.mjs](../scripts/db-schema.mjs) 가 PGlite(WASM PostgreSQL)를 프로세스 안에 띄워 기존 마이그레이션을 적용하고, 엔티티 기준으로 남은 DDL(컬럼 · 제약 · 인덱스 · COMMENT 포함)을 `libs/database/src/migrations/<ts>-<Name>.ts` 로 쓴 뒤 `MIGRATIONS` 에 등록한다. `typeorm migration:generate` 와 같은 계산이다. PGlite 는 `btree_gist` 확장을 실어 띄운다(배타 제약 — db-schema.mjs). 새 PostgreSQL 확장을 쓰면 PGlite contrib 모듈도 함께 싣고, 마이그레이션 맨 앞에 `CREATE EXTENSION IF NOT EXISTS` 를 손으로 더한다(`1793386485207-RoomSchema.ts`).
3. 생성 파일 상단 JSDoc 의 TODO 를 바꾼 내용 설명으로 고친다.
4. `npm run db:check` — 엔티티와 마이그레이션이 일치하면 통과, 남은 차이가 있으면 DDL 을 출력하고 실패한다.
5. 적용(사용자): Docker 로 띄우면 `migrate` 컨테이너가 자동 적용, 로컬은 `npm run db:migrate`, 되돌리기 `npm run db:revert`. 운영은 배포 절차에서 같은 실행기(`migrate.js`)를 돌린다.

- 데이터 이전 · 파티셔닝처럼 엔티티로 표현할 수 없는 작업은 생성된 파일에 `queryRunner.query(...)` 를 직접 추가한다.
- **기존 행이 있는 테이블에 NOT NULL 컬럼을 더할 때**: 생성된 `ADD ... NOT NULL` 을 `DEFAULT <임시값>` 으로 추가 → `UPDATE` 로 실제 값 채우기 → `ALTER COLUMN ... DROP DEFAULT` 로 고친다(엔티티에 기본값이 없으면 `db:check` 가 일치로 본다). 예: `t_user.login_scope` 를 권한으로 채움(`1792682222497-LoginScopeStoreDetail.ts`). 값을 계산해 채울 때는 NULL 로 더한 뒤 `UPDATE` → `SET NOT NULL` 도 된다 — `t_store.store_code` 를 `replace(gen_random_uuid()::text, '-', '')` 로 채움(`1793027933626-StoreCodeManagerScope.ts`).
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
- **제약 위반은 그 제약이 걸릴 수 있는 쓰기에서 제약명별 `if … else if … else` 분기** — `isUniqueViolation(error, 'UK_…')`(23505) · `isForeignKeyViolation(error, 'FK_…')`(23503) · `isExclusionViolation(error, 'EXC_…')`(23P01 — 배타 제약, 기간 가격 겹침 room.repository.ts), 마지막 else 는 500. 지금은 insert 만 분기하고 update 2개는 500 만 던진다(user.repository.ts:230-250). 멱등 insert 는 UK 중복을 `return` 으로 무시(`insertUserSetting`).
- **QueryBuilder 빌더 메서드는 예외** — 쿼리만 만들고 실행하지 않으므로 try/catch 없이 public 으로 두고 포트 인터페이스에 넣지 않는다(`buildLoginUserQuery` — user.repository.ts:177). 실행하는 메서드(`findLoginUser`)가 try/catch 를 가진다. 빌더를 public 으로 두는 이유는 repository spec 의 Data-Access Smoke 가 SQL 을 고정하기 위해서다.
- **범용 메서드 우선**(`insertX`/`findX`/`findXs`/`updateX`). WHERE 는 service 가 `FindOptionsWhere<XEntity>`(❌ `Partial`)로 만들고 repository 는 실행만 — **예외: 소프트 삭제 조건**(아래).
- **삭제는 항상 소프트 삭제 — DB 데이터만**(사용자 규칙 2026-10-31). 행을 지우는 동작은 `is_deleted`(smallint 0/1, 기본 0)를 1 로 바꾸고 행을 남긴다(`DELETE` ❌). 파일을 지울 때 S3 객체는 실제로 지우고(`storageGateway.remove`), DB 행만 `is_deleted = 1`. 통째로 교체(영업시간 · 브레이크타임)도 기존 행을 삭제 표시한 뒤 새 행을 넣는다. 지우는 동작이 있는 테이블에만 `is_deleted` 를 둔다(t_user — 탈퇴는 상태 + 정보 가리기, 세션 갱신 · SMS 기록 · 룩업 · API 로그는 없음). 종류마다 반드시 있는 행(`t_room_plan` · `t_room_group_plan`)은 지우지 않는다.
  - **`is_deleted = 0` 은 repository 가 항상 붙인다** — `is_deleted` 가 있는 테이블의 조회 · 개수 · 수정 메서드는 받은 조건을 `notDeleted(where)`(libs/database/src/soft-delete.ts — 배열 OR 조건이면 각 조건에)로 감싸고, QueryBuilder 빌더는 `"<별칭>"."is_deleted" = 0`(조인한 `is_deleted` 테이블 포함)을 더한다. service 는 조건에 `is_deleted` 를 넣지 않는다(삭제 조건이 빠지는 일을 구조로 막는다 — 사용자 결정 2026-10-31). 객체 리터럴을 바로 넘길 때는 타입 인자를 적는다(`notDeleted<StoreHourEntity>({store_id})`) — `is_deleted` 가 없는 엔티티에 쓰면 컴파일 오류다.
  - **삭제 메서드는 `update(notDeleted(where), is_deleted = 1 인 엔티티)`**(이름은 `deleteX` 그대로 — 훅이 수정일을 채운다). 상태 조건을 건 삭제(`deleteApplication` · `deleteUnavailablePeriod`)는 `affected === 1` 을 돌려준다. QueryBuilder 갱신은 훅이 돌지 않아 `updated_at: () => 'CURRENT_TIMESTAMP'` 를 직접 넣는다(`buildDeleteApplicationFilesQuery` · `buildAssignStoreFilesQuery`). 새 행은 service 가 `is_deleted = 0` 을 명시한다.
  - **유일성 · 배타 제약은 지워지지 않은 행끼리** — 부분 유니크 인덱스 `WHERE "is_deleted" = 0`(지운 행의 이름을 다시 쓸 수 있다 — `UK_Room_StoreIdRoomName` · `UK_RoomGroup_StoreIdRoomGroupName` · `UK_StoreHour_StoreIdDayOfWeek`) · 배타 제약 `… WHERE ("is_deleted" = 0)`. 다시 쓰지 않는 값(업로드마다 새로 만드는 저장 키 `UK_StoreFile_FileKey` · `UK_RoomGroupImage_FileKey`)과 지우지 않는 행(`UK_RoomPlan_StoreIdRoomPlanTypeId` · `UK_RoomGroupPlan_RoomGroupIdRoomPlanTypeId`)은 일반 UK.
  - 딸린 행도 같이 삭제 표시한다 — 객실 그룹 삭제는 그 그룹의 호실 · 사진을 함께 삭제 표시한다(room.service.ts `deleteMyRoomGroup`, 사진 S3 객체는 마지막에 실제 삭제).
- 조회 시 `loadRelationIds: true`.
- `update(where, entity)` 의 `entity` 는 호출자가 `new XEntity()` + 바꿀 필드만 할당해 넘긴다(`@BeforeUpdate` 트리거). `undefined` 필드는 건드리지 않고 `null` 은 NULL 로 비운다 — 수정 API 의 선택 필드는 `?? null`.
- **조인 · raw select · 동적 조립은 QueryBuilder 빌더 메서드로 분리**(`buildLoginUserQuery` · `buildStoreFileRowsQuery` — 용도 조인 + raw 별칭이 결과 행 타입 `StoreFileRow` 의 키와 같다)하고 repository spec 의 Data-Access Smoke 로 SQL 을 고정한다 — service spec 은 repository 를 mock 하므로 쿼리를 실행하지 않는다([testing.md](testing.md)).
- 메서드명은 소유 도메인 어휘.
- **같은 업체 설정은 업체 행을 잠그고 쓴다** — 교체(영업시간 · 브레이크타임 — 삭제 표시하고 다시 넣기) · 겹침 검사(일시 예약불가) · 한도(업체 사진)는 동시에 온 두 요청이 같이 통과할 수 있다(교체 두 건이 합쳐져 겹치는 브레이크타임 등). store `findStoreByManager(user_id, true)` 가 `setLock('pessimistic_write', undefined, ['s'])` → `FOR UPDATE OF s` 로 업체 행만 잠가 같은 업체의 설정 쓰기를 한 번에 하나로 만든다. 잠금은 쓰기 트랜잭션(`@Transactional()`) 안에서만 — 밖에서는 TypeORM 이 `PessimisticLockTransactionRequiredError` 를 던진다(repository 가 500). 조회는 `false`.

- **로그인 그룹 조건** — 회원 조회는 자기 도메인의 로그인 그룹(`login_scope`)을 WHERE 에 넣어 다른 그룹 계정을 없는 계정처럼 다룬다(`findManager({login_id, login_scope: LOGIN_SCOPE.MANAGER, state_id: In([...])})`). 휴대폰 번호 중복 확인도 같은 그룹 안에서 한다.
- **다른 앱의 데이터(공유 DB)** — admin-service 의 manager · admin repository 는 t_user · t_session · t_session_refresh · t_sms_verification 을 같은 엔티티로 직접 다룬다(소유 도메인 어휘: `findManager` · `updateAdmin`). 오류 변환은 user.repository.ts 와 같다. 스키마 변경(마이그레이션)은 user-service 묶음 한 곳이다.

### 컬럼 이름 규칙

- 시각은 `<과거분사>_at` 이다 — `created_at` · `updated_at` · `verified_at` · `phone_verified_at` · `leave_reserved_at`. 앞으로 올 시각은 `expires_at` 꼴이다 — 만료 `expires_at`, 범위 `starts_at` · `ends_at`(일시 예약불가).
- 날짜는 `<명사>_date` 다 — 범위 `start_date` · `end_date`(상품별 기간 가격). 요일 비트는 `days_of_week` 다(`t_room_plan`).
- 기간 설정값은 단위를 이름 끝에 붙인 정수다 — `maintenance_minutes`(분) · `booking_open_hours` · `refund_deadline_hours` · `usage_hours`(시간). 업체별 예약 · 환불 규정(이용 시작 n시간 전부터 예약 · n시간 전까지 100% 환불, 이후 환불 신청 불가)은 `t_store` 에 두고, 예약할 때의 환불 기준은 예약에 함께 저장한다(Phase 17 — 사용자 결정 2026-10-29).
- 여부 플래그는 `is_<형용사 · 과거분사>` 이다 — `is_deleted` · `is_login_allowed` · `is_password_change_required` · `is_used`(사용 여부 — 업체 상품 설정 · 그룹 상품의 판매 여부).
- 직전 값을 가리키는 컬럼은 `previous_<이름>` 이다 — `previous_refresh_hash` · `leave_previous_state_id`.
- PK 는 `<t_ 를 뗀 테이블 이름>_id`, FK 는 가리키는 PK 와 같은 이름이다 — `api_log_id` · `user_id` · `sms_purpose_id`.
- **이름을 바꿀 때는 마이그레이션을 손으로 쓴다.** `db:generate` 는 이름 변경을 DROP + ADD 로 계산해 데이터가 사라진다. `ALTER TABLE ... RENAME COLUMN` · `ALTER INDEX ... RENAME` · `ALTER SEQUENCE ... RENAME` 만 쓰고(데이터 · 제약 · 주석 유지), `RenameColumns` 처럼 먼저 등록한 뒤 남은 차이만 생성한다(`1792477492198-RenameColumns.ts`).
- **nullable 컬럼에 따라 갈리는 유일성은 부분 유니크 인덱스**로 둔다 — `@Index('UK_…', [...], {unique: true, where: '"store_id" IS NULL'})`. 이름은 유일성 규칙이라 UK_ 접두, PostgreSQL 오류의 제약명이 인덱스 이름이라 `isUniqueViolation(error, 'UK_…')` 분기가 그대로 쓴다. TypeORM 1.x 에 `NULLS NOT DISTINCT` 가 없고, 세 컬럼 UK 하나로는 NULL 이 많은 컬럼(미인증 이용자의 phone)이 서로 다른 값으로 취급돼 유일성이 깨지기 때문이다.
  - `t_user` 아이디 · 휴대폰 번호 — 업체가 없는 계정(이용자 · 총관리자 · 관리자)은 그룹 안에서 `UK_User_LoginIdLoginScope(login_id, login_scope) WHERE store_id IS NULL` · `UK_User_PhoneLoginScope(phone, login_scope) WHERE store_id IS NULL`, 업체 소속 계정(매니저 그룹)은 그 업체 안에서 `UK_User_LoginIdLoginScopeStoreId(…, store_id) WHERE store_id IS NOT NULL` · `UK_User_PhoneLoginScopeStoreId`(user.entity.ts).
  - 제약 → 인덱스로 바꿀 때는 제약을 먼저 지우고 같은 이름의 인덱스를 만든다(`1793027933626-StoreCodeManagerScope.ts`). 되돌리기는 업체 간에 겹치는 값이 있으면 실패한다.
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

## Pagination / 목록 조회

> 적용: store 목록 3종(apps/admin-service/src/store/store.service.ts `getMyApplicationList` · `getApplicationList` · `getStoreList`) · 업체 관리자 목록(apps/admin-service/src/manager/manager.service.ts `getStaffList`) · room 목록 3종(apps/admin-service/src/room/room.service.ts `getMyRoomGroups` · `getMyRoomGroupPlanPrices` · `getMyRooms`). 공통 `PaginationDto`(`libs/common/src/dto/pagination.dto.ts`) · `Pagination`(`libs/common/src/utils/pagination.ts`). Query DTO 생성자 규칙은 [conventions.md](conventions.md).

- 응답 `{list, pagination}`.
- 순서 **count → `Pagination` → 목록** — `Pagination` 이 `total_count` 로 `limit`/`offset` 을 산출한다. repository 는 `countX(where)` 와 `findXList(where, limit, offset)` 두 메서드로 둔다(`findAndCount` ❌).
- 쓰는 모양: `const pagination = new Pagination({...dto, total_count});` → `findXList(where, pagination.limit, pagination.offset)` → `{list, pagination: pagination.getPagination()}`.
- Query DTO 는 `extends PaginationDto`(기본값은 부모 생성자).
- 검색 WHERE 는 도메인 util 이 `FindOptionsWhere<X>` 로 조립(통합검색은 배열 = OR — `buildStoreListWhere`), repository 는 실행만. 부분 일치는 `ILike(toContainsPattern(keyword))` — `%` · `_` · `\` 를 글자 그대로 찾도록 이스케이프한다(`libs/common/src/utils/search.ts`). `Like()` · `ILike()` · 관계 필드 where 를 쓰면 Data-Access Smoke 대상이다(`buildApplicationListQuery` · `buildStoreListQuery` · `buildStaffListQuery`).
- 기본 필터 `is_deleted = 0`, 정렬 `created_at DESC`.
