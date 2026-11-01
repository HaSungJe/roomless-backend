/** SMS 1통 */
export interface SmsMessage {
    /** 받는 번호 — 국내 휴대폰 번호 (예: 01012345678, 010-1234-5678) */
    to: string;
    /** 본문 — 한글은 70자 단위로 나뉘어 건마다 과금된다 */
    text: string;
}

/**
 * SMS 발송 포트 — 서비스의 모든 발송이 이 포트 하나로 나간다(이메일 · 알림톡 · 푸시 없음).
 * 휴대폰 인증 · 아이디 찾기 · 비밀번호 초기화 · 업체 계정 안내 · 예약 변경 안내 · 입장 QR 링크.
 */
export interface SmsSenderInterface {
    /**
     * SMS 1통을 보낸다. AWS 가 접수하면 끝난다(휴대폰 도착은 기다리지 않는다).
     *
     * @throws ServiceUnavailableException `{message: SMS_UNAVAILABLE_MESSAGE}` — AWS 가 접수하지 못했을 때
     */
    send(message: SmsMessage): Promise<void>;
}

/** 업로드 주소 요청 */
export interface StorageUploadInput {
    /** 저장 키 — 예: `store/<store_id>/<uuid>.jpg` (키 규칙은 쓰는 도메인의 util 이 만든다) */
    key: string;
    /** 올릴 파일의 MIME 타입 (예: image/jpeg) — 서명 헤더에 들어가 다른 타입으로는 올릴 수 없다 */
    content_type: string;
}

/** 업로드 주소 */
export interface StorageUploadResult {
    /** 클라이언트가 파일을 PUT 으로 올릴 주소 (STORAGE_UPLOAD_URL_TTL_SECONDS 동안 유효, 같은 Content-Type 헤더로 올린다) */
    upload_url: string;
    /** upload_url 이 만료되는 시각 */
    expires_at: Date;
}

/** 열람 주소 */
export interface StorageDownloadResult {
    /** 비공개 파일을 GET 으로 볼 주소 (STORAGE_DOWNLOAD_URL_TTL_SECONDS 동안 유효) */
    download_url: string;
    /** download_url 이 만료되는 시각 */
    expires_at: Date;
}

/**
 * 파일 저장소 포트 — 공개 파일(업체 · 객실 그룹 사진 — CDN 공개 주소)과 비공개 파일(사업자등록증 — private/, 서명된 열람 주소).
 * 파일 본문은 서버를 거치지 않는다. 클라이언트가 createUploadUrl 의 주소로 직접 올리고, 등록 명령에는 키만 보낸다.
 */
export interface StorageGatewayInterface {
    /**
     * 키 하나에 쓸 1회용 업로드 주소를 발급한다.
     *
     * @throws ServiceUnavailableException `{message: STORAGE_UNAVAILABLE_MESSAGE}` — 저장소에 닿지 못했을 때
     */
    createUploadUrl(input: StorageUploadInput): Promise<StorageUploadResult>;

    /**
     * 클라이언트가 그 키로 실제로 올렸는지 확인한다 — 사진 등록 명령에서 저장 전에 부른다.
     *
     * @throws ServiceUnavailableException `{message: STORAGE_UNAVAILABLE_MESSAGE}` — 저장소에 닿지 못했을 때
     */
    exists(key: string): Promise<boolean>;

    /**
     * 화면에 보일 공개 주소 — 저장소에 묻지 않고 키로 만든다.
     *
     * @throws InternalServerErrorException `{message: STORAGE_PUBLIC_URL_MISSING_MESSAGE}` — 설정된 공개 주소가 없을 때
     */
    getPublicUrl(key: string): string;

    /**
     * 비공개 파일(private/ 접두 — CDN · 공개 읽기 밖)을 잠깐 볼 수 있는 열람 주소를 발급한다(presigned GET).
     *
     * @throws ServiceUnavailableException `{message: STORAGE_UNAVAILABLE_MESSAGE}` — 서명하지 못했을 때
     */
    createDownloadUrl(key: string): Promise<StorageDownloadResult>;

    /**
     * 파일을 지운다. 없는 키여도 실패하지 않는다.
     *
     * @throws ServiceUnavailableException `{message: STORAGE_UNAVAILABLE_MESSAGE}` — 저장소에 닿지 못했을 때
     */
    remove(key: string): Promise<void>;
}

/** 문 상태 — DOOR_STATE 값 */
export type DoorState = 'open' | 'close';

/** 호실 문 1개의 정보 — Redis `door:<room_id>` 의 값 `QR:상태:시각` */
export interface DoorRecord {
    /** 지금 유효한 QR 정보 — 아직 발급하지 않았으면 null */
    qr: string | null;
    /** 문 상태 */
    state: DoorState;
    /** 마지막으로 열거나 닫은 시각 — 한국 시각 yyyyMMddHHmmss, 기록이 없으면 DOOR_TIME_NONE */
    changed_at: string;
}

/**
 * 문 정보 포트 — 호실 문마다 QR 정보 · 열림/닫힘 · 마지막 시각을 둔다(Redis). QR 은 두 문에 겹치지 않는다.
 * 서버는 문을 직접 움직이지 않는다 — 문 쪽 타 업체 프로그램이 읽은 QR 로 문 열기 API 를 부르고, 그 결과로 문을 연다.
 */
export interface DoorStoreInterface {
    /**
     * 문 정보를 읽는다. 기록이 없으면 `{qr: null, state: 'close', changed_at: DOOR_TIME_NONE}`.
     *
     * @throws ServiceUnavailableException `{message: REDIS_UNAVAILABLE_MESSAGE}` — Redis 에 닿지 못했을 때
     */
    get(room_id: string): Promise<DoorRecord>;

    /**
     * 새 QR 을 발급한다 — 겹치지 않는 값으로 바꾸고 이전 QR 은 무효가 된다. 상태 · 시각은 그대로(기록이 없으면 close · DOOR_TIME_NONE).
     *
     * @returns 새 QR (32자)
     * @throws ServiceUnavailableException `{message: REDIS_UNAVAILABLE_MESSAGE}` — Redis 에 닿지 못했을 때
     * @throws InternalServerErrorException `{message: DOOR_QR_ISSUE_FAILED_MESSAGE}` — 겹치지 않는 값을 잡지 못했을 때
     */
    issueQr(room_id: string): Promise<string>;

    /**
     * QR 이 같은 문을 open + changed_at 으로 바꾼다. 찾기와 쓰기를 한 번에 한다(그 사이 QR 이 바뀌어도 옛 QR 로 덮어쓰지 않는다).
     *
     * @returns 그 문의 room_id — 일치하는 문이 없으면 null
     * @throws ServiceUnavailableException `{message: REDIS_UNAVAILABLE_MESSAGE}` — Redis 에 닿지 못했을 때
     */
    open(qr: string, changed_at: string): Promise<string | null>;

    /**
     * 그 문을 close + changed_at 으로 바꾼다(QR 은 그대로, 기록이 없으면 QR 없이 만든다).
     *
     * @throws ServiceUnavailableException `{message: REDIS_UNAVAILABLE_MESSAGE}` — Redis 에 닿지 못했을 때
     */
    close(room_id: string, changed_at: string): Promise<void>;
}
