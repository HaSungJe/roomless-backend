import {Global, Module} from '@nestjs/common';
import {STORAGE_GATEWAY} from '../integration.symbols.js';
import {S3StorageGateway} from './s3-storage.gateway.js';

/**
 * 파일 저장소 포트(STORAGE_GATEWAY) — Amazon S3.
 * 파일을 다루는 앱의 루트 모듈에서 import 한다(전역 — 도메인 모듈은 import 없이 `@Inject(STORAGE_GATEWAY)` 로 주입받는다).
 */
@Global()
@Module({providers: [{provide: STORAGE_GATEWAY, useClass: S3StorageGateway}], exports: [STORAGE_GATEWAY]})
export class StorageModule {}
