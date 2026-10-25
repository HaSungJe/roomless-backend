# API & Docs

Swagger 는 게이트웨이에만 있다(`SWAGGER_PATH` 기본 `/swagger`, 제목 `SWAGGER_TITLE`, bearer 인증). 서비스의 내부 API(`/internal/v1/...`)는 문서화하지 않는다(내부 controller 의 Swagger import 0건).

## 클래스

```ts
@ApiTags('회원')
@Controller('/api/v1/user-service/user')
export class UserController { ... }
```

`@ApiTags('<한글>')` → `@Controller(...)`.

게이트웨이 공개 controller 는 전달 경로별로 2파일이다 — 동기 `controllers/<domain>.controller.ts`(`UserController`), 큐 `controllers/<domain>.controller.queue.ts`(`UserQueueController`). 둘 다 같은 `@ApiTags` · 경로 접두를 쓰므로 Swagger 에는 한 태그로 묶여 보인다.

## 동기 핸들러 (`controllers/<domain>.controller.ts`)

```ts
@Post('/login')
@HttpCode(200)
@ApiOperation({summary: 'SNS 로그인'})
@ApiBody({type: UserLoginDto})
@ApiOkResponse({type: UserLoginResultDto})
@ApiBadRequestResponse({type: ApiFailResultDto})
@ApiForbiddenResponse({type: ApiFailResultDto})
@ApiNotFoundResponse({type: ApiFailResultDto})
@ApiServiceUnavailableResponse({type: ApiFailResultDto})
@ApiInternalServerErrorResponse({type: ApiFailResultDto})
async login(@Body() dto: UserLoginDto, @Ip() ip: string): Promise<UserLoginResultDto> {
    return this.internalHttp.request<UserLoginResultDto>('user', 'POST', USER_INTERNAL_PATH.LOGIN, {body: dto, client_ip: ip});
}
```

- 실측 순서(인증 없는 핸들러 — 그룹별 로그인 · 재발급 6개): **HTTP verb → `@HttpCode(200)` → `@ApiOperation({summary})` → `@ApiBody` → `@ApiOkResponse` → `@ApiBadRequestResponse` → `@ApiUnauthorizedResponse` 또는 `@ApiForbiddenResponse` → `@ApiNotFoundResponse` → `@ApiServiceUnavailableResponse` → `@ApiInternalServerErrorResponse`**.
- 인증이 붙는 동기 핸들러(store 조회 · 업로드 주소 — store.controller.ts): HTTP verb → `@UseGuards`(그 그룹의 가드) → `@Roles`(그룹 안 권한 시 — 사례 없음) → `@HttpCode(200)` → `@ApiBearerAuth()` → `@ApiOperation` → `@ApiBody`(입력 시) → `@ApiOkResponse` → 에러 응답들.
- **목록(GET + `@Query()`)** — 컨트롤러가 Query DTO 를 `new` 로 만들어 `query` 옵션으로 넘긴다([conventions.md](conventions.md) "Query DTO"). `InternalHttpClient` 는 undefined · null 값을 빼고 쿼리 문자열로 붙인다. 파라미터가 있는 경로는 contracts 의 경로 함수를 쓴다.

```ts
@Get('/application/mine')
@UseGuards(PassportJwtAuthGuard)
@HttpCode(200)
@ApiBearerAuth()
@ApiOperation({summary: '내 입점 신청 목록'})
@ApiOkResponse({type: StoreMyApplicationListResultDto})
@ApiBadRequestResponse({type: ApiFailResultDto})
@ApiUnauthorizedResponse({type: ApiFailResultDto})
@ApiServiceUnavailableResponse({type: ApiFailResultDto})
@ApiInternalServerErrorResponse({type: ApiFailResultDto})
async getMyApplicationList(@PassportActor() actor: Actor, @Query() query: StoreMyApplicationListDto): Promise<StoreMyApplicationListResultDto> {
    const dto = new StoreMyApplicationListDto(query);
    return this.internalHttp.request<StoreMyApplicationListResultDto>('admin', 'GET', STORE_INTERNAL_PATH.MY_APPLICATION_LIST, {actor, query: dto});
}
```

## 큐 핸들러 (`controllers/<domain>.controller.queue.ts`, 요청 단위 SSE)

```ts
@Delete('/leave')
@UseGuards(PassportJwtAuthGuard)
@ApiBearerAuth()
@ApiOperation({summary: '회원 탈퇴 신청'})
@ApiBody({type: UserLeaveDto})
@ApiProduces('text/event-stream')
@ApiBadRequestResponse({type: ApiFailResultDto})
@ApiUnauthorizedResponse({type: ApiFailResultDto})
@ApiNotFoundResponse({type: ApiFailResultDto})
@ApiServiceUnavailableResponse({type: ApiFailResultDto})
@ApiInternalServerErrorResponse({type: ApiFailResultDto})
async leave(@PassportActor() actor: Actor, @Body() dto: UserLeaveDto, @Ip() ip: string, @Res() res: Response): Promise<void> {
    await this.commandStream.dispatch(res, {type: USER_COMMAND.LEAVE, actor, payload: dto, client_ip: ip});
}
```

- 순서: HTTP verb → `@UseGuards`(인증 시, 그 그룹의 가드) → `@Roles`(그룹 안 권한 시 — 사례 없음) → `@ApiBearerAuth()`(인증 시) → `@ApiOperation` → `@ApiBody`(입력 있을 때) → `@ApiProduces('text/event-stream')` → `@ApiOkResponse` → 에러 응답들(`@ApiForbiddenResponse` 는 `@ApiUnauthorizedResponse` 뒤).
- `@HttpCode` 없음(스트림이 200 을 직접 연다). `@ApiProduces('text/event-stream')` 필수.
- `@ApiOkResponse({type: X})` 는 **done 이벤트의 data** 를 뜻한다. 결과가 void 면 생략.
- 에러 응답 데코레이터는 스트림이 열리기 전의 실패(400 검증 · 401 · 503)와 failed 이벤트의 `status_code` 를 함께 나타낸다.
- 시그니처 세 형태(인증 + 입력 / 비인증 `actor: null` / 입력 없음 `payload: {}`) — [conventions.md](conventions.md). 본문은 `dispatch` 한 줄.

## 로그인 그룹(도메인) · 인증 가드

**경로 규칙** — 공개 `/api/v1/<service>/<domain>/<action>` · 내부 `/internal/v1/<service>/<domain>/<action>` — service 는 서비스 앱(`user-service` · `admin-service`), domain 은 그 앱의 도메인 폴더. 로그인 그룹은 경로가 아니라 게이트웨이 가드로 가른다. 게이트웨이 폴더도 같은 모양(`api/v1/<service>/<domain>/`)이다. 로그인 그룹마다 도메인 · 서비스가 따로다.

| 그룹 · 서비스 | 접두 · 폴더 | 동기(내부 HTTP) | 큐(SSE) |
|---|---|---|---|
| 이용자 `USER` · user-service | `/api/v1/user-service/user` · `api/v1/user/` | `POST /login`(SNS) · `/token-refresh` → `/internal/v1/user-service/user/*` | `POST /sign` · `DELETE /leave` · `PATCH /leave` · `POST /phone-verification(+/confirm)` · `/find-login-id(+/confirm)` — `user.member.*` |
| 매니저 `MANAGER` · admin-service | `/api/v1/admin-service/manager` · `api/v1/manager/` | `POST /login` · `/token-refresh` → `/internal/v1/admin-service/manager/*` | `PATCH /password` · `POST /find-login-id(+/confirm)` · `/password-reset(+/confirm)` — `admin.manager.*` |
| 관리자 `ADMIN` · admin-service | `/api/v1/admin-service/admin` · `api/v1/admin/` | `POST /login` · `/token-refresh` → `/internal/v1/admin-service/admin/*` | `PATCH /password` — `admin.admin.*` |

로그인이 필요한 라우트는 **그 그룹의 인증 가드**를 붙인다(apps/gateway/src/api/v1/admin-service/admin/controllers/admin.controller.queue.ts).

```ts
@Patch('/password')
@UseGuards(PassportJwtAdminAuthGuard)   // 관리자 그룹 토큰만 — 다른 그룹 토큰은 401
@ApiBearerAuth()
```

- 그룹 가드는 그 그룹의 서비스 auth-user 가 돌려준 회원을 `request.user` 로 둔다. 다른 그룹 토큰은 그 auth-user 가 404 를 돌려줘 401 이 된다 — 그래서 그룹 전체에 열린 라우트에는 `RolesGuard` · `@Roles` 를 붙이지 않는다.
- **그룹 안에서 권한을 더 좁힐 때(미적용 규약)**: `@UseGuards(PassportJwtManagerAuthGuard, RolesGuard)` + `@Roles(AUTH_ID.HEAD_MANAGER)`(`libs/contracts/src/roles.ts`) — 불일치는 `RolesGuard` 가 403 `{message: '접근 권한이 없습니다.'}`(`FORBIDDEN_MESSAGE`), `@ApiForbiddenResponse({type: ApiFailResultDto})` 를 함께 명시. 메타데이터가 없으면 통과한다.
- 같은 일이라도 도메인마다 DTO · 명령 · 내부 경로를 따로 둔다(`ManagerPasswordDto` + `admin.manager.password` / `AdminPasswordDto` + `admin.admin.password`).

## 공통 규칙

- `@ApiOperation` 은 `summary` 만. 응답 데코레이터는 `{type}` 만(❌ `description` — grep 0건).
- 실패 응답은 상태와 무관하게 `ApiFailResultDto` 하나.
- **모든 함수/메서드에 주석 필수** — export 여부와 관계없이 controller · service · repository · util · 파일 전용 헬퍼 · 테스트 도우미까지 JSDoc 또는 한 줄 설명(반환 분기 · 부수효과 명시). 생성자는 `@param` 만.
- **service 메서드 JSDoc 에는 전송 경로를 적는다** — `(RabbitMQ: user.member.sign)` / `(내부 HTTP: POST /internal/v1/user-service/user/login)`.
- DTO 클래스 · 포트 인터페이스 메서드의 JSDoc 은 현재 섞여 있다(있는 것 · 없는 것). <!-- TODO: 필수로 할지 결정 -->
- 큐 경로 API 를 추가하면 Swagger 설명(`main.ts` 의 DocumentBuilder description)에 적힌 이벤트 규약을 따른다: accepted → done | failed | pending.

## CORS

게이트웨이는 `CORS_ORIGINS`(쉼표 구분, `*` = 전체)에 적힌 프론트 주소만 허용한다. 비우면 다른 출처의 브라우저 요청을 모두 막는다. 메서드는 `GET,HEAD,PUT,PATCH,POST,DELETE`, 헤더는 전체 허용, preflight 는 204. 인증은 Authorization 헤더라 쿠키 자격증명은 허용하지 않는다. 설정: [cors.config.ts](../apps/gateway/src/config/cors.config.ts).

## 클라이언트(Next.js) 참고

```ts
const res = await fetch('/api/v1/user-service/user/sign', {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify(dto)});
if (!res.headers.get('content-type')?.includes('text/event-stream')) throw await res.json();  // 400 · 503 등
for await (const ev of parseSse(res.body!)) {
    if (ev.event === 'done') return ev.data;
    if (ev.event === 'failed') throw ev.data;          // {status_code, message, validation_errors, ...}
    if (ev.event === 'pending') return refetchLater(); // 처리 중 — 리소스 재조회
}
```
