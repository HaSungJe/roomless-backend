# Review — worktree-stick+store-4m8kqp — 260728

대상: `main`(0f3aefc) 대비 워킹트리 전체 — 인력 API 4개 + 비밀번호 변경 1개 + 전화번호 중복 허용 정리.

## 결과 요약

| 항목 | 판정 |
|---|---|
| memory 규칙 준수 | 통과 |
| 명명·구조·공통로직 분리 | 통과 |
| 에러/응답 규약 | 통과 |
| 테스트 강도 | 통과 |
| Data-Access Smoke 커버리지 | 통과 |
| 기획 의도 일치 | 통과 |
| §1.7 죽은 코드 정리 | 통과 |
| **findings** | **3건 (medium 1 / low 2)** |

## memory 규칙 대조 (최우선)

| 규칙 | 대조 결과 |
|---|---|
| [dto.md](../../memory/dto.md) — Query DTO 생성자 세트 + 컨트롤러 `const dto = new XXX(query);` | `StoreStaffListDto` 가 `data?: Partial<T>` 생성자 보유, 컨트롤러 `staffList` 가 `const dto = new StoreStaffListDto(query);` 후 위임 — **준수** |
| dto.md 함정 ① 무인자 호출 내성 | `new StoreStaffListDto()` 단위 테스트 2건으로 회귀 방지 — **준수** |
| dto.md 함정 ② 쿼리 값은 문자열 | service 가 산술하지 않고 `Pagination` 에 위임 — **준수** |
| dto.md 함정 ③ 부모 필드 재선언 금지 | `StoreStaffListDto` 는 자기 3필드만 선언 — **준수** |
| dto.md — 입력 DTO 전 필드에 class-validator 데코레이터 최소 1개 | 신규 입력 DTO 5종의 모든 필드가 제약 또는 `@IsOptional()` 보유 — **준수** |
| [db.md](../../memory/db.md) — 로컬 자동 싱크, 스키마를 build 차단 항목으로 걸지 않음 | plan 을 "스키마 변경(로컬 자동 반영)" 으로 작성, 운영용 ALTER 만 별도 기재 — **준수** |
| [git.md](../../memory/git.md) — 커밋 메시지 형식, `.beaver/output/` 커밋 포함 | §2 에서 적용 |

**memory reconcile**: `미반영` 상태 항목 없음(dto.md `applied`, db.md `not needed`, git.md `applied`). 추가 조치 불필요.

## CLAUDE.md 규약 대조

- **명명** — DTO kebab `store-<feature>.dto.ts`, 클래스 `<Domain><Feature><Role>`, 응답 `ResultDto`, param DTO `<...>ParamDto`. **통과**
- **DTO 독립 선언** — `StoreHeadManagerRegisterResultDto` 와 `StoreManagerRegisterResultDto` 가 필드 동일하지만 독립 선언(규약대로). **통과**
- **컨트롤러** — 입력 전부 DTO 타입, 파라미터 한 줄, 로직은 `staffList` 의 DTO 생성 1줄뿐. 데코레이터 순서 준수. **통과**
- **Validation** — 허용 집합(`@IsNotEmpty`/`@IsOptional`/`@IsIn`/`@Matches`/`@MaxLength`)만, 전 제약에 한국어 `message`, `@IsNotEmpty` 맨 마지막. **통과**
- **Entity** — `store_id` 는 `@ManyToOne`+`@JoinColumn({foreignKeyConstraintName})`, `is_password_change_required` 에 comment. **통과**
- **Repository** — 신규 7메서드 전부 try/catch + 통일 500, insert 는 errno 1062/1452 분기(신규 `FK_User_Store` 포함), 조회 `loadRelationIds: true`, `update` 는 `new UserEntity()` 전달. **통과**
- **Service** — public 9개 = API 9개, private 헬퍼 0(순수함수는 `store.util.ts`), 쓰기 3개에 `@Transactional()`, 엔티티 `new`+할당. **통과**
- **Seed** — `HEAD_MANAGER` 를 [seeder.targets.ts](../../../src/modules/seeder/seeder.targets.ts) 한 곳에만 정의, 엔티티는 구조 컬럼만. **통과**
- **`crypto` import 형식** — `randomInt` 를 `from 'crypto'` 로 가져와 [cipher.ts:1](../../../src/common/utils/cipher.ts)·[hash.ts:1](../../../src/common/utils/hash.ts) 선례와 일치. **통과**

## Data-Access Smoke 커버리지

`buildStaffSearchWhere` 가 `auth_id`·`state_id`·`store_id`(전부 `@ManyToOne` 관계 필드)에 `In`/`Not`/스칼라를 섞고 where 배열 OR 까지 쓰는 **매핑 민감 구성**이라 해당됨. [store-staff-list.spec.ts](../../../src/api/v1/store/test/store-staff-list.spec.ts) 의 `[SMOKE:data-access]` 가 무연결 `DataSource` 로 4가지 분기 + 관계 필드 정렬(`auth_id ASC`) SQL 빌드를 검증하고, `UserEntity` 위험 매핑 스냅샷(`[]`)으로 `store_id` 추가 후에도 신규 위험 매핑이 없음을 고정. **mock-only 아님 — 통과.**

## 기획 의도 일치

spec 의 Business Rules 28개를 구현과 대조 — 전부 일치. 특히:
- 규칙 4(`t_user_setting` 동반 생성) — 두 생성 메서드 모두 `insertStaffSetting` 호출, 전용 테스트로 고정
- 규칙 7(업체당 총괄 1명) — `state_id In(['ACTIVE','BLOCK','LEAVE_WAIT'])` 로 확인하므로 **LEAVE 된 총괄은 슬롯을 비운다**(교체 가능) ✓ 의도대로
- 규칙 15(`store_id` 보존) — 삭제 entity 에 `state_id` 만 할당, 테스트가 `store_id` `undefined` 를 단언
- 규칙 16(총괄 권한 경계) — `auth_id === 'HEAD_MANAGER' && (store 불일치 || 대상이 MANAGER 아님)` → 403
- 규칙 24(SNS 로그인 응답 제외) — `UserLoginResultDto` 는 무변경 ✓

## §1.7 죽은 코드 정리

`UK_User_Phone` 제거에 딸린 정리를 모두 수행:
- [user.repository.ts](../../../src/api/v1/user/repositories/user.repository.ts) 의 errno 1062 `UK_User_Phone` 분기 **삭제**(제약 제거로 도달 불가)
- [user.leave-cleanup.service.ts:42](../../../src/api/v1/user/user.leave-cleanup.service.ts) 마스킹 근거 주석 정정(동작 무변경 — 마스킹은 PII 익명화 목적이라 유지)
- grep 확인: `UK_User_Phone` 잔재는 위 주석 1건뿐이며 코드 참조 0건

## Findings

### F-1 (medium) — 임시 비밀번호가 API 로그에 평문으로 적재된다

- **위치**: [api-log.interceptor.ts:44](../../../src/modules/api-log/api-log.interceptor.ts) · [:103](../../../src/modules/api-log/api-log.interceptor.ts)
- **근거(소스 확인)**: 전역 `ApiLogInterceptor` 가 `res.send` 를 monkey-patch 해 응답 body 를 통째로 캡처하고(`capturedBody = body`), `entity.response_body = this.parseResponseBody(capturedBody)` 로 **마스킹 없이** `t_api_log` 에 저장한다.
- **실패 시나리오**: `POST /api/v1/store/head-manager/register` 성공 → 응답의 `temporary_password` 평문이 `t_api_log.response_body` 에 영구 저장. DB 열람 권한이 있는 사람은 발급된 모든 인력 계정의 초기 비밀번호를 볼 수 있다.
- **완화 요인**: 임시 비밀번호이고 변경이 권장되지만, **서버가 변경을 강제하지 않으므로**(결정된 사양) 바꾸지 않은 계정은 로그의 값으로 그대로 로그인된다.
- **범위 판단**: 이번 변경이 **새로 만든 노출 경로**(응답 측 자격증명)다. 다만 요청 측은 이미 같은 문제가 있다 — `extractBody` 도 `req.body` 를 마스킹 없이 저장하므로 기존 `sign`/`login`/`general-sign`/`general-login` 의 `login_pw` 가 **이미 평문으로 로깅되고 있다**(선행 문제).
- **결론: 기각(사용자 결정 2026-07-28)** — "이건 진행하지 않음. 로그에 그냥 다 찍히게". 마스킹을 도입하지 않고 자격증명이 평문으로 적재되는 것을 **의도적으로 허용**한다. 요청 측은 이전부터 같은 상태였으므로 이번 결정으로 응답 측까지 정책이 일관되게 확정됐다.
- **후속 처리**: [.beaver/memory/api-log.md](../../memory/api-log.md) 에 정책으로 기록했다 — 앞으로 자격증명을 응답에 싣는 API 를 만들어도 로그 노출을 finding 으로 올리지 않는다.

### F-2 (low) — `sign`/`generalSign` 이 `is_password_change_required` 를 명시 초기화하지 않는다 → **수정 완료(사용자 승인)**

> **조치**: [user.service.ts:73](../../../src/api/v1/user/user.service.ts)(`sign`)·[:151](../../../src/api/v1/user/user.service.ts)(`generalSign`)에 `userEntity.is_password_change_required = 0;` 추가. 기능 변화 없이 `store.service.register` 의 `delete_backup = null` 과 형태를 맞췄다.

- **위치**: [user.service.ts:37](../../../src/api/v1/user/user.service.ts) `sign` · [:115](../../../src/api/v1/user/user.service.ts) `generalSign`
- **내용**: 두 가입 경로가 신규 컬럼을 대입하지 않는다. 엔티티에 `default: 0` 이 있어 TypeORM insert 가 컬럼을 생략하고 DB 기본값 0 이 적용되므로 **동작상 문제는 없다.** 다만 [store.service.ts](../../../src/api/v1/store/store.service.ts) `register` 가 같은 이유의 `delete_backup` 을 `null` 로 명시 초기화한 것과 형태가 어긋난다.
- **해결**: 두 곳에 `userEntity.is_password_change_required = 0;` 추가. 정합성 목적이며 기능 변화 없음.

### F-3 (low) — 총괄매니저가 없는 업체에는 ADMIN 이 매니저를 추가할 수 없다

- **위치**: [store.controller.ts](../../../src/api/v1/store/store.controller.ts) `managerRegister` 의 `@Roles('HEAD_MANAGER')`
- **내용**: 매니저 생성은 총괄매니저 전용이므로, 총괄매니저를 삭제한 업체는 ADMIN 이 **새 총괄매니저를 만들기 전까지 매니저를 충원할 수 없다.** spec 규칙 17(총괄 삭제 시 매니저는 유지, ADMIN 이 새 총괄로 이어받음)과 모순되지 않는 **의도된 결과**다.
- **실패 시나리오**: 운영상 "총괄 공석 기간에 매니저만 급히 추가" 가 불가능하다. 막힌 게 아니라 순서가 강제되는 것.
- **해결**: 그대로 두는 것을 권장(위임 구조의 일관성). 필요해지면 `@Roles('SUPER_ADMIN','ADMIN','HEAD_MANAGER')` 로 넓히고 service 에서 ADMIN 은 `store_id` 를 body 로 받도록 분기.

## §4.5 규약 문서 — 작성 완료(사용자 승인)

[docs/architecture.md](../../../docs/architecture.md) 에 **"도메인 간 데이터 접근"** 절을 신설하고 [CLAUDE.md](../../../CLAUDE.md) Architecture 절에 요약 1문단을 추가했다. 코드가 이미 존재하는 상태에서 실제 구현을 보고 작성했으므로 **초안 마커 없이 정식 규약으로 확정**한다(마커는 "코드보다 먼저 쓴 문서"를 표시하는 장치이므로 해당 없음).

명문화한 것: ① 소유 도메인은 API 경로가 정한다 ② `forFeature` 에 남의 엔티티를 등록하되 남의 `@Module` 은 import 하지 않는다 ③ 메서드명은 소유 도메인 어휘(`insertUser` ❌ → `insertStaff`) ④ sibling 계약은 원 소유 도메인을 따른다 ⑤ 엔티티 import 는 단방향 ⑥ service→service 를 택하지 않은 이유.

## 미결 사항

- 이 리뷰는 **테스트를 실행하지 않았다**(worktree 에 의존성 없음). 67케이스의 최초 실행은 ship 후 `/beaver:test`.
- **비밀번호 변경 시 기존 세션 무효화 없음** — spec 규칙 22 대로 범위 밖. 탈취된 세션이 비밀번호 변경 후에도 유효하다. 별도 건.
