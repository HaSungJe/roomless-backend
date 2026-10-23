---
# One-line feature summary
feature_goal: "캐시 전략(초안) — Redis 공유 캐시로 무엇을 · 어디서 · 어떻게 캐시하고, 원본이 바뀔 때 어떻게 무효화하는가 (로드맵 Phase 23 기획의 출발점)"

# Domain/module name
domain: "platform"

# Entry-point method/endpoint
api_method: "CACHE_STORE 포트(get · set(TTL) · delete) — 진입점(API) 없음"

# Path/signature
api_path: "libs/integration/src/cache/ · 게이트웨이 그룹 전략 fetchLoginUser(apps/gateway/src/guards/passport.jwt.auth/passport.jwt.auth.util.ts:37) · 무효화 지점(service · crontab)"

# Affected state
affected_data: ["Redis 키 auth-user:<login_scope>:<user_id> (로그인 회원 확인 결과)", "Redis 키 discovery:v<n>:… (측정 후)"]
---

> **상태: 초안 — 아직 build 대상이 아니다.** 로드맵 Phase 23(#95 ~ #97)을 기획할 때 아래 Decisions 를 사용자와 정하고 plan 을 만든다. 무효화 원칙은 `.beaver/memory/cache.md`(사용자 결정 2026-10-24)를 따른다.

## Feature Description

캐시는 Redis(공유 캐시) 하나로 한다(결정 2026-10-24). 인스턴스가 여러 대라 인스턴스 메모리 캐시는 두지 않는다(AGENTS.md — 인스턴스 로컬 상태 금지).

- **왜** — 로그인이 필요한 요청은 매번 게이트웨이 → 서비스 내부 HTTP(`auth-user`) → DB 조회를 거친다(passport.jwt.auth.util.ts:37 `fetchLoginUser`). 요청 수만큼 HTTP 왕복과 쿼리가 늘어난다.
- **무엇을** — ① 로그인 회원 확인 결과(#96) ② 측정 후 필요하면 discovery 조회(#97).
- **캐시하지 않는 것**
  - 룩업 테이블: 행이 적고, ID 는 코드 상수, 이름은 같은 쿼리의 PK 조인이라 이득이 없다.
  - 쓰기 결과 · 큐 명령.
  - refresh 토큰 검증 · 세션: 재발급은 드물고, 정확해야 한다.
  - 실패 결과(401 · 404).

## Entry Point

- Method: `CACHE_STORE` 포트 — 외부 연동 포트 패턴(`SMS_SENDER` · `STORAGE_GATEWAY`, libs/integration)과 같은 Symbol 토큰 + 실제 Redis 어댑터 + 전역 `CacheModule` + `docs/guides/redis-setup.md` + `compose.redis.yml` 묶음 · `.env` 접속정보. mock 어댑터는 두지 않는다. 접속정보가 비어 있으면 캐시 없이 동작한다.
- Path:
  ```ts
  // libs/integration/src/interfaces/integration.interface.ts (안 — 이름 · 모양은 Phase 23 에서 확정)
  export interface CacheStore {
      /** 값 조회 — 없거나 Redis 장애면 null (호출부는 원본으로 넘어간다) */
      get<T>(key: string): Promise<T | null>;
      /** 값 저장 — 항상 TTL(초)을 준다 */
      set<T>(key: string, value: T, ttl_seconds: number): Promise<void>;
      /** 키 삭제 — 실패해도 throw 하지 않고 로그만(쓰기는 이미 커밋됨, TTL 이 상한) */
      delete(key: string): Promise<void>;
  }
  ```
- Request: 키는 한 곳에서 만든다 — 채우는 쪽(게이트웨이)과 지우는 쪽(서비스 · scheduler)이 같은 함수를 쓴다(예: `authUserCacheKey(login_scope, user_id)` → `auth-user:<login_scope>:<user_id>`). 위치는 앱들이 함께 쓰는 lib.
- Response: 캐시는 성능 최적화일 뿐이다 — Redis 가 없거나 느려도 기능 결과는 같아야 한다(조회 타임아웃을 짧게 두고 원본으로 넘어간다).

## 어떻게 캐시하나

### 기본 패턴 — cache-aside

```
읽기: 캐시 get → 있으면 그대로 → 없으면 원본(내부 HTTP · DB) → 성공 결과만 set(TTL)
쓰기: 원본을 바꾸고 커밋 → 그 대상의 키 delete (새 값을 써 넣지 않는다)
```

### 대상 1 — 로그인 회원 확인 (#96)

| 항목 | 기본안 | 근거 |
|---|---|---|
| 위치 | **게이트웨이 그룹 전략**(`fetchLoginUser` 앞) | 내부 HTTP 왕복과 DB 조회를 둘 다 없앤다. 서비스 쪽(auth-user 핸들러 앞)에 두면 DB 만 줄고 HTTP 는 남는다 |
| 키 | `auth-user:<login_scope>:<user_id>` | 그룹마다 응답 DTO 가 다르다(User · Manager · AdminAuthUserResultDto) |
| 값 | 그 그룹 auth-user 응답 그대로(JSON) | 게이트웨이가 `request.user` 로 쓰는 값과 같아야 한다 |
| TTL | 30 ~ 60초 (access 토큰 20분보다 훨씬 짧게) | 무효화가 빠지거나 실패해도 정지 · 탈퇴가 늦게 반영되는 시간의 상한이다 |
| 실패 | 401(없는 회원 · 로그인 불가)은 캐시하지 않는다 | 정지 해제 · 복구가 바로 보이게 한다 |
| Redis 장애 | get 타임아웃(예: 50ms) 뒤 원본 조회 | 캐시 때문에 로그인이 막히면 안 된다 |

### 대상 2 — discovery (#97, `t_api_log.duration_ms` 로 측정 후)

- 목록 · 지도 범위 결과는 업체 하나가 바뀌어도 여러 키에 걸친다. 키를 하나씩 지우기 어렵다.
- 그래서 **네임스페이스 버전**을 쓴다. 키에 `discovery:v<n>:` 를 붙이고, 업체 · 객실 · 영업 설정이 바뀌면 `n` 을 올린다(INCR). 옛 키는 TTL 로 사라진다.
- 지도 범위 키는 좌표를 격자로 반올림해 같은 화면 근처끼리 키를 나눠 쓴다.
- 업체 상세 하나는 `discovery:store:<store_id>` 로 두고 그 업체가 바뀌면 지운다.

## 다시 생각한 문제 — 무효화

| # | 문제 | 왜 생기나 | 선택지 | 기본안 |
|---|---|---|---|---|
| 1 | 삭제냐 갱신이냐 | 새 값을 써 넣으면 동시 쓰기 두 개의 캐시 반영 순서가 DB 커밋 순서와 달라질 수 있다 | 삭제(cache-aside) / 갱신(write-through) | **삭제** |
| 2 | 삭제와 커밋의 순서 | `@Transactional()` 이 service 메서드를 감싸서 service 안에서는 커밋 시점을 모른다. 트랜잭션 안에서 지우면 커밋 전에 다른 요청이 옛 값을 다시 채울 수 있다 | ① 커밋 뒤 실행 훅에서 삭제 ② 커밋 뒤 이벤트(`roomless.event`) → 무효화 소비자가 삭제 ③ 트랜잭션 안 삭제 + 짧은 TTL 로 감수 | **①**. `@nestjs-cls/transactional` 의 커밋 뒤 실행 수단을 Phase 23 기획 때 먼저 확인한다. 없으면 ③ + 이중 삭제(#3) |
| 3 | 읽기-채우기 경쟁 | 요청 A 가 옛 값을 읽는다 → 쓰기가 커밋 · 삭제한다 → A 가 옛 값을 채운다. 삭제만으로는 막지 못한다 | 지연 재삭제(이중 삭제) / 값에 버전(`updated_at`)을 담아 비교 / 짧은 TTL | **짧은 TTL 을 상한으로 두고 정지 · 탈퇴처럼 중요한 쓰기는 짧게 지연 재삭제** |
| 4 | 삭제 실패(Redis 장애) | 쓰기는 이미 커밋됐다 | 쓰기를 실패로 / 로그만 | **로그만** — 쓰기를 되돌릴 수 없고 TTL 이 상한이다 |
| 5 | 무효화 지점 누락 | 회원을 바꾸는 쓰기가 여러 앱 · 여러 메서드에 흩어져 있다(가장 흔한 버그) | service 마다 삭제 / repository 의 해당 쓰기 메서드 옆에서 삭제 | **무효화 지점 표를 만들고 spec 으로 고정한다.** 호출 계층(service · repository)은 Decisions |
| 6 | 앱 경계 | t_user 를 user-service · admin-service · scheduler 가 바꾼다 | — | 세 앱 모두 같은 `CACHE_STORE` 포트 · 같은 키 함수로 지운다(scheduler 는 crontab → 포트 직접) |
| 7 | 룩업 값이 바뀔 때 | `t_state.is_login_allowed` 같은 룩업은 auth-user 결과에 들어가지만 배포(시드) 때만 바뀐다 | 전체 키 삭제 / 네임스페이스 버전 | 시드가 룩업을 바꾸는 배포 때 `auth-user` 네임스페이스 버전을 올린다(드물다) |
| 8 | 대안 — 캐시 없이 | access 토큰 수명을 줄이고(20분 → 5분) 요청마다의 확인을 없애면 무효화 문제 자체가 없다 | — | 비교만 기록. 정지가 최대 토큰 수명만큼 늦게 반영된다. Phase 23 기획 때 함께 놓고 고른다 |

### 무효화 지점 표 — 로그인 회원 확인(auth-user 결과에 들어가는 값을 바꾸는 쓰기)

auth-user 결과 필드: 공통 `user_id` · `login_id` · `name` · `auth_id` · `state_id` · `is_login_allowed`, 매니저 · 이용자 `store_id`, 이용자 `gender` · `birth` · `nickname` · `is_phone_verified`.

| 쓰기 | 앱 | 바뀌는 필드 | 지금 |
|---|---|---|---|
| 휴대폰 인증 완료 | user-service | `is_phone_verified` | 있음 |
| 탈퇴 신청 · 탈퇴 철회 | user-service | `state_id` | 있음 |
| 탈퇴 완료(자동처리) | scheduler | `state_id` · 개인정보 | 있음 |
| 회원 정보 수정(이름 · 닉네임 등) | user-service | `name` · `nickname` … | 미래 |
| 정지 · 정지 해제 | admin-service (Phase 20) | `state_id` · `is_login_allowed` | 미래 |
| 권한 변경 · 업체 배정 · 배정 해제 | admin-service (Phase 10) | `auth_id` · `store_id` | 미래 |
| 매니저 계정 수정 · 삭제 | admin-service (Phase 10) | 여러 필드 | 미래 |
| 룩업(`t_state`) 변경 | 배포(시드) | `is_login_allowed` | 드묾 — #7 |
| 비밀번호 변경 · 초기화 · 로그아웃 | user-service · admin-service | auth-user 결과에 없음 | 삭제 불필요(세션 무효화 정책이 생기면 다시 본다) |

새 쓰기를 만들 때 이 표에 해당하면 그 쓰기에 키 삭제를 같이 넣는다(.beaver/memory/cache.md).

## Business Rules

- 캐시는 결과를 바꾸지 않는다 — 캐시가 있든 없든 응답 · 판정이 같아야 한다(TTL 동안의 지연만 허용).
- 모든 키에 TTL 을 준다(무기한 키 없음). Redis 는 `maxmemory-policy allkeys-lru` 로 둔다.
- 키 이름은 `<대상>:<…>` 소문자 kebab, 만드는 함수는 한 곳.
- 테스트
  - 무효화 지점마다 service spec 에서 `CACHE_STORE` mock 의 `delete` 호출 횟수 · 키를 단언하고, 실패(롤백) 경로에서는 `.not.toHaveBeenCalled()` 를 단언한다.
  - 게이트웨이 캐시 조회는 캐시 적중 · 미스 · Redis 오류 폴백을 단언한다. 게이트웨이 spec 은 지금 두지 않는 정책이라 Phase 23 에서 정한다.

## Notes

- 근거
  - 요청마다의 확인: passport.jwt.auth.util.ts:37 `fetchLoginUser`, 그룹 전략 3개(passport.jwt.{auth,manager,admin}.strategy.ts:32)
  - access 토큰 20분: libs/account/src/utils/token.ts:20
  - auth-user DTO: libs/contracts/src/{user,manager,admin}/dto/*-auth-user.dto.ts
  - 인스턴스 로컬 상태 금지: AGENTS.md(Key Patterns — Docker 실행)
- 로드맵: Phase 23 — #95 포트 · 어댑터, #96 로그인 회원 확인 캐시, #97 discovery 캐시. Cross-Cutting "캐시", Open Decisions "캐시 저장소 = Redis".

## Decisions

Phase 23 기획에서 정한다(지금은 열린 상태 — 이 spec 으로 plan 을 만들기 전에 모두 답해야 한다).

- [ ] 로그인 회원 확인 캐시 위치 — 게이트웨이 전략(권장) / 서비스 auth-user 핸들러
- [ ] TTL — 30초 / 60초 / 그 밖
- [ ] 커밋 뒤 삭제 방법 — 커밋 뒤 실행 훅 / 이벤트 소비자 / 트랜잭션 안 삭제 + 이중 삭제
- [ ] 삭제 호출 계층 — service / repository 쓰기 메서드
- [ ] 캐시 대신 access 토큰 수명 단축으로 갈지(#8)
- [ ] Redis 클라이언트 라이브러리 · 운영 대상(같은 서버 컨테이너 · 관리형)
- [ ] discovery 캐시 대상 · 격자 크기(측정 후)
