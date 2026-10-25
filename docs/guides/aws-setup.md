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
2. **퍼블릭 액세스 차단 — 네 항목 모두 켠다.** 버킷은 직접 공개하지 않는다. 공개 파일은 CloudFront 로만, 비공개 파일(사업자등록증 · `private/…`)은 서버가 발급한 서명 주소(10분)로만 본다.
3. **버킷 정책** — 5단계에서 CloudFront 배포를 만든 뒤 붙인다. CloudFront 가 읽을 수 있는 것은 공개 접두 `store/*` 뿐이다(`private/*` 는 열지 않는다).
   ```json
   {
     "Version": "2012-10-17",
     "Statement": [{
       "Sid": "CloudFrontReadPublicPrefix",
       "Effect": "Allow",
       "Principal": {"Service": "cloudfront.amazonaws.com"},
       "Action": "s3:GetObject",
       "Resource": "arn:aws:s3:::roomless-<dev|prod>-files/store/*",
       "Condition": {"StringEquals": {"AWS:SourceArn": "arn:aws:cloudfront::<계정 ID>:distribution/<배포 ID>"}}
     }]
   }
   ```
   공개 접두가 늘면(객실 사진 등) `Resource` 에 그 접두를 더한다.
4. **CORS** — 브라우저가 presigned URL 로 직접 PUT 한다. `AllowedOrigins` 는 `.env` 의 `CORS_ORIGINS` 와 같은 프론트 주소로 한다.
   ```json
   [{"AllowedOrigins": ["http://localhost:3001"], "AllowedMethods": ["PUT", "GET"], "AllowedHeaders": ["*"], "ExposeHeaders": ["ETag"], "MaxAgeSeconds": 3000}]
   ```
   프론트는 업로드 주소를 요청할 때 보낸 `content_type` 과 **같은 `Content-Type` 헤더**로 PUT 한다. Content-Type 이 서명에 들어가 있어 다르면 S3 가 403 으로 거부한다.
5. **CloudFront(기본 구성)** — 공개 파일(업체 사진)은 CDN 주소로 내려간다.
   - 배포 만들기 → 원본: 이 버킷(S3 REST 엔드포인트 — 웹사이트 엔드포인트 아님) · **원본 액세스 제어(OAC)** 를 새로 만들어 고른다. 콘솔이 보여 주는 버킷 정책 대신 3단계의 `store/*` 정책을 붙인다.
   - 뷰어 프로토콜: Redirect HTTP to HTTPS · 허용 메서드: GET, HEAD.
   - 캐시 정책: `CachingOptimized`(긴 TTL). 서버가 업로드마다 새 키를 만들고 같은 키를 덮어쓰지 않으므로 무효화(invalidation)가 필요 없다.
   - 응답 헤더 정책(선택): 프론트가 `fetch` 로 이미지를 읽으면 `CORS-With-Preflight` 를 붙인다. `<img>` 로만 쓰면 필요 없다.
   - 배포 도메인(`https://<배포>.cloudfront.net` 또는 연결한 도메인)을 `AWS_S3_PUBLIC_URL` 에 넣는다.

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
AWS_S3_PUBLIC_URL=https://<배포>.cloudfront.net   # 필수 — CloudFront 배포 주소(공개 파일 주소의 기준)
```

Docker 는 `env_file: .env` 로 그대로 받는다. 게이트웨이에는 AWS 비밀값이 전달되지 않는다(compose.gateway.yml).

## 5. 확인

- 부팅 로그에 `AWS_REGION ...` · `AWS_REGION · AWS_S3_BUCKET · AWS_S3_PUBLIC_URL ...` 경고가 없으면 값이 들어간 것이다.
- SMS — 샌드박스에 등록한 번호로 보내 본다: `aws sns publish --region ap-northeast-2 --phone-number +8210XXXXXXXX --message "roomless 테스트"`
- S3 · CloudFront — 콘솔에서 `store/test.jpg` 를 올리고 `https://<배포>.cloudfront.net/store/test.jpg` 가 열리는지 본다. `private/test.jpg` 는 같은 주소 모양으로 403 이어야 한다(서명 주소로만 열린다).
