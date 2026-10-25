# Report — store-application

## Feature Summary
- **Feature**: 업체 입점 · 관리(Phase 9 #37 ~ #41)
  - 이용자: 입점 신청 · **신청 취소(build 중 추가 — 삭제)** · 업체 정보 파일(사업자등록증 1 · 업체 사진 5) · 내 신청
  - 총관리자: 신청 목록 · 상세 · 승인(업체 + 업체 총관리자 계정 + SMS) · 반려, 업체 목록 · 상세 · 수정 · 상태 변경
- **Entry point**: 게이트웨이 `/api/v1/admin-service/store`(동기 7 · 큐 8) → admin-service store 도메인(`/internal/v1/admin-service/store` · `admin.store.*`)
- **Domain**: store (admin-service — 새 도메인)
- **Plan**: [store-application-plan.md](../../plan/store/store-application-plan.md) · **Spec**: [store-application-spec.md](../../spec/store/store-application-spec.md)

## Created/Modified/Deleted Files
| File | Change Type | Description |
|------|-----------|------|
| `libs/database/src/entities/store/store-application.entity.ts` | modified | `business_license_image_key` · `head_manager_name` 삭제, `head_manager_phone` → `owner_phone`(대표자 = 업체 총관리자) |
| `libs/database/src/entities/store/store-file-purpose.entity.ts` | created | 업체 정보 파일 용도 룩업 + `is_private` |
| `libs/database/src/entities/store/store-file.entity.ts` | created | 업체 정보 파일(신청 → 승인 때 같은 행에 `store_id`) |
| `libs/database/src/entities/store/store-image.entity.ts` | deleted | `t_store_file` 로 합침 |
| `libs/database/src/entities.ts` · `seeder/seeder.targets.ts` | modified | 엔티티 등록 · `STORE_FILE_PURPOSE_SEED_DATA` |
| `libs/database/src/migrations/1792953783038-StoreFile.ts` · `migrations.ts` | created · modified | 생성 + 손 보정(RENAME COLUMN · `t_store_image` DROP · down 복원) |
| `libs/integration/src/{interfaces/integration.interface.ts, integration.constants.ts, storage/s3-storage.gateway.ts}` | modified | `createDownloadUrl`(presigned GET, 10분) |
| `apps/gateway/src/modules/transport/internal-http.client.ts` | modified | `query` 옵션(undefined · null 제외) |
| `libs/contracts/src/store/store.commands.ts` | created | `STORE_COMMAND`(8 — `APPLICATION_CANCEL` 포함) · `STORE_INTERNAL_PATH`(경로 함수) |
| `libs/contracts/src/store/dto/*.dto.ts` (15) | created | 기능당 DTO — `store-application-cancel.dto.ts` 포함 |
| `apps/admin-service/src/store/**` | created | module · symbols · constants · util · service(15 public) · repository(+ interface) · controllers 2종 |
| `apps/admin-service/src/store/test/*` (17) | created | test helper + service spec 15 + repository spec |
| `apps/admin-service/src/admin-service.module.ts` | modified | `StorageModule` · `StoreModule` |
| `apps/gateway/src/api/v1/admin-service/store/**` · `gateway.module.ts` | created · modified | 공개 라우트(동기 7 · 큐 8) · `StoreModule` |
| `AGENTS.md` · `docs/{architecture,conventions,data-layer,integration,testing,api}.md` · `docs/guides/aws-setup.md` | modified | store 도메인 · 목록 규약 "적용" · `@IsLatitude`/`@IsLongitude` · 경로 함수 · `@InternalActor` 사용 · 룩업 플래그 · 조건부 쓰기 boolean · 저장 키 · CDN · CloudFront 기본 구성(OAC · `store/*` 만) · Smoke 목록 |
| `README.md` · `.env.example` | modified | admin-service 업체 기능 · 공개 파일 = CloudFront 주소 |
| `.beaver/output/spec/store/store-application-spec.md` · `plan/store/store-application-plan.md` | created | 기획 + build 중 추가(신청 취소 · 동시 처리 보강) 반영 |
| `.beaver/output/spec/platform/cache-spec.md` | modified | 무효화 지점 표에 store 행 |

## Tests Written
- service 기능 spec 15 (`apps/admin-service/src/store/test/`):
  - 이용자 — `store-apply` · `store-application-cancel` · `store-my-application-list` · `store-my-application` · `store-application-file-upload-url` · `store-application-file` · `store-application-file-delete`
  - 총관리자 — `store-application-list` · `store-application-detail` · `store-application-approve` · `store-application-reject` · `store-list` · `store-detail` · `store-update` · `store-state`
  - 큐 경로는 `runCommand` 로 판정(ack · requeue · dead)과 done · failed 본문을, 동기 경로는 supertest 로 상태 · 본문 · 검증 오류를 단언한다.
  - repository · 저장소 · SMS 포트 호출 인자(엔티티 `toBeInstanceOf` · 컬럼 값)와 실패 뒤 미호출, 호출 순서(파일 행 → 신청 행 → S3 삭제, 승인 → SMS)까지 단언한다.
- repository spec `store.repository.spec.ts`:
  - 제약명별 400 — `UK_StoreFile_FileKey` · `UK_Store_BusinessNumber` · `UK_User_PhoneLoginScope` · `UK_User_LoginIdLoginScope`
  - 그 밖 제약 · DB 실패는 통일 500(it.each 17), `updateApplication` · `deleteApplication` 의 affected → boolean
  - `findApplicant` · `findStoreFilePurpose` 조건
  - `[SMOKE:data-access]` — 신청 목록(검색 OR · 내 신청 IN) · 업체 목록(이스케이프 패턴) · 파일 조회(용도 조인 · 별칭 = `StoreFileRow` 키) · 파일 업체 지정 · 신청 파일 삭제(`store_id IS NULL`) · 매니저 상태 SQL 전체 고정(빌드한 dist 로 계산한 SQL)
- build 단계라 실행하지 않았다(`/beaver:test` 몫). `npm run typecheck` · `npm run lint` · `npm run build` · `npm run db:check` · prettier 는 통과.

## Verification
- **신청 취소(사용자 요청, build 중 추가)**
  - `DELETE /api/v1/admin-service/store/application/mine/:store_application_id` → `admin.store.application-cancel` → `cancelMyApplication`.
  - 대기 중 내 신청만 받는다(남의 · 승인 404, 반려 400).
  - 한 트랜잭션에서 파일 행(`store_id IS NULL`) → 신청 행(대기 조건)을 지운다. S3 파일은 마지막에 지운다.
  - 취소한 신청은 목록 · 상세 · 중복 확인 어디에도 남지 않는다(행이 없다).
- **동시 처리 보강** — 취소가 행을 지우므로 승인과 겹치면 업체 · 계정만 남을 수 있었다. 그래서 승인 · 반려는 신청 상태를 대기 조건으로 바꾸고, 0건이면 400 을 던져 전체를 롤백한다(승인은 SMS 전). 취소도 대기 조건 삭제 0건이면 400 이다. 승인이 먼저 커밋되면 파일에 `store_id` 가 있어 취소 쪽 파일 삭제에 걸리지 않는다.
- **승인 신청은 계속 신청자 목록에서 뺀다** — 사용자가 "승인 신청도 보이게" 를 꺼냈다가 거두었다(신청 · 업체 정보가 다른 테이블). 코드 변경 없음.
- 나머지는 plan 의 설계와 대조했다 — 용도 룩업 `is_private` 로 키 접두 · 열람 주소 결정, 대표자 = 업체 총관리자, 승인 직후 활성 + 영업준비, 탈퇴만 매니저 정지 · 사업자번호 마스킹, 첫 목록 API 규약(Query DTO 생성자 · count → Pagination → 목록).
- 엔티티 ↔ 마이그레이션 `db:check` 일치. 마이그레이션 up/down 은 PGlite 로 확인했다(`owner_phone` 값 보존, `t_store_image` 삭제 · 복원).

## Remaining Issues
- 사용자 작업(개발이 다 끝난 뒤 한꺼번에): 마이그레이션 적용(`1792953783038-StoreFile`), CloudFront 배포 + OAC + 버킷 정책 `store/*` + 퍼블릭 액세스 차단 4항목 켬, `.env` 의 `AWS_S3_PUBLIC_URL` 을 CloudFront 주소로 — [docs/guides/aws-setup.md](../../../../docs/guides/aws-setup.md).
- 반려 신청은 신청자가 지울 수 없다(취소는 대기 중만). 반려 신청 삭제가 필요하면 같은 취소 API 의 허용 상태를 넓히면 된다.
- 로드맵 구조 반영(ship 때): #40 의 삭제 API 제외 · 신청 취소 추가, #35 의 `t_store_image` → `t_store_file`, Phase 9 가 마이그레이션을 더하므로 Phase 12 · 22 와 동시에 돌리지 않는다.
