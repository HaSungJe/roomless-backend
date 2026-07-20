# git

## beaver 산출물 문서는 커밋에 포함
- Rule: `.beaver/output/`(spec/plan/report/review)은 beaver 기본대로 **커밋·푸쉬에 포함**한다 — ship 시 코드와 함께 커밋. gitignore 제외 ❌.
- Scope: global
- Rationale: User feedback 2026-07-20 — "plan, spec파일은 왜 같이 push가 안되고 메인에 남아있어?" → 커밋+푸쉬(beaver 기본) 선택. (최초 커밋 때의 문서 삭제는 일회성이었음)
- CLAUDE.md application: not needed (CLAUDE.md Beaver 설정 절의 기본 동작과 동일 — 별도 반영 불필요)
- Priority: takes precedence over CLAUDE.md/defaults

## 커밋 메시지 형식 — 날짜 + 빈 줄 + 작업내용 목록
- Rule: 커밋(+푸쉬) 메시지는 항상 `YYYY.MM.DD` 날짜 줄 → 빈 줄 1개 → `-작업내용` 목록 형식으로 작성한다. **`Co-Authored-By: Claude ...` 등 트레일러는 절대 붙이지 않는다** — 메시지는 날짜+목록만.
  ```
  2026.07.20

  -작업내용 1
  -작업내용 2
  ```
- Scope: global
- Rationale: User feedback 2026-07-20 — "커밋+푸쉬 상황시, 메세지는 항상 아래와 같은 형식. 날짜 + 메세지 (사이에 한줄 들여쓰기)" / 같은 날 추가 — "Co-Authored-By: Claude ... 이것도 꼭 빼줘."
- CLAUDE.md application: applied(CLAUDE.md "커밋 메시지" 절 — 2026-07-20 ship 리뷰에서 승인·반영)
- Priority: takes precedence over CLAUDE.md/defaults
