# Ship Review — worktree-stick+common-sc46uj → main · 2026.07.20

## 대상
다국어(i18n) 전체 제거 — stick base(main `00f3057`) 대비 워킹트리 diff: **51개 파일, +104 / -648** (삭제 26 · 수정 25).

## 리뷰 결과

### memory 규칙 (최우선)
- 커밋 메시지 형식(날짜+빈 줄+`-항목`, 트레일러 금지) — §2 커밋에 적용 예정. 미반영 항목 없음(git.md `반영됨` 상태).

### 규약 준수
- 메시지 리터럴 전수 확인: service 11 · repository 20 · DTO 26 — plan 치환표(ko yaml 값)와 1:1 일치. `git diff --check` 공백 오류 0건.
- DTO 데코레이터 순서(`@ApiProperty`→제약→`@IsNotEmpty` 마지막)·`@IsOptional` 무메시지 규약 유지. 컨트롤러 클래스 데코레이터는 `@ApiTags`→`@Controller` 로 축소(ApiLanguageHeader 제거) — CLAUDE.md/docs 동기 수정 완료.
- 잔존 참조 grep: `src/` 에서 i18n/translate/i18nMsg/loadKoPack/Accept-Language/fallbackLangStore 등 **0건**.

### Data-Access Smoke
- 해당 없음 — data-access 메서드 추가/수정 없음(메시지 문자열만 변경). 매핑 민감 쿼리 신설 없음.

### 의도 부합 (plan/spec 대비)
- File List 전 항목 구현 확인: 삭제 7종(언어팩 21·헬퍼 3·상수·데코레이터·copy-i18n) + 수정 전 파일. 빈 폴더(`common/decorators`·`scripts`)까지 정리.
- API 동작·상태코드·응답 구조 불변 — spec 5종의 흐름·강도 단언은 그대로, 메시지 단언만 리터럴 전환.
- 구현 중 자가 발견·교정 1건: login DTO device 짝 메시지 상호 뒤바뀜 → 원본 ko 값으로 즉시 교정(최종본 검증 완료).
- nickname DTO 잠복 버그(yaml 부재 키 → 빈 메시지) 해소 — spec Decisions 에 명시된 의도.

### 초안 규약 문서
- 해당 없음 — plan §4.5 draft 문서 없음(기존 영역 제거라 신규 규약 영역 아님).

## 발견 사항
| # | 심각도 | 내용 |
|---|---|---|
| 1 | 낮음(정보) | `package-lock.json` 에 `nestjs-i18n` 항목 잔존 — `npm install` 재실행(사용자 몫)으로 갱신. 실행·테스트 영향 없음 |
| 2 | 낮음(정보) | plan 의 치환 개수 표기(11/16/22)가 실측(11/20/26)보다 적었음 — 치환 자체는 전수 완료(grep 0건), 문서 카운트만 보수적이었음 |

## 결론
**통과** — 차단 발견 없음. 커밋 메시지(형식 규칙 적용):

```
2026.07.20

-다국어(i18n) 기능 전체 제거 (언어팩/헬퍼/의존성 삭제, 메시지 한국어 리터럴 고정)
```
