# db

## 로컬 스키마 반영은 사용자가 마이그레이션으로 — 스키마 반영을 build 차단 항목으로 걸지 않는다

- Rule: 엔티티(libs/database/src/entities/**) 변경 시 Claude 는 엔티티 수정 + 마이그레이션 생성(`npm run db:generate -- <Name>`, DB 없이 PGlite 로 계산) + `npm run db:check` 까지만 한다. **DB 반영은 사용자가 `npm run db:migrate` 또는 Docker migrate 컨테이너로 한다.** plan 의 Prerequisites 에 "스키마 반영"을 build 차단 항목으로 걸지 않는다 — build · 테스트는 DB 없이 통과하므로 막을 이유가 없다. 운영 반영도 사용자 몫.
- Scope: global
- Rationale: User feedback 2026-07-27 — store-crud build 진입 시 스키마 미반영으로 검증기가 막자, "로컬디비라 ship 후에 자동 싱크됨 ㄱㅊ". 당시는 TypeORM `TYPEORM_SYNC=T` 자동 반영이었고, 2026-10-14 MSA 재시작(TypeORM 1.x · PostgreSQL)에서 마이그레이션 기반으로 바꿔 synchronize 를 쓰지 않으므로 "사용자가 마이그레이션 적용" 으로 바뀌었다. build 를 막지 않는다는 취지는 그대로다.
- CLAUDE.md application: applied (CLAUDE.md "주의사항" · docs/data-layer.md "마이그레이션")
- Priority: takes precedence over CLAUDE.md/defaults
