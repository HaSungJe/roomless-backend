import {Module} from '@nestjs/common';
import {ManagerController} from './controllers/manager.controller.js';
import {ManagerQueueController} from './controllers/manager.controller.queue.js';

/**
 * 게이트웨이 매니저 그룹(총매니저 · 매니저) 라우트 — `/api/v1/admin-service/manager`. 전달 수단(TransportModule)은 전역이다.
 * - ManagerController(controllers/manager.controller.ts): 동기 경로 — 로그인 · 토큰 재발급 · 업체 관리자 목록 · 상세
 * - ManagerQueueController(controllers/manager.controller.queue.ts): 큐 경로 — 비밀번호 변경 · 아이디 찾기 · 비밀번호 초기화 · 업체 관리자 등록 · 수정 · 비밀번호 초기화 · 정지 · 해제 · 삭제
 * 업체 관리자 라우트는 매니저 가드 + RolesGuard · @Roles(HEAD_MANAGER) — 업체 총관리자만.
 */
@Module({controllers: [ManagerController, ManagerQueueController]})
export class ManagerModule {}
