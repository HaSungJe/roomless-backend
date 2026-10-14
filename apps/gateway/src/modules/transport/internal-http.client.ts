import {HttpException, Injectable, ServiceUnavailableException} from '@nestjs/common';
import type {Actor} from '@app/contracts/actor.js';
import {INTERNAL_HEADER} from '@app/contracts/actor.js';
import {DEFAULT_INTERNAL_HTTP_TIMEOUT_MS, readPositiveInt, SERVICE_UNAVAILABLE_MESSAGE} from './transport.util.js';

/** 게이트웨이가 동기 호출하는 내부 서비스 */
export type InternalService = 'user';

/** 서비스별 주소 환경변수와 기본값 */
const SERVICE_URL: Record<InternalService, {env: string; fallback: string}> = {user: {env: 'USER_SERVICE_URL', fallback: 'http://localhost:4001'}};

/** 내부 HTTP 요청 옵션 */
export interface InternalRequestOptions {
    /** JSON 본문 */
    body?: unknown;
    /** 로그인 회원 (헤더로 전달) */
    actor?: Actor | null;
    /** 클라이언트 IP (헤더로 전달) */
    client_ip?: string | null;
}

/**
 * 동기 경로 아웃바운드 어댑터 — 게이트웨이 → 서비스 내부 HTTP.
 * 내부 토큰 · actor · 클라이언트 IP 헤더를 붙이고, 서비스의 실패 응답(상태 코드 + 본문)을 그대로 HttpException 으로 되던진다.
 * 그래서 게이트웨이 필터를 거쳐도 클라이언트는 서비스가 만든 실패 본문을 그대로 받는다.
 */
@Injectable()
export class InternalHttpClient {
    /**
     * 내부 서비스를 호출한다.
     *
     * @param service 대상 서비스
     * @param method HTTP 메서드
     * @param path 경로 (예: /internal/v1/user/login)
     * @param options 본문 · actor · 클라이언트 IP
     * @returns 응답 본문 (204 면 undefined)
     * @throws HttpException 서비스가 실패 응답을 주면 같은 상태 코드 · 본문으로
     * @throws ServiceUnavailableException 접속 실패 · 타임아웃
     */
    async request<T>(service: InternalService, method: 'GET' | 'POST' | 'PATCH' | 'DELETE', path: string, options: InternalRequestOptions = {}): Promise<T> {
        const base = process.env[SERVICE_URL[service].env] || SERVICE_URL[service].fallback;
        const headers: Record<string, string> = {'content-type': 'application/json', [INTERNAL_HEADER.TOKEN]: process.env.INTERNAL_API_TOKEN ?? ''};
        if (options.actor) {
            headers[INTERNAL_HEADER.ACTOR_USER_ID] = options.actor.user_id;
            headers[INTERNAL_HEADER.ACTOR_AUTH_ID] = options.actor.auth_id;
        }
        if (options.client_ip) {
            headers[INTERNAL_HEADER.CLIENT_IP] = options.client_ip;
        }

        const init: RequestInit = {method, headers, signal: AbortSignal.timeout(readPositiveInt(process.env.INTERNAL_HTTP_TIMEOUT_MS, DEFAULT_INTERNAL_HTTP_TIMEOUT_MS))};
        if (options.body !== undefined && method !== 'GET') {
            init.body = JSON.stringify(options.body);
        }

        let response: Response;
        try {
            response = await fetch(`${base}${path}`, init);
        } catch {
            throw new ServiceUnavailableException({message: SERVICE_UNAVAILABLE_MESSAGE});
        }

        const text = await response.text();
        const data = parseJson(text);
        if (!response.ok) {
            throw new HttpException(data && typeof data === 'object' ? data : {message: text || response.statusText}, response.status);
        }
        return data as T;
    }
}

/**
 * 응답 본문을 JSON 으로 읽는다. 비었거나 JSON 이 아니면 undefined.
 *
 * @param text 응답 본문
 * @returns 파싱 결과
 */
function parseJson(text: string): unknown {
    if (!text) return undefined;
    try {
        return JSON.parse(text);
    } catch {
        return undefined;
    }
}
