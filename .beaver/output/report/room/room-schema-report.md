# Report — room-schema

## Feature Summary
- **Feature**: room 스키마 — 호실 상태 · 상품 종류 룩업(+시드) · 객실 그룹(상세정보 JSON + 기본값) · 그룹 사진 · 호실 · 업체 상품 설정(업체 × 상품 종류 1행) · 그룹 상품(그룹 × 상품 종류, 사용 여부 · 요금) · 상품별 기간 가격(DB 배타 제약) · 편의시설 이동(`t_store.store_detail` 삭제) · 기존 store 테이블 소프트 삭제 전환
- **Entry point**: 새 진입점 없음 — 엔티티 · 시드 · 마이그레이션 `RoomSchema`(1793386485207) + 입점 승인 · 내 업체 소개 수정 · 업체 상세 응답 · 모든 repository 의 삭제 · 조회 조건
- **Domain**: room (로드맵 Phase 12 — #48 ~ #52) + store · manager · admin · user(소프트 삭제)
- **Plan**: [room-schema-plan.md](../../plan/room/room-schema-plan.md) · **Spec**: [room-schema-spec.md](../../spec/room/room-schema-spec.md)

## Created/Modified/Deleted Files
| File | Change Type | Description |
|------|-----------|------|
| `libs/database/src/entities/room/room-state.entity.ts` | created | 호실 상태 룩업 |
| `libs/database/src/entities/room/room-plan-type.entity.ts` | created | 상품 종류 룩업(HOURLY 시간 이용 · NIGHT 1박 · LONG 연박) |
| `libs/database/src/entities/room/room-group.entity.ts` | created | 객실 그룹 + `RoomGroupDetail` · `ROOM_GROUP_DETAIL_DEFAULTS` · `@AfterLoad fillDetailDefaults()`, 그룹명 부분 유니크 |
| `libs/database/src/entities/room/room-group-image.entity.ts` | created | 그룹 사진(공개 · 소프트 삭제 · 수정일) |
| `libs/database/src/entities/room/room.entity.ts` | created | 호실(층 · 호실명 부분 유니크 · 상태) |
| `libs/database/src/entities/room/room-plan.entity.ts` | created | 업체 상품 설정 — `is_used` · `days_of_week` · `usage_hours` · `check_in_time` · `check_out_time`, UK · CHECK `CHK_RoomPlan_UsageHoursCheckInOutTime` |
| `libs/database/src/entities/room/room-group-plan.entity.ts` | created | 그룹 상품 — `is_used`(기본 0) · `price`(기본 0), 그룹 × 종류 UK |
| `libs/database/src/entities/room/room-group-plan-price.entity.ts` | created | 기간 가격 — `date` 범위 · CHECK · 배타 제약 `EXC_…`(WHERE is_deleted = 0) · 소프트 삭제 |
| `libs/database/src/entities/store/store.entity.ts` | modified | `StoreDetail` · `store_detail` 삭제, 클래스 주석 |
| `libs/database/src/entities/store/store-application.entity.ts` · `store-break.entity.ts` · `store-unavailable-period.entity.ts` | modified | `is_deleted` |
| `libs/database/src/entities/store/store-file.entity.ts` | modified | `is_deleted` · `updated_at` + `@BeforeUpdate` |
| `libs/database/src/entities/store/store-hour.entity.ts` | modified | `is_deleted`, `UK_StoreHour_StoreIdDayOfWeek` 부분 유니크 인덱스로 |
| `libs/database/src/entities.ts` | modified | ENTITIES 8개 |
| `libs/database/src/seeder/seeder.targets.ts` | modified | `ROOM_STATE_SEED_DATA` · `ROOM_PLAN_TYPE_SEED_DATA` |
| `libs/database/src/soft-delete.ts` | created | `notDeleted(where)` — 단일 · OR 배열 조건에 `is_deleted: 0` |
| `libs/database/src/migrations/1793386485207-RoomSchema.ts` | created | 생성 + 손질(확장 · `t_store_file.updated_at` 채움 · 기존 업체 상품 설정 3행 · down 의 소프트 삭제 행 정리 · UK 컬럼 순서 · store_detail COMMENT) |
| `libs/database/src/migrations.ts` | modified | MIGRATIONS 등록(생성기 한 줄 형식 유지) |
| `scripts/db-schema.mjs` | modified | PGlite 에 `btree_gist` |
| `apps/admin-service/src/store/repositories/store.repository.ts` | modified | 실제 삭제 6곳 → 소프트 삭제, is_deleted 테이블 조회 · 개수 · 수정 · QueryBuilder 에 `is_deleted = 0`, `roomPlans` · `insertStorePlans` |
| `apps/admin-service/src/store/interfaces/store.repository.interface.ts` | modified | `insertStorePlans`, 삭제 메서드 주석 |
| `apps/admin-service/src/store/store.service.ts` | modified | 입점 승인 5단계 업체 상품 설정 3행 · `store_detail` 삭제, 내 업체 소개 수정 소개 · 연락처만, 새 행 `is_deleted = 0` 6곳, 소프트 삭제 주석 |
| `apps/admin-service/src/store/store.constants.ts` | modified | `STORE_PLAN_DAYS_OF_WEEK_ALL` · `STORE_PLAN_DEFAULTS`, `STORE_DETAIL_KEYS` 삭제 |
| `apps/admin-service/src/store/store.util.ts` | modified | `buildStoreDetail` 삭제, 상세 응답의 `store_detail` 삭제 |
| `apps/admin-service/src/manager/repositories/manager.repository.ts` | modified | `findManagerStore` · `findSession` 에 `notDeleted` |
| `apps/admin-service/src/admin/repositories/admin.repository.ts` · `apps/user-service/src/user/repositories/user.repository.ts` | modified | `findSession` 에 `notDeleted` |
| `libs/contracts/src/store/dto/store-mine-profile.dto.ts` | modified | 소개 · 연락처만(`StoreMineProfileDetailDto` 삭제) |
| `libs/contracts/src/store/dto/store-detail.dto.ts` · `store-mine.dto.ts` | modified | 응답 `store_detail` 삭제 |
| `libs/contracts/src/store/store.commands.ts` · `apps/gateway/src/api/v1/admin-service/store/controllers/store.controller.queue.ts` | modified | 주석(편의시설 삭제) |
| `apps/admin-service/src/store/test/store.repository.spec.ts` | modified | 조건 `is_deleted: 0` · 소프트 삭제 단언 · `insertStorePlans` · 통일 500 표 · Smoke 스냅샷(dist 로 뽑은 SQL) |
| `apps/admin-service/src/manager/test/manager.repository.spec.ts` · `admin/test/admin.repository.spec.ts` · `user-service/src/user/test/user.repository.spec.ts` | modified | 업체 · 세션 조회의 `is_deleted: 0` |
| `apps/admin-service/src/store/test/store-application-approve.spec.ts` | modified | 업체 상품 설정 3행 · 실패 뒤 미호출 · `store_detail` 없음 |
| `apps/admin-service/src/store/test/store-mine-profile.spec.ts` | modified | 편의시설 케이스 삭제, 예전 클라이언트의 `store_detail` 무시 |
| `apps/admin-service/src/store/test/store-detail.spec.ts` · `store-mine.spec.ts` · `store.test-helper.ts` | modified | 응답에 `store_detail` 없음, mock `insertStorePlans`, 행에 `is_deleted: 0` |
| `docs/data-layer.md` · `docs/conventions.md` · `docs/architecture.md` · `AGENTS.md` · `README.md` · `.beaver/output/spec/platform/cache-spec.md` | modified | 엔티티 트리 · 타입(date · integer · 요일 비트) · `EXC_` · jsonb 기본값 · 종류별 1행 · 소프트 삭제 규칙(repository 가 조건) · 이름 규칙(음역 금지) · btree_gist · 편의시설 삭제 |

## Tests Written
- `store.repository.spec.ts`
  - [SUCCESS] 조회 · 개수 · 수정이 `is_deleted: 0` 을 더한다(OR 배열은 조건마다) — findApplication · countApplications · countStoreFiles · findStoreFile · updateStoreFile · findStore · findStores · countStores · updateStore · countUnavailablePeriods
  - [SUCCESS] 삭제 3종(파일 · 영업시간 · 브레이크타임)은 `delete` 없이 `update(조건 + is_deleted 0, is_deleted = 1 엔티티)`, 신청 · 일시 예약불가 삭제는 affected 1 → true / 0 → false
  - [SUCCESS] `insertStorePlans` 배열 insert, [FAIL:repository] 통일 500 표(삭제 5개 fake 가 update · insertStorePlans 추가)
  - [SMOKE:data-access] 신청 목록 2 · 업체 목록 · 파일 행 2 · 파일 업체 지정 · 신청 파일 삭제(UPDATE) · 소속 업체(잠금 2) · 영업시간 · 브레이크타임 · 일시 예약불가 목록 · 겹침 — `is_deleted = 0` 포함 SQL(dist 로 뽑음)
- `manager.repository.spec.ts` · `admin.repository.spec.ts` · `user.repository.spec.ts` — 업체 · 세션 조회가 `is_deleted: 0` 을 더한다
- `store-application-approve.spec.ts` — 업체 상품 설정 3행(RoomPlanEntity · PK 32자 · 새 업체 · 판매 1 · 매일 127 · 종류별 시간), 업체 엔티티에 `store_detail` 없음, 실패 3건에서 `insertStorePlans` 미호출
- `store-mine-profile.spec.ts` — 소개 · 연락처만 · 소개 빼면 null · 예전 `store_detail` 무시(엔티티 키 2개) · 404 · 연락처 검증 · 401
- `store-detail.spec.ts` · `store-mine.spec.ts` — 응답에 `store_detail` 없음
- room 엔티티 · 시드 · 마이그레이션 · `notDeleted` 단위 spec 은 두지 않는다(plan 의 테스트 생략 — docs/testing.md). 테스트 실행은 `/beaver:test`.

## Verification
- `npm run typecheck` · `npm run lint`(종료 0) · `npm run build`(4개 앱) · `npm run db:check`(엔티티 = 마이그레이션) 통과, 바꾼 TS 파일 Prettier 통과.
- PGlite scratch(직전 마이그레이션 + 기존 업체 2 · 파일 · 영업시간 → RoomSchema) 25/25 통과
  - 기존 업체마다 업체 상품 설정 3행(기본값 · PK 32자), 상품 종류 3행, `store_detail` 삭제, 기존 파일 `updated_at = created_at`
  - CHECK(시간 이용 + 입실 시각 · 1박 + 이용 시간 거부, 시작 > 종료 거부), 업체 × 종류 UK, 그룹명 부분 유니크(지운 이름 재사용 가능)
  - `@AfterLoad` — 빈 JSON 은 기본값, 저장된 항목은 그대로 · 빠진 항목만 기본값
  - 그룹 상품 기본값(사용 안 함 · 0), 배타 제약(겹침 23P01 · 맞닿음 허용 · 지운 기간과 겹침 허용)
  - 영업시간 두 번 교체(부분 유니크 통과 · 지금 행 1개), 지워지지 않은 같은 요일 중복 거부
  - down(store_detail 되살림 · room 테이블 삭제 · 삭제 표시 행 정리) → 다시 up
- 서브에이전트가 따로 쓴 메서드별 초안과 repository 메서드별 변경을 대조 — store 25 · manager 2 · admin 1 · user 1 · scheduler 0 일치. 초안의 일관성 제안(새 행 `is_deleted = 0` 명시 · 주석)을 반영했다.
- 업체 상세 · 내 업체 상세 응답은 필드를 골라 담아 `store_detail` 외 새 컬럼이 새지 않는다(store.util.ts `toStoreDetail` · `toMineDetail`).

## Remaining Issues
- 사용자 — 마이그레이션 `RoomSchema` 적용(`StoreReservationPolicy` 뒤). 적용 계정에 `btree_gist` 확장 생성 권한이 필요하다. 기존 업체의 편의시설 값(`store_detail`)은 사라진다.
- 알아 둘 것(지금 동작은 같음): 업체를 소프트 삭제하는 기능을 나중에 만들면 사업자등록번호도 마스킹해야 한다 — `UK_Store_BusinessNumber` 는 전체 행에 걸리는데 입점 신청의 중복 확인(`countStores`)은 지운 업체를 세지 않는다.
- 객실 관리 · 업체 상품 설정 · 그룹 상품 · 기간 가격 API 와 `isExclusionViolation` 변환은 Phase 13.
