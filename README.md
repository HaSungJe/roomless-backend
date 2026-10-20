# roomless-backend

무인 객실 대여 서비스 백엔드 — NestJS 12 모노레포(MSA).

- **gateway** — 유일한 외부 진입점(:3000). JWT · 입력 검증 후 서비스로 전달한다. 상태를 바꾸는 요청은 RabbitMQ 를 거쳐 처리하고 결과를 요청 단위 SSE 로 돌려준다.
- **user-service** — 회원 도메인(:4001, 내부망). PostgreSQL 을 소유한다.

- **외부 연동** — 발송은 SMS 하나(Amazon SNS), 업체 · 객실 사진은 Amazon S3(presigned URL 로 클라이언트가 직접 업로드). mock 없이 실제 AWS 에 붙는 코드이고, AWS 세팅은 [docs/guides/aws-setup.md](docs/guides/aws-setup.md) 를 따른다.

스택: NestJS 12 (ESM) · TypeORM 1.x + PostgreSQL 17 · RabbitMQ 4 · AWS SDK v3(SNS · S3) · Vitest · oxlint.
규약과 구조는 [AGENTS.md](AGENTS.md) 와 [docs/](docs/) 를 본다.

## 실행 (Docker)

```bash
cp .env.example .env        # JWT_SECRET · BCRYPT_CODE · TOKEN_CIPHER_KEY · INTERNAL_API_TOKEN · RABBITMQ_*_PASSWORD · CORS_ORIGINS 채우기
npm run docker:up           # 공용 네트워크 → postgres → rabbitmq → user-service → gateway 순서로 빌드 + 실행
```

- `.env` 하나가 곧 서버 설정이다. Docker 는 값을 바꾸지 않고 그대로 쓰며, 필수값이 비어 있으면 띄우지 않는다. 가상 운영(같은 서버의 postgres · rabbitmq 묶음)과 실제 운영(RDS · Amazon MQ 등)은 `.env` 의 접속정보로 고른다.
- postgres · rabbitmq · user-service · gateway 는 compose 파일이 따로 있어 각자 띄우고 내린다(`npm run docker:<묶음>`).
- gateway · user-service 는 여러 대(`GATEWAY_REPLICAS` · `USER_SERVICE_REPLICAS`, 기본 2)로 뜨고 앞에 nginx 로드밸런서가 붙는다.
- 게이트웨이 http://localhost:3000 · Swagger http://localhost:3000/swagger · RabbitMQ 관리 화면 http://localhost:15672
- user-service 는 게이트웨이만 닿는다(전역 내부 토큰 가드 + internal 네트워크). 큐 명령도 gateway 브로커 계정이 발행한 것만 처리한다.
- 마이그레이션은 `migrate` 컨테이너가 user-service 인스턴스보다 먼저 1회 적용한다.
- AWS 값(`AWS_REGION` · `AWS_ACCESS_KEY_ID` · `AWS_SECRET_ACCESS_KEY` · `AWS_S3_BUCKET` · `AWS_S3_PUBLIC_URL`)은 필수가 아니다. 비어 있어도 서버는 뜨고 부팅 경고만 남으며, SMS 발송 · 파일 요청만 실패한다(사진 공개 주소를 쓰려면 `AWS_S3_PUBLIC_URL` 이 있어야 한다). 채우는 방법은 [docs/guides/aws-setup.md](docs/guides/aws-setup.md).
- 자세한 구성: [docs/architecture.md](docs/architecture.md) 의 "실행 (Docker)".

앱을 로컬에서 watch 로 개발할 때는 인프라만 띄운다.

```bash
npm install
npm run docker:infra        # 공용 네트워크 + postgres + rabbitmq + 브로커 계정 초기화
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
| `npm run docker:up` · `docker:down` | 네 묶음 모두 실행 · 종료 |
| `npm run docker:network` | 공용 Docker 네트워크 4개 만들기 (이미 있으면 건너뜀) |
| `npm run docker:postgres` · `docker:rabbitmq` · `docker:user-service` · `docker:gateway` | 묶음 하나만 실행 |
| `npm run docker:infra` | 공용 네트워크 · postgres · rabbitmq(+계정 초기화) 만 실행 (앱 로컬 개발용) |
| `npm run docker:logs:gateway` · `docker:logs:user-service` | 앱 · 로드밸런서 로그 |
| `npm run broker:check` | 브로커 계정 권한 점검 (gateway 만 명령 발행 · user_id 위조 거부) |

## 구조

```
apps/gateway        apps/user-service
libs/common  libs/contracts  libs/database  libs/integration  libs/messaging
libs/database/src/entities/<domain>/   libs/database/src/migrations/
libs/integration/src/sms/  libs/integration/src/storage/   # SMS(SNS) · 파일 저장(S3) 포트 · 어댑터
docs/  docs/guides/        # 규약 · AWS 세팅 가이드
.back/              # NestJS 11 시절 코드 (이식 참고용, git 제외 · 로컬 전용)
```
