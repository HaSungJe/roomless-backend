# Ship Review — worktree-stick+manager-x9nz1y → main · 2026.07.20

## 대상
가맹점 등록(store-register) — stick base(main `42ac96e`) 대비: **신규 9파일**(store 도메인 전체 + spec) + **수정 2파일**(app.module 2줄, roles.guard 8줄) + 기획 문서 3종.

## 리뷰 결과

### memory 규칙 (최우선)
- 커밋 형식(날짜 + 빈 줄 + `-항목`, 트레일러 금지) 적용 예정. 산출물 문서 커밋 포함 규칙 적용. 미반영(`unapplied`) 항목 없음 — git.md 는 `applied`.

### 규약 준수
- **명명**: 레이어 `store.<role>.ts`, DTO kebab `store-register.dto.ts`, 엔티티 `store.entity.ts`, 클래스 `Store<Feature><Role>` + 응답 `StoreRegisterResultDto`(`ResponseDto` 아님) ✓. 하위 폴더 role 분리(dto/entities/repositories/interfaces/test) ✓.
- **Entity**: `t_store` + comment, `PK_Store`/`UK_Store_BusinessNumber` PascalCase, `@Unique()` 클래스 데코레이터(`@Column({unique})` 아님), 전 컬럼 comment, `@BeforeInsert`/`@BeforeUpdate` 훅(`@CreateDateColumn` 아님) ✓.
- **Repository**: try/catch + errno 1062 제약명 분기 400 + 통일 500 리터럴, `@InjectRepository` 는 repository 내부에만 ✓. sibling(`user.repository.insertUser`)과 동일 계약.
- **Service**: public 1개 = API 1개, private 헬퍼 없음, `new StoreEntity()`+할당(객체 리터럴 ❌), `@Transactional()`, Symbol 토큰 + `import type` 인터페이스 ✓.
- **Controller**: `@ApiTags('가맹점')` → `@Controller('/api/v1/store')`, 핸들러 앞 `/`, 입력은 DTO 타입, 파라미터 한 줄, 위임 1줄, `@HttpCode(200)`, 응답 데코레이터 `type` 만 ✓.
- **Module**: `@SetMetadata` 3종 + `forFeature` + `{provide, useClass}` + `app.module.ts` 등록 ✓.
- **DTO 검증**: 허용 데코레이터 집합만(`@Matches`/`@MaxLength`/`@IsNotEmpty`/`@IsOptional`), 한국어 리터럴 message, 순서(`@ApiProperty`→제약→`@IsNotEmpty`) ✓.
- `git diff --check` 공백 오류 0건.

### Data-Access Smoke
- **해당 없음** — 신규 data-access 는 `insertStore` 1개로 criteria 없는 insert 전용. 관계 필드 where·QueryBuilder·동적 조립 없음 → docs/testing.md "매핑 민감 쿼리 구성" 미해당, mock 커버 허용.

### 의도 부합 (plan/spec 대비)
- plan File List 11항목 전부 구현(문서 갱신 1항목 제외 — 아래 발견 사항 #1). Design 코드와 실제 파일 1:1 일치(엔티티 컬럼·검증식·서비스 할당·데코레이터·모듈 메타).
- 범위 준수: 사용자 지시대로 **가맹점 등록만**, 매니저 등록·`t_user` 변경은 미포함(spec Decisions 에 사유 기록).
- **RolesGuard 첫 적용 품질**: 테스트가 가드를 mock 하지 않고 실제로 태워 SUPER_ADMIN/ADMIN 통과·USER/MANAGER 403 을 검증 — 권한 로직이 구조적으로 통과하는 사각지대 없음.
- 응답 흐름 검증(추론): `ForbiddenException({message})` → `CustomErrorFilter` 가 `exception['response']` 전달 → 403 `{message:'접근 권한이 없습니다.'}`, spec 단언과 일치.

### 초안 규약 문서
- 해당 없음 — §4.5 draft 문서를 만들지 않았음(사용자 승인 대기 상태, 발견 사항 #1).

## 발견 사항
| # | 심각도 | 내용 |
|---|---|---|
| 1 | **중간 → 해소** | CLAUDE.md/docs 의 "역할 기반 권한 적용 0건 — 미적용/규약" 서술이 사실과 어긋남 → **사용자 승인 후 커밋 전 반영 완료**: CLAUDE.md(Auth 절 적용 규약화·디렉터리 주석·메서드 데코레이터 순서에 `@Roles` 추가), docs/architecture.md(guards 주석), docs/api.md(`@Roles` 배치 규약 + 403 처리 + 코드 예시) |
| 2 | 낮음(정보) | 테스트 미실행 — 신규 13케이스의 실행 검증은 ship 후 `/beaver:test` 필요(워크트리에 의존성 없음) |
| 3 | 낮음(정보) | `t_store` 실스키마 생성은 사용자 몫(`TYPEORM_SYNC=T` 는 부팅 시 자동 생성) |

## 결론
**통과** (발견 사항 #1은 문서 갱신 여부 결정만 남음). 커밋 메시지:

```
2026.07.20

-가맹점(store) 도메인 신설 + 가맹점 등록 API 추가 (SUPER_ADMIN/ADMIN 전용)
-RolesGuard 첫 적용 및 거부 응답 한국어 메시지로 변경
```
