# Report — general-sign

## Feature Summary
- **Feature**: 아이디(login_id)+비밀번호 기반 일반 회원가입·로그인 API 2개 추가 (스키마 변경 없음)
- **Entry point**: `POST /api/v1/user/general-sign` · `POST /api/v1/user/general-login`
- **Domain**: user

## Created/Modified/Deleted Files
| File | Change Type | Description |
|------|-----------|------|
| `src/api/v1/user/dto/user-general-sign.dto.ts` | created | 가입 입력(아이디 4~30자 영문/숫자/_, 비밀번호 8~20자 영문+숫자 필수·특수문자 `!@#$%^&*`, 성별/생년월일/닉네임/device) + `UserGeneralSignResultDto`(토큰 4종 독립 재선언) |
| `src/api/v1/user/dto/user-general-login.dto.ts` | created | 로그인 입력(아이디/비밀번호 + device 한 세트 `@ValidateIf`) + `UserGeneralLoginResultDto` |
| `src/api/v1/user/user.service.ts` | modified | `generalSign`/`generalLogin` public 메서드 2개(=API 1:1) 추가, `matchBcrypt` import — sign/login sibling 계약 준수(엔티티 new+할당, `@Transactional`, UK 위임, device 동기화) |
| `src/api/v1/user/user.controller.ts` | modified | 핸들러 2개 추가 — Swagger 데코레이터 순서·`@HttpCode(200)`·응답 type 규약 준수 |
| `src/api/v1/user/test/user-general-sign.spec.ts` | created | 10 케이스 — [SUCCESS]×2 / [FAIL:validation]×6 / [FAIL:service]×1 / [FAIL:duplicate]×1 / [FAIL:repository]×1 |
| `src/api/v1/user/test/user-general-login.spec.ts` | created | 9 케이스 — [SUCCESS]×2 / [FAIL:validation]×1 / [FAIL:service]×3(미존재·비번 불일치·BLOCK) / [FAIL:repository]×2 |
| entity / repository / util / module | 변경 없음 | `sns_id` nullable·UK_User_LoginId·범용 repository 메서드·`matchBcrypt` 재사용 |

## Tests Written
- 지배적 스타일 ①(HTTP boot + repository Symbol 토큰 mock) 미러링 — 상단 `typeorm-transactional` mock, util `jest.spyOn`+`mockRestore`(`isAdult`/`getBcrypt`/`matchBcrypt`/`sha256Hex`/`encryptAesGcm`/`extractJwtExpiresAt`), fake timers.
- 단언 강도: entity 전 컬럼(sns null·bcrypt 해시·name=nickname 등)·mock 호출 횟수/인자/`toHaveBeenNthCalledWith` 순서·실패 후 `.not.toHaveBeenCalled()`(`expectNoWrites`)·한국어 리터럴 메시지·`FindOperator(In)` 인자.
- `[SMOKE:data-access]` 해당 없음 — repository 메서드 신규/변경 0건(plan 대로).

## Verification
- `npm test` (CLAUDE.md ⚠️ 예외 규정에 따라 build 완료 직후 직접 실행): **13 suites / 108 tests 전부 통과** — 신규 19 케이스 green + 기존 89 회귀 무영향.
- plan File List·Design 코드와 구현 1:1 일치(라우트/메시지/판정 순서: 조회 → 비밀번호 → BLOCK).

## Remaining Issues
None
