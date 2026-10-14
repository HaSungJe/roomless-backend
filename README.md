# roomless-backend

무인 객실 대여 서비스 백엔드 — NestJS 12 모노레포(MSA).

- **gateway** — 유일한 외부 진입점(:3000). JWT · 입력 검증 후 서비스로 전달한다. 상태를 바꾸는 요청은 RabbitMQ 를 거쳐 처리하고 결과를 요청 단위 SSE 로 돌려준다.
- **user-service** — 회원 도메인(:4001, 내부망). PostgreSQL 을 소유한다.

스택: NestJS 12 (ESM) · TypeORM 1.x + PostgreSQL 17 · RabbitMQ 4 · Vitest · oxlint.
규약과 구조는 [CLAUDE.md](CLAUDE.md) 와 [docs/](docs/) 를 본다.

## 실행 (Docker)

```bash
cp .env.example .env        # JWT_SECRET · BCRYPT_CODE · TOKEN_CIPHER_KEY · INTERNAL_API_TOKEN · RABBITMQ_*_PASSWORD · CORS_ORIGINS 채우기
npm run docker:up           # postgres · rabbitmq · migrate · user-service · gateway 빌드 + 실행
```

- 게이트웨이 http://localhost:3000 · Swagger http://localhost:3000/swagger · RabbitMQ 관리 화면 http://localhost:15672
- user-service 는 게이트웨이만 닿는다(전역 내부 토큰 가드 + internal 네트워크). 큐 명령도 gateway 브로커 계정이 발행한 것만 처리한다.
- 마이그레이션은 `migrate` 컨테이너가 user-service 보다 먼저 1회 적용한다.

앱을 로컬에서 watch 로 개발할 때는 인프라만 띄운다.

```bash
npm install
npm run docker:infra        # postgres + rabbitmq + 브로커 계정 초기화
npm run db:migrate
npm run start:user-service  # :4001
npm run start:gateway       # :3000
```

## 명령

| 명령 | 내용 |
|---|---|
| `npm test` | 전체 테스트 (Vitest) |
| `npm run typecheck` | 타입 검사 |
| `npm run lint` · `npm run format` | oxlint · Prettier |
| `npm run build` | 두 앱 빌드 → `dist/apps/<app>/apps/<app>/src/main.js` |
| `npm run start:prod:gateway` · `start:prod:user-service` | 빌드 산출물 실행 |
| `npm run db:migrate` · `db:revert` | 마이그레이션 적용 · 마지막 1건 되돌리기 (실제 DB) |
| `npm run db:generate -- <Name>` · `db:check` | 엔티티 변경분 마이그레이션 생성 · 일치 검사 (DB 없이 PGlite) |
| `npm run docker:up` · `docker:down` · `docker:logs` | 전체(인프라 + 두 앱) 컨테이너 실행 · 종료 · 로그 |
| `npm run docker:infra` | postgres · rabbitmq · rabbitmq-init 만 실행 (앱 로컬 개발용) |
| `npm run broker:check` | 브로커 계정 권한 점검 (gateway 만 명령 발행 · user_id 위조 거부) |

## 구조

```
apps/gateway        apps/user-service
libs/common  libs/contracts  libs/database  libs/messaging
libs/database/src/entities/<domain>/   libs/database/src/migrations/
.back/              # NestJS 11 시절 코드 (이식 참고용, git 제외 · 로컬 전용)
```
