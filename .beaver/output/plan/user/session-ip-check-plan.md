# Plan — session-ip-check (refresh 시 세션 ip 체크)

## Feature Summary
- **Feature**: 토큰 refresh 시 세션 저장 ip 와 요청 ip 비교 — 불일치 401 거부 (가입/로그인 ip 저장은 기존 구현 확인, 무변경)
- **Entry point**: `POST /api/v1/user/token-refresh` (기존 API 동작 확장)
- **Domain**: user

---

## File List

| File | Action |
|------|------|
| `src/api/v1/user/interfaces/user.repository.interface.ts` | modified — `findSession` 시그니처 추가 |
| `src/api/v1/user/repositories/user.repository.ts` | modified — `findSession` 메서드 추가 (findSessionRefresh sibling) |
| `src/api/v1/user/user.service.ts` | modified — `tokenRefresh(dto, ip)` 서명 변경 + ip 체크 삽입 |
| `src/api/v1/user/user.controller.ts` | modified — tokenRefresh 핸들러에 `@Ip() ip` 추가 |
| `src/api/v1/user/test/user-token-refresh.spec.ts` | modified — findSession mock 추가·ip 케이스 신설·기존 케이스 보강 |
| 그 외 (sign/login 4종·entity·스키마) | 변경 없음 — ip 저장 기존 구현 |

---

## Design

### Data Access (Repository)

```typescript
// src/api/v1/user/interfaces/user.repository.interface.ts — 추가
    findSession(where: FindOptionsWhere<SessionEntity>): Promise<SessionEntity | null>;
```

```typescript
// src/api/v1/user/repositories/user.repository.ts — findSessionRefresh 앞에 추가 (sibling 동일 계약)
    /**
     * 세션 단건 조회
     */
    async findSession(where: FindOptionsWhere<SessionEntity>): Promise<SessionEntity | null> {
        try {
            return await this.sessionRepository.findOne({where, loadRelationIds: true});
        } catch (error) {
            throw new InternalServerErrorException({message: '서버에서 오류가 발생했습니다. 관리자에게 문의해주세요.'});
        }
    }
```

### Business Logic (Service)

```typescript
// src/api/v1/user/user.service.ts — tokenRefresh 변경부
    /**
     * 로그인 토큰 재발급
     * - jwtService.verify 로 서명+만료+payload type 검증 (실패 → 401)
     * - sha256 hash 로 t_session_refresh 조회 (미존재 or end_at < now → 401)
     * - [신규] 세션 조회 + ip 체크 — 세션 미존재 또는 저장 ip 와 요청 ip 불일치 → 401 (거부만, 만료 없음)
     *          저장 ip 또는 요청 ip 가 없으면 비교 생략 (하위호환)
     * - 회원 state 재검증 (ACTIVE 외 모두 401, 안전망으로 end_at 단축)
     * - old refresh end_at = now + 1m 단축 (grace)
     * - 새 access/refresh 발급, before_refresh_hash = old hash 로 t_session_refresh insert
     */
    @Transactional()
    async tokenRefresh(dto: UserTokenRefreshDto, ip: string): Promise<UserTokenRefreshResultDto> {
        // ... 1. JWT 검증 / 2. DB 조회 (refresh_hash) / end_at 만료 확인 — 기존 그대로 ...

        // 2-5. [신규] 세션 ip 체크 — 로그인 시점 저장 ip 와 불일치 시 거부
        const session = await this.userRepository.findSession({session_id: payload.session_id});
        if (!session) {
            throw new UnauthorizedException({message: '유효하지 않은 토큰입니다.'});
        }
        if (session.ip && ip && session.ip !== ip) {
            throw new UnauthorizedException({message: '유효하지 않은 토큰입니다.'});
        }

        // ... 3. 회원 state 재검증 이하 기존 그대로 ...
    }
```

### Entry Point (Controller)

```typescript
// src/api/v1/user/user.controller.ts — tokenRefresh 변경부 (Swagger 데코레이터 불변 — 401 이미 문서화)
    async tokenRefresh(@Body() dto: UserTokenRefreshDto, @Ip() ip: string): Promise<UserTokenRefreshResultDto> {
        return this.userService.tokenRefresh(dto, ip);
    }
```

### 테스트 (user-token-refresh.spec.ts 보강)

```typescript
// 변경부 요약
// 1) repository mock 에 findSession: jest.fn() 추가.
// 2) 요청 ip 캡처 미들웨어 — app.init() 전에 삽입 (일치 케이스를 결정적으로 만들기 위함):
//        let capturedIp: string;
//        app.use((req: any, _res: any, next: any) => { capturedIp = req.ip; next(); });
// 3) 세션 빌더:
//        const buildSession = (sessionIp: string | null): SessionEntity => {
//            const s = new SessionEntity();
//            s.session_id = PAYLOAD.session_id;
//            s.ip = sessionIp;
//            return s;
//        };
//
// 기존 케이스 보강:
// - [SUCCESS] 정상 재발급: findSession.mockResolvedValueOnce(buildSession(null)) — 저장 ip 없음 → 체크 생략.
//   추가 단언: findSession 1회 + 인자 {session_id: PAYLOAD.session_id}.
// - findUser null / BLOCK 안전망·updateSessionRefresh 이후 케이스: findSession(buildSession(null)) 선행 mock + 호출 1회 단언.
// - verify throw / type≠refresh / findSessionRefresh null / end_at 만료 케이스: findSession `.not.toHaveBeenCalled()` 단언 추가(순서 검증).
//
// 신규 케이스:
// - [SUCCESS] 저장 ip 와 요청 ip 일치 → 200 정상 재발급:
//   findSession.mockImplementationOnce(async () => buildSession(capturedIp));  // 미들웨어가 캡처한 실제 요청 ip
//   → 200 + insertSessionRefresh 1회 단언 (체크 통과 검증).
// - [FAIL:service] 저장 ip 불일치('10.99.99.99') → 401 '유효하지 않은 토큰입니다.',
//   findSession 1회, findUser/updateSessionRefresh/insertSessionRefresh 전부 미호출 (거부만 — 만료 단축 없음 검증 포함).
// - [FAIL:service] 세션 미존재(findSession null) → 401 동일 메시지, 후속 미호출.
// - [FAIL:repository] findSession reject 통일 500 → 후속 미호출.
```

---

## Test Cases

```
[SUCCESS]            기존 정상 재발급(저장 ip null → 체크 생략) / 저장 ip = 요청 ip 일치 → 200 (캡처 미들웨어로 결정적 검증)
[FAIL:service]       ip 불일치 → 401 + findUser·update·insert 전부 미호출 + end_at 단축 없음 / 세션 미존재 → 401 / 기존 5분기 유지
[FAIL:repository]    findSession 통일 500 → 후속 미호출 / 기존 4케이스 유지
[검증 게이트]         기존 흐름 순서 유지 — verify·findSessionRefresh 실패 시 findSession 미호출 단언
[SMOKE:data-access]  해당 없음 — findSession where 는 PK 단일 조건(매핑 민감 구성 아님, docs/testing.md 정의)
```

---

## Response Codes

| Code | Cause |
|------|------|
| 200 | 재발급 성공 (ip 체크 통과 또는 비교 기준 부재로 생략) |
| 400 | refresh_token 미입력 (기존) |
| 401 | 기존 4분기 + **[신규] 세션 미존재 / ip 불일치** — 모두 "유효하지 않은 토큰입니다." |
| 500 | repository 통일 오류 (findSession 포함) |
