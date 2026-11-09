# Plan — user-manage

## Feature Summary
- **Feature**: 관리자 계정 관리(Phase 20) — 총관리자 · 관리자의 이용자 관리(목록 · 상세 · 예약 이력 · 이용 제한 · 해제)와 업체 관리자 관리(전체 업체의 업체 총관리자 · 업체 관리자 목록 · 상세 · 비밀번호 초기화). 이용 제한(BLOCK) 이용자는 로그인 · 재발급 · 기존 예약 이용은 되고 새 예약 · 연장만 막힌다
- **Entry point**:
  - 관리자 가드 동기 GET `/api/v1/admin-service/user` · `/user/:user_id` · `/user/:user_id/reservation` · `/api/v1/admin-service/manager/account` · `/manager/account/:user_id`
  - 관리자 가드 큐 PATCH `/api/v1/admin-service/user/:user_id/state`(`admin.user.state`) · `/api/v1/admin-service/manager/account/:user_id/password-reset`(`admin.manager.account-password-reset`)
  - 기존 변경: 이용자 로그인 · 토큰 재발급 · 인증 확인(auth-user) · 예약 생성 `user.reservation.create` · 연장 조회 · 신청 `user.reservation.extend`
- **Domain**: user(admin-service user 새 도메인 · user-service user · user-service reservation) · manager(admin-service manager) — 로드맵 Phase 20 #84 · #85. 스키마 변경 없음
- **Spec**: [user-manage-spec.md](../../spec/user/user-manage-spec.md)

### 구현 단위 (순서)
- A. contracts — 이용자 관리 DTO 4 · 명령 · 내부 경로, 업체 관리자 관리 DTO 3 · 명령 · 내부 경로, 이용자 로그인 결과 필드
- B. admin-service user 도메인(새) — 계산 util(TDD 먼저 — 상태 전환 판정 · 예약 건수 요약) → repository → service → controller 2 → module · 앱 등록
- C. admin-service manager — 업체 관리자 관리(repository 조인 쿼리 · service 3 · controller)
- D. user-service — 이용 제한 이용자 로그인 · 재발급 · 인증 확인, 예약 · 연장 막기(util `judgeReservationMember`)
- E. gateway — admin-service user 라우트 4(새 모듈) · manager 라우트 3
- F. 문서 — README · AGENTS(도메인 트리 · Auth · Smoke 목록) · docs(architecture · testing)

---

## File List

| File | Action |
|------|------|
| `libs/contracts/src/user/user.commands.ts` | modified — `USER_ADMIN_COMMAND` · `USER_ADMIN_INTERNAL_PATH` |
| `libs/contracts/src/user/dto/user-list.dto.ts` · `user-detail.dto.ts` · `user-reservation-list.dto.ts` · `user-state.dto.ts` | new — 이용자 목록 · 상세 · 예약 이력 · 이용 제한 |
| `libs/contracts/src/user/dto/user-login.dto.ts` | modified — 결과 `state_id` · `block_comment` |
| `libs/contracts/src/manager/manager.commands.ts` | modified — `MANAGER_COMMAND.ACCOUNT_PASSWORD_RESET` · `MANAGER_INTERNAL_PATH.ACCOUNT_LIST` · `account()` |
| `libs/contracts/src/manager/dto/manager-account-list.dto.ts` · `manager-account-detail.dto.ts` · `manager-account-password-reset.dto.ts` | new — 업체 관리자 목록 · 상세 · 비밀번호 초기화 |
| `apps/admin-service/src/user/user.module.ts` · `user.symbols.ts` · `user.constants.ts` · `user.util.ts` · `user.service.ts` | new — 이용자 관리 도메인 |
| `apps/admin-service/src/user/interfaces/user.repository.interface.ts` · `repositories/user.repository.ts` | new — t_user(이용자 그룹) · t_reservation 읽기 · 상태 쓰기 |
| `apps/admin-service/src/user/controllers/user.controller.ts` · `user.controller.queue.ts` | new — 내부 HTTP 3 · `@OnCommand(admin.user.state)` |
| `apps/admin-service/src/admin-service.module.ts` | modified — `UserModule` 등록 · 주석 |
| `apps/admin-service/src/manager/manager.constants.ts` · `manager.util.ts` · `manager.service.ts` | modified — 업체 관리자 관리 3 · 문구 상수(휴대폰 없음 · 탈퇴 업체) |
| `apps/admin-service/src/manager/interfaces/manager.repository.interface.ts` · `repositories/manager.repository.ts` | modified — `ManagerAccountFilter` · `ManagerAccountRow` · `countAccounts` · `findAccountRows` · `findAccountRow` · `buildAccountQuery` |
| `apps/admin-service/src/manager/controllers/manager.controller.ts` · `manager.controller.queue.ts` · `manager.module.ts` | modified — 라우트 3 · 주석 |
| `apps/user-service/src/user/user.constants.ts` · `user.service.ts` · `repositories/user.repository.ts` | modified — 이용자 로그인 · 재발급 · 인증 확인 상태 목록, BLOCK 403 삭제, 로그인 결과 필드 |
| `apps/user-service/src/reservation/reservation.constants.ts` · `reservation.util.ts` · `reservation.service.ts` | modified — `judgeReservationMember`, 예약 생성 · 연장 조회 · 신청에서 회원 상태 |
| `apps/user-service/src/reservation/interfaces/reservation.repository.interface.ts` · `repositories/reservation.repository.ts` | modified — `findReservationUser` |
| `apps/gateway/src/api/v1/admin-service/user/user.module.ts` · `controllers/user.controller.ts` · `controllers/user.controller.queue.ts` | new — 공개 라우트 4 |
| `apps/gateway/src/gateway.module.ts` | modified — `UserModule as AdminUserModule` · 주석 |
| `apps/gateway/src/api/v1/admin-service/manager/controllers/manager.controller.ts` · `manager.controller.queue.ts` · `manager.module.ts` | modified — 관리자 가드 라우트 3 · 주석 |
| 테스트 — admin-service `user/test/`(새 5 + 도우미) · manager `test/`(새 3 + repository · 도우미 · staff-password-reset 문구) · user-service user(login · token-refresh · repository) · reservation(create · extend · extension · repository · 도우미) | new · modified |
| `README.md` · `AGENTS.md` · `docs/architecture.md` · `docs/testing.md` | modified |

---

## Design

### A. contracts — Input/Validation (DTO) · 규격 상수

```ts
// libs/contracts/src/user/user.commands.ts — 추가(파일 끝)
/**
 * 이용자 관리 RabbitMQ 명령 (총관리자 · 관리자 → admin-service, q.admin.cmd 가 `admin.#` 로 받는다).
 * user-service 의 이용자 본인 명령(USER_COMMAND — `user.*`)과 같은 대상(이용자)이라 이 파일에 상수 이름으로 가른다.
 */
export const USER_ADMIN_COMMAND = {
    /** 이용자 이용 제한 · 해제 */
    STATE: 'admin.user.state',
} as const;

/** 이용자 관리 내부 HTTP 경로 (게이트웨이 → admin-service). 파라미터가 있는 경로는 함수로 만든다. */
export const USER_ADMIN_INTERNAL_PATH = {
    /** 이용자 목록 (GET) */
    LIST: '/internal/v1/admin-service/user',
    /** 이용자 상세 (GET) */
    detail: (user_id: string) => `/internal/v1/admin-service/user/${encodeURIComponent(user_id)}`,
    /** 이용자 예약 이력 (GET) */
    reservations: (user_id: string) => `/internal/v1/admin-service/user/${encodeURIComponent(user_id)}/reservation`,
} as const;
```

```ts
// libs/contracts/src/user/dto/user-list.dto.ts — 새 파일
import {ApiProperty} from '@nestjs/swagger';
import {IsIn, IsOptional, MaxLength} from 'class-validator';
import {PaginationDto, PaginationResultDto} from '@app/common/dto/pagination.dto.js';

/**
 * 이용자 목록 query (총관리자 · 관리자) — 검색어(이름 · 닉네임 · 휴대폰 번호 · 회원 식별 코드 부분 일치) · 상태 · SNS
 */
export class UserListDto extends PaginationDto {
    @ApiProperty({description: '검색어 — 이름 · 닉네임 · 휴대폰 번호 · 회원 식별 코드 부분 일치', required: false})
    @IsOptional()
    @MaxLength(100, {message: '검색어는 100자 이내로 입력해주세요.'})
    keyword: string | null;

    @ApiProperty({description: '상태 (ACTIVE: 정상, BLOCK: 이용 제한, LEAVE_WAIT: 탈퇴 대기, LEAVE: 탈퇴) — 없으면 전체', required: false})
    @IsOptional()
    @IsIn(['ACTIVE', 'BLOCK', 'LEAVE_WAIT', 'LEAVE'], {message: '상태가 올바르지 않습니다.'})
    state_id: string | null;

    @ApiProperty({description: '가입 SNS (GOOGLE · FACEBOOK · APPLE · KAKAO · LINE · NAVER) — 없으면 전체', required: false})
    @IsOptional()
    @IsIn(['GOOGLE', 'FACEBOOK', 'APPLE', 'KAKAO', 'LINE', 'NAVER'], {message: 'SNS 유형이 올바르지 않습니다.'})
    sns_id: string | null;

    /**
     * @param data 요청 쿼리 — 빠진 페이지 값은 PaginationDto 기본값, 빠진 필터는 null
     */
    constructor(data?: Partial<UserListDto>) {
        super(data);
        this.keyword = data?.keyword ?? null;
        this.state_id = data?.state_id ?? null;
        this.sns_id = data?.sns_id ?? null;
    }
}

/**
 * 이용자 목록 항목
 */
export class UserListItemResultDto {
    @ApiProperty({description: '회원 ID'})
    user_id: string;

    @ApiProperty({description: '회원 식별 코드'})
    user_search_code: string;

    @ApiProperty({description: '닉네임'})
    nickname: string;

    @ApiProperty({description: '이름'})
    name: string;

    @ApiProperty({description: '휴대폰 번호 (미인증 · 탈퇴 null)', nullable: true, type: String})
    phone: string | null;

    @ApiProperty({description: '가입 SNS (없으면 null)', nullable: true, type: String})
    sns_id: string | null;

    @ApiProperty({description: '상태 (ACTIVE · BLOCK · LEAVE_WAIT · LEAVE)'})
    state_id: string;

    @ApiProperty({description: '휴대폰 SMS 인증 여부(0: 미인증, 1: 인증)'})
    is_phone_verified: number;

    @ApiProperty({description: '가입일시 (ISO 8601)'})
    created_at: string;
}

/**
 * 이용자 목록
 */
export class UserListResultDto {
    @ApiProperty({description: '목록 (가입 최신순)', type: () => [UserListItemResultDto]})
    list: UserListItemResultDto[];

    @ApiProperty({description: '페이지 정보', type: () => PaginationResultDto})
    pagination: PaginationResultDto;
}
```

```ts
// libs/contracts/src/user/dto/user-detail.dto.ts — 새 파일
import {ApiProperty} from '@nestjs/swagger';
import {IsNotEmpty, Matches} from 'class-validator';

/**
 * 이용자 상세 path param
 */
export class UserDetailParamDto {
    @ApiProperty({description: '이용자 회원 ID'})
    @Matches(/^[a-f0-9]{32}$/, {message: '회원 ID가 올바르지 않습니다.'})
    @IsNotEmpty({message: '회원 ID를 입력해주세요.'})
    user_id: string;
}

/**
 * 이용자 예약 건수 요약 — 결제 대기 만료(EXPIRED)는 세지 않는다
 */
export class UserReservationSummaryResultDto {
    @ApiProperty({description: '전체 (결제 대기 만료 제외)'})
    total: number;

    @ApiProperty({description: '진행 중 (결제 대기 · 확정 · 이용 중)'})
    in_progress: number;

    @ApiProperty({description: '이용 완료'})
    completed: number;

    @ApiProperty({description: '취소'})
    canceled: number;
}

/**
 * 이용자 상세
 */
export class UserDetailResultDto {
    @ApiProperty({description: '회원 ID'})
    user_id: string;

    @ApiProperty({description: '회원 식별 코드'})
    user_search_code: string;

    @ApiProperty({description: '닉네임'})
    nickname: string;

    @ApiProperty({description: '이름'})
    name: string;

    @ApiProperty({description: '성별'})
    gender: string;

    @ApiProperty({description: '생년월일'})
    birth: string;

    @ApiProperty({description: '휴대폰 번호 (미인증 · 탈퇴 null)', nullable: true, type: String})
    phone: string | null;

    @ApiProperty({description: '휴대폰 SMS 인증일시 (ISO 8601, 미인증 null)', nullable: true, type: String})
    phone_verified_at: string | null;

    @ApiProperty({description: '가입 SNS (없으면 null)', nullable: true, type: String})
    sns_id: string | null;

    @ApiProperty({description: '상태 (ACTIVE · BLOCK · LEAVE_WAIT · LEAVE)'})
    state_id: string;

    @ApiProperty({description: '이용 제한 사유 (없으면 null)', nullable: true, type: String})
    block_comment: string | null;

    @ApiProperty({description: '탈퇴 예정 시각 (YYYY-MM-DD HH:mm:ss, 탈퇴 대기가 아니면 null)', nullable: true, type: String})
    leave_reserved_at: string | null;

    @ApiProperty({description: '가입일시 (ISO 8601)'})
    created_at: string;

    @ApiProperty({description: '예약 건수 요약', type: () => UserReservationSummaryResultDto})
    reservation_summary: UserReservationSummaryResultDto;
}
```

```ts
// libs/contracts/src/user/dto/user-reservation-list.dto.ts — 새 파일
import {ApiProperty} from '@nestjs/swagger';
import {IsNotEmpty, Matches} from 'class-validator';
import {PaginationDto, PaginationResultDto} from '@app/common/dto/pagination.dto.js';

/**
 * 이용자 예약 이력 path param
 */
export class UserReservationListParamDto {
    @ApiProperty({description: '이용자 회원 ID'})
    @Matches(/^[a-f0-9]{32}$/, {message: '회원 ID가 올바르지 않습니다.'})
    @IsNotEmpty({message: '회원 ID를 입력해주세요.'})
    user_id: string;
}

/**
 * 이용자 예약 이력 query — 페이지만
 */
export class UserReservationListDto extends PaginationDto {
    /**
     * @param data 요청 쿼리 — 빠진 페이지 값은 PaginationDto 기본값
     */
    constructor(data?: Partial<UserReservationListDto>) {
        super(data);
    }
}

/**
 * 이용자 예약 이력 항목
 */
export class UserReservationListItemResultDto {
    @ApiProperty({description: '예약 ID'})
    reservation_id: string;

    @ApiProperty({description: '업체 ID'})
    store_id: string;

    @ApiProperty({description: '상호명'})
    store_name: string;

    @ApiProperty({description: '호실명'})
    room_name: string;

    @ApiProperty({description: '객실 그룹명'})
    room_group_name: string;

    @ApiProperty({description: '상품 종류 (HOURLY · NIGHT · LONG)'})
    room_plan_type_id: string;

    @ApiProperty({description: '상품 종류 이름 (시간 이용 · 1박 · 연박)'})
    room_plan_type_name: string;

    @ApiProperty({description: '예약 상태 (PENDING · CONFIRMED · CHECKED_IN · COMPLETED · CANCELED)'})
    reservation_state_id: string;

    @ApiProperty({description: '예약 상태 이름'})
    reservation_state_name: string;

    @ApiProperty({description: '이용 시작 (ISO 8601)'})
    start_at: string;

    @ApiProperty({description: '이용 끝 (ISO 8601)'})
    end_at: string;

    @ApiProperty({description: '합계 금액(원)'})
    total_price: number;

    @ApiProperty({description: '취소 시각 (ISO 8601, 취소 아니면 null)', nullable: true, type: String})
    canceled_at: string | null;

    @ApiProperty({description: '취소 주체 (USER · STORE, 취소 아니면 null)', nullable: true, type: String})
    cancel_actor: string | null;

    @ApiProperty({description: '예약일시 (ISO 8601)'})
    created_at: string;
}

/**
 * 이용자 예약 이력
 */
export class UserReservationListResultDto {
    @ApiProperty({description: '목록 (이용 시작 최신순, 결제 대기 만료 제외)', type: () => [UserReservationListItemResultDto]})
    list: UserReservationListItemResultDto[];

    @ApiProperty({description: '페이지 정보', type: () => PaginationResultDto})
    pagination: PaginationResultDto;
}
```

```ts
// libs/contracts/src/user/dto/user-state.dto.ts — 새 파일
import {ApiProperty} from '@nestjs/swagger';
import {IsIn, IsNotEmpty, IsOptional, Matches, MaxLength} from 'class-validator';

/**
 * 이용자 이용 제한 · 해제 path param
 */
export class UserStateParamDto {
    @ApiProperty({description: '이용자 회원 ID'})
    @Matches(/^[a-f0-9]{32}$/, {message: '회원 ID가 올바르지 않습니다.'})
    @IsNotEmpty({message: '회원 ID를 입력해주세요.'})
    user_id: string;
}

/**
 * 이용자 이용 제한 · 해제 입력 — 이용 제한(BLOCK)은 로그인 · 기존 예약 이용은 되고 새 예약 · 연장만 막힌다, 해제(ACTIVE)
 */
export class UserStateDto {
    @ApiProperty({description: '바꿀 상태 (ACTIVE: 해제, BLOCK: 이용 제한)', enum: ['ACTIVE', 'BLOCK']})
    @IsIn(['ACTIVE', 'BLOCK'], {message: '상태가 올바르지 않습니다.'})
    @IsNotEmpty({message: '상태를 입력해주세요.'})
    state_id: string;

    @ApiProperty({description: '이용 제한 사유 (제한할 때만 남는다 — 이용자 로그인 결과에 보인다)', required: false})
    @IsOptional()
    @MaxLength(255, {message: '이용 제한 사유는 255자 이내로 입력해주세요.'})
    block_comment?: string;
}
```

```ts
// libs/contracts/src/user/dto/user-login.dto.ts — UserLoginResultDto 에 추가(is_phone_verified 뒤)
    @ApiProperty({description: '회원 상태 (ACTIVE: 정상, BLOCK: 이용 제한 — 로그인 · 기존 예약 이용은 되고 새 예약 · 연장만 막힌다)'})
    state_id: string;

    @ApiProperty({description: '이용 제한 사유 (없으면 null)', nullable: true, type: String})
    block_comment: string | null;
```

```ts
// libs/contracts/src/manager/manager.commands.ts — MANAGER_COMMAND 에 추가(STAFF_DELETE 뒤), 주석 첫 줄에 "· 업체 관리자 비밀번호 초기화(총관리자 · 관리자)" 추가
    /** 업체 관리자 비밀번호 초기화 (총관리자 · 관리자 — 전체 업체의 업체 총관리자 · 업체 관리자) → 임시 비밀번호 SMS */
    ACCOUNT_PASSWORD_RESET: 'admin.manager.account-password-reset',

// MANAGER_INTERNAL_PATH 에 추가(staff 뒤)
    /** 업체 관리자 목록 (GET, 총관리자 · 관리자 — 전체 업체) */
    ACCOUNT_LIST: '/internal/v1/admin-service/manager/account',
    /** 업체 관리자 상세 (GET, 총관리자 · 관리자) */
    account: (user_id: string) => `/internal/v1/admin-service/manager/account/${encodeURIComponent(user_id)}`,
```

```ts
// libs/contracts/src/manager/dto/manager-account-list.dto.ts — 새 파일
import {ApiProperty} from '@nestjs/swagger';
import {IsIn, IsOptional, Matches, MaxLength} from 'class-validator';
import {PaginationDto, PaginationResultDto} from '@app/common/dto/pagination.dto.js';

/**
 * 업체 관리자 목록 query (총관리자 · 관리자 — 전체 업체) — 검색어(상호명 · 업체코드 · 아이디 · 이름 · 휴대폰 번호 부분 일치) · 업체 · 권한 · 상태
 */
export class ManagerAccountListDto extends PaginationDto {
    @ApiProperty({description: '검색어 — 상호명 · 업체코드 · 아이디 · 이름 · 휴대폰 번호 부분 일치', required: false})
    @IsOptional()
    @MaxLength(100, {message: '검색어는 100자 이내로 입력해주세요.'})
    keyword: string | null;

    @ApiProperty({description: '업체 ID — 없으면 전체 업체', required: false})
    @IsOptional()
    @Matches(/^[a-f0-9]{32}$/, {message: '업체 ID가 올바르지 않습니다.'})
    store_id: string | null;

    @ApiProperty({description: '권한 (HEAD_MANAGER: 업체 총관리자, MANAGER: 업체 관리자) — 없으면 전체', required: false})
    @IsOptional()
    @IsIn(['HEAD_MANAGER', 'MANAGER'], {message: '권한이 올바르지 않습니다.'})
    auth_id: string | null;

    @ApiProperty({description: '상태 (ACTIVE: 정상, BLOCK: 정지) — 없으면 전체', required: false})
    @IsOptional()
    @IsIn(['ACTIVE', 'BLOCK'], {message: '상태가 올바르지 않습니다.'})
    state_id: string | null;

    /**
     * @param data 요청 쿼리 — 빠진 페이지 값은 PaginationDto 기본값, 빠진 필터는 null
     */
    constructor(data?: Partial<ManagerAccountListDto>) {
        super(data);
        this.keyword = data?.keyword ?? null;
        this.store_id = data?.store_id ?? null;
        this.auth_id = data?.auth_id ?? null;
        this.state_id = data?.state_id ?? null;
    }
}

/**
 * 업체 관리자 목록 항목 — 업체(상호명 · 업체코드 · 업체 상태)와 함께
 */
export class ManagerAccountListItemResultDto {
    @ApiProperty({description: '회원 ID'})
    user_id: string;

    @ApiProperty({description: '업체 ID'})
    store_id: string;

    @ApiProperty({description: '상호명'})
    store_name: string;

    @ApiProperty({description: '업체코드'})
    store_code: string;

    @ApiProperty({description: '업체 상태 (ACTIVE · SUSPEND · LEAVE)'})
    store_state_id: string;

    @ApiProperty({description: '로그인 아이디'})
    login_id: string;

    @ApiProperty({description: '이름'})
    name: string;

    @ApiProperty({description: '휴대폰 번호 (없으면 null)', nullable: true, type: String})
    phone: string | null;

    @ApiProperty({description: '권한 (HEAD_MANAGER: 업체 총관리자, MANAGER: 업체 관리자)'})
    auth_id: string;

    @ApiProperty({description: '상태 (ACTIVE: 정상, BLOCK: 정지)'})
    state_id: string;

    @ApiProperty({description: '비밀번호 변경 필요 여부(0: 불필요, 1: 필요 — 임시 비밀번호)'})
    is_password_change_required: number;

    @ApiProperty({description: '등록일시 (ISO 8601)'})
    created_at: string;
}

/**
 * 업체 관리자 목록
 */
export class ManagerAccountListResultDto {
    @ApiProperty({description: '목록 (등록 최신순)', type: () => [ManagerAccountListItemResultDto]})
    list: ManagerAccountListItemResultDto[];

    @ApiProperty({description: '페이지 정보', type: () => PaginationResultDto})
    pagination: PaginationResultDto;
}
```

```ts
// libs/contracts/src/manager/dto/manager-account-detail.dto.ts — 새 파일
import {ApiProperty} from '@nestjs/swagger';
import {IsNotEmpty, Matches} from 'class-validator';

/**
 * 업체 관리자 상세 path param (총관리자 · 관리자)
 */
export class ManagerAccountDetailParamDto {
    @ApiProperty({description: '업체 총관리자 · 업체 관리자 회원 ID'})
    @Matches(/^[a-f0-9]{32}$/, {message: '회원 ID가 올바르지 않습니다.'})
    @IsNotEmpty({message: '회원 ID를 입력해주세요.'})
    user_id: string;
}

/**
 * 업체 관리자 상세 (총관리자 · 관리자)
 */
export class ManagerAccountDetailResultDto {
    @ApiProperty({description: '회원 ID'})
    user_id: string;

    @ApiProperty({description: '업체 ID'})
    store_id: string;

    @ApiProperty({description: '상호명'})
    store_name: string;

    @ApiProperty({description: '업체코드'})
    store_code: string;

    @ApiProperty({description: '업체 상태 (ACTIVE · SUSPEND · LEAVE)'})
    store_state_id: string;

    @ApiProperty({description: '로그인 아이디'})
    login_id: string;

    @ApiProperty({description: '이름'})
    name: string;

    @ApiProperty({description: '휴대폰 번호 (없으면 null)', nullable: true, type: String})
    phone: string | null;

    @ApiProperty({description: '성별 (M · F)'})
    gender: string;

    @ApiProperty({description: '생년월일 (YYYY-MM-DD)'})
    birth: string;

    @ApiProperty({description: '권한 (HEAD_MANAGER: 업체 총관리자, MANAGER: 업체 관리자)'})
    auth_id: string;

    @ApiProperty({description: '상태 (ACTIVE: 정상, BLOCK: 정지)'})
    state_id: string;

    @ApiProperty({description: '정지 사유 (없으면 null)', nullable: true, type: String})
    block_comment: string | null;

    @ApiProperty({description: '비밀번호 변경 필요 여부(0: 불필요, 1: 필요 — 임시 비밀번호)'})
    is_password_change_required: number;

    @ApiProperty({description: '등록일시 (ISO 8601)'})
    created_at: string;
}
```

```ts
// libs/contracts/src/manager/dto/manager-account-password-reset.dto.ts — 새 파일
import {ApiProperty} from '@nestjs/swagger';
import {IsNotEmpty, Matches} from 'class-validator';

/**
 * 업체 관리자 비밀번호 초기화 path param (총관리자 · 관리자) — 임시 비밀번호는 그 계정 휴대폰으로 SMS
 */
export class ManagerAccountPasswordResetParamDto {
    @ApiProperty({description: '업체 총관리자 · 업체 관리자 회원 ID'})
    @Matches(/^[a-f0-9]{32}$/, {message: '회원 ID가 올바르지 않습니다.'})
    @IsNotEmpty({message: '회원 ID를 입력해주세요.'})
    user_id: string;
}
```

### B. admin-service user 도메인 — 계산 util (TDD 먼저)

```ts
// apps/admin-service/src/user/user.constants.ts — 새 파일
/**
 * 이용자 관리 도메인 상수(admin-service — 총관리자 · 관리자) — 도메인 값과 여러 메서드가 함께 쓰는 사용자 노출 메시지.
 * 한 곳에서만 쓰는 메시지는 throw 옆에 인라인 한국어 리터럴로 둔다.
 */

/** 이용자 그룹이 아니거나 없는 회원 — 상세 · 예약 이력 · 이용 제한 */
export const USER_NOT_FOUND_MESSAGE = '이용자를 찾을 수 없습니다.';

/** 관리자가 바꿀 수 있는 이용자 상태 — 정상 ↔ 이용 제한(사용자 결정 2026-11-09) */
export const USER_CHANGEABLE_STATES = ['ACTIVE', 'BLOCK'];

/** 이용 제한 상태 — 사유를 남긴다 */
export const USER_STATE_BLOCK = 'BLOCK';

/** 진행 중 예약 상태 — 결제 대기 · 확정 · 이용 중 */
export const USER_RESERVATION_IN_PROGRESS_STATES = ['PENDING', 'CONFIRMED', 'CHECKED_IN'];
```

```ts
// apps/admin-service/src/user/user.util.ts — 새 파일
import {ILike} from 'typeorm';
import type {FindOptionsWhere} from 'typeorm';
import {toContainsPattern} from '@app/common/utils/search.js';
import type {UserDetailResultDto, UserReservationSummaryResultDto} from '@app/contracts/user/dto/user-detail.dto.js';
import type {UserListDto, UserListItemResultDto} from '@app/contracts/user/dto/user-list.dto.js';
import type {UserReservationListItemResultDto} from '@app/contracts/user/dto/user-reservation-list.dto.js';
import {RESERVATION_STATE} from '@app/contracts/reservation/reservation.constants.js';
import {LOGIN_SCOPE} from '@app/contracts/roles.js';
import type {UserEntity} from '@app/database/entities/user/user.entity.js';
import type {UserReservationCountRow, UserReservationRow} from './interfaces/user.repository.interface.js';
import {USER_CHANGEABLE_STATES, USER_RESERVATION_IN_PROGRESS_STATES} from './user.constants.js';

/**
 * 이용자 목록 조건 — 이용자 그룹 + 상태 · SNS 필터, 검색어가 있으면 이름 · 닉네임 · 휴대폰 번호 · 회원 식별 코드 부분 일치(배열 = OR).
 *
 * @param dto 목록 query
 * @returns 조회 조건
 */
export function buildUserListWhere(dto: UserListDto): FindOptionsWhere<UserEntity>[] {
    const base: FindOptionsWhere<UserEntity> = {login_scope: LOGIN_SCOPE.USER};
    if (dto.state_id) {
        base.state_id = dto.state_id;
    }
    if (dto.sns_id) {
        base.sns_id = dto.sns_id;
    }
    if (!dto.keyword) {
        return [base];
    }
    const pattern = toContainsPattern(dto.keyword);
    return [
        {...base, name: ILike(pattern)},
        {...base, nickname: ILike(pattern)},
        {...base, phone: ILike(pattern)},
        {...base, user_search_code: ILike(pattern)},
    ];
}

/**
 * 관리자 이용 제한 · 해제 판정 — 정상 ↔ 이용 제한만(사용자 결정 2026-11-09). 할 수 없으면 사유.
 *
 * @param current 지금 상태
 * @param next 바꿀 상태
 * @returns 못 하는 사유 또는 null
 */
export function judgeUserStateChange(current: string, next: string): string | null {
    if (!USER_CHANGEABLE_STATES.includes(current)) {
        return '탈퇴 대기 · 탈퇴 회원은 상태를 바꿀 수 없습니다.';
    }
    if (current === next) {
        return '이미 같은 상태입니다.';
    }
    return null;
}

/**
 * 예약 건수 요약 — 상태별 건수 행을 전체(결제 대기 만료 제외) · 진행 중 · 이용 완료 · 취소로. PostgreSQL count 는 문자열이라 숫자로 바꾼다.
 *
 * @param rows 상태별 건수
 * @returns 요약
 */
export function toReservationSummary(rows: UserReservationCountRow[]): UserReservationSummaryResultDto {
    const summary = {total: 0, in_progress: 0, completed: 0, canceled: 0};
    for (const row of rows) {
        const count = Number(row.count);
        if (row.reservation_state_id === RESERVATION_STATE.EXPIRED) {
            continue;
        }
        summary.total += count;
        if (USER_RESERVATION_IN_PROGRESS_STATES.includes(row.reservation_state_id)) {
            summary.in_progress += count;
        } else if (row.reservation_state_id === RESERVATION_STATE.COMPLETED) {
            summary.completed += count;
        } else if (row.reservation_state_id === RESERVATION_STATE.CANCELED) {
            summary.canceled += count;
        }
    }
    return summary;
}

/**
 * 이용자 목록 항목
 *
 * @param entity 이용자
 * @returns 목록 항목
 */
export function toUserListItem(entity: UserEntity): UserListItemResultDto {
    return {
        user_id: entity.user_id,
        user_search_code: entity.user_search_code,
        nickname: entity.nickname,
        name: entity.name,
        phone: entity.phone ?? null,
        sns_id: entity.sns_id ?? null,
        state_id: entity.state_id,
        is_phone_verified: entity.phone_verified_at ? 1 : 0,
        created_at: entity.created_at.toISOString(),
    };
}

/**
 * 이용자 상세
 *
 * @param entity 이용자
 * @param reservation_summary 예약 건수 요약
 * @returns 상세
 */
export function toUserDetail(entity: UserEntity, reservation_summary: UserReservationSummaryResultDto): UserDetailResultDto {
    return {
        user_id: entity.user_id,
        user_search_code: entity.user_search_code,
        nickname: entity.nickname,
        name: entity.name,
        gender: entity.gender,
        birth: entity.birth,
        phone: entity.phone ?? null,
        phone_verified_at: entity.phone_verified_at ? entity.phone_verified_at.toISOString() : null,
        sns_id: entity.sns_id ?? null,
        state_id: entity.state_id,
        block_comment: entity.block_comment ?? null,
        leave_reserved_at: entity.leave_reserved_at ?? null,
        created_at: entity.created_at.toISOString(),
        reservation_summary,
    };
}

/**
 * 이용자 예약 이력 항목 — raw 행의 시각 · 금액을 응답 모양으로.
 *
 * @param row 예약 행
 * @returns 이력 항목
 */
export function toUserReservationItem(row: UserReservationRow): UserReservationListItemResultDto {
    return {
        reservation_id: row.reservation_id,
        store_id: row.store_id,
        store_name: row.store_name,
        room_name: row.room_name,
        room_group_name: row.room_group_name,
        room_plan_type_id: row.room_plan_type_id,
        room_plan_type_name: row.room_plan_type_name,
        reservation_state_id: row.reservation_state_id,
        reservation_state_name: row.reservation_state_name,
        start_at: new Date(row.start_at).toISOString(),
        end_at: new Date(row.end_at).toISOString(),
        total_price: Number(row.total_price),
        canceled_at: row.canceled_at ? new Date(row.canceled_at).toISOString() : null,
        cancel_actor: row.cancel_actor ?? null,
        created_at: new Date(row.created_at).toISOString(),
    };
}
```

### B. admin-service user — Data Access

```ts
// apps/admin-service/src/user/user.symbols.ts — 새 파일
/** 이용자 관리 repository 포트 토큰 — 구현: UserRepository */
export const USER_REPOSITORY = Symbol('UserRepositoryInterface');
```

```ts
// apps/admin-service/src/user/interfaces/user.repository.interface.ts — 새 파일
import type {FindOptionsWhere} from 'typeorm';
import type {ReservationEntity} from '@app/database/entities/reservation/reservation.entity.js';
import type {UserEntity} from '@app/database/entities/user/user.entity.js';

/** 예약 상태별 건수 (QueryBuilder raw — GROUP BY) */
export interface UserReservationCountRow {
    reservation_state_id: string;
    count: string | number;
}

/** 이용자 예약 이력 행 — 예약 + 업체 · 호실 · 그룹 · 상품 종류 · 상태 이름 (QueryBuilder raw) */
export interface UserReservationRow {
    reservation_id: string;
    store_id: string;
    store_name: string;
    room_name: string;
    room_group_name: string;
    room_plan_type_id: string;
    room_plan_type_name: string;
    reservation_state_id: string;
    reservation_state_name: string;
    start_at: Date;
    end_at: Date;
    total_price: number;
    canceled_at: Date | null;
    cancel_actor: string | null;
    created_at: Date;
}

/**
 * 이용자 관리 repository 포트(admin-service) — 공유 DB 의 t_user(이용자 그룹)를 읽고 상태를 바꾸며, 그 이용자의 t_reservation 을 이용자 관리 어휘로 읽는다.
 * WHERE 는 service 가 만들고 repository 는 실행 + DB 오류 변환만 한다(t_user · t_reservation 은 is_deleted 가 없다).
 */
export interface UserRepositoryInterface {
    /** 이용자 단건 (t_user) */
    findUser(where: FindOptionsWhere<UserEntity>): Promise<UserEntity | null>;
    /** 이용자 수 — 목록 */
    countUsers(where: FindOptionsWhere<UserEntity> | FindOptionsWhere<UserEntity>[]): Promise<number>;
    /** 이용자 목록 — 가입 최신순 */
    findUserList(where: FindOptionsWhere<UserEntity> | FindOptionsWhere<UserEntity>[], limit: number, offset: number): Promise<UserEntity[]>;
    /** 이용자 상태 수정 — 상태 조건을 건 쓰기, 1행이면 true */
    updateUser(where: FindOptionsWhere<UserEntity>, entity: UserEntity): Promise<boolean>;
    /** 그 이용자 예약의 상태별 건수 */
    findReservationCounts(user_id: string): Promise<UserReservationCountRow[]>;
    /** 그 이용자 예약 수 — 예약 이력 페이지 */
    countUserReservations(where: FindOptionsWhere<ReservationEntity>): Promise<number>;
    /** 그 이용자 예약 이력 — 결제 대기 만료 제외, 이용 시작 최신순 */
    findUserReservationRows(user_id: string, limit: number, offset: number): Promise<UserReservationRow[]>;
}
```

```ts
// apps/admin-service/src/user/repositories/user.repository.ts — 새 파일
import {Injectable, InternalServerErrorException} from '@nestjs/common';
import {TransactionHost} from '@nestjs-cls/transactional';
import type {TransactionalAdapterTypeOrm} from '@nestjs-cls/transactional-adapter-typeorm';
import type {FindOptionsWhere, Repository, SelectQueryBuilder} from 'typeorm';
import {RESERVATION_STATE} from '@app/contracts/reservation/reservation.constants.js';
import {ReservationStateEntity} from '@app/database/entities/reservation/reservation-state.entity.js';
import {ReservationEntity} from '@app/database/entities/reservation/reservation.entity.js';
import {RoomGroupEntity} from '@app/database/entities/room/room-group.entity.js';
import {RoomPlanTypeEntity} from '@app/database/entities/room/room-plan-type.entity.js';
import {RoomEntity} from '@app/database/entities/room/room.entity.js';
import {StoreEntity} from '@app/database/entities/store/store.entity.js';
import {UserEntity} from '@app/database/entities/user/user.entity.js';
import type {UserRepositoryInterface, UserReservationCountRow, UserReservationRow} from '../interfaces/user.repository.interface.js';

/** DB 최종 실패 메시지 */
const SERVER_ERROR_MESSAGE = '서버에서 오류가 발생했습니다. 관리자에게 문의해주세요.';

/**
 * 이용자 관리 repository(admin-service) — 이용자(t_user)와 그 예약(t_reservation)을 읽고, 이용자 상태를 상태 조건으로 바꾼다.
 */
@Injectable()
export class UserRepository implements UserRepositoryInterface {
    /**
     * @param txHost 트랜잭션 호스트
     */
    constructor(private readonly txHost: TransactionHost<TransactionalAdapterTypeOrm>) {}

    /** t_user */
    private get users(): Repository<UserEntity> {
        return this.txHost.tx.getRepository(UserEntity);
    }

    /** t_reservation */
    private get reservations(): Repository<ReservationEntity> {
        return this.txHost.tx.getRepository(ReservationEntity);
    }

    /**
     * 이용자 단건
     *
     * @param where 조회 조건
     * @returns 이용자 또는 null
     */
    async findUser(where: FindOptionsWhere<UserEntity>): Promise<UserEntity | null> {
        try {
            return await this.users.findOne({where, loadRelationIds: true});
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 이용자 수
     *
     * @param where 조회 조건 (배열 = OR)
     * @returns 개수
     */
    async countUsers(where: FindOptionsWhere<UserEntity> | FindOptionsWhere<UserEntity>[]): Promise<number> {
        try {
            return await this.users.count({where});
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 이용자 목록
     *
     * @param where 조회 조건 (배열 = OR)
     * @param limit 개수
     * @param offset 건너뛸 개수
     * @returns 이용자 목록 (가입 최신순)
     */
    async findUserList(where: FindOptionsWhere<UserEntity> | FindOptionsWhere<UserEntity>[], limit: number, offset: number): Promise<UserEntity[]> {
        try {
            return await this.buildUserListQuery(where, limit, offset).getMany();
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 이용자 목록 쿼리 — 매핑 민감(관계 필드 where · ILike · 배열 OR · 정렬)이라 Data-Access Smoke spec 으로 SQL 을 고정한다.
     *
     * @param where 조회 조건 (배열 = OR)
     * @param limit 개수
     * @param offset 건너뛸 개수
     * @returns 쿼리 빌더
     */
    buildUserListQuery(where: FindOptionsWhere<UserEntity> | FindOptionsWhere<UserEntity>[], limit: number, offset: number): SelectQueryBuilder<UserEntity> {
        return this.users.createQueryBuilder('u').setFindOptions({where, order: {created_at: 'DESC'}, take: limit, skip: offset, loadRelationIds: true});
    }

    /**
     * 이용자 상태 수정 — 상태 조건을 건 쓰기(그 사이 탈퇴 신청 등으로 바뀌었는지 판별), new UserEntity() + 할당으로 호출.
     *
     * @param where 수정 조건(회원 · 그룹 · 지금 상태)
     * @param entity 바꿀 필드만 할당한 엔티티
     * @returns 1행이면 true
     */
    async updateUser(where: FindOptionsWhere<UserEntity>, entity: UserEntity): Promise<boolean> {
        try {
            const result = await this.users.update(where, entity);
            return result.affected === 1;
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 그 이용자 예약의 상태별 건수
     *
     * @param user_id 이용자 ID
     * @returns 상태별 건수
     */
    async findReservationCounts(user_id: string): Promise<UserReservationCountRow[]> {
        try {
            return await this.buildReservationCountsQuery(user_id).getRawMany<UserReservationCountRow>();
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 예약 상태별 건수 쿼리 — 매핑 민감(raw select · GROUP BY — 별칭이 UserReservationCountRow 키와 같다)이라 Data-Access Smoke spec 으로 SQL 을 고정한다.
     *
     * @param user_id 이용자 ID
     * @returns 쿼리 빌더
     */
    buildReservationCountsQuery(user_id: string): SelectQueryBuilder<ReservationEntity> {
        return this.reservations
            .createQueryBuilder('r')
            .select('r.reservation_state_id', 'reservation_state_id')
            .addSelect('COUNT(*)', 'count')
            .where('r.user_id = :user_id', {user_id})
            .groupBy('r.reservation_state_id');
    }

    /**
     * 그 이용자 예약 수
     *
     * @param where 조회 조건
     * @returns 개수
     */
    async countUserReservations(where: FindOptionsWhere<ReservationEntity>): Promise<number> {
        try {
            return await this.reservations.count({where});
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 그 이용자 예약 이력
     *
     * @param user_id 이용자 ID
     * @param limit 개수
     * @param offset 건너뛸 개수
     * @returns 예약 행 (이용 시작 최신순)
     */
    async findUserReservationRows(user_id: string, limit: number, offset: number): Promise<UserReservationRow[]> {
        try {
            return await this.buildUserReservationsQuery(user_id).orderBy('r.start_at', 'DESC').limit(limit).offset(offset).getRawMany<UserReservationRow>();
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 이용자 예약 이력 쿼리 — 업체 · 호실 · 그룹 · 상품 종류 · 상태 조인(지운 업체 · 호실 · 그룹도 기록이라 그대로 보인다), 결제 대기 만료 제외.
     * 매핑 민감(조인 · raw select — 별칭이 UserReservationRow 키와 같다)이라 Data-Access Smoke spec 으로 SQL 을 고정한다.
     *
     * @param user_id 이용자 ID
     * @returns 쿼리 빌더
     */
    buildUserReservationsQuery(user_id: string): SelectQueryBuilder<ReservationEntity> {
        return this.reservations
            .createQueryBuilder('r')
            .select('r.reservation_id', 'reservation_id')
            .addSelect('r.store_id', 'store_id')
            .addSelect('s.store_name', 'store_name')
            .addSelect('rm.room_name', 'room_name')
            .addSelect('g.room_group_name', 'room_group_name')
            .addSelect('r.room_plan_type_id', 'room_plan_type_id')
            .addSelect('pt.room_plan_type_name', 'room_plan_type_name')
            .addSelect('r.reservation_state_id', 'reservation_state_id')
            .addSelect('st.reservation_state_name', 'reservation_state_name')
            .addSelect('r.start_at', 'start_at')
            .addSelect('r.end_at', 'end_at')
            .addSelect('r.total_price', 'total_price')
            .addSelect('r.canceled_at', 'canceled_at')
            .addSelect('r.cancel_actor', 'cancel_actor')
            .addSelect('r.created_at', 'created_at')
            .innerJoin(StoreEntity, 's', 's.store_id = r.store_id')
            .innerJoin(RoomEntity, 'rm', 'rm.room_id = r.room_id')
            .innerJoin(RoomGroupEntity, 'g', 'g.room_group_id = rm.room_group_id')
            .innerJoin(RoomPlanTypeEntity, 'pt', 'pt.room_plan_type_id = r.room_plan_type_id')
            .innerJoin(ReservationStateEntity, 'st', 'st.reservation_state_id = r.reservation_state_id')
            .where('r.user_id = :user_id', {user_id})
            .andWhere('r.reservation_state_id <> :expired', {expired: RESERVATION_STATE.EXPIRED});
    }
}
```

### B. admin-service user — Business Logic

```ts
// apps/admin-service/src/user/user.service.ts — 새 파일
import {BadRequestException, Inject, Injectable, NotFoundException} from '@nestjs/common';
import {Transactional} from '@nestjs-cls/transactional';
import {Not} from 'typeorm';
import {Pagination} from '@app/common/utils/pagination.js';
import type {UserDetailResultDto} from '@app/contracts/user/dto/user-detail.dto.js';
import type {UserListDto, UserListResultDto} from '@app/contracts/user/dto/user-list.dto.js';
import type {UserReservationListDto, UserReservationListResultDto} from '@app/contracts/user/dto/user-reservation-list.dto.js';
import type {UserStateDto} from '@app/contracts/user/dto/user-state.dto.js';
import {RESERVATION_STATE} from '@app/contracts/reservation/reservation.constants.js';
import {LOGIN_SCOPE} from '@app/contracts/roles.js';
import {UserEntity} from '@app/database/entities/user/user.entity.js';
import type {UserRepositoryInterface} from './interfaces/user.repository.interface.js';
import {USER_NOT_FOUND_MESSAGE, USER_STATE_BLOCK} from './user.constants.js';
import {USER_REPOSITORY} from './user.symbols.js';
import {buildUserListWhere, judgeUserStateChange, toReservationSummary, toUserDetail, toUserListItem, toUserReservationItem} from './user.util.js';

/**
 * 이용자 관리 service(admin-service — 총관리자 · 관리자) — 이용자 목록 · 상세 · 예약 이력 · 이용 제한 · 해제.
 * 이용 제한(BLOCK)은 이용자 그룹에서 로그인 · 기존 예약 이용은 되고 새 예약 · 연장만 막힌다(user-service — 사용자 결정 2026-11-09).
 * 이용자 본인 기능(가입 · 로그인 · 탈퇴)은 user-service user 다(서버 안 도메인은 기능 대상별 — 같은 이름 따로).
 */
@Injectable()
export class UserService {
    /**
     * @param userRepository 이용자 관리 repository 포트
     */
    constructor(@Inject(USER_REPOSITORY) private readonly userRepository: UserRepositoryInterface) {}

    /**
     * 이용자 목록 — 이용자 그룹 · 상태 · SNS · 검색어, 가입 최신순. (내부 HTTP: GET /internal/v1/admin-service/user)
     *
     * @param dto 페이지 · 필터 · 검색어
     * @returns 목록 · 페이지 정보
     */
    async getUserList(dto: UserListDto): Promise<UserListResultDto> {
        const where = buildUserListWhere(dto);
        const total_count = await this.userRepository.countUsers(where);
        const pagination = new Pagination({...dto, total_count});
        const users = await this.userRepository.findUserList(where, pagination.limit, pagination.offset);
        return {list: users.map(toUserListItem), pagination: pagination.getPagination()};
    }

    /**
     * 이용자 상세 — 회원 정보 + 예약 건수 요약(결제 대기 만료 제외). (내부 HTTP: GET /internal/v1/admin-service/user/:user_id)
     *
     * @param user_id 이용자 회원 ID
     * @returns 상세
     */
    async getUser(user_id: string): Promise<UserDetailResultDto> {
        const user = await this.userRepository.findUser({user_id, login_scope: LOGIN_SCOPE.USER});
        if (!user) {
            throw new NotFoundException({message: USER_NOT_FOUND_MESSAGE});
        }
        const counts = await this.userRepository.findReservationCounts(user.user_id);
        return toUserDetail(user, toReservationSummary(counts));
    }

    /**
     * 이용자 예약 이력 — 결제 대기 만료 제외, 이용 시작 최신순. (내부 HTTP: GET /internal/v1/admin-service/user/:user_id/reservation)
     *
     * @param user_id 이용자 회원 ID
     * @param dto 페이지
     * @returns 목록 · 페이지 정보
     */
    async getUserReservations(user_id: string, dto: UserReservationListDto): Promise<UserReservationListResultDto> {
        const user = await this.userRepository.findUser({user_id, login_scope: LOGIN_SCOPE.USER});
        if (!user) {
            throw new NotFoundException({message: USER_NOT_FOUND_MESSAGE});
        }
        const total_count = await this.userRepository.countUserReservations({user_id: user.user_id, reservation_state_id: Not(RESERVATION_STATE.EXPIRED)});
        const pagination = new Pagination({...dto, total_count});
        const rows = await this.userRepository.findUserReservationRows(user.user_id, pagination.limit, pagination.offset);
        return {list: rows.map(toUserReservationItem), pagination: pagination.getPagination()};
    }

    /**
     * 이용자 이용 제한 · 해제 — ACTIVE ↔ BLOCK 만, 같은 상태 · 탈퇴 대기 · 탈퇴 회원은 400. 사유는 제한할 때만 남기고 해제하면 지운다.
     * 상태 조건을 건 쓰기 — 그 사이 탈퇴 신청 등으로 바뀌었으면 400 롤백. 남은 예약은 그대로(사용자 결정 2026-11-09). (RabbitMQ: admin.user.state)
     *
     * @param user_id 이용자 회원 ID
     * @param dto 바꿀 상태 · 제한 사유
     */
    @Transactional()
    async changeUserState(user_id: string, dto: UserStateDto): Promise<void> {
        // 1. 이용자 · 바꿀 수 있는 상태인지
        const user = await this.userRepository.findUser({user_id, login_scope: LOGIN_SCOPE.USER});
        if (!user) {
            throw new NotFoundException({message: USER_NOT_FOUND_MESSAGE});
        }
        const reason = judgeUserStateChange(user.state_id, dto.state_id);
        if (reason) {
            throw new BadRequestException({message: reason});
        }

        // 2. 상태 · 제한 사유 (지금 상태 조건)
        const userEntity = new UserEntity();
        userEntity.state_id = dto.state_id;
        userEntity.block_comment = dto.state_id === USER_STATE_BLOCK ? (dto.block_comment ?? null) : null;
        if (!(await this.userRepository.updateUser({user_id: user.user_id, login_scope: LOGIN_SCOPE.USER, state_id: user.state_id}, userEntity))) {
            throw new BadRequestException({message: '회원 상태가 바뀌었습니다. 다시 확인해주세요.'});
        }
    }
}
```

### B. admin-service user — Entry Point · Module

```ts
// apps/admin-service/src/user/controllers/user.controller.ts — 새 파일
import {Controller, Get, HttpCode, Param, Query} from '@nestjs/common';
import {UserDetailParamDto, UserDetailResultDto} from '@app/contracts/user/dto/user-detail.dto.js';
import {UserListDto, UserListResultDto} from '@app/contracts/user/dto/user-list.dto.js';
import {UserReservationListDto, UserReservationListParamDto, UserReservationListResultDto} from '@app/contracts/user/dto/user-reservation-list.dto.js';
import {UserService} from '../user.service.js';

/**
 * 이용자 관리 내부 HTTP 컨트롤러(동기 경로 인바운드 어댑터) — 게이트웨이가 관리자 가드를 통과시킨 요청만 온다(서비스는 전역 InternalAuthGuard).
 */
@Controller('/internal/v1/admin-service/user')
export class UserController {
    /**
     * @param userService 이용자 관리 service
     */
    constructor(private readonly userService: UserService) {}

    /**
     * 이용자 목록 (총관리자 · 관리자)
     */
    @Get('/')
    @HttpCode(200)
    async getUserList(@Query() query: UserListDto): Promise<UserListResultDto> {
        const dto = new UserListDto(query);
        return this.userService.getUserList(dto);
    }

    /**
     * 이용자 상세 (총관리자 · 관리자)
     */
    @Get('/:user_id')
    @HttpCode(200)
    async getUser(@Param() param: UserDetailParamDto): Promise<UserDetailResultDto> {
        return this.userService.getUser(param.user_id);
    }

    /**
     * 이용자 예약 이력 (총관리자 · 관리자)
     */
    @Get('/:user_id/reservation')
    @HttpCode(200)
    async getUserReservations(@Param() param: UserReservationListParamDto, @Query() query: UserReservationListDto): Promise<UserReservationListResultDto> {
        const dto = new UserReservationListDto(query);
        return this.userService.getUserReservations(param.user_id, dto);
    }
}
```

```ts
// apps/admin-service/src/user/controllers/user.controller.queue.ts — 새 파일
import {Injectable} from '@nestjs/common';
import type {MessageEnvelope} from '@app/contracts/message-envelope.js';
import type {UserStateDto, UserStateParamDto} from '@app/contracts/user/dto/user-state.dto.js';
import {USER_ADMIN_COMMAND} from '@app/contracts/user/user.commands.js';
import {OnCommand} from '@app/messaging/on-command.decorator.js';
import {UserService} from '../user.service.js';

/**
 * 이용자 관리 큐 경로 컨트롤러(RabbitMQ 인바운드 어댑터) — 게이트웨이가 발행한 `admin.user.*` 명령을 `@OnCommand` 로 받는다.
 * 관리자 가드는 게이트웨이에서 끝났다(업체 상태 변경 admin.store.state 와 같이 actor 를 service 에 넘기지 않는다).
 */
@Injectable()
export class UserQueueController {
    /**
     * @param userService 이용자 관리 service
     */
    constructor(private readonly userService: UserService) {}

    /**
     * 이용자 이용 제한 · 해제 — 총관리자 · 관리자
     *
     * @param command 명령 봉투 (payload = path param + 본문)
     */
    @OnCommand(USER_ADMIN_COMMAND.STATE)
    async changeUserState(command: MessageEnvelope<UserStateParamDto & UserStateDto>): Promise<void> {
        return this.userService.changeUserState(command.payload.user_id, command.payload);
    }
}
```

```ts
// apps/admin-service/src/user/user.module.ts — 새 파일
import {Module} from '@nestjs/common';
import {UserController} from './controllers/user.controller.js';
import {UserQueueController} from './controllers/user.controller.queue.js';
import {UserRepository} from './repositories/user.repository.js';
import {USER_REPOSITORY} from './user.symbols.js';
import {UserService} from './user.service.js';

/**
 * 이용자 관리 도메인(admin-service — 총관리자 · 관리자) — 인바운드 어댑터 2종이 같은 service 를 부른다.
 * - UserController(controllers/user.controller.ts): 내부 HTTP (게이트웨이 동기 경로) — controllers 에 등록
 * - UserQueueController(controllers/user.controller.queue.ts): RabbitMQ (게이트웨이 큐 경로) — `@OnCommand` provider 라 providers 에 등록
 */
@Module({
    controllers: [UserController],
    providers: [UserService, UserQueueController, {provide: USER_REPOSITORY, useClass: UserRepository}],
})
export class UserModule {}
```

```ts
// apps/admin-service/src/admin-service.module.ts — import 추가 · imports 에 등록(ReservationModule 뒤)
import {UserModule} from './user/user.module.js';
// …
        ReservationModule,
        UserModule,
```

### C. admin-service manager — 업체 관리자 관리

```ts
// apps/admin-service/src/manager/manager.constants.ts — 추가
/** 휴대폰 번호가 없는 계정 — 임시 비밀번호를 보낼 수 없다(업체 총관리자 · 총관리자의 비밀번호 초기화) */
export const MANAGER_PHONE_NOT_REGISTERED_MESSAGE = '휴대폰 번호가 등록되지 않은 계정입니다.';

/** 탈퇴 업체 상태 — 그 업체 계정은 비밀번호를 초기화하지 않는다 */
export const MANAGER_STORE_STATE_LEAVE = 'LEAVE';
```

```ts
// apps/admin-service/src/manager/interfaces/manager.repository.interface.ts — 추가
/** 업체 관리자 관리 필터 (총관리자 · 관리자) — null 이면 그 조건 없음, user_id 는 상세 */
export interface ManagerAccountFilter {
    user_id: string | null;
    keyword: string | null;
    store_id: string | null;
    auth_id: string | null;
    state_id: string | null;
}

/** 업체 관리자 행 — 매니저 계정 + 업체(상호명 · 업체코드 · 업체 상태) (QueryBuilder raw) */
export interface ManagerAccountRow {
    user_id: string;
    store_id: string;
    store_name: string;
    store_code: string;
    store_state_id: string;
    login_id: string;
    name: string;
    phone: string | null;
    gender: string;
    birth: string;
    auth_id: string;
    state_id: string;
    block_comment: string | null;
    is_password_change_required: number;
    created_at: Date;
}

// ManagerRepositoryInterface 에 추가(updateStaff 뒤)
    /** 업체 관리자 수 (총관리자 · 관리자 — 전체 업체, 업체 조인 · 검색) */
    countAccounts(filter: ManagerAccountFilter): Promise<number>;
    /** 업체 관리자 목록 — 등록 최신순 */
    findAccountRows(filter: ManagerAccountFilter, limit: number, offset: number): Promise<ManagerAccountRow[]>;
    /** 업체 관리자 단건 — 매니저 그룹 · ACTIVE · BLOCK 만 */
    findAccountRow(user_id: string): Promise<ManagerAccountRow | null>;
```

```ts
// apps/admin-service/src/manager/repositories/manager.repository.ts — import 에 Brackets · 타입 추가, STAFF_STATES import, 메서드 추가(updateStaff 뒤)
import {Brackets} from 'typeorm';
import type {FindOptionsWhere, Repository, SelectQueryBuilder, UpdateQueryBuilder} from 'typeorm';
import type {LoginManagerRow, ManagerAccountFilter, ManagerAccountRow, ManagerRepositoryInterface} from '../interfaces/manager.repository.interface.js';
import {STAFF_LOGIN_ID_TAKEN_MESSAGE, STAFF_PHONE_TAKEN_MESSAGE, STAFF_STATES} from '../manager.constants.js';

    /**
     * 업체 관리자 수 (총관리자 · 관리자)
     *
     * @param filter 필터
     * @returns 개수
     */
    async countAccounts(filter: ManagerAccountFilter): Promise<number> {
        try {
            return await this.buildAccountQuery(filter).getCount();
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 업체 관리자 목록 (총관리자 · 관리자)
     *
     * @param filter 필터
     * @param limit 개수
     * @param offset 건너뛸 개수
     * @returns 행 (등록 최신순)
     */
    async findAccountRows(filter: ManagerAccountFilter, limit: number, offset: number): Promise<ManagerAccountRow[]> {
        try {
            return await this.buildAccountQuery(filter).orderBy('u.created_at', 'DESC').limit(limit).offset(offset).getRawMany<ManagerAccountRow>();
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 업체 관리자 단건 (총관리자 · 관리자)
     *
     * @param user_id 회원 ID
     * @returns 행 또는 null
     */
    async findAccountRow(user_id: string): Promise<ManagerAccountRow | null> {
        try {
            return (await this.buildAccountQuery({user_id, keyword: null, store_id: null, auth_id: null, state_id: null}).getRawOne<ManagerAccountRow>()) ?? null;
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 업체 관리자 쿼리 — 매니저 그룹 · ACTIVE · BLOCK(삭제 LEAVE 제외) · 지워지지 않은 업체 조인, 필터는 값이 있을 때만 더한다.
     * 검색어는 상호명 · 업체코드 · 아이디 · 이름 · 휴대폰 번호 부분 일치(괄호로 묶은 OR, `%` · `_` · `\` 이스케이프).
     * 매핑 민감(조인 · raw select — 별칭이 ManagerAccountRow 키와 같다 · 동적 조립 · OR 괄호)이라 Data-Access Smoke spec 으로 SQL 을 고정한다.
     *
     * @param filter 필터
     * @returns 쿼리 빌더
     */
    buildAccountQuery(filter: ManagerAccountFilter): SelectQueryBuilder<UserEntity> {
        const query = this.users
            .createQueryBuilder('u')
            .select('u.user_id', 'user_id')
            .addSelect('u.store_id', 'store_id')
            .addSelect('s.store_name', 'store_name')
            .addSelect('s.store_code', 'store_code')
            .addSelect('s.store_state_id', 'store_state_id')
            .addSelect('u.login_id', 'login_id')
            .addSelect('u.name', 'name')
            .addSelect('u.phone', 'phone')
            .addSelect('u.gender', 'gender')
            .addSelect('u.birth', 'birth')
            .addSelect('u.auth_id', 'auth_id')
            .addSelect('u.state_id', 'state_id')
            .addSelect('u.block_comment', 'block_comment')
            .addSelect('u.is_password_change_required', 'is_password_change_required')
            .addSelect('u.created_at', 'created_at')
            .innerJoin(StoreEntity, 's', 's.store_id = u.store_id')
            .where('u.login_scope = :login_scope', {login_scope: LOGIN_SCOPE.MANAGER})
            .andWhere('u.state_id IN (:...states)', {states: STAFF_STATES})
            .andWhere('s.is_deleted = 0');
        if (filter.user_id !== null) {
            query.andWhere('u.user_id = :user_id', {user_id: filter.user_id});
        }
        if (filter.store_id !== null) {
            query.andWhere('u.store_id = :store_id', {store_id: filter.store_id});
        }
        if (filter.auth_id !== null) {
            query.andWhere('u.auth_id = :auth_id', {auth_id: filter.auth_id});
        }
        if (filter.state_id !== null) {
            query.andWhere('u.state_id = :state_id', {state_id: filter.state_id});
        }
        if (filter.keyword !== null) {
            const pattern = toContainsPattern(filter.keyword);
            query.andWhere(
                new Brackets((qb) => {
                    qb.where('s.store_name ILIKE :pattern', {pattern})
                        .orWhere('s.store_code ILIKE :pattern')
                        .orWhere('u.login_id ILIKE :pattern')
                        .orWhere('u.name ILIKE :pattern')
                        .orWhere('u.phone ILIKE :pattern');
                }),
            );
        }
        return query;
    }
```

```ts
// apps/admin-service/src/manager/manager.util.ts — 추가 (import: ManagerAccountListDto · ManagerAccountListItemResultDto · ManagerAccountDetailResultDto 타입, ManagerAccountFilter · ManagerAccountRow 타입)
/**
 * 업체 관리자 관리 필터 — 목록 query 를 repository 필터로(빈 값은 null).
 *
 * @param dto 목록 query
 * @returns 필터
 */
export function toAccountFilter(dto: ManagerAccountListDto): ManagerAccountFilter {
    return {user_id: null, keyword: dto.keyword || null, store_id: dto.store_id || null, auth_id: dto.auth_id || null, state_id: dto.state_id || null};
}

/**
 * 업체 관리자 목록 항목 (총관리자 · 관리자)
 *
 * @param row 업체 관리자 행
 * @returns 목록 항목
 */
export function toAccountListItem(row: ManagerAccountRow): ManagerAccountListItemResultDto {
    return {
        user_id: row.user_id,
        store_id: row.store_id,
        store_name: row.store_name,
        store_code: row.store_code,
        store_state_id: row.store_state_id,
        login_id: row.login_id,
        name: row.name,
        phone: row.phone ?? null,
        auth_id: row.auth_id,
        state_id: row.state_id,
        is_password_change_required: Number(row.is_password_change_required),
        created_at: new Date(row.created_at).toISOString(),
    };
}

/**
 * 업체 관리자 상세 (총관리자 · 관리자)
 *
 * @param row 업체 관리자 행
 * @returns 상세
 */
export function toAccountDetail(row: ManagerAccountRow): ManagerAccountDetailResultDto {
    return {...toAccountListItem(row), gender: row.gender, birth: row.birth, block_comment: row.block_comment ?? null};
}
```

```ts
// apps/admin-service/src/manager/manager.service.ts — 메서드 3 추가(deleteStaff 뒤), resetStaffPassword 의 인라인 문구를 MANAGER_PHONE_NOT_REGISTERED_MESSAGE 로
    /**
     * 업체 관리자 목록 (총관리자 · 관리자) — 전체 업체의 업체 총관리자 · 업체 관리자(삭제 제외), 업체 · 권한 · 상태 · 검색어, 등록 최신순.
     * (내부 HTTP: GET /internal/v1/admin-service/manager/account)
     *
     * @param dto 페이지 · 필터 · 검색어
     * @returns 목록 · 페이지 정보
     */
    async getAccountList(dto: ManagerAccountListDto): Promise<ManagerAccountListResultDto> {
        const filter = toAccountFilter(dto);
        const total_count = await this.managerRepository.countAccounts(filter);
        const pagination = new Pagination({...dto, total_count});
        const rows = await this.managerRepository.findAccountRows(filter, pagination.limit, pagination.offset);
        return {list: rows.map(toAccountListItem), pagination: pagination.getPagination()};
    }

    /**
     * 업체 관리자 상세 (총관리자 · 관리자) — 업체(상호명 · 업체코드 · 업체 상태)와 함께. (내부 HTTP: GET /internal/v1/admin-service/manager/account/:user_id)
     *
     * @param user_id 업체 총관리자 · 업체 관리자 회원 ID
     * @returns 상세
     */
    async getAccount(user_id: string): Promise<ManagerAccountDetailResultDto> {
        const account = await this.managerRepository.findAccountRow(user_id);
        if (!account) {
            throw new NotFoundException({message: STAFF_NOT_FOUND_MESSAGE});
        }
        return toAccountDetail(account);
    }

    /**
     * 업체 관리자 비밀번호 초기화 (총관리자 · 관리자) — 임시 비밀번호(영문 + 숫자 10자리) + 변경 필요 표시, 그 휴대폰으로 SMS(마지막).
     * 휴대폰 번호 없음 · 탈퇴 업체 계정은 400, 정지 계정도 초기화한다(로그인은 여전히 막힘). 업체 총관리자의 resetStaffPassword 와 같은 순서. (RabbitMQ: admin.manager.account-password-reset)
     *
     * @param user_id 업체 총관리자 · 업체 관리자 회원 ID
     */
    @Transactional()
    async resetAccountPassword(user_id: string): Promise<void> {
        // 1. 계정 · 초기화할 수 있는지
        const account = await this.managerRepository.findAccountRow(user_id);
        if (!account) {
            throw new NotFoundException({message: STAFF_NOT_FOUND_MESSAGE});
        }
        if (account.store_state_id === MANAGER_STORE_STATE_LEAVE) {
            throw new BadRequestException({message: '탈퇴한 업체의 계정입니다.'});
        }
        if (!account.phone) {
            throw new BadRequestException({message: MANAGER_PHONE_NOT_REGISTERED_MESSAGE});
        }

        // 2. 임시 비밀번호 → SMS (마지막)
        const temporaryPassword = generateTemporaryPassword();
        const accountEntity = new UserEntity();
        accountEntity.login_pw = await getBcrypt(temporaryPassword);
        accountEntity.is_password_change_required = 1;
        await this.managerRepository.updateManager({user_id: account.user_id}, accountEntity);
        await this.smsSender.send({to: account.phone, text: temporaryPasswordText(temporaryPassword)});
    }

// resetStaffPassword — 변경
        if (!staff.phone) {
            throw new BadRequestException({message: MANAGER_PHONE_NOT_REGISTERED_MESSAGE});
        }
```

```ts
// apps/admin-service/src/manager/controllers/manager.controller.ts — import 추가, 메서드 2 추가(getStaff 뒤)
import {ManagerAccountDetailParamDto, ManagerAccountDetailResultDto} from '@app/contracts/manager/dto/manager-account-detail.dto.js';
import {ManagerAccountListDto, ManagerAccountListResultDto} from '@app/contracts/manager/dto/manager-account-list.dto.js';

    /**
     * 업체 관리자 목록 (총관리자 · 관리자 — 전체 업체)
     */
    @Get('/account')
    @HttpCode(200)
    async getAccountList(@Query() query: ManagerAccountListDto): Promise<ManagerAccountListResultDto> {
        const dto = new ManagerAccountListDto(query);
        return this.managerService.getAccountList(dto);
    }

    /**
     * 업체 관리자 상세 (총관리자 · 관리자)
     */
    @Get('/account/:user_id')
    @HttpCode(200)
    async getAccount(@Param() param: ManagerAccountDetailParamDto): Promise<ManagerAccountDetailResultDto> {
        return this.managerService.getAccount(param.user_id);
    }
```

```ts
// apps/admin-service/src/manager/controllers/manager.controller.queue.ts — import 추가, 메서드 추가(deleteStaff 뒤)
import type {ManagerAccountPasswordResetParamDto} from '@app/contracts/manager/dto/manager-account-password-reset.dto.js';

    /**
     * 업체 관리자 비밀번호 초기화 — 총관리자 · 관리자(관리자 가드는 게이트웨이, actor 를 service 에 넘기지 않는다)
     *
     * @param command 명령 봉투 (payload = path param)
     */
    @OnCommand(MANAGER_COMMAND.ACCOUNT_PASSWORD_RESET)
    async resetAccountPassword(command: MessageEnvelope<ManagerAccountPasswordResetParamDto>): Promise<void> {
        return this.managerService.resetAccountPassword(command.payload.user_id);
    }
```

### D. user-service — 이용 제한 이용자 로그인 · 재발급 · 인증 확인

```ts
// apps/user-service/src/user/user.constants.ts — 추가
/** 이용자 로그인 · 토큰 재발급 가능 상태 — 이용 제한(BLOCK)도 로그인한다(새 예약 · 연장만 막힌다 — 사용자 결정 2026-11-09). 매니저 · 관리자 그룹의 BLOCK 은 로그인 불가 그대로 */
export const USER_LOGIN_STATES = ['ACTIVE', 'BLOCK'];

/** 이용자 인증 확인(게이트웨이 jwt-user 전략의 auth-user) 통과 상태 — 로그인 상태 + 탈퇴 대기(남은 access 토큰) */
export const USER_AUTH_STATES = ['ACTIVE', 'BLOCK', 'LEAVE_WAIT'];
```

```ts
// apps/user-service/src/user/user.service.ts — login (BLOCKED_ACCOUNT_MESSAGE import 삭제, USER_LOGIN_STATES import)
    /**
     * 이용자 SNS 로그인 (내부 HTTP: POST /internal/v1/user-service/user/login)
     * - (sns_id, sns_user_id) + login_scope USER + state_id IN (ACTIVE, BLOCK) 로 조회, 미존재 → 404
     * - 이용 제한(BLOCK)도 토큰을 준다 — 결과의 state_id · block_comment 로 앱이 알리고, 새 예약 · 연장은 예약 도메인이 막는다(사용자 결정 2026-11-09)
     * - device_os/device_token 둘 다 입력된 경우에만 t_user 동기화(마지막 로그인 기기 유지)
     * …
     */
    @Transactional()
    async login(dto: UserLoginDto, ip: string): Promise<UserLoginResultDto> {
        // 1. 회원 조회 (ACTIVE / BLOCK — 이용 제한도 로그인)
        const user = await this.userRepository.findUser({sns_id: dto.sns_id, sns_user_id: dto.sns_user_id, login_scope: LOGIN_SCOPE.USER, state_id: In(USER_LOGIN_STATES)});
        if (!user) {
            throw new NotFoundException({message: INVALID_LOGIN_MESSAGE});
        }

        // 2. device 정보 입력 시 t_user 동기화 … (이하 단계 번호만 하나씩 당김 — 동작 그대로)

        return {
            access_token: tokens.accessToken,
            refresh_token: tokens.refreshToken,
            access_token_expires_at: tokens.accessTokenExpiresAt.toISOString(),
            refresh_token_expires_at: tokens.refreshTokenExpiresAt.toISOString(),
            is_phone_verified: user.phone_verified_at ? 1 : 0,
            state_id: user.state_id,
            block_comment: user.block_comment ?? null,
        };
    }

// tokenRefresh — 4단계 조건
        // 4. 회원 state · 이용자 그룹 재검증 — 정상 · 이용 제한만(안전망: expires_at 단축)
        const user = await this.userRepository.findUser({user_id: payload.user_id});
        if (!user || !USER_LOGIN_STATES.includes(user.state_id) || user.login_scope !== LOGIN_SCOPE.USER) {
```

```ts
// apps/user-service/src/user/repositories/user.repository.ts — buildLoginUserQuery 의 마지막 조건 · 주석 (import USER_AUTH_STATES)
    /**
     * 로그인 이용자 조회 — 이용자 그룹이고 인증 통과 상태(ACTIVE · BLOCK · LEAVE_WAIT — USER_AUTH_STATES)이며 회원 설정이 있는 회원만.
     * 이용자 그룹은 is_login_allowed 대신 상태 목록으로 거른다 — 이용 제한(BLOCK)도 로그인한다(사용자 결정 2026-11-09).
     …
     */
    buildLoginUserQuery(user_id: string): SelectQueryBuilder<UserEntity> {
        return this.users
            // … select · join 그대로
            .where('u.user_id = :user_id', {user_id})
            .andWhere('u.login_scope = :login_scope', {login_scope: LOGIN_SCOPE.USER})
            .andWhere('u.state_id IN (:...states)', {states: USER_AUTH_STATES});
    }
```

### D. user-service — 예약 · 연장 막기

```ts
// apps/user-service/src/reservation/reservation.constants.ts — 추가
/** 탈퇴 신청 중인 이용자의 예약 · 연장 — 정지 회원이 탈퇴 신청으로 제한을 피하지 못하게(사용자 결정 2026-11-09) */
export const RESERVATION_MEMBER_LEAVING_MESSAGE = '탈퇴 신청 중에는 예약할 수 없습니다.';

/** 예약할 수 있는 회원 상태 · 이용 제한 상태 */
export const RESERVATION_MEMBER_STATE = {ACTIVE: 'ACTIVE', BLOCK: 'BLOCK'} as const;
```

```ts
// apps/user-service/src/reservation/reservation.util.ts — 추가 (import BLOCKED_ACCOUNT_MESSAGE · USER_NOT_FOUND_MESSAGE from '@app/account/account.constants.js')
/**
 * 예약 · 연장할 수 있는 회원인가 — 정상(ACTIVE)만. 이용 제한(BLOCK)은 '이용이 제한된 계정입니다.', 그 밖(탈퇴 대기)은 탈퇴 문구(사용자 결정 2026-11-09).
 *
 * @param state_id 회원 상태(없는 회원 null)
 * @returns 못 하는 사유 또는 null
 */
export function judgeReservationMember(state_id: string | null): string | null {
    if (state_id === null) {
        return USER_NOT_FOUND_MESSAGE;
    }
    if (state_id === RESERVATION_MEMBER_STATE.ACTIVE) {
        return null;
    }
    if (state_id === RESERVATION_MEMBER_STATE.BLOCK) {
        return BLOCKED_ACCOUNT_MESSAGE;
    }
    return RESERVATION_MEMBER_LEAVING_MESSAGE;
}

// ExtensionContext 에 필드 추가(맨 앞)
    member_state_id: string | null;

// judgeExtension — 맨 앞 판정(조회의 reason · 신청의 400 이 같은 문구)
export function judgeExtension(ctx: ExtensionContext): string | null {
    const member = judgeReservationMember(ctx.member_state_id);
    if (member) {
        return member;
    }
    const state = ctx.reservation.reservation_state_id;
    // … 이하 그대로
```

```ts
// apps/user-service/src/reservation/interfaces/reservation.repository.interface.ts — 추가(findReservationStore 앞)
    /** 예약하는 회원 (t_user — 이용 제한 · 탈퇴 대기 판정) */
    findReservationUser(where: FindOptionsWhere<UserEntity>): Promise<UserEntity | null>;

// apps/user-service/src/reservation/repositories/reservation.repository.ts — getter · 메서드 추가
    /** t_user */
    private get users(): Repository<UserEntity> {
        return this.txHost.tx.getRepository(UserEntity);
    }

    /**
     * 예약하는 회원 — 이용 제한 · 탈퇴 대기 판정(t_user 는 is_deleted 가 없다)
     *
     * @param where 조회 조건
     * @returns 회원 또는 null
     */
    async findReservationUser(where: FindOptionsWhere<UserEntity>): Promise<UserEntity | null> {
        try {
            return await this.users.findOne({where, loadRelationIds: true});
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }
```

```ts
// apps/user-service/src/reservation/reservation.service.ts — createReservation 맨 앞
    async createReservation(user_id: string, dto: ReservationDto): Promise<ReservationResultDto> {
        // 0. 예약할 수 있는 회원 — 이용 제한 · 탈퇴 대기는 400(쓰기 없음, 사용자 결정 2026-11-09)
        const member = await this.reservationRepository.findReservationUser({user_id});
        const memberReason = judgeReservationMember(member?.state_id ?? null);
        if (memberReason) {
            throw new BadRequestException({message: memberReason});
        }

        // 1. 날짜 · 지금 바로(시간 이용 · 오늘만) — 그대로
        …

// getExtension · requestExtension — 2. 재료에 회원 상태 추가, judgeExtension 에 member_state_id
        const member = await this.reservationRepository.findReservationUser({user_id});
        …
        const reason = judgeExtension({
            member_state_id: member?.state_id ?? null,
            now,
            reservation,
            …
        });
```

### E. gateway

```ts
// apps/gateway/src/api/v1/admin-service/user/controllers/user.controller.ts — 새 파일
import {Controller, Get, HttpCode, Param, Query, UseGuards} from '@nestjs/common';
import {ApiBadRequestResponse, ApiBearerAuth, ApiInternalServerErrorResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiServiceUnavailableResponse, ApiTags, ApiUnauthorizedResponse} from '@nestjs/swagger';
import {ApiFailResultDto} from '@app/common/dto/global.result.dto.js';
import type {Actor} from '@app/contracts/actor.js';
import {UserDetailParamDto, UserDetailResultDto} from '@app/contracts/user/dto/user-detail.dto.js';
import {UserListDto, UserListResultDto} from '@app/contracts/user/dto/user-list.dto.js';
import {UserReservationListDto, UserReservationListParamDto, UserReservationListResultDto} from '@app/contracts/user/dto/user-reservation-list.dto.js';
import {USER_ADMIN_INTERNAL_PATH} from '@app/contracts/user/user.commands.js';
import {PassportActor} from '../../../../../guards/passport.jwt.auth/passport.jwt.auth.decorator.js';
import {PassportJwtAdminAuthGuard} from '../../../../../guards/passport.jwt.auth/passport.jwt.admin.guard.js';
import {InternalHttpClient} from '../../../../../modules/transport/internal-http.client.js';

/**
 * 이용자 관리 공개 API (총관리자 · 관리자) — 동기 경로(내부 HTTP → admin-service user). 쓰기(이용 제한 · 해제)는 user.controller.queue.ts.
 * 이용자 본인 API 는 /api/v1/user-service/user 다.
 */
@ApiTags('이용자 관리')
@Controller('/api/v1/admin-service/user')
export class UserController {
    /**
     * @param internalHttp 내부 HTTP 클라이언트
     */
    constructor(private readonly internalHttp: InternalHttpClient) {}

    /**
     * 이용자 목록 — 검색어(이름 · 닉네임 · 휴대폰 번호 · 회원 식별 코드) · 상태 · SNS, 가입 최신순
     */
    @Get('/')
    @UseGuards(PassportJwtAdminAuthGuard)
    @HttpCode(200)
    @ApiBearerAuth()
    @ApiOperation({summary: '이용자 목록'})
    @ApiOkResponse({type: UserListResultDto})
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async getUserList(@PassportActor() actor: Actor, @Query() query: UserListDto): Promise<UserListResultDto> {
        const dto = new UserListDto(query);
        return this.internalHttp.request<UserListResultDto>('admin', 'GET', USER_ADMIN_INTERNAL_PATH.LIST, {actor, query: dto});
    }

    /**
     * 이용자 상세 — 회원 정보 · 이용 제한 사유 · 예약 건수 요약
     */
    @Get('/:user_id')
    @UseGuards(PassportJwtAdminAuthGuard)
    @HttpCode(200)
    @ApiBearerAuth()
    @ApiOperation({summary: '이용자 상세'})
    @ApiOkResponse({type: UserDetailResultDto})
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async getUser(@PassportActor() actor: Actor, @Param() param: UserDetailParamDto): Promise<UserDetailResultDto> {
        return this.internalHttp.request<UserDetailResultDto>('admin', 'GET', USER_ADMIN_INTERNAL_PATH.detail(param.user_id), {actor});
    }

    /**
     * 이용자 예약 이력 — 결제 대기 만료 제외, 이용 시작 최신순
     */
    @Get('/:user_id/reservation')
    @UseGuards(PassportJwtAdminAuthGuard)
    @HttpCode(200)
    @ApiBearerAuth()
    @ApiOperation({summary: '이용자 예약 이력'})
    @ApiOkResponse({type: UserReservationListResultDto})
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async getUserReservations(@PassportActor() actor: Actor, @Param() param: UserReservationListParamDto, @Query() query: UserReservationListDto): Promise<UserReservationListResultDto> {
        const dto = new UserReservationListDto(query);
        return this.internalHttp.request<UserReservationListResultDto>('admin', 'GET', USER_ADMIN_INTERNAL_PATH.reservations(param.user_id), {actor, query: dto});
    }
}
```

```ts
// apps/gateway/src/api/v1/admin-service/user/controllers/user.controller.queue.ts — 새 파일
import {Body, Controller, Ip, Param, Patch, Res, UseGuards} from '@nestjs/common';
import {ApiBadRequestResponse, ApiBearerAuth, ApiBody, ApiInternalServerErrorResponse, ApiNotFoundResponse, ApiOperation, ApiProduces, ApiServiceUnavailableResponse, ApiTags, ApiUnauthorizedResponse} from '@nestjs/swagger';
import type {Response} from 'express';
import {ApiFailResultDto} from '@app/common/dto/global.result.dto.js';
import type {Actor} from '@app/contracts/actor.js';
import {UserStateDto, UserStateParamDto} from '@app/contracts/user/dto/user-state.dto.js';
import {USER_ADMIN_COMMAND} from '@app/contracts/user/user.commands.js';
import {PassportActor} from '../../../../../guards/passport.jwt.auth/passport.jwt.auth.decorator.js';
import {PassportJwtAdminAuthGuard} from '../../../../../guards/passport.jwt.auth/passport.jwt.admin.guard.js';
import {CommandStreamService} from '../../../../../modules/transport/command-stream.service.js';

/**
 * 이용자 관리 공개 API (총관리자 · 관리자) — 큐 경로(RabbitMQ `admin.user.*` → admin-service + 요청 단위 SSE). path param 은 payload 에 합쳐 보낸다.
 */
@ApiTags('이용자 관리')
@Controller('/api/v1/admin-service/user')
export class UserQueueController {
    /**
     * @param commandStream 명령 발행 + 요청 단위 SSE
     */
    constructor(private readonly commandStream: CommandStreamService) {}

    /**
     * 이용자 이용 제한 · 해제 — 정상 ↔ 이용 제한만. 이용 제한 이용자는 로그인 · 기존 예약 이용은 되고 새 예약 · 연장만 막힌다. done 의 data 는 null.
     */
    @Patch('/:user_id/state')
    @UseGuards(PassportJwtAdminAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({summary: '이용자 이용 제한 · 해제'})
    @ApiBody({type: UserStateDto})
    @ApiProduces('text/event-stream')
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async changeUserState(@PassportActor() actor: Actor, @Param() param: UserStateParamDto, @Body() dto: UserStateDto, @Ip() ip: string, @Res() res: Response): Promise<void> {
        await this.commandStream.dispatch(res, {type: USER_ADMIN_COMMAND.STATE, actor, payload: {...param, ...dto}, client_ip: ip});
    }
}
```

```ts
// apps/gateway/src/api/v1/admin-service/user/user.module.ts — 새 파일
import {Module} from '@nestjs/common';
import {UserController} from './controllers/user.controller.js';
import {UserQueueController} from './controllers/user.controller.queue.js';

/**
 * 게이트웨이 이용자 관리 라우트(총관리자 · 관리자) — `/api/v1/admin-service/user`. 전달 수단(TransportModule)은 전역이다.
 * - UserController(controllers/user.controller.ts): 동기 경로 — 목록 · 상세 · 예약 이력
 * - UserQueueController(controllers/user.controller.queue.ts): 큐 경로 — 이용 제한 · 해제
 * 이용자 본인 라우트(/api/v1/user-service/user)는 user-service/user/user.module.ts — 루트 모듈은 이 모듈을 AdminUserModule 로 들인다.
 */
@Module({controllers: [UserController, UserQueueController]})
export class UserModule {}
```

```ts
// apps/gateway/src/gateway.module.ts — import · imports 추가, 주석의 라우트 목록에 "AdminUserModule(/api/v1/admin-service/user — 관리자 가드)"
import {UserModule as AdminUserModule} from './api/v1/admin-service/user/user.module.js';
// imports: […, AdminUserModule]
```

```ts
// apps/gateway/src/api/v1/admin-service/manager/controllers/manager.controller.ts — import 추가(PassportJwtAdminAuthGuard, 업체 관리자 DTO 2), 메서드 2 추가
    /**
     * 업체 관리자 목록 (총관리자 · 관리자) — 전체 업체의 업체 총관리자 · 업체 관리자, 업체 · 권한 · 상태 · 검색어(상호명 · 업체코드 · 아이디 · 이름 · 휴대폰)
     */
    @Get('/account')
    @UseGuards(PassportJwtAdminAuthGuard)
    @HttpCode(200)
    @ApiBearerAuth()
    @ApiOperation({summary: '업체 관리자 목록 (관리자)'})
    @ApiOkResponse({type: ManagerAccountListResultDto})
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async getAccountList(@PassportActor() actor: Actor, @Query() query: ManagerAccountListDto): Promise<ManagerAccountListResultDto> {
        const dto = new ManagerAccountListDto(query);
        return this.internalHttp.request<ManagerAccountListResultDto>('admin', 'GET', MANAGER_INTERNAL_PATH.ACCOUNT_LIST, {actor, query: dto});
    }

    /**
     * 업체 관리자 상세 (총관리자 · 관리자)
     */
    @Get('/account/:user_id')
    @UseGuards(PassportJwtAdminAuthGuard)
    @HttpCode(200)
    @ApiBearerAuth()
    @ApiOperation({summary: '업체 관리자 상세 (관리자)'})
    @ApiOkResponse({type: ManagerAccountDetailResultDto})
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async getAccount(@PassportActor() actor: Actor, @Param() param: ManagerAccountDetailParamDto): Promise<ManagerAccountDetailResultDto> {
        return this.internalHttp.request<ManagerAccountDetailResultDto>('admin', 'GET', MANAGER_INTERNAL_PATH.account(param.user_id), {actor});
    }
```

```ts
// apps/gateway/src/api/v1/admin-service/manager/controllers/manager.controller.queue.ts — import 추가(PassportJwtAdminAuthGuard, ManagerAccountPasswordResetParamDto), 메서드 추가
    /**
     * 업체 관리자 비밀번호 초기화 (총관리자 · 관리자) — 임시 비밀번호는 그 계정 휴대폰으로 SMS. 휴대폰 없음 · 탈퇴 업체 계정은 400. done 의 data 는 null.
     */
    @Patch('/account/:user_id/password-reset')
    @UseGuards(PassportJwtAdminAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({summary: '업체 관리자 비밀번호 초기화 (관리자)'})
    @ApiProduces('text/event-stream')
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async resetAccountPassword(@PassportActor() actor: Actor, @Param() param: ManagerAccountPasswordResetParamDto, @Ip() ip: string, @Res() res: Response): Promise<void> {
        await this.commandStream.dispatch(res, {type: MANAGER_COMMAND.ACCOUNT_PASSWORD_RESET, actor, payload: param, client_ip: ip});
    }
```

### F. 문서

- README: admin-service 설명에 이용자 관리(목록 · 상세 · 예약 이력 · 이용 제한 · 해제 — `/api/v1/admin-service/user`)와 업체 관리자 관리(목록 · 상세 · 비밀번호 초기화 — `/api/v1/admin-service/manager/account`), user-service 설명에 이용 제한 이용자(로그인 · 재발급 · 기존 예약 이용 가능 · 새 예약 · 연장 불가 · 로그인 결과 `state_id` · `block_comment`), gateway 공개 경로 목록에 `/api/v1/admin-service/user`.
- AGENTS.md: Architecture 트리(admin-service `user/` 새 도메인 · manager 설명 · gateway admin-service 라우트 목록 `{manager,admin,store,room,reservation,user}`), Auth(이용자 그룹 BLOCK 은 로그인 가능 — 상태 목록, 매니저 · 관리자 BLOCK 은 로그인 불가), Testing Smoke 목록(admin-service user.repository · manager 업체 관리자 쿼리 · user-service `buildLoginUserQuery` 상태 목록).
- docs/architecture.md: admin-service 도메인 표에 user, 도메인은 기능 대상별(메모리 규칙 — ship 때 정식 반영 제안).
- docs/testing.md: Smoke 목록 갱신.

---

## Test Cases

```
[CASES:member-state] 로그인 ACTIVE → 토큰 발급, 결과 state_id 'ACTIVE' · block_comment null
[CASES:member-state] 로그인 BLOCK(사유 '부정 이용') → 토큰 발급(403 아님), 결과 state_id 'BLOCK' · block_comment '부정 이용'
[CASES:member-state] 로그인 LEAVE_WAIT · LEAVE → 404(조회 조건 state_id IN (ACTIVE, BLOCK) — 지금 그대로)
[CASES:member-state] 재발급 ACTIVE · BLOCK → 새 토큰
[CASES:member-state] 재발급 LEAVE_WAIT · LEAVE → 401 + refresh 만료 1분 단축
[CASES:member-state] 인증 확인 조건 = state_id IN (ACTIVE, BLOCK, LEAVE_WAIT)(Smoke — BLOCK 포함 · LEAVE 제외, is_login_allowed 조건 없음)
[CASES:member-state] 예약 ACTIVE → 진행 / BLOCK → 400 '이용이 제한된 계정입니다.' · 쓰기 없음 / LEAVE_WAIT → 400 '탈퇴 신청 중에는 예약할 수 없습니다.' · 쓰기 없음
[CASES:member-state] 연장 신청 BLOCK → 400 '이용이 제한된 계정입니다.' · 쓰기 없음, 연장 조회 BLOCK → is_extendable 0 · reason '이용이 제한된 계정입니다.'
[CASES:member-state] 관리자 이용 제한 ACTIVE → BLOCK(사유 저장) / 해제 BLOCK → ACTIVE(사유 null)
[CASES:member-state] 관리자 같은 상태 → 400 '이미 같은 상태입니다.' / LEAVE_WAIT · LEAVE → 400 '탈퇴 대기 · 탈퇴 회원은 상태를 바꿀 수 없습니다.' · 쓰기 없음
[CASES:reservation-summary] 행 없음 → {total: 0, in_progress: 0, completed: 0, canceled: 0}
[CASES:reservation-summary] EXPIRED 3건만 → 모두 0
[CASES:reservation-summary] PENDING 1 · CONFIRMED 2 · CHECKED_IN 1 → {total: 4, in_progress: 4, completed: 0, canceled: 0}
[CASES:reservation-summary] COMPLETED 5 · CANCELED 2 · EXPIRED 4 · CONFIRMED 1 → {total: 8, in_progress: 1, completed: 5, canceled: 2}
[CASES:reservation-summary] 건수가 문자열('3' — PostgreSQL count) → 숫자 3 으로
[FAIL:validation] 이용자 목록 state_id 허용값 밖 · sns_id 허용값 밖 · keyword 100자 초과 → 각 필드 오류
[FAIL:validation] 이용 제한 state_id 허용값 밖(LEAVE) · block_comment 255자 초과 · user_id 32자 hex 아님 → 각 필드 오류
[FAIL:validation] 업체 관리자 목록 auth_id 허용값 밖 · state_id 허용값 밖 · store_id 32자 hex 아님 → 각 필드 오류
```

프로젝트 형태(spec 위치 · 단언):
- `apps/user-service/src/user/test/user-login.spec.ts` — `[CASES:member-state]` 로그인 3줄(BLOCK 403 케이스를 토큰 발급으로 바꾼다, 결과 `state_id` · `block_comment` 단언, 조회 조건 `In(['ACTIVE', 'BLOCK'])`).
- `apps/user-service/src/user/test/user-token-refresh.spec.ts` — 재발급 2줄(정지 회원 401 케이스를 성공으로, LEAVE_WAIT · LEAVE 는 401 + 만료 단축 그대로).
- `apps/user-service/src/user/test/user.repository.spec.ts` — `[SMOKE:data-access]` `buildLoginUserQuery` SQL 갱신(`"u"."state_id" IN ($3, $4, $5)` · 파라미터 `ACTIVE` · `BLOCK` · `LEAVE_WAIT`).
- `apps/user-service/src/reservation/test/reservation-create.spec.ts` — 예약 3줄(`findReservationUser({user_id})` 인자, BLOCK · LEAVE_WAIT 는 findReservationStore · insertPayment · insertReservation 미호출). 도우미 `createReservationRepositoryMock` 에 `findReservationUser` 기본 ACTIVE 회원.
- `apps/user-service/src/reservation/test/reservation-extend.spec.ts` · `reservation-extension.spec.ts` — 연장 2줄(신청 400 · 쓰기 없음, 조회 reason). extension spec 의 `arrange` 에 member 상태.
- `apps/admin-service/src/user/test/user-state.spec.ts`(새, 큐 경로) — 관리자 2줄(`updateUser` 조건 `{user_id, login_scope: 'USER', state_id: 지금}` · 엔티티 `toBeInstanceOf(UserEntity)` · `block_comment`), `[FAIL:service]` 404(이용자 아님 · 매니저 회원 ID) · 상태 조건 0행 → 400 '회원 상태가 바뀌었습니다. 다시 확인해주세요.', `[FAIL:validation]` 이용 제한 줄, `[SECURITY]` 아님(관리자 가드는 게이트웨이 — 내부 토큰은 동기 spec 에서).
- `apps/admin-service/src/user/test/user-detail.spec.ts`(새, 동기 경로) — `[CASES:reservation-summary]` 5줄(`findReservationCounts` 반환 → 응답 `reservation_summary`), 응답 모양(phone null · phone_verified_at · leave_reserved_at), 404(없음 · 매니저 그룹 회원 — 조건 `{user_id, login_scope: 'USER'}`), `[FAIL:validation]` user_id, 내부 토큰 없음 403.
- `apps/admin-service/src/user/test/user-list.spec.ts`(새, 동기) — `countUsers` · `findUserList` where(필터 없음 `[{login_scope: 'USER'}]`, 상태 · SNS · 검색어 4개 OR · `%` 이스케이프), 기본 페이지, 항목 `is_phone_verified`, `[FAIL:validation]` 목록 줄.
- `apps/admin-service/src/user/test/user-reservation-list.spec.ts`(새, 동기) — 404 이면 count · 목록 미호출, `countUserReservations({user_id, reservation_state_id: Not('EXPIRED')})`, count → 페이지 → 목록 순서 · 인자(limit · offset), 항목 시각 ISO · total_price 숫자.
- `apps/admin-service/src/user/test/user.repository.spec.ts`(새) — 통일 500(각 메서드), `updateUser` 1행 true · 0행 false, `[SMOKE:data-access]` `buildUserListQuery`(검색 OR 4 · 상태 · SNS · ORDER BY created_at DESC · LIMIT/OFFSET) · `buildReservationCountsQuery`(GROUP BY · 별칭) · `buildUserReservationsQuery`(조인 5 · 별칭 15 · EXPIRED 제외) · `countUserReservations`(count spy — `Not`) · `updateUser`(update spy — 관계 컬럼 상태 조건).
- `apps/admin-service/src/manager/test/manager-account-list.spec.ts`(새, 동기) — `countAccounts` · `findAccountRows` 의 필터(빈 값 null · 모든 필터), 페이지 인자, 항목(업체 필드 · phone null · created_at ISO), `[FAIL:validation]` 업체 관리자 목록 줄.
- `apps/admin-service/src/manager/test/manager-account-detail.spec.ts`(새, 동기) — `findAccountRow(user_id)` → 상세(gender · birth · block_comment), 없음 404 '업체 관리자를 찾을 수 없습니다.'
- `apps/admin-service/src/manager/test/manager-account-password-reset.spec.ts`(새, 큐) — `[SUCCESS]` updateManager({user_id}, login_pw bcrypt · 변경 필요 1) → sms.send(임시 비밀번호 문구) 마지막, 정지 계정도 초기화, `[FAIL:service]` 없음 404 · 탈퇴 업체 400 · 휴대폰 없음 400(updateManager · sms 미호출), `[FAIL:external]` sms 503 → requeue, `[FAIL:validation]` user_id.
- `apps/admin-service/src/manager/test/manager.repository.spec.ts` — 통일 500(countAccounts · findAccountRows · findAccountRow), `[SMOKE:data-access]` `buildAccountQuery` 필터 없음 · 모든 필터 + 검색어(괄호 OR 5 · 파라미터 이스케이프) SQL 고정 · 별칭 = ManagerAccountRow 키.
- `apps/admin-service/src/manager/test/manager.test-helper.ts` — mock 에 새 메서드 3, `manager-staff-password-reset.spec.ts` 문구 그대로(상수로 옮겨도 값 같음).

테스트 생략(위임형): 게이트웨이 라우트 · 모듈 등록(admin-service 루트 · 게이트웨이 루트) · contracts 경로 상수 — 프로젝트 규칙상 gateway · controller spec 을 두지 않는다. 이용자 · 업체 관리자 상세의 필드 매핑은 service spec 의 응답 단언이 함께 본다.

---

## Response Codes

| Entry | 200 / done | 400 | 401 | 404 | 503 | 500 |
|---|---|---|---|---|---|---|
| GET /api/v1/admin-service/user | 목록 | 검증 | 관리자 아님 | — | 내부 HTTP | DB |
| GET /api/v1/admin-service/user/:user_id | 상세 + 요약 | 검증 | 관리자 아님 | 이용자 아님 | 내부 HTTP | DB |
| GET /api/v1/admin-service/user/:user_id/reservation | 이력 | 검증 | 관리자 아님 | 이용자 아님 | 내부 HTTP | DB |
| PATCH /api/v1/admin-service/user/:user_id/state (SSE) | done null | 검증 · 같은 상태 · 탈퇴 대기 · 탈퇴 · 상태 바뀜 | 관리자 아님 | 이용자 아님 | 브로커 | DB |
| GET /api/v1/admin-service/manager/account | 목록 | 검증 | 관리자 아님 | — | 내부 HTTP | DB |
| GET /api/v1/admin-service/manager/account/:user_id | 상세 | 검증 | 관리자 아님 | 업체 관리자 아님 | 내부 HTTP | DB |
| PATCH /api/v1/admin-service/manager/account/:user_id/password-reset (SSE) | done null | 검증 · 탈퇴 업체 · 휴대폰 없음 | 관리자 아님 | 업체 관리자 아님 | SMS · 브로커 | DB |
| POST /api/v1/user-service/user/login | 토큰 + state_id · block_comment(BLOCK 도 200) | 검증 | — | 없는 계정 · 탈퇴 대기 · 탈퇴 | — | DB |
| POST /api/v1/user-service/user/token-refresh | 새 토큰(ACTIVE · BLOCK) | 검증 | 토큰 · 탈퇴 대기 · 탈퇴 | — | — | DB |
| POST /api/v1/user-service/reservation (SSE) | 기존 | + 이용 제한 · 탈퇴 대기 | — | — | — | — |
| GET · POST …/reservation/:reservation_id/extension | 기존(조회 reason) | + 이용 제한 · 탈퇴 대기(신청) | — | — | — | — |
