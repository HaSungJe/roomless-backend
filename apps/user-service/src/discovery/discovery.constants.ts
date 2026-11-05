/** 공개 업체 상태 — 활성(영업중지 · 탈퇴는 이용자에게 보이지 않는다 — 로드맵 횡단 규칙 "업체 공개") */
export const DISCOVERY_STORE_STATE_ACTIVE = 'ACTIVE';

/** 업체 사진 용도(공개 — CDN 주소) */
export const DISCOVERY_STORE_IMAGE_PURPOSE = 'STORE_IMAGE';

/** 사용중지 호실 상태 — 예약을 받지 않는다(호실 수 · 최저가에서 빠진다) */
export const DISCOVERY_ROOM_STATE_DISABLED = 'DISABLED';

/** 상품 종류 */
export const DISCOVERY_PLAN_TYPE = {HOURLY: 'HOURLY', NIGHT: 'NIGHT', LONG: 'LONG'} as const;

/** 상품 종류 나열 순서 — 시간 이용 → 1박 → 연박 */
export const DISCOVERY_PLAN_TYPE_ORDER: string[] = [DISCOVERY_PLAN_TYPE.HOURLY, DISCOVERY_PLAN_TYPE.NIGHT, DISCOVERY_PLAN_TYPE.LONG];

/** 반경 업체 조회 최대 개수 — 넘으면 is_truncated (사용자 결정 2026-11-06) */
export const DISCOVERY_STORE_LIMIT = 300;

/** 지구 반지름(km) — 반경 사각형(discovery.util.ts) · 거리 SQL(discovery.repository.ts)이 같은 값을 쓴다 */
export const DISCOVERY_EARTH_RADIUS_KM = 6371;

/** 날짜 형식 (한국 날짜) */
export const DISCOVERY_DATE_FORMAT = 'YYYY-MM-DD';

/** 업체 없음 — 상세 · 그룹 목록 두 곳 */
export const DISCOVERY_STORE_NOT_FOUND_MESSAGE = '업체를 찾을 수 없습니다.';
