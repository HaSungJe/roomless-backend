# frontend

## 공개 API · 동작이 바뀌면 프론트 수정 요청 문서를 같이 만든다
- Rule: 공개 API(주소 · 요청 · 응답 · 실패 · 동기/큐)나 사용자에게 보이는 동작을 바꾸는 기능은 `.beaver/output/frontend/changes/<YYYY-MM-DD>-<기능>.md` 를 같은 변경에서 만들고 `changes/README.md` 목록에 한 줄 더한다(바뀐 이유 · 영향 화면 · API 변경 · 화면 구성과 쓰는 API 의 변경 · 바뀐 DTO 코드(Swagger 데코레이터만 뺀 사본) · 반영 순서). 기획(direct/stick)은 plan 파일 목록에 넣고, build 가 쓰고, ship 리뷰가 빠졌는지 확인한다. 화면 설계(배치 · 디자인)는 쓰지 않고 아티팩트도 고치지 않는다 — 처음 아티팩트 뒤 화면은 프론트 세션이 만든다. 인계 자료는 화면 설계 아티팩트 + 지침서(API 목록과 호출 방식 · 화면 목록과 주소 · 화면 구성과 쓰는 API · DTO)만 — 서버 구성 · 환경 설정은 넣지 않는다.
- Scope: global
- Rationale: User decision 2026-11-10 — "이제부터 기능 수정되는 것들에 대한 프론트 수정 요청 자료도 같이 만들어야해. 초기 아티팩트 이후로는 화면을 프론트 세션에서 만들거니, 기능에 대한 수정지침만 만들 수 있도록 연계되면 됨" · "백엔드에 어떤 api가 있고, 어떤식으로 호출하라는 정리와 페이지 구성, 그 페이지들이 쓸 api 이런게 정리되어야할듯? 그리고 아티팩트도 같이 만들어서 첨부해야 프론트가 아티팩트 + 지침서를 보고 그대로 만들지."
- AGENTS.md application: applied (AGENTS.md "프론트 연계" 절 · Checklist — Phase 27 build)
- Priority: takes precedence over AGENTS.md/defaults
