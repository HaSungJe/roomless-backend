import type {IncomingHttpHeaders} from 'node:http';
import {STATUS_CODES} from 'node:http';
import {HttpException} from '@nestjs/common';
import {DOOR_SOCKET_EVENT, DOOR_SOCKET_HEADER, DOOR_SOCKET_PATH} from '@app/contracts/door/door.commands.js';
import type {RoomDoorSnapshotResultDto} from '@app/contracts/room/dto/room-door-snapshot.dto.js';
import type {RoomDoorVerifyResultDto} from '@app/contracts/room/dto/room-door-verify.dto.js';
import type {DoorOpenCommand} from '@app/integration/interfaces/integration.interface.js';

/** 서버가 ping 을 보내는 간격 — 다음 ping 때까지 pong 이 없으면 끊는다 */
export const DOOR_SOCKET_HEARTBEAT_MS = 30_000;

/** 업체 문 시크릿이 바뀌어 끊을 때의 종료 코드 · 이유 — 1008(정책 위반): 옛 시크릿으로 붙은 연결이다, 새 시크릿으로 다시 붙는다 */
export const DOOR_SOCKET_SECRET_CHANGED_CLOSE = {code: 1008, reason: 'store secret changed'} as const;

/** 접속 헤더가 없거나 모양이 틀렸을 때 — admin-service 의 확인 실패와 같은 문구(401) */
export const DOOR_SOCKET_AUTH_FAILED_MESSAGE = '업체 ID 또는 시크릿 코드가 올바르지 않습니다.';

/** 문 소켓이 아닌 경로의 업그레이드 */
export const DOOR_SOCKET_PATH_NOT_FOUND_MESSAGE = '없는 소켓 경로입니다.';

/** 받은 메시지를 읽지 못했을 때 */
export const DOOR_SOCKET_UNKNOWN_MESSAGE = '알 수 없는 메시지입니다.';

/** 예상하지 못한 실패 — 통일 500 문구 */
const DOOR_SOCKET_SERVER_ERROR_MESSAGE = '서버에서 오류가 발생했습니다. 관리자에게 문의해주세요.';

/** 32자 hex — 업체 ID · 호실 ID · QR */
const ID_PATTERN = /^[a-f0-9]{32}$/;

/** 시크릿 코드 — 영문 · 숫자 16 ~ 64자 */
const SECRET_PATTERN = /^[A-Za-z0-9]{16,64}$/;

/** 소켓 접속 자격 — 업그레이드 요청 헤더 (admin-service RoomDoorSnapshotDto 와 같은 모양) */
export interface DoorSocketCredential {
    store_id: string;
    door_secret: string;
}

/** 문 프로그램이 보낸 메시지 — QR 확인 · 잠금 알림 */
export type DoorSocketRequest = {event: typeof DOOR_SOCKET_EVENT.VERIFY; room_id: string; qr: string} | {event: typeof DOOR_SOCKET_EVENT.CLOSED; room_id: string};

/** 소켓 실패 — 상태 코드 · 메시지 */
export interface DoorSocketFailure {
    status_code: number;
    message: string;
}

/**
 * 문 소켓 경로인지 — 쿼리 문자열은 보지 않는다.
 *
 * @param url 업그레이드 요청 주소
 * @returns 문 소켓 경로면 true
 */
export function isDoorSocketPath(url: string | undefined): boolean {
    return (url ?? '').split('?')[0] === DOOR_SOCKET_PATH;
}

/**
 * 업그레이드 요청 헤더에서 업체 ID · 시크릿을 읽는다 — 없거나 모양이 틀리면 null(admin-service 에 묻지 않고 401).
 *
 * @param headers 요청 헤더
 * @returns 자격 또는 null
 */
export function readDoorSocketCredential(headers: IncomingHttpHeaders): DoorSocketCredential | null {
    const store_id = headers[DOOR_SOCKET_HEADER.STORE_ID];
    const door_secret = headers[DOOR_SOCKET_HEADER.STORE_SECRET];
    if (typeof store_id !== 'string' || !ID_PATTERN.test(store_id) || typeof door_secret !== 'string' || !SECRET_PATTERN.test(door_secret)) {
        return null;
    }
    return {store_id, door_secret};
}

/**
 * 받은 메시지(JSON)를 읽는다 — `door.verify {room_id, qr}` · `door.closed {room_id}`(32자 hex)만, 아니면 null.
 *
 * @param raw 받은 메시지 문자열
 * @returns 요청 또는 null
 */
export function readDoorSocketRequest(raw: string): DoorSocketRequest | null {
    try {
        const message = JSON.parse(raw) as {event?: unknown; data?: {room_id?: unknown; qr?: unknown}};
        const room_id = message.data?.room_id;
        if (typeof room_id !== 'string' || !ID_PATTERN.test(room_id)) {
            return null;
        }
        if (message.event === DOOR_SOCKET_EVENT.VERIFY) {
            const qr = message.data?.qr;
            return typeof qr === 'string' && ID_PATTERN.test(qr) ? {event: DOOR_SOCKET_EVENT.VERIFY, room_id, qr} : null;
        }
        return message.event === DOOR_SOCKET_EVENT.CLOSED ? {event: DOOR_SOCKET_EVENT.CLOSED, room_id} : null;
    } catch {
        return null;
    }
}

/**
 * 접속 직후 메시지 — 업체 호실 전체의 문 상태
 *
 * @param snapshot admin-service 접속 확인 결과
 * @returns JSON 문자열
 */
export function buildSnapshotMessage(snapshot: RoomDoorSnapshotResultDto): string {
    return JSON.stringify({event: DOOR_SOCKET_EVENT.SNAPSHOT, data: snapshot});
}

/**
 * QR 확인 결과 메시지 — 물어본 연결에만
 *
 * @param result admin-service QR 확인 결과
 * @returns JSON 문자열
 */
export function buildVerifiedMessage(result: RoomDoorVerifyResultDto): string {
    return JSON.stringify({event: DOOR_SOCKET_EVENT.VERIFIED, data: {room_id: result.room_id, ok: result.ok}});
}

/**
 * 바로 열기 명령 메시지 — 그 업체 연결에만 가므로 업체 ID 는 뺀다
 *
 * @param command Redis 문 명령
 * @returns JSON 문자열
 */
export function buildOpenMessage(command: DoorOpenCommand): string {
    return JSON.stringify({event: DOOR_SOCKET_EVENT.OPEN, data: {room_id: command.room_id}});
}

/**
 * 실패 메시지 — 연결은 유지한다
 *
 * @param failure 상태 코드 · 메시지
 * @returns JSON 문자열
 */
export function buildErrorMessage(failure: DoorSocketFailure): string {
    return JSON.stringify({event: DOOR_SOCKET_EVENT.ERROR, data: failure});
}

/**
 * 업그레이드 거절 응답(HTTP/1.1) — 본문은 공통 실패 모양
 *
 * @param failure 상태 코드 · 메시지
 * @returns 응답 원문
 */
export function buildRejectResponse(failure: DoorSocketFailure): string {
    const body = JSON.stringify({message: failure.message, validation_errors: null});
    const status = `${failure.status_code} ${STATUS_CODES[failure.status_code] ?? ''}`.trim();
    return `HTTP/1.1 ${status}\r\nConnection: close\r\nContent-Type: application/json; charset=utf-8\r\nContent-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`;
}

/**
 * 실패를 상태 코드 · 메시지로 — 서비스가 준 실패(InternalHttpClient 가 되던진 HttpException · 503)는 그대로, 그 밖은 통일 500.
 *
 * @param error 잡은 오류
 * @returns 상태 코드 · 메시지
 */
export function toDoorSocketFailure(error: unknown): DoorSocketFailure {
    if (error instanceof HttpException) {
        const body = error.getResponse();
        const message = typeof body === 'object' && body !== null && typeof (body as {message?: unknown}).message === 'string' ? (body as {message: string}).message : error.message;
        return {status_code: error.getStatus(), message};
    }
    return {status_code: 500, message: DOOR_SOCKET_SERVER_ERROR_MESSAGE};
}
