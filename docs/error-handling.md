# Error & Response

전역 `CustomErrorFilter`(`@Catch(Error)`, [exception/exception.ts](../src/exception/exception.ts))가 모든 예외를 응답으로 변환한다. controller 는 throw 하지 않는다.

## 계층별 책임

| 계층 | 던지는 형태 |
|---|---|
| **repository** | 모든 메서드 try/catch. 최종 실패는 통일 500 `InternalServerErrorException({message: '서버에서 오류가 발생했습니다. 관리자에게 문의해주세요.'})`. insert/update 의 errno `1062`/`1452` 는 제약명별 `if` 분기로 `BadRequestException` 매핑 |
| **service** | 비즈니스 규칙 위반을 `BadRequestException`/`NotFoundException`/`UnauthorizedException`/`HttpException(…, HttpStatus.X)` 로 throw. body 는 `{message: '<한국어 문자열>'}` |
| **controller** | throw 하지 않음 (라우팅·위임만) |

## validationErrors 포함 기준

- **사용자 입력 필드(body/query/path) 오류만** `validationErrors` 포함.
- 비즈니스 규칙·서버 내부 생성값(JWT user_id, 시각 등) 오류는 `{message}` 단독.
- 예: `sign` 의 만 18세 제한은 입력 `birth` 에 귀속 → `validationErrors: createValidationError('birth', message)` 동봉([user.service.ts](../src/api/v1/user/user.service.ts)). 회원 미존재·토큰 무효 등은 `{message}` 단독.

```ts
// service — 입력 필드 귀속 오류 (validationErrors 동봉)
const message = '입력하신 정보로는 서비스 이용이 제한됩니다. 생년월일을 다시 확인해 주세요.';
throw new BadRequestException({ message, validationErrors: createValidationError('birth', message) });

// service — 비즈니스/내부 오류 (message 단독)
throw new NotFoundException({ message: '잘못된 로그인 정보입니다.' });
```

`createValidationError(property, message)` 는 `[{type, property, message}]` 형태를 반환([common/utils/validation.ts](../src/common/utils/validation.ts)).

## ValidationPipe (입력 검증 실패)

전역 `ValidationPipe`(main.ts)의 custom `exceptionFactory` 가 class-validator 오류를 `{validationErrors:[{type,property,message}], message}` 로 조립(`message` 는 첫 오류 메시지). `forbidNonWhitelisted: true`, `transform: true`.

## 응답 DTO 규칙

- **상태코드는 핸들러마다 `@HttpCode(200|204)` 명시**: 데이터 반환 `@Post` 도 200, void 는 204 + `@ApiNoContentResponse()`.
- Swagger 응답 데코레이터는 `type` 만(❌ `description`):
  - 200 `@ApiOkResponse({type: XResultDto})`
  - 400 `@ApiBadRequestResponse({type: ApiBadRequestResultDto})` — `validationErrors?` 동반 가능
  - 401/403/404/500 `ApiFailResultDto`(`{message}` 단독)
  - 공통 DTO: [common/dto/global.result.dto.ts](../src/common/dto/global.result.dto.ts).
- **응답 필드는 생략 금지 — 값 없으면 `null` 로라도 항상 포함**(응답 DTO 필드는 `x: T | null` 로 선언). 클라이언트가 키 존재를 항상 신뢰하도록.
