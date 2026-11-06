# 외부 연동 (`libs/integration`)

> 사용처: user-service 의 휴대폰 SMS 인증 · 아이디 찾기 · 문 소켓 QR 확인 · 잠금 · 내 예약 QR · 결제 확인 QR(문 정보 — Redis) · 입점 신청 업체 정보 파일(업로드 주소 · 존재 확인 · 삭제 · 열람 주소) · 업체 둘러보기 사진(공개 주소 — `StorageModule`), admin-service 의 매니저 아이디 찾기 · 비밀번호 초기화 · 입점 승인 · 업체 취소 · 호실 이동 SMS · 업체 정보 파일 · 객실 그룹 사진 · 호실 문 상태 · 바로 열기 · 이용 중 업체 취소 QR 지우기(문 정보 — Redis), gateway 의 문 소켓 명령 구독, scheduler 의 QR 동기화(루트 모듈이 `SmsModule` · `DoorStoreModule` 중 쓰는 것을 import 한다). 결제(`PaymentModule`)는 user-service 예약(결제 환경 · 결제 확인 `getPayment`)과 scheduler(결제 대기 만료 · 늦은 승인 재확인 `findByPaymentId` · 환불 `cancel`)가 쓴다. AWS 세팅은 [guides/aws-setup.md](guides/aws-setup.md), Redis 는 [guides/redis-setup.md](guides/redis-setup.md), 토스는 [guides/toss-setup.md](guides/toss-setup.md).

## 원칙

- **mock · 가짜 어댑터를 두지 않는다** — 외부 연동은 처음부터 실제 서비스에 붙는 코드다. 서비스를 만드는 방법은 `docs/guides/` 에 가이드로 남긴다. 세팅 전에는 `.env` 값이 비어 있어 요청만 실패한다(부팅은 된다).
- **발송은 SMS 하나** — `SMS_SENDER`(Amazon SNS). 이메일 · 알림톡 · 푸시는 쓰지 않는다. 아래 발송이 모두 이 포트로 나간다.
  - 휴대폰 인증
  - 아이디 찾기 · 비밀번호 초기화
  - 업체 계정 안내
  - 예약 변경 안내
  - 입장 QR 링크
- **파일은 `STORAGE_GATEWAY`(Amazon S3), 업로드는 presigned URL** — 파일 본문은 게이트웨이 · 브로커를 거치지 않는다. 흐름은 네 단계다.
  1. 업로드 주소 요청(동기)
  2. 클라이언트가 `upload_url` 로 PUT — 요청 때 보낸 `content_type` 과 같은 `Content-Type` 헤더로(서명에 들어간다)
  3. 등록 명령에 키만 보낸다 → service 가 `exists(key)` 확인 후 저장
  4. 열람 주소는 파일 용도 룩업의 `is_private` 로 고른다 — 0 이면 `getPublicUrl(key)`(CDN 공개 주소), 1 이면 `createDownloadUrl(key)`(서명된 열람 주소, `STORAGE_DOWNLOAD_URL_TTL_SECONDS` 600초)
- **결제는 `PAYMENT_GATEWAY`(토스페이먼츠)** — 결제창 · 승인은 프론트(Next.js), 서버는 토스에서 다시 읽어 `verifyPaymentLookup`(결제됨 · 미결제 · 금액 불일치 · 다른 주문)으로 대조하고, 환불은 금액을 지정한 취소(`cancel({…, amount})` — 전액 또는 일부, `Idempotency-Key: cancel-<payment_id>`)로 한다. 서버 요청 안에서는 환불 신청만 기록하고 토스 취소는 scheduler crontab 이 한다. 프론트가 넘긴 값만 믿지 않는다.
- service 는 포트(Symbol 토큰 + 인터페이스)만 안다. AWS SDK · 자격증명은 어댑터 안에만 둔다.

## 구성

| 파일 | 내용 |
|---|---|
| `integration.symbols.ts` | `SMS_SENDER` · `STORAGE_GATEWAY` · `DOOR_STORE` · `PAYMENT_GATEWAY` |
| `interfaces/integration.interface.ts` | `SmsSenderInterface` · `SmsMessage` · `StorageGatewayInterface` · `StorageUploadInput` · `StorageUploadResult` · `StorageDownloadResult` · `DoorStoreInterface` · `DoorRecord` · `DoorState` · `DoorCommand`(`DoorOpenCommand` · `DoorDisconnectCommand`) · `PaymentGatewayInterface` · `PaymentEnvironment` · `PaymentLookupResult` · `PaymentCancelInput` · `PaymentCancelResult` |
| `integration.constants.ts` | `SMS_UNAVAILABLE_MESSAGE` · `STORAGE_UNAVAILABLE_MESSAGE` · `STORAGE_PUBLIC_URL_MISSING_MESSAGE` · `STORAGE_UPLOAD_URL_TTL_SECONDS` · `STORAGE_DOWNLOAD_URL_TTL_SECONDS` · `REDIS_UNAVAILABLE_MESSAGE` · `DOOR_STATE` · `DOOR_TIME_NONE` · `DOOR_COMMAND_CHANNEL` · `DOOR_COMMAND` · `PAYMENT_UNAVAILABLE_MESSAGE` · `PAYMENT_FAILED_MESSAGE` · `TOSS_API_BASE_URL` · `PAYMENT_REQUEST_TIMEOUT_MS` · `TOSS_PAYMENT_STATUS_DONE` |
| `integration.util.ts` | `toDoorTime` — 시각 → 문 시각(한국 시각 yyyyMMddHHmmss) · `toE164KrPhone` — 국내 번호 → `+82…` · `classifyTossFailure` — 토스 실패 → 업무 · 일시 · 결제 없음 · `verifyPaymentLookup` — 토스 조회 결과 ↔ 우리 결제 행 대조 |
| `sms/sns-sms.sender.ts` · `sms/sms.module.ts` | `SnsSmsSender`(SNS `Publish`, Transactional) · `SmsModule`(`@Global`) |
| `storage/s3-storage.gateway.ts` · `storage/storage.module.ts` | `S3StorageGateway`(presigned PutObject — Content-Type 서명 · presigned GetObject · HeadObject · DeleteObject) · `StorageModule`(`@Global`) |
| `redis/redis.connection.ts` · `redis/redis.module.ts` | `RedisConnection`(node-redis — 부팅을 막지 않는 연결 · 끊긴 동안 명령을 쌓지 않음 · 준비 전 503 · `subscribe(channel, listener)` — 채널마다 구독 전용 연결) · `RedisModule`(`@Global`) |
| `door/redis-door.store.ts` · `door/door-store.module.ts` | `RedisDoorStore`(`getMany` · `setQr` · `revokeQr` · `verify` · `open` · `close` · `disconnect` · `subscribe` — Lua 스크립트 3개: QR 확인 + 열림 · 바로 열기 + PUBLISH · QR 지우기) · `DoorStoreModule`(`@Global`, RedisModule 포함) |
| `payment/toss-payment.gateway.ts` · `payment/payment.module.ts` | `TossPaymentGateway`(fetch — Basic 인증 · 30초 제한 · 조회 · 전액 취소) · `PaymentModule`(`@Global`, 앱 등록은 Phase 17) |

설정은 `.env` 의 `AWS_REGION` · `AWS_ACCESS_KEY_ID` · `AWS_SECRET_ACCESS_KEY` · `AWS_S3_BUCKET` · `AWS_S3_PUBLIC_URL`(AWS — 자격증명은 SDK 기본 체인이 읽는다, IAM 역할이면 키를 비운다), `REDIS_URL`(Redis), `TOSS_SECRET_KEY`(토스 — 비어 있으면 부팅 경고 · 결제 요청만 503) 이다.

## S3 클라이언트 설정

- `new S3Client({region, requestChecksumCalculation: 'WHEN_REQUIRED'})` — SDK 기본값(`WHEN_SUPPORTED`)이면 presigned PutObject 주소에 빈 본문의 CRC32(`x-amz-checksum-crc32`)가 박힌다. 그러면 실제 파일을 올릴 때 체크섬이 맞지 않아 S3 가 거부한다.
- `getSignedUrl(..., {expiresIn, signableHeaders: new Set(['content-type'])})` — 기본값이면 서명 헤더가 `host` 뿐이라 아무 타입이나 올릴 수 있다. Content-Type 을 서명에 넣어 요청한 타입으로만 올리게 한다.
- 공개 주소는 `AWS_S3_PUBLIC_URL` 로만 만든다. 비어 있으면 주소를 지어내지 않고 실패한다. 기본 구성은 CloudFront 배포 주소다([guides/aws-setup.md](guides/aws-setup.md)).

## 저장 키 · CDN

- **키는 서버가 만든다**(업로드 주소 요청 때) — `<접두>/<리소스 ID>/<uuid 32자>.<jpg|png>`. 업로드마다 새 키이고 같은 키를 덮어쓰지 않는다. 그래서 CDN · 브라우저 캐시를 길게 두고 무효화하지 않는다.
- **접두가 공개 여부를 가른다** — 공개 `store/…`(CloudFront 가 OAC 로 읽는다), 비공개 `private/…`(버킷 정책이 CloudFront 에 열지 않는다 → 서명된 열람 주소로만). 접두는 파일 용도 룩업의 `is_private` 로 정한다(store.util.ts `buildApplicationFileKey`).
- **등록 명령은 키 모양을 다시 확인한다** — 그 리소스 · 공개 여부 · 형식으로 발급한 키인지(`isApplicationFileKey`) 본 뒤 `exists(key)`. 남의 리소스 키나 다른 접두를 막는다.
- 파일 삭제는 행을 지운 뒤 저장소 파일을 지운다(마지막 단계 — 503 이면 재시도). S3 삭제는 없는 키에도 성공하므로 재시도해도 안전하다.

## 문 정보 (`DOOR_STORE` · Redis)

- **저장 모양** — `door:<room_id>` = `상태:시각`(상태 `open` | `close`, 시각은 한국 시각 yyyyMMddHHmmss — 만드는 쪽은 service 가 `toDoorTime` 으로), `door-qr:<room_id>` = 그 호실의 현재 QR(만료 PXAT = QR 유효 끝 → 이용 끝에 저절로 사라진다). 기록이 없는 문은 키가 없고 `getMany` 가 `{state: 'close', changed_at: '00000000000000'}` 으로 읽는다(Phase 14 의 `QR:상태:시각` 값도 뒤의 두 칸만 읽는다).
- **QR 이력 · 유효 시간의 원본은 DB `t_room_qr`** — 예약당 1행(시작 · 끝), 업체가 이용 중 예약을 취소하면 끝을 지금으로 당긴다. Redis 는 문이 비교할 현재 값만 든다 — 발급 · 조회 때마다 `setQr` 로 다시 쓰고(scheduler `reservation-qr-sync` 가 매분 맞춘다), 취소는 `revokeQr`(값이 같을 때만 지운다).
- **원자적 3동작** — QR 확인(`verify` — 현재 QR 이 같을 때만 open + 시각, 아니면 아무것도 바꾸지 않는다) · 바로 열기(`open` — open + 시각을 쓰고 같은 스크립트에서 `door-commands` 채널에 `{store_id, room_id, command: 'open'}` PUBLISH) · QR 지우기(`revokeQr`)는 Lua 스크립트 1개씩이다. 잠금(`close`)은 SET 하나다.
- **서버 명령은 Redis 채널** — gateway 인스턴스마다 `subscribe` 로 `door-commands` 를 구독해 그 업체의 자기 소켓 연결에 적용한다([realtime.md](realtime.md)) — 바로 열기 `{store_id, room_id, command: 'open'}` → `door.open`, 연결 끊기 `{store_id, command: 'disconnect'}`(`disconnect` — 업체 문 시크릿 변경 뒤 store service 가 마지막 단계에서 보낸다) → 그 업체 연결을 모두 1008 로 끊는다. 구독은 구독 전용 연결이라 명령 연결과 섞이지 않는다.
- **단일 노드 전제** — 스크립트가 여러 키를 함께 쓰므로 클러스터 모드가 아닌 Redis(ElastiCache 는 클러스터 모드 끔)여야 한다.
- **원본이다** — 캐시가 아니라 문 상태의 유일한 저장소라 Docker 묶음은 AOF 영속, 운영은 백업을 켠다([guides/redis-setup.md](guides/redis-setup.md)).
- 서버는 문을 직접 움직이지 않는다 — 문 쪽 타 업체 프로그램이 읽은 QR 을 문 소켓으로 묻고, `door.verified ok` 면 문을 연다. HTTP 문 열기 · 닫기 API 는 없다.

## 쓰는 법

```ts
// 앱 루트 모듈 — 쓰는 포트의 모듈만 1회
@Module({imports: [DatabaseModule, SmsModule, /* ... */]})

// service — 포트만 안다
constructor(@Inject(SMS_SENDER) private readonly smsSender: SmsSenderInterface) {}
await this.smsSender.send({to: phone, text: `[roomless] 인증번호 ${code}`});
```

## 실패 계약

- AWS 가 접수하지 못하거나 닿지 못하면, 어댑터가 오류를 로그로 남기고 `ServiceUnavailableException({message: SMS_UNAVAILABLE_MESSAGE | STORAGE_UNAVAILABLE_MESSAGE})`(503)를 던진다. 형제는 `RabbitMqConnection.publish` 의 503 이다.
- Redis 가 준비되지 않았거나 명령이 실패하면 `ServiceUnavailableException({message: REDIS_UNAVAILABLE_MESSAGE})`(503, "상태 저장소에 연결할 수 없습니다") — `RedisConnection.ready()` · `RedisDoorStore` 가 던진다. 구독(`subscribe`)은 실패해도 던지지 않고 로그만 남긴다(부팅을 막지 않는다).
- 결제는 둘로 나눈다 — 토스 업무 실패(4xx)는 `BadRequestException({message: 토스 메시지, payment_error_code: 토스 code})`(400 — 큐 재시도 없음), 일시 실패(5xx · `PROVIDER_ERROR` · 409 · 401 · 네트워크 · 30초 초과 · 키 없음)는 `ServiceUnavailableException({message: PAYMENT_UNAVAILABLE_MESSAGE})`(503 — 재시도, 환불은 멱등키로 중복 없음). 조회의 결제 없음(404 `NOT_FOUND_PAYMENT`)은 null, 취소의 결제 없음은 400.
- `exists` 만 예외다. 404 면 false 를 돌려준다.
- `getPublicUrl` 은 `AWS_S3_PUBLIC_URL` 이 비어 있으면 `InternalServerErrorException({message: STORAGE_PUBLIC_URL_MISSING_MESSAGE})`(500, "설정된 파일 공개 주소가 없습니다") 를 던진다.
- service 는 잡지 않는다. 큐 경로에서는 5xx 라 재시도(최대 3회) 후 failed + DLQ 로 간다.
- 재시도되면 앞서 성공한 발송이 다시 나갈 수 있다. 그래서 발송은 그 명령의 마지막 단계(쓰기 뒤)에 둔다.

## SMS 길이 · 표시

- 한국행은 국제 경로다. 수신 화면에 국제발신으로 보이고, 발신번호를 지정할 수 없다.
- 한글은 70자 단위로 나뉘어 건마다 과금된다. 인증번호 · 안내 문구는 70자 안에 맞춘다. 주소가 들어가는 SMS(입장 QR 링크)는 짧은 주소로 쓴다.

## 새 연동 추가

1. `docs/guides/<서비스>-setup.md` 에 계정 · 리소스 · 권한 · `.env` 키를 적는다.
2. `<기능>/<서비스>-<기능>.<role>.ts` 로 포트 인터페이스를 구현한다. 외부 실패는 503 으로 바꿔 던진다.
3. `.env.example` 에 키를 추가한다. 쓰지 않는 앱의 compose 에는 비밀값을 빈 값으로 덮는다.

## 테스트

- **포트를 쓰는 service spec** — repository 처럼 Symbol 토큰으로 mock 을 주입한다: `{provide: SMS_SENDER, useValue: {send: vi.fn()}}`.
  - 호출 인자(번호 · 본문)를 단언한다.
  - 앞 단계 실패 후 미호출(`.not.toHaveBeenCalled()`)을 단언한다.
- **어댑터 spec 은 두지 않는다** — spec 은 service 기능 · repository 만([testing.md](testing.md)). 실제 AWS 호출은 테스트에서 하지 않는다.
