# API & Docs

Swagger 는 게이트웨이에만 있다(`/swagger`, `SWAGGER_PATH`). 서비스의 내부 API(`/internal/v1/...`)는 문서화하지 않는다.

## 클래스

```ts
@ApiTags('회원')
@Controller('/api/v1/user')
export class UserController { ... }
```

`@ApiTags('<한글>')` → `@Controller(...)`.

## 동기 핸들러

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

순서: **HTTP verb → `@UseGuards` → `@Roles` → `@HttpCode` → `@ApiBearerAuth`(인증 시) → `@ApiOperation({summary})` → `@ApiBody` → `@ApiOkResponse`/`@ApiNoContentResponse` → `@ApiBadRequestResponse` → `@ApiUnauthorizedResponse`/`@ApiForbiddenResponse`/`@ApiNotFoundResponse` → `@ApiServiceUnavailableResponse` → `@ApiInternalServerErrorResponse`**.

## 큐 핸들러 (요청 단위 SSE)

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

- `@HttpCode` 없음(스트림이 200 을 직접 연다). `@ApiProduces('text/event-stream')` 필수.
- `@ApiOkResponse({type: X})` 는 **done 이벤트의 data** 를 뜻한다. 결과가 void 면 생략.
- 에러 응답 데코레이터는 스트림이 열리기 전의 실패(400 검증 · 401 · 503)와 failed 이벤트의 `status_code` 를 함께 나타낸다.
- 시그니처: `@PassportActor()`(인증 시) → `@Body()` → `@Ip()` → `@Res()`. 본문은 `dispatch` 한 줄.

## 권한 제한 핸들러

```ts
@Post('/register')
@UseGuards(PassportJwtAuthGuard, RolesGuard)   // 인증 → 권한 순
@Roles('SUPER_ADMIN', 'ADMIN')                 // t_auth PK 문자열
```

권한 불일치는 `RolesGuard` 가 403 `{message: '접근 권한이 없습니다.'}` — `@ApiForbiddenResponse({type: ApiFailResultDto})` 를 함께 명시.

## 공통 규칙

- `@ApiOperation` 은 `summary` 만. 응답 데코레이터는 `type` 만(❌ `description`).
- 실패 응답은 상태와 무관하게 `ApiFailResultDto` 하나.
- **모든 함수/메서드에 주석 필수** — controller · handler · service · repository · util · 테스트 도우미까지 JSDoc 또는 한 줄 설명(반환 분기 · 부수효과 명시).
- 큐 경로 API 를 추가하면 Swagger 설명(`main.ts` 의 DocumentBuilder description)에 적힌 이벤트 규약을 따른다: accepted → done | failed | pending.

## CORS

게이트웨이는 `CORS_ORIGINS`(쉼표 구분, `*` = 전체)에 적힌 프론트 주소만 허용한다. 비우면 다른 출처의 브라우저 요청을 모두 막는다. 메서드는 `GET,HEAD,PUT,PATCH,POST,DELETE`, 헤더는 전체 허용, preflight 는 204. 인증은 Authorization 헤더라 쿠키 자격증명은 허용하지 않는다. 설정: [cors.config.ts](../apps/gateway/src/config/cors.config.ts).

## 클라이언트(Next.js) 참고

```ts
const res = await fetch('/api/v1/user/sign', {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify(dto)});
if (!res.headers.get('content-type')?.includes('text/event-stream')) throw await res.json();  // 400 · 503 등
for await (const ev of parseSse(res.body!)) {
    if (ev.event === 'done') return ev.data;
    if (ev.event === 'failed') throw ev.data;          // {status_code, message, validation_errors, ...}
    if (ev.event === 'pending') return refetchLater(); // 처리 중 — 리소스 재조회
}
```
