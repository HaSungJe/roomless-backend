# Error & Response

## 실패 본문은 하나

어느 경로(동기 HTTP · 큐 SSE)든, 어느 상태 코드든 클라이언트가 받는 실패 본문은 같은 모양이다.

```jsonc
// ApiFailResultDto
{
  "message": "이용이 제한된 계정입니다.",
  "validation_errors": null,          // 입력 필드 오류면 [{property, message}], 아니면 null
  "block_comment": "운영정책 위반"     // 기능별 추가 필드는 그대로 실린다
}
```

- 동기 경로: HTTP 상태 코드 + 위 본문.
- 큐 경로: SSE `event: failed` 의 data = `{status_code, ...위 본문}`.
- 정의: [global.result.dto.ts](../libs/common/src/dto/global.result.dto.ts) — `ValidationErrorResultDto {property, message}` · `ApiFailResultDto` · `FailResult {status_code, body}`.

## 변환은 `toFailResult()` 한 곳

[fail-result.ts](../libs/common/src/utils/fail-result.ts) 가 모든 예외를 전송 중립 `FailResult` 로 바꾼다. 두 인바운드 어댑터가 같은 함수를 쓰므로 service 는 어느 경로에서 호출됐는지 몰라도 된다.

| 예외 | status_code | body |
|---|---|---|
| `HttpException`(service · ValidationPipe · guard) | 그대로 | `{message, validation_errors ?? null, ...추가 필드}` — Nest 기본의 `statusCode` · `error` 는 버림, `message` 배열이면 첫 항목 |
| body-parser 크기 초과 | 413 | `PAYLOAD_TOO_LARGE_MESSAGE` — `'한 요청당 제한된 크기를 초과하였습니다. [최대 15Mb]'` <!-- TODO: 실제 한도와 맞지 않다 — main.ts 에 body 크기 설정이 없고(Express 기본), nginx gateway.conf 는 client_max_body_size 10m --> |
| 그 밖의 모든 예외 | 500 | `'요청이 실패했습니다. 관리자에게 문의해주세요.'` (내부 메시지 · stack 미노출) |

- HTTP: [CustomErrorFilter](../libs/common/src/exception/custom-error.filter.ts)(`@Catch()`)가 `res.status(status_code).send(body)`.
- RabbitMQ: [CommandDispatcher](../libs/messaging/src/command.dispatcher.ts)가 failed 결과 `{status_code, body}` 로 회신 → 게이트웨이가 SSE `failed`.
- 게이트웨이 동기 경로: [InternalHttpClient](../apps/gateway/src/modules/transport/internal-http.client.ts)가 서비스의 실패 응답을 같은 상태 코드 · 본문의 HttpException 으로 되던지므로, 게이트웨이 필터를 한 번 더 거쳐도 본문이 바뀌지 않는다.

## 계층별 책임

| 계층 | 던지는 형태 |
|---|---|
| **repository** | DB 를 실행하는 메서드는 모두 try/catch. 최종 실패는 통일 500 `InternalServerErrorException({message: SERVER_ERROR_MESSAGE})` — `'서버에서 오류가 발생했습니다. 관리자에게 문의해주세요.'`. 제약 위반은 `isUniqueViolation` · `isForeignKeyViolation` 으로 제약명별 `BadRequestException`. QueryBuilder 빌더 메서드는 실행하지 않으므로 try/catch 없음([data-layer.md](data-layer.md)) |
| **service** | 비즈니스 규칙 위반을 `BadRequestException` · `NotFoundException` · `UnauthorizedException` · `HttpException(…, HttpStatus.X)` 로. body `{message: '<한국어 문자열>'}` + 필요 시 추가 필드. 쓰기를 커밋한 채 알리는 실패만 throw 대신 **return**(인증번호 불일치 — 시도 횟수를 남긴다, user.service.ts `confirm*`) — 큐는 `CommandDispatcher`(failed + ack, 재시도 없음), 내부 HTTP 는 `ReturnedExceptionInterceptor`(다시 throw → `CustomErrorFilter`)가 같은 실패 본문으로 바꾼다 |
| **controller** | throw 하지 않음 (위임만, grep 0건). 큐 핸들러의 `requireActor()` 는 예외 — actor 없음을 401 `ACTOR_REQUIRED_MESSAGE` 로 던진다 |
| **crontab** (scheduler) | throw 하지 않음. 건별 실패는 catch 하고 건너뛴다 — 다음 회차에 다시 대상이 된다(apps/scheduler/src/user/crontabs/user-leave-cleanup.crontab.ts) |
| **게이트웨이 전달 계층** | 서비스 접속 실패 · 타임아웃(`INTERNAL_HTTP_TIMEOUT_MS`, 기본 10초) 503 `SERVICE_UNAVAILABLE_MESSAGE` — `'일시적으로 서비스를 이용할 수 없습니다. 잠시 후 다시 시도해주세요.'`, 서비스의 2xx 아닌 응답은 같은 상태 코드 · 본문의 `HttpException` 으로 다시 던진다. 브로커 연결 없음 503 `BROKER_UNAVAILABLE_MESSAGE` — `'일시적으로 요청을 접수할 수 없습니다. 잠시 후 다시 시도해주세요.'` |
| **guard** | JWT 실패 401 `'로그인 정보가 유효하지 않습니다.'`, 권한 403 `'접근 권한이 없습니다.'`, 내부 토큰 403 `'내부 요청만 허용됩니다.'` |

메시지 문구의 위치 — 인프라 · 공통 실패 메시지는 export 되는 `*_MESSAGE` 상수. 비즈니스 메시지는 한 곳에서만 쓰면 인라인 리터럴, 반복되거나 여러 파일이 쓰면 도메인 `<domain>.constants.ts` 의 export `*_MESSAGE`. 상세 [conventions.md](conventions.md).

## 4xx 와 5xx 의 의미

큐 경로는 상태 코드로 재시도 여부를 정한다. 그래서 다음을 지킨다.
- **4xx = 비즈니스 결과** — 같은 입력으로 다시 해도 같다. 즉시 failed 회신.
- **5xx = 인프라 장애** — 다시 하면 될 수 있다. 최대 3회 재시도 후 failed + DLQ.
- 비즈니스 규칙 위반을 500 으로 던지지 않는다(불필요한 재시도가 일어난다). DB 장애를 400 으로 감추지 않는다.

## validation_errors 기준

- **사용자 입력 필드(body/query/path)에 귀속되는 오류만** 목록으로 담는다. 그 밖은 `null`.
- ValidationPipe 오류는 `validationExceptionFactory` 가 `{message: 첫 오류 메시지, validation_errors: [{property, message}, ...]}` 로 만든다(main.ts · spec 공용).
- service 에서 입력 필드에 귀속되는 비즈니스 오류는 `createValidationError(property, message)` 로 담는다.

```ts
// 입력 birth 에 귀속 — validation_errors 동봉
throw new BadRequestException({message: UNDERAGE_MESSAGE, validation_errors: createValidationError('birth', UNDERAGE_MESSAGE)});

// 비즈니스 · 내부 오류 — message 단독 (validation_errors 는 toFailResult 가 null 로 채움)
throw new NotFoundException({message: '잘못된 로그인 정보입니다.'});

// 추가 필드
throw new HttpException({message: '이용이 제한된 계정입니다.', block_comment: user.block_comment}, HttpStatus.FORBIDDEN);
```

## 성공 응답

- 동기 핸들러는 `@HttpCode(200|204)` 명시(데이터 반환 `@Post` 도 200, void 는 204). 현재 동기 핸들러 7개 모두 200 — void 동기 핸들러 · `@HttpCode(204)` · `@ApiNoContentResponse` 는 아직 없다(미적용 규약).
- 큐 핸들러는 항상 200 `text/event-stream`, 결과는 `done` 이벤트의 data(void 면 `null`).
- **응답 필드는 생략 금지** — 값이 없으면 `null` 로 포함(`x: T | null`).
- 성공 DTO(`XResultDto`)는 HTTP 응답 본문이자 done 이벤트 data 로 그대로 쓰인다.
