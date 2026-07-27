# Plan — store-crud

## Feature Summary
- **Feature**: 관리자용 가맹점 목록·상세·수정·삭제 API (등록 이후의 생애주기)
- **Entry point**: `GET /api/v1/store/list` · `GET /api/v1/store/detail/:store_id` · `PATCH /api/v1/store/modify/:store_id` · `DELETE /api/v1/store/remove/:store_id`
- **Domain**: store

---

## 스키마 변경 (로컬은 자동 반영)

- `t_store.delete_backup` mediumtext NULL 추가
- `t_store.business_number` 길이 `20 → 45`

로컬 개발 DB 는 `TYPEORM_SYNC=T` 로 **부팅 시 자동 반영**되므로 수동 작업이 없다(사용자 확인 2026-07-27). 운영 배포 시에는 아래 ALTER 를 별도 적용한다.

```sql
ALTER TABLE t_store
    MODIFY COLUMN business_number VARCHAR(45) NOT NULL COMMENT '사업자등록번호(숫자 10자리, 삭제 시 DELETE_<store_id> 로 마스킹)',
    ADD COLUMN delete_backup MEDIUMTEXT NULL COMMENT '삭제 시 이전 정보 백업(JSON)';
```

```sql
ALTER TABLE t_store
    MODIFY COLUMN business_number VARCHAR(45) NOT NULL COMMENT '사업자등록번호(숫자 10자리, 삭제 시 DELETE_<store_id> 로 마스킹)',
    ADD COLUMN delete_backup MEDIUMTEXT NULL COMMENT '삭제 시 이전 정보 백업(JSON)';
```

---

## File List

| File | Action |
|------|------|
| `src/common/dto/pagination.dto.ts` | modified (`PaginationDto` 에 기본값 생성자 추가 — Query DTO 규약) |
| `CLAUDE.md` | modified (Validation 절에 Query DTO 생성자 규약 1줄) |
| `docs/conventions.md` | modified (동 규약 상세 절 추가, 초안 마커 부착) |
| `src/api/v1/store/entities/store.entity.ts` | modified |
| `src/api/v1/store/dto/store-list.dto.ts` | new |
| `src/api/v1/store/dto/store-detail.dto.ts` | new |
| `src/api/v1/store/dto/store-modify.dto.ts` | new |
| `src/api/v1/store/dto/store-remove.dto.ts` | new |
| `src/api/v1/store/store.util.ts` | new |
| `src/api/v1/store/interfaces/store.repository.interface.ts` | modified |
| `src/api/v1/store/repositories/store.repository.ts` | modified |
| `src/api/v1/store/store.service.ts` | modified |
| `src/api/v1/store/store.controller.ts` | modified |
| `src/api/v1/store/test/store-list.spec.ts` | new |
| `src/api/v1/store/test/store-detail.spec.ts` | new |
| `src/api/v1/store/test/store-modify.spec.ts` | new |
| `src/api/v1/store/test/store-remove.spec.ts` | new |
| `src/api/v1/store/test/store-register.spec.ts` | modified (엔티티 신규 컬럼 단언 추가 — revision 문서 참조) |
| `src/api/v1/store/store.module.ts` | unchanged |

---

## Design

### Entity

`business_number` 길이 확장 + `delete_backup` 추가. 나머지 컬럼·훅은 그대로.

```typescript
// src/api/v1/store/entities/store.entity.ts — 변경 부분

    @Column({name: 'business_number', length: 45, nullable: false, comment: '사업자등록번호(숫자 10자리, 삭제 시 DELETE_<store_id> 로 마스킹)'})
    business_number: string;

    // …(owner_name · phone · address · address_detail 변경 없음)…

    @Column({name: 'is_delete', type: 'tinyint', nullable: false, comment: '삭제여부(0: 정상, 1: 삭제)', default: 0})
    is_delete: number;

    @Column({name: 'delete_backup', type: 'mediumtext', nullable: true, comment: '삭제 시 이전 정보 백업(JSON)'})
    delete_backup: string | null;
```

### Input/Validation (DTO)

`class-validator` 사용 데코레이터는 CLAUDE.md 허용 집합(`@IsNotEmpty`/`@IsOptional`/`@IsIn`/`@Matches`/`@MaxLength`)만. 모든 제약에 한국어 `message` 리터럴, `@IsNotEmpty` 는 맨 마지막.

**Query DTO 규약** ([.beaver/memory/dto.md](../../../memory/dto.md), CLAUDE.md Validation 절 · [docs/conventions.md](../../../../docs/conventions.md)) — ① `@Query()` DTO 는 생성자를 세트로 갖고, ② **컨트롤러가 `new 클래스명({...})` 으로 만들어 service 에 넘기며**, ③ `ValidationPipe` 설정은 그대로 둔다(검증=파이프, 기본값=생성자).

**생성자 파라미터는 반드시 선택(`data?`)** — `ValidationPipe` 가 내부적으로 `newValue = new targetType()` 을 **인자 없이** 호출하므로(`class-transformer@0.5.1` `cjs/TransformOperationExecutor.js:147`), 필수 파라미터로 두면 `data.page` 접근에서 매 요청 500 이 난다. 페이지 기본값은 공통 `PaginationDto` 생성자로 올리고 값은 `Pagination` 유틸과 일치시킨다([pagination.ts:27](../../../../src/common/utils/pagination.ts)).

```typescript
// src/common/dto/pagination.dto.ts — PaginationDto 에 생성자 추가 (다른 클래스 변경 없음)

/**
 * 페이지정보 Dto
 * Query DTO 규약 — 생성자가 기본값의 단일 소재지. 파라미터는 선택(ValidationPipe 가 인자 없이 new 하기 때문).
 */
export class PaginationDto {
    @ApiProperty({ description: '전체검색 여부(Y/N)', required: true })
    all_search_yn: string;

    @ApiProperty({description: '페이지. 기본값: 1', required: false})
    page: number;

    @ApiProperty({description: '페이지당 출력될 데이터 수. 기본값: 20', required: false})
    size: number;

    @ApiProperty({description: '페이지탭에 출력될 페이지의 수. 기본값: 10', required: false})
    page_size: number;

    constructor(data?: Partial<PaginationDto>) {
        this.all_search_yn = data?.all_search_yn ?? 'N';
        this.page = data?.page ?? 1;
        this.size = data?.size ?? 20;
        this.page_size = data?.page_size ?? 10;
    }
}
```

```typescript
// src/api/v1/store/dto/store-list.dto.ts — 신규
import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsOptional, MaxLength } from 'class-validator';
import { PaginationDto, PaginationResultDto } from '@root/common/dto/pagination.dto';

/** 가맹점 목록 조회 입력 — 검색조건 + 페이지 정보(PaginationDto 상속) */
export class StoreListDto extends PaginationDto {
    @ApiProperty({description: '검색 대상 (ALL: 전체, STORE_NAME: 상호명, BUSINESS_NUMBER: 사업자등록번호, OWNER_NAME: 대표자명)', required: false})
    @IsOptional()
    @IsIn(['ALL', 'STORE_NAME', 'BUSINESS_NUMBER', 'OWNER_NAME'], {message: '검색 대상이 올바르지 않습니다.'})
    search_type: string | null;

    @ApiProperty({description: '검색어 (최대 100자)', required: false})
    @IsOptional()
    @MaxLength(100, {message: '검색어는 최대 100자까지 입력할 수 있습니다.'})
    search_keyword: string | null;

    constructor(data?: Partial<StoreListDto>) {
        super(data);                // all_search_yn='N', page=1, size=20, page_size=10
        this.search_type = data?.search_type ?? null;
        this.search_keyword = data?.search_keyword ?? null;
    }
}

/** 가맹점 목록 항목 */
export class StoreListItemDto {
    @ApiProperty({description: '가맹점 ID'})
    store_id: string;

    @ApiProperty({description: '상호명'})
    store_name: string;

    @ApiProperty({description: '사업자등록번호'})
    business_number: string;

    @ApiProperty({description: '대표자명'})
    owner_name: string;

    @ApiProperty({description: '가맹점 연락처'})
    phone: string;

    @ApiProperty({description: '주소'})
    address: string;

    @ApiProperty({description: '상세주소 (없으면 null)'})
    address_detail: string | null;

    @ApiProperty({description: '등록일'})
    create_at: Date;

    @ApiProperty({description: '수정일'})
    update_at: Date;
}

/** 가맹점 목록 조회 응답 */
export class StoreListResultDto {
    @ApiProperty({description: '가맹점 목록', isArray: true, type: () => StoreListItemDto})
    list: Array<StoreListItemDto>;

    @ApiProperty({description: '페이지 정보', type: () => PaginationResultDto})
    pagination: PaginationResultDto;
}
```

```typescript
// src/api/v1/store/dto/store-detail.dto.ts — 신규
import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, Matches } from 'class-validator';

/** 가맹점 상세 조회 입력 (path param) */
export class StoreDetailParamDto {
    @ApiProperty({description: '가맹점 ID (32자)'})
    @Matches(/^[a-f0-9]{32}$/, {message: '가맹점 ID 형식이 올바르지 않습니다.'})
    @IsNotEmpty({message: '가맹점 ID를 입력해주세요.'})
    store_id: string;
}

/** 가맹점 상세 조회 응답 */
export class StoreDetailResultDto {
    @ApiProperty({description: '가맹점 ID'})
    store_id: string;

    @ApiProperty({description: '상호명'})
    store_name: string;

    @ApiProperty({description: '사업자등록번호'})
    business_number: string;

    @ApiProperty({description: '대표자명'})
    owner_name: string;

    @ApiProperty({description: '가맹점 연락처'})
    phone: string;

    @ApiProperty({description: '주소'})
    address: string;

    @ApiProperty({description: '상세주소 (없으면 null)'})
    address_detail: string | null;

    @ApiProperty({description: '등록일'})
    create_at: Date;

    @ApiProperty({description: '수정일'})
    update_at: Date;
}
```

```typescript
// src/api/v1/store/dto/store-modify.dto.ts — 신규
import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, Matches, MaxLength } from 'class-validator';

/** 가맹점 수정 입력 (path param) */
export class StoreModifyParamDto {
    @ApiProperty({description: '가맹점 ID (32자)'})
    @Matches(/^[a-f0-9]{32}$/, {message: '가맹점 ID 형식이 올바르지 않습니다.'})
    @IsNotEmpty({message: '가맹점 ID를 입력해주세요.'})
    store_id: string;
}

/** 가맹점 수정 입력 (body) — 사업자등록번호는 수정 대상이 아니라 필드 자체가 없다 */
export class StoreModifyDto {
    @ApiProperty({description: '상호명 (최대 100자)'})
    @MaxLength(100, {message: '상호명은 최대 100자까지 입력할 수 있습니다.'})
    @IsNotEmpty({message: '상호명을 입력해주세요.'})
    store_name: string;

    @ApiProperty({description: '대표자명 (최대 50자)'})
    @MaxLength(50, {message: '대표자명은 최대 50자까지 입력할 수 있습니다.'})
    @IsNotEmpty({message: '대표자명을 입력해주세요.'})
    owner_name: string;

    @ApiProperty({description: '가맹점 연락처', example: '02-1234-5678'})
    @Matches(/^\d{2,4}-?\d{3,4}-?\d{4}$/, {message: '연락처 형식이 올바르지 않습니다.'})
    @IsNotEmpty({message: '연락처를 입력해주세요.'})
    phone: string;

    @ApiProperty({description: '주소 (최대 255자)'})
    @MaxLength(255, {message: '주소는 최대 255자까지 입력할 수 있습니다.'})
    @IsNotEmpty({message: '주소를 입력해주세요.'})
    address: string;

    @ApiProperty({description: '상세주소 (선택, 최대 255자)', required: false})
    @IsOptional()
    @MaxLength(255, {message: '상세주소는 최대 255자까지 입력할 수 있습니다.'})
    address_detail: string;
}
```

```typescript
// src/api/v1/store/dto/store-remove.dto.ts — 신규
import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, Matches } from 'class-validator';

/** 가맹점 삭제 입력 (path param) */
export class StoreRemoveParamDto {
    @ApiProperty({description: '가맹점 ID (32자)'})
    @Matches(/^[a-f0-9]{32}$/, {message: '가맹점 ID 형식이 올바르지 않습니다.'})
    @IsNotEmpty({message: '가맹점 ID를 입력해주세요.'})
    store_id: string;
}
```

### Domain Util

service 내부 private 헬퍼 금지 규칙에 따라, 검색 WHERE 조립과 삭제 백업 직렬화를 도메인 util 로 분리한다. `@Injectable` 없이 named `function` export — [user.util.ts:9](../../../../src/api/v1/user/user.util.ts) 와 동일 형식.

```typescript
// src/api/v1/store/store.util.ts — 신규
import { FindOptionsWhere, Like } from 'typeorm';
import { StoreEntity } from './entities/store.entity';

/**
 * 가맹점 검색 WHERE 조립.
 * search_type / search_keyword 가 모두 있을 때만 검색 조건을 걸고, 그 외에는 삭제되지 않은 전체를 대상으로 한다.
 * ALL 은 상호명·사업자등록번호·대표자명의 OR — TypeORM 은 where 배열을 OR 로 해석한다.
 */
export function buildStoreSearchWhere(search_type: string | null, search_keyword: string | null): FindOptionsWhere<StoreEntity> | FindOptionsWhere<StoreEntity>[] {
    if (!search_type || !search_keyword) {
        return {is_delete: 0};
    }

    const keyword = Like(`%${search_keyword}%`);
    if (search_type === 'STORE_NAME') {
        return {is_delete: 0, store_name: keyword};
    } else if (search_type === 'BUSINESS_NUMBER') {
        return {is_delete: 0, business_number: keyword};
    } else if (search_type === 'OWNER_NAME') {
        return {is_delete: 0, owner_name: keyword};
    } else {
        return [
            {is_delete: 0, store_name: keyword},
            {is_delete: 0, business_number: keyword},
            {is_delete: 0, owner_name: keyword},
        ];
    }
}

/**
 * 삭제 직전 스냅샷 직렬화 — 마스킹되기 전 원본 사업자등록번호를 포함한다.
 */
export function buildStoreDeleteBackup(entity: StoreEntity): string {
    return JSON.stringify({
        store_name: entity.store_name,
        business_number: entity.business_number,
        owner_name: entity.owner_name,
        phone: entity.phone,
        address: entity.address,
        address_detail: entity.address_detail,
        create_at: entity.create_at,
    });
}
```

### Data Access (Repository)

sibling 계약 준수 — 단건 조회는 `findOne({where, loadRelationIds: true})` 로 `entity | null` 반환 + 500 만 throw, 404 판단은 service 몫([user.repository.ts:102](../../../../src/api/v1/user/repositories/user.repository.ts)). 수정은 `update(where, entity)`([user.repository.ts:159](../../../../src/api/v1/user/repositories/user.repository.ts)).

```typescript
// src/api/v1/store/interfaces/store.repository.interface.ts — 전체
import { FindOptionsWhere } from 'typeorm';
import { StoreEntity } from '../entities/store.entity';

export interface StoreRepositoryInterface {
    insertStore(entity: StoreEntity): Promise<void>;
    countStore(where: FindOptionsWhere<StoreEntity> | FindOptionsWhere<StoreEntity>[]): Promise<number>;
    findStoreList(where: FindOptionsWhere<StoreEntity> | FindOptionsWhere<StoreEntity>[], limit: number, offset: number): Promise<StoreEntity[]>;
    findStore(where: FindOptionsWhere<StoreEntity>): Promise<StoreEntity | null>;
    updateStore(where: FindOptionsWhere<StoreEntity>, entity: StoreEntity): Promise<void>;
}
```

```typescript
// src/api/v1/store/repositories/store.repository.ts — import 변경 + 메서드 4개 추가
import { BadRequestException, Injectable, InternalServerErrorException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, Repository } from 'typeorm';
import { StoreEntity } from '../entities/store.entity';
import { StoreRepositoryInterface } from '../interfaces/store.repository.interface';

@Injectable()
export class StoreRepository implements StoreRepositoryInterface {
    constructor(
        @InjectRepository(StoreEntity)
        private readonly storeRepository: Repository<StoreEntity>,
    ) {}

    // …insertStore 변경 없음…

    /**
     * 가맹점 총 개수 조회 (페이지 계산용)
     */
    async countStore(where: FindOptionsWhere<StoreEntity> | FindOptionsWhere<StoreEntity>[]): Promise<number> {
        try {
            return await this.storeRepository.count({where});
        } catch (error) {
            throw new InternalServerErrorException({message: '서버에서 오류가 발생했습니다. 관리자에게 문의해주세요.'});
        }
    }

    /**
     * 가맹점 목록 조회 — 최근 등록 순
     */
    async findStoreList(where: FindOptionsWhere<StoreEntity> | FindOptionsWhere<StoreEntity>[], limit: number, offset: number): Promise<StoreEntity[]> {
        try {
            return await this.storeRepository.find({where, loadRelationIds: true, order: {create_at: 'DESC'}, skip: offset, take: limit});
        } catch (error) {
            throw new InternalServerErrorException({message: '서버에서 오류가 발생했습니다. 관리자에게 문의해주세요.'});
        }
    }

    /**
     * 가맹점 단건 조회
     */
    async findStore(where: FindOptionsWhere<StoreEntity>): Promise<StoreEntity | null> {
        try {
            return await this.storeRepository.findOne({where, loadRelationIds: true});
        } catch (error) {
            throw new InternalServerErrorException({message: '서버에서 오류가 발생했습니다. 관리자에게 문의해주세요.'});
        }
    }

    /**
     * 가맹점 수정 — new StoreEntity() + 필드 할당으로 호출(@BeforeUpdate update_at 트리거)
     */
    async updateStore(where: FindOptionsWhere<StoreEntity>, entity: StoreEntity): Promise<void> {
        try {
            await this.storeRepository.update(where, entity);
        } catch (error) {
            throw new InternalServerErrorException({message: '서버에서 오류가 발생했습니다. 관리자에게 문의해주세요.'});
        }
    }
}
```

### Business Logic (Service)

public 메서드 1개 = API 1개. `register` 포함 5개가 된다. 쓰기 메서드(`modify`·`remove`)에 `@Transactional()`.

```typescript
// src/api/v1/store/store.service.ts — import 변경 + 메서드 4개 추가
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Transactional } from 'typeorm-transactional';
import { v4 } from 'uuid';
import { Pagination } from '@root/common/utils/pagination';
import { StoreEntity } from './entities/store.entity';
import { StoreRegisterDto, StoreRegisterResultDto } from './dto/store-register.dto';
import { StoreListDto, StoreListResultDto } from './dto/store-list.dto';
import { StoreDetailParamDto, StoreDetailResultDto } from './dto/store-detail.dto';
import { StoreModifyParamDto, StoreModifyDto } from './dto/store-modify.dto';
import { StoreRemoveParamDto } from './dto/store-remove.dto';
import { buildStoreSearchWhere, buildStoreDeleteBackup } from './store.util';
import { STORE_REPOSITORY } from './store.symbols';
import type { StoreRepositoryInterface } from './interfaces/store.repository.interface';

@Injectable()
export class StoreService {
    constructor(
        @Inject(STORE_REPOSITORY)
        private readonly storeRepository: StoreRepositoryInterface,
    ) {}

    // …register 변경 없음(단, revision 문서의 delete_backup 초기화 반영)…

    /**
     * 가맹점 목록 조회 — 총 개수를 먼저 세고, Pagination 이 산출한 limit/offset 으로 목록을 가져온다.
     * (Pagination 생성자가 total_count 를 입력으로 받는 구조라 count → list 순서가 강제된다)
     */
    async list(dto: StoreListDto): Promise<StoreListResultDto> {
        // 1. 검색 WHERE 조립 (is_delete=0 고정)
        const where = buildStoreSearchWhere(dto.search_type, dto.search_keyword);

        // 2. 총 개수 → 페이지 계산
        const total_count = await this.storeRepository.countStore(where);
        const pagination = new Pagination({
            all_search_yn: dto.all_search_yn as 'Y' | 'N',
            total_count,
            page: dto.page,
            size: dto.size,
            page_size: dto.page_size,
        });

        // 3. 목록 조회
        const stores = await this.storeRepository.findStoreList(where, pagination.limit, pagination.offset);

        return {
            list: stores.map((store) => ({
                store_id: store.store_id,
                store_name: store.store_name,
                business_number: store.business_number,
                owner_name: store.owner_name,
                phone: store.phone,
                address: store.address,
                address_detail: store.address_detail,
                create_at: store.create_at,
                update_at: store.update_at,
            })),
            pagination: pagination.getPagination(),
        };
    }

    /**
     * 가맹점 상세 조회 — 삭제된 가맹점은 조회 대상이 아니다.
     */
    async detail(param: StoreDetailParamDto): Promise<StoreDetailResultDto> {
        const store = await this.storeRepository.findStore({store_id: param.store_id, is_delete: 0});
        if (!store) {
            throw new NotFoundException({message: '가맹점을 찾을 수 없습니다.'});
        }

        return {
            store_id: store.store_id,
            store_name: store.store_name,
            business_number: store.business_number,
            owner_name: store.owner_name,
            phone: store.phone,
            address: store.address,
            address_detail: store.address_detail,
            create_at: store.create_at,
            update_at: store.update_at,
        };
    }

    /**
     * 가맹점 수정 — 사업자등록번호는 변경 대상이 아니다(DTO 에 필드 자체가 없음).
     */
    @Transactional()
    async modify(param: StoreModifyParamDto, dto: StoreModifyDto): Promise<void> {
        // 1. 대상 확인 (삭제된 가맹점은 수정 불가)
        const store = await this.storeRepository.findStore({store_id: param.store_id, is_delete: 0});
        if (!store) {
            throw new NotFoundException({message: '가맹점을 찾을 수 없습니다.'});
        }

        // 2. 전달된 필드 전체 덮어쓰기
        const storeEntity = new StoreEntity();
        storeEntity.store_name = dto.store_name;
        storeEntity.owner_name = dto.owner_name;
        storeEntity.phone = dto.phone;
        storeEntity.address = dto.address;
        storeEntity.address_detail = dto.address_detail ?? null;
        await this.storeRepository.updateStore({store_id: param.store_id}, storeEntity);
    }

    /**
     * 가맹점 삭제 — soft delete + 사업자등록번호 마스킹.
     * business_number 를 DELETE_<store_id> 로 치환해 UK_Store_BusinessNumber 를 비우고,
     * 삭제 직전 스냅샷을 delete_backup 에 남긴다. 같은 사업자등록번호로 재등록이 가능해진다.
     */
    @Transactional()
    async remove(param: StoreRemoveParamDto): Promise<void> {
        // 1. 대상 확인 (이미 삭제된 가맹점은 재삭제 불가)
        const store = await this.storeRepository.findStore({store_id: param.store_id, is_delete: 0});
        if (!store) {
            throw new NotFoundException({message: '가맹점을 찾을 수 없습니다.'});
        }

        // 2. 백업 + 마스킹 + 삭제 플래그
        const storeEntity = new StoreEntity();
        storeEntity.is_delete = 1;
        storeEntity.business_number = `DELETE_${store.store_id}`;
        storeEntity.delete_backup = buildStoreDeleteBackup(store);
        await this.storeRepository.updateStore({store_id: param.store_id}, storeEntity);
    }
}
```

### Entry Point (Controller)

데코레이터 순서는 HTTP verb → `@UseGuards` → `@Roles` → `@HttpCode` → `@ApiOperation` → `@ApiBody` → 성공 응답 → 에러 응답들. 응답 데코레이터는 `type` 만.

`list` 핸들러만 Query DTO 규약에 따라 **`const dto = new StoreListDto(query);` 로 지역변수를 만든 뒤 넘긴다** — 기본값이 확정된 인스턴스를 service 가 받게 하기 위함이며, 이는 규약이 허용하는 유일한 컨트롤러 코드다(로직 0 원칙 유지). 호출부에 `new` 를 인라인으로 끼워넣지 않는다. 나머지 핸들러는 받은 DTO 를 그대로 위임한다.

```typescript
// src/api/v1/store/store.controller.ts — import 변경 + 핸들러 4개 추가
import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBody, ApiOkResponse, ApiNoContentResponse, ApiBadRequestResponse, ApiForbiddenResponse, ApiInternalServerErrorResponse, ApiNotFoundResponse, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { PassportJwtAuthGuard } from '@root/guards/passport.jwt.auth/passport.jwt.auth.guard';
import { RolesGuard } from '@root/guards/roles/roles.guard';
import { Roles } from '@root/guards/roles/roles.decorator';
import { ApiBadRequestResultDto, ApiFailResultDto } from '@root/common/dto/global.result.dto';
import { StoreService } from './store.service';
import { StoreRegisterDto, StoreRegisterResultDto } from './dto/store-register.dto';
import { StoreListDto, StoreListResultDto } from './dto/store-list.dto';
import { StoreDetailParamDto, StoreDetailResultDto } from './dto/store-detail.dto';
import { StoreModifyParamDto, StoreModifyDto } from './dto/store-modify.dto';
import { StoreRemoveParamDto } from './dto/store-remove.dto';

@ApiTags('가맹점')
@Controller('/api/v1/store')
export class StoreController {
    constructor(private readonly storeService: StoreService) {}

    // …register 변경 없음…

    /**
     * 가맹점 목록 조회 (SUPER_ADMIN / ADMIN 전용)
     */
    @Get('/list')
    @UseGuards(PassportJwtAuthGuard, RolesGuard)
    @Roles('SUPER_ADMIN', 'ADMIN')
    @HttpCode(200)
    @ApiOperation({summary: '가맹점 목록 조회'})
    @ApiOkResponse({type: StoreListResultDto})
    @ApiBadRequestResponse({type: ApiBadRequestResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiForbiddenResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async list(@Query() query: StoreListDto): Promise<StoreListResultDto> {
        const dto = new StoreListDto(query);
        return this.storeService.list(dto);
    }

    /**
     * 가맹점 상세 조회 (SUPER_ADMIN / ADMIN 전용)
     */
    @Get('/detail/:store_id')
    @UseGuards(PassportJwtAuthGuard, RolesGuard)
    @Roles('SUPER_ADMIN', 'ADMIN')
    @HttpCode(200)
    @ApiOperation({summary: '가맹점 상세 조회'})
    @ApiOkResponse({type: StoreDetailResultDto})
    @ApiBadRequestResponse({type: ApiBadRequestResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiForbiddenResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async detail(@Param() param: StoreDetailParamDto): Promise<StoreDetailResultDto> {
        return this.storeService.detail(param);
    }

    /**
     * 가맹점 수정 (SUPER_ADMIN / ADMIN 전용)
     */
    @Patch('/modify/:store_id')
    @UseGuards(PassportJwtAuthGuard, RolesGuard)
    @Roles('SUPER_ADMIN', 'ADMIN')
    @HttpCode(204)
    @ApiOperation({summary: '가맹점 수정'})
    @ApiBody({type: StoreModifyDto})
    @ApiNoContentResponse()
    @ApiBadRequestResponse({type: ApiBadRequestResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiForbiddenResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async modify(@Param() param: StoreModifyParamDto, @Body() dto: StoreModifyDto): Promise<void> {
        return this.storeService.modify(param, dto);
    }

    /**
     * 가맹점 삭제 (SUPER_ADMIN / ADMIN 전용)
     */
    @Delete('/remove/:store_id')
    @UseGuards(PassportJwtAuthGuard, RolesGuard)
    @Roles('SUPER_ADMIN', 'ADMIN')
    @HttpCode(204)
    @ApiOperation({summary: '가맹점 삭제'})
    @ApiNoContentResponse()
    @ApiBadRequestResponse({type: ApiBadRequestResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiForbiddenResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async remove(@Param() param: StoreRemoveParamDto): Promise<void> {
        return this.storeService.remove(param);
    }
}
```

---

## Test Cases

지배적 스타일 ① — 실제 controller+service+ValidationPipe+`CustomErrorFilter` 부팅 후 **repository 만 Symbol 토큰으로 `jest.fn()` 주입**, `PassportJwtAuthGuard` 만 `.overrideGuard` 하고 `RolesGuard` 는 실제 구현을 태운다([store-register.spec.ts](../../../../src/api/v1/store/test/store-register.spec.ts) 와 동일). 상단 `typeorm-transactional` mock.

```
── store-list.spec.ts ────────────────────────────────────────
[SUCCESS]            검색조건 없음 — countStore/findStoreList 가 {is_delete:0} 로 1회씩 호출, 응답 list 각 필드 값과 pagination 전 필드(total_count·page·max_page·page_range·content_start_number) 단언
[SUCCESS]            search_type=STORE_NAME — where 인자가 {is_delete:0, store_name: Like('%키워드%')} 임을 단언
[SUCCESS]            search_type=ALL — where 인자가 3개 원소 배열(store_name·business_number·owner_name)임을 단언
[SUCCESS]            search_keyword 만 있고 search_type 없음 — 검색 없이 {is_delete:0} 로 조회(400 아님)
[SUCCESS]            page=2, size=5 — findStoreList 가 limit=5, offset=5 로 호출됨을 단언
[SUCCESS]            쿼리 파라미터 전무 — 컨트롤러의 new StoreListDto(query) 가 기본값을 확정해 findStoreList 가 limit=20, offset=0 으로 호출되고 응답 pagination.page===1, all_search_yn==='N' (Query DTO 규약 검증)
[SUCCESS]            page 만 전달(size 생략) — size 는 생성자 기본값 20 유지, limit=20
[SUCCESS]            new StoreListDto() 를 인자 없이 호출해도 전 필드 기본값이 채워짐 — ValidationPipe 의 인자 없는 new 경로 회귀 방지(단위 단언)
[SUCCESS]            결과 0건 — list=[], total_count=0, max_page=1
[FAIL:validation]    search_type 이 허용값 밖 — 400 '검색 대상이 올바르지 않습니다.', countStore 미호출
[FAIL:validation]    search_keyword 101자 — 400 '검색어는 최대 100자까지 입력할 수 있습니다.', countStore 미호출
[FAIL:auth]          미인증 401 / USER 403 '접근 권한이 없습니다.' / MANAGER 403 — 각각 countStore 미호출
[FAIL:repository]    countStore throw — 500 '서버에서 오류가 발생했습니다. 관리자에게 문의해주세요.', findStoreList 미호출
[FAIL:repository]    findStoreList throw — 500

── store-detail.spec.ts ──────────────────────────────────────
[SUCCESS]            존재하는 가맹점 — findStore 가 {store_id, is_delete:0} 로 1회 호출, 응답 전 필드 값 단언(address_detail null 포함)
[FAIL:validation]    store_id 형식 불일치(32자 hex 아님) — 400 '가맹점 ID 형식이 올바르지 않습니다.', findStore 미호출
[FAIL:service]       findStore 가 null — 404 '가맹점을 찾을 수 없습니다.'
[FAIL:auth]          미인증 401 / USER 403 — findStore 미호출
[FAIL:repository]    findStore throw — 500

── store-modify.spec.ts ──────────────────────────────────────
[SUCCESS]            정상 수정 — 204, updateStore 가 ({store_id}, entity) 로 1회 호출되고 entity 가 StoreEntity 인스턴스이며 store_name·owner_name·phone·address 값이 입력과 일치, business_number 는 undefined(수정 대상 아님)
[SUCCESS]            address_detail 미전달 — entity.address_detail === null
[FAIL:validation]    store_name 빈값 — 400 '상호명을 입력해주세요.', findStore·updateStore 미호출
[FAIL:validation]    phone 형식 오류 — 400 '연락처 형식이 올바르지 않습니다.'
[FAIL:validation]    address 256자 — 400 '주소는 최대 255자까지 입력할 수 있습니다.'
[FAIL:validation]    body 에 business_number 를 넣어도 entity 에 반영되지 않음(무시됨)
[FAIL:service]       findStore 가 null — 404 '가맹점을 찾을 수 없습니다.', updateStore 미호출
[FAIL:auth]          미인증 401 / USER 403 — findStore 미호출
[FAIL:repository]    updateStore throw — 500

── store-remove.spec.ts ──────────────────────────────────────
[SUCCESS]            정상 삭제 — 204, updateStore 인자 entity 의 is_delete===1, business_number==='DELETE_'+store_id, delete_backup 이 JSON 문자열이고 파싱하면 원본 business_number·store_name·owner_name·phone·address·address_detail 를 담고 있음
[FAIL:validation]    store_id 형식 불일치 — 400, findStore·updateStore 미호출
[FAIL:service]       findStore 가 null(이미 삭제됨 포함) — 404 '가맹점을 찾을 수 없습니다.', updateStore 미호출
[FAIL:auth]          미인증 401 / USER 403 — findStore 미호출
[FAIL:repository]    updateStore throw — 500

── [SMOKE:data-access] (store-list.spec.ts 내 별도 describe) ──
[SMOKE:data-access]  buildStoreSearchWhere 의 4가지 반환(검색없음·STORE_NAME·BUSINESS_NUMBER·OWNER_NAME·ALL 배열)을 실제 StoreEntity 메타데이터로 DataSource 연결 없이 쿼리 빌드 — createQueryBuilder 기반 where 변환이 throw 없이 완료되고 생성 SQL 에 대상 컬럼명(store_name/business_number/owner_name)과 LIKE 가 포함되는지 확인
[SMOKE:data-access]  findStoreList 의 order:{create_at:'DESC'} + skip/take 조합이 컬럼 매핑 오류 없이 SQL 로 빌드되는지 확인
```

> `[SMOKE:data-access]` 가 필수인 이유 — `buildStoreSearchWhere` 는 `Like()` 연산자와 **where 배열(OR)** 을 쓰는 매핑 민감 구성이다. repository mock 스펙은 `where` 객체를 그대로 비교할 뿐 TypeORM 의 컬럼 매핑 코드를 한 줄도 실행하지 않으므로, 필드명 오타나 잘못된 연산자 조합이 구조적으로 통과한다(정의: [docs/testing.md](../../../../docs/testing.md) "Data-Access Smoke").

---

## Response Codes

| Code | Cause |
|------|------|
| 200 | 목록 조회 성공 (`StoreListResultDto`) / 상세 조회 성공 (`StoreDetailResultDto`) |
| 204 | 수정 성공 / 삭제 성공 (본문 없음) |
| 400 | 입력 검증 실패 — `{message, validationErrors}` (검색 대상·검색어 길이·가맹점 ID 형식·상호명·대표자명·연락처·주소·상세주소) |
| 401 | 미인증 — `PassportJwtAuthGuard` 거부 |
| 403 | 권한 불일치 — `{message: '접근 권한이 없습니다.'}` (`RolesGuard`) |
| 404 | 대상 가맹점 없음(삭제된 가맹점 포함) — `{message: '가맹점을 찾을 수 없습니다.'}` (상세·수정·삭제) |
| 500 | repository 실패 — `{message: '서버에서 오류가 발생했습니다. 관리자에게 문의해주세요.'}` |
