# Review — main — 261020

> ship 전 코드리뷰. 누적 변경을 memory 규칙 · AGENTS.md 규약 · 기획 의도에 대조한다.

## Target
- mode: direct (worktree 없음) — branch: `main` → origin: `origin/main`
- 포함 작업: Phase 3 공통 인프라 포트(common-infra-ports — #17 ~ #20) + README 갱신 규칙(AGENTS.md)
- 변경 범위
  - 수정 13 · 신규 11 (`libs/integration/` 10파일 포함)
  - 코드 · 테스트: `libs/integration/**` · `libs/common/src/{dto,utils}/pagination*`
  - 설정: `tsconfig.json` · `package*.json` · `.env.example` · `compose.gateway.yml`
  - 문서: `AGENTS.md` · `README.md` · `docs/*` 6 · `.beaver/output/*`

## Convention Check (against AGENTS.md)
| Item | Result | Notes |
|------|------|------|
| Naming | pass | 인프라 `<kebab>.<role>.ts`(`sns-sms.sender.ts` · `s3-storage.gateway.ts` · `sms.module.ts`), 토큰 `Symbol('<Interface>')`, 인터페이스 `interfaces/integration.interface.ts`(messaging 형제), DTO `pagination.dto.ts` |
| Structure & layering | pass | 포트(Symbol + 인터페이스) / 어댑터 / `@Global` 모듈 분리. 라이브러리 안 import 상대경로(messaging 방식), libs/common 은 자기 alias(fail-result.ts 방식) |
| Shared logic extraction | pass | `toE164KrPhone` 은 `integration.util.ts` named function, 파일 전용 헬퍼(`isNotFound` · `toUnavailable` · `toInt` · `toPageRange`)는 인프라 · util 파일에만. `Pagination` class 예외는 AGENTS.md 에 명시 |
| Errors & responses | pass | 외부 실패 → 503 + `*_MESSAGE` 상수(형제 `RabbitMqConnection.publish`), 밖으로 나가는 키 snake_case(`upload_url` · `expires_at` · `content_type`), 결과 DTO `new` + 할당(util 형제) |
| Logging | pass | 인프라 클래스만 `new Logger(X.name)`, `console.*` 0건 |
| Comments | pass | 모든 함수 · 메서드 · spec 도우미에 JSDoc |
| Test strength | pass | 입력 전체 단언(`PublishCommand.input` · 서명 인자) · 호출 횟수 · 503 본문 한국어 리터럴 · 분류 태그 · env 저장/복원. 계산형은 `[CASES]` |
| memory: mock 금지 | pass | `libs/integration` 에 mock · 가짜 어댑터 0건 — 실제 SDK 어댑터 + `docs/guides/aws-setup.md` |
| memory: README 갱신 | pass | README 에 외부 연동 · 스택 · AWS 값 · 구조 반영 |
| memory: .beaver/output 커밋 포함 | pass | spec · plan · report · review 를 함께 커밋 |

## Data-Access Smoke Coverage
N/A — repository · 쿼리 변경 없음.

## Memory Reconcile
- `git` · `api-log` — `not needed`(운영 결정). 이전 대상 아님.
- `docs`(README 갱신) — 이번 세션에 사용자 승인으로 AGENTS.md 주의사항 · Checklist 로 이전했다. 조항 3개를 대조했고 `_archived/docs.md` 로 보관했다.
- `미반영` 항목 없음.

## Draft Conventions
- `docs/integration.md`(beaver:draft) 와 코드를 대조했다.
  - 파일 구성 · 모듈 이름 · 실패 계약(503, `exists` 만 404 → false) · 테스트 방식은 일치한다.
  - 아래 Finding #1 · #2 를 고치면 S3 클라이언트 설정 한 줄을 문서에 더해야 한다.
  - 표식 제거는 수정 후 재리뷰에서 한다.

## Intended Behavior Check (against plan/spec)
- #17 SMS: 국내 번호 E.164 변환 · Transactional · 실패 503 · 리전 비면 부팅 경고 — 일치.
- #18 토대: alias · `SmsModule`/`StorageModule` · AWS SDK 3개 · `.env.example` · 게이트웨이 AWS 비밀값 차단 · 가이드 · 규약 문서 — 일치.
- #19 S3: 메서드 4개 · 404 → false · 503 은 plan 과 일치한다. **다만 presigned 업로드가 실제로 동작하지 않는다**(#1). Content-Type 고정도 plan 의도와 다르다(#2).
- #20 Pagination: `.back` 이식 + 의도한 차이 2개(숫자 아닌 총 개수 0, 0 이하 size/page_size 기본값) — 일치. 케이스 1 · 2 · 5 · 6 · 9 손계산 일치.
- 확인 방법: 설치된 `@aws-sdk/client-s3@3.1146.0` 으로 가짜 자격증명을 써서 로컬 서명만 해 봤다(네트워크 호출 없음).
  - 기본 설정이면 쿼리에 `x-amz-checksum-crc32` · `x-amz-sdk-checksum-algorithm` 이 붙는다. 서명 헤더는 `host` 뿐이다.
  - `requestChecksumCalculation: 'WHEN_REQUIRED'` 를 주면 체크섬 파라미터가 사라진다.
  - `signableHeaders: new Set(['content-type'])` 를 주면 서명 헤더가 `content-type;host` 가 된다.

## Findings
| # | Severity | Location (path:line) | Description | Recommendation |
|---|--------|-----------------|------|------|
| 1 | High | `libs/integration/src/storage/s3-storage.gateway.ts:15` | SDK 기본값(flexible checksum)이라 presigned PutObject 주소에 **빈 본문의 CRC32 체크섬**이 박힌다. 클라이언트가 실제 파일을 올리면 체크섬이 맞지 않아 S3 가 거부한다. 즉 사진 업로드가 실제로 동작하지 않는다. spec 은 SDK 를 mock 해서 잡지 못한다 | `new S3Client({region, requestChecksumCalculation: 'WHEN_REQUIRED'})`. spec 에 클라이언트 설정 단언을 추가하고, `docs/integration.md` 에 이유를 한 줄 남긴다 |
| 2 | Medium | `libs/integration/src/storage/s3-storage.gateway.ts:35` | `ContentType` 이 서명 헤더에 들어가지 않는다(signed: `host`). 그래서 인터페이스 주석 · spec · plan 의 "다른 타입으로는 올릴 수 없다" 가 사실이 아니다. 공개 버킷에 아무 타입(예: `text/html`)이나 올릴 수 있다 | `getSignedUrl(..., {expiresIn, signableHeaders: new Set(['content-type'])})`. 클라이언트는 같은 `Content-Type` 헤더로 PUT 해야 한다(가이드 · 규약에 명시). spec 의 서명 옵션 단언을 고친다 — `[SECURITY]` |
| 3 | Low | `libs/integration/src/storage/s3-storage.gateway.ts:72` | `AWS_S3_BUCKET` · `AWS_REGION` 이 비어 있으면 `getPublicUrl` 이 `https://undefined.s3.undefined.amazonaws.com/<키>` 를 만든다. AWS 세팅 전에만 생기고 부팅 경고가 이미 있다. 사용처는 Phase 10 부터다 | 이번에는 그대로 둔다. 사용처가 생길 때 다시 본다 |

## Verdict
**Changes needed** — #1(High) · #2(Medium) 은 `/beaver:build` 로 고친 뒤 재리뷰(`main-review-261020-2.md`)를 거쳐 커밋한다. #3 은 남긴다.
