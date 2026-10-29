# Report — store-operation

## Feature Summary
- **Feature**: 업체 운영 설정(Phase 11 — #44 · #45 · #46 · #47 · #94 + 새 유닛 일시 예약불가)
  - 업체 관리자(업체 총관리자 · 업체 관리자)가 자기 업체의 상세 · 소개 · 연락처 · 편의시설 · 사진(순서 포함) · 요일별 영업시간(휴무 · 연중무휴) · 매일 브레이크타임(서로 겹침 없음) · 정비시간 · 영업중 여부 · 일시 예약불가(일시 범위 · 겹침 없음 · 메모 30자)를 설정한다.
  - 같은 변경에서: 날짜 · 시각 처리를 dayjs 로 통일(직접 만든 계산 제거 · `kst.ts` 삭제), 검증 규약 확장(중첩 · 배열 · 숫자 범위), 기준선 테스트 실패 4건(Phase 9 · 10) 보정.
- **Entry point**: 게이트웨이 `/api/v1/admin-service/store/mine…`(동기 3 · 큐 10, `PassportJwtManagerAuthGuard`) → admin-service store 도메인(`/internal/v1/admin-service/store/mine…` · `admin.store.mine-*`)
- **Domain**: store (+ 공통 dayjs — user · manager · admin · scheduler · libs)
- **Plan**: [store-operation-plan.md](../../plan/store/store-operation-plan.md) · **Spec**: [store-operation-spec.md](../../spec/store/store-operation-spec.md)

## Created/Modified/Deleted Files
| File | Change Type | Description |
|------|-----------|------|
| `libs/database/src/entities/store/store-break.entity.ts` | modified | `day_of_week` · `IDX_StoreBreak_StoreIdDayOfWeek` 삭제 → `IDX_StoreBreak_StoreId`, 매일 브레이크타임 |
| `libs/database/src/entities/store/store-unavailable-period.entity.ts` | created | `t_store_unavailable_period`(`starts_at` · `ends_at` · `memo` 30자, `CHK_StoreUnavailablePeriod_StartsAtEndsAt`, `IDX_…_StoreIdStartsAt`) |
| `libs/database/src/entities/store/store-file.entity.ts` · `entities.ts` | modified | `file_key` COMMENT · JSDoc(업체 사진 키), 새 엔티티 등록 |
| `libs/database/src/migrations/1793037973399-StoreOperation.ts` · `migrations.ts` | created · modified | db:generate + 손 보정(down 의 `day_of_week` — 기본값 0 후 제거 · COMMENT, 예전 인덱스 컬럼 순서) |
| `libs/common/src/utils/dayjs.ts` | created | 플러그인(customParseFormat · utc · timezone)을 붙인 dayjs · `Dayjs` · `KST_TIMEZONE` |
| `libs/common/src/utils/kst.ts` | deleted | `kstDayStart` · `kstYear` → dayjs |
| `libs/common/src/utils/validation.ts` | modified | 중첩 오류를 점 경로(`hours.0.open_time`)로 펼친다 |
| `libs/common/src/utils/jwt.ts` · `libs/account/src/utils/sms-verification.ts` · `libs/integration/src/storage/s3-storage.gateway.ts` | modified | exp · 인증 만료 비교 · 만료 시각 계산을 dayjs |
| `apps/user-service/src/user/{user.service,user.util}.ts` · `apps/admin-service/src/{manager/manager.service,admin/admin.service}.ts` · `apps/scheduler/src/user/crontabs/user-leave-cleanup.crontab.ts` | modified | 하루 발송 수 시작점 · refresh 만료 · 연 단위 나이를 dayjs, import 출처를 공통 모듈로 |
| `libs/contracts/src/store/store.commands.ts` | modified | 명령 10 · 내부 경로 3 |
| `libs/contracts/src/store/dto/store-mine*.dto.ts` (13) | created | 상세 · 소개 · 사진(업로드 주소 · 등록 · 삭제 · 순서) · 영업시간 · 브레이크 · 정비 · 영업중 · 일시 예약불가(목록 · 등록 · 삭제) |
| `apps/admin-service/src/store/{store.constants,store.util,store.service}.ts` | modified | 상수(반복 메시지 승격 · `STORE_DETAIL_KEYS` · `STORE_DATETIME_FORMAT`), util(키 발급 공통화 · 업체 사진 · 겹침 · 변환), service 13 메서드 |
| `apps/admin-service/src/store/{interfaces,repositories}/*` | modified | 메서드 12 + 빌더 4(`buildStoreByManagerQuery` · `buildStoreHoursQuery` · `buildStoreBreaksQuery` · `buildUnavailablePeriodListQuery`) |
| `apps/admin-service/src/store/controllers/*` · `apps/gateway/src/api/v1/admin-service/store/controllers/*` | modified | 동기 3 · 큐 10, `/mine…` 을 `/:store_id` 앞에 |
| `apps/admin-service/src/store/test/*` | created · modified | 새 spec 11 · 도우미 · repository spec · 기준선 보정 |
| `apps/user-service/src/user/test/{user-phone-verification,user-find-login-id}.spec.ts` · `apps/admin-service/src/manager/test/manager-find-login-id.spec.ts` | modified | `kstDayStart` 기대값 → 고정값 |
| `AGENTS.md` · `docs/{conventions,data-layer,api,testing,architecture}.md` · `README.md` | modified | 검증 확장 · dayjs 규칙 · 영업시간 세트(memory 이관) · 일시 범위 컬럼 이름 · 업체 행 잠금 · PUT · Smoke 목록 · 큐 경로 중첩 검증 |
| `.beaver/output/spec/platform/cache-spec.md` | modified | discovery 무효화 지점 표 |
| `.beaver/memory/datetime.md` · `MEMORY.md` | created · modified | 날짜 · 시각은 dayjs(사용자 결정 2026-10-27) |

## Tests Written
- store service 기능 spec 11개(새로)
  - 동기: `store-mine`(상세) · `store-mine-file-upload-url` · `store-mine-unavailable-period-list`
  - 큐: `store-mine-profile` · `store-mine-file` · `store-mine-file-delete` · `store-mine-file-order` · `store-mine-hours` · `store-mine-breaks` · `store-mine-open` · `store-mine-unavailable-period`
  - `[CASES:breaks-overlap]` 사용자 합의 11개를 큐 경로로(겹치지 않음 1 · 2 · 3 · 4 · 5a · 5b, 겹침 6 ~ 10, 시작 = 마감 11)
  - `[FAIL:validation]` — 동기는 내부 ValidationPipe, 큐 DTO(편의시설 · 영업시간 · 브레이크 · 일시 예약불가 · 메모 30자)는 도우미 `validateBody`(게이트웨이와 같은 파이프)로 점 경로 단언
  - 단언 — 잠금 인자(`findStoreByManager(user_id, true|false)`), 엔티티 `toBeInstanceOf` · 컬럼 값, 호출 순서(삭제 → 넣기 · 행 삭제 → 저장소 삭제), 실패 뒤 미호출, Date 고정(`vi.useFakeTimers({toFake: ['Date']})`)
- repository spec — 새 메서드 통일 500 8개 · `deleteUnavailablePeriod` affected → boolean · 배열 insert, Smoke 6개(소속 업체 잠금 없음 · 있음, 영업시간, 브레이크, 일시 예약불가 목록 · 겹침)
- 기준선 보정 — `store.repository.spec` 스냅샷 3건(Phase 10 컬럼), `store-application-list.spec` 1건(페이지 기대값), kst 기대값 3개 spec
- 테스트 생략(위임형) — 정비시간 · 일시 예약불가 삭제, 게이트웨이 · controller · util · 마이그레이션(plan 대로)

## Verification
- `npm run typecheck` · `npm run lint` · `npm run build`(4개 앱) · `npm run db:check` 통과, 바뀐 TS 파일 Prettier 통과(`migrations.ts` 는 HEAD 부터 생성기 한 줄 형식이라 그대로).
- 기준선(build 전 `npm test`): 4 failed / 343 passed — 모두 테스트 쪽 기대값이 늦은 것이었고 이번에 고쳤다. build 는 테스트를 돌리지 않았다 — 실행은 `/beaver:test`.
- Smoke SQL 은 빌드한 dist 로 실제 SQL 을 뽑아 고정했다(scratch, 접속 없음).
- PGlite 확인(scratch, 테스트 밖) 14항목 모두 OK
  - 마이그레이션 8개 up → `StoreOperation` down(브레이크 행이 있어도 요일 0 · 예전 인덱스 `(store_id, day_of_week)`) → 다시 up(요일 없음)
  - `findStoreByManager` — 매니저 → 업체(`store_state_id` 문자열), 탈퇴 업체 매니저 · 이용자 → null, 트랜잭션 밖 잠금 → 500, 트랜잭션 안 잠금 조회
  - 영업시간 요일 순 · `time` 문자열, 브레이크 조회, CHECK(시작 = 종료 거부), 일시 예약불가 목록 · 겹침 1 · 맞닿음 0, 남의 업체 삭제 false
- plan 과 다른 점
  - `buildStoreByManagerQuery` 의 `loadAllRelationIds({disableMixedMap: true})` 는 PGlite 확인에서 `store_state_id` 를 `{store_state_id: 'ACTIVE'}` 객체로 채웠다 → 옵션 없는 `loadAllRelationIds()` 로 고쳤다(find 옵션 `loadRelationIds: true` 와 같은 동작, SQL 같음). plan 도 고쳤다.
  - 생성된 마이그레이션 down 이 예전 인덱스를 `(day_of_week, store_id)` 순서로 · 요일 COMMENT 없이 만들어 원래대로 고쳤다.
- 의도 확인(읽기): 13개 라우트 · 명령이 spec 표와 같다. 쓰기 10개는 모두 `@Transactional()` + 업체 행 잠금, 조회 3개는 잠그지 않는다. 사업자등록증은 삭제 · 순서 대상이 아니다(용도 조건). 직접 만든 날짜 계산은 `grep "getTime()\|\* 1000\|utils/kst\|from 'dayjs'"`(테스트 · 마이그레이션 · dayjs.ts 제외) 0건.

## Remaining Issues
- 사용자 몫(배포 때): 마이그레이션 `StoreOperation` 적용(`StoreCodeManagerScope` 뒤 — 기존 브레이크 행은 요일 없이 매일로 남는다).
- 일시 예약불가 범위에 걸리는 기존 예약의 특수 표시는 예약 기능(Phase 17)에서 구현한다.
- `/beaver:test` 에서 새 spec 을 처음 실행한다 — 특히 `validateBody` 의 첫 메시지 · 점 경로 단언과 dayjs 시간대 계산(테스트 머신 TZ 무관하게 고정값으로 단언).

## Modification - 261029-1

리비전: [store-operation-revision-261029-1.md](../../revision/store/store-operation-revision-261029-1.md)

### Change summary
- 관리자(총관리자 · 관리자) 영업중 여부 전환 `PATCH /api/v1/admin-service/store/:store_id/open`(큐 `admin.store.open`) — 탈퇴 업체 · 같은 값 400, 없는 업체 404. 관리자가 바꾸는 운영 설정은 이것 하나.
- 영업중지 정지 사유 `t_store.suspend_comment` — 영업중지로 바꿀 때만 저장(선택 · 255자), 활성 · 탈퇴면 비운다. 관리자 업체 상세 · 내 업체 상세에 보인다.
- 업체별 예약 · 환불 규정 `t_store.booking_open_hours`(이용 시작 n시간 전부터 예약, 1 ~ 4,320, 기본 72) · `refund_deadline_hours`(n시간 전까지 100% 환불 · 이후 환불 신청 불가, 0 ~ 168, 기본 1), 설정 `PATCH /mine/reservation-policy`(큐 `admin.store.mine-reservation-policy`). 적용(예약 · 환불 신청 차단 · 스냅샷 · 토스페이먼츠 백그라운드 환불)은 Phase 17.
- 입점 승인 때 72 · 1 · null 을 넣는다. 마이그레이션 `StoreReservationPolicy`(기존 행은 DB 기본값).

### Changed files
| File | Change Type | Description |
|------|-----------|------|
| `libs/database/src/entities/store/store.entity.ts` | modified | 컬럼 3 |
| `libs/database/src/migrations/1793260428802-StoreReservationPolicy.ts` · `migrations.ts` | created · modified | db:generate + down 의 불필요한 COMMENT 제거 · 설명 |
| `libs/contracts/src/store/store.commands.ts` | modified | `OPEN` · `MINE_RESERVATION_POLICY` |
| `libs/contracts/src/store/dto/store-open.dto.ts` · `store-mine-reservation-policy.dto.ts` | created | 입력 DTO |
| `libs/contracts/src/store/dto/{store-state,store-detail,store-mine}.dto.ts` | modified | `suspend_comment?` 입력 · 결과 세 필드 |
| `apps/admin-service/src/store/{store.constants,store.util,store.service}.ts` · `controllers/store.controller.queue.ts` | modified | 기본값 상수 · 변환 · 승인 기본값 · `changeStoreState` 사유 · `changeStoreOpen` · `changeMyStoreReservationPolicy` · `@OnCommand` 2 |
| `apps/gateway/src/api/v1/admin-service/store/controllers/store.controller{,.queue}.ts` | modified | `PATCH /mine/reservation-policy`(매니저) · `PATCH /:store_id/open`(관리자, `/mine/open` 뒤) · 설명 |
| `apps/admin-service/src/store/test/*` | created · modified | 새 spec 2 · 기존 spec 4 · 도우미 · Smoke 스냅샷 |
| `docs/data-layer.md` · `README.md` · `.beaver/output/spec/platform/cache-spec.md` | modified | 기간 설정 컬럼 · 설명 · 무효화 지점 2행 |

### Tests written
- 새 spec: `store-open`(성공 · 없는 업체 404 · 탈퇴 400 · 같은 값 400 — 수정 미호출), `store-mine-reservation-policy`(잠금 인자 · 두 값만 수정 · 소속 업체 없음 404 · 범위 검증 3 · 경계 2 · actor 없음 401)
- 고친 spec: `store-state`(사유 있음 · 없음 · 활성 복귀 비움 · 탈퇴 비움), `store-detail` · `store-mine`(응답 세 필드 — 내 업체는 영업중지 · 사유 행), `store-application-approve`(승인 기본값 72 · 1 · null), 도우미 `storeRow`, `store.repository.spec` `STORE_SELECT`(실제 SQL 로 확인)
- 테스트 생략(위임형): 게이트웨이 라우트 · DTO 클래스 · 마이그레이션(PGlite 로 확인)

### Verification
- typecheck · lint · build(4개 앱) · db:check 통과(종료 코드 0), 바뀐 TS Prettier 통과. build 는 테스트를 돌리지 않았다 — 실행은 `/beaver:test`.
- `STORE_SELECT` 스냅샷이 dist 로 뽑은 실제 SQL 과 같다(scratch).
- PGlite: 직전 마이그레이션까지 적용한 DB 의 업체 행 → `StoreReservationPolicy` 적용 뒤 72 · 1 · NULL, 되돌리기 → 세 컬럼 없음, 다시 적용 OK.
- 의도 확인(읽기): 관리자 라우트는 `/:store_id/state` 다음 · `/mine/open` 뒤라 `mine` 이 업체 ID 로 잡히지 않는다. 관리자 영업중 여부는 형제 관리자 쓰기처럼 잠금 없는 `findStore`, 규정 설정은 내 업체 쓰기라 업체 행 잠금.

### Remaining issues
- 사용자 몫(배포 때): 마이그레이션 `StoreReservationPolicy` 적용(`StoreOperation` 뒤).
- 로드맵(ship): Phase 11 에 유닛(#99 예약 · 환불 규정 · #100 관리자 영업중 여부 · #101 정지 사유) 추가, 공통 규칙 "취소 · 환불" · "사전 예약" 갱신, Open Decision "취소 규정의 끝" · "결제 수단" 해결 표시, Phase 17 #67 · #69 · #70 메모. build 는 이미 done 인 Phase 11 유닛을 되돌리지 않으려고 상태 표시를 하지 않았다.
