# API & Docs

Swagger(`@nestjs/swagger`). 모듈 메타데이터(`@SetMetadata('type','API')` 등)를 `main.ts` 가 reflector 로 읽어 문서를 자동 생성한다([architecture.md](architecture.md)).

## 클래스 데코레이터 순서

```ts
@ApiTags('회원')
@Controller('/api/v1/user')
export class UserController { ... }
```

`@ApiTags('<한글>')` → `@Controller(...)`.

## 메서드 데코레이터 순서

```ts
@Delete('/leave')
@UseGuards(PassportJwtAuthGuard)          // 인증 핸들러만
@HttpCode(204)
@ApiOperation({ summary: '회원 탈퇴 신청' }) // summary 만
@ApiBody({ type: UserLeaveDto })
@ApiNoContentResponse()                    // void → 204
@ApiBadRequestResponse({ type: ApiBadRequestResultDto })
@ApiUnauthorizedResponse({ type: ApiFailResultDto })
@ApiNotFoundResponse({ type: ApiFailResultDto })
@ApiInternalServerErrorResponse({ type: ApiFailResultDto })
async leave(@PassportUser('user_id') user_id: string, @Body() dto: UserLeaveDto): Promise<void> {
    return this.userService.leave(user_id, dto);
}
```

순서: **HTTP verb → `@UseGuards`(인증 시) → `@Roles`(권한 제한 시) → `@HttpCode` → `@ApiOperation({summary})` → `@ApiBody` → `@ApiOkResponse`/`@ApiNoContentResponse` → `@ApiBadRequestResponse` → `@ApiUnauthorizedResponse`/`@ApiForbiddenResponse`/`@ApiNotFoundResponse` → `@ApiInternalServerErrorResponse`**.

권한 제한 핸들러는 가드를 **인증 → 권한 순으로 한 세트** 부착하고 바로 다음 줄에 `@Roles` 를 둔다([store.controller.ts](../src/api/v1/store/store.controller.ts)):

```ts
@Post('/register')
@UseGuards(PassportJwtAuthGuard, RolesGuard)   // 인증 → 권한 순
@Roles('SUPER_ADMIN', 'ADMIN')                 // t_auth PK 문자열
@HttpCode(200)
// … 이하 동일
```

- 권한 불일치는 `RolesGuard` 가 `ForbiddenException({message: '접근 권한이 없습니다.'})` 로 403 — 핸들러는 관여하지 않는다. `@ApiForbiddenResponse({type: ApiFailResultDto})` 를 함께 명시한다.
- `@ApiOperation` 은 `summary` 만.
- 응답 데코레이터는 `type` 만(❌ `description`): 200 `XResultDto`, 400 `ApiBadRequestResultDto`, 401/403/404/500 `ApiFailResultDto`.
- 데이터 반환 `@Post` 도 `@HttpCode(200)`, void 는 `@HttpCode(204)` + `@ApiNoContentResponse()`.

## 주석

- **모든 함수/메서드에 주석 필수** — controller/service/repository 뿐 아니라 util·seeder·store 등 레이어 무관 전부 JSDoc(또는 한 줄 설명, 반환 분기·부수효과 명시).
- controller 핸들러에 Swagger 데코레이터 필수.

근거: [user.controller.ts](../src/api/v1/user/user.controller.ts).
