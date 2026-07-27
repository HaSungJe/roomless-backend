# Data Layer

TypeORM 0.3 (MySQL, `mysql2`) · 기본 비즈니스 DataSource([config/typeorm.config.ts](../src/config/typeorm.config.ts), `autoLoadEntities: true`). api-log 는 별도 DataSource(`name:'apiLog'`)로 격리.

## 엔티티

```ts
@Entity({ name: 't_user', comment: '사용자 정보' })
@Unique('UK_User_LoginId', ['login_id'])
@Unique('UK_User_SnsSnsUserId', ['sns_id', 'sns_user_id'])   // 복합 UK
export class UserEntity {
    @PrimaryColumn({ name: 'user_id', length: 32, comment: '사용자 ID', primaryKeyConstraintName: 'PK_User' })
    user_id: string;

    @ManyToOne(() => AuthEntity, { nullable: false, onUpdate: 'CASCADE', onDelete: 'CASCADE' })
    @JoinColumn({ name: 'auth_id', referencedColumnName: 'auth_id', foreignKeyConstraintName: 'FK_User_Auth' })
    auth_id: string;

    @Column({ name: 'nickname', length: 50, nullable: false, comment: '닉네임' })
    nickname: string;

    @Column({ name: 'create_at', type: 'timestamp', nullable: false, comment: '등록일' })
    create_at: Date;
    @Column({ name: 'update_at', type: 'timestamp', nullable: false, comment: '수정일' })
    update_at: Date;

    @BeforeInsert()
    insertTimestamp() { const now = new Date(); this.create_at = now; this.update_at = now; }
    @BeforeUpdate()
    updateTimestamp() { this.update_at = new Date(); }
}
```

규칙:
- **테이블** `t_<domain>`, `@Entity({name, comment})`.
- **제약명 PascalCase**: `PK_<Domain>` / `UK_<Domain>_<Cols>` / `FK_<Domain>_<Target>`. PK 는 `primaryKeyConstraintName`, UK 는 `@Unique('UK_…', [...])` 데코레이터(❌ `@Column({unique})`), FK 는 `@ManyToOne` + `@JoinColumn({foreignKeyConstraintName})`.
- **모든 컬럼에 `comment`**.
- **타임스탬프는 `@BeforeInsert`/`@BeforeUpdate` 훅**(❌ `@CreateDateColumn`/`@UpdateDateColumn`). insert 전용 시각만 있으면 `@BeforeInsert` 만 정의(예: `session.entity` `login_at`).
- **룩업 엔티티**(`auth`/`state`/`sns`)는 구조 컬럼만, 시드 데이터·타임스탬프 훅 없음. 기본 데이터는 seeder 가 관리([architecture.md](architecture.md) 시드 절).

근거: [user.entity.ts](../src/api/v1/user/entities/user.entity.ts), [user-setting.entity.ts](../src/api/v1/user/entities/user-setting.entity.ts), [session.entity.ts](../src/api/v1/user/entities/session.entity.ts).

## Repository

```ts
@Injectable()
export class UserRepository implements UserRepositoryInterface {
    constructor(
        @InjectRepository(UserEntity)
        private readonly userRepository: Repository<UserEntity>,
        // … 엔티티별 raw Repository 주입 (이 클래스 내부에만)
    ) {}

    async insertUser(entity: UserEntity): Promise<void> {
        try {
            await this.userRepository.insert(entity);
        } catch (error) {
            if (error.errno === 1062 && error.sqlMessage.indexOf('UK_User_LoginId') !== -1) {
                throw new BadRequestException({ message: '이미 존재하는 로그인 ID입니다.' });
            } else if (error.errno === 1452 && error.sqlMessage.indexOf('FK_User_Auth') !== -1) {
                throw new BadRequestException({ message: '존재하지 않는 권한입니다.' });
            } else {
                throw new InternalServerErrorException({ message: '서버에서 오류가 발생했습니다. 관리자에게 문의해주세요.' });
            }
        }
    }

    async findUser(where: FindOptionsWhere<UserEntity>): Promise<UserEntity | null> {
        try {
            return await this.userRepository.findOne({ where, loadRelationIds: true });
        } catch (error) {
            throw new InternalServerErrorException({ message: '서버에서 오류가 발생했습니다. 관리자에게 문의해주세요.' });
        }
    }
}
```

규칙:
- **모든 메서드 try/catch**. 최종 실패는 통일 문구 `throw new InternalServerErrorException({message: '서버에서 오류가 발생했습니다. 관리자에게 문의해주세요.'})`(도메인별 동사 ❌).
- **insert/update 는 errno 분기**: `1062`(UK 중복)·`1452`(FK 위반)를 **제약명별 `if` 분기**로 `BadRequestException` 매핑. 멱등 upsert 는 UK 중복을 `return` 으로 무시 가능(예: `insertUserSetting`).
- **범용 메서드 우선**(`insert/find/findOne/update`). WHERE 조건은 service 가 구성하고 repository 는 실행만.
- WHERE 타입 `FindOptionsWhere<XEntity>`(❌ `Partial`).
- 조회 시 `loadRelationIds: true`.
- `update(where, entity)` 의 `entity` 는 호출자(service/스케줄러)가 `new XEntity()`+할당으로 만들어 전달(`@BeforeUpdate` 트리거).
- `@InjectRepository` 는 repository 클래스에만. service 는 인터페이스 토큰으로만 접근.

근거: [user.repository.ts](../src/api/v1/user/repositories/user.repository.ts).

## Pagination / 목록 조회

`common/dto/pagination.dto.ts` + `common/utils/pagination.ts`. 최초 적용은 가맹점 목록([store.service.ts](../src/api/v1/store/store.service.ts) `list`)이며, 이후 모든 목록 API 가 아래 형태를 따른다.

- **응답은 `{list, pagination}` 래핑** — `list` 는 기능별 항목 DTO 배열, `pagination` 은 `Pagination.getPagination()` 결과(`PaginationResultDto`).
- **호출 순서는 count → Pagination → 목록**. `Pagination` 생성자가 `total_count` 를 입력으로 받아 `limit`/`offset` 을 산출하는 구조라 순서가 강제된다. repository 는 `countStore(where)` 와 `findStoreList(where, limit, offset)` 처럼 **개수와 목록을 분리한 두 메서드**로 둔다(`findAndCount` ❌ — Pagination 이 총 개수를 먼저 요구한다).
- **Query DTO 는 `extends PaginationDto`** — 페이지 기본값은 부모 생성자가 담당한다(`all_search_yn='N'`, `page=1`, `size=20`, `page_size=10`). 상세: [conventions.md](conventions.md) "Query DTO 는 생성자를 갖고, 컨트롤러가 `new` 로 만들어 넘긴다".
- **검색 WHERE 는 도메인 util 이 조립**하고 repository 는 실행만 한다([store.util.ts](../src/api/v1/store/store.util.ts) `buildStoreSearchWhere`). 통합검색(전체)은 `FindOptionsWhere<T>[]` 배열 = OR 로 표현한다.
- 목록 조회의 기본 필터는 `is_delete = 0`, 정렬은 `create_at DESC`.

근거: [store.service.ts](../src/api/v1/store/store.service.ts) · [store.repository.ts](../src/api/v1/store/repositories/store.repository.ts) · [store-list.dto.ts](../src/api/v1/store/dto/store-list.dto.ts).
