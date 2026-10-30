# Review — 객실 관리 (Phase 13) · 호실 상태 개편 — 261031-2

> Pre-merge code review. Check the accumulated changes against the memory rules, AGENTS.md conventions, and the plan/spec intent.
> Location: `.beaver/output/review/` — direct 모드라 `<branch>-review-<YYMMDD>.md`, 같은 날 두 번째라 `-2`.

## Target
- stick: 없음(direct 모드) — `main` 에 바로 커밋 · 푸쉬
- Included features: [room-manage](../plan/room/room-manage-plan.md) — 로드맵 Phase 13(#53 ~ #57 · #103) + 호실 상태 5개 개편(데이터 마이그레이션 `RoomState`) + Phase 12 테스트 단언 고침
- Change scope: 새 파일 61 · 수정 13 — 코드 40파일 +3877 / −9, 테스트 24파일 +3443, 나머지는 문서(spec · plan · report · review · 규약 문서 · 로드맵)

## Convention Check (against AGENTS.md)
| Item | Result | Notes |
|------|------|------|
| Naming | pass | 명령 `admin.room.<resource>.<action-kebab>` 15개, DTO `room-<feature>.dto.ts` 21개(경로 Param DTO 도 기능별 독립 선언), 클래스 `Room<Feature>Dto` · `RoomQueueController`, 상수 `ROOM_*` · `*_MESSAGE`. 내부 경로의 정적 키는 형제 `STORE_INTERNAL_PATH` 처럼 UPPER_SNAKE(`PLAN_LIST` · `GROUP_LIST` · `ROOM_LIST`), 함수는 camelCase. 상태 이름은 우리말(예약가능 · 예약완료 · 사용중 · 정비중 · 사용중지) |
| Structure & layering | pass | 게이트웨이 `api/v1/admin-service/room/controllers/` 동기 · 큐 2파일, 서비스 `src/room/controllers/` 2파일(큐는 providers), controller 는 위임 한 줄. service 는 repository 포트만(`ROOM_REPOSITORY` · `STORAGE_GATEWAY`), `t_store` · `t_user` 조회는 room 어휘(`findManagerStore`). 앱끼리 import 없음 |
| Shared logic extraction | pass | service private 헬퍼 0, 전환 표 · 하루 안 시각 비교 · 상세정보 기본값 · 응답 변환은 `room.util.ts`, 23P01 판별은 `libs/database/src/typeorm-error.ts` `isExclusionViolation`(형제 `isUniqueViolation` 옆), 날짜는 `@app/common/utils/dayjs.js` 만 |
| Errors & responses | pass | repository 33개 메서드 모두 try/catch + 통일 500, UK 3개(그룹명 · 호실명 · 사진 키) · EXC 1개(기간 겹침, 등록 · 수정) 제약명별 분기 → 400. 입력 필드 귀속 오류만 `validation_errors`, 겹침 · 상태 거부 · 404 · 한도는 `null`. 응답 필드 생략 없음(설명 · 메모 · 대표 사진 `null`) |
| Test strength | pass | service spec 21개(194건) + repository spec(68건). 호출 횟수 · 인자 · `toBeInstanceOf(XEntity)` 와 컬럼 값 · 실패 뒤 `.not.toHaveBeenCalled()` · 업체 행 잠금 인자(쓰기 true · 조회 false) · 그룹 삭제 순서(호실 → 사진 → 그룹 → S3) · 전환 표 `[CASES]` 13 · actor 없음 401 · 토큰 없음 403 |

**Data-Access Smoke**: 새 QueryBuilder 빌더 7개 전부 Smoke 가 있다 — 소속 업체(잠금 2) · 업체 상품 설정 · 객실 그룹 목록(서브쿼리 호실 수 · 대표 사진, 검색어 2) · 그룹 상품 · 그룹 사진 · 기간 가격 목록 · 겹침(등록 · 수정 — 자기 자신 제외) · 호실 목록(필터 없음 · 층 + 그룹 · 0층) 13건, 실제 빌드 SQL 로 고정. raw select 별칭은 행 타입 키와 같다. mock 만으로 덮인 매핑 민감 메서드 없음.

**memory**
- `git` — spec · plan · report · review 를 커밋에 포함한다.
- `cache` — 무효화 지점 표(cache-spec)에 room 쓰기 2행(판매 상품 · 요금 / 객실 그룹 · 사진 · 호실 · 상태)을 더했다. 캐시 코드는 아직 없어 규약 문서로 옮길 단계가 아니다(Phase 23).
- `api-log` — 해당 없음.

## Intended Behavior Check (against plan/spec)
- **21개 API**: spec 표의 경로 · 메서드 · 전달 경로(동기 6 · 큐 15) 그대로다. 모두 매니저 가드, 남의 업체 · 지운 리소스는 404.
- **업체 상품 설정**: 종류별 1행을 수정만 한다. 시간 이용은 이용 시간, 1박 · 연박은 입실 · 퇴실 시각이 있어야 하고 입실 = 퇴실은 거부한다(`isSameTimeOfDay` — dayjs).
- **객실 그룹**: 등록 때 그룹 상품 3행(사용 안 함 · 0원)을 함께 넣는다. 상세정보는 보낸 항목 + 기본값으로 저장한다. 삭제는 호실 · 사진 · 그룹을 삭제 표시하고 S3 객체를 마지막에 지운다.
- **그룹 사진**: 서버가 키를 만들고(`store/<store_id>/room-group/<room_group_id>/…`, 공개 CDN), 한도 5장 · 키 모양 · 실제 업로드(`exists`) 순으로 확인한다. 순서 변경은 전체 집합이 같을 때만 받는다.
- **그룹 상품**: 판매(`is_used = 1`)는 1원 이상이어야 한다.
- **기간 가격**: 없는 날짜 · 종료 < 시작을 거부하고, 겹침은 service 선검사 + DB 배타 제약 23P01 → 400(같은 본문). 삭제는 affected 로 없음 판별.
- **호실**: 같은 업체의 지워지지 않은 그룹만 지정, 새 호실은 예약가능. 목록은 층 · 그룹 필터(0층도 필터).
- **호실 상태**: 업체 관리자 전환 4개(정비중 → 예약가능 · 예약가능 → 사용중지 · 정비중 → 사용중지 · 사용중지 → 예약가능)만 허용, 나머지 400. DTO 가 목표 정비중 · 예약완료를 먼저 거부한다.
- **`RoomState` 마이그레이션**: 기존 DB 는 STANDBY 호실을 예약가능으로 옮긴 뒤 STANDBY 를 지우고(FK CASCADE 로 호실이 지워지지 않게) 이름을 맞춘다. 새 DB 는 시드가 나머지를 채운다. PGlite 9/9(up · down · 다시 up · 새 DB).
- **검증 명령**: typecheck · lint · build(4개 앱) · db:check 통과. 테스트는 AGENTS 허용 범위에서 build 중 확인 실행 — room 262건 · 전체 718건 통과.
- **plan 과 다른 점**: 테스트 초안의 DTO 문구 5개를 DTO(형제 문구)에 맞췄고, plan 의 C 섹션 "계약 추가분" 블록은 B 섹션 파일에 이미 들어 있어 한 줄 설명으로 줄였다. plan 의 코드 블록은 실제 파일과 같다.

## Findings
| # | Severity | Location (path:line) | Description | Recommendation |
|---|--------|-----------------|------|------|
| 1 | Low | AGENTS.md:115 · AGENTS.md:149 · docs/conventions.md:117 · docs/data-layer.md:192 | `@Query()` DTO · Pagination 의 "적용" 목록에 room 목록 3종(`RoomGroupListDto` · `RoomGroupPlanPriceListDto` · `RoomListDto` / `getMyRoomGroups` · `getMyRoomGroupPlanPrices` · `getMyRooms`)이 빠졌다. 동작에는 영향 없음 | 4곳에 room 목록을 더한다(문서만) — **반영함**(사용자 결정, 커밋 전) |
| 2 | Info | apps/admin-service/src/room/room.service.ts `deleteMyRoomGroup` · `deleteMyRoomGroupImage` | S3 삭제는 트랜잭션 안 마지막 단계다. S3 가 끝내 실패하면(재시도 3회 후) DB 는 롤백되는데 앞서 지운 객체는 돌아오지 않는다. 형제 store 사진 삭제와 같은 순서 · 같은 한계이고, S3 삭제는 없는 키에도 성공해 재시도는 안전하다 | 조치 없음(형제와 같은 규칙 — 외부 호출은 명령의 마지막 단계) |
| 3 | Info | 로드맵 #53 · #54 key decision | 미래 예약이 있는 그룹 삭제 · 호실의 그룹 이동 처리는 예약 테이블이 없어 아직 판단할 수 없다 | 예약 Phase(16 · 17)에서 정한다 |
| 4 | Info | 호실 상태 시스템 전환 | 예약 → 예약완료 · 체크인 → 사용중 · 체크아웃 → 정비중은 시스템 몫이라 이번 범위 밖이다. 상태 행 · 이름은 준비됐다 | 예약 · 이용 Phase(17 · 19)에서 붙인다 |

## Verdict
통과 — High · Medium 없음. Low #1 은 사용자 결정으로 커밋 전에 문서 4줄을 보강했다(코드 변경 없음).
