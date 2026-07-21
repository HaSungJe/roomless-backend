# Plan — store-register (가맹점 등록)

## Feature Summary
- **Feature**: 가맹점 header 테이블(`t_store`) 신설 + 등록 API 1개, SUPER_ADMIN/ADMIN 전용 (RolesGuard 첫 적용)
- **Entry point**: `POST /api/v1/store/register`
- **Domain**: store (신규)

---

## File List

| File | Action |
|------|------|
| `src/api/v1/store/entities/store.entity.ts` | **new** |
| `src/api/v1/store/dto/store-register.dto.ts` | **new** |
| `src/api/v1/store/interfaces/store.repository.interface.ts` | **new** |
| `src/api/v1/store/repositories/store.repository.ts` | **new** |
| `src/api/v1/store/store.symbols.ts` | **new** |
| `src/api/v1/store/store.service.ts` | **new** |
| `src/api/v1/store/store.controller.ts` | **new** |
| `src/api/v1/store/store.module.ts` | **new** |
| `src/api/v1/store/test/store-register.spec.ts` | **new** |
| `src/app.module.ts` | modified — `StoreModule` 등록 |
| `src/guards/roles/roles.guard.ts` | modified — 거부 시 한국어 `ForbiddenException` throw |
| `CLAUDE.md` · `docs/api.md` | modified(§4.5 승인 시) — 역할 기반 권한을 "미적용/규약" → 적용 규약으로 갱신 |
| DB 실스키마 | 사용자 처리 — `t_store` 생성 (`TYPEORM_SYNC=T` 환경은 자동 생성) |

---

## Design

### Data Model (Entity)

```typescript
// src/api/v1/store/entities/store.entity.ts — 신규 (전체)
import { BeforeInsert, BeforeUpdate, Column, Entity, PrimaryColumn, Unique } from "typeorm";

@Entity({name: 't_store', comment: '가맹점 정보'})
@Unique('UK_Store_BusinessNumber', ['business_number'])
export class StoreEntity {
    @PrimaryColumn({name: 'store_id', length: 32, comment: '가맹점 ID (UUID v4)', primaryKeyConstraintName: 'PK_Store'})
    store_id: string;

    @Column({name: 'store_name', length: 100, nullable: false, comment: '상호명'})
    store_name: string;

    @Column({name: 'business_number', length: 20, nullable: false, comment: '사업자등록번호(숫자 10자리)'})
    business_number: string;

    @Column({name: 'owner_name', length: 50, nullable: false, comment: '대표자명'})
    owner_name: string;

    @Column({name: 'phone', length: 30, nullable: false, comment: '가맹점 연락처'})
    phone: string;

    @Column({name: 'address', length: 255, nullable: false, comment: '주소'})
    address: string;

    @Column({name: 'address_detail', length: 255, nullable: true, comment: '상세주소'})
    address_detail: string | null;

    @Column({name: 'is_delete', type: 'tinyint', nullable: false, comment: '삭제여부(0: 정상, 1: 삭제)', default: 0})
    is_delete: number;

    @Column({name: 'create_at', type: 'timestamp', nullable: false, comment: '등록일'})
    create_at: Date;

    @Column({name: 'update_at', type: 'timestamp', nullable: false, comment: '수정일'})
    update_at: Date;

    @BeforeInsert()
    insertTimestamp() {
        const now = new Date();
        this.create_at = now;
        this.update_at = now;
    }

    @BeforeUpdate()
    updateTimestamp() {
        this.update_at = new Date();
    }
}
```

### Input/Validation (DTO)

```typescript
// src/api/v1/store/dto/store-register.dto.ts — 신규 (전체)
import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, Matches, MaxLength } from 'class-validator';

export class StoreRegisterDto {
    @ApiProperty({description: '상호명 (최대 100자)'})
    @MaxLength(100, {message: '상호명은 최대 100자까지 입력할 수 있습니다.'})
    @IsNotEmpty({message: '상호명을 입력해주세요.'})
    store_name: string;

    @ApiProperty({description: '사업자등록번호 (숫자 10자리)', example: '1234567890'})
    @Matches(/^\d{10}$/, {message: '사업자등록번호는 숫자 10자리여야 합니다.'})
    @IsNotEmpty({message: '사업자등록번호를 입력해주세요.'})
    business_number: string;

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
    address_detail?: string;
}

export class StoreRegisterResultDto {
    @ApiProperty({description: '등록된 가맹점 ID'})
    store_id: string;
}
```

### Data Access (Repository)

```typescript
// src/api/v1/store/store.symbols.ts — 신규 (전체)
export const STORE_REPOSITORY = Symbol('StoreRepositoryInterface');
```

```typescript
// src/api/v1/store/interfaces/store.repository.interface.ts — 신규 (전체)
import { StoreEntity } from '../entities/store.entity';

export interface StoreRepositoryInterface {
    insertStore(entity: StoreEntity): Promise<void>;
}
```

```typescript
// src/api/v1/store/repositories/store.repository.ts — 신규 (전체)
import { BadRequestException, Injectable, InternalServerErrorException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StoreEntity } from '../entities/store.entity';
import { StoreRepositoryInterface } from '../interfaces/store.repository.interface';

@Injectable()
export class StoreRepository implements StoreRepositoryInterface {
    constructor(
        @InjectRepository(StoreEntity)
        private readonly storeRepository: Repository<StoreEntity>,
    ) {}

    /**
     * 가맹점 등록
     */
    async insertStore(entity: StoreEntity): Promise<void> {
        try {
            await this.storeRepository.insert(entity);
        } catch (error) {
            if (error.errno === 1062 && error.sqlMessage.indexOf('UK_Store_BusinessNumber') !== -1) {
                throw new BadRequestException({message: '이미 등록된 사업자등록번호입니다.'});
            } else {
                throw new InternalServerErrorException({message: '서버에서 오류가 발생했습니다. 관리자에게 문의해주세요.'});
            }
        }
    }
}
```

### Business Logic (Service)

```typescript
// src/api/v1/store/store.service.ts — 신규 (전체)
import { Inject, Injectable } from '@nestjs/common';
import { Transactional } from 'typeorm-transactional';
import { v4 } from 'uuid';
import { StoreEntity } from './entities/store.entity';
import { StoreRegisterDto, StoreRegisterResultDto } from './dto/store-register.dto';
import { STORE_REPOSITORY } from './store.symbols';
import type { StoreRepositoryInterface } from './interfaces/store.repository.interface';

@Injectable()
export class StoreService {
    constructor(
        @Inject(STORE_REPOSITORY)
        private readonly storeRepository: StoreRepositoryInterface,
    ) {}

    /**
     * 가맹점 등록 — 관리자(SUPER_ADMIN/ADMIN)가 가맹점 header 정보를 등록하고 생성된 ID 를 반환.
     */
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
}
```

### Entry Point (Controller)

```typescript
// src/api/v1/store/store.controller.ts — 신규 (전체)
import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBody, ApiOkResponse, ApiBadRequestResponse, ApiForbiddenResponse, ApiInternalServerErrorResponse, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { PassportJwtAuthGuard } from '@root/guards/passport.jwt.auth/passport.jwt.auth.guard';
import { RolesGuard } from '@root/guards/roles/roles.guard';
import { Roles } from '@root/guards/roles/roles.decorator';
import { ApiBadRequestResultDto, ApiFailResultDto } from '@root/common/dto/global.result.dto';
import { StoreService } from './store.service';
import { StoreRegisterDto, StoreRegisterResultDto } from './dto/store-register.dto';

@ApiTags('가맹점')
@Controller('/api/v1/store')
export class StoreController {
    constructor(private readonly storeService: StoreService) {}

    /**
     * 가맹점 등록 (SUPER_ADMIN / ADMIN 전용)
     */
    @Post('/register')
    @UseGuards(PassportJwtAuthGuard, RolesGuard)
    @Roles('SUPER_ADMIN', 'ADMIN')
    @HttpCode(200)
    @ApiOperation({summary: '가맹점 등록'})
    @ApiBody({type: StoreRegisterDto})
    @ApiOkResponse({type: StoreRegisterResultDto})
    @ApiBadRequestResponse({type: ApiBadRequestResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiForbiddenResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async register(@Body() dto: StoreRegisterDto): Promise<StoreRegisterResultDto> {
        return this.storeService.register(dto);
    }
}
```

```typescript
// src/api/v1/store/store.module.ts — 신규 (전체)
import { Module, SetMetadata } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TypeORMModule } from '@root/modules/typeorm/typeorm.module';
import { PassportJwtAuthModule } from '@root/guards/passport.jwt.auth/passport.jwt.auth.module';
import { StoreEntity } from './entities/store.entity';
import { StoreController } from './store.controller';
import { StoreService } from './store.service';
import { StoreRepository } from './repositories/store.repository';
import { STORE_REPOSITORY } from './store.symbols';

@SetMetadata('type', 'API')
@SetMetadata('description', '가맹점')
@SetMetadata('path', 'store')
@Module({
    imports: [
        TypeORMModule,
        TypeOrmModule.forFeature([StoreEntity]),
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

### 권한 가드 (RolesGuard 한국어 403)

```typescript
// src/guards/roles/roles.guard.ts — 변경부: 거부 시 규약에 맞는 한국어 메시지로 throw
import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
// ...
    canActivate(context: ExecutionContext): boolean | Promise<boolean> | Observable<boolean> {
        const requiredAuths = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
            context.getHandler(),
            context.getClass(),
        ]);

        if (!requiredAuths) {
            return true;
        }

        const { user } = context.switchToHttp().getRequest();
        if (!requiredAuths.some((auth_id: string) => auth_id === user?.auth_id)) {
            // Nest 기본 영문 응답(Forbidden resource) 대신 프로젝트 규약의 한국어 메시지
            throw new ForbiddenException({message: '접근 권한이 없습니다.'});
        }
        return true;
    }
```

### 모듈 등록

```typescript
// src/app.module.ts — 변경부: StoreModule import + imports 배열 추가
import { UserModule } from './api/v1/user/user.module';
import { StoreModule } from './api/v1/store/store.module';
// ...
        ApiLogModule,
        UserModule,
        StoreModule,
        SeederModule, // 부팅 시 기본 데이터(SEED_TARGETS) 멱등 시드
```

### 테스트

```typescript
// src/api/v1/store/test/store-register.spec.ts — 신규 (지배적 스타일 ①: HTTP boot + repository Symbol mock)
// 상단 typeorm-transactional mock (기존 spec 과 동일).
// PassportJwtAuthGuard 만 .overrideGuard 로 대체해 req.user = {user_id, auth_id: currentAuthId} 주입하고,
// RolesGuard 는 실제 구현을 그대로 태워 권한 분기를 진짜로 검증한다(mock 아님).
//        const module = await Test.createTestingModule({
//            controllers: [StoreController],
//            providers: [StoreService, {provide: STORE_REPOSITORY, useValue: storeRepository}],
//        }).overrideGuard(PassportJwtAuthGuard).useValue({
//            canActivate: (ctx) => {
//                if (!guardAllows) throw new UnauthorizedException();
//                ctx.switchToHttp().getRequest().user = {user_id: USER, auth_id: currentAuthId};
//                return true;
//            },
//        }).compile();
// app.useGlobalFilters(new CustomErrorFilter()); + main.ts 재현 ValidationPipe(exceptionFactory)
//
// VALID_DTO = {store_name:'로우호텔 강남점', business_number:'1234567890', owner_name:'홍길동',
//              phone:'02-1234-5678', address:'서울시 강남구 테헤란로 1', address_detail:'3층'}
//
// [SUCCESS] SUPER_ADMIN → 200, res.body.store_id 가 /^[a-f0-9]{32}$/,
//           insertStore 1회 + entity toBeInstanceOf(StoreEntity) + 전 컬럼 값 단언
//           (store_name/business_number/owner_name/phone/address/address_detail, is_delete=0, store_id=응답값 일치)
// [SUCCESS] ADMIN → 200, insertStore 1회
// [SUCCESS] address_detail 미전송 → entity.address_detail toBeNull()
// [FAIL:auth] auth_id='USER' → 403 '접근 권한이 없습니다.', insertStore 미호출
// [FAIL:auth] auth_id='MANAGER' → 403 동일 메시지, insertStore 미호출
// [FAIL:auth] 미인증(guardAllows=false) → 401, insertStore 미호출
// [FAIL:validation] business_number 형식('123') / store_name 미전송 / phone 형식('abc') / address 미전송
//                   → 400 + validationErrors[0].property 단언, insertStore 전부 미호출
// [FAIL:duplicate] insertStore reject BadRequest('이미 등록된 사업자등록번호입니다.') → 400 메시지 단언
// [FAIL:repository] insertStore reject 통일 500 → 500 메시지 단언
```

---

## Test Cases

```
[SUCCESS]            SUPER_ADMIN·ADMIN 등록 200 + store_id 형식 + insertStore entity 전 컬럼 단언 / address_detail 미전송 시 null
[FAIL:auth]          USER·MANAGER 403 '접근 권한이 없습니다.'(RolesGuard 실제 실행) · 미인증 401 — 전부 insertStore 미호출
[FAIL:validation]    business_number 형식 / store_name 누락 / phone 형식 / address 누락 → 400 property 단언 + write 미호출
[FAIL:duplicate]     UK_Store_BusinessNumber 중복 → 400 '이미 등록된 사업자등록번호입니다.'
[FAIL:repository]    insertStore 통일 500
[SMOKE:data-access]  해당 없음 — insertStore 는 criteria 없는 insert 전용(매핑 민감 쿼리 구성 아님)
```

---

## Response Codes

| Code | Cause |
|------|------|
| 200 | 등록 성공 — `{store_id}` |
| 400 | 입력 검증 실패(validationErrors) / 사업자등록번호 중복(message 단독) |
| 401 | 미인증 (PassportJwtAuthGuard) |
| 403 | SUPER_ADMIN·ADMIN 외 권한 — "접근 권한이 없습니다." |
| 500 | repository 통일 오류 |
