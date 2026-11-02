# Review — main — 261102

> Pre-merge code review. Check the accumulated changes against the memory rules, AGENTS.md conventions, and the plan/spec intent.
> Location: `.beaver/output/review/` — `<stick>-review-<YYMMDD>.md` (stick = branch name with `/`→`-`, one per ship unit). For a re-review on the same day, append `-<N>`.

## Target
- stick: 해당 없음(direct mode) → origin: `main`
- Included features: reservation 기반(로드맵 Phase 16 — #63 ~ #66) — 예약 · 예약 구간 · 결제 스키마(+룩업 3 · 시드 · 마이그레이션 `ReservationSchema`), 결제 포트 `PAYMENT_GATEWAY`(토스페이먼츠 — 조회 검증 · 환불), 호실 그룹 고정(호실 수정에서 그룹 변경 제거)
- Change scope: 수정 27 · 새 파일 11(엔티티 6 · 마이그레이션 1 · 어댑터 2 · 토스 가이드 1 · report) + spec · plan · 이 리뷰, `git diff HEAD` 279+ / 79−(새 파일 제외)

## Convention Check (against AGENTS.md)
| Item | Result | Notes |
|------|------|------|
| Naming | pass | 테이블 `t_<feature>` · 제약 `PK_/UK_/FK_/IDX_/CHK_/EXC_<Model>_…`(생성된 마이그레이션에 `UQ_<해시>` 없음) · 시각 `<과거분사>_at` · 앞으로 올 시각 `expires_at` · 룩업 ID 영어 대문자(`PENDING` · `BASE` · `REFUND_REQUESTED`) · 포트 `PAYMENT_GATEWAY = Symbol('PaymentGatewayInterface')` · 어댑터 `toss-payment.gateway.ts` |
| Structure & layering | pass | 엔티티는 `libs/database/src/entities/{reservation,payment}/` · ENTITIES 등록 · FK 는 문자열 속성 + `@ManyToOne`(역방향 없음, NOT NULL → CASCADE), 포트 · 어댑터는 `libs/integration`(Symbol + 인터페이스 + `@Global` 모듈 — 형제 SMS · 저장소 · 문 정보와 같은 모양), 호실 수정은 controller → service → repository 그대로 |
| Shared logic extraction | pass | 토스 실패 분류는 순수 함수 `classifyTossFailure`(integration.util.ts — 형제 `toE164KrPhone`), 어댑터 파일 전용 헬퍼 `toLookupResult` 는 export 안 함(인프라 파일 허용), 날짜 해석은 `@app/common/utils/dayjs.js` |
| Errors & responses | pass | 외부 실패는 어댑터가 503(`PAYMENT_UNAVAILABLE_MESSAGE`) · 업무 실패 400 `{message, payment_error_code}`(실패 본문 = 기능별 추가 필드), 메시지 상수 `*_MESSAGE`, 로그는 인프라 클래스 `Logger` 만, 키 없으면 부팅 경고 · 요청만 503(형제 SNS) |
| Test strength | pass | room-update.spec — 호출 인자 · `toBeInstanceOf(RoomEntity)` · 미설정 필드(`room_group_id` · `room_state_id` · `store_id`) · `findRoomGroup` 미호출 · 실패 뒤 `updateRoom` 미호출, 한국어 리터럴, 분류 태그. 엔티티 · 어댑터는 plan 대로 spec 없음(AGENTS — 라이브러리 · 인프라 spec 없음), 데이터 접근 메서드 추가 없음 → Smoke 해당 없음 |
| memory | pass | `.beaver/output` 커밋 포함(git), 자격증명 로그 정책(api-log) 무관. cache 항목(미반영)은 캐시 코드가 생기는 Phase 23 때 옮길 후보 — 이번 변경과 무관해 제안하지 않음 |
| 기타 규약 | pass | README · AGENTS · docs(data-layer · integration · architecture) · `.env.example` · compose(쓰지 않는 앱에 `TOSS_SECRET_KEY: ''`) 같은 변경에서 갱신, mock 어댑터 없음(실제 토스 API + `docs/guides/toss-setup.md`), 삭제 정책 — 예약 · 구간 · 결제는 지우지 않는 기록(취소 · 만료는 상태)이라 `is_deleted` 없음 |

## Intended Behavior Check (against plan/spec)
- **스키마**: spec 결정 그대로 — 예약 상태 6(점유 3), 구간 상태 4(CHECK), 결제 상태 7, 예약에 그룹 없음(호실로) · 최종 체크아웃 `end_at` · 합계 · 기본 상품 · 예약 때 정비시간 · 점유 끝, 구간마다 결제 FK + UK, 결제 스냅샷 · `environment` 기본값 없음 · 환불 없으면 `refund_amount` null · CHECK 불변식. PGlite 32/32 로 동작 확인(겹침 23P01 · 맞닿음 허용 · 비활성 상태 허용 · CHECK · UK · down/up).
- **결제 포트**: 프론트 승인 · 서버 검증(`getPayment` · `findByPaymentId` — 결제 없음 null) · 전액 취소(멱등키 `cancel-<payment_id>`), 실패 분류 표 10/10 + 네트워크 503(코드 읽기). 앱 등록 없음(Phase 17) — plan 대로.
- **호실 그룹 고정**: DTO 에서 `room_group_id` 삭제, service 그룹 조회 · 대입 삭제, 예전 클라이언트가 보내도 무시(ValidationPipe 는 `whitelist` 꺼짐 · `forbidNonWhitelisted` 는 whitelist 가 켜져야 동작 — 그래서 400 이 아니라 무시, spec 케이스로 고정). 등록은 그대로 그룹을 받는다.
- 빠진 것 · 잘못 구현된 것 없음. plan 과 다른 점 2개는 report 에 기록(어댑터 `request` 의 `RequestInit` · 본문 읽기 503, 생성기 등록 방식) — plan 코드 블록도 실제 파일에 맞췄다.

## Findings
| # | Severity | Location (path:line) | Description | Recommendation |
|---|--------|-----------------|------|------|
| 1 | Low | `libs/database/src/entities/payment/payment.entity.ts` · `reservation.entity.ts` (`@ManyToOne(… onDelete: 'CASCADE')`) | 회원 · 업체 · 호실 행을 실제로 지우면 결제 · 예약 기록이 함께 지워진다. 지금은 모든 삭제가 소프트 삭제(앱 코드에 `DELETE` 없음)라 일어나지 않고, NOT NULL FK 는 CASCADE 라는 규약을 따른 것이다 | 그대로 둔다. 실제 삭제(개인정보 파기 등)를 도입할 때 결제 기록 보존과 함께 다시 본다 |
| 2 | Low | `libs/integration/src/payment/toss-payment.gateway.ts` | 실제 토스 API 로 호출해 보지 않았다(실호출 금지 · 키 없음). 요청 모양(Basic 인증 · 경로 · 멱등키 헤더 · cancelReason)은 토스 문서와 코드 읽기로만 맞췄다 | Phase 17 결제 확인 API 를 만들 때 테스트 키로 조회 · 취소를 한 번씩 확인한다(가이드 5절) |
| 3 | Info | `scripts/db-schema.mjs:125` | plan 에 없던 수정 — 마이그레이션 목록이 200자를 넘어 Prettier 가 여러 줄(끝 쉼표)로 펼치면 다음 `db:generate` 가 빈 칸(`,,`)을 만들던 등록 방식을 한 줄에 하나씩으로 바꿨다. 다음 등록 모의 확인 · `db:check` 통과 | 없음 — 이번 등록이 원인이라 같은 변경에 둔다 |

## Verdict
Pass — Low 2건은 지금 고칠 것이 없다(1 은 규약대로 · 삭제 정책상 발생하지 않음, 2 는 Phase 17 에서 실호출 확인). 커밋으로 진행한다.
