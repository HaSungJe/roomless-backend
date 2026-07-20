---
# One-line feature summary
feature_goal: "다국어(i18n) 기능 전체 제거 — 신규 개발을 다국어 없이 시작할 수 있도록 기반 정리"

# Domain/module name
domain: "common"

# Entry-point method/endpoint — 횡단(cross-cutting) 변경: 신규 엔드포인트 없음, 기존 user 5개 API의 메시지 처리 방식 변경
api_method: "N/A (횡단 변경 — 기존 POST/DELETE/PATCH /api/v1/user/* 유지)"

# Path/signature
api_path: "N/A"

# Affected state — DB 쓰기 변경 없음 (메시지 문자열 처리 방식만 변경)
affected_data: []
---

## Feature Description

`nestjs-i18n` 기반 다국어 인프라 전체(언어팩 yaml 3개 언어 21개, `translate`/`i18nMsg` 헬퍼, `Accept-Language` 해석, 언어 상수, Swagger 언어 헤더 데코레이터, 빌드 시 언어팩 복사 스크립트, BullMQ Worker 언어 복원)를 소스에서 제거한다. 사용자 노출 메시지는 **한국어 리터럴 문자열 인라인**으로 대체한다. 이후 신규 도메인(객실/예약/결제 등)은 다국어 없이 개발을 시작한다.

## Entry Point

- Method: 변경 없음 — 기존 user 도메인 5개 API 유지 (sign/login/token-refresh/leave/leave 철회)
- Path: 변경 없음
- Request: 변경 없음 — 단, `Accept-Language` 헤더는 더 이상 해석되지 않음 (Swagger 표기도 제거)
- Response: 구조 변경 없음 — `message` 필드가 언어 협상 없이 항상 한국어 고정

## Business Rules

- 모든 `translate('<key>')` 호출(service 11곳 + repository 16곳)은 ko 언어팩의 한국어 문자열 리터럴로 치환 — 호출 줄의 기존 ko 주석과 동일 값.
- 모든 DTO `message: i18nMsg('<key>')`(22곳)는 `message: '<한국어 문자열>'` 리터럴로 치환.
- `user-nickname.dto.ts` 의 키(`user.dto.nickname.*`)는 ko yaml 에 항목이 없어 현재 런타임에서 빈 문자열을 반환하는 잠복 버그 상태 — 주석에 병기된 한국어 문자열을 리터럴로 채택(버그 동시 해소).
- BullMQ Worker 의 요청 언어 복원(`fallbackLangStore`, `job.data.lang`, dispatch 의 `I18nContext.current()?.lang`)은 다국어 전용이므로 제거 — `queueProcessingContext.run` 만 남긴다.
- 기능 동작(상태코드·분기·DB 쓰기)은 일절 변경하지 않는다. 기존 spec 5종(+인프라 spec)이 회귀 게이트.
- 제거 후 `src/` 에 `i18n|translate|i18nMsg|loadKoPack|Accept-Language` 잔존 0건.

## Notes

- 삭제/수정 대상 전수 (이번 세션 스캔 근거, 이후 소스 변경 없음 확인):
  - 의존성: `nestjs-i18n` (package.json dependencies)
  - 언어팩: `src/i18n/**` 21개 yaml (ko/en/ja × common/user)
  - 헬퍼: [src/common/i18n/translate.ts](../../../../src/common/i18n/translate.ts), [src/common/i18n/i18n.config.ts](../../../../src/common/i18n/i18n.config.ts), [src/common/i18n/test-utils/load-ko-pack.ts](../../../../src/common/i18n/test-utils/load-ko-pack.ts)
  - 언어 상수: `src/common/language/language.constants.ts` (유일 사용처 = ApiLanguageHeader)
  - 데코레이터: `src/common/decorators/api-language-header.decorator.ts`
  - 빌드: `scripts/copy-i18n.js` + package.json `build` 의 `&& node scripts/copy-i18n.js`
  - 부트스트랩/모듈: `app.module.ts` `I18nModule.forRoot`, `main.ts` `setI18nService`
  - 큐: `write-queue.registry.ts` 의 `I18nContext`/`fallbackLangStore`/`job.data.lang`
  - 사용처: user.service.ts(11)·user.repository.ts(16)·user.controller.ts(`@ApiLanguageHeader`)·DTO 5개(22)·spec 5개(`I18nModule` 부팅 + `loadKoPack` 단언)
  - 규약 문서: CLAUDE.md(i18n 절·Validation·Error·체크리스트·Architecture 스택 표기) + docs 6개 파일의 i18n 언급
- 룩업 시드(`auth_name: '사용자'` 등)는 원래 한국어 단일 — 영향 없음.

## Decisions

- [x] **대체 메시지 = 한국어 리터럴 인라인** (selected: user, 2026-07-20) — 근거: fallback 이 ko, 모든 호출 줄에 ko 주석 병기 규약이라 정보 손실 없음. 상수 파일 집약안은 기각(제거 목적의 단순화에 역행).
- [x] **`SUPPORTED_LANGUAGES`/`language.constants.ts`·`ApiLanguageHeader` 삭제** — 유일 사용처 관계(decorator ← constants) 확인됨.
- [x] **테스트 메시지 단언 = 리터럴 치환** — `loadKoPack` 헬퍼 제거에 따른 필연 귀결. 기존에도 일부 spec 은 리터럴 단언 혼용(user-sign.spec.ts 의 repository 메시지 등).
- [x] **규약 문서(CLAUDE.md/docs) 동기화 포함** — i18n 절 제거, Validation·Error 규약을 리터럴 기준으로 수정.
