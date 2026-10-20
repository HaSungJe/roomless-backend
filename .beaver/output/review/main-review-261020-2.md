# Review — main — 261020-2

> ship 전 재리뷰. 1차 리뷰([main-review-261020.md](main-review-261020.md))의 Findings 를 고친 결과를 대조한다.

## Target
- mode: direct (worktree 없음) — branch: `main` → origin: `origin/main`
- 포함 작업: Phase 3 공통 인프라 포트(common-infra-ports — #17 ~ #20) + README 갱신 규칙(AGENTS.md)
- 이번 재리뷰 범위
  - 코드: `libs/integration/src/storage/s3-storage.gateway.ts` · `integration.constants.ts` · `interfaces/integration.interface.ts` · `storage/test/s3-storage.gateway.spec.ts`
  - 설정: `.env.example`
  - 문서: `docs/guides/aws-setup.md` · `docs/integration.md` · `README.md` · spec · plan · report

## Convention Check (against AGENTS.md)
| Item | Result | Notes |
|------|------|------|
| Naming | pass | 새 상수 `STORAGE_PUBLIC_URL_MISSING_MESSAGE` — 인프라 실패 메시지 `*_MESSAGE` 규약 |
| Structure & layering | pass | 변경은 어댑터 안에만 있다. 포트 시그니처는 그대로이고 `@throws` 만 더했다 |
| Errors & responses | pass | 외부 연결 실패 503 · 설정 누락 500(`InternalServerErrorException` + 상수 메시지). 어댑터가 원인을 로그로 남긴다(인프라 클래스 로깅) |
| Test strength | pass | 클라이언트 설정 · 서명 옵션 전체 단언, 500 본문 한국어 리터럴, `[SECURITY]` 태그. env 저장/복원 유지 |
| memory: mock 금지 · README 갱신 | pass | 공개 주소를 지어내지 않고 설정값만 쓴다. README AWS 안내를 갱신했다 |

## Data-Access Smoke Coverage
N/A — repository · 쿼리 변경 없음.

## Memory Reconcile
1차와 같다 — `미반영` 항목 없음.

## Draft Conventions
- `docs/integration.md` 를 코드와 다시 대조했다.
  - 파일 구성 · 모듈 · S3 클라이언트 설정(체크섬 · Content-Type 서명 · 공개 주소 필수) · 실패 계약(503 / `exists` 404 → false / `getPublicUrl` 500) · 테스트 방식이 일치한다.
- **draft 표식을 제거하고 확정했다.**

## Intended Behavior Check (against plan/spec)
- **#1** — `new S3Client({region, requestChecksumCalculation: 'WHEN_REQUIRED'})`(s3-storage.gateway.ts:16). 로컬 서명 실험에서 `x-amz-checksum-crc32` · `x-amz-sdk-checksum-algorithm` 이 사라지는 것을 확인했다. spec 은 생성자 설정을 단언한다.
- **#2** — `getSignedUrl(..., {expiresIn: 600, signableHeaders: new Set(['content-type'])})`. 로컬 서명 실험에서 서명 헤더가 `content-type;host` 인 것을 확인했다. spec `[SECURITY]` 가 옵션을 단언한다. 가이드 · 규약에 "같은 Content-Type 으로 PUT" 을 명시했다.
- **#3** — 사용자 결정대로, `AWS_S3_PUBLIC_URL` 이 비면 버킷 주소를 지어내지 않고 "설정된 파일 공개 주소가 없습니다"(500)로 실패한다. 부팅 경고 조건에 `AWS_S3_PUBLIC_URL` 을 더했다. `.env.example` · 가이드 · README · spec · plan 을 같은 뜻으로 맞췄다.
- 나머지(#17 SMS · #18 토대 · #20 Pagination)는 1차 대조 그대로 일치한다.
- spec · plan 의 코드 · 문서 블록은 실제 파일 내용으로 다시 맞췄다(plan 검증 통과). report 에 `## Change - 261020-1` 을 덧붙였다.
- 검사: `npm run typecheck` · `npm run lint` · `npx prettier --check libs/integration libs/common/src` 통과. 테스트 실행은 `/beaver:test` 에서 한다.

## Findings
| # | Severity | Location (path:line) | Description | Recommendation |
|---|--------|-----------------|------|------|
| — | — | — | 1차 #1 · #2 해소, #3 은 사용자 결정대로 처리. 새 Finding 없음 | — |

## Verdict
Pass — no issues. 커밋 → 푸쉬 → 로드맵 진척 커밋으로 진행한다.
