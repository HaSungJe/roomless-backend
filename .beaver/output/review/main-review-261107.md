# Review — main — 261107

> Pre-merge code review. Check the accumulated changes against the memory rules, AGENTS.md conventions, and the plan/spec intent.
> Location: `.beaver/output/review/` — `<stick>-review-<YYMMDD>.md` (stick = branch name with `/`→`-`, one per ship unit). For a re-review on the same day, append `-<N>`.

## Target
- stick: 해당 없음(direct mode) → origin: `main`
- Included features: 서버 위치 정리(로드맵 Phase 25 — #118 · #119 · #120)
  - 문 소켓 처리 3개 → user-service `door`
  - 이용자 입점 신청 7개 → user-service `store`
  - 매니저 예약 3개 → admin-service `reservation`
  - 로드맵 구조 변경: Phase 25 추가 · 연장(#81)을 Phase 26 으로 분리
- Change scope: 추적 파일 74개 `git diff HEAD` 368+ / 1841−(옮긴 코드가 빠진 쪽), 새 파일 38개(코드 · 테스트)
  - spec 13개 · DTO 3개는 git mv 로 옮겼다(이력 유지)

## Convention Check (against AGENTS.md)
| Item | Result | Notes |
|------|------|------|
| memory | pass | `architecture` — 이번 변경이 그 규칙을 처음 적용한다 |
| ↳ reconcile | pass | AGENTS.md Architecture 절 · Checklist 에 6개 조항 대조 → `_archived/architecture.md` 로 옮기고 색인을 지웠다(사용자 승인 2026-11-07) |
| ↳ 그 밖 | pass | `git`(산출물 커밋) 지킴 · `api-log` 해당 없음 · `cache`(미반영)는 캐시 코드가 생기는 Phase 23 후보라 제안하지 않음 |
| Naming | pass | 새 도메인 파일 `door.*` · `store.*` · `reservation.*`, 내부 경로 `/internal/v1/user-service/door/{snapshot,verify,close}` · `/internal/v1/user-service/store/…` · `/internal/v1/admin-service/reservation/store` |
| ↳ 명령 · 상수 | pass | `user.store.application*` · `admin.reservation.*`, 같은 이름 도메인의 규격 상수는 한 파일에 이름으로 가름(`STORE_USER_*` · `RESERVATION_MANAGER_*`) |
| ↳ DTO | pass | `Door*Dto` — door 계약 폴더로 옮기며 `Room` 접두를 뗐다 |
| Structure & layering | pass | controller → service → repository, 앱끼리 import 없음 |
| ↳ 도메인 간 데이터 | pass | 다른 도메인 표는 옮긴 쪽 repository 가 자기 어휘로 다룬다(`findDoorStore` · `findDoorRoom` · `findManagerStore` · `findReservationUser`) |
| ↳ 모듈 등록 | pass | 큐 컨트롤러는 providers, gateway 루트는 겹치는 도메인 모듈을 별칭으로(`UserStoreModule` · `AdminReservationModule`) |
| Shared logic extraction | pass | service private 헬퍼 0 |
| ↳ 복사 | pass | 두 앱이 다 쓰는 util · 상수 · repository 메서드는 앱마다 복사(문구 같다 — spec 단언) |
| ↳ 정리 | pass | 원래 자리에서 쓸모없어진 코드 삭제 — user-service 예약의 `SMS_SENDER` 주입 · `users` 게터, admin room 의 `matchBcrypt` · `Not` 등 |
| Errors & responses | pass | 메시지 · 상태 코드 · SSE 결과 그대로, 실패 본문 모양 그대로 |
| Test strength | pass | 옮긴 spec 13개 단언 그대로 + 바뀐 소속 업체 조회 단언(`findManagerStore(…, false)` · 예약자 `findReservationUser({user_id})`) |
| Data-Access Smoke | pass | 옮긴 매핑 민감 메서드 모두 새 자리 repository spec 에서 SQL 고정 |
| ↳ 목록 | | 문 소켓 업체 · 업체 호실 문 목록 · 내 신청 목록 · 신청 파일 행 · 신청 파일 삭제 · 매니저 소속 업체(잠금 있음 · 없음) · 업체 현황 호실 · 예약 |
| 기타 규약 | pass | README · AGENTS(트리 · 규칙 · 규격 상수 · 내부 actor · 외부 연동 · Smoke 목록 · Checklist) · docs 8개를 같은 변경에서 갱신 |
| 초안 규약 | 해당 없음 | 새 규약 영역 없음(§4.5) |

## Intended Behavior Check (against plan/spec)
- **문 소켓 처리**
  - 접속 확인 · QR 확인 · 잠금 본문은 room.service 그대로다(탈퇴 제외 + bcrypt · 401 이유 가르지 않음 · Redis 비교 Lua · close + 시각).
  - gateway 는 `'user'` 대상 `DOOR_INTERNAL_PATH` 로 부른다. 소켓 규격(경로 · 헤더 · event)은 바뀌지 않았다.
  - admin-service 에는 호실 목록 문 상태 · 바로 열기 · 시크릿이 남았다(업체 관리자).
- **이용자 입점 신청**
  - 7개 메서드 본문은 store.service 그대로다(대기 1건 · 사업자번호 중복 · 비밀번호 해시 · 키 모양 · 한도 · 업로드 확인 · 소프트 삭제 · 저장소 삭제 마지막).
  - 경로는 서비스 자리만 바뀌었다.
  - 총관리자 신청 목록 · 상세 · 승인 · 반려는 admin-service 에 남았다. 승인이 쓰는 `findApplication` · `findApplicationFileRows` 등은 양쪽에 있다.
- **매니저 예약**
  - 3개 메서드 본문은 reservation.service 그대로다(날짜 · 그날 범위 · 취소 상태 조건 · 이용 중 QR 끝내기 · 환불 신청 · 결제 만료 · SMS 마지막 · 호실 이동 규칙).
  - 소속 업체 찾기만 `findManagerStore(user_id, false)` 로 바꿨다(spec 업무 규칙 — 옆 도메인과 같은 방식, 잠금 없음은 지금과 같다).
- **로드맵**
  - Phase 25 를 Phase 19 앞에 넣었고, 연장(#81)을 Phase 26 으로 옮겼다.
  - Phase 19 유닛은 todo 로 돌렸다(Phase 25 뒤에 기획). 지금 할 일의 사용자 줄 8개는 보존했다.
- 빠진 것 · 잘못 구현된 것 없음.
  - plan 과 다른 점은 report 에 적었다: admin 예약 도우미의 `DoorStoreMock` 은 `revokeQr` 만 두었고, gateway 의 안 쓰는 import 를 뺐다.

## Findings
| # | Severity | Location (path:line) | Description | Recommendation |
|---|--------|-----------------|------|------|
| 1 | Info | `apps/user-service/src/door/door.service.ts` `getDoorSnapshot` · `apps/user-service/src/store/store.service.ts` `apply` | 문 시크릿 확인(`matchBcrypt`)과 업체 총관리자 비밀번호 해시(`getBcrypt`)가 이제 user-service 에서 돈다. 해시는 admin-service 가 만들거나(시크릿) 확인한다(로그인). 두 서비스의 `BCRYPT_CODE`(pepper)가 같아야 맞는다 | 지금은 같은 `.env` 를 두 compose 가 그대로 넘겨 문제없다. 운영에서 앱마다 값을 따로 두게 되면 같은 값으로 맞춘다 |
| 2 | Info | `apps/gateway/src/api/v1/admin-service/store/controllers/store.controller.ts` `getApplication` | 옛 `GET /api/v1/admin-service/store/application/mine` 은 이제 총관리자 신청 상세(`/application/:id`, 관리자 가드)에 걸린다. 이용자 토큰이면 404 대신 401 이 나온다 | 프론트가 경로 10개를 같이 바꾼다(spec 에 적음). 호환 경로는 두지 않는다 |
| 3 | Info | 배포 | user-service · admin-service 를 새로 띄우는 동안 옛 gateway 가 보낸 옛 명령(`admin.store.application*` · `user.reservation.store-cancel` 등)은 받을 핸들러가 없어 failed 로 끝난다 | 서비스 두 개 → gateway 순서로 띄운다(report · 로드맵 사용자 줄) |

## Verdict
통과 — 문제 없음(Info 3건만). typecheck · lint(경고 0) · build(앱 4개) · db:check 와 전체 테스트 104파일 1024건이 통과했다. 커밋으로 넘어간다.
