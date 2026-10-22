# 외부 연동 (`libs/integration`)

> 사용처: user-service 의 휴대폰 SMS 인증 · 아이디 찾기, admin-service 의 매니저 아이디 찾기 · 비밀번호 초기화(둘 다 루트 모듈이 `SmsModule` 을 import 한다). AWS 세팅은 [guides/aws-setup.md](guides/aws-setup.md).

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
  4. 화면은 `getPublicUrl(key)`
- service 는 포트(Symbol 토큰 + 인터페이스)만 안다. AWS SDK · 자격증명은 어댑터 안에만 둔다.

## 구성

| 파일 | 내용 |
|---|---|
| `integration.symbols.ts` | `SMS_SENDER` · `STORAGE_GATEWAY` |
| `interfaces/integration.interface.ts` | `SmsSenderInterface` · `SmsMessage` · `StorageGatewayInterface` · `StorageUploadInput` · `StorageUploadResult` |
| `integration.constants.ts` | `SMS_UNAVAILABLE_MESSAGE` · `STORAGE_UNAVAILABLE_MESSAGE` · `STORAGE_PUBLIC_URL_MISSING_MESSAGE` · `STORAGE_UPLOAD_URL_TTL_SECONDS` |
| `integration.util.ts` | `toE164KrPhone` — 국내 번호 → `+82…` |
| `sms/sns-sms.sender.ts` · `sms/sms.module.ts` | `SnsSmsSender`(SNS `Publish`, Transactional) · `SmsModule`(`@Global`) |
| `storage/s3-storage.gateway.ts` · `storage/storage.module.ts` | `S3StorageGateway`(presigned PutObject — Content-Type 서명 · HeadObject · DeleteObject) · `StorageModule`(`@Global`) |

설정은 `.env` 의 `AWS_REGION` · `AWS_ACCESS_KEY_ID` · `AWS_SECRET_ACCESS_KEY` · `AWS_S3_BUCKET` · `AWS_S3_PUBLIC_URL` 이다. 자격증명은 SDK 기본 체인이 읽는다(IAM 역할이면 키를 비운다).

## S3 클라이언트 설정

- `new S3Client({region, requestChecksumCalculation: 'WHEN_REQUIRED'})` — SDK 기본값(`WHEN_SUPPORTED`)이면 presigned PutObject 주소에 빈 본문의 CRC32(`x-amz-checksum-crc32`)가 박힌다. 그러면 실제 파일을 올릴 때 체크섬이 맞지 않아 S3 가 거부한다.
- `getSignedUrl(..., {expiresIn, signableHeaders: new Set(['content-type'])})` — 기본값이면 서명 헤더가 `host` 뿐이라 아무 타입이나 올릴 수 있다. Content-Type 을 서명에 넣어 요청한 타입으로만 올리게 한다.
- 공개 주소는 `AWS_S3_PUBLIC_URL` 로만 만든다. 비어 있으면 주소를 지어내지 않고 실패한다.

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
- **어댑터 spec** — `vi.hoisted` + `vi.mock('@aws-sdk/…')` 로 SDK 를 막는다. 보낸 명령의 input · 클라이언트 설정 · 서명 옵션과 오류 → 503 · 404 → false 매핑을 단언한다. 실제 AWS 호출은 하지 않는다.
