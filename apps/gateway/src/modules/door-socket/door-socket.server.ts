import type {IncomingMessage, Server} from 'node:http';
import type {Duplex} from 'node:stream';
import {Inject, Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy} from '@nestjs/common';
import {HttpAdapterHost} from '@nestjs/core';
import {WebSocket, WebSocketServer} from 'ws';
import type {RawData} from 'ws';
import {DOOR_INTERNAL_PATH, DOOR_SOCKET_EVENT} from '@app/contracts/door/door.commands.js';
import type {DoorCloseResultDto} from '@app/contracts/door/dto/door-close.dto.js';
import type {DoorSnapshotResultDto} from '@app/contracts/door/dto/door-snapshot.dto.js';
import type {DoorVerifyResultDto} from '@app/contracts/door/dto/door-verify.dto.js';
import {DOOR_COMMAND} from '@app/integration/integration.constants.js';
import {DOOR_STORE} from '@app/integration/integration.symbols.js';
import type {DoorCommand, DoorOpenCommand, DoorStoreInterface} from '@app/integration/interfaces/integration.interface.js';
import {InternalHttpClient} from '../transport/internal-http.client.js';
import {
    buildErrorMessage,
    buildOpenMessage,
    buildRejectResponse,
    buildSnapshotMessage,
    buildVerifiedMessage,
    DOOR_SOCKET_AUTH_FAILED_MESSAGE,
    DOOR_SOCKET_HEARTBEAT_MS,
    DOOR_SOCKET_PATH_NOT_FOUND_MESSAGE,
    DOOR_SOCKET_SECRET_CHANGED_CLOSE,
    DOOR_SOCKET_UNKNOWN_MESSAGE,
    isDoorSocketPath,
    readDoorSocketCredential,
    readDoorSocketRequest,
    toDoorSocketFailure,
} from './door-socket.util.js';
import type {DoorSocketFailure} from './door-socket.util.js';

/**
 * 문 소켓 — 문 쪽 타 업체 프로그램이 업체 단위로 붙는 표준 WebSocket(`/ws/v1/door`).
 * - HTTP 서버의 업그레이드를 직접 받아 헤더(x-store-id · x-store-secret)를 user-service 에 확인한 뒤에만 연결한다(틀리면 업그레이드 전 HTTP 401).
 * - 연결 직후 그 업체 호실 전체의 문 상태(door.snapshot).
 * - 문 프로그램의 QR 확인(door.verify)은 user-service 가 Redis 현재 QR 과 비교해 답하고(door.verified — 그 연결에만), 잠금 알림(door.closed)은 기록만 한다(성공은 답하지 않는다). 실패는 error 메시지(연결 유지).
 * - 관리자 바로 열기는 Redis 채널 door-commands 를 구독해 그 업체 연결 모두에 door.open 으로 보낸다.
 * - 30초마다 ping, 다음 ping 까지 pong 이 없으면 끊는다. 재연결은 문 프로그램이 한다.
 * - 연결 목록은 인스턴스 메모리다(연결 자체가 이 인스턴스에 붙어 있다) — 상태 원본은 Redis · DB, 인스턴스마다 따로 구독한다(sticky 불필요).
 */
@Injectable()
export class DoorSocketServer implements OnApplicationBootstrap, OnModuleDestroy {
    private readonly logger = new Logger(DoorSocketServer.name);
    /** 업그레이드를 넘겨받는 서버 — 포트를 따로 열지 않는다 */
    private readonly server = new WebSocketServer({noServer: true});
    /** 업체 ID → 이 인스턴스에 붙은 연결 */
    private readonly connections = new Map<string, Set<WebSocket>>();
    /** 연결 → 마지막 ping 뒤에 pong 을 받았는지 */
    private readonly alive = new WeakMap<WebSocket, boolean>();
    /** 하트비트 타이머 */
    private heartbeat: NodeJS.Timeout | null = null;

    /**
     * @param httpAdapterHost 게이트웨이 HTTP 서버(업그레이드를 받는다)
     * @param internalHttp user-service 내부 HTTP (접속 확인 · QR 확인 · 잠금)
     * @param doorStore 문 정보 포트 (바로 열기 명령 구독)
     */
    constructor(
        private readonly httpAdapterHost: HttpAdapterHost,
        private readonly internalHttp: InternalHttpClient,
        @Inject(DOOR_STORE) private readonly doorStore: DoorStoreInterface,
    ) {}

    /**
     * 업그레이드를 받고 · 문 명령(바로 열기 · 연결 끊기)을 구독하고 · 하트비트를 시작한다.
     */
    onApplicationBootstrap(): void {
        const httpServer = this.httpAdapterHost.httpAdapter.getHttpServer() as Server;
        httpServer.on('upgrade', (request: IncomingMessage, socket: Duplex, head: Buffer) => void this.handleUpgrade(request, socket, head));
        this.doorStore.subscribe((command) => this.applyCommand(command));
        this.heartbeat = setInterval(() => this.checkAlive(), DOOR_SOCKET_HEARTBEAT_MS);
    }

    /**
     * 종료 — 하트비트를 멈추고 연결을 닫는다(1001 — 문 프로그램은 다른 인스턴스로 다시 붙는다).
     */
    async onModuleDestroy(): Promise<void> {
        if (this.heartbeat) {
            clearInterval(this.heartbeat);
        }
        for (const client of this.server.clients) {
            client.close(1001, 'server shutdown');
        }
        await new Promise<void>((resolve) => this.server.close(() => resolve()));
    }

    /**
     * 업그레이드 요청 — 경로 · 헤더 모양을 보고, user-service 에 업체 ID · 시크릿을 확인한 뒤에만 연결한다.
     *
     * @param request 업그레이드 요청
     * @param socket TCP 소켓
     * @param head 업그레이드 뒤 첫 바이트
     */
    private async handleUpgrade(request: IncomingMessage, socket: Duplex, head: Buffer): Promise<void> {
        socket.on('error', () => socket.destroy());
        if (!isDoorSocketPath(request.url)) {
            this.reject(socket, {status_code: 404, message: DOOR_SOCKET_PATH_NOT_FOUND_MESSAGE});
            return;
        }
        const credential = readDoorSocketCredential(request.headers);
        if (!credential) {
            this.reject(socket, {status_code: 401, message: DOOR_SOCKET_AUTH_FAILED_MESSAGE});
            return;
        }
        let snapshot: DoorSnapshotResultDto;
        try {
            snapshot = await this.internalHttp.request<DoorSnapshotResultDto>('user', 'POST', DOOR_INTERNAL_PATH.SNAPSHOT, {body: credential});
        } catch (error) {
            this.reject(socket, toDoorSocketFailure(error));
            return;
        }
        if (socket.destroyed) {
            return;
        }
        this.server.handleUpgrade(request, socket, head, (client) => this.accept(client, snapshot));
    }

    /**
     * 연결 등록 — 업체 묶음에 넣고 처음 상태를 보낸다.
     *
     * @param client 연결
     * @param snapshot 업체 호실 전체의 문 상태
     */
    private accept(client: WebSocket, snapshot: DoorSnapshotResultDto): void {
        const store_id = snapshot.store_id;
        const group = this.connections.get(store_id) ?? new Set<WebSocket>();
        group.add(client);
        this.connections.set(store_id, group);
        this.alive.set(client, true);
        client.on('pong', () => this.alive.set(client, true));
        client.on('message', (data: RawData) => void this.handleMessage(client, store_id, data));
        client.on('close', () => this.remove(client, store_id));
        client.on('error', (error: Error) => this.logger.warn(`문 소켓 오류(${store_id}): ${error.message}`));
        this.send(client, buildSnapshotMessage(snapshot));
    }

    /**
     * 문 프로그램 메시지 — QR 확인은 결과를 그 연결에 답하고, 잠금 알림은 기록만 한다(성공은 답하지 않는다). 실패는 error 메시지.
     *
     * @param client 보낸 연결
     * @param store_id 그 연결의 업체 ID (접속 때 확인한 값 — 클라이언트가 보낸 업체 ID 는 믿지 않는다)
     * @param data 받은 메시지
     */
    private async handleMessage(client: WebSocket, store_id: string, data: RawData): Promise<void> {
        const request = readDoorSocketRequest(data.toString());
        if (!request) {
            this.send(client, buildErrorMessage({status_code: 400, message: DOOR_SOCKET_UNKNOWN_MESSAGE}));
            return;
        }
        try {
            if (request.event === DOOR_SOCKET_EVENT.VERIFY) {
                const result = await this.internalHttp.request<DoorVerifyResultDto>('user', 'POST', DOOR_INTERNAL_PATH.VERIFY, {body: {store_id, room_id: request.room_id, qr: request.qr}});
                this.send(client, buildVerifiedMessage(result));
            } else {
                await this.internalHttp.request<DoorCloseResultDto>('user', 'POST', DOOR_INTERNAL_PATH.CLOSE, {body: {store_id, room_id: request.room_id}});
            }
        } catch (error) {
            this.send(client, buildErrorMessage(toDoorSocketFailure(error)));
        }
    }

    /**
     * 문 명령 적용 — 바로 열기는 door.open 을 보내고, 연결 끊기(시크릿 변경)는 그 업체 연결을 모두 끊는다.
     *
     * @param command Redis 문 명령
     */
    private applyCommand(command: DoorCommand): void {
        if (command.command === DOOR_COMMAND.DISCONNECT) {
            this.disconnectStore(command.store_id);
            return;
        }
        this.sendOpenCommand(command);
    }

    /**
     * 연결 끊기 — 그 업체의 이 인스턴스 연결 모두(옛 시크릿으로 붙었다). 닫히면 close 이벤트가 묶음에서 뺀다.
     *
     * @param store_id 업체 ID
     */
    private disconnectStore(store_id: string): void {
        const group = this.connections.get(store_id);
        if (!group) {
            return;
        }
        for (const client of group) {
            client.close(DOOR_SOCKET_SECRET_CHANGED_CLOSE.code, DOOR_SOCKET_SECRET_CHANGED_CLOSE.reason);
        }
    }

    /**
     * 바로 열기 명령 — 그 업체의 이 인스턴스 연결 모두에(호실이 맞는 문만 연다).
     *
     * @param command Redis 바로 열기 명령
     */
    private sendOpenCommand(command: DoorOpenCommand): void {
        const group = this.connections.get(command.store_id);
        if (!group) {
            return;
        }
        const message = buildOpenMessage(command);
        for (const client of group) {
            this.send(client, message);
        }
    }

    /**
     * 하트비트 — 지난 ping 뒤 pong 이 없던 연결은 끊고, 나머지에 ping.
     */
    private checkAlive(): void {
        for (const group of this.connections.values()) {
            for (const client of group) {
                if (this.alive.get(client) === false) {
                    client.terminate();
                    continue;
                }
                this.alive.set(client, false);
                client.ping();
            }
        }
    }

    /**
     * 연결 제거 — 업체 묶음이 비면 묶음도 지운다.
     *
     * @param client 닫힌 연결
     * @param store_id 그 연결의 업체 ID
     */
    private remove(client: WebSocket, store_id: string): void {
        const group = this.connections.get(store_id);
        group?.delete(client);
        if (group?.size === 0) {
            this.connections.delete(store_id);
        }
    }

    /**
     * 열린 연결에만 보낸다.
     *
     * @param client 연결
     * @param message JSON 문자열
     */
    private send(client: WebSocket, message: string): void {
        if (client.readyState === WebSocket.OPEN) {
            client.send(message);
        }
    }

    /**
     * 업그레이드 거절 — HTTP 응답을 쓰고 연결을 끊는다.
     *
     * @param socket TCP 소켓
     * @param failure 상태 코드 · 메시지
     */
    private reject(socket: Duplex, failure: DoorSocketFailure): void {
        if (!socket.destroyed) {
            socket.write(buildRejectResponse(failure));
        }
        socket.destroy();
    }
}
