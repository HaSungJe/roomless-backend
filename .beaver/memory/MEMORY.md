# Beaver Memory Index

- [git](git.md) — 커밋 메시지 형식: `YYYY.MM.DD` 날짜 줄 + 빈 줄 + `-작업내용` 목록 (항상)
- [dto](dto.md) — `@Query()` DTO 는 생성자를 세트로, 컨트롤러가 `const dto = new XXX(query);` 로 생성해 넘김
- [db](db.md) — 엔티티 변경 시 Claude 는 마이그레이션 생성(db:generate · db:check)까지, DB 반영은 사용자(db:migrate) — 스키마 반영으로 build 를 막지 않음
- [api-log](api-log.md) — API 로그는 마스킹 없이 전부 평문 적재(의도) — 자격증명 로그 노출을 finding 으로 올리지 않음
- [controller](controller.md) — 게이트웨이 공개 controller 는 동기 `<domain>.controller.ts` · 큐 `<domain>.controller.queue.ts` 로 나눈다(한 파일에 섞지 않음)
