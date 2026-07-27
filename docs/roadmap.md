# 개발 로드맵

무인 객실 대여 백엔드의 전체 개발 순서와 진척도를 관리하는 **살아있는 문서**.
단계를 완료할 때마다(`ship` 시점) 상태 뱃지와 체크박스를 갱신한다.

| 뱃지 | 의미 |
|---|---|
| ⬜ | 예정 |
| 🟡 | 진행중 |
| ✅ | 완료 |

---

## 진척 요약

| 단계 | 도메인 | 상태 | 의존 |
|---|---|---|---|
| 0 | 기반(auth · user · store 등록) | ✅ | — |
| 1 | store 확장 | 🟡 | 0 |
| 2 | room | ⬜ | 1 |
| 3 | device | ⬜ | 2 |
| 4 | reservation + payment | ⬜ | 1, 2 |
| 5 | discovery | ⬜ | 1, 2 |
| 6 | extension | ⬜ | 3, 4 |
| — | 후순위(알림 · 토스 실연동 · 정산 · 리뷰) | ⬜ | — |

---

## 역할 정의

| 역할 (`t_auth`) | 하는 일 |
|---|---|
| `SUPER_ADMIN` / `ADMIN` | 업체 등록·수정·삭제, 매니저 계정의 업체 배정 |
| `MANAGER` | 자기 업체 1곳의 운영시간·브레이크타임 설정, 객실 및 객실 사물 관리, 객실 상태 전이(청소 → 스탠바이), 예약 현황 확인 |
| `USER` | 주변 업체 조회, 결제 후 객실 예약, 점유 중인 객실의 사물 제어, 추가 결제로 이용시간 연장 |

---

## 횡단 결정사항

로드맵 전체에 걸리는 확정 사항. 각 단계 기획에서 재논의하지 않는다.

| 항목 | 결정 |
|---|---|
| **매니저 소속** | 매니저 1명 = 업체 1곳. `t_user.store_id` nullable FK 로 표현하고, 매니저 API 인가는 "요청 대상이 내 `store_id` 와 일치하는가" 로 판정 |
| **이용상품 단위** | 객실별 개별 설정(`t_room_plan`). 업체가 객실마다 이름·규격과 `n분 + 가격` 상품을 정의 |
| **이용 단위** | 항상 시간 기반. 숙박은 별도 개념 없이 긴 `duration_minute` 상품으로 표현 |
| **사전 예약** | 지원. 미래 시각 지정 예약을 받는다 |
| **재고 판정** | ① 기존 예약과 `start_at ~ end_at` 구간 겹침 없음 **AND** ② 업체 운영시간 내이며 브레이크타임과 겹치지 않음 **AND** ③ 객실 상태가 `DISABLED` 가 아님 — 세 조건을 모두 통과해야 예약 가능. 여기에 더해 **즉시 입실**(`start_at` 이 현재 시각) 예약만 객실 상태가 `STANDBY` 일 것을 추가로 요구한다. 미래 시각 예약은 현재 상태(`OCCUPIED`·`CLEANING`)의 영향을 받지 않는다 — 그 시점에는 청소가 끝나 있을 것이기 때문 |
| **영업시간 단위** | 요일 반복만 지원(`t_store_hour` · `t_store_break`). 특정 날짜 임시휴무·특별영업은 후순위 |
| **룩업 기본 데이터** | 룩업 엔티티(`t_room_state` · `t_device_type` · `t_reservation_state`)의 기본 데이터는 [seeder.targets.ts](../src/modules/seeder/seeder.targets.ts) 한 곳에만 정의한다. 엔티티는 구조 컬럼만 갖고 시드 데이터·타임스탬프를 보유하지 않는다 |
| **페이지네이션** | 모든 목록 조회 API 는 1단계부터 `PaginationDto` 를 적용한다. 나중에 소급 적용하면 응답 스키마가 바뀌어 클라이언트까지 함께 고쳐야 하므로 처음부터 붙인다 |
| **사물 제어** | Redis pub/sub (MQTT 미사용). `DeviceGateway` 인터페이스로 추상화하고 명령·상태를 DB 이력으로 적재. 하드웨어는 이번 범위에서 제외 |
| **결제** | `PaymentGateway` 인터페이스로 추상화. 1차는 mock 어댑터, 토스 테스트결제는 후순위 단계에서 어댑터로 추가 |
| **규약** | [CLAUDE.md](../CLAUDE.md) 전면 준수 — snake_case 전 레이어, 기능당 DTO 1개, repository try/catch + 통일 500, public 메서드 1개 = API 1개 |

---

## 0단계 · 기반 ✅

이미 구현된 것.

- [x] 권한/상태/SNS 룩업 시드 (`SUPER_ADMIN` · `ADMIN` · `MANAGER` · `USER`)
- [x] JWT 인증(`PassportJwtAuthGuard`) + 역할 가드(`RolesGuard` · `@Roles`)
- [x] 회원 가입 · 로그인 · 토큰 갱신 · 탈퇴 · 탈퇴 철회 · 탈퇴 자동처리 스케줄러
- [x] 가맹점 등록 API (`POST /api/v1/store/register`, ADMIN 전용)
- [x] 인프라 — api-log(별도 DataSource) · seeder · BullMQ(미적용) · `haversineKm` 유틸

---

## 1단계 · store 확장 🟡

업체를 "예약 가능한 대상"으로 만드는 단계. 위치·영업시간·매니저를 채운다.

**엔티티** — `t_store_hour` · `t_store_break` 는 store 도메인 하위(`src/api/v1/store/entities/`)에 둔다

- [ ] `t_store` 에 `latitude` · `longitude` 컬럼 추가 (주변 검색용)
- [ ] `t_store_hour` — 요일별 영업 시작·종료 시각
- [ ] `t_store_break` — 요일별 브레이크타임 구간
- [ ] `t_user` 에 `store_id` nullable FK 추가 (매니저 소속)

**API — ADMIN**

- [x] 업체 목록 조회 (검색 `search_type`/`search_keyword` + 페이지네이션 최초 적용) — [store-crud-report.md](../.beaver/output/report/store/store-crud-report.md)
- [x] 업체 상세 조회 — 동 report
- [x] 업체 수정 (사업자등록번호는 수정 대상 제외) — 동 report
- [x] 업체 삭제(soft delete + `business_number` 마스킹 + `delete_backup` 스냅샷) — 동 report
- [ ] 매니저 업체 배정
- [ ] 매니저 업체 배정 해제

**API — MANAGER**

- [ ] 내 업체 상세 조회
- [ ] 영업시간 설정
- [ ] 브레이크타임 설정

---

## 2단계 · room ⬜

객실과 요금 상품, 그리고 청소 → 스탠바이 상태 전이.

**엔티티**

- [ ] `t_room_state` 룩업 + 시드 — `STANDBY`(예약가능) · `OCCUPIED`(이용중) · `CLEANING`(청소중) · `DISABLED`(사용중지). 청소 완료 후 `STANDBY` 가 곧 예약 가능 상태이므로 별도 `AVAILABLE` 은 두지 않는다
- [ ] `t_room` — `store_id` FK, 호실명, 규격, 수용인원, 설명, `room_state_id` FK
- [ ] `t_room_plan` — `room_id` FK, 상품명, `duration_minute`, `price`, 사용여부

**API — MANAGER**

- [ ] 객실 등록
- [ ] 객실 수정
- [ ] 객실 삭제
- [ ] 객실 목록 조회
- [ ] 객실 상태 변경 (이용중 → 청소중 → 스탠바이)
- [ ] 객실 상품 등록 · 수정 · 삭제 · 목록

---

## 3단계 · device ⬜

객실의 사물(전등 · 에어컨 · 도어락) 등록과 Redis pub/sub 제어.

**엔티티**

- [ ] `t_device_type` 룩업 + 시드 — `LIGHT` · `AIRCON` · `DOORLOCK`
- [ ] `t_device` — `room_id` FK, `device_type_id` FK, 기기명, 기기 식별키, 최근 상태, 최근 상태 수신 시각
- [ ] `t_device_command` — 명령 이력(요청자 · 요청시각 · 명령 내용 · 결과)

**인프라**

- [ ] `DeviceGateway` 인터페이스 (`src/modules/device-gateway/`)
- [ ] Redis pub/sub 구현체 — 명령은 채널로 publish, 기기가 올린 상태는 subscribe 로 수신해 `t_device` 갱신. Redis 미기동 시 graceful(BullMQ 모듈과 동일 전략)

**API — MANAGER**

- [ ] 사물 등록 · 수정 · 삭제 · 목록
- [ ] 사물 제어
- [ ] 사물 상태 조회

---

## 4단계 · reservation + payment ⬜

핵심 단계. 가용성 판정과 결제가 여기서 만난다.

**엔티티**

- [ ] `t_reservation_state` 룩업 + 시드 — `PENDING` · `PAID` · `CHECKED_IN` · `COMPLETED` · `CANCELED`
- [ ] `t_reservation` — `user_id` FK, `room_id` FK, `room_plan_id` FK, `start_at`, `end_at`, `reservation_state_id` FK, 결제금액
- [ ] `t_payment` — `reservation_id` FK, PG 식별자, 결제수단, 금액, 상태, 결제·취소 시각

**로직**

- [ ] `reservation.util.ts` — 가용성 판정 순수함수(구간 겹침 · 브레이크타임 · 객실상태). 순수함수이므로 단위 테스트로 경계 케이스를 집중 검증
- [ ] `PaymentGateway` 인터페이스 + mock 어댑터 (`src/modules/payment-gateway/`)

**API — USER**

- [ ] 가용 객실 조회 (업체 · 시각 · 상품 기준)
- [ ] 예약 생성 (결제 포함, `@Transactional()`)
- [ ] 예약 취소 (환불 포함)
- [ ] 내 예약 목록 조회
- [ ] 내 예약 상세 조회

**API — MANAGER**

- [ ] 업체 예약 현황 조회

---

## 5단계 · discovery ⬜

이용자의 진입 동선.

**API — USER**

- [ ] 주변 업체 목록 조회 (위경도 + 반경, `haversineKm` 활용)
- [ ] 업체 상세 조회
- [ ] 업체의 객실 목록 조회 (상품 · 예약가능 여부 포함)

---

## 6단계 · extension ⬜

체크인 이후의 동선.

**API — USER**

- [ ] 체크인 (도어락 개방 연동)
- [ ] 체크아웃 (객실 상태를 `CLEANING` 으로 전이)
- [ ] 이용시간 연장 (추가 결제 + 다음 예약과의 충돌 검사)
- [ ] 점유 중인 객실의 사물 제어 (현재 시각이 내 예약 구간 안인지 검증)

**스케줄러**

- [ ] 이용 종료 시각 경과 예약 자동 `COMPLETED` 전이 + 객실 `CLEANING` 전이

---

## 후순위 ⬜

착수 전 별도 기획이 필요한 항목.

- [ ] 푸시 알림 (`t_user.device_token` 이미 보유)
- [ ] 토스 테스트결제 실연동 (`PaymentGateway` 어댑터 추가)
- [ ] 업체 정산 (수수료 · 정산 주기 · 지급 내역)
- [ ] 리뷰 · 평점
- [ ] 특정 날짜 임시휴무 · 특별영업 (현재는 요일 반복만)

---

## 갱신 규칙

- 단계 착수 시 진척 요약의 뱃지를 🟡 로 바꾼다.
- 기능 하나가 `ship` 될 때마다 해당 체크박스를 `[x]` 로 바꾸고, 필요하면 Beaver 산출물 경로를 뒤에 적는다.
- 단계의 체크박스가 모두 채워지면 뱃지를 ✅ 로 바꾼다.
- 설계가 바뀌면 해당 단계의 엔티티·API 목록을 먼저 고치고 나서 구현한다. 이 문서가 기획의 기준점이다.
