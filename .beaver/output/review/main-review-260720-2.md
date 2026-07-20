# Ship Review — main (direct mode) · 2026.07.20 (2차)

## 대상
① 일반 회원가입/로그인 기능(general-sign) — 신규 4파일(DTO 2·spec 2) + 수정 2파일(service·controller), ② tsconfig 에디터 타입 오류 수정. 기획 문서 3종(spec/plan/report) 동반 커밋(memory 규칙).

## 리뷰 결과

### memory 규칙 (최우선)
- 커밋 형식(날짜+빈 줄+`-항목`, 트레일러 금지) 적용 예정. 산출물 문서 커밋 포함 규칙 적용. 미반영 항목 없음.

### 규약 준수
- DTO: 데코레이터 순서(`@ApiProperty`→제약→`@IsNotEmpty` 마지막)·한국어 리터럴 message·독립 재선언(`ResultDto` 접미사) ✓. 허용 데코레이터 집합만 사용(`@Matches`/`@MaxLength`/`@IsIn`/`@IsNotEmpty`/`@IsOptional`/`@ValidateIf`) ✓.
- Service: public 2개 = API 2개(1:1), `@Transactional()`, 엔티티 `new`+할당, private 헬퍼 없음(공통은 기존 util 재사용: `isAdult`/`matchBcrypt`/`issueAccessAndRefresh`) ✓.
- Controller: 핸들러 데코레이터 순서·`@HttpCode(200)`·응답 `type`만·파라미터 한 줄·위임 1줄 ✓. 라우트 flat kebab(`/general-sign`·`/general-login`) ✓.
- Repository/entity 무변경 — UK_User_LoginId·범용 메서드 재사용(계획 의도) ✓.

### Data-Access Smoke
- 해당 없음 — data-access 메서드 신규/변경 0건. `findUser` where 는 service 구성(기존 login 과 동일 형태).

### 의도 부합 (plan/spec 대비)
- 판정 순서(조회→비밀번호→BLOCK), 미존재/비번 불일치 동일 404, BLOCK 403+block_comment, device 동기화 규칙 — plan Design 코드와 1:1 일치.
- 테스트 강도: entity 전 컬럼·호출 횟수/인자/순서·실패 후 미호출·`FindOperator(In)` 단언 — 기존 sign/login spec 과 동일 수준.
- **검증 실행 완료**: `npm test` 13 suites / 108 tests green (신규 19), `npx tsc --noEmit` 0건.

### tsconfig 수정 (부수 변경)
- 존재하지 않는 `./@types` typeRoot 가 VS Code TS 서버의 전역 타입 자동 포함을 깨뜨림 → `typeRoots` 제거 + `"types": ["jest", "node"]` 명시. tsc·npm test 무영향 확인, 에디터 오류 해소 사용자 확인.

## 발견 사항
없음 (차단·비차단 모두).

## 결론
**통과** — 커밋 메시지:

```
2026.07.20

-일반 회원가입/로그인 API 추가 (아이디+비밀번호, /general-sign·/general-login)
-tsconfig 수정: 죽은 typeRoots 제거·전역 타입(jest/node) 명시 — 에디터 타입 오류 해소
```
