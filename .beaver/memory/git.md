# git

## beaver 산출물 문서는 커밋에 포함
- Rule: `.beaver/output/`(spec/plan/report/review)은 beaver 기본대로 **커밋·푸쉬에 포함**한다 — ship 시 코드와 함께 커밋. gitignore 제외 ❌.
- Scope: global
- Rationale: User feedback 2026-07-20 — "plan, spec파일은 왜 같이 push가 안되고 메인에 남아있어?" → 커밋+푸쉬(beaver 기본) 선택. (최초 커밋 때의 문서 삭제는 일회성이었음)
- AGENTS.md application: not needed (non-code — beaver 기본 동작과 같은 저장소 운영 결정이라 규약 문서에 두지 않는다)
- Priority: takes precedence over AGENTS.md/defaults
