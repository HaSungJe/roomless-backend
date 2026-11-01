/** AWS 가 SMS 를 접수하지 못했을 때 — 503, 큐 경로에서는 재시도된다 */
export const SMS_UNAVAILABLE_MESSAGE = 'SMS를 보내지 못했습니다. 잠시 후 다시 시도해주세요.';

/** 파일 저장소(S3)에 닿지 못했을 때 — 503 */
export const STORAGE_UNAVAILABLE_MESSAGE = '파일 저장소에 연결할 수 없습니다. 잠시 후 다시 시도해주세요.';

/** AWS_S3_PUBLIC_URL 이 비어 공개 주소를 만들 수 없을 때 — 500 */
export const STORAGE_PUBLIC_URL_MISSING_MESSAGE = '설정된 파일 공개 주소가 없습니다. 관리자에게 문의해주세요.';

/** 업로드 주소(presigned URL)의 유효 시간(초) */
export const STORAGE_UPLOAD_URL_TTL_SECONDS = 600;

/** 비공개 파일 열람 주소(presigned GET)의 유효 시간(초) */
export const STORAGE_DOWNLOAD_URL_TTL_SECONDS = 600;

/** Redis(상태 저장소)에 닿지 못했을 때 — 503 */
export const REDIS_UNAVAILABLE_MESSAGE = '상태 저장소에 연결할 수 없습니다. 잠시 후 다시 시도해주세요.';

/** 새 QR 을 겹치지 않게 발급하지 못했을 때 — 500 (32자 무작위라 사실상 일어나지 않는다) */
export const DOOR_QR_ISSUE_FAILED_MESSAGE = 'QR 정보를 발급하지 못했습니다. 관리자에게 문의해주세요.';

/** 문 상태 — open: 열림, close: 닫힘 (Redis 문 정보의 상태 칸) */
export const DOOR_STATE = {OPEN: 'open', CLOSE: 'close'} as const;

/** 한 번도 열거나 닫은 적 없는 문의 시각 */
export const DOOR_TIME_NONE = '00000000000000';

/** 새 QR 을 겹치지 않게 잡는 최대 시도 횟수 */
export const DOOR_QR_ISSUE_ATTEMPTS = 3;
