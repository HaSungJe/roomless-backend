# Beaver Memory Index

- [git](git.md) — `.beaver/output/` 산출물(spec · plan · report · review)은 커밋 · 푸쉬에 포함한다
- [api-log](api-log.md) — API 로그는 마스킹 없이 전부 평문 적재(의도) — 자격증명 로그 노출을 finding 으로 올리지 않음
- [cache](cache.md) — 캐시한 데이터를 바꾸는 쓰기(정지 · 탈퇴 · 수정 …)는 그 캐시 키도 함께 고친다 — 지금은 캐시 없음(Phase 23 dropped 2026-11-10), 측정 뒤 다시 도입할 때 적용
- [frontend](frontend.md) — 공개 API · 사용자 동작이 바뀌면 `.beaver/output/frontend/changes/<날짜>-<기능>.md` 프론트 수정 요청 문서를 같은 변경에서 만든다(화면 설계 · 서버 구성은 넣지 않음)
