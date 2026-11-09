# architecture

## 기능은 쓰는 사람(행위자)으로 서버를 고른다 — 이용자는 user-service, 관리자 쪽은 admin-service
- Rule: 이용자가 쓰는 기능(이용자 가드 라우트 · 이용자 흐름에서 불리는 내부 처리 — 예: 입점 신청, 문 소켓의 QR 확인)은 user-service 에 둔다. admin-service 에는 업체 관리자 · 업체 총관리자 · 관리자 · 총관리자 전용 기능만 둔다. 같은 데이터(공유 DB 의 업체 · 예약 표)라도 행위자가 다르면 그 행위자의 서버에 같은 이름의 도메인을 따로 둔다(예: user-service `reservation` = 이용자 예약, admin-service `reservation` = 매니저 예약 현황 · 업체 취소 · 호실 이동). 새 기능을 기획할 때 이 기준으로 서버부터 정하고, 어긋난 기존 기능은 로드맵 Phase 로 옮긴다.
- Scope: global
- Rationale: User feedback 2026-11-07 — "문 열기는 user-service쪽이어야 하는데? 서버 위치가 잘못된 것 같음. 이용자가 이용하는 기능들은 user-service에 몰려야하고, admin-service는 업체관리자/업체총관리자/관리자/총관리자 전용 기능만 모여야하는데" → 문 소켓 처리 · 이용자 입점 신청 → user-service, 매니저 예약 → admin-service 로 옮기는 Phase 를 먼저 하기로 함
- AGENTS.md application: 반영 완료 2026-11-07 — AGENTS.md Architecture 절 첫 줄 · Checklist "서버 위치" (대조 6개 조항) → 아카이브
- Priority: takes precedence over AGENTS.md/defaults

## 서버 안 도메인은 권한(행위자)이 아니라 기능 대상으로 나눈다
- Rule: 서버는 쓰는 사람(행위자)으로 고르고(AGENTS.md), **그 서버 안의 도메인은 기능의 대상(데이터)으로 나눈다** — 같은 대상을 다루는 기능은 권한이 달라도 한 도메인에 두고 라우트마다 그 그룹의 가드로 가른다.
  - admin-service: 관리자 · 총관리자 계정 대상 기능 → `admin`, 업체 관리자 · 업체 총관리자 계정 대상 기능(업체 총관리자의 업체 관리자 관리 · 총관리자의 업체 관리자 관리) → `manager`, 이용자 대상 기능(총관리자의 이용자 관리) → `user`, 업체 → `store`, 객실 → `room`, 예약 → `reservation`.
  - 같은 대상 도메인이 두 서버에 있으면 같은 이름으로 따로 둔다(user-service `user` · admin-service `user`).
- Scope: global
- Rationale: User feedback 2026-11-09 — "admin-service 서버에서 관리자/총관리자 관련 기능: admin, 업체관리자/업체총관리자 관련 기능: manager … 권한이 아니라 기능 대상별 도메인으로 구분해야지. 다른것들도 이렇게 되있지않아?"
- AGENTS.md application: 반영됨 2026-11-09 (ship 리뷰 main-review-261109-2 — AGENTS.md Architecture "서버 안 도메인은 권한(행위자)이 아니라 기능 대상으로 나눈다" 조항, docs/architecture.md 같은 조항)
- Priority: takes precedence over AGENTS.md/defaults
