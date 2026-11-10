# roomless 프론트 인계

기준: 백엔드 Phase 27(2026-11-10 — 내 정보 API 포함). 이후 바뀐 것은 [changes/](changes/README.md) 로 온다.
**아티팩트(시안)와 이 지침서를 함께 보고 만든다** — 화면 모양은 아티팩트, 주소 · 구성 · 쓰는 API 는 지침서.

## 아티팩트 — 화면 설계

영역마다 한 페이지 — 위에서 아래로 목차 → 디자인 기준(색 · 글꼴 · 버튼 · 입력 · 배지) → 모든 화면이 이어진다. 화면마다 머리줄(키 · 이름 · 주소)이 붙어 있고 [screens.md](screens.md) 의 키 · 주소와 같다(예: "U7 예약 1건(이용 중 · QR) — /reservation/[reservation_id]"). 목차의 링크로 그 화면에 바로 간다.

| 영역 | 아티팩트 |
|---|---|
| 이용자 `/` — 모바일 웹 | https://claude.ai/artifact/LWUV7hrLgq8nN8EkA4Bj3f |
| 업체 관리자 `/manager` — PC 콘솔 | https://claude.ai/artifact/8ruyrydbQ8Xvoz3vtqyPWP |
| 총관리자 · 관리자 `/admin` — PC 콘솔 | https://claude.ai/artifact/T6Hna7UcqH5ki7uwf9Noyb |

아티팩트 원본 HTML 은 [design/](design/) 에 있다(`user.html` · `manager.html` · `admin.html`) — 색 · 간격 값을 그대로 옮겨 쓸 수 있다.

## 지침서 — 읽는 순서

1. [screens.md](screens.md) — 화면 목록과 주소, 화면마다 구성 · 들어올 때 부르는 API · 버튼별 API · 화면 주의
2. [api.md](api.md) — API 목록(108개)과 호출 방식(로그인 토큰 · 동기 / 큐 SSE · 실패 · 목록 · 파일 올리기 · 결제)
3. [dto/](dto/) — 요청 · 응답 DTO 사본(Swagger 데코레이터만 뺀 `class-validator` 클래스, 필드 설명은 주석) — [dto/common.md](dto/common.md) 에 공통 DTO · 상태 상수 · 룩업 값
4. [changes/README.md](changes/README.md) — 이후 수정 요청 목록(위에서부터 차례로 반영)
