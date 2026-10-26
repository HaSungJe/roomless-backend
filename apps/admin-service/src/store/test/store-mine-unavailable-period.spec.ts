import type {TestingModule} from '@nestjs/testing';
import {LessThan, MoreThan} from 'typeorm';
import {StoreMineUnavailablePeriodDto} from '@app/contracts/store/dto/store-mine-unavailable-period.dto.js';
import {STORE_COMMAND} from '@app/contracts/store/store.commands.js';
import {StoreUnavailablePeriodEntity} from '@app/database/entities/store/store-unavailable-period.entity.js';
import type {CommandDispatcher} from '@app/messaging/command.dispatcher.js';
import {bootCommandPath, createStoreRepositoryMock, MANAGER_ACTOR, runCommand, STORE_ID, StoreRepositoryMock, storeRow, validateBody} from './store.test-helper.js';

/** 지금 — 한국 시각 2026-11-01 09:00 */
const NOW = new Date('2026-11-01T00:00:00.000Z');

describe('admin.store.mine-unavailable-period — 내 업체 일시 예약불가 등록 (큐 경로)', () => {
    let repo: StoreRepositoryMock;
    let dispatcher: CommandDispatcher;
    let module: TestingModule;

    beforeEach(async () => {
        vi.useFakeTimers({toFake: ['Date']});
        vi.setSystemTime(NOW);
        repo = createStoreRepositoryMock();
        repo.findStoreByManager.mockResolvedValue(storeRow());
        repo.countUnavailablePeriods.mockResolvedValue(0);
        ({dispatcher, module} = await bootCommandPath(repo));
    });

    afterEach(async () => {
        vi.useRealTimers();
        vi.clearAllMocks();
        await module.close();
    });

    describe('[SUCCESS]', () => {
        it('한국 시각 입력을 그 순간으로 바꿔 겹침(시작 < 새 종료 · 종료 > 새 시작)을 세고 등록한다', async () => {
            const {result} = await runCommand(dispatcher, {type: STORE_COMMAND.MINE_UNAVAILABLE_PERIOD, payload: {starts_at: '2026-11-02 09:00', ends_at: '2026-11-02 18:00'}, actor: MANAGER_ACTOR});

            expect(repo.findStoreByManager).toHaveBeenCalledWith(MANAGER_ACTOR.user_id, true);
            expect(repo.countUnavailablePeriods).toHaveBeenCalledWith({
                store_id: STORE_ID,
                starts_at: LessThan(new Date('2026-11-02T09:00:00.000Z')),
                ends_at: MoreThan(new Date('2026-11-02T00:00:00.000Z')),
            });
            expect(repo.insertUnavailablePeriod).toHaveBeenCalledTimes(1);
            const inserted = repo.insertUnavailablePeriod.mock.calls[0][0] as StoreUnavailablePeriodEntity;
            expect(inserted).toBeInstanceOf(StoreUnavailablePeriodEntity);
            expect(inserted.store_unavailable_period_id).toMatch(/^[a-f0-9]{32}$/);
            expect(inserted.store_id).toBe(STORE_ID);
            expect(inserted.starts_at.toISOString()).toBe('2026-11-02T00:00:00.000Z');
            expect(inserted.ends_at.toISOString()).toBe('2026-11-02T09:00:00.000Z');
            expect(inserted.memo).toBeNull();
            expect(result).toEqual({result: {store_unavailable_period_id: inserted.store_unavailable_period_id}, error: null});
        });

        it('시작이 과거인 진행 중 범위도 등록한다 — 메모는 그대로', async () => {
            const {result} = await runCommand(dispatcher, {
                type: STORE_COMMAND.MINE_UNAVAILABLE_PERIOD,
                payload: {starts_at: '2026-11-01 08:00', ends_at: '2026-11-01 12:00', memo: '내부 공사'},
                actor: MANAGER_ACTOR,
            });

            expect(result?.error).toBeNull();
            const inserted = repo.insertUnavailablePeriod.mock.calls[0][0] as StoreUnavailablePeriodEntity;
            expect(inserted.starts_at.toISOString()).toBe('2026-10-31T23:00:00.000Z');
            expect(inserted.memo).toBe('내부 공사');
        });
    });

    describe('[FAIL:service]', () => {
        it.each([
            ['없는 시작 날짜', '2026-02-30 09:00', '2026-11-02 18:00', 'starts_at', '없는 시작 일시입니다.'],
            ['없는 종료 날짜(13월)', '2026-11-02 09:00', '2026-13-01 00:00', 'ends_at', '없는 종료 일시입니다.'],
            ['시작 = 종료', '2026-11-02 09:00', '2026-11-02 09:00', 'ends_at', '종료 일시는 시작 일시보다 늦어야 합니다.'],
            ['시작 > 종료', '2026-11-02 18:00', '2026-11-02 09:00', 'ends_at', '종료 일시는 시작 일시보다 늦어야 합니다.'],
            ['종료 = 지금(이미 끝남)', '2026-10-31 09:00', '2026-11-01 09:00', 'ends_at', '이미 지난 기간은 등록할 수 없습니다.'],
        ])('%s → failed 400 validation_errors.%s, 겹침 확인 · 등록 없음', async (_label, starts_at, ends_at, property, message) => {
            const {result} = await runCommand(dispatcher, {type: STORE_COMMAND.MINE_UNAVAILABLE_PERIOD, payload: {starts_at, ends_at}, actor: MANAGER_ACTOR});

            expect(result?.error).toEqual({status_code: 400, body: {message, validation_errors: [{property, message}]}});
            expect(repo.countUnavailablePeriods).not.toHaveBeenCalled();
            expect(repo.insertUnavailablePeriod).not.toHaveBeenCalled();
        });
    });

    describe('[FAIL:duplicate]', () => {
        it('다른 일시 예약불가와 겹치면 failed 400 validation_errors.starts_at, 등록 없음', async () => {
            repo.countUnavailablePeriods.mockResolvedValueOnce(1);

            const {result} = await runCommand(dispatcher, {type: STORE_COMMAND.MINE_UNAVAILABLE_PERIOD, payload: {starts_at: '2026-11-02 09:00', ends_at: '2026-11-02 18:00'}, actor: MANAGER_ACTOR});

            expect(result?.error).toEqual({
                status_code: 400,
                body: {message: '다른 일시 예약불가와 겹칩니다.', validation_errors: [{property: 'starts_at', message: '다른 일시 예약불가와 겹칩니다.'}]},
            });
            expect(repo.insertUnavailablePeriod).not.toHaveBeenCalled();
        });
    });

    describe('[FAIL:validation] 게이트웨이 ValidationPipe', () => {
        it('일시 모양이 다르면 → starts_at', async () => {
            const body = await validateBody(StoreMineUnavailablePeriodDto, {starts_at: '2026/11/02 09:00', ends_at: '2026-11-02 18:00'});

            expect(body).toEqual({
                message: '시작 일시를 YYYY-MM-DD HH:mm 으로 입력해주세요.',
                validation_errors: [{property: 'starts_at', message: '시작 일시를 YYYY-MM-DD HH:mm 으로 입력해주세요.'}],
            });
        });

        it('메모 31자 → memo, 30자는 통과', async () => {
            const period = {starts_at: '2026-11-02 09:00', ends_at: '2026-11-02 18:00'};

            await expect(validateBody(StoreMineUnavailablePeriodDto, {...period, memo: '가'.repeat(31)})).resolves.toEqual({
                message: '메모는 30자 이내로 입력해주세요.',
                validation_errors: [{property: 'memo', message: '메모는 30자 이내로 입력해주세요.'}],
            });
            await expect(validateBody(StoreMineUnavailablePeriodDto, {...period, memo: '가'.repeat(30)})).resolves.toBeNull();
        });
    });

    describe('[SECURITY]', () => {
        it('actor 없는 명령은 failed 401, 업체 조회 없음', async () => {
            const {result} = await runCommand(dispatcher, {type: STORE_COMMAND.MINE_UNAVAILABLE_PERIOD, payload: {starts_at: '2026-11-02 09:00', ends_at: '2026-11-02 18:00'}, actor: null});

            expect(result?.error?.status_code).toBe(401);
            expect(repo.findStoreByManager).not.toHaveBeenCalled();
        });
    });
});
