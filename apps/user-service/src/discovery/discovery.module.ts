import {Module} from '@nestjs/common';
import {DiscoveryController} from './controllers/discovery.controller.js';
import {DiscoveryRepository} from './repositories/discovery.repository.js';
import {DiscoveryService} from './discovery.service.js';
import {DISCOVERY_REPOSITORY} from './discovery.symbols.js';

/**
 * 업체 둘러보기 도메인 — 이용자가 로그인 없이 업체를 찾는다(조회만 — 큐 경로 없음). 파일 저장소 포트(STORAGE_GATEWAY — 공개 주소)는 루트 모듈의 StorageModule 이 전역으로 준다.
 * - DiscoveryController(controllers/discovery.controller.ts): 내부 HTTP — 반경 업체 · 업체 상세 · 객실 그룹 목록
 */
@Module({controllers: [DiscoveryController], providers: [DiscoveryService, {provide: DISCOVERY_REPOSITORY, useClass: DiscoveryRepository}]})
export class DiscoveryModule {}
