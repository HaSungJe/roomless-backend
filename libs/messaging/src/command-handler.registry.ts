import {Injectable, OnModuleInit} from '@nestjs/common';
import {DiscoveryService, MetadataScanner, Reflector} from '@nestjs/core';
import type {CommandHandlerFn} from './interfaces/messaging.interface.js';
import {ON_COMMAND_METADATA} from './on-command.decorator.js';

/**
 * `@OnCommand` 가 붙은 메서드를 모아 명령 type → 핸들러 표를 만든다.
 * 같은 type 이 두 번 등록되면 부팅을 실패시킨다(어느 쪽이 처리할지 모호해지므로).
 */
@Injectable()
export class CommandHandlerRegistry implements OnModuleInit {
    private readonly handlers = new Map<string, CommandHandlerFn>();

    /**
     * @param discovery provider 탐색
     * @param scanner 메서드 탐색
     * @param reflector 메타데이터 조회
     */
    constructor(
        private readonly discovery: DiscoveryService,
        private readonly scanner: MetadataScanner,
        private readonly reflector: Reflector,
    ) {}

    /**
     * 모든 provider 를 훑어 핸들러를 등록한다.
     */
    onModuleInit(): void {
        for (const wrapper of this.discovery.getProviders()) {
            const instance = wrapper.instance as Record<string, unknown> | undefined;
            if (!instance || typeof instance !== 'object') continue;
            const prototype = Object.getPrototypeOf(instance);
            if (!prototype) continue;
            for (const methodName of this.scanner.getAllMethodNames(prototype)) {
                const method = instance[methodName];
                if (typeof method !== 'function') continue;
                const type = this.reflector.get<string | undefined>(ON_COMMAND_METADATA, method);
                if (type) this.add(type, method.bind(instance) as CommandHandlerFn);
            }
        }
    }

    /**
     * 핸들러를 직접 등록한다.
     *
     * @param type 명령 type
     * @param handler 핸들러
     * @throws Error 같은 type 이 이미 있으면
     */
    add(type: string, handler: CommandHandlerFn): void {
        if (this.handlers.has(type)) {
            throw new Error(`명령 핸들러가 중복 등록되었습니다: ${type}`);
        }
        this.handlers.set(type, handler);
    }

    /**
     * 명령 type 의 핸들러를 찾는다.
     *
     * @param type 명령 type
     * @returns 핸들러 또는 undefined
     */
    get(type: string): CommandHandlerFn | undefined {
        return this.handlers.get(type);
    }

    /**
     * 등록된 명령 type 목록.
     *
     * @returns type 배열
     */
    types(): string[] {
        return [...this.handlers.keys()];
    }
}
