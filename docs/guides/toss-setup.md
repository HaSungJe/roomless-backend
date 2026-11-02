# 토스페이먼츠 세팅 가이드

> 결제창 · 승인은 프론트(Next.js), 서버(이 저장소)는 **토스에서 다시 읽어 검증**하고 **환불**한다. 개발은 테스트 키로 — 실제 돈이 나가지 않는다.

## 1. 역할

```
이용자 → (프론트) 결제창(클라이언트 키 test_ck_…) → 토스 인증
       → (프론트 서버) 승인 API POST /v1/payments/confirm(시크릿 키) → 결과 paymentKey · orderId · amount 를 서버로
       → (서버) GET /v1/payments/{paymentKey} 로 다시 읽어 대조(상태 DONE · 금액 · orderId = payment_id) → 기록
환불   → (서버) POST /v1/payments/{paymentKey}/cancel (Idempotency-Key cancel-<payment_id>)
```

- 주문번호(orderId)는 서버가 만든 결제 ID(`payment_id`, 32자)를 그대로 쓴다 — 결제 행을 먼저 만들고 그 ID · 금액 · 주문명을 프론트에 준다(Phase 17).
- 프론트가 넘긴 값만 믿지 않는다 — 금액 · 상태를 토스에서 다시 읽어 맞춰 본다.

## 2. 키 받기

1. 토스페이먼츠 개발자센터에 가입하고 로그인한다.
2. 내 개발 정보(API 키)에서 테스트 키를 확인한다 — 클라이언트 키 `test_ck_…`(프론트), 시크릿 키 `test_sk_…`(서버 · 프론트 서버).
3. 서버 `.env` 에 `TOSS_SECRET_KEY=test_sk_…` 를 넣는다. 프론트에도 같은 상점의 키를 쓴다.

- 시크릿 키는 서버에만 둔다(브라우저 · 저장소에 넣지 않는다). Basic 인증은 `키:` 를 base64 로 바꿔 쓴다(콜론 포함).
- `test_` 로 시작하는 키로 만든 결제는 `t_payment.environment = TEST` 로 남는다 — 통계 · 매출에서 뺀다.

## 3. 라이브로 바꾸기

- 전자결제 계약 · 심사가 끝나면 라이브 키(`live_sk_…` · `live_ck_…`)가 나온다. 서버 `.env` 의 `TOSS_SECRET_KEY` 만 바꾸면 된다 — 코드 · compose 는 그대로.

## 4. 실패와 재시도

| 토스 응답 | 서버가 돌려주는 것 |
|---|---|
| 카드 · 금액 · 이미 취소 · 취소 불가 금액 등 4xx | 400 — 토스 메시지 + `payment_error_code`(토스 code) · 재시도 없음 |
| 5xx · `PROVIDER_ERROR` · 409(처리 중) · 401(키 오류) · 네트워크 · 시간 초과(30초) | 503 `결제 서비스에 연결할 수 없습니다` · 큐가 최대 3번 재시도 |
| 조회 404 `NOT_FOUND_PAYMENT` | 결제 없음(null) |

- 환불은 멱등키 `cancel-<payment_id>` 로 보내 재시도해도 한 번만 취소된다(멱등키는 15일 유효).

## 5. 문제 해결

| 증상 | 확인 |
|---|---|
| 부팅 경고 `TOSS_SECRET_KEY 가 비어 있어` | `.env` 의 `TOSS_SECRET_KEY` |
| 로그 `토스 조회 일시 실패: 401 UNAUTHORIZED_KEY` | 시크릿 키가 틀렸거나 테스트 · 라이브가 섞였다(프론트와 같은 상점 · 같은 환경 키인지) |
| 조회가 결제 없음(null) | 프론트가 승인하지 않았거나 다른 상점 키로 승인했다 |
