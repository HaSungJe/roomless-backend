# git

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
