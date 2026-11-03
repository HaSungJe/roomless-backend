# roomless-backend

무인 객실 대여 서비스 백엔드 — NestJS 12 모노레포(MSA).

- **gateway** — 유일한 외부 진입점(:3000). 로그인 그룹별 JWT 인증 · 입력 검증 후 서비스로 전달한다. 상태를 바꾸는 요청은 RabbitMQ 를 거쳐 처리하고 결과를 요청 단위 SSE 로 돌려준다. 공개 경로는 `/api/v1/<서비스>/<도메인>/...` 이다 — 이용자 `/api/v1/user-service/user` · 매니저(총매니저 · 매니저) `/api/v1/admin-service/manager` · 관리자(총관리자 · 관리자) `/api/v1/admin-service/admin` · 업체(입점 신청 · 업체 관리) `/api/v1/admin-service/store` · 객실 `/api/v1/admin-service/room` · 문 `/api/v1/user-service/door`. 서비스 내부 경로도 `/internal/v1/<서비스>/<도메인>/...` 다.
- **scheduler** — crontab 전용 서버(탈퇴 자동처리 · 결제 대기 만료 · 늦게 승인된 결제 환불 · 환불 처리). 들어오는 연결이 없고(포트 없음) DB · 토스에만 붙는다. 여러 대여도 DB 잠금으로 회차마다 1대만 실행한다.
- **user-service** — 이용자 서버(:4001, 내부망). SNS 가입 · 로그인(만 19세가 되는 해부터 — 청소년보호법) · 휴대폰 SMS 인증 · 아이디 찾기 · 탈퇴. PostgreSQL 을 소유하고(마이그레이션), 부팅 때 기본 데이터와 첫 총관리자(`admin` / `1234`)를 넣는다. 문: 호실 문마다 QR 정보 · 열림/닫힘 · 마지막 시각을 Redis 에 두고, 문 쪽 타 업체 프로그램이 부르는 문 열기(QR — `POST /api/v1/user-service/door/open`) · 문 닫기(`/close`)를 받는다(로그인 없음 — QR 이 열쇠). 예약: 호실별 예약 가능 시간(로그인 없음) · 예약(결제 대기 5분) · 토스 결제 확인 · 취소(업체 환불 규정 — 마감 전 100%, 마감 뒤 비율) · 내 예약, 업체 관리자의 예약 현황 · 업체 취소(100% 환불 + SMS) · 호실 이동(같은 그룹 + SMS) — `/api/v1/user-service/reservation`. 업체 · 객실 · 상품 · 영업시간은 공유 DB 에서 읽는다.
- **admin-service** — 관리자 서버(:4002, 내부망). 매니저(총매니저 · 매니저): 업체코드 + 아이디 로그인 · 비밀번호 변경 · 아이디 찾기 · 비밀번호 초기화(업체코드 + 등록된 휴대폰, 임시 비밀번호 SMS), 업체 총관리자의 업체 관리자 계정 등록 · 목록 · 상세 · 수정 · 비밀번호 초기화 · 정지 · 해제 · 삭제. 관리자(총관리자 · 관리자): 아이디 로그인 · 비밀번호 변경(첫 총관리자는 `POST /api/v1/admin-service/admin/login` 후 `PATCH /api/v1/admin-service/admin/password` 로 변경). 업체: 이용자의 입점 신청(업체 총관리자 아이디 · 비밀번호 포함) · 신청 취소 · 업체 정보 파일(사업자등록증 · 업체 사진) · 내 신청(승인되면 업체코드), 총관리자의 신청 승인(업체 + 업체코드 + 업체 총관리자 계정 + 승인 알림 SMS) · 반려 · 업체 목록 · 상세 · 수정 · 상태 변경(영업중지 사유) · 영업중 여부 변경, 업체 관리자의 내 업체 설정(상세 · 소개 · 사진과 순서 · 요일별 영업시간 · 매일 브레이크타임 · 정비시간 · 영업중 여부 · 예약 · 환불 규정(예약 n시간 전부터 · 환불 마감 n분 · 마감 뒤 환불 비율) · 일시 예약불가). 객실: 업체 관리자의 업체 상품 설정(시간 이용 · 1박 · 연박 — 사용 여부 · 예약 가능 요일 · 이용 시간 · 입퇴실 시각(1박은 항상 다음 날 퇴실) · 연박 최소 · 최대 박수) · 객실 그룹(상세정보 · 사진과 순서) · 그룹 상품(사용 여부 · 요금) · 상품별 기간 가격 · 호실(그룹은 등록 때만 — 수정으로 바꾸지 않는다) · 호실 상태(정비 완료 · 사용중지). 예약이 걸려 있는 호실 · 그룹은 지울 수 없다. user-service 와 같은 DB 를 직접 쓴다.
- 아이디 · 휴대폰 번호는 로그인 그룹(이용자 · 매니저 · 관리자) 안에서만 겹치지 않는다. 매니저 그룹은 업체 안에서만 — 다른 업체면 같은 아이디를 쓸 수 있고, 로그인 때 업체코드(매니저 화면 주소에 들어 있다)를 함께 받는다.

- **외부 연동** — 발송은 SMS 하나(Amazon SNS), 업체 정보 파일 · 객실 사진은 Amazon S3(presigned URL 로 클라이언트가 직접 업로드) — 공개 파일(업체 사진)은 CloudFront(CDN) 주소, 비공개 파일(사업자등록증)은 10분짜리 서명 주소로 본다. 결제는 토스페이먼츠(결제창 · 승인은 프론트, 서버는 토스 조회로 검증 · 환불 — 환불은 scheduler 가 백그라운드로, 전액 또는 일부 — [docs/guides/toss-setup.md](docs/guides/toss-setup.md)). mock 없이 실제 서비스에 붙는 코드이고, AWS 세팅은 [docs/guides/aws-setup.md](docs/guides/aws-setup.md) 를 따른다.

스택: NestJS 12 (ESM) · TypeORM 1.x + PostgreSQL 17 · RabbitMQ 4 · Redis 8(node-redis) · AWS SDK v3(SNS · S3) · 토스페이먼츠(fetch) · Vitest · oxlint.
규약과 구조는 [AGENTS.md](AGENTS.md) 와 [docs/](docs/) 를 본다.

## 실행

### 1. 준비 — `.env`

```bash
cp .env.example .env
```

| 꼭 채울 값 | 내용 |
|---|---|
| `JWT_SECRET` · `BCRYPT_CODE` · `TOKEN_CIPHER_KEY` · `INTERNAL_API_TOKEN` | 인증 · 암호화 비밀값(만드는 법은 `.env.example` 주석) |
| `RABBITMQ_GATEWAY_PASSWORD` · `RABBITMQ_USER_SERVICE_PASSWORD` · `RABBITMQ_ADMIN_SERVICE_PASSWORD` | 앱별 브로커 계정 |
| `REDIS_PASSWORD` · `REDIS_URL` | Redis 비밀번호 — `REDIS_URL` 안의 비밀번호와 같게 |
| `CORS_ORIGINS` | 프론트 주소 |

- `.env` 하나가 곧 서버 설정이다. Docker 는 값을 바꾸지 않고 그대로 쓰며, 필수값이 비어 있으면 띄우지 않는다.
- AWS 값(`AWS_REGION` · `AWS_ACCESS_KEY_ID` · `AWS_SECRET_ACCESS_KEY` · `AWS_S3_BUCKET` · `AWS_S3_PUBLIC_URL`)은 비워도 서버는 뜨고 SMS 발송 · 파일 요청만 실패한다(공개 파일 주소를 쓰려면 `AWS_S3_PUBLIC_URL` — CloudFront 배포 주소). 채우는 방법은 [docs/guides/aws-setup.md](docs/guides/aws-setup.md).
- 토스 시크릿 키(`TOSS_SECRET_KEY`)도 비워도 서버는 뜬다 — 예약 생성 · 결제 확인 · 환불만 실패한다(user-service · scheduler 가 쓴다). 테스트 키 받는 법 · 시험 순서는 [docs/guides/toss-setup.md](docs/guides/toss-setup.md).

### 2. 전체 실행 (Docker)

```bash
npm run docker:up     # 아래 묶음을 순서대로 빌드 + 실행
npm run docker:down   # 모두 내림 (공용 네트워크 · 데이터 볼륨은 남는다)
```

| 순서 | 묶음 | 명령 | 하는 일 |
|---|---|---|---|
| 1 | 공용 네트워크 | `npm run docker:network` | 묶음끼리 이름으로 찾는 네트워크 4개 (이미 있으면 건너뜀) |
| 2 | postgres | `npm run docker:postgres` | DB (127.0.0.1:5432) |
| 3 | rabbitmq | `npm run docker:rabbitmq` | 브로커 + 앱별 계정 초기화 (관리 화면 http://localhost:15672) |
| 4 | redis | `npm run docker:redis` | 문 정보 저장소 (127.0.0.1:6379, AOF 영속) — [docs/guides/redis-setup.md](docs/guides/redis-setup.md) |
| 5 | user-service | `npm run docker:user-service` | 마이그레이션 1회 → 인스턴스 N대 → 로드밸런서 |
| 6 | admin-service | `npm run docker:admin-service` | 매니저 · 관리자 인스턴스 → 로드밸런서 |
| 7 | scheduler | `npm run docker:scheduler` | crontab 전용 (포트 없음) |
| 8 | gateway | `npm run docker:gateway` | 외부 진입점 http://localhost:3000 · Swagger http://localhost:3000/swagger |

- 묶음마다 compose 파일이 따로 있어 하나씩 띄우고 내릴 수 있다(`npm run docker:<묶음>`). 로그는 `npm run docker:logs:<앱>`.
- gateway · user-service 는 여러 대(`GATEWAY_REPLICAS` · `USER_SERVICE_REPLICAS`, 기본 2), admin-service 는 `ADMIN_SERVICE_REPLICAS`(기본 1)로 뜨고 앞에 nginx 로드밸런서가 붙는다. scheduler 는 `SCHEDULER_REPLICAS`(기본 1)이고 포트 · 로드밸런서가 없다.
- user-service · admin-service 는 게이트웨이만 닿는다(전역 내부 토큰 가드 + internal 네트워크). 큐 명령도 gateway 브로커 계정이 발행한 것만 처리한다.
- 마이그레이션은 `migrate` 컨테이너(user-service 묶음)가 인스턴스보다 먼저 1회 적용한다. 적용 계정에는 PostgreSQL 확장 `btree_gist`(기간 가격 · 예약 점유 겹침 배타 제약) 생성 권한이 필요하다(RDS PostgreSQL 13+ 는 DB 의 CREATE 권한). admin-service 는 같은 DB 를 쓰므로 user-service 묶음 뒤에 띄운다.
- 같은 휴대폰 번호의 하루 인증 SMS 수는 `SMS_VERIFICATION_DAILY_LIMIT`(기본 10), DB 연결 풀 대기 최대 시간은 `DATABASE_CONNECTION_TIMEOUT_MS`(기본 30000ms — 넘기면 500).

### 3. 로컬 개발 — 인프라만 Docker, 앱은 watch

```bash
npm install
npm run docker:infra        # 공용 네트워크 + postgres + rabbitmq(+계정 초기화) + redis
npm run db:migrate
npm run start:user-service  # :4001
npm run start:admin-service # :4002
npm run start:gateway       # :3000
npm run start:scheduler     # crontab (포트 없음)
```

- 같은 `.env` 를 쓰려면 hosts 파일에 `127.0.0.1 postgres rabbitmq redis` 를 넣는다(인프라 묶음의 포트가 127.0.0.1 에 열려 있다).

### 4. 운영으로 옮길 때

- compose 는 그대로 두고 `.env` 의 접속정보만 바꾼다 — DB `DATABASE_URL`(RDS 등) · 브로커 `RABBITMQ_HOST`(Amazon MQ 등) · Redis `REDIS_URL`(ElastiCache 등, TLS 면 `rediss://`). 바꾼 인프라의 묶음(postgres · rabbitmq · redis)은 띄우지 않는다.
- 올리기 전 확인: `NODE_ENV=production`(development 는 JWT 만료를 검사하지 않는다) · 비밀값 새로 생성 · `POSTGRES_PASSWORD` · `RABBITMQ_PASSWORD` · `REDIS_PASSWORD` 변경 · `CORS_ORIGINS` 를 실제 프론트 주소로.
- 자세한 구성: [docs/architecture.md](docs/architecture.md) 의 "실행 (Docker)" · Redis: [docs/guides/redis-setup.md](docs/guides/redis-setup.md) · AWS: [docs/guides/aws-setup.md](docs/guides/aws-setup.md) · 토스: [docs/guides/toss-setup.md](docs/guides/toss-setup.md).

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
| `npm run docker:up` · `docker:down` | 모든 묶음 실행 · 종료 |
| `npm run docker:network` | 공용 Docker 네트워크 4개 만들기 (이미 있으면 건너뜀) |
| `npm run docker:postgres` · `docker:rabbitmq` · `docker:redis` · `docker:user-service` · `docker:admin-service` · `docker:scheduler` · `docker:gateway` | 묶음 하나만 실행 |
| `npm run docker:infra` | 공용 네트워크 · postgres · rabbitmq(+계정 초기화) · redis 만 실행 (앱 로컬 개발용) |
| `npm run docker:logs:gateway` · `docker:logs:user-service` · `docker:logs:admin-service` · `docker:logs:scheduler` | 앱 · 로드밸런서 로그 |
| `npm run broker:check` | 브로커 계정 권한 점검 (gateway 만 명령 발행 · user_id 위조 거부) |

## 구조

```
apps/gateway   apps/user-service   apps/admin-service   apps/scheduler   # 진입점 · 이용자 · 매니저/관리자 · crontab 전용
libs/account  libs/common  libs/contracts  libs/database  libs/integration  libs/messaging
libs/database/src/entities/<domain>/   libs/database/src/migrations/
libs/integration/src/sms/  libs/integration/src/storage/  libs/integration/src/redis/  libs/integration/src/door/  libs/integration/src/payment/   # SMS(SNS) · 파일 저장(S3) · Redis 연결 · 문 정보(Redis) · 결제(토스) 포트 · 어댑터
docs/  docs/guides/        # 규약 · AWS · Redis · 토스 세팅 가이드
.back/              # NestJS 11 시절 코드 (이식 참고용, git 제외 · 로컬 전용)
```
