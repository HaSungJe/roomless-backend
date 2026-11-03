import {Global, Module} from '@nestjs/common';
import {PAYMENT_GATEWAY} from '../integration.symbols.js';
import {TossPaymentGateway} from './toss-payment.gateway.js';

/**
 * 결제 포트(PAYMENT_GATEWAY) — 토스페이먼츠(조회 검증 · 환불, 승인은 프론트).
 * 결제를 다루는 앱의 루트 모듈에서 import 한다(전역 — 도메인 모듈은 import 없이 `@Inject(PAYMENT_GATEWAY)` 로 주입받는다). 사용: user-service(예약 · 결제 확인 · 취소) · scheduler(결제 대기 만료 · 환불 crontab).
 */
@Global()
@Module({providers: [{provide: PAYMENT_GATEWAY, useClass: TossPaymentGateway}], exports: [PAYMENT_GATEWAY]})
export class PaymentModule {}
