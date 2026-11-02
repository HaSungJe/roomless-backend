import {Global, Module} from '@nestjs/common';
import {PAYMENT_GATEWAY} from '../integration.symbols.js';
import {TossPaymentGateway} from './toss-payment.gateway.js';

/**
 * 결제 포트(PAYMENT_GATEWAY) — 토스페이먼츠(조회 검증 · 환불, 승인은 프론트).
 * 결제를 다루는 앱의 루트 모듈에서 import 한다(전역 — 도메인 모듈은 import 없이 `@Inject(PAYMENT_GATEWAY)` 로 주입받는다). 첫 사용은 Phase 17(user-service 예약).
 */
@Global()
@Module({providers: [{provide: PAYMENT_GATEWAY, useClass: TossPaymentGateway}], exports: [PAYMENT_GATEWAY]})
export class PaymentModule {}
