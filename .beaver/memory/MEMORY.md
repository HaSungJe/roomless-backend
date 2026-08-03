# Beaver Memory Index

- [git](git.md) — 커밋 메시지 형식: `YYYY.MM.DD` 날짜 줄 + 빈 줄 + `-작업내용` 목록 (항상)
- [dto](dto.md) — `@Query()` DTO 는 생성자를 세트로, 컨트롤러가 `const dto = new XXX(query);` 로 생성해 넘김
- [db](db.md) — 로컬 DB 는 `TYPEORM_SYNC=T` 자동 반영, 스키마 변경에 수동 ALTER 요구 ❌
- [api-log](api-log.md) — API 로그는 마스킹 없이 전부 평문 적재(의도) — 자격증명 로그 노출을 finding 으로 올리지 않음
