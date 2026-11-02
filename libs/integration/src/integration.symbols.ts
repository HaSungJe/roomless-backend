/** SMS 발송 포트 — 구현: SnsSmsSender (Amazon SNS) */
export const SMS_SENDER = Symbol('SmsSenderInterface');

/** 파일 저장소 포트 — 구현: S3StorageGateway (Amazon S3) */
export const STORAGE_GATEWAY = Symbol('StorageGatewayInterface');

/** 문 정보 포트 — 구현: RedisDoorStore (Redis) */
export const DOOR_STORE = Symbol('DoorStoreInterface');

/** 결제 포트 — 구현: TossPaymentGateway (토스페이먼츠) */
export const PAYMENT_GATEWAY = Symbol('PaymentGatewayInterface');
