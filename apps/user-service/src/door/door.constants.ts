/** 업체 탈퇴 상태 — t_store_state PK (store 도메인 상수는 import 하지 않는다) */
export const DOOR_STORE_STATE_LEAVE = 'LEAVE';

/** 문 소켓 접속 확인 실패 — 업체 없음 · 탈퇴 · 시크릿 미설정 · 불일치를 가르지 않는다(gateway door-socket.util.ts 와 같은 문구) */
export const DOOR_AUTH_FAILED_MESSAGE = '업체 ID 또는 시크릿 코드가 올바르지 않습니다.';

/** 그 업체의 지워지지 않은 호실이 아님 */
export const DOOR_ROOM_NOT_FOUND_MESSAGE = '호실을 찾을 수 없습니다.';
