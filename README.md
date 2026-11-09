# roomless-backend

무인 객실 대여 서비스 백엔드 — NestJS 12 모노레포(MSA).

- **gateway** — 유일한 외부 진입점(:3000). 로그인 그룹별 JWT 인증 · 입력 검증 후 서비스로 전달한다. 상태를 바꾸는 요청은 RabbitMQ 를 거쳐 처리하고 결과를 요청 단위 SSE 로 돌려준다. 공개 경로는 `/api/v1/<서비스>/<도메인>/...` 이다 — 이용자 `/api/v1/user-service/user` · 매니저(총매니저 · 매니저) `/api/v1/admin-service/manager` · 관리자(총관리자 · 관리자) `/api/v1/admin-service/admin` · 입점 신청(이용자) `/api/v1/user-service/store` · 업체 관리 `/api/v1/admin-service/store` · 객실 `/api/v1/admin-service/room` · 예약(이용자) `/api/v1/user-service/reservation` · 업체 예약(업체 관리자) `/api/v1/admin-service/reservation` · 업체 둘러보기 `/api/v1/user-service/discovery`(로그인 없음) · 이용자 관리(총관리자 · 관리자) `/api/v1/admin-service/user` · 통계(총관리자 · 관리자 전체, 업체 관리자 `/mine`) `/api/v1/admin-service/stats`. 이용자가 쓰는 기능은 user-service, 업체 관리자 · 업체 총관리자 · 관리자 · 총관리자 전용 기능은 admin-service 에 둔다. 서비스 내부 경로도 `/internal/v1/<서비스>/<도메인>/...` 다. 문 쪽 타 업체 프로그램과는 문 소켓 `/ws/v1/door`(표준 WebSocket — 아래 "문 소켓")로 주고받는다. 모든 HTTP 요청(성공 · 실패와 그 사유 — 경로 · 입력 · 상태 · 응답 · 회원 · IP · 처리 시간, Swagger 문서 제외)은 응답이 끝난 뒤 API 로그(`t_api_log`)로 남긴다 — 게이트웨이의 유일한 DB 사용이라 로그 전용 연결(풀 5)로 바로 넣고, DB 가 없거나 실패하면 그 로그만 빠진다(그래서 게이트웨이도 `DATABASE_URL` 이 필요하다).
- **scheduler** — crontab 전용 서버(탈퇴 자동처리 · 결제 대기 만료(연장 구간 포함 — 결제됨이면 연장 확정, 아니면 만료 · 잡아 둔 구간을 풀고 그 예약은 다시 연장할 수 없다) · 늦게 승인된 결제 환불 · 환불 처리 · 이용 전환(매분 — 시작 시각이 된 확정 예약은 이용 중 + 호실 사용중 + QR 발급, 끝난 예약은 이용 완료 + 호실 사용중 → 정비중 — 결제 대기 중인 연장이 있으면 결제 결과를 기다린다. 체크인 · 체크아웃은 없다) · QR 확인 링크 SMS(매분 — 이용 시작 5분 전 예약 화면 링크 `USER_WEB_URL/reservation/<예약 ID>`, 예약당 1번) · 문 QR 동기화(매분 — 이용 중 예약의 Redis 현재 QR 다시 쓰기) · API 로그 월 파티션 미리 만들기(매일 03:00 — 한국 달 기준 이번 달 + 3개월, 로그는 지우지 않는다)). 들어오는 연결이 없고(포트 없음) DB · Redis · 토스 · SNS 에만 붙는다. 여러 대여도 DB 잠금으로 회차마다 1대만 실행한다.
- **user-service** — 이용자 서버(:4001, 내부망) — 이용자가 쓰는 기능을 모은다. SNS 가입 · 로그인(만 19세가 되는 해부터 — 청소년보호법. 이용 제한(BLOCK) · 탈퇴 대기(LEAVE_WAIT) 이용자도 로그인 · 토큰 재발급 · 모든 기능을 쓰고 새 예약 · 연장만 막힌다 — 로그인 결과의 `state_id` · `block_comment` · `leave_reserved_at`(탈퇴 예정 시각 — 그 전에 철회할 수 있다)) · 휴대폰 SMS 인증 · 아이디 찾기 · 탈퇴. PostgreSQL 을 소유하고(마이그레이션), 부팅 때 기본 데이터와 첫 총관리자(`admin` / `1234`)를 넣는다. 업체 둘러보기(로그인 없음 — `/api/v1/user-service/discovery`): 반경 업체 조회(지도 중심 + 5 · 10 · 20 · 50km, 가까운 순 최대 300개 — 지도 · 목록 공용, 거리 · 대표 사진 · 최저가) · 업체 상세(사업자 정보 없음 · 상품 설정 — 연장 가능 여부 · 최대 연장 횟수 포함) · 객실 그룹 목록(사진 · 편의시설 · 호실 수 · 판매 중인 상품). 예약: 객실 그룹별 예약 가능 시간(로그인 없음 — 그룹 → 시간대 → 예약 가능한 호수, room_group_id 필터, 시간 이용 · 오늘이면 '지금 바로' 시간대) · 시간 이용 지금 바로 예약(is_now — 지금(분)부터 이용 시간만큼) · 예약(결제 대기 5분) · 토스 결제 확인 · 취소(업체 환불 규정 — 마감 전 100%, 마감 뒤 비율, 시작 뒤 불가. 예약한 호실이 사용중지면 이용 중이어도 끝 전까지 100% — 목록 · 상세의 `is_room_disabled`) · 내 예약 · 내 예약 QR(이용 중 예약에만, 정확히 시작 시각부터 — 시작했는데 아직 확정이면 그 자리에서 이용 중으로 바꾸고 발급, `GET /api/v1/user-service/reservation/:reservation_id/qr`) · 이용 중 취소 요청(업체가 보낸 SMS 링크 화면 — `GET …/:reservation_id/cancel-request`, 로그인해 10분 안에 `PATCH …/cancel-request/approve`(전액 환불 취소) · `…/reject`) · 연장(이용 중에만 — 시간 이용 · 1박은 업체 시간 이용 시간만큼 시간 이용 요금, 연박은 1일씩 1박 요금으로 최대 박수까지, 업체 상품별 연장 가능 여부 · 최대 연장 횟수까지. `GET …/:reservation_id/extension` 조회 · `POST …/:reservation_id/extension` 신청 — 다음 예약과 겹치면 불가, 신청하면 구간을 잡아 두고 5분 안에 결제(결제 확인은 같은 `/payment-confirm`), 결제하지 않으면 만료되고 그 예약은 다시 연장할 수 없다) — `/api/v1/user-service/reservation`. QR 이력은 DB(`t_room_qr` — 유효 시작 · 끝), 호실의 현재 QR 은 Redis(이용 끝에 자동 만료). 결제 확인 때 이미 시작한 예약이면(지금 바로 · 시작 뒤 결제) 바로 이용 중 · QR 발급이다. 업체 · 객실 · 상품 · 영업시간은 공유 DB 에서 읽는다. 입점 신청(`/api/v1/user-service/store/application…` — 업체 총관리자 아이디 · 비밀번호 포함) · 신청 취소 · 업체 정보 파일(사업자등록증 · 업체 사진 — S3 업로드 주소) · 내 신청(승인되면 업체코드). 문 소켓의 접속 확인 · QR 확인 · 잠금 알림도 여기서 판단한다(게이트웨이가 내부 HTTP `/internal/v1/user-service/door/…` 로 넘긴다). QR 로 문을 열면 그 기록(호실 · 예약 · QR · 시각)을 `t_door_open_log` 에 쌓는다.
- **admin-service** — 관리자 서버(:4002, 내부망) — 업체 관리자 · 업체 총관리자 · 관리자 · 총관리자 전용 기능만 둔다. 매니저(총매니저 · 매니저): 업체코드 + 아이디 로그인 · 비밀번호 변경 · 아이디 찾기 · 비밀번호 초기화(업체코드 + 등록된 휴대폰, 임시 비밀번호 SMS), 업체 총관리자의 업체 관리자 계정 등록 · 목록 · 상세 · 수정 · 비밀번호 초기화 · 정지 · 해제 · 삭제. 관리자(총관리자 · 관리자): 이용자 관리(`/api/v1/admin-service/user` — 목록(이름 · 닉네임 · 휴대폰 · 회원 식별 코드 검색, 상태 · SNS 필터) · 상세(예약 건수 요약) · 예약 이력 · 이용 제한 · 해제(정상 ↔ 이용 제한, 사유)) · 업체 관리자 관리(`/api/v1/admin-service/manager/account` — 전체 업체의 업체 총관리자 · 업체 관리자 목록 · 상세 · 비밀번호 초기화(임시 비밀번호 SMS). 계정 정지는 없고 정지는 업체 단위 — 업체 상태 변경) · 아이디 로그인 · 비밀번호 변경(첫 총관리자는 `POST /api/v1/admin-service/admin/login` 후 `PATCH /api/v1/admin-service/admin/password` 로 변경). 업체: 총관리자의 입점 신청 목록 · 상세 · 승인(업체 + 업체코드 + 업체 총관리자 계정 + 승인 알림 SMS) · 반려 · 업체 목록 · 상세 · 수정 · 상태 변경(영업중지 사유) · 영업중 여부 변경, 업체 관리자의 내 업체 설정(상세 · 소개 · 사진과 순서 · 요일별 영업시간 · 매일 브레이크타임 · 정비시간 · 영업중 여부 · 예약 · 환불 규정(예약 n시간 전부터 · 환불 마감 n분 · 마감 뒤 환불 비율) · 일시 예약불가), 업체 총관리자의 문 소켓 시크릿 코드 설정(`PATCH /api/v1/admin-service/store/mine/door-secret` — bcrypt 해시로만 저장). 객실: 업체 관리자의 업체 상품 설정(시간 이용 · 1박 · 연박 — 사용 여부 · 예약 가능 요일 · 이용 시간 · 입퇴실 시각(1박은 항상 다음 날 퇴실) · 연박 최소 · 최대 박수 · 연장 가능 여부 · 최대 연장 횟수(1 ~ 10회, 입점 승인 때 연장 가능 · 3회)) · 객실 그룹(상세정보 · 사진과 순서) · 그룹 상품(사용 여부 · 요금) · 상품별 기간 가격 · 호실(그룹은 등록 때만 — 수정으로 바꾸지 않는다) · 호실 상태(정비 완료 · 사용중지) · 호실 목록의 문 상태(열림 · 잠금 · 마지막 시각) · 호실 문 바로 열기(`POST /api/v1/admin-service/room/:room_id/door-open` — 문 소켓으로 열기 명령). 예약이 걸려 있는 호실 · 그룹은 지울 수 없다. 업체 예약: 업체 관리자의 예약 현황(마지막 이용 중 취소 요청 상태 포함) · 업체 취소(시작 전 예약만 — 100% 환불 + SMS) · 호실 이동(같은 그룹 + SMS) · 이용 중 취소 요청(`POST /api/v1/admin-service/reservation/:reservation_id/use-cancel-request` — 예약자에게 승인 링크 SMS, 10분 안에 승인하면 전액 환불 취소 · 호실 정비중) — `/api/v1/admin-service/reservation`. 통계(조회만 — 월 단위 기간(기본 이번 달 포함 최근 3개월, 최대 12개월) · 결제 환경 LIVE · TEST): 총관리자 · 관리자는 `GET /api/v1/admin-service/stats` 로 합계 · 월별 · 업체별(이용자 수 · 이용 건수 · 결제액 · 환불액 · 수익 — 기본 기간 안 활동이 있는 업체, `has_activity=0` 이면 모든 업체, 수익 순 · 페이지), 업체 관리자는 `GET /api/v1/admin-service/stats/mine` 으로 자기 업체만. 이용자 수 · 이용 건수는 이용 끝이 기간 안인 이용 완료 예약, 결제액은 승인 시각, 환불액은 환불 신청 시각 기준(한국 달). user-service 와 같은 DB 를 직접 쓴다.
- 아이디 · 휴대폰 번호는 로그인 그룹(이용자 · 매니저 · 관리자) 안에서만 겹치지 않는다. 매니저 그룹은 업체 안에서만 — 다른 업체면 같은 아이디를 쓸 수 있고, 로그인 때 업체코드(매니저 화면 주소에 들어 있다)를 함께 받는다.

- **외부 연동** — 발송은 SMS 하나(Amazon SNS), 업체 정보 파일 · 객실 사진은 Amazon S3(presigned URL 로 클라이언트가 직접 업로드) — 공개 파일(업체 · 객실 사진)은 CloudFront(CDN) 주소(admin-service · user-service 업체 둘러보기 · 입점 신청 — `AWS_S3_PUBLIC_URL`), 비공개 파일(사업자등록증)은 10분짜리 서명 주소로 본다. 결제는 토스페이먼츠(결제창 · 승인은 프론트, 서버는 토스 조회로 검증 · 환불 — 환불은 scheduler 가 백그라운드로, 전액 또는 일부 — [docs/guides/toss-setup.md](docs/guides/toss-setup.md)). mock 없이 실제 서비스에 붙는 코드이고, AWS 세팅은 [docs/guides/aws-setup.md](docs/guides/aws-setup.md) 를 따른다.

## 문 소켓

문 쪽 타 업체 프로그램(문 하드웨어를 다루는 프로그램)이 업체 단위로 게이트웨이에 붙는 표준 WebSocket 이다. HTTP 문 열기 · 닫기 API 는 없다 — 문이 QR 을 읽으면 이 소켓으로 묻고, 서버가 Redis 의 현재 QR 과 비교한다. 상세: [docs/realtime.md](docs/realtime.md).

- 접속: `ws://<gateway>/ws/v1/door`, 헤더 `x-store-id`(업체 ID) · `x-store-secret`(업체 총관리자가 정한 시크릿 코드). 틀리면 업그레이드 전에 HTTP 401.
- 메시지는 JSON 한 개 `{"event": …, "data": …}`.

| event | 방향 | data | 설명 |
|---|---|---|---|
| `door.snapshot` | 서버 → 문 | `{store_id, list: [{room_id, room_name, floor, door_state, door_changed_at}]}` | 접속 직후 업체 호실 전체의 문 상태 |
| `door.verify` | 문 → 서버 | `{room_id, qr}` | 문이 읽은 QR 확인 요청 |
| `door.verified` | 서버 → 문 | `{room_id, ok}` | 확인 결과(그 연결에만). ok 면 서버가 이미 열림으로 기록했다 → 문을 연다 |
| `door.closed` | 문 → 서버 | `{room_id}` | 문이 잠겼다(잠금 버튼 · 자동 잠금). 성공은 답하지 않는다 |
| `door.open` | 서버 → 문 | `{room_id}` | 업체 관리자의 바로 열기 명령(그 업체 연결 모두) |
| `error` | 서버 → 문 | `{status_code, message}` | 받은 메시지를 처리하지 못했다(연결은 유지) |

- 연결 유지: 서버가 30초마다 ping, pong 이 없으면 끊는다. 재연결은 문 프로그램이 한다.
- 업체 총관리자가 시크릿을 바꾸면 그 업체 연결을 모두 끊는다(종료 코드 1008) — 새 시크릿으로 다시 붙는다.
- 문 시각 `door_changed_at` 은 한국 시각 `yyyyMMddHHmmss`(기록 전은 `00000000000000`).

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
- 이용자 화면 주소(`USER_WEB_URL` — 프론트 주소)는 SMS 링크의 기준이다. 비우면 서버는 뜨고 scheduler 의 QR 확인 링크 SMS 만 보내지 않으며, 이용 중 취소 요청(admin-service)은 503 이다. SMS 는 user-service · admin-service · scheduler 가 쓴다(scheduler 에도 AWS 키를 넘긴다).

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
| 4 | redis | `npm run docker:redis` | 문 정보 저장소 (127.0.0.1:6379, AOF 영속 — gateway · user-service · admin-service · scheduler 가 쓴다) — [docs/guides/redis-setup.md](docs/guides/redis-setup.md) |
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
apps/gateway   apps/user-service   apps/admin-service   apps/scheduler   # 진입점 · 이용자 기능 · 업체 관리자/관리자 전용 기능 · crontab 전용
apps/gateway/src/modules/door-socket/   # 문 소켓(표준 WebSocket /ws/v1/door)
libs/account  libs/common  libs/contracts  libs/database  libs/integration  libs/messaging
libs/database/src/entities/<domain>/   libs/database/src/migrations/
libs/integration/src/sms/  libs/integration/src/storage/  libs/integration/src/redis/  libs/integration/src/door/  libs/integration/src/payment/   # SMS(SNS) · 파일 저장(S3) · Redis 연결 · 문 정보(Redis) · 결제(토스) 포트 · 어댑터
docs/  docs/guides/        # 규약 · AWS · Redis · 토스 세팅 가이드
.back/              # NestJS 11 시절 코드 (이식 참고용, git 제외 · 로컬 전용)
```
