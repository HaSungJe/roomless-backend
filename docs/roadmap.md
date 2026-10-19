# 개발 로드맵

무인 객실 대여 백엔드의 전체 개발 순서와 진척도를 관리하는 **살아있는 문서**.
단계를 완료할 때마다(`ship` 시점) 상태 뱃지와 체크박스를 갱신한다.

> **2026-10-14 재시작** — NestJS 11 단일 서버(TypeORM · MySQL)에서 NestJS 12 모노레포 MSA(게이트웨이 + 서비스, TypeORM 1.x · PostgreSQL, RabbitMQ)로 전환했다. 기존 구현은 `.back/` 에 보관돼 있고, 단계별로 새 구조에 **이식**한다. 이식 전 기능은 `.back` 표시를 단다.

| 뱃지 | 의미 |
|---|---|
| ⬜ | 예정 |
| 🟡 | 진행중 |
| ✅ | 완료 |

---

## 진척 요약

| 단계 | 내용 | 담당 앱 | 상태 | 의존 |
|---|---|---|---|---|
| M | MSA 기반(게이트웨이 · user-service · 메시징 · PostgreSQL · Docker) | gateway · user-service | ✅ | — |
| 0 | 기반(auth · user · store 등록) | user-service · admin-service | 🟡 | M |
| 1 | store 확장 | admin-service | ⬜ | 0 |
| 2 | room | admin-service | ⬜ | 1 |
| 3 | device | admin-service · user-service | ⬜ | 2 |
| 4 | reservation + payment | user-service | ⬜ | 1, 2 |
| 5 | discovery | user-service | ⬜ | 1, 2 |
| 6 | extension | user-service | ⬜ | 3, 4 |
| — | 후순위(알림 서버 · 토스 실연동 · 정산 · 리뷰) | notify-service 외 | ⬜ | — |

---

## 역할 정의

| 역할 (`t_auth`) | 하는 일 |
|---|---|
| `SUPER_ADMIN` / `ADMIN` | 업체 등록·수정·삭제, 매니저 계정의 업체 배정 |
| `HEAD_MANAGER` / `MANAGER` | 자기 업체 1곳의 운영시간·브레이크타임 설정, 객실 및 객실 사물 관리, 객실 상태 전이(청소 → 스탠바이), 예약 현황 확인 |
| `USER` | 주변 업체 조회, 결제 후 객실 예약, 점유 중인 객실의 사물 제어, 추가 결제로 이용시간 연장 |

---

## 횡단 결정사항

로드맵 전체에 걸리는 확정 사항. 각 단계 기획에서 재논의하지 않는다.

| 항목 | 결정 |
|---|---|
| **서버 분할** | 게이트웨이(유일한 진입점) + 서비스. 서비스 경계는 **데이터 소유권** 기준 — user-service(회원 · 예약 · 결제 · 이용), admin-service(업체 · 객실 · 요금상품 · 사물 등록), notify-service(알림, 후순위). 총관리자는 별도 서버가 아니라 권한(`@Roles`)으로 가른다 |
| **전달 경로** | 즉시 응답 · 조회는 게이트웨이 → 서비스 내부 HTTP. 상태를 바꾸는 쓰기 · 몰리는 작업(가입 · 탈퇴 · 예약 · 사물 제어 · 업체 승인)은 RabbitMQ 명령 + 요청 단위 SSE. 상세 [messaging.md](messaging.md) |
| **DB** | PostgreSQL 1개 공유(공유 DB 단계). 엔티티는 `libs/database/src/entities/<domain>/` 1엔티티 1파일. 서비스별 DB 분리는 경계가 안정된 뒤 |
| **매니저 소속** | 매니저 1명 = 업체 1곳. `t_user.store_id` nullable FK 로 표현하고, 매니저 API 인가는 "요청 대상이 내 `store_id` 와 일치하는가" 로 판정 |
| **이용상품 단위** | 객실별 개별 설정(`t_room_plan`). 업체가 객실마다 이름·규격과 `n분 + 가격` 상품을 정의 |
| **이용 단위** | 항상 시간 기반. 숙박은 별도 개념 없이 긴 `duration_minute` 상품으로 표현 |
| **사전 예약** | 지원. 미래 시각 지정 예약을 받는다 |
| **재고 판정** | ① 기존 예약과 `start_at ~ end_at` 구간 겹침 없음 **AND** ② 업체 운영시간 내이며 브레이크타임과 겹치지 않음 **AND** ③ 객실 상태가 `DISABLED` 가 아님. 즉시 입실(`start_at` 이 현재 시각)만 객실 상태 `STANDBY` 를 추가로 요구한다. 동시 예약 경합은 (room_id, 시간 슬롯) 제약으로 막는다 |
| **영업시간 단위** | 요일 반복만 지원(`t_store_hour` · `t_store_break`). 특정 날짜 임시휴무·특별영업은 후순위 |
| **룩업 기본 데이터** | 룩업 모델의 기본 데이터는 [seeder.targets.ts](../libs/database/src/seeder/seeder.targets.ts) 한 곳에만 정의한다. 모델은 구조 컬럼만 |
| **페이지네이션** | 모든 목록 조회 API 는 처음부터 `PaginationDto` 를 적용한다 |
| **사물 제어** | RabbitMQ 명령으로 처리(MQTT · Redis pub/sub 미사용). 기기 연동은 `DeviceGateway` 포트로 추상화하고 명령 · 상태를 DB 이력으로 적재. 하드웨어는 이번 범위에서 제외 |
| **결제** | `PaymentGateway` 포트로 추상화. 1차는 mock 어댑터, 토스 테스트결제는 후순위 |
| **규약** | [CLAUDE.md](../CLAUDE.md) 전면 준수 — snake_case 전 레이어, 기능당 DTO 1개, repository try/catch + 통일 500, public 메서드 1개 = API 1개 |

---

## M단계 · MSA 기반 ✅

- [x] NestJS 12 ESM 모노레포(`apps/gateway` · `apps/user-service` · `libs/common|contracts|database|messaging`)
- [x] TypeORM 1.x + PostgreSQL · 도메인별 엔티티 파일 · 초기 마이그레이션(PK/UK/FK 이름 + COMMENT) · 오프라인 마이그레이션 생성 · 검사(`db:generate` · `db:check`)
- [x] nestjs-cls `@Transactional()` · 룩업 seeder(`createMany skipDuplicates`)
- [x] RabbitMQ 토폴로지(cmd · event · dlx · quorum 명령 큐 · 인스턴스별 결과 큐) · 자동 재연결
- [x] 게이트웨이 전달 계층(내부 HTTP · 요청 단위 SSE) · JWT/권한 가드 · Swagger
- [x] 전송 중립 실패 본문(`ApiFailResultDto` · `toFailResult`)
- [x] docker-compose(PostgreSQL 17 · RabbitMQ 4) · `.env.example`
- [x] Docker 4묶음 분리(postgres · rabbitmq · user-service · gateway) + gateway · user-service 로드밸런싱(nginx) · crontab 단일 실행 잠금(JobLockService)
- [x] Vitest 테스트 체계(큐 경로 · 동기 경로 · FakeBroker)

---

## 0단계 · 기반 🟡

- [x] 권한/상태/SNS 룩업 시드 (`SUPER_ADMIN` · `ADMIN` · `HEAD_MANAGER` · `MANAGER` · `USER`) — SNS 는 가입 DTO 허용값 전부
- [x] JWT 인증(게이트웨이 `PassportJwtAuthGuard`, 회원 상태는 user-service 조회) + 역할 가드(`RolesGuard` · `@Roles`)
- [x] 회원 가입(SNS · 일반) · 탈퇴 · 탈퇴 철회 · 비밀번호 변경 — 큐 경로
- [x] 로그인(SNS · 일반) · 토큰 갱신 — 동기 경로
- [x] 탈퇴 자동처리 crontab(`user/crontabs/user-leave-cleanup.crontab.ts`)
- [ ] admin-service 앱 생성
- [ ] 가맹점 등록 API (`POST /api/v1/store/register`, ADMIN 전용) — `.back` 에 구현([store-register-report.md](../.beaver/output/report/store/store-register-report.md)), 이식 필요
- [ ] 가맹점 인력(총괄매니저 · 매니저) 등록 · 목록 · 삭제 — `.back` 에 구현([store-staff-report.md](../.beaver/output/report/store/store-staff-report.md)), 이식 필요
- [ ] api-log — 게이트웨이로 이식(요청 로그 · PostgreSQL 파티셔닝 마이그레이션)
- [ ] 공통 Pagination(`PaginationDto` · `Pagination`) 을 `libs/common` 으로 이식

---

## 1단계 · store 확장 ⬜

업체를 "예약 가능한 대상"으로 만드는 단계. 위치·영업시간·매니저를 채운다. (admin-service)

**엔티티** — `libs/database/src/entities/store/` 에 둔다

- [ ] `t_store` 에 `latitude` · `longitude` 컬럼 추가 (주변 검색용)
- [ ] `t_store_hour` — 요일별 영업 시작·종료 시각
- [ ] `t_store_break` — 요일별 브레이크타임 구간

**API — ADMIN**

- [ ] 업체 목록 조회 (검색 + 페이지네이션) — `.back` 에 구현([store-crud-report.md](../.beaver/output/report/store/store-crud-report.md)), 이식 필요
- [ ] 업체 상세 조회 — `.back`, 이식 필요
- [ ] 업체 수정 (사업자등록번호는 수정 대상 제외) — `.back`, 이식 필요
- [ ] 업체 삭제(soft delete + `business_number` 마스킹 + `delete_backup` 스냅샷) — `.back`, 이식 필요
- [ ] 업체 승인 · 반려 (큐 경로 — 알림 팬아웃 대상)
- [ ] 매니저 업체 배정 · 배정 해제

**API — MANAGER**

- [ ] 내 업체 상세 조회
- [ ] 영업시간 설정
- [ ] 브레이크타임 설정

---

## 2단계 · room ⬜

객실과 요금 상품, 그리고 청소 → 스탠바이 상태 전이. (admin-service)

**엔티티** — `libs/database/src/entities/room/`

- [ ] `t_room_state` 룩업 + 시드 — `STANDBY`(예약가능) · `OCCUPIED`(이용중) · `CLEANING`(청소중) · `DISABLED`(사용중지)
- [ ] `t_room` — `store_id` FK, 호실명, 규격, 수용인원, 설명, `room_state_id` FK
- [ ] `t_room_plan` — `room_id` FK, 상품명, `duration_minute`, `price`, 사용여부

**API — MANAGER**

- [ ] 객실 등록 · 수정 · 삭제 · 목록
- [ ] 객실 상태 변경 (이용중 → 청소중 → 스탠바이)
- [ ] 객실 상품 등록 · 수정 · 삭제 · 목록

---

## 3단계 · device ⬜

객실의 사물(전등 · 에어컨 · 도어락) 등록과 RabbitMQ 명령 제어.

**엔티티** — `libs/database/src/entities/device/`

- [ ] `t_device_type` 룩업 + 시드 — `LIGHT` · `AIRCON` · `DOORLOCK`
- [ ] `t_device` — `room_id` FK, `device_type_id` FK, 기기명, 기기 식별키, 최근 상태, 최근 상태 수신 시각
- [ ] `t_device_command` — 명령 이력(요청자 · 요청시각 · 명령 내용 · 결과)

**인프라**

- [ ] `DeviceGateway` 포트 + mock 어댑터 — 사물 제어 명령은 큐 경로(`device.*`)로 받고, 기기 응답을 결과로 회신

**API — MANAGER**

- [ ] 사물 등록 · 수정 · 삭제 · 목록
- [ ] 사물 제어 (큐 경로)
- [ ] 사물 상태 조회

---

## 4단계 · reservation + payment ⬜

핵심 단계. 가용성 판정과 결제가 여기서 만난다. (user-service)

**엔티티** — `libs/database/src/entities/reservation/`

- [ ] `t_reservation_state` 룩업 + 시드 — `PENDING` · `PAID` · `CHECKED_IN` · `COMPLETED` · `CANCELED`
- [ ] `t_reservation` — `user_id` FK, `room_id` FK, `room_plan_id` FK, `start_at`, `end_at`, `reservation_state_id` FK, 결제금액 + 시간 슬롯 겹침 방지 제약
- [ ] `t_payment` — `reservation_id` FK, PG 식별자, 결제수단, 금액, 상태, 결제·취소 시각

**로직**

- [ ] `reservation.util.ts` — 가용성 판정 순수함수(구간 겹침 · 브레이크타임 · 객실상태). 경계 케이스 단위 테스트 집중
- [ ] `PaymentGateway` 포트 + mock 어댑터

**API — USER**

- [ ] 가용 객실 조회 (업체 · 시각 · 상품 기준) — 동기
- [ ] 예약 생성 (결제 포함, `@Transactional()`) — 큐
- [ ] 예약 취소 (환불 포함) — 큐
- [ ] 내 예약 목록 · 상세 조회 — 동기

**API — MANAGER**

- [ ] 업체 예약 현황 조회

---

## 5단계 · discovery ⬜

이용자의 진입 동선. (user-service, 업체 · 객실 조회)

- [ ] 주변 업체 목록 조회 (위경도 + 반경, `haversineKm` — `.back/src/common/utils/geo.ts` 이식)
- [ ] 업체 상세 조회
- [ ] 업체의 객실 목록 조회 (상품 · 예약가능 여부 포함)

---

## 6단계 · extension ⬜

체크인 이후의 동선. (user-service)

**API — USER**

- [ ] 체크인 (도어락 개방 연동)
- [ ] 체크아웃 (객실 상태를 `CLEANING` 으로 전이)
- [ ] 이용시간 연장 (추가 결제 + 다음 예약과의 충돌 검사)
- [ ] 점유 중인 객실의 사물 제어 (현재 시각이 내 예약 구간 안인지 검증)

**crontab**

- [ ] 이용 종료 시각 경과 예약 자동 `COMPLETED` 전이 + 객실 `CLEANING` 전이

---

## 후순위 ⬜

착수 전 별도 기획이 필요한 항목.

- [ ] notify-service — `roomless.event` 도메인 이벤트 구독, 푸시 알림(`t_user.device_token` 보유)
- [ ] 토스 테스트결제 실연동 (`PaymentGateway` 어댑터 추가)
- [ ] 업체 정산 (수수료 · 정산 주기 · 지급 내역)
- [ ] 리뷰 · 평점
- [ ] 특정 날짜 임시휴무 · 특별영업 (현재는 요일 반복만)
- [ ] 서비스별 DB 분리 검토

---

## 갱신 규칙

- 단계 착수 시 진척 요약의 뱃지를 🟡 로 바꾼다.
- 기능 하나가 `ship` 될 때마다 해당 체크박스를 `[x]` 로 바꾸고, 필요하면 Beaver 산출물 경로를 뒤에 적는다. `.back` 에서 이식한 기능은 `.back` 표시를 지운다.
- 단계의 체크박스가 모두 채워지면 뱃지를 ✅ 로 바꾼다.
- 설계가 바뀌면 해당 단계의 모델 · API 목록을 먼저 고치고 나서 구현한다. 이 문서가 기획의 기준점이다.
