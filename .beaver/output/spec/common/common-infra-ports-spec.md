---
# One-line feature summary
feature_goal: "공통 인프라 포트 — AWS 로 실제 연동하는 SMS 발송(SNS) · 파일 저장(S3) 포트와 목록 공통 페이지네이션을 뒤 Phase 들보다 먼저 깐다"

# Domain/module name
domain: "common"

# Entry-point — 공개 라우트 없음. 뒤 Phase 의 service 가 주입받는 아웃바운드 포트 2개 + 목록 API 가 쓰는 DTO · util
api_method: "포트 · DTO · util (공개 라우트 없음)"

# Path/signature
api_path: "SMS_SENDER.send({to, text}) · STORAGE_GATEWAY.createUploadUrl / exists / getPublicUrl / remove · PaginationDto · new Pagination({...}).getPagination()"

# Affected state — DB 쓰기 없음. 외부 쓰기: AWS SNS(SMS 발송) · S3(객체 업로드 주소 발급 · 삭제)
affected_data: []
---

## Feature Description

로드맵 Phase 3(유닛 #17 ~ #20). 뒤 Phase 대부분 — 계정 · 인증(5), 업체 입점 · 관리(8), 업체 운영 설정(10), 예약 · 결제(16), 이용(18) — 이 기다리는 공통 토대를 먼저 만든다.

1. **발송은 SMS 하나, AWS 계정으로** (사용자 결정 2026-10-20) — 이메일 · 알림톡 · 푸시는 쓰지 않는다. 아래 발송이 모두 `SmsSender` 포트를 거쳐 Amazon SNS 로 나간다.
   - 휴대폰 인증
   - 업체 총관리자 아이디 찾기, 업체 총관리자 · 일반회원 비밀번호 초기화
   - 업체 총관리자 계정 안내, 업체 측 예약 변경 안내
   - 입장 QR 링크
2. **파일 저장은 AWS S3** — 업체 · 객실 그룹 사진. 파일 본문은 서버를 거치지 않는다. 클라이언트가 S3 presigned URL 로 직접 올린다.
3. **mock · 가짜 어댑터는 두지 않는다** (사용자 결정 2026-10-20) — 처음부터 실제 AWS 에 붙는 코드다.
   - AWS 리소스 세팅(IAM · S3 버킷 · SMS 한도)은 사용자가 나중에 한다. 코드는 `.env` 의 AWS 값만 채우면 동작한다.
   - 세팅 방법은 가이드 문서 `docs/guides/aws-setup.md` 로 남긴다.
4. **외부 연동 공용 라이브러리** `libs/integration` — 포트 2개의 인터페이스 · Symbol 토큰 · AWS 어댑터 · 포트별 전역 모듈 `SmsModule` · `StorageModule`. 앱마다 쓰는 포트가 달라서(user-service 는 SMS 만) 모듈을 나눈다.
5. **공통 페이지네이션** — `.back` 의 `PaginationDto` · `Pagination` 을 이 프로젝트 규약으로 이식한다. 첫 목록 API(Phase 8 이후)부터 쓴다.

이번 범위에 사용처는 없다. 포트를 주입하는 첫 service 는 Phase 5(user-service 휴대폰 인증 · 비밀번호 초기화)이고, 그때 user-service 루트 모듈이 `SmsModule` 을 import 한다. `StorageModule` 은 사진을 다루는 Phase 10 에서 import 한다.

## Entry Point

공개 라우트 · 큐 명령은 없다. 진입점은 뒤 Phase 의 service 가 쓰는 포트 · DTO · util 이다.

- Method: 아웃바운드 포트 (Symbol 토큰 주입)
- Path:
  - `@Inject(SMS_SENDER) smsSender: SmsSenderInterface` → `send({to, text}): Promise<void>` — 구현 `SnsSmsSender`(Amazon SNS `Publish`)
  - `@Inject(STORAGE_GATEWAY) storage: StorageGatewayInterface` — 구현 `S3StorageGateway`
    - `createUploadUrl({key, content_type}): Promise<{upload_url, expires_at}>`
    - `exists(key): Promise<boolean>`
    - `getPublicUrl(key): string`
    - `remove(key): Promise<void>`
  - 목록 Query DTO `extends PaginationDto` → service 가 `new Pagination({...dto, total_count})` → `limit` · `offset` · `getPagination(): PaginationResultDto`
- Request:
  - `SmsMessage {to: string(국내 휴대폰 번호, 예: 01012345678), text: string}`
  - `StorageUploadInput {key: string, content_type: string}`
  - `PaginationDto {all_search_yn, page, size, page_size}` — 쿼리 문자열, 빠지면 생성자 기본값 `N · 1 · 20 · 10`
- Response:
  - `send` — void. AWS 가 접수하지 못하면 `ServiceUnavailableException({message: SMS_UNAVAILABLE_MESSAGE})`(503)
  - `createUploadUrl` — `StorageUploadResult {upload_url, expires_at}`. AWS 에 닿지 못하면 `ServiceUnavailableException({message: STORAGE_UNAVAILABLE_MESSAGE})`(503)
  - `getPagination()` — `PaginationResultDto {all_search_yn, total_count, page, max_page, page_range{start, end}, content_start_number, content_start_number_reverse}`

## Business Rules

**AWS 공통 설정 (`.env`)**
- `AWS_REGION` — 기본 `ap-northeast-2`(서울). 서울 리전은 SMS 를 지원한다.
- `AWS_ACCESS_KEY_ID` · `AWS_SECRET_ACCESS_KEY` — IAM 사용자 액세스 키. AWS SDK 기본 자격증명 체인이 환경변수에서 읽으므로 코드가 직접 넘기지 않는다. AWS(EC2 · ECS)에서 IAM 역할로 돌리면 비워 둔다.
- 값이 비어 있어도 부팅은 막지 않는다. 부팅 때 경고 로그를 한 번 남기고, 실제 발송 · 저장 요청만 실패한다(503, 공개 주소는 500). AWS 세팅 전에도 다른 기능을 개발할 수 있어야 하기 때문이다.
- AWS 를 쓰지 않는 게이트웨이에는 AWS 비밀값을 전달하지 않는다. `compose.gateway.yml` 에서 빈 값으로 덮는다(AGENTS.md "쓰지 않는 비밀값은 전달하지 않는다").

**SMS 발송 포트 — `SnsSmsSender`**
- 포트 메서드는 `send` 하나다. 국내 번호(`01012345678`, `010-1234-5678`)를 E.164(`+821012345678`)로 바꿔 SNS `Publish` 로 보낸다. 번호 변환은 순수 함수 `toE164KrPhone` 이다.
- SMS 유형은 `Transactional`(인증번호 · 안내용, 전달 우선) 이다.
- 한국은 AWS 에 전용 발신번호 · 발신자 ID 가 없다. 국제 경로로만 보낼 수 있다(AWS End User Messaging 국가 표 — South Korea: SMS number types Not supported, International sending Yes). 그래서 다음 세 가지가 따른다.
  - 수신 화면에 국제발신으로 표시된다.
  - 발신번호를 지정할 수 없다.
  - 한글은 70자 단위로 나뉘어 건마다 과금된다. 국내 업체의 장문(LMS)은 없다.
- 실패 계약은 503 이다. 형제 `RabbitMqConnection.publish` 가 연결이 없을 때 `ServiceUnavailableException({message: BROKER_UNAVAILABLE_MESSAGE})` 를 던지는 것(libs/messaging/src/rabbitmq.connection.ts:94-99)과 같은 분담이다. 어댑터가 AWS 오류를 로그로 남기고 503 으로 바꿔 던진다. 큐 경로에서는 5xx 라 재시도(최대 3회) 후 failed + DLQ 로 간다.
- 받는 번호 형식 검증은 입력 DTO 에서 한다(Phase 5). 어댑터는 다시 검증하지 않는다.

**파일 저장 포트 — `S3StorageGateway`**
- 버킷 `AWS_S3_BUCKET`, 공개 주소 기준 `AWS_S3_PUBLIC_URL`(버킷 주소 `https://<버킷>.s3.<리전>.amazonaws.com` 또는 CloudFront 주소). 공개 주소 기준이 비어 있으면 주소를 지어내지 않는다. `getPublicUrl` 이 "설정된 파일 공개 주소가 없습니다"(500)로 실패한다 (사용자 결정 2026-10-20, ship 리뷰 #3).
- 업로드는 presigned URL(`PutObject`)이다. 상태를 바꾸는 쓰기는 RabbitMQ 명령으로 가므로, 파일 본문을 게이트웨이 · 브로커로 흘리지 않는다.
  - Content-Type 을 서명 헤더에 넣는다(`signableHeaders: content-type`). 요청한 타입으로만 올릴 수 있다(ship 리뷰 #2).
  - S3 클라이언트는 체크섬을 필요할 때만 계산한다(`requestChecksumCalculation: 'WHEN_REQUIRED'`). SDK 기본값이면 presigned 주소에 빈 본문 CRC32 가 박혀 실제 업로드가 거부된다(ship 리뷰 #1).
- 흐름(Phase 10 · 12 에서 적용)은 네 단계다.
  1. 업로드 주소 요청(동기)
  2. 클라이언트가 `upload_url` 로 PUT(같은 `Content-Type` 헤더)
  3. 사진 등록 명령(키만 전달) → service 가 `exists(key)` 로 확인 후 저장
  4. 화면 표시는 `getPublicUrl(key)`
- 업로드 주소 유효시간은 `STORAGE_UPLOAD_URL_TTL_SECONDS`(600초) 다.
- `exists` 는 `HeadObject` 다. 404 면 false 를 돌려주고, 그 밖의 오류는 503 이다.
- `remove` 는 `DeleteObject` 다. S3 는 없는 키도 성공으로 답한다.
- 키 규칙(`store/<store_id>/<uuid>.<확장자>` 등)은 쓰는 도메인의 util 이 만든다. 포트는 받은 키를 그대로 쓴다.

**페이지네이션** (`.back/src/common/utils/pagination.ts` 이식)
- 기본값의 사양은 `PaginationDto` 생성자다: `all_search_yn = 'N'`, `page = 1`, `size = 20`, `page_size = 10`. 생성자 파라미터는 반드시 선택(`data?`)이다. `Pagination` 의 폴백은 안전망이며 같은 상수 `PAGINATION_DEFAULTS` 를 쓴다(docs/conventions.md:113).
- 쿼리 값은 문자열이라 `Pagination` 이 `parseInt` 로 읽는다(docs/conventions.md:130).
- 계산 규칙
  - `max_page = ceil(total_count / size)`, 0 이면 1.
  - `page` 가 1 보다 작으면 1, `max_page` 보다 크면 `max_page`.
  - `all_search_yn = 'Y'` 면 `page = 1`, `max_page = 1`, `size = total_count`. Y 가 아닌 값은 모두 N 이다.
  - `limit = size`, `offset = (page - 1) × size`.
  - `page_range` 는 page 가 속한 `page_size` 묶음이다. `end = ceil(page / page_size) × page_size`, `start = end - page_size + 1`, `end` 는 `max_page` 를 넘지 않는다.
  - `content_start_number = total_count - (page - 1) × size`, `content_start_number_reverse = 1 + (page - 1) × size`.
- `.back` 과 다른 점은 둘이다.
  - 숫자가 아닌 `total_count` 는 1 이 아니라 0 으로 본다.
  - `size` · `page_size` 가 0 이하면 기본값으로 본다. `.back` 은 0 으로 나눠 `max_page` 가 Infinity 가 됐다.
- `size` 상한은 두지 않는다(`.back` 과 같음). 목록마다 필요하면 그 Query DTO 가 제약을 둔다.

## Notes

- **포트 패턴 근거**:
  - Symbol 토큰은 `libs/messaging/src/messaging.symbols.ts:2`(`COMMAND_PUBLISHER = Symbol('CommandPublisherInterface')`) 를 따른다.
  - 인터페이스 파일은 `libs/messaging/src/interfaces/messaging.interface.ts:4` 를 따른다.
  - 전역 제공은 `libs/database/src/database.module.ts:17-25`(`@Global()` + providers · exports) 를 따른다.
  - 주입 측은 `apps/gateway/src/modules/transport/command-stream.service.ts:51`(`@Inject(COMMAND_PUBLISHER)`) 를 따른다.
- **외부 SDK 어댑터 형제**:
  - `RabbitMqConnection`(libs/messaging/src/rabbitmq.connection.ts) 이 형제다. 인프라 클래스로서 SDK 클라이언트를 갖고, 로그를 남기고, 실패를 503 으로 바꾼다.
  - 테스트는 `vi.hoisted` + `vi.mock('amqplib', ...)` 로 SDK 를 막는다(docs/testing.md:101 · 118). 같은 방식으로 `@aws-sdk/*` 를 막는다.
- **새 의존성**: `@aws-sdk/client-sns` · `@aws-sdk/client-s3` · `@aws-sdk/s3-request-presigner`. 2주 이상 된 최신 버전은 `3.1146.0`(2026-10-02) 이다.
- **새 라이브러리 배선**:
  - `tsconfig.json` `paths` 에 `@app/integration/*` 한 줄을 추가한다. 이것으로 Vitest(`vite-tsconfig-paths`, vitest.config.ts:6) · Nest 빌드가 같이 따라온다.
  - `nest-cli.json` 에는 라이브러리 항목이 없다(기존 lib 4개도 없음). `Dockerfile` 은 `COPY libs ./libs`(Dockerfile:18)로 통째 복사하고, 운영 의존성은 `npm ci --omit=dev` 로 들어간다. 따라서 둘 다 고칠 것이 없다.
- **compose** — 앱은 `env_file: .env` 로 `.env` 를 통째 받는다(compose.user-service.yml:50, compose.gateway.yml:36).
  - AWS 값은 세팅 전이라 비어 있을 수 있다. 그래서 `${VAR:?}` 필수로 걸지 않는다.
  - 게이트웨이에는 AWS 비밀값을 빈 값으로 덮는다(compose.gateway.yml:55-61 의 "쓰지 않는 비밀값" 블록).
- **util 형제 계약**:
  - libs/common util 은 결과 DTO 를 `new XResultDto()` + 할당으로 만든다(libs/common/src/utils/fail-result.ts:62, validation.ts:17). `getPagination()` 도 같은 방식을 쓴다.
  - 같은 라이브러리 import 는 libs/common 의 자기 alias(`@app/common/...`, fail-result.ts:2) 를 따른다.
- **`Pagination` 은 class** — docs/data-layer.md:158 이 "`Pagination` 이 `total_count` 로 `limit`/`offset` 을 산출" 하는 값 객체로 이미 정해 두었다. util 의 "named function" 규칙에서 이 하나만 예외로 AGENTS.md 에 적는다.
- **AWS SMS 운영 전 준비** — 가이드에 적는다.
  - 새 계정은 SMS 샌드박스에 있어서, 인증된 번호로만 보낼 수 있다.
  - 월 지출 한도는 기본 1달러다.
  - 운영 전에 콘솔에서 샌드박스 해제와 한도 상향을 요청해야 한다.
  - 한국행 단가는 공개 요금표에 없다. 발송 후 사용량 보고서로 확인한다.
- **영향받는 뒤 Phase** — 로드맵에서 이미 고쳤다.
  - 휴대폰 인증 상태 · 인증번호 저장(Phase 4 #21 · #22)
  - 가입 규칙 — 일반 가입 휴대폰 필수(#25)
  - 휴대폰 SMS 인증(#26)
  - SMS 아이디 찾기 · 비밀번호 초기화(#27)

## Proposals (Codebase-Based)

- [x] 외부 연동 포트를 `libs/common` 이 아니라 새 `libs/integration` 에 둔다.
  - `libs/common` 은 순수 util · 공통 DTO · 필터 · 가드다(docs/architecture.md:34). 외부 연동 어댑터는 로그 · lifecycle · AWS SDK 를 갖는다.
  - 브로커 연동이 자기 lib(`libs/messaging`)을 가진 선례가 있다.
- [x] 페이지 기본값을 상수 `PAGINATION_DEFAULTS` 하나로 두고 DTO 생성자와 `Pagination` 폴백이 같이 쓴다. `.back` 은 두 곳에 숫자를 따로 적고 주석으로만 "같게 맞춘다" 했다.
- [x] `SmsModule` · `StorageModule` 은 이번에 어느 앱에도 import 하지 않는다. 첫 사용처(Phase 5 · 10)에서 import 한다.

## Decisions

- [x] **발송 채널 = SMS만** (selected: user, 2026-10-20) — 이메일 · 알림톡 · 푸시 · 네이버 스마트알림 없음. QR 링크도 SMS.
- [x] **이메일이던 기능도 SMS로** (selected: user, 2026-10-20) — 업체 총관리자 아이디 찾기 · 비밀번호 초기화, 일반회원 비밀번호 초기화. 구현은 Phase 5 #27 이고, 이번 범위는 포트뿐이다.
- [x] **휴대폰 번호 · 인증** (selected: user, 2026-10-20) — 일반 가입은 휴대폰 필수, SNS 가입은 선택. 모든 회원(SNS 포함)은 가입 후 SMS 인증을 해야 이용할 수 있다. 구현은 Phase 4 #21 · #22, Phase 5 #25 · #26 이다. 네이버 로그인 전용안은 검토 후 채택하지 않았다.
- [x] **SMS 발송 = AWS 계정(Amazon SNS)** (selected: user, 2026-10-20) — 서울 리전.
- [x] **파일 저장 = AWS S3, 업로드는 presigned URL** (selected: user, 2026-10-20) — 파일 본문이 게이트웨이 · 브로커를 거치지 않는다.
- [x] **mock · 가짜 어댑터 없음, AWS 세팅은 나중에** (selected: user, 2026-10-20) — 코드는 `.env` 의 AWS 값으로 실제 연동하고, 세팅 방법은 가이드 md 로 남긴다. 값이 비어도 부팅은 막지 않고, 요청만 503 이다.
- [x] **포트 위치 = 새 `libs/integration`** (추천안 채택 — 근거는 Proposals 첫 항목) — alias `@app/integration/*`.
- [x] **SMS 포트 계약 = `send({to, text})` 하나 + 실패 503** (추천안 채택) — 형제 `RabbitMqConnection.publish` 의 503 분담을 따른다(rabbitmq.connection.ts:94-99).
- [x] **인증번호 생성 · 저장 · 검증은 Phase 4 · 5** (추천안 채택) — 회원 도메인 규칙(자릿수 · 유효시간 · 시도 제한)이라 공통 포트에 넣지 않는다. 규칙은 로드맵 Open Decisions "휴대폰 인증 규칙" 에 있다.
- [x] **TDD 케이스 = plan 의 `[CASES]`** (추천안 — 검토 때 빼거나 더할 수 있다) — 페이지네이션과 번호 변환은 입력→출력 계산형이라 TDD 대상이다. 근거는 stick §3.6 ①.
