# db

## 로컬 DB 는 TYPEORM_SYNC=T 로 자동 반영 — 스키마 변경에 수동 ALTER 불필요

- Rule: 컬럼 추가·타입 변경 등 엔티티 스키마 변경 시, **로컬 개발 DB 는 `TYPEORM_SYNC=T` 로 부팅할 때 자동 반영**되므로 사용자에게 수동 ALTER 를 요구하지 않는다. plan 의 Prerequisites 에 "스키마 반영"을 build 차단 항목으로 걸지 말 것 — build 를 막을 이유가 없다. 대신 운영 배포용 ALTER 문은 plan 에 남겨둔다.
- Scope: global (로컬 개발 환경 한정 — 운영 배포는 여전히 사용자 몫)
- Rationale: User feedback 2026-07-27 — store-crud build 진입 시 스키마 미반영으로 검증기가 막자, "로컬디비라 ship 후에 자동 싱크됨 ㄱㅊ".
- CLAUDE.md application: not needed (CLAUDE.md "주의사항"의 "DB 마이그레이션·배포는 사용자 몫"은 운영 기준으로 여전히 유효 — 로컬 자동싱크는 그 예외 상황 설명일 뿐)
- Priority: takes precedence over CLAUDE.md/defaults
