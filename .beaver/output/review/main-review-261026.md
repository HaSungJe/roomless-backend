# Review — store-application (Phase 9 업체 입점·관리) — 261026

> Pre-merge code review. Check the accumulated changes against the memory rules, AGENTS.md conventions, and the plan/spec intent.
> Location: `.beaver/output/review/` — direct 모드라 `<branch>-review-<YYMMDD>.md`.

## Target
- stick: 없음(direct 모드) — `main` 에 바로 커밋 · 푸쉬
- Included features: Phase 9 업체 입점·관리(#37 ~ #41) + build 중 사용자 요청 — 입점 신청 취소(삭제)
- Change scope: 수정 24 · 삭제 1(`store-image.entity.ts`) · 새 파일 — store 도메인(admin-service · 게이트웨이 · contracts 16), 엔티티 2, 마이그레이션 1, spec 16 + 도우미, spec · plan · report

## Convention Check (against AGENTS.md)
| Item | Result | Notes |
|------|------|------|
| Naming | pass | `<domain>.<role>.ts` · DTO kebab 15 · 클래스 `Store<Feature>…Dto` · `StoreQueueController` · 명령 `admin.store.<action-kebab>` · 엔티티 `t_store_file` · `t_store_file_purpose` · 제약명 `PK_/UK_/FK_/IDX_` |
| Structure & layering | pass | controller → service → repository 단방향, controller 는 위임 한 줄, 큐 컨트롤러는 providers 등록, 게이트웨이 동기 · 큐 2파일, 다른 도메인 테이블(t_user)은 store repository 가 store 어휘로(`findApplicant` · `insertHeadManager` · `updateStoreManagers`) |
| Shared logic extraction | pass | service private 헬퍼 0 — 키 · 아이디 · 문구 · 변환 · WHERE 는 `store.util.ts`, 임시 비밀번호 · bcrypt 는 libs util, 반복 메시지는 `store.constants.ts` 의 `*_MESSAGE` |
| Errors & responses | pass | repository try/catch + 통일 500 · 제약명별 400(`UK_StoreFile_FileKey` · `UK_Store_BusinessNumber` · `UK_User_PhoneLoginScope` · `UK_User_LoginIdLoginScope`), 입력 귀속 오류만 `validation_errors`(business_number · file_key), 응답 필드 생략 없음(null), 외부 발송 · 삭제는 마지막 단계 |
| Test strength | pass | API 1개당 service spec 1개(15) + repository spec. 엔티티 `toBeInstanceOf` · 컬럼 값 · 호출 순서 · 실패 뒤 미호출 · 판정(ack/requeue/dead) 단언, 한국어 리터럴, 분류 태그. 매핑 민감 빌더 6개 Smoke(SQL 전체 고정) |

memory 규칙: `git`(산출물 커밋 포함) — 지킴. `api-log`(자격증명 로그 평문 허용) — 승인 결과에 임시 비밀번호를 싣지 않고 SMS 로만 보낸다(해당 없음). `data-layer`(영업시간 세트) · `cache`(무효화) — 이번 변경에 영업시간 · 캐시 코드 없음, cache-spec 무효화 지점 표에 store 행을 더했다.

## Intended Behavior Check (against plan/spec)
- spec API 15개(#1 ~ #15)가 모두 있다 — 동기 7(조회 · 업로드 주소) · 큐 8(신청 · 취소 · 파일 등록 · 파일 삭제 · 승인 · 반려 · 수정 · 상태).
- 용도 룩업 `is_private` 가 키 접두(`private/` · `store/`)와 열람 주소(서명 · CDN)를 정한다 — 업로드 주소 · 등록(키 모양 재확인) · 상세 3곳 모두 룩업 값으로 고른다.
- 승인: 사업자등록증 1장 · 신청자 필수 → 업체(활성 · `is_open = 0`) → 파일 행에 `store_id` → 업체 총관리자(= 대표자, 성별 · 생년월일 복사, `m` + 8자리) → 신청 승인(대기 조건) → SMS(마지막). spec 순서와 같다.
- 신청 취소(build 중 추가): 대기 중 내 신청만, 파일 행(`store_id IS NULL`) → 신청 행(대기 조건) → S3 삭제(마지막). 동시 처리 보강(승인 · 반려도 대기 조건 · 0건이면 400 롤백)은 spec · plan 에 반영했다.
- 승인 신청을 신청자 목록에서 빼는 동작은 그대로다(사용자 재확인).
- 탈퇴: 매니저 BLOCK + 사업자번호 `DELETE_<store_id>`(컬럼 45자 — 39자 들어감) + `delete_backup`. 영업중지는 매니저 그대로.
- 첫 목록 API 규약 적용: Query DTO 생성자 · 컨트롤러 `new` · count → `Pagination` → 목록 · `{list, pagination}` · ILike 이스케이프.
- plan 과 다른 점: 도우미의 `purposeRow` · `applicantRow` 는 만들지 않고 spec 안 인라인 객체로 썼다 — 기능 차이 없음.
- 규약 문서: AGENTS.md · docs 7종 · README · `.env.example` 갱신. 미적용 → 적용 전환(Query DTO · Pagination · `@InternalActor`) 확인.
- 검증 명령: typecheck · lint · build · db:check · prettier 통과. 테스트 실행은 `/beaver:test` 몫.

## Findings
| # | Severity | Location (path:line) | Description | Recommendation |
|---|--------|-----------------|------|------|
| 1 | Low | apps/admin-service/src/store/repositories/store.repository.ts `updateApplication` · `deleteApplication` | 승인 · 반려 · 취소의 대기 조건이 관계 필드(`store_application_state_id` · `user_id`) where 인데 `Repository.update/delete` 경로라 Smoke 가 없다(service spec 은 mock). 리뷰 때 같은 빌더로 SQL 을 계산해 확인했다 — `UPDATE … WHERE ("store_application_id" = $4 AND "user_id" = $5 AND "store_application_state_id" = $6)` · `DELETE … WHERE (… = $1 AND … = $2 AND … = $3)` 정상. | 수용 권장 — 같은 모양의 평이한 등호 where 를 쓰는 `findApplication` · `countApplications` 와 같은 수준이다. 고정하려면 repository spec Smoke 에서 `UpdateQueryBuilder` · `DeleteQueryBuilder` 의 `execute` 를 가로채 SQL 을 단언하는 케이스를 더한다(build 로 되돌아감). |

## Memory Reconcile
- `data-layer` — 영업시간 세트 규칙(`AGENTS.md 반영: 미반영`, 코드 규칙). docs/data-layer.md 제약명 항목에 CHECK 식은 이미 있다. 남은 조항(입력 DTO 짝 필드 패턴 · service · 시드 · 테스트 데이터도 이 조합만)은 영업시간 API(Phase 11)가 생길 때 옮기는 것이 자연스럽다 — 지금 옮길지 사용자 확인.
- `cache` — 미반영이지만 캐시 코드가 아직 없다(Phase 23 때 옮김). 이번에는 제안하지 않는다.
- `git` · `api-log` — 운영 결정(불필요). 제안하지 않는다.

## Verdict
Pass — High · Medium 없음. Low 1건은 사용자가 수용(2026-10-26), 영업시간 세트 규칙 이관은 Phase 11 때로(사용자 결정).
