# Revision — store-register — 260727-1

> 기존 기능 변경 계획. 원본 [store-register-spec.md](../../spec/store/store-register-spec.md) / [store-register-plan.md](../../plan/store/store-register-plan.md) 은 수정하지 않고 참조만 한다.

## Reason for Change Request

`store-crud` 기획에서 삭제를 **soft delete + 사업자등록번호 마스킹**으로 정하면서 `t_store` 에 `delete_backup` 컬럼이 추가되고 `business_number` 길이가 20 → 45 로 확장된다. 등록 API 는 이 엔티티를 공유하므로 신규 컬럼 초기화가 필요하다.

사용자 요청("등록부분 점검, 고칠 부분 있으면 고쳐줘")에 따라 등록 API 전체를 규약 대조했고, **엔티티 확장에 따른 초기화 1건 외에는 고칠 것이 없다**. 점검 결과는 아래 "점검 결과" 절에 남긴다.

## Spec Before → After

| Item | Before | After |
|------|--------|-------|
| `t_store.business_number` 길이 | 20 | 45 (`DELETE_`(7) + `store_id`(32) = 39자 수용) |
| `t_store.delete_backup` | 없음 | mediumtext NULL 추가 |
| `register` 의 엔티티 초기화 | `is_delete = 0` 까지 | `delete_backup = null` 명시 초기화 추가 |
| 등록 입력 검증 | `@Matches(/^\d{10}$/)` | **변경 없음** — 컬럼 길이 확장은 마스킹 값 수용 목적이지 입력 허용 범위 확대가 아니다 |
| `insertStore` 의 1062 분기 메시지 | '이미 등록된 사업자등록번호입니다.' | **변경 없음** — 마스킹 도입 후 삭제된 가맹점은 `DELETE_xxx` 를 갖고 있어 충돌하지 않으므로, 이 메시지가 나오는 경우는 운영 중인 가맹점과 진짜로 중복될 때뿐이라 문구가 여전히 정확하다 |

## Affected Files

| File | Change Type | Description |
|------|-------------|-------------|
| `src/api/v1/store/entities/store.entity.ts` | modify | `business_number` 길이·comment 변경, `delete_backup` 추가 — 실제 코드는 [store-crud-plan.md](../../plan/store/store-crud-plan.md) Design/Entity 절에 있다(중복 기재하지 않음) |
| `src/api/v1/store/store.service.ts` | modify | `register` 에 `delete_backup = null` 초기화 추가 |
| `src/api/v1/store/test/store-register.spec.ts` | modify | 전 컬럼 값 단언에 `delete_backup: null` 추가 |

## Code Changes

```typescript
// src/api/v1/store/store.service.ts — before
    @Transactional()
    async register(dto: StoreRegisterDto): Promise<StoreRegisterResultDto> {
        // 1. ID 생성
        const store_id = v4().replace(/-/g, '');

        // 2. t_store 생성 (사업자등록번호 중복은 UK_Store_BusinessNumber 분기 400)
        const storeEntity = new StoreEntity();
        storeEntity.store_id = store_id;
        storeEntity.store_name = dto.store_name;
        storeEntity.business_number = dto.business_number;
        storeEntity.owner_name = dto.owner_name;
        storeEntity.phone = dto.phone;
        storeEntity.address = dto.address;
        storeEntity.address_detail = dto.address_detail ?? null;
        storeEntity.is_delete = 0;
        await this.storeRepository.insertStore(storeEntity);

        return {store_id};
    }
```

```typescript
// src/api/v1/store/store.service.ts — after (실제 작성할 코드)
    @Transactional()
    async register(dto: StoreRegisterDto): Promise<StoreRegisterResultDto> {
        // 1. ID 생성
        const store_id = v4().replace(/-/g, '');

        // 2. t_store 생성 (사업자등록번호 중복은 UK_Store_BusinessNumber 분기 400)
        const storeEntity = new StoreEntity();
        storeEntity.store_id = store_id;
        storeEntity.store_name = dto.store_name;
        storeEntity.business_number = dto.business_number;
        storeEntity.owner_name = dto.owner_name;
        storeEntity.phone = dto.phone;
        storeEntity.address = dto.address;
        storeEntity.address_detail = dto.address_detail ?? null;
        storeEntity.is_delete = 0;
        storeEntity.delete_backup = null;
        await this.storeRepository.insertStore(storeEntity);

        return {store_id};
    }
```

```typescript
// src/api/v1/store/test/store-register.spec.ts — before (전 컬럼 값 단언 부분)
        const entity = insertStore.mock.calls[0][0];
        expect(entity).toBeInstanceOf(StoreEntity);
        expect(entity.store_name).toBe('테스트상호');
        expect(entity.business_number).toBe('1234567890');
        expect(entity.owner_name).toBe('홍길동');
        expect(entity.phone).toBe('02-1234-5678');
        expect(entity.address).toBe('서울시 강남구');
        expect(entity.address_detail).toBeNull();
        expect(entity.is_delete).toBe(0);
```

```typescript
// src/api/v1/store/test/store-register.spec.ts — after (실제 작성할 코드)
        const entity = insertStore.mock.calls[0][0];
        expect(entity).toBeInstanceOf(StoreEntity);
        expect(entity.store_name).toBe('테스트상호');
        expect(entity.business_number).toBe('1234567890');
        expect(entity.owner_name).toBe('홍길동');
        expect(entity.phone).toBe('02-1234-5678');
        expect(entity.address).toBe('서울시 강남구');
        expect(entity.address_detail).toBeNull();
        expect(entity.is_delete).toBe(0);
        expect(entity.delete_backup).toBeNull();
```

> 위 spec 코드는 기존 파일의 해당 단언 블록 기준이다. build 시 실제 파일의 변수명·케이스 배치에 맞춰 반영한다.

## 점검 결과 (변경 없음 항목)

사용자 요청에 따라 등록 API 를 CLAUDE.md 전 항목과 대조했다. 아래는 **문제 없음**으로 판정한 것들이다.

| 점검 항목 | 판정 |
|---|---|
| 컨트롤러 데코레이터 순서 (verb → `@UseGuards` → `@Roles` → `@HttpCode` → `@ApiOperation` → `@ApiBody` → 성공 → 에러) | 준수 ([store.controller.ts:18](../../../../src/api/v1/store/store.controller.ts)) |
| 입력이 DTO 타입, 파라미터 한 줄, `@Param('key')` 미사용 | 준수 |
| DTO 검증 데코레이터 집합·순서·한국어 `message` 리터럴 | 준수 ([store-register.dto.ts](../../../../src/api/v1/store/dto/store-register.dto.ts)) |
| 엔티티 제약명 PascalCase, `@Unique()` 데코레이터, 전 컬럼 comment, `@BeforeInsert`/`@BeforeUpdate` | 준수 |
| repository try/catch + errno 1062 분기 + 통일 500 | 준수, sibling([user.repository.ts:30](../../../../src/api/v1/user/repositories/user.repository.ts))과 동일 형태 |
| service public 1개 = API 1개, `@Transactional()`, `new StoreEntity()` + 할당 | 준수 |
| Symbol 토큰 DI, 모듈 `@SetMetadata` 3종 + `app.module.ts` 등록 | 준수 |

**관찰만 하고 고치지 않은 것**

- **`StoreRegisterDto.address_detail?: string` 의 `?`** — sibling [user-leave.dto.ts:9](../../../../src/api/v1/user/dto/user-leave.dto.ts) 는 `@IsOptional()` 필드를 `leave_comment: string` 으로 `?` 없이 선언한다. 두 DTO 가 서로 다르지만, **선택 필드에 `?` 를 붙인 store 쪽이 타입상 정확**하다. sibling 에 맞춘다고 더 부정확한 쪽으로 되돌리는 것은 개선이 아니므로 store 는 그대로 두고, user 쪽 통일은 별도 건으로 남긴다.
- **등록자 추적 없음** — 인증을 요구하면서 `@PassportUser('user_id')` 를 받지 않아 "누가 등록했는지"가 남지 않는다. `t_store` 에 등록자 컬럼이 없는 현재 설계에서는 결함이 아니다. 감사 추적이 필요해지면 별도 유닛으로 다룬다.

## Decisions

없음 — 상위 [store-crud-spec.md](../../spec/store/store-crud-spec.md) Decisions 에서 모두 확정됨.

## 스키마 변경

[store-crud-plan.md](../../plan/store/store-crud-plan.md) "스키마 변경" 과 **동일 건**(중복 아님). 로컬은 `TYPEORM_SYNC=T` 로 자동 반영.
