# controller

## 게이트웨이 공개 controller 는 전달 경로별로 파일을 나눈다

- Rule:
  1. 동기(내부 HTTP) 라우트는 `apps/gateway/src/api/v1/<domain>/<domain>.controller.ts` 의 `<Domain>Controller` 에 둔다 — `InternalHttpClient` 만 주입.
  2. 큐(RabbitMQ 명령 + 요청 단위 SSE) 라우트는 같은 폴더의 `<domain>.controller.queue.ts` 의 `<Domain>QueueController` 에 둔다 — `CommandStreamService` 만 주입.
  3. 한 파일에 두 경로를 섞지 않는다. 둘 다 같은 `@ApiTags` · `@Controller('/api/v1/<domain>')` 를 쓰고, 도메인 모듈 `controllers` 에 `[동기, 큐]` 순으로 등록한다.
  4. 테스트도 `test/<domain>.controller.spec.ts` · `test/<domain>.controller.queue.spec.ts` 로 나누고, 다른 경로의 라우트가 404 인지 단언한다.
  - user-service 는 이미 controller(내부 HTTP) · handler(RabbitMQ `@OnCommand`)로 나뉘어 있어 대상이 아니다.
- Scope: global (게이트웨이 공개 라우트)
- Rationale: User feedback 2026-10-19 — "컨트롤러 분리를 해야할듯. user-controller에서 두개로 분리. HTTP통신은 user-controller에 넣고, 큐로 통신하는건 user-controller.queue.ts로. 이건 프로젝트 룰로 고정해야할듯". 파일명은 기존 레이어 명명(`user.controller.ts`)에 맞춰 `user.controller.queue.ts` 로 적용.
- CLAUDE.md application: applied(CLAUDE.md "Conventions" · "API & Docs" · "메시징" · Checklist + docs/conventions.md · api.md · architecture.md · testing.md)
- Priority: takes precedence over CLAUDE.md/defaults
