/** SMS 발송 포트 — 구현: SnsSmsSender (Amazon SNS) */
export const SMS_SENDER = Symbol('SmsSenderInterface');

/** 파일 저장소 포트 — 구현: S3StorageGateway (Amazon S3) */
export const STORAGE_GATEWAY = Symbol('StorageGatewayInterface');
