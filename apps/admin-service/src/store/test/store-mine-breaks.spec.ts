import type {TestingModule} from '@nestjs/testing';
import {StoreMineBreaksDto} from '@app/contracts/store/dto/store-mine-breaks.dto.js';
import {STORE_COMMAND} from '@app/contracts/store/store.commands.js';
import {StoreBreakEntity} from '@app/database/entities/store/store-break.entity.js';
import type {CommandDispatcher} from '@app/messaging/command.dispatcher.js';
import {bootCommandPath, createStoreRepositoryMock, MANAGER_ACTOR, runCommand, STORE_ID, StoreRepositoryMock, storeRow, validateBody} from './store.test-helper.js';

/**
 * 'HH:mm~HH:mm' 목록을 브레이크타임 입력으로.
 *
 * @param ranges 시작~마감 문자열 목록
 * @returns 브레이크타임 입력
 */
function toBreaks(ranges: string[]): {start_time: string; end_time: string}[] {
    return ranges.map((range) => {
        const [start_time, end_time] = range.split('~');
        return {start_time, end_time};
    });
}

describe('admin.store.mine-breaks — 내 업체 브레이크타임 설정 (큐 경로)', () => {
    let repo: StoreRepositoryMock;
    let dispatcher: CommandDispatcher;
    let module: TestingModule;

    beforeEach(async () => {
        repo = createStoreRepositoryMock();
        repo.findStoreByManager.mockResolvedValue(storeRow());
        ({dispatcher, module} = await bootCommandPath(repo));
    });

    afterEach(async () => {
        vi.clearAllMocks();
        await module.close();
    });

    // 사용자 합의 11개 (2026-10-27) — 매일 반복, 반열린 구간(끝점 맞닿음은 겹침 아님), 마감이 시작보다 이르면 다음 날까지
    describe('[CASES:breaks-overlap] 겹치지 않음 → 교체', () => {
        it.each([
            ['1 · 09:00~09:30 + 23:30~00:00', ['09:00~09:30', '23:30~00:00']],
            ['2 · 끝점 맞닿음 09:00~09:30 + 09:30~10:00', ['09:00~09:30', '09:30~10:00']],
            ['3 · 자정 넘는 범위의 끝 = 다음 시작 23:00~02:00 + 02:00~03:00', ['23:00~02:00', '02:00~03:00']],
            ['4 · 23:30~00:00 + 00:00~00:30', ['23:30~00:00', '00:00~00:30']],
            ['5a · 1개 12:00~13:00', ['12:00~13:00']],
        ])('%s → done, 지운 뒤 그대로 넣는다', async (_label, ranges) => {
            const breaks = toBreaks(ranges);

            const {result} = await runCommand(dispatcher, {type: STORE_COMMAND.MINE_BREAKS, payload: {breaks}, actor: MANAGER_ACTOR});

            expect(result).toEqual({result: null, error: null});
            expect(repo.findStoreByManager).toHaveBeenCalledWith(MANAGER_ACTOR.user_id, true);
            expect(repo.deleteStoreBreaks).toHaveBeenCalledWith({store_id: STORE_ID});
            expect(repo.insertStoreBreaks).toHaveBeenCalledTimes(1);
            expect(repo.deleteStoreBreaks.mock.invocationCallOrder[0]).toBeLessThan(repo.insertStoreBreaks.mock.invocationCallOrder[0]);
            const entities = repo.insertStoreBreaks.mock.calls[0][0] as StoreBreakEntity[];
            expect(entities.every((entity) => entity instanceof StoreBreakEntity && /^[a-f0-9]{32}$/.test(entity.store_break_id) && entity.store_id === STORE_ID)).toBe(true);
            expect(entities.map(({start_time, end_time}) => ({start_time, end_time}))).toEqual(breaks);
        });

        it('5b · 0개 → done, 지우기만 하고 넣지 않는다', async () => {
            const {result} = await runCommand(dispatcher, {type: STORE_COMMAND.MINE_BREAKS, payload: {breaks: []}, actor: MANAGER_ACTOR});

            expect(result).toEqual({result: null, error: null});
            expect(repo.deleteStoreBreaks).toHaveBeenCalledWith({store_id: STORE_ID});
            expect(repo.insertStoreBreaks).not.toHaveBeenCalled();
        });
    });

    describe('[CASES:breaks-overlap] 겹침 → failed 400', () => {
        it.each([
            ['6 · 09:00~09:30 + 09:25~09:35', ['09:00~09:30', '09:25~09:35']],
            ['7 · 자정 넘는 범위의 다음 날 쪽 23:00~02:00 + 01:00~03:00', ['23:00~02:00', '01:00~03:00']],
            ['8 · 다음 날 쪽에 포함 22:00~01:00 + 00:30~00:45', ['22:00~01:00', '00:30~00:45']],
            ['9 · 포함 12:00~13:00 + 11:00~14:00', ['12:00~13:00', '11:00~14:00']],
            ['10 · 첫 · 셋째 겹침(순서 무관) 08:00~08:30 + 12:00~13:00 + 08:15~08:20', ['08:00~08:30', '12:00~13:00', '08:15~08:20']],
        ])('%s → validation_errors.breaks, 교체 없음', async (_label, ranges) => {
            const {result} = await runCommand(dispatcher, {type: STORE_COMMAND.MINE_BREAKS, payload: {breaks: toBreaks(ranges)}, actor: MANAGER_ACTOR});

            expect(result?.error).toEqual({status_code: 400, body: {message: '브레이크타임이 서로 겹칩니다.', validation_errors: [{property: 'breaks', message: '브레이크타임이 서로 겹칩니다.'}]}});
            expect(repo.deleteStoreBreaks).not.toHaveBeenCalled();
            expect(repo.insertStoreBreaks).not.toHaveBeenCalled();
        });

        it('11 · 시작 = 마감 10:00~10:00 → 형식 오류 validation_errors.breaks.0.end_time, 교체 없음', async () => {
            const {result} = await runCommand(dispatcher, {type: STORE_COMMAND.MINE_BREAKS, payload: {breaks: toBreaks(['10:00~10:00'])}, actor: MANAGER_ACTOR});

            expect(result?.error).toEqual({
                status_code: 400,
                body: {
                    message: '브레이크타임의 시작과 마감 시각이 같을 수 없습니다.',
                    validation_errors: [{property: 'breaks.0.end_time', message: '브레이크타임의 시작과 마감 시각이 같을 수 없습니다.'}],
                },
            });
            expect(repo.deleteStoreBreaks).not.toHaveBeenCalled();
        });
    });

    describe('[FAIL:validation] 게이트웨이 ValidationPipe — 항목은 점 경로', () => {
        it('시작 시각이 HH:mm 이 아니면 → breaks.0.start_time', async () => {
            const body = await validateBody(StoreMineBreaksDto, {breaks: [{start_time: '9:00', end_time: '10:00'}]});

            expect(body).toEqual({
                message: '브레이크 시작 시각을 HH:mm 으로 입력해주세요.',
                validation_errors: [{property: 'breaks.0.start_time', message: '브레이크 시작 시각을 HH:mm 으로 입력해주세요.'}],
            });
        });

        it('11개면 → breaks', async () => {
            const breaks = Array.from({length: 11}, (_, hour) => ({start_time: `${String(hour).padStart(2, '0')}:00`, end_time: `${String(hour).padStart(2, '0')}:30`}));

            const body = await validateBody(StoreMineBreaksDto, {breaks});

            expect(body).toEqual({message: '브레이크타임은 10개까지 입력할 수 있습니다.', validation_errors: [{property: 'breaks', message: '브레이크타임은 10개까지 입력할 수 있습니다.'}]});
        });
    });

    describe('[FAIL:service]', () => {
        it('소속 업체가 없으면 failed 404, 교체 없음', async () => {
            repo.findStoreByManager.mockResolvedValueOnce(null);

            const {result} = await runCommand(dispatcher, {type: STORE_COMMAND.MINE_BREAKS, payload: {breaks: []}, actor: MANAGER_ACTOR});

            expect(result?.error).toEqual({status_code: 404, body: {message: '소속 업체를 찾을 수 없습니다.', validation_errors: null}});
            expect(repo.deleteStoreBreaks).not.toHaveBeenCalled();
        });
    });

    describe('[SECURITY]', () => {
        it('actor 없는 명령은 failed 401, 업체 조회 없음', async () => {
            const {result} = await runCommand(dispatcher, {type: STORE_COMMAND.MINE_BREAKS, payload: {breaks: []}, actor: null});

            expect(result?.error?.status_code).toBe(401);
            expect(repo.findStoreByManager).not.toHaveBeenCalled();
        });
    });
});
