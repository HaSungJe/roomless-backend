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
