# Report — i18n-removal

## Feature Summary
- **Feature**: 다국어(i18n) 기능 전체 제거 — 사용자 노출 메시지는 한국어 리터럴 인라인 고정
- **Entry point**: `N/A` (횡단 변경 — 기존 user 5개 API 동작·상태코드·응답 구조 불변)
- **Domain**: common (+ user, modules/queue, 루트 설정·문서)

## Created/Modified/Deleted Files
| File | Change Type | Description |
|------|-----------|------|
| `src/i18n/**` (21개 yaml) | deleted | ko/en/ja 언어팩 전체 |
| `src/common/i18n/` (translate.ts·i18n.config.ts·test-utils/load-ko-pack.ts) | deleted | translate/i18nMsg 헬퍼·I18n 옵션·테스트 헬퍼 |
| `src/common/language/language.constants.ts` | deleted | SUPPORTED_LANGUAGES (유일 사용처 = ApiLanguageHeader) |
| `src/common/decorators/api-language-header.decorator.ts` | deleted | Accept-Language Swagger 데코레이터 (decorators 폴더 자체 제거) |
| `scripts/copy-i18n.js` | deleted | 빌드 시 언어팩 복사 스크립트 (scripts 폴더 자체 제거) |
| `src/app.module.ts` | modified | `I18nModule.forRoot` 등록·import 제거 |
| `src/main.ts` | modified | `setI18nService`/`I18nService` import·호출 제거 |
| `src/modules/queue/write-queue.registry.ts` | modified | Worker 언어 복원(`fallbackLangStore`)·dispatch `job.data.lang`·`I18nContext` 제거 |
| `src/api/v1/user/user.service.ts` | modified | `translate()` 11곳 → 한국어 리터럴, import 제거 |
| `src/api/v1/user/repositories/user.repository.ts` | modified | `translate()` 16곳 → 한국어 리터럴, import 제거 |
| `src/api/v1/user/user.controller.ts` | modified | `@ApiLanguageHeader()`·import 제거 |
| `src/api/v1/user/dto/user-{sign,login,token-refresh,leave,nickname}.dto.ts` | modified | `i18nMsg` 22곳 → 리터럴 (nickname 은 yaml 부재로 빈 메시지가 나오던 잠복 버그 → 주석 문자열 채택으로 해소) |
| `src/api/v1/user/test/user-{sign,login,token-refresh,leave,leave-cancel}.spec.ts` | modified | `I18nModule` 부팅·`loadKoPack` 제거, `userKo.*` 단언 → 리터럴 |
| `package.json` | modified | `nestjs-i18n` 의존성 제거, `build` → `nest build` (copy-i18n 제거) |
| `CLAUDE.md` | modified | i18n 절 삭제, Architecture 트리·Validation·Error·API·Testing·Checklist 리터럴 기준 수정 |
| `docs/architecture.md`·`conventions.md`·`error-handling.md`·`api.md`·`data-layer.md`·`testing.md` | modified | i18n 언급 제거(스택·트리·부트스트랩·검증 message 규칙·예시 코드·loadKoPack 단언 규칙) |

## Tests Written
신규 spec 없음(계획대로) — 기존 spec 5종을 리터럴 단언으로 전환해 회귀 게이트 유지. 단언 강도(호출 횟수·인자·미호출) 불변. build 규약상 테스트 실행은 하지 않음 — `/beaver:test`(ship 후, 의존성 있는 실제 체크아웃)에서 실행.

## Verification
- 잔존 참조 grep: `src/` 에서 `i18n|i18nMsg|translate|loadKoPack|Accept-Language|setI18nService|fallbackLangStore|ApiLanguageHeader|SUPPORTED_LANGUAGES` **0건**. 문서의 "다국어 없음" 서술과 package-lock.json 항목만 잔존(아래 참고).
- 계획 치환표와 소스 리터럴 1:1 대조 — 구현 중 login DTO 의 device 짝 메시지 2건이 뒤바뀐 것을 발견·즉시 교정(최종본은 원본 ko yaml 값과 일치).
- spec 단언 값과 소스 메시지 리터럴 동일 값 확인(sign 1·login 4·token-refresh 4·leave 3·leave-cancel 2).
- 빈 폴더(`src/common/decorators`, `scripts`) 제거 확인.

## Remaining Issues
- `package-lock.json` 은 `npm install` 재실행으로 갱신 필요 — CLAUDE.md ⚠️ 규약상 의존성 설치는 사용자 몫 (설치 전까지 lockfile 에 nestjs-i18n 항목이 남지만 실행·테스트에는 영향 없음).
- en/ja 클라이언트도 한국어 메시지를 받음 — 다국어 제거의 의도된 결과.
