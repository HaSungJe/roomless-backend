import {Injectable} from '@nestjs/common';
import {DiscoveryModule} from '@nestjs/core';
import {Test} from '@nestjs/testing';
import {CommandHandlerRegistry} from '@app/messaging/command-handler.registry.js';
import {OnCommand} from '@app/messaging/on-command.decorator.js';

/** 테스트용 핸들러 — 명령 2개 + 일반 메서드 1개 */
@Injectable()
class SampleHandler {
    readonly prefix = 'handled';

    /** a 명령 */
    @OnCommand('sample.a')
    a(): string {
        return `${this.prefix}:a`;
    }

    /** b 명령 */
    @OnCommand('sample.b')
    b(): string {
        return `${this.prefix}:b`;
    }

    /** 명령이 아닌 메서드 */
    helper(): string {
        return 'x';
    }
}

/** 같은 type 을 다시 등록하는 핸들러 */
@Injectable()
class DuplicateHandler {
    /** 중복 */
    @OnCommand('sample.a')
    again(): void {}
}

describe('CommandHandlerRegistry — @OnCommand 탐색', () => {
    it('[SUCCESS] provider 의 @OnCommand 메서드를 type 별로 모으고 인스턴스에 바인딩한다', async () => {
        const module = await Test.createTestingModule({imports: [DiscoveryModule], providers: [SampleHandler, CommandHandlerRegistry]}).compile();
        await module.init();
        const registry = module.get(CommandHandlerRegistry);

        expect(registry.types().sort()).toEqual(['sample.a', 'sample.b']);
        expect(await registry.get('sample.a')?.({} as never)).toBe('handled:a');
        expect(registry.get('sample.helper')).toBeUndefined();
        await module.close();
    });

    it('[FAIL:duplicate] 같은 type 이 두 번 등록되면 부팅을 실패시킨다', async () => {
        const module = await Test.createTestingModule({imports: [DiscoveryModule], providers: [SampleHandler, DuplicateHandler, CommandHandlerRegistry]}).compile();

        await expect(module.init()).rejects.toThrow('명령 핸들러가 중복 등록되었습니다: sample.a');
    });
});
