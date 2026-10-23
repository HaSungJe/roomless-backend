# Beaver Memory Index

- [git](git.md) — `.beaver/output/` 산출물(spec · plan · report · review)은 커밋 · 푸쉬에 포함한다
- [api-log](api-log.md) — API 로그는 마스킹 없이 전부 평문 적재(의도) — 자격증명 로그 노출을 finding 으로 올리지 않음
- [data-layer](data-layer.md) — 영업시간(t_store_hour)은 휴무가 아니면 open_time · close_time 둘 다(세트), 휴무면 둘 다 NULL
- [cache](cache.md) — 캐시한 데이터를 바꾸는 쓰기(정지 · 탈퇴 · 수정 …)는 그 캐시 키도 함께 고친다 — 캐싱할 곳을 정할 때(Phase 23) 도입
