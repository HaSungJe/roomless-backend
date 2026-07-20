# roomless-backend

객실 대여 백엔드 API 서버 — 호텔/모텔 등 숙박업소의 무인 객실 예약/결제 및 체크아웃을 관리합니다.
**[Beaver](https://github.com/HaSungJe/beaver)** 플러그인을 통해 AI(Claude)와 협업하는 구조화된 개발 워크플로를 사용합니다.

---

## Stack

| 분류 | 기술 |
|------|------|
| Framework | NestJS 11 |
| ORM | TypeORM 0.3 (MySQL) |
| Auth | JWT + Passport |
| Queue | BullMQ + Redis |
| Docs | Swagger |
| Runtime | Node.js + TypeScript 5 |

---

## 시작하기

### 1. 환경변수 설정

`.env.example`을 복사해 `.env`를 생성합니다.

```bash
cp .env.example .env
```

```env
# 실행환경
NODE_ENV=development

# Server
SERVER_NAME=roomless-backend
SERVER=DEV
SERVER_PORT=3000

# Swagger
SWAGGER_URL=http://localhost:3000
SWAGGER_TARGET_SELECT=F
SWAGGER_TARGET=
SWAGGER_PATH=swagger

# MySQL
TYPEORM_SYNC=T
MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_DB=test_database
MYSQL_ID=test
MYSQL_PW=1234

# JWT
JWT_SECRET=your_jwt_secret

# BullMQ Redis
BULLMQ_REDIS_HOST=localhost
BULLMQ_REDIS_PORT=6379

# refresh_token 복원용 AES-256-GCM 키
# 키 생성: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
TOKEN_CIPHER_KEY=
```

### 2. Redis 실행 (Docker)

```bash
npm run redis:up
```

### 3. 패키지 설치 및 앱 실행

```bash
npm install
npm run dev
```

---

## 프로젝트 구조

```
src/
├── api/v1/
│   └── <domain>/              # Feature 모듈
│       ├── dto/
│       ├── entities/          # TypeORM Entity
│       ├── interfaces/        # Repository Interface
│       ├── repositories/      # Repository 구현체
│       ├── test/              # 기능별 spec 파일
│       ├── <domain>.controller.ts
│       ├── <domain>.service.ts
│       ├── <domain>.module.ts
│       └── <domain>.symbols.ts
├── shared/                    # 공유 Entity/Repository (controller 없음)
├── common/                    # DTO, 유틸리티 (no @Module)
│   ├── dto/
│   └── utils/
├── config/                    # 환경변수 설정
├── exception/                 # 전역 예외 필터
├── guards/                    # JWT Auth, Roles
│   ├── passport.jwt.auth/
│   └── roles/
└── modules/                   # 인프라 @Module
    ├── queue/                 # BullMQ
    ├── typeorm/               # TypeORM
    └── firebase-cloud-message/
```

---

## Repository 패턴

단순 CRUD는 범용 메서드로 통일하고, WHERE 조건은 서비스에서 구성해 전달합니다.

```typescript
// Interface
update(where: FindOptionsWhere<UserEntity>, entity: UserEntity): Promise<void>;

// Service — 조건을 서비스에서 구성
const entity = new UserEntity();
entity.login_pw = await getBcrypt(dto.new_login_pw);
await this.repository.update({ user_id: dto.user_id }, entity);
```

- 복잡한 조인·집계·페이지네이션은 기능별 메서드(QueryBuilder) 허용
- `update()` 시 `new XxxEntity()`로 객체 생성 → `@BeforeUpdate` 훅 자동 트리거 (`update_at` 자동 갱신)

---

## BullMQ Write Queue

Write API(INSERT/UPDATE/DELETE)의 동시성 문제를 해결하기 위한 **`@UseQueue` 커스텀 데코레이터**를 포함합니다.

```typescript
// @UseQueue를 반드시 @Transactional() 위에 배치
@UseQueue('user-consumer', 'user-service-sign')
@Transactional()
async sign(dto: SignDto): Promise<void> {
    // 기존 로직 그대로
}
```

- 같은 `consumerKey` → Worker 1개, concurrency 1 → FIFO 직렬 처리
- 다른 `consumerKey` 간 병렬 처리
- Bull Board 대시보드: `http://localhost:{SERVER_PORT}/queues`

---

## API 문서 (Swagger)

```
http://localhost:3000/swagger
```

---

## 주요 npm 스크립트

```bash
npm run dev          # 개발 서버 (watch)
npm run build        # 빌드
npm run start:prod   # 프로덕션 실행
npm run lint         # ESLint 자동 수정
npm run format       # Prettier 포맷
npm test             # 테스트 전체 실행
npm run test:watch   # 테스트 watch 모드
npm run test:cov     # 커버리지 리포트
npm run redis:up     # Redis 컨테이너 시작
npm run redis:down   # Redis 컨테이너 종료
```

---

## 도메인 생성

Claude에게 아래 명령으로 도메인 스캐폴딩을 요청합니다.

```
reserve 도메인생성
```

생성되는 파일:
```
src/api/v1/reserve/
├── entities/          # 사람이 직접 Entity 작성
├── reserve.module.ts  # 기본 NestJS 모듈 (빈 상태)
└── reserve.symbols.ts # Repository Symbol 선언 공간
```

- `app.module.ts` 자동 등록
- Entity는 사람이 직접 설계 및 작성
- 이후 기능 개발은 Beaver 워크플로로 진행

---

## Beaver 워크플로

AI 코딩 어시스턴트(Claude)를 **구조적으로 제어**하기 위해 [Beaver](https://github.com/HaSungJe/beaver) 플러그인을 사용합니다. 각 단계는 슬래시 커맨드 또는 자연어로 동일하게 발동됩니다.

| 단계 | 슬래시 | 자연어 | 동작 |
|------|--------|--------|------|
| 분석(1회) | `/beaver:analyze` | "코드베이스 분석" | 규약(CLAUDE.md + docs/) · `.beaver/config.json` 생성 |
| 기획 | `/beaver:plan <기능명>` | "<기능명> 기획", "기능 생성/수정" | spec → plan (변경이면 revision) 작성 |
| 구현 | `/beaver:build` | "작업 시작", "구현" | TDD(red→green) + 자가수복 + report. **커밋 안 함** |
| 배포 | `/beaver:ship` | "커밋하고 푸쉬", "작업 마무리" | 커밋 · 자가 코드리뷰 · 푸쉬 · 통합 브랜치 병합 |
| 충돌 해결 | `/beaver:resolve` | "충돌 해결" | 병합 충돌 통합 (ship 중 자동) |
| 리팩토링 | `/beaver:refactor` | "비슷한 기능 묶기", "중복 정리" | 계획 → 승인 → 실행, 동작 보존 검증 |

### 흐름

`plan`→`build`(기획→구현)를 한 stick 브랜치에 누적 → `ship`이 커밋·리뷰·푸쉬·통합 브랜치(`main`) 병합.

### 산출물 / 설정 위치

```
.beaver/
├── config.json                 # 스택 · 커맨드 · 경로 · 브랜치 설정
├── output/
│   ├── spec/<domain>/          # 기능 명세 (<feature>-spec.md)
│   ├── plan/<domain>/          # 구현 계획 (<feature>-plan.md)
│   ├── revision/<domain>/      # 변경 계획 (<feature>-revision-<YYMMDD>-<N>.md)
│   ├── report/<domain>/        # 구현 리포트 (<feature>-report.md)
│   └── review/                 # ship 코드리뷰 (<stick>-review-<YYMMDD>.md)
└── memory/                     # 프로젝트 공유 메모리 (MEMORY.md + 항목별 md)
```

규약 상세는 [CLAUDE.md](CLAUDE.md) 및 [docs/](docs/) 참고.

### 테스트 자동 생성

`build` 단계에서 기능별 spec 파일을 함께 생성합니다 (mock 기반 unit test).

```
src/api/v1/<domain>/test/<feature>.spec.ts

  [SUCCESS]          × 1  — 정상 흐름
  [FAIL:validation]  × 3~5 — 대표 분기 샘플링
  [FAIL:duplicate]   × N  — INSERT 테이블마다
  [FAIL:service]     × N  — service throw마다
  [FAIL:repository]  × N  — repository catch마다
```

> 테스트 강도·구성 규칙: [docs/testing.md](docs/testing.md)
