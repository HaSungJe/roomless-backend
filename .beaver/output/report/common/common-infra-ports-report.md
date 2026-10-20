# Report — common-infra-ports

## Feature Summary
- **Feature**: 공통 인프라 포트 — AWS 로 실제 연동하는 SMS 발송(SNS) · 파일 저장(S3) 포트와 목록 공통 페이지네이션을 뒤 Phase 들보다 먼저 깐다
- **Entry point**: `포트 · DTO · util (공개 라우트 없음)` — `SMS_SENDER.send({to, text})` · `STORAGE_GATEWAY.createUploadUrl / exists / getPublicUrl / remove` · `PaginationDto` · `new Pagination({...}).getPagination()`
- **Domain**: common (로드맵 Phase 3 — 유닛 #17 ~ #20)
- **Plan**: [common-infra-ports-plan.md](../../plan/common/common-infra-ports-plan.md)

## Created/Modified/Deleted Files
| File | Change Type | Description |
|------|-----------|------|
| `libs/integration/src/integration.symbols.ts` | created | `SMS_SENDER` · `STORAGE_GATEWAY` |
| `libs/integration/src/integration.constants.ts` | created | `SMS_UNAVAILABLE_MESSAGE` · `STORAGE_UNAVAILABLE_MESSAGE` · `STORAGE_UPLOAD_URL_TTL_SECONDS`(600) |
| `libs/integration/src/interfaces/integration.interface.ts` | created | `SmsSenderInterface` · `SmsMessage` · `StorageGatewayInterface` · `StorageUploadInput` · `StorageUploadResult` |
| `libs/integration/src/integration.util.ts` | created | `toE164KrPhone` — 국내 번호 → `+82…` |
| `libs/integration/src/sms/sns-sms.sender.ts` | created | `SnsSmsSender` — SNS `Publish`(Transactional), 실패 503, `AWS_REGION` 비면 부팅 경고 |
| `libs/integration/src/sms/sms.module.ts` | created | `SmsModule`(`@Global`) |
| `libs/integration/src/storage/s3-storage.gateway.ts` | created | `S3StorageGateway` — presigned PutObject · HeadObject(404 → false) · DeleteObject · 공개 주소, 실패 503, `AWS_REGION`/`AWS_S3_BUCKET` 비면 부팅 경고 |
| `libs/integration/src/storage/storage.module.ts` | created | `StorageModule`(`@Global`) |
| `libs/integration/src/test/integration.util.spec.ts` | created | `[CASES:toE164KrPhone]` 5 |
| `libs/integration/src/sms/test/sns-sms.sender.spec.ts` | created | SNS 요청 모양 · 503 |
| `libs/integration/src/storage/test/s3-storage.gateway.spec.ts` | created | 서명 요청 모양 · 만료 시각 · 404/403 · 삭제 · 공개 주소 |
| `libs/common/src/dto/pagination.dto.ts` | created | `PAGINATION_DEFAULTS` · `PaginationDto` · `PageRangeResultDto` · `PaginationResultDto` |
| `libs/common/src/utils/pagination.ts` | created | `Pagination` · `PaginationInput` (`.back` 이식 — 숫자 아닌 총 개수 0, 0 이하 size · page_size 기본값) |
| `libs/common/src/utils/test/pagination.spec.ts` | created | `[CASES:Pagination]` 11 · `[CASES:PaginationDto]` 1 |
| `tsconfig.json` | modified | `paths` 에 `@app/integration/*` |
| `package.json` · `package-lock.json` | modified | `@aws-sdk/client-s3` · `@aws-sdk/client-sns` · `@aws-sdk/s3-request-presigner` `^3.1146.0` (npm install) |
| `.env.example` | modified | AWS 묶음 — `AWS_REGION=ap-northeast-2` · `AWS_ACCESS_KEY_ID` · `AWS_SECRET_ACCESS_KEY` · `AWS_S3_BUCKET` · `AWS_S3_PUBLIC_URL` |
| `compose.gateway.yml` | modified | 게이트웨이에 `AWS_ACCESS_KEY_ID` · `AWS_SECRET_ACCESS_KEY` 를 빈 값으로 덮음 |
| `README.md` | modified | 외부 연동(SNS · S3) 소개 · 스택에 AWS SDK · AWS 값은 필수 아님(비면 503) · 구조에 `libs/integration` · `docs/guides` |
| `docs/guides/aws-setup.md` | created | AWS 세팅 가이드 — S3 버킷 · 퍼블릭 정책 · CORS · CloudFront(선택) · SMS 샌드박스 · 한도 · 한국 발송 제약 · IAM 최소 권한 · `.env` · 확인 |
| `docs/integration.md` | created | 외부 연동 규약 (draft 표식 — ship 때 확정) |
| `AGENTS.md` | modified | 트리 `integration/` · 헥사고날 포트 · alias · util 목록(`pagination`, class 예외) · Query DTO 기본값 위치 · Pagination 자산 위치 · Repository DI · 전역 모듈 · 외부 연동 규약 묶음 · Testing mock 경계 · Checklist |
| `docs/architecture.md` | modified | 라이브러리 표(`libs/common` · 새 `libs/integration` 행) · 의존 방향 · 전역 모듈 |
| `docs/conventions.md` | modified | Query DTO 절 상태(`PaginationDto` 위치) · util 목록 + `Pagination` class 예외 |
| `docs/data-layer.md` | modified | Pagination 절 상태 · 쓰는 모양 한 줄 |
| `docs/testing.md` | modified | AWS 어댑터 행 · mock 경계에 외부 연동 포트 · 태그 `[CASES:<unit>]` |
| `.beaver/output/roadmap/roomless-roadmap.md` · `.html` | modified | Phase 3 build 완료 메모 (#17 ~ #20 은 in-progress, done 은 ship) |

## Tests Written
build 규약상 실행하지 않았다 — `/beaver:test` 에서 실행한다.

- `libs/common/src/utils/test/pagination.spec.ts`
  - `[CASES:Pagination]` 1 ~ 11 — 기본 · 쿼리 문자열 · 나누어떨어짐 경계 · 1 미만 page · max 초과 page · 0건 · 전체 조회 · Y/N 아닌 값 · 페이지 탭 묶음 · 숫자 아닌 값 · 0 이하 size/page_size
  - `[CASES:PaginationDto]` 12 — 인자 없음 · 일부 · `plainToInstance` 경로
  - 결과 DTO `toBeInstanceOf`
- `libs/integration/src/test/integration.util.spec.ts` — `[CASES:toE164KrPhone]` 5줄.
- `libs/integration/src/sms/test/sns-sms.sender.spec.ts`
  - `[SUCCESS]` PublishCommand input 전체 · 호출 1회
  - `[FAIL:infra]` 503 본문 · 호출 1회
- `libs/integration/src/storage/test/s3-storage.gateway.spec.ts`
  - createUploadUrl: 서명 인자(client · PutObjectCommand input · `{expiresIn: 600}`), 고정 시각 + 10분, 서명 실패 503
  - exists: HeadObject input, 404 → false, 403 → 503
  - remove: DeleteObject input, 실패 503
  - `[CASES:getPublicUrl]` 2 — CDN 주소 끝 `/` 제거, 버킷 기본 주소
  - env 3개는 저장 · 복원한다.
- 생략(plan 대로)
  - 모듈 배선 · 부팅 경고 로그 · 상수/타입 선언 · 설정 파일
  - `[FAIL:validation]` — 반려 분기 없음
  - `[SMOKE:data-access]` — 쿼리 변경 없음

## Verification
- **통과**: `npm run typecheck`(spec 포함), `npm run lint`(oxlint), `npx prettier --check libs/integration libs/common/src`. Prettier 가 고친 것은 줄바꿈 3곳뿐이다.
- **plan File List 대조**: 신규 · 수정 파일 전부 반영. 변경 없음으로 둔 `nest-cli.json` · `Dockerfile` · `vitest.config.ts` · 앱 루트 모듈 · `compose.user-service.yml` 은 손대지 않았다.
- **코드 = plan Design**: 차이는 Prettier 줄바꿈뿐이다. 가이드 · 규약 문서는 plan 의 문서 블록을 그대로 썼다.
- **기대값 손계산**: 케이스 1 · 2 · 5 · 6 · 9 를 코드 식으로 직접 계산해 맞췄다.
  - 케이스 1: `ceil(95/20)=5`, `rangeEnd = ceil(1/10)*10 = 10` → `{1, 5}`
  - 케이스 9: page 23 → `rangeEnd = 30` → `{21, 25}`
- **mock 없음**: `libs/integration` 에 mock · 가짜 어댑터가 없다. 어댑터는 실제 AWS SDK 클라이언트로만 보낸다.
- **AWS 값이 비어도 부팅 가능**: 클라이언트 생성자는 리전이 없어도 던지지 않는다(SDK 는 요청 시점에 리전을 확인). 부팅 경고는 `onApplicationBootstrap` 에서 로그만 남긴다.

## Remaining Issues
- **테스트 미실행** — `/beaver:test` 에서 `npm test` 를 돌린다. `docker compose -f compose.gateway.yml config` 도 그때 확인한다(이 명령은 `.env` 를 읽어 값을 출력하므로 build 에서 돌리지 않았다).
- **AWS 리소스 미세팅(사용자 몫)** — `docs/guides/aws-setup.md` 대로 IAM · 버킷 · SMS 샌드박스 해제 · 지출 한도를 맞추고 `.env` 를 채운다. 그 전까지 SMS · 파일 요청은 503 이다(사용처는 Phase 5 · 10 부터).
- **한국 SMS 제약** — AWS 는 한국에 전용 발신번호가 없어 국제 경로로만 보낸다.
  - 수신 화면에 국제발신으로 보이고, 한글 70자 단위로 과금된다.
  - 국내 업체로 바꿀 때는 `SmsModule` 의 `useClass` 만 바꾸면 된다.
- **`npm audit` 5건** — 이번에 생긴 것이 아니다. `@nestjs/mau`(직접 의존) → inquirer · undici · tmp 경로이고, AWS SDK 와 무관하다.
- **draft 규약 문서** — `docs/integration.md` 의 draft 표식은 ship 때 검증 후 뗀다.

## Change - 261020-1

ship 리뷰([main-review-261020.md](../../review/main-review-261020.md)) Findings #1 · #2 와, 사용자 결정으로 바꾼 #3 을 반영했다.

**Change summary**
- #1 (High) — `S3Client` 에 `requestChecksumCalculation: 'WHEN_REQUIRED'` 를 줬다. SDK 기본값이면 presigned PutObject 주소에 빈 본문 CRC32(`x-amz-checksum-crc32`)가 박혀 실제 업로드가 거부된다. 설치된 SDK 3.1146.0 으로 가짜 자격증명 로컬 서명을 해 보고 확인했다.
- #2 (Medium) — `getSignedUrl` 에 `signableHeaders: new Set(['content-type'])` 를 줬다. Content-Type 이 서명 헤더(`content-type;host`)에 들어가, 요청한 타입으로만 올릴 수 있다. 프론트는 같은 `Content-Type` 헤더로 PUT 해야 한다(가이드 · 규약에 명시).
- #3 (사용자 결정) — `getPublicUrl` 은 이제 `AWS_S3_PUBLIC_URL` 로만 주소를 만든다. 버킷 기본 주소를 지어내던 것을 없앴다. 비어 있으면 에러 로그를 남기고 `InternalServerErrorException({message: '설정된 파일 공개 주소가 없습니다. 관리자에게 문의해주세요.'})`(500)를 던진다. 부팅 경고 조건에도 `AWS_S3_PUBLIC_URL` 을 더했다.

**Changed files**

| File | Description |
|------|------|
| `libs/integration/src/storage/s3-storage.gateway.ts` | 체크섬 설정 · Content-Type 서명 · 공개 주소 필수 · 부팅 경고 조건 |
| `libs/integration/src/integration.constants.ts` | `STORAGE_PUBLIC_URL_MISSING_MESSAGE` 추가 |
| `libs/integration/src/interfaces/integration.interface.ts` | `getPublicUrl` 의 `@throws`, content_type 주석 |
| `libs/integration/src/storage/test/s3-storage.gateway.spec.ts` | 아래 Tests written |
| `.env.example` | `AWS_S3_PUBLIC_URL` 설명 — 버킷 주소 또는 CloudFront 주소, 비면 실패 |
| `docs/guides/aws-setup.md` | 같은 Content-Type 으로 PUT · `AWS_S3_PUBLIC_URL` 필수 예시 · 부팅 경고 문구 |
| `docs/integration.md` | "S3 클라이언트 설정" 절 · 실패 계약에 500 · **draft 표식 제거(확정)** |
| `README.md` | AWS 값 안내 — 공개 주소는 `AWS_S3_PUBLIC_URL` 필수 |
| spec · plan | 코드 · 문서 블록 · 테스트 · 응답 표를 실제와 맞췄다 |

**Tests written** (실행은 `/beaver:test`)

`s3-storage.gateway.spec.ts`:
- `[SUCCESS]` 클라이언트 설정 `{region, requestChecksumCalculation: 'WHEN_REQUIRED'}` 단언(가짜 `S3Client` 가 생성자 설정을 보관).
- `[SECURITY]` 서명 옵션 `{expiresIn: 600, signableHeaders: Set(['content-type'])}` 단언.
- `[CASES:getPublicUrl]` 2 — CDN 주소(끝 `/` 제거) · 버킷 주소를 설정값으로 넣은 경우.
- `[FAIL:infra]` `AWS_S3_PUBLIC_URL` 비움 → 500 본문 단언.
- 기존 "버킷 기본 주소" 케이스는 지웠다.

**Verification**
- `npm run typecheck` · `npm run lint` · `npx prettier --check` 를 아래 재리뷰에서 다시 돌렸다.
- 로컬 서명 실험으로 두 설정의 효과를 확인했다.
  - 체크섬 파라미터가 사라진다.
  - 서명 헤더가 `content-type;host` 가 된다.

**Remaining issues**
- 원본 Remaining Issues 중 "draft 규약 문서" 는 해소됐다(표식 제거). 나머지는 그대로다 — 테스트 미실행 · AWS 미세팅 · 한국 SMS 제약 · audit 5건.
