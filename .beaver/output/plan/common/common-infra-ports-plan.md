# Plan — common-infra-ports (공통 인프라 포트)

## Feature Summary
- **Feature**: 공통 인프라 포트 — AWS 로 실제 연동하는 SMS 발송(SNS) · 파일 저장(S3) 포트와 목록 공통 페이지네이션을 뒤 Phase 들보다 먼저 깐다
- **Entry point**: `포트 · DTO · util (공개 라우트 없음)` — `SMS_SENDER.send({to, text})` · `STORAGE_GATEWAY.createUploadUrl / exists / getPublicUrl / remove` · `PaginationDto` · `new Pagination({...}).getPagination()`
- **Domain**: common (로드맵 Phase 3 — 유닛 #17 `SmsSender` · #18 `libs/integration` 토대 · #19 `StorageGateway` · #20 공통 Pagination)
- **Spec**: [common-infra-ports-spec.md](../../spec/common/common-infra-ports-spec.md)

---

## Prerequisites

- [x] AWS 리소스 세팅은 build 를 막지 않는다.
  - 코드 · 테스트는 AWS 없이 통과한다(SDK 는 spec 에서 mock).
  - 실제 세팅은 사용자가 나중에 `docs/guides/aws-setup.md` 대로 한다.
- [x] 새 의존성 설치는 build 가 한다 — `npm install @aws-sdk/client-sns@3.1146.0 @aws-sdk/client-s3@3.1146.0 @aws-sdk/s3-request-presigner@3.1146.0`. 2주 이상 된 최신 버전(2026-10-02)이고, `package.json` · `package-lock.json` 이 갱신된다.

---

## File List

| File | Action |
|------|------|
| `libs/integration/src/integration.symbols.ts` | new — `SMS_SENDER` · `STORAGE_GATEWAY` (#18) |
| `libs/integration/src/integration.constants.ts` | new — 실패 메시지 2개 · 업로드 주소 유효시간 (#17 · #19) |
| `libs/integration/src/interfaces/integration.interface.ts` | new — 포트 인터페이스 2개 + 입출력 타입 (#17 · #19) |
| `libs/integration/src/integration.util.ts` | new — `toE164KrPhone` (#17) |
| `libs/integration/src/sms/sns-sms.sender.ts` | new — `SnsSmsSender`(Amazon SNS) (#17) |
| `libs/integration/src/sms/sms.module.ts` | new — `SmsModule`(`@Global`) (#17 · #18) |
| `libs/integration/src/storage/s3-storage.gateway.ts` | new — `S3StorageGateway`(S3 + presigned URL) (#19) |
| `libs/integration/src/storage/storage.module.ts` | new — `StorageModule`(`@Global`) (#19 · #18) |
| `libs/integration/src/test/integration.util.spec.ts` | new — `[CASES:toE164KrPhone]` |
| `libs/integration/src/sms/test/sns-sms.sender.spec.ts` | new — SNS 요청 모양 · 503 |
| `libs/integration/src/storage/test/s3-storage.gateway.spec.ts` | new — 서명 요청 모양 · 404 → false · 503 · 공개 주소 |
| `tsconfig.json` | modified — `paths` 에 `@app/integration/*` (#18) |
| `package.json` · `package-lock.json` | modified — `@aws-sdk/client-sns` · `@aws-sdk/client-s3` · `@aws-sdk/s3-request-presigner` (npm install) |
| `.env.example` | modified — AWS 묶음(`AWS_REGION` · `AWS_ACCESS_KEY_ID` · `AWS_SECRET_ACCESS_KEY` · `AWS_S3_BUCKET` · `AWS_S3_PUBLIC_URL`) |
| `compose.gateway.yml` | modified — 게이트웨이에는 AWS 비밀값을 빈 값으로 덮는다 |
| `libs/common/src/dto/pagination.dto.ts` | new — `PAGINATION_DEFAULTS` · `PaginationDto` · `PaginationResultDto` · `PageRangeResultDto` (#20) |
| `libs/common/src/utils/pagination.ts` | new — `Pagination` · `PaginationInput` (#20) |
| `libs/common/src/utils/test/pagination.spec.ts` | new — `[CASES:Pagination]` · `[CASES:PaginationDto]` (#20) |
| `README.md` | modified — 외부 연동(SNS · S3) 소개 · 스택 · AWS 값은 필수 아님 · 구조에 `libs/integration` · `docs/guides` |
| `docs/guides/aws-setup.md` | new — AWS 세팅 가이드(S3 버킷 · CORS · SMS 샌드박스 · 한도 · IAM · .env) |
| `docs/integration.md` | new — 외부 연동 규약 (draft 표식, ship 때 확정) |
| `AGENTS.md` | modified — 트리 · alias · 헥사고날 · util · Query DTO · Pagination · Key Patterns · Testing · Checklist |
| `docs/architecture.md` | modified — 라이브러리 표 · 의존 방향 · 전역 모듈 |
| `docs/conventions.md` | modified — Query DTO 절 상태 · util 목록 |
| `docs/data-layer.md` | modified — Pagination 절 상태 |
| `docs/testing.md` | modified — mock 경계 · 위치 표 · 분류 태그 `[CASES:<unit>]` |
| `.beaver/output/roadmap/roomless-roadmap.md` · `.html` | modified — AWS · mock 없음 결정은 기획 때 반영됨, ship 때 #17 ~ #20 done |
| `compose.user-service.yml` | 변경 없음 — `env_file: .env`(compose.user-service.yml:50)로 AWS 값을 받는다. 첫 사용처는 Phase 5 다. AWS 세팅 전이라 `${VAR:?}` 필수로 걸지 않는다 |
| `nest-cli.json` · `Dockerfile` · `vitest.config.ts` | 변경 없음 — 라이브러리 항목 없음(기존 lib 4개도 없음) · `COPY libs ./libs`(Dockerfile:18) + `npm ci --omit=dev` · `vite-tsconfig-paths`(vitest.config.ts:6) |
| `apps/user-service/src/user-service.module.ts` · `apps/gateway/src/gateway.module.ts` | 변경 없음 — `SmsModule` · `StorageModule` 은 첫 사용처(Phase 5 · 10)에서 import |

정리할 기존 코드(§1.7): 없음. 새 포트 · DTO 는 기존 코드를 대체하지 않는다. `.back` 은 참고만 하고 수정하지 않는다.

---

## Design

### 외부 연동 라이브러리 — 토큰 · 상수 · 포트 (#17 · #18 · #19)

형제는 `libs/messaging/src/messaging.symbols.ts:2` 와 `libs/messaging/src/interfaces/messaging.interface.ts:4` 다. 라이브러리 안의 import 는 messaging 처럼 상대경로로 한다.

```typescript
// libs/integration/src/integration.symbols.ts
/** SMS 발송 포트 — 구현: SnsSmsSender (Amazon SNS) */
export const SMS_SENDER = Symbol('SmsSenderInterface');

/** 파일 저장소 포트 — 구현: S3StorageGateway (Amazon S3) */
export const STORAGE_GATEWAY = Symbol('StorageGatewayInterface');
```

```typescript
// libs/integration/src/integration.constants.ts
/** AWS 가 SMS 를 접수하지 못했을 때 — 503, 큐 경로에서는 재시도된다 */
export const SMS_UNAVAILABLE_MESSAGE = 'SMS를 보내지 못했습니다. 잠시 후 다시 시도해주세요.';

/** 파일 저장소(S3)에 닿지 못했을 때 — 503 */
export const STORAGE_UNAVAILABLE_MESSAGE = '파일 저장소에 연결할 수 없습니다. 잠시 후 다시 시도해주세요.';

/** AWS_S3_PUBLIC_URL 이 비어 공개 주소를 만들 수 없을 때 — 500 */
export const STORAGE_PUBLIC_URL_MISSING_MESSAGE = '설정된 파일 공개 주소가 없습니다. 관리자에게 문의해주세요.';

/** 업로드 주소(presigned URL)의 유효 시간(초) */
export const STORAGE_UPLOAD_URL_TTL_SECONDS = 600;
```

```typescript
// libs/integration/src/interfaces/integration.interface.ts
/** SMS 1통 */
export interface SmsMessage {
    /** 받는 번호 — 국내 휴대폰 번호 (예: 01012345678, 010-1234-5678) */
    to: string;
    /** 본문 — 한글은 70자 단위로 나뉘어 건마다 과금된다 */
    text: string;
}

/**
 * SMS 발송 포트 — 서비스의 모든 발송이 이 포트 하나로 나간다(이메일 · 알림톡 · 푸시 없음).
 * 휴대폰 인증 · 아이디 찾기 · 비밀번호 초기화 · 업체 계정 안내 · 예약 변경 안내 · 입장 QR 링크.
 */
export interface SmsSenderInterface {
    /**
     * SMS 1통을 보낸다. AWS 가 접수하면 끝난다(휴대폰 도착은 기다리지 않는다).
     *
     * @throws ServiceUnavailableException `{message: SMS_UNAVAILABLE_MESSAGE}` — AWS 가 접수하지 못했을 때
     */
    send(message: SmsMessage): Promise<void>;
}

/** 업로드 주소 요청 */
export interface StorageUploadInput {
    /** 저장 키 — 예: `store/<store_id>/<uuid>.jpg` (키 규칙은 쓰는 도메인의 util 이 만든다) */
    key: string;
    /** 올릴 파일의 MIME 타입 (예: image/jpeg) — 서명 헤더에 들어가 다른 타입으로는 올릴 수 없다 */
    content_type: string;
}

/** 업로드 주소 */
export interface StorageUploadResult {
    /** 클라이언트가 파일을 PUT 으로 올릴 주소 (STORAGE_UPLOAD_URL_TTL_SECONDS 동안 유효, 같은 Content-Type 헤더로 올린다) */
    upload_url: string;
    /** upload_url 이 만료되는 시각 */
    expires_at: Date;
}

/**
 * 파일 저장소 포트 — 업체 · 객실 그룹 사진.
 * 파일 본문은 서버를 거치지 않는다. 클라이언트가 createUploadUrl 의 주소로 직접 올리고, 등록 명령에는 키만 보낸다.
 */
export interface StorageGatewayInterface {
    /**
     * 키 하나에 쓸 1회용 업로드 주소를 발급한다.
     *
     * @throws ServiceUnavailableException `{message: STORAGE_UNAVAILABLE_MESSAGE}` — 저장소에 닿지 못했을 때
     */
    createUploadUrl(input: StorageUploadInput): Promise<StorageUploadResult>;

    /**
     * 클라이언트가 그 키로 실제로 올렸는지 확인한다 — 사진 등록 명령에서 저장 전에 부른다.
     *
     * @throws ServiceUnavailableException `{message: STORAGE_UNAVAILABLE_MESSAGE}` — 저장소에 닿지 못했을 때
     */
    exists(key: string): Promise<boolean>;

    /**
     * 화면에 보일 공개 주소 — 저장소에 묻지 않고 키로 만든다.
     *
     * @throws InternalServerErrorException `{message: STORAGE_PUBLIC_URL_MISSING_MESSAGE}` — 설정된 공개 주소가 없을 때
     */
    getPublicUrl(key: string): string;

    /**
     * 파일을 지운다. 없는 키여도 실패하지 않는다.
     *
     * @throws ServiceUnavailableException `{message: STORAGE_UNAVAILABLE_MESSAGE}` — 저장소에 닿지 못했을 때
     */
    remove(key: string): Promise<void>;
}
```

```typescript
// libs/integration/src/integration.util.ts
/**
 * 국내 휴대폰 번호를 E.164 로 바꾼다 — `010-1234-5678` · `01012345678` → `+821012345678`.
 * 이미 `+` 로 시작하면 국가번호가 붙은 것으로 보고 숫자만 남긴다. 번호 형식 검증은 입력 DTO 몫이다.
 *
 * @param phone 휴대폰 번호
 * @returns E.164 번호
 */
export function toE164KrPhone(phone: string): string {
    const digits = phone.replace(/\D/g, '');
    if (phone.trim().startsWith('+')) {
        return `+${digits}`;
    }
    return `+82${digits.replace(/^0/, '')}`;
}
```

### 외부 연동 라이브러리 — AWS 어댑터 (#17 · #19)

형제는 `RabbitMqConnection`(libs/messaging/src/rabbitmq.connection.ts) 이다. 인프라 클래스로서 SDK 클라이언트를 갖고, `private readonly logger = new Logger(X.name)` 로 로그를 남기고(AGENTS.md "로깅"), 연결이 없으면 503 을 던진다(rabbitmq.connection.ts:94-99).

자격증명은 AWS SDK 기본 체인이 읽는다 — 환경변수 `AWS_ACCESS_KEY_ID` · `AWS_SECRET_ACCESS_KEY`, 또는 EC2 · ECS 의 IAM 역할. 그래서 코드는 `region` 만 넘긴다. AWS 값이 비어 있어도 부팅은 막지 않는다. 부팅 때 경고 로그를 한 번 남기고, 실제 요청만 503 으로 실패한다.

```typescript
// libs/integration/src/sms/sns-sms.sender.ts
import {PublishCommand, SNSClient} from '@aws-sdk/client-sns';
import {Injectable, Logger, OnApplicationBootstrap, ServiceUnavailableException} from '@nestjs/common';
import {SMS_UNAVAILABLE_MESSAGE} from '../integration.constants.js';
import {toE164KrPhone} from '../integration.util.js';
import type {SmsMessage, SmsSenderInterface} from '../interfaces/integration.interface.js';

/** SNS SMS 유형 — 인증번호 · 안내처럼 전달이 우선인 메시지 */
const SMS_TYPE = 'Transactional';

/**
 * SMS 발송 어댑터 — Amazon SNS `Publish`.
 * 한국은 AWS 에 전용 발신번호가 없어 국제 경로로 나간다(수신 화면 국제발신, 한글 70자 단위 과금).
 * AWS 세팅: docs/guides/aws-setup.md
 */
@Injectable()
export class SnsSmsSender implements SmsSenderInterface, OnApplicationBootstrap {
    private readonly logger = new Logger(SnsSmsSender.name);
    private readonly client = new SNSClient({region: process.env.AWS_REGION});

    /**
     * AWS_REGION 이 비어 있으면 부팅 때 한 번 경고한다. 부팅은 막지 않고 발송 요청만 실패한다.
     */
    onApplicationBootstrap(): void {
        if (!process.env.AWS_REGION) {
            this.logger.warn('AWS_REGION 이 비어 있어 SMS 를 보낼 수 없습니다 — docs/guides/aws-setup.md');
        }
    }

    /**
     * SMS 1통을 SNS 로 보낸다.
     *
     * @param message 받는 번호 · 본문
     * @throws ServiceUnavailableException AWS 가 접수하지 못했을 때
     */
    async send(message: SmsMessage): Promise<void> {
        try {
            await this.client.send(new PublishCommand({PhoneNumber: toE164KrPhone(message.to), Message: message.text, MessageAttributes: {'AWS.SNS.SMS.SMSType': {DataType: 'String', StringValue: SMS_TYPE}}}));
        } catch (error) {
            this.logger.error(`SMS 발송 실패: ${(error as Error)?.message ?? error}`);
            throw new ServiceUnavailableException({message: SMS_UNAVAILABLE_MESSAGE});
        }
    }
}
```

```typescript
// libs/integration/src/storage/s3-storage.gateway.ts
import {DeleteObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client} from '@aws-sdk/client-s3';
import {getSignedUrl} from '@aws-sdk/s3-request-presigner';
import {Injectable, InternalServerErrorException, Logger, OnApplicationBootstrap, ServiceUnavailableException} from '@nestjs/common';
import {STORAGE_PUBLIC_URL_MISSING_MESSAGE, STORAGE_UNAVAILABLE_MESSAGE, STORAGE_UPLOAD_URL_TTL_SECONDS} from '../integration.constants.js';
import type {StorageGatewayInterface, StorageUploadInput, StorageUploadResult} from '../interfaces/integration.interface.js';

/**
 * 파일 저장소 어댑터 — Amazon S3. 업로드는 presigned URL(PutObject, Content-Type 서명)로 클라이언트가 직접 한다.
 * 버킷 AWS_S3_BUCKET, 공개 주소 기준 AWS_S3_PUBLIC_URL, 리전 AWS_REGION, 자격증명은 AWS SDK 기본 체인.
 * AWS 세팅: docs/guides/aws-setup.md
 */
@Injectable()
export class S3StorageGateway implements StorageGatewayInterface, OnApplicationBootstrap {
    private readonly logger = new Logger(S3StorageGateway.name);
    /** 체크섬은 필요할 때만 — SDK 기본값(WHEN_SUPPORTED)이면 presigned PutObject 주소에 빈 본문의 CRC32 가 박혀 실제 파일 업로드를 S3 가 거부한다 */
    private readonly client = new S3Client({region: process.env.AWS_REGION, requestChecksumCalculation: 'WHEN_REQUIRED'});

    /**
     * AWS_REGION · AWS_S3_BUCKET · AWS_S3_PUBLIC_URL 중 비어 있는 값이 있으면 부팅 때 한 번 경고한다. 부팅은 막지 않고 파일 요청만 실패한다.
     */
    onApplicationBootstrap(): void {
        if (!process.env.AWS_REGION || !process.env.AWS_S3_BUCKET || !process.env.AWS_S3_PUBLIC_URL) {
            this.logger.warn('AWS_REGION · AWS_S3_BUCKET · AWS_S3_PUBLIC_URL 중 비어 있는 값이 있어 파일 요청은 실패합니다 — docs/guides/aws-setup.md');
        }
    }

    /**
     * 키 하나에 쓸 업로드 주소를 서명한다(네트워크 호출 없음).
     * Content-Type 을 서명 헤더에 넣어, 클라이언트는 같은 Content-Type 헤더로만 올릴 수 있다.
     *
     * @param input 저장 키 · MIME 타입
     * @returns 업로드 주소 · 만료 시각
     * @throws ServiceUnavailableException 서명하지 못했을 때(자격증명 · 버킷 설정 없음)
     */
    async createUploadUrl(input: StorageUploadInput): Promise<StorageUploadResult> {
        try {
            const uploadUrl = await getSignedUrl(this.client, new PutObjectCommand({Bucket: process.env.AWS_S3_BUCKET, Key: input.key, ContentType: input.content_type}), {
                expiresIn: STORAGE_UPLOAD_URL_TTL_SECONDS,
                signableHeaders: new Set(['content-type']),
            });
            return {upload_url: uploadUrl, expires_at: new Date(Date.now() + STORAGE_UPLOAD_URL_TTL_SECONDS * 1000)};
        } catch (error) {
            throw toUnavailable(this.logger, '업로드 주소 발급', error);
        }
    }

    /**
     * HeadObject 로 업로드 여부를 확인한다 — 404 면 false.
     *
     * @param key 저장 키
     * @returns 올라가 있으면 true
     * @throws ServiceUnavailableException 404 가 아닌 오류
     */
    async exists(key: string): Promise<boolean> {
        try {
            await this.client.send(new HeadObjectCommand({Bucket: process.env.AWS_S3_BUCKET, Key: key}));
            return true;
        } catch (error) {
            if (isNotFound(error)) {
                return false;
            }
            throw toUnavailable(this.logger, '파일 확인', error);
        }
    }

    /**
     * 공개 주소 — AWS_S3_PUBLIC_URL(끝의 / 는 뗀다) 뒤에 키.
     *
     * @param key 저장 키
     * @returns 공개 주소
     * @throws InternalServerErrorException AWS_S3_PUBLIC_URL 이 비어 있을 때 — 설정된 공개 주소가 없다
     */
    getPublicUrl(key: string): string {
        const base = (process.env.AWS_S3_PUBLIC_URL ?? '').replace(/\/+$/, '');
        if (!base) {
            this.logger.error('AWS_S3_PUBLIC_URL 이 비어 있어 파일 공개 주소를 만들 수 없습니다 — docs/guides/aws-setup.md');
            throw new InternalServerErrorException({message: STORAGE_PUBLIC_URL_MISSING_MESSAGE});
        }
        return `${base}/${key}`;
    }

    /**
     * 파일을 지운다 — S3 는 없는 키도 성공으로 답한다.
     *
     * @param key 저장 키
     * @throws ServiceUnavailableException 저장소에 닿지 못했을 때
     */
    async remove(key: string): Promise<void> {
        try {
            await this.client.send(new DeleteObjectCommand({Bucket: process.env.AWS_S3_BUCKET, Key: key}));
        } catch (error) {
            throw toUnavailable(this.logger, '파일 삭제', error);
        }
    }
}

/**
 * S3 의 404 응답인지 — HeadObject 는 본문이 없어 상태 코드로만 알 수 있다.
 * (IAM 에 s3:ListBucket 이 없으면 없는 키도 403 으로 와서 503 이 된다 — 가이드의 IAM 정책 참고)
 *
 * @param error SDK 오류
 * @returns 404 면 true
 */
function isNotFound(error: unknown): boolean {
    return (error as {$metadata?: {httpStatusCode?: number}})?.$metadata?.httpStatusCode === 404;
}

/**
 * S3 오류를 로그로 남기고 503 으로 바꾼다.
 *
 * @param logger 어댑터 로거
 * @param action 실패한 작업
 * @param error SDK 오류
 * @returns 던질 예외
 */
function toUnavailable(logger: Logger, action: string, error: unknown): ServiceUnavailableException {
    logger.error(`S3 ${action} 실패: ${(error as Error)?.message ?? error}`);
    return new ServiceUnavailableException({message: STORAGE_UNAVAILABLE_MESSAGE});
}
```

### 외부 연동 라이브러리 — 모듈 · alias · 의존성 (#18)

형제는 `libs/database/src/database.module.ts:17-25`(`@Global()` 정적 모듈) 다. 포트마다 모듈을 나눈다. 앱마다 쓰는 포트가 다르기 때문이다(user-service 는 SMS 만, 사진은 업체 쪽 서비스). 쓰지 않는 어댑터가 부팅 경고를 남기지 않게 한다.

```typescript
// libs/integration/src/sms/sms.module.ts
import {Global, Module} from '@nestjs/common';
import {SMS_SENDER} from '../integration.symbols.js';
import {SnsSmsSender} from './sns-sms.sender.js';

/**
 * SMS 발송 포트(SMS_SENDER) — Amazon SNS.
 * SMS 를 보내는 앱의 루트 모듈에서 import 한다(전역 — 도메인 모듈은 import 없이 `@Inject(SMS_SENDER)` 로 주입받는다).
 */
@Global()
@Module({providers: [{provide: SMS_SENDER, useClass: SnsSmsSender}], exports: [SMS_SENDER]})
export class SmsModule {}
```

```typescript
// libs/integration/src/storage/storage.module.ts
import {Global, Module} from '@nestjs/common';
import {STORAGE_GATEWAY} from '../integration.symbols.js';
import {S3StorageGateway} from './s3-storage.gateway.js';

/**
 * 파일 저장소 포트(STORAGE_GATEWAY) — Amazon S3.
 * 파일을 다루는 앱의 루트 모듈에서 import 한다(전역 — 도메인 모듈은 import 없이 `@Inject(STORAGE_GATEWAY)` 로 주입받는다).
 */
@Global()
@Module({providers: [{provide: STORAGE_GATEWAY, useClass: S3StorageGateway}], exports: [STORAGE_GATEWAY]})
export class StorageModule {}
```

```jsonc
// tsconfig.json — compilerOptions.paths 변경부 (database 다음, messaging 앞 — 이름순)
      "@app/database/*": [
        "./libs/database/src/*"
      ],
      "@app/integration/*": [
        "./libs/integration/src/*"
      ],
      "@app/messaging/*": [
        "./libs/messaging/src/*"
      ]
```

```jsonc
// package.json — dependencies 변경부 (npm install 결과, 이름순 맨 앞)
  "dependencies": {
    "@aws-sdk/client-s3": "^3.1146.0",
    "@aws-sdk/client-sns": "^3.1146.0",
    "@aws-sdk/s3-request-presigner": "^3.1146.0",
    "@nestjs-cls/transactional": "^4.0.1",
```

### 설정 — `.env.example` · `compose.gateway.yml`

`.env` 가 곧 서버 설정이다(AGENTS.md Key Patterns). AWS 값은 세팅 전이라 비어 있을 수 있어 필수(`(필수)` · `${VAR:?}`)로 두지 않는다. 비밀이 아닌 리전만 예시값을 둔다.

```bash
# .env.example — 끝(인증 · 암호화 묶음 다음)에 추가
# ── AWS (SMS · 파일 저장) ───────────────────
# 세팅 방법: docs/guides/aws-setup.md — 비어 있으면 부팅은 되고 SMS · 파일 요청만 실패한다
AWS_REGION=ap-northeast-2
# IAM 사용자 액세스 키 — AWS(EC2 · ECS)에서 IAM 역할로 돌리면 비운다
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
# 사진 버킷
AWS_S3_BUCKET=
# 사진 공개 주소의 기준 — 버킷 주소 https://<버킷>.s3.<리전>.amazonaws.com 또는 CloudFront 주소. 비어 있으면 사진 주소 요청이 실패한다
AWS_S3_PUBLIC_URL=
```

```yaml
# compose.gateway.yml — 변경부 (compose.gateway.yml:55-61, 쓰지 않는 비밀값 블록)
            # ── 쓰지 않는 비밀값은 전달하지 않는다 (게이트웨이는 DB · 비밀번호 해시 · 토큰 암호화 · AWS 를 쓰지 않는다) ──
            RABBITMQ_USER_SERVICE_PASSWORD: ''
            RABBITMQ_PASSWORD: ''
            DATABASE_URL: ''
            POSTGRES_PASSWORD: ''
            BCRYPT_CODE: ''
            TOKEN_CIPHER_KEY: ''
            AWS_ACCESS_KEY_ID: ''
            AWS_SECRET_ACCESS_KEY: ''
```

### Input/Validation (DTO) — 공통 페이지네이션 (#20)

`.back/src/common/dto/pagination.dto.ts` 를 이식한다. 기본값은 상수 `PAGINATION_DEFAULTS` 하나로 모은다. 이 상수를 DTO 파일에 두는 이유는 두 가지다.
- 생성자가 사양이다(docs/conventions.md:113).
- util → dto 한 방향 import 가 된다. util 에 두면 dto ↔ util 순환 import 가 생긴다.

page · size · page_size 는 `@IsOptional()` 만 둔다. 생성자가 넣는 기본값은 숫자다. 그런데 `@Matches` 는 문자열만 통과시키므로, 쿼리에 page 가 빠지면 매 요청 400 이 난다. 쿼리 값은 문자열이라(docs/conventions.md:130) `Pagination` 이 정수로 읽고 바로잡는다.

```typescript
// libs/common/src/dto/pagination.dto.ts
import {ApiProperty} from '@nestjs/swagger';
import {IsOptional} from 'class-validator';

/** 페이지 기본값 — PaginationDto 생성자(사양)와 Pagination 의 폴백(안전망)이 같이 쓴다 */
export const PAGINATION_DEFAULTS = {all_search_yn: 'N', page: 1, size: 20, page_size: 10} as const;

/**
 * 목록 Query DTO 의 부모 — 페이지 기본값은 이 생성자가 정한다.
 * - 기능별 Query DTO 는 `extends PaginationDto` 후 `super(data)` 를 부르고 자기 필드만 더한다(부모 필드 재선언 ❌ — useDefineForClassFields 로 부모 기본값이 undefined 로 덮인다).
 * - 생성자 파라미터는 반드시 선택이다. ValidationPipe(transform) 가 `new PaginationDto()` 를 인자 없이 부른다.
 * - 쿼리 값은 문자열로 들어온다(`'2'`). 직접 산술하지 말고 `Pagination` 에 넘긴다.
 */
export class PaginationDto {
    @ApiProperty({description: '전체 조회 여부(Y/N) — Y 가 아니면 N. 기본값 N', required: false})
    @IsOptional()
    all_search_yn: string;

    @ApiProperty({description: '페이지. 기본값 1', required: false})
    @IsOptional()
    page: number;

    @ApiProperty({description: '페이지당 개수. 기본값 20', required: false})
    @IsOptional()
    size: number;

    @ApiProperty({description: '페이지 탭에 보일 페이지 수. 기본값 10', required: false})
    @IsOptional()
    page_size: number;

    /**
     * @param data 요청 쿼리 — 빠진 값은 PAGINATION_DEFAULTS
     */
    constructor(data?: Partial<PaginationDto>) {
        this.all_search_yn = data?.all_search_yn ?? PAGINATION_DEFAULTS.all_search_yn;
        this.page = data?.page ?? PAGINATION_DEFAULTS.page;
        this.size = data?.size ?? PAGINATION_DEFAULTS.size;
        this.page_size = data?.page_size ?? PAGINATION_DEFAULTS.page_size;
    }
}

/**
 * 페이지 탭에 보일 페이지 번호 범위
 */
export class PageRangeResultDto {
    @ApiProperty({description: '시작 페이지'})
    start: number;

    @ApiProperty({description: '끝 페이지'})
    end: number;
}

/**
 * 목록 응답 `{list, pagination}` 의 pagination
 */
export class PaginationResultDto {
    @ApiProperty({description: '전체 조회 여부(Y/N)', enum: ['Y', 'N']})
    all_search_yn: 'Y' | 'N';

    @ApiProperty({description: '총 개수'})
    total_count: number;

    @ApiProperty({description: '현재 페이지 (범위를 벗어난 요청은 바로잡은 값)'})
    page: number;

    @ApiProperty({description: '마지막 페이지 (0건이어도 1)'})
    max_page: number;

    @ApiProperty({description: '페이지 탭에 보일 페이지 번호 범위', type: () => PageRangeResultDto})
    page_range: PageRangeResultDto;

    @ApiProperty({description: '이 페이지 첫 항목의 번호 — 총 개수부터 내려간다'})
    content_start_number: number;

    @ApiProperty({description: '이 페이지 첫 항목의 번호 — 1부터 올라간다'})
    content_start_number_reverse: number;
}
```

### Business Logic (util) — `Pagination` (#20)

`.back/src/common/utils/pagination.ts` 를 이식한다. 형제 util 은 결과 DTO 를 `new XResultDto()` + 할당으로 만들고(libs/common/src/utils/fail-result.ts:62, validation.ts:17), 같은 라이브러리를 자기 alias 로 import 한다(fail-result.ts:2). `.back` 과 다른 점은 셋이다.
- 숫자가 아닌 `total_count` 는 1 이 아니라 0 으로 본다.
- `size` · `page_size` 가 0 이하면 기본값으로 본다. `.back` 은 0 으로 나눠 `max_page` 가 Infinity 가 됐다.
- 필드는 `readonly` 다.

```typescript
// libs/common/src/utils/pagination.ts
import {PAGINATION_DEFAULTS, PageRangeResultDto, PaginationResultDto} from '@app/common/dto/pagination.dto.js';

/** Pagination 입력 — 쿼리 값은 문자열로 들어오므로 숫자 · 문자열을 모두 받는다 */
export interface PaginationInput {
    /** 전체 조회 여부 — 'Y' 가 아니면 모두 N */
    all_search_yn: string;
    /** 총 개수 (repository count 결과) */
    total_count: number | string;
    /** 요청 페이지 */
    page: number | string;
    /** 페이지당 개수 */
    size: number | string;
    /** 페이지 탭에 보일 페이지 수 */
    page_size: number | string;
}

/**
 * 목록 페이지 계산 — 순서는 count → Pagination → 목록.
 * 총 개수로 현재 페이지를 바로잡고, 목록 조회의 limit · offset 과 응답의 pagination 을 만든다.
 * 숫자가 아니거나 범위를 벗어난 값은 던지지 않고 바로잡는다(안전망 — 기본값의 사양은 PaginationDto 생성자).
 * 계산 결과를 들고 다니는 값 객체라 util 중 유일하게 class 다.
 */
export class Pagination {
    /** 전체 조회 여부 — Y 면 한 페이지에 전부 */
    readonly all_search_yn: 'Y' | 'N';
    /** 총 개수 */
    readonly total_count: number;
    /** 현재 페이지 (1 ~ max_page) */
    readonly page: number;
    /** 페이지당 개수 (전체 조회면 총 개수) */
    readonly size: number;
    /** 페이지 탭에 보일 페이지 수 */
    readonly page_size: number;
    /** 마지막 페이지 (0건이어도 1) */
    readonly max_page: number;
    /** 페이지 탭에 보일 페이지 번호 범위 */
    readonly page_range: PageRangeResultDto;
    /** 목록 조회 limit */
    readonly limit: number;
    /** 목록 조회 offset */
    readonly offset: number;

    /**
     * @param input 요청 페이지 값 + 총 개수
     */
    constructor(input: PaginationInput) {
        const allSearch = input.all_search_yn === 'Y';
        const totalCount = toInt(input.total_count, 0, 0);
        const pageSize = toInt(input.page_size, 1, PAGINATION_DEFAULTS.page_size);
        const size = allSearch ? totalCount : toInt(input.size, 1, PAGINATION_DEFAULTS.size);
        const maxPage = allSearch ? 1 : Math.max(Math.ceil(totalCount / size), 1);
        const page = allSearch ? 1 : Math.min(toInt(input.page, 1, PAGINATION_DEFAULTS.page), maxPage);
        const rangeEnd = Math.ceil(page / pageSize) * pageSize;

        this.all_search_yn = allSearch ? 'Y' : 'N';
        this.total_count = totalCount;
        this.page = page;
        this.size = size;
        this.page_size = pageSize;
        this.max_page = maxPage;
        this.page_range = toPageRange(rangeEnd - pageSize + 1, Math.min(rangeEnd, maxPage));
        this.limit = size;
        this.offset = (page - 1) * size;
    }

    /**
     * 목록 응답의 pagination 을 만든다.
     *
     * @returns 페이지 정보
     */
    getPagination(): PaginationResultDto {
        const result = new PaginationResultDto();
        result.all_search_yn = this.all_search_yn;
        result.total_count = this.total_count;
        result.page = this.page;
        result.max_page = this.max_page;
        result.page_range = toPageRange(this.page_range.start, this.page_range.end);
        result.content_start_number = this.total_count - (this.page - 1) * this.size;
        result.content_start_number_reverse = 1 + (this.page - 1) * this.size;
        return result;
    }
}

/**
 * 정수로 읽는다 — 숫자가 아니거나 min 보다 작으면 fallback.
 *
 * @param value 숫자 또는 쿼리 문자열
 * @param min 허용하는 가장 작은 값
 * @param fallback 대신 쓸 값
 * @returns 정수
 */
function toInt(value: number | string, min: number, fallback: number): number {
    const parsed = parseInt(String(value), 10);
    return Number.isNaN(parsed) || parsed < min ? fallback : parsed;
}

/**
 * 페이지 번호 범위 DTO 를 만든다.
 *
 * @param start 시작 페이지
 * @param end 끝 페이지
 * @returns 페이지 번호 범위
 */
function toPageRange(start: number, end: number): PageRangeResultDto {
    const range = new PageRangeResultDto();
    range.start = start;
    range.end = end;
    return range;
}
```

쓰는 쪽 모양(Phase 8 첫 목록 API 에서 적용 — docs/data-layer.md:157-158):

```typescript
// 예시 — apps/<app>/src/<domain>/<domain>.service.ts (이번 범위 아님)
const total_count = await this.storeRepository.countStore(where);
const pagination = new Pagination({...dto, total_count});
const list = await this.storeRepository.findStoreList(where, pagination.limit, pagination.offset);
return {list, pagination: pagination.getPagination()};
```

### 가이드 — `docs/guides/aws-setup.md` (new)

사용자가 나중에 AWS 콘솔에서 따라 할 순서다. 끝나면 `.env` 의 AWS 값만 채운다.

~~~markdown
# AWS 세팅 가이드 — SMS(Amazon SNS) · 파일 저장(Amazon S3)

> 코드는 이미 AWS 에 붙어 있다(`libs/integration`). 아래를 마치고 `.env` 의 AWS 값을 채우면 동작한다.
> 값이 비어 있는 동안에는 부팅 경고만 남고, SMS · 파일 요청이 실패한다(503, 사진 공개 주소는 500).

## 0. 준비

- AWS 계정. 리전은 서울(`ap-northeast-2`) — SMS · S3 모두 지원한다.
- 개발용 · 운영용을 나눈다. 버킷 2개(`roomless-dev-files` · `roomless-prod-files`)와 IAM 사용자 또는 역할 2개를 만들고, `.env` 만 바꿔 고른다. compose 는 다시 세팅하지 않는다.

## 1. S3 — 사진 버킷

1. **S3 → 버킷 만들기**
   - 이름 `roomless-<dev|prod>-files`, 리전 `ap-northeast-2`
   - 객체 소유권: ACL 비활성화(버킷 소유자 적용)
2. **퍼블릭 액세스 차단** — 사진을 버킷 주소로 바로 보이게 하려면 아래 두 항목만 끈다. ACL 관련 두 항목은 켜 둔다.
   - 새 퍼블릭 버킷 또는 액세스 지점 정책을 통해 부여된 퍼블릭 액세스 차단
   - 임의의 퍼블릭 버킷 또는 액세스 지점 정책을 통해 부여된 … 차단

   CloudFront 를 앞에 둘 거면 네 항목을 모두 켜 두고 OAC 로 연결한다(5단계).
3. **버킷 정책** — 공개 읽기. 사진 전용 버킷이라 전체 객체를 연다.
   ```json
   {
     "Version": "2012-10-17",
     "Statement": [{"Sid": "PublicRead", "Effect": "Allow", "Principal": "*", "Action": "s3:GetObject", "Resource": "arn:aws:s3:::roomless-<dev|prod>-files/*"}]
   }
   ```
4. **CORS** — 브라우저가 presigned URL 로 직접 PUT 한다. `AllowedOrigins` 는 `.env` 의 `CORS_ORIGINS` 와 같은 프론트 주소로 한다.
   ```json
   [{"AllowedOrigins": ["http://localhost:3001"], "AllowedMethods": ["PUT", "GET"], "AllowedHeaders": ["*"], "ExposeHeaders": ["ETag"], "MaxAgeSeconds": 3000}]
   ```
   프론트는 업로드 주소를 요청할 때 보낸 `content_type` 과 **같은 `Content-Type` 헤더**로 PUT 한다. Content-Type 이 서명에 들어가 있어 다르면 S3 가 403 으로 거부한다.
5. **(선택) CloudFront** — 배포를 만들고 원본을 이 버킷(OAC)으로 둔다. 배포 도메인을 `AWS_S3_PUBLIC_URL` 에 넣는다.

## 2. SMS — Amazon SNS

1. 콘솔 **AWS End User Messaging SMS**(또는 SNS → 텍스트 메시징(SMS)), 리전 서울.
2. **샌드박스** — 새 계정은 샌드박스라 등록 · 인증한 번호로만 보낼 수 있다. 개발 중에는 "대상 전화번호"에 테스트할 휴대폰을 등록한다.
3. **운영 전** — 콘솔에서 두 가지를 요청한다. 며칠 걸린다.
   - 샌드박스 해제(프로덕션 액세스)
   - 월 지출 한도 상향(기본 USD 1)
4. **한국 발송의 제약** — 한국은 AWS 에 전용 발신번호 · 발신자 ID 가 없어 국제 경로로만 나간다.
   - 수신 화면에 국제발신으로 보이고, 발신번호를 지정할 수 없다.
   - 한글은 70자 단위로 나뉘어 건마다 과금된다.
   - 한국행 단가는 공개 요금표에 없다. 발송 후 사용량 보고서로 확인한다.

## 3. IAM — 앱 권한

정책 `roomless-<dev|prod>-app` (최소 권한):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {"Sid": "FilesObject", "Effect": "Allow", "Action": ["s3:PutObject", "s3:GetObject", "s3:DeleteObject"], "Resource": "arn:aws:s3:::roomless-<dev|prod>-files/*"},
    {"Sid": "FilesList", "Effect": "Allow", "Action": "s3:ListBucket", "Resource": "arn:aws:s3:::roomless-<dev|prod>-files"},
    {"Sid": "Sms", "Effect": "Allow", "Action": "sns:Publish", "Resource": "*"}
  ]
}
```

- `s3:ListBucket` 이 없으면 없는 파일 확인(`exists`)이 404 가 아니라 403 으로 와서 503 이 된다. 꼭 넣는다.
- `sns:Publish` 는 토픽 없이 번호로 직접 보내므로 `Resource: "*"` 다.
- **로컬 · 자체 서버** — IAM 사용자에 정책을 붙이고 액세스 키를 만들어 `.env` 에 넣는다.
- **EC2 · ECS** — 인스턴스 · 태스크 역할에 정책을 붙이고 `.env` 의 키는 비운다. SDK 가 역할 자격증명을 쓴다.

## 4. `.env`

```bash
AWS_REGION=ap-northeast-2
AWS_ACCESS_KEY_ID=<IAM 액세스 키>        # IAM 역할이면 비운다
AWS_SECRET_ACCESS_KEY=<IAM 비밀 키>     # IAM 역할이면 비운다
AWS_S3_BUCKET=roomless-dev-files
AWS_S3_PUBLIC_URL=https://roomless-dev-files.s3.ap-northeast-2.amazonaws.com   # 필수 — CloudFront 를 쓰면 그 주소
```

Docker 는 `env_file: .env` 로 그대로 받는다. 게이트웨이에는 AWS 비밀값이 전달되지 않는다(compose.gateway.yml).

## 5. 확인

- 부팅 로그에 `AWS_REGION ...` · `AWS_REGION · AWS_S3_BUCKET · AWS_S3_PUBLIC_URL ...` 경고가 없으면 값이 들어간 것이다.
- SMS — 샌드박스에 등록한 번호로 보내 본다: `aws sns publish --region ap-northeast-2 --phone-number +8210XXXXXXXX --message "roomless 테스트"`
- S3 — 콘솔에서 아무 이미지나 올리고 `https://<버킷>.s3.ap-northeast-2.amazonaws.com/<키>` 가 열리는지 본다.
~~~

### 규약 문서 — `docs/integration.md` (new, draft) · AGENTS.md · docs

외부 연동은 지금 docs/AGENTS.md 에 없는 규약 영역이다(§4.5). 새 문서를 draft 표식과 함께 만들었고, ship 리뷰에서 코드와 대조한 뒤 표식을 뗐다(아래는 확정본).

~~~markdown
# 외부 연동 (`libs/integration`)

> 첫 사용처는 Phase 5(휴대폰 인증 · 비밀번호 초기화)다. AWS 세팅은 [guides/aws-setup.md](guides/aws-setup.md).

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
~~~

AGENTS.md 변경부 (전후):

```diff
 libs/
 ├── common/       # 실패 응답 DTO · toFailResult · 예외 필터 · ValidationPipe 팩토리 · 순수 util · 내부 요청 가드
 ├── contracts/    # 게이트웨이↔서비스 공유 규격: ...
 ├── database/     # entities/<domain>/ · entities.ts · migrations/ · migrations.ts · DatabaseModule · JobLockService · typeorm-error · seeder
+├── integration/  # 외부 연동 포트 — SMS 발송(SMS_SENDER · Amazon SNS) · 파일 저장(STORAGE_GATEWAY · S3) · SmsModule · StorageModule(전역)
 └── messaging/    # RabbitMQ 연결 · 발행 · 소비 · @OnCommand · CommandDispatcher

-... service 는 아웃바운드 포트(repository 인터페이스 Symbol 토큰)와 프레임워크 서비스(`JwtService`)만 안다.
+... service 는 아웃바운드 포트(repository · 외부 연동 인터페이스 Symbol 토큰)와 프레임워크 서비스(`JwtService`)만 안다.

-- **Import alias**: 앱 간 공유는 `@app/<lib>/<경로>.js`(`@app/common` · `@app/contracts` · `@app/database` · `@app/messaging`).
+- **Import alias**: 앱 간 공유는 `@app/<lib>/<경로>.js`(`@app/common` · `@app/contracts` · `@app/database` · `@app/integration` · `@app/messaging`).

-- **순수 함수(stateless) → util**: 전역 `libs/common/src/utils/*.ts`(`bcrypt` · `hash` · `cipher` · `jwt` · `validation` · `fail-result` · `retry`), ...
+- **순수 함수(stateless) → util**: 전역 `libs/common/src/utils/*.ts`(`bcrypt` · `hash` · `cipher` · `jwt` · `validation` · `fail-result` · `retry` · `pagination`), ... `pagination.ts` 의 `Pagination` 만 계산 결과를 들고 다니는 값 객체라 class 다.

-... 페이지 기본값은 `PaginationDto` 생성자(하위 util 의 NaN 폴백에 맡기지 않는다), ...
+... 페이지 기본값은 `PaginationDto` 생성자(`libs/common/src/dto/pagination.dto.ts` 의 `PAGINATION_DEFAULTS` — 하위 util 의 NaN 폴백에 맡기지 않는다), ...

-- **Pagination (미적용 규약)**: ... 공통 `PaginationDto` · `Pagination` 은 첫 목록 API 에서 `libs/common` 에 만든다.
+- **Pagination (미적용 규약 — 자산은 있음, 사용처 0)**: ... 공통 `PaginationDto`(`libs/common/src/dto/pagination.dto.ts`) · `Pagination`(`libs/common/src/utils/pagination.ts` — `limit` · `offset` · `getPagination()`)을 쓴다: `new Pagination({...dto, total_count})`.

-- **Repository DI**: ... 메시징 포트(`COMMAND_PUBLISHER` · `RESULT_SUBSCRIBER`)도 같은 패턴.
+- **Repository DI**: ... 메시징 포트(`COMMAND_PUBLISHER` · `RESULT_SUBSCRIBER`) · 외부 연동 포트(`SMS_SENDER` · `STORAGE_GATEWAY`)도 같은 패턴.
-- **전역 모듈**: `TransportModule`(게이트웨이) · `DatabaseModule` · `MessagingModule` 은 전역이라 ...
+- **전역 모듈**: `TransportModule`(게이트웨이) · `DatabaseModule` · `MessagingModule` · `SmsModule` · `StorageModule` 은 전역이라 ...
+- **외부 연동 (미적용 규약 — 첫 사용처 Phase 5)**:
+  - **mock · 가짜 어댑터를 두지 않는다.** 실제 서비스 어댑터 + 세팅 가이드(`docs/guides/`)로 만들고, 세팅 전에는 `.env` 값이 비어 요청만 실패한다(부팅은 된다).
+  - 발송은 SMS 하나다 — `SMS_SENDER.send({to, text})`(Amazon SNS). 이메일 · 알림톡 · 푸시는 쓰지 않는다.
+  - 사진은 `STORAGE_GATEWAY`(S3)의 presigned URL 로 올린다. 파일 본문은 게이트웨이 · 브로커를 거치지 않는다.
+  - 포트를 쓰는 앱 루트 모듈이 `SmsModule` · `StorageModule` 중 필요한 것을 import 한다.
+  - 외부 실패는 어댑터가 503(`SMS_UNAVAILABLE_MESSAGE` · `STORAGE_UNAVAILABLE_MESSAGE`)으로 던지고, service 는 잡지 않는다. 재시도되면 다시 나가므로 발송은 명령의 마지막 단계에 둔다.
+  - → 상세: [docs/integration.md](docs/integration.md) · AWS 세팅: [docs/guides/aws-setup.md](docs/guides/aws-setup.md)

-- **큐 경로**: ... **repository(Symbol 토큰) · `JwtService` 만 mock** 주입, ...
+- **큐 경로**: ... **repository · 외부 연동 포트(Symbol 토큰) · `JwtService` 만 mock** 주입, ...
-- **동기 경로**: 실제 controller + service + ValidationPipe + 필터 + 전역 InternalAuthGuard 부팅, repository · JwtService 만 mock.
+- **동기 경로**: 실제 controller + service + ValidationPipe + 필터 + 전역 InternalAuthGuard 부팅, repository · 외부 연동 포트 · JwtService 만 mock.

 ## Checklist
+- [ ] 외부 연동: mock · 가짜 어댑터 없음(실제 어댑터 + `docs/guides/` 가이드), 발송은 `SMS_SENDER` 하나(이메일 · 알림톡 · 푸시 ❌), 파일은 `STORAGE_GATEWAY` presigned URL(파일 본문을 게이트웨이 · 브로커로 보내지 않음), 발송은 명령의 마지막 단계
```

docs 변경부:

```diff
 # docs/architecture.md:34 — libs/common 행
-| `libs/common` | `ApiFailResultDto` · `toFailResult` · `CustomErrorFilter` · `validationExceptionFactory` · 순수 util(bcrypt/hash/cipher/jwt/validation/fail-result/retry) · ...
+| `libs/common` | `ApiFailResultDto` · `toFailResult` · `CustomErrorFilter` · `validationExceptionFactory` · `PaginationDto`/`PaginationResultDto` · 순수 util(bcrypt/hash/cipher/jwt/validation/fail-result/retry/pagination) · ...
 # docs/architecture.md:36 다음 — 새 행
+| `libs/integration` | 외부 연동 포트 `SMS_SENDER`(Amazon SNS) · `STORAGE_GATEWAY`(Amazon S3, presigned URL) · `SmsModule` · `StorageModule`(전역) — [integration.md](integration.md) · [guides/aws-setup.md](guides/aws-setup.md) | 포트를 쓰는 서비스(첫 사용처 Phase 5) |
 # docs/architecture.md:40 — 의존 방향
-... `contracts` 는 외부 패키지만, `database` 는 다른 lib 를 쓰지 않는다.
+... `contracts` 는 외부 패키지만, `database` · `integration` 은 다른 lib 를 쓰지 않는다.
 # docs/architecture.md:96 — 전역 모듈
-전역 모듈 — `TransportModule`(`@Global`) · `DatabaseModule`(`@Global`, `JobLockService` export) · `MessagingModule.forGateway()/forService()`(...)
+전역 모듈 — `TransportModule`(`@Global`) · `DatabaseModule`(`@Global`, `JobLockService` export) · `SmsModule` · `StorageModule`(`@Global`, `SMS_SENDER` · `STORAGE_GATEWAY` export) · `MessagingModule.forGateway()/forService()`(...)

 # docs/conventions.md:108
-> 현재 `@Query()` 사용처 0건 · `PaginationDto` 미이식. 첫 목록 API 에서 이대로 적용한다. 출처: 사용자 결정(2026-07-27).
+> 현재 `@Query()` 사용처 0건. `PaginationDto` 는 `libs/common/src/dto/pagination.dto.ts` 에 있다(기본값 상수 `PAGINATION_DEFAULTS`). 첫 목록 API 에서 이대로 적용한다. 출처: 사용자 결정(2026-07-27).
 # docs/conventions.md:149
-- **순수 함수 → util** (named `function`, `@Injectable` 없음): 전역 `libs/common/src/utils/`(bcrypt · hash · cipher · jwt · validation · fail-result · retry), ...
+- **순수 함수 → util** (named `function`, `@Injectable` 없음): 전역 `libs/common/src/utils/`(bcrypt · hash · cipher · jwt · validation · fail-result · retry · pagination), ... 예외 — `Pagination` 은 계산 결과(`limit` · `offset` · `getPagination()`)를 들고 다니는 값 객체라 class 다.

 # docs/data-layer.md:155
-> 현재 목록 API · `PaginationDto` · `Pagination` · `@Query()` 모두 0건. 첫 목록 API 에서 공통 `PaginationDto` · `Pagination` util 을 `libs/common` 에 만들고 이 형태를 따른다. ...
+> 현재 목록 API · `@Query()` 0건. 공통 `PaginationDto`(`libs/common/src/dto/pagination.dto.ts`) · `Pagination`(`libs/common/src/utils/pagination.ts`)은 있다 — 첫 목록 API 에서 이 형태를 따른다. ...
 # docs/data-layer.md:158 뒤 — 한 줄 추가
+- 쓰는 모양: `const pagination = new Pagination({...dto, total_count});` → `findXList(where, pagination.limit, pagination.offset)` → `{list, pagination: pagination.getPagination()}`.

 # docs/testing.md:101 뒤 — 위치 · 방식 표에 한 행
+| AWS 어댑터 | `vi.hoisted` + `vi.mock('@aws-sdk/client-sns' · '@aws-sdk/client-s3' · '@aws-sdk/s3-request-presigner')` — 가짜 Client(`send`) · Command(`input` 보관). 보낸 명령의 input · 오류 → 503 · 404 → false 를 단언. env 는 저장 · 복원 |
 # docs/testing.md:107 — mock 경계
-- **mock 경계**: 서비스 spec 은 repository(Symbol 토큰 `USER_REPOSITORY`)와 `JwtService`(class 토큰)를 mock 하고, ...
+- **mock 경계**: 서비스 spec 은 repository(Symbol 토큰 `USER_REPOSITORY`) · 외부 연동 포트(Symbol 토큰 `SMS_SENDER` · `STORAGE_GATEWAY` — [integration.md](integration.md))와 `JwtService`(class 토큰)를 mock 하고, ...
 # docs/testing.md:153 뒤 — 분류 태그 표에 한 행
+| `[CASES:<unit>]` | 계산형 유닛의 입력→출력 표 — 기획(plan)에서 합의한 케이스만 (`pagination.spec.ts` · `integration.util.spec.ts`) |
```

---

## Test Cases

**케이스 상태 — 추천안이다.** 케이스를 하나씩 물어 합의하는 대신 추천안으로 넣었고, 이 plan 을 검토하는 것이 곧 합의다. 빼거나 더할 케이스는 `/beaver:build` 전에 말하면 반영한다. build 는 계산형 케이스부터 쓴다.

**`libs/common/src/utils/test/pagination.spec.ts`** — 순수 util 직접 호출. 형제는 `retry.spec.ts` 다(docs/testing.md:103).

```
[CASES:Pagination]
 1. 기본 — {all_search_yn:'N', total_count:95, page:1, size:20, page_size:10} → page 1 · max_page 5 · limit 20 · offset 0 · page_range {1,5} · content_start_number 95 · content_start_number_reverse 1
 2. 쿼리 문자열 — {all_search_yn:'N', total_count:'95', page:'3', size:'20', page_size:'10'} → page 3 · offset 40 · max_page 5 · page_range {1,5} · content_start_number 55 · reverse 41
 3. 나누어떨어지는 경계 — total 100 · size 20 → max_page 5 / total 101 · size 20 → max_page 6
 4. 1 보다 작은 page — page 0 → page 1 · offset 0 / page '-2' → page 1 · offset 0
 5. max_page 를 넘는 page — total 95 · size 20 · page 9 → page 5 · offset 80 · content_start_number 15 · reverse 81
 6. 0건 — total 0 · page 3 → max_page 1 · page 1 · offset 0 · page_range {1,1} · content_start_number 0 · reverse 1
 7. 전체 조회 — {all_search_yn:'Y', total_count:95, page:3, size:20} → all_search_yn 'Y' · page 1 · max_page 1 · size 95 · limit 95 · offset 0 · page_range {1,1}
 8. Y/N 이 아닌 값 — all_search_yn 'X' · 'y' → 'N' 로 계산 (total 95 · page 2 → page 2 그대로, offset 20)
 9. 페이지 탭 묶음 — total 500 · size 20(max_page 25) · page_size 10: page 10 → {1,10} / page 13 → {11,20} / page 23 → {21,25}(끝을 max_page 로 자름)
10. 숫자가 아닌 값 — {page:'abc', size:'', page_size:'x', total_count:'abc'} → page 1 · size 20 · page_size 10 · total_count 0 · max_page 1 · limit 20
11. 0 이하 size · page_size — size '0' · page_size '-1' · total 95 → size 20 · page_size 10 · max_page 5 (0 나누기로 Infinity 가 되지 않는다)

[CASES:PaginationDto]
12. 생성자 기본값 — new PaginationDto() → {all_search_yn:'N', page:1, size:20, page_size:10} / new PaginationDto({page:2, all_search_yn:'Y'}) → page 2 · 'Y' · size 20 · page_size 10 / ValidationPipe 경로 plainToInstance(PaginationDto, {page:'3'}) → page '3' · 나머지 기본값 (인자 없는 생성자 호출이 500 이 나지 않는다)

[SUCCESS]  getPagination() 결과가 PaginationResultDto · page_range 가 PageRangeResultDto 인스턴스 (toBeInstanceOf) — 케이스 1 안에서 함께 단언
```

**`libs/integration/src/test/integration.util.spec.ts`**

```
[CASES:toE164KrPhone]
 1. '01012345678' → '+821012345678'
 2. '010-1234-5678' → '+821012345678'
 3. ' 010 1234 5678 ' → '+821012345678' (공백)
 4. '+82 10-1234-5678' → '+821012345678' (국가번호가 이미 붙은 번호)
 5. '0111234567' → '+82111234567' (10자리 옛 번호)
```

**`libs/integration/src/sms/test/sns-sms.sender.spec.ts`** — 형제는 RabbitMQ 어댑터 spec 이다(`vi.hoisted` + `vi.mock('amqplib', ...)`, docs/testing.md:101 · 118). 가짜 `SNSClient`(`send` = hoisted mock)와 `PublishCommand`(생성자 인자를 `input` 으로 보관)를 쓴다. `new SnsSmsSender()` 로 직접 만든다.

```
[SUCCESS]      send({to:'010-1234-5678', text:'[roomless] 인증번호 123456'}) → client.send 1회, PublishCommand.input = {PhoneNumber:'+821012345678', Message:'[roomless] 인증번호 123456', MessageAttributes:{'AWS.SNS.SMS.SMSType':{DataType:'String', StringValue:'Transactional'}}}
[FAIL:infra]   client.send 가 reject(new Error('Throttling')) → ServiceUnavailableException, getResponse() = {message:'SMS를 보내지 못했습니다. 잠시 후 다시 시도해주세요.'}
```

**`libs/integration/src/storage/test/s3-storage.gateway.spec.ts`** — 가짜 `S3Client` · `PutObjectCommand` · `HeadObjectCommand` · `DeleteObjectCommand` · `getSignedUrl`. `AWS_REGION` · `AWS_S3_BUCKET` · `AWS_S3_PUBLIC_URL` 은 `beforeEach` 에서 저장 · 설정하고 `afterEach` 에서 복원한다. 날짜는 `vi.useFakeTimers({toFake: ['Date']})` 다.

```
[SUCCESS]      createUploadUrl({key:'store/s1/a.jpg', content_type:'image/jpeg'}) → getSignedUrl 1회(client, PutObjectCommand.input={Bucket:'roomless-test-files', Key:'store/s1/a.jpg', ContentType:'image/jpeg'}, expiresIn 600) · 결과 {upload_url:<서명 결과>, expires_at: 고정 시각 + 600초}
[FAIL:infra]   getSignedUrl reject → 503 {message:'파일 저장소에 연결할 수 없습니다. 잠시 후 다시 시도해주세요.'}
[SUCCESS]      exists('store/s1/a.jpg') — HeadObject resolve → true (HeadObjectCommand.input={Bucket, Key})
[SUCCESS]      exists — reject({$metadata:{httpStatusCode:404}}) → false
[FAIL:infra]   exists — reject({$metadata:{httpStatusCode:403}}) → 503 (권한 · 장애는 "없음"으로 보지 않는다)
[FAIL:infra]   remove — DeleteObject reject → 503 / resolve 면 DeleteObjectCommand.input={Bucket, Key}
[SUCCESS]      클라이언트 설정 = {region:'ap-northeast-2', requestChecksumCalculation:'WHEN_REQUIRED'} — 기본값이면 presigned 주소에 빈 본문 CRC32 가 박혀 실제 업로드가 거부된다 (ship 리뷰 #1)
[SECURITY]     서명 옵션 = {expiresIn:600, signableHeaders: Set(['content-type'])} — 다른 타입으로는 올릴 수 없다 (ship 리뷰 #2)
[CASES:getPublicUrl]
 1. AWS_S3_PUBLIC_URL 'https://cdn.example.com/' → 'https://cdn.example.com/store/s1/a.jpg' (끝 / 제거)
 2. AWS_S3_PUBLIC_URL 'https://roomless-test-files.s3.ap-northeast-2.amazonaws.com' → '…amazonaws.com/store/s1/a.jpg'
[FAIL:infra]   AWS_S3_PUBLIC_URL 비움 → InternalServerErrorException {message:'설정된 파일 공개 주소가 없습니다. 관리자에게 문의해주세요.'} — 주소를 지어내지 않는다 (ship 리뷰 #3)
```

```
테스트 생략(위임형):
- SmsModule · StorageModule — provider 연결뿐(배선 글루). 첫 사용처의 service spec 이 Symbol 토큰 주입으로 확인한다.
- onApplicationBootstrap 경고 — 로그 한 줄. Nest 로거는 테스트에서 꺼져 있다(vitest.setup.ts).
- integration.symbols / constants / interfaces — 값 · 타입 선언. 타입은 `npm run typecheck` 가 검사한다.
- tsconfig paths · package.json — `npm run typecheck` · `npm test` · `npm run build` 통과로 확인.
- .env.example · compose.gateway.yml — 설정 파일. `docker compose -f compose.gateway.yml config` 로 문법만 확인한다(컨테이너는 띄우지 않는다).
- [FAIL:validation] — 해당 없음. PaginationDto 필드는 `@IsOptional()` 만이라 반려 분기가 없다(잘못된 값은 Pagination 이 바로잡는다 — 케이스 4 · 8 · 10 · 11). 받는 번호 형식 검증은 Phase 5 입력 DTO 몫이다.
- [SMOKE:data-access] — 해당 없음. repository · 쿼리 변경이 없다.
- 실제 AWS 호출 — 테스트에서 하지 않는다(외부 IO 금지). 실제 동작 확인은 가이드 5단계(사용자).
```

검증(build 후 `/beaver:test`): `npm test` · `npm run typecheck` · `npm run lint` · `npm run build` · `docker compose -f compose.gateway.yml config`. 엔티티 변경이 없으므로 `db:check` 는 대상이 아니다.

---

## Response Codes

공개 라우트가 없다. 아래는 각 진입점이 내는 결과 계약이다.

| Code | Cause |
|------|------|
| `send` resolve | SNS 가 접수함(`MessageId` 발급) |
| 503 `{message: 'SMS를 보내지 못했습니다. 잠시 후 다시 시도해주세요.', validation_errors: null}` | SNS 거부 · 자격증명 없음 · 리전 없음 · 샌드박스 미등록 번호 · 지출 한도 초과 — 큐 경로에서 재시도 3회 후 failed + DLQ |
| `createUploadUrl` resolve `{upload_url, expires_at}` | presigned PutObject 주소(600초 유효, Content-Type 서명 — 클라이언트는 같은 Content-Type 으로 PUT) |
| `exists` resolve `true` / `false` | HeadObject 성공 / 404 |
| `getPublicUrl` `string` | `AWS_S3_PUBLIC_URL` + 키 (S3 에 묻지 않음) |
| 500 `{message: '설정된 파일 공개 주소가 없습니다. 관리자에게 문의해주세요.', validation_errors: null}` | `AWS_S3_PUBLIC_URL` 이 비어 있음(`getPublicUrl`) |
| `remove` resolve | DeleteObject 성공(없는 키도 성공) |
| 503 `{message: '파일 저장소에 연결할 수 없습니다. 잠시 후 다시 시도해주세요.', validation_errors: null}` | 서명 실패 · 404 가 아닌 S3 오류(403 권한 · 장애) · 버킷 없음 |
| `new Pagination(...)` | 던지지 않음 — 숫자가 아니거나 범위를 벗어난 값은 바로잡는다(케이스 4 · 5 · 8 · 10 · 11) |
| `PaginationDto` 검증 | 반려 없음 — `@IsOptional()` 만 |
| 부팅 경고 로그 | `AWS_REGION`(SMS) · `AWS_REGION`/`AWS_S3_BUCKET`/`AWS_S3_PUBLIC_URL`(S3) 이 비어 있을 때 어댑터마다 1회(부팅은 계속) |
