# roomless-backend

무인 객실 대여 서비스 백엔드 — NestJS 12 모노레포(MSA).

- **gateway** — 유일한 외부 진입점(:3000). 로그인 그룹별 JWT 인증 · 입력 검증 후 서비스로 전달한다. 상태를 바꾸는 요청은 RabbitMQ 를 거쳐 처리하고 결과를 요청 단위 SSE 로 돌려준다. 공개 경로는 `/api/v1/<서비스>/<도메인>/...` 이다 — 이용자 `/api/v1/user-service/user` · 매니저(총매니저 · 매니저) `/api/v1/admin-service/manager` · 관리자(총관리자 · 관리자) `/api/v1/admin-service/admin` · 업체(입점 신청 · 업체 관리) `/api/v1/admin-service/store`. 서비스 내부 경로도 `/internal/v1/<서비스>/<도메인>/...` 다.
- **scheduler** — crontab 전용 서버(탈퇴 자동처리). 들어오는 연결이 없고(포트 없음) DB 에만 붙는다. 여러 대여도 DB 잠금으로 회차마다 1대만 실행한다.
- **user-service** — 이용자 서버(:4001, 내부망). SNS 가입 · 로그인(만 19세가 되는 해부터 — 청소년보호법) · 휴대폰 SMS 인증 · 아이디 찾기 · 탈퇴. PostgreSQL 을 소유하고(마이그레이션), 부팅 때 기본 데이터와 첫 총관리자(`admin` / `1234`)를 넣는다.
- **admin-service** — 관리자 서버(:4002, 내부망). 매니저(총매니저 · 매니저): 업체코드 + 아이디 로그인 · 비밀번호 변경 · 아이디 찾기 · 비밀번호 초기화(업체코드 + 등록된 휴대폰, 임시 비밀번호 SMS), 업체 총관리자의 업체 관리자 계정 등록 · 목록 · 상세 · 수정 · 비밀번호 초기화 · 정지 · 해제 · 삭제. 관리자(총관리자 · 관리자): 아이디 로그인 · 비밀번호 변경(첫 총관리자는 `POST /api/v1/admin-service/admin/login` 후 `PATCH /api/v1/admin-service/admin/password` 로 변경). 업체: 이용자의 입점 신청(업체 총관리자 아이디 · 비밀번호 포함) · 신청 취소 · 업체 정보 파일(사업자등록증 · 업체 사진) · 내 신청(승인되면 업체코드), 총관리자의 신청 승인(업체 + 업체코드 + 업체 총관리자 계정 + 승인 알림 SMS) · 반려 · 업체 목록 · 상세 · 수정 · 상태 변경. user-service 와 같은 DB 를 직접 쓴다.
- 아이디 · 휴대폰 번호는 로그인 그룹(이용자 · 매니저 · 관리자) 안에서만 겹치지 않는다. 매니저 그룹은 업체 안에서만 — 다른 업체면 같은 아이디를 쓸 수 있고, 로그인 때 업체코드(매니저 화면 주소에 들어 있다)를 함께 받는다.

- **외부 연동** — 발송은 SMS 하나(Amazon SNS), 업체 정보 파일 · 객실 사진은 Amazon S3(presigned URL 로 클라이언트가 직접 업로드) — 공개 파일(업체 사진)은 CloudFront(CDN) 주소, 비공개 파일(사업자등록증)은 10분짜리 서명 주소로 본다. mock 없이 실제 AWS 에 붙는 코드이고, AWS 세팅은 [docs/guides/aws-setup.md](docs/guides/aws-setup.md) 를 따른다.

스택: NestJS 12 (ESM) · TypeORM 1.x + PostgreSQL 17 · RabbitMQ 4 · AWS SDK v3(SNS · S3) · Vitest · oxlint.
규약과 구조는 [AGENTS.md](AGENTS.md) 와 [docs/](docs/) 를 본다.

## 실행 (Docker)

```bash
cp .env.example .env        # JWT_SECRET · BCRYPT_CODE · TOKEN_CIPHER_KEY · INTERNAL_API_TOKEN · RABBITMQ_*_PASSWORD(admin-service 포함) · CORS_ORIGINS 채우기
npm run docker:up           # 공용 네트워크 → postgres → rabbitmq → user-service → admin-service → scheduler → gateway 순서로 빌드 + 실행
```

- `.env` 하나가 곧 서버 설정이다. Docker 는 값을 바꾸지 않고 그대로 쓰며, 필수값이 비어 있으면 띄우지 않는다. 가상 운영(같은 서버의 postgres · rabbitmq 묶음)과 실제 운영(RDS · Amazon MQ 등)은 `.env` 의 접속정보로 고른다.
- postgres · rabbitmq · user-service · admin-service · scheduler · gateway 는 compose 파일이 따로 있어 각자 띄우고 내린다(`npm run docker:<묶음>`).
- gateway · user-service 는 여러 대(`GATEWAY_REPLICAS` · `USER_SERVICE_REPLICAS`, 기본 2), admin-service 는 `ADMIN_SERVICE_REPLICAS`(기본 1)로 뜨고 앞에 nginx 로드밸런서가 붙는다. scheduler 는 `SCHEDULER_REPLICAS`(기본 1)이고 포트 · 로드밸런서가 없다.
- 게이트웨이 http://localhost:3000 · Swagger http://localhost:3000/swagger · RabbitMQ 관리 화면 http://localhost:15672
- user-service · admin-service 는 게이트웨이만 닿는다(전역 내부 토큰 가드 + internal 네트워크). 큐 명령도 gateway 브로커 계정이 발행한 것만 처리한다.
- 마이그레이션은 `migrate` 컨테이너(user-service 묶음)가 user-service 인스턴스보다 먼저 1회 적용한다. admin-service 는 같은 DB 를 쓰므로 user-service 묶음 뒤에 띄운다.
- AWS 값(`AWS_REGION` · `AWS_ACCESS_KEY_ID` · `AWS_SECRET_ACCESS_KEY` · `AWS_S3_BUCKET` · `AWS_S3_PUBLIC_URL`)은 필수가 아니다. 비어 있어도 서버는 뜨고 부팅 경고만 남으며, SMS 발송 · 파일 요청만 실패한다(공개 파일 주소를 쓰려면 `AWS_S3_PUBLIC_URL` — CloudFront 배포 주소 — 가 있어야 한다). 채우는 방법은 [docs/guides/aws-setup.md](docs/guides/aws-setup.md).
- 같은 휴대폰 번호로 하루(한국 날짜)에 보내는 인증 SMS 수는 `SMS_VERIFICATION_DAILY_LIMIT`(기본 10)로 정한다.
- DB 연결 풀에서 연결을 기다리는 최대 시간은 `DATABASE_CONNECTION_TIMEOUT_MS`(기본 30000ms)다. 넘기면 그 요청은 실패(500)로 끝난다.
- 자세한 구성: [docs/architecture.md](docs/architecture.md) 의 "실행 (Docker)".

앱을 로컬에서 watch 로 개발할 때는 인프라만 띄운다.

```bash
npm install
npm run docker:infra        # 공용 네트워크 + postgres + rabbitmq + 브로커 계정 초기화
npm run db:migrate
npm run start:user-service  # :4001
npm run start:admin-service # :4002
npm run start:gateway       # :3000
npm run start:scheduler     # crontab (포트 없음)
```

## 명령

| 명령 | 내용 |
|---|---|
| `npm test` | 전체 테스트 (Vitest) |
| `npm run typecheck` | 타입 검사 |
| `npm run lint` · `npm run format` | oxlint · Prettier |
| `npm run build` | 세 앱 빌드 → `dist/apps/<app>/apps/<app>/src/main.js` |
| `npm run start:prod:gateway` · `start:prod:user-service` · `start:prod:scheduler` | 빌드 산출물 실행 |
| `npm run db:migrate` · `db:revert` | 마이그레이션 적용 · 마지막 1건 되돌리기 (실제 DB) |
| `npm run db:generate -- <Name>` · `db:check` | 엔티티 변경분 마이그레이션 생성 · 일치 검사 (DB 없이 PGlite) |
| `npm run docker:up` · `docker:down` | 다섯 묶음 모두 실행 · 종료 |
| `npm run docker:network` | 공용 Docker 네트워크 4개 만들기 (이미 있으면 건너뜀) |
| `npm run docker:postgres` · `docker:rabbitmq` · `docker:user-service` · `docker:admin-service` · `docker:scheduler` · `docker:gateway` | 묶음 하나만 실행 |
| `npm run docker:infra` | 공용 네트워크 · postgres · rabbitmq(+계정 초기화) 만 실행 (앱 로컬 개발용) |
| `npm run docker:logs:gateway` · `docker:logs:user-service` · `docker:logs:admin-service` · `docker:logs:scheduler` | 앱 · 로드밸런서 로그 |
| `npm run broker:check` | 브로커 계정 권한 점검 (gateway 만 명령 발행 · user_id 위조 거부) |

## 구조

```
apps/gateway   apps/user-service   apps/admin-service   apps/scheduler   # 진입점 · 이용자 · 매니저/관리자 · crontab 전용
libs/account  libs/common  libs/contracts  libs/database  libs/integration  libs/messaging
libs/database/src/entities/<domain>/   libs/database/src/migrations/
libs/integration/src/sms/  libs/integration/src/storage/   # SMS(SNS) · 파일 저장(S3) 포트 · 어댑터
docs/  docs/guides/        # 규약 · AWS 세팅 가이드
.back/              # NestJS 11 시절 코드 (이식 참고용, git 제외 · 로컬 전용)
```
