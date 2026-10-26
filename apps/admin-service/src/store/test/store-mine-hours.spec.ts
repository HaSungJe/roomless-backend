import type {TestingModule} from '@nestjs/testing';
import {StoreMineHoursDto} from '@app/contracts/store/dto/store-mine-hours.dto.js';
import {STORE_COMMAND} from '@app/contracts/store/store.commands.js';
import {StoreHourEntity} from '@app/database/entities/store/store-hour.entity.js';
import {StoreEntity} from '@app/database/entities/store/store.entity.js';
import type {CommandDispatcher} from '@app/messaging/command.dispatcher.js';
import {bootCommandPath, createStoreRepositoryMock, MANAGER_ACTOR, runCommand, STORE_ID, StoreRepositoryMock, storeRow, validateBody} from './store.test-helper.js';

/**
 * 일 ~ 토 7개 — 일요일 휴무(시각을 보내도 버린다), 금요일 18:00 ~ 06:00(다음 날 마감), 나머지 09:00 ~ 18:00.
 *
 * @returns 요일별 영업시간 입력
 */
function weekHours(): Record<string, unknown>[] {
    return [0, 1, 2, 3, 4, 5, 6].map((day_of_week) => {
        if (day_of_week === 0) {
            return {day_of_week, is_closed: 1, open_time: '10:00', close_time: '11:00'};
        }
        if (day_of_week === 5) {
            return {day_of_week, is_closed: 0, open_time: '18:00', close_time: '06:00'};
        }
        return {day_of_week, is_closed: 0, open_time: '09:00', close_time: '18:00'};
    });
}

describe('admin.store.mine-hours — 내 업체 영업시간 설정 (큐 경로)', () => {
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

    describe('[SUCCESS]', () => {
        it('연중무휴 0 + 7개 요일 → 요일 행을 지우고 7개를 다시 넣는다(휴무는 시각 NULL) · 연중무휴 여부 0', async () => {
            const {result} = await runCommand(dispatcher, {type: STORE_COMMAND.MINE_HOURS, payload: {is_always_open: 0, hours: weekHours()}, actor: MANAGER_ACTOR});

            expect(result).toEqual({result: null, error: null});
            expect(repo.findStoreByManager).toHaveBeenCalledWith(MANAGER_ACTOR.user_id, true);
            expect(repo.deleteStoreHours).toHaveBeenCalledWith({store_id: STORE_ID});
            expect(repo.insertStoreHours).toHaveBeenCalledTimes(1);
            expect(repo.deleteStoreHours.mock.invocationCallOrder[0]).toBeLessThan(repo.insertStoreHours.mock.invocationCallOrder[0]);
            const entities = repo.insertStoreHours.mock.calls[0][0] as StoreHourEntity[];
            expect(entities).toHaveLength(7);
            expect(entities.every((entity) => entity instanceof StoreHourEntity && /^[a-f0-9]{32}$/.test(entity.store_hour_id) && entity.store_id === STORE_ID)).toBe(true);
            expect(entities[0]).toMatchObject({day_of_week: 0, is_closed: 1, open_time: null, close_time: null});
            expect(entities[1]).toMatchObject({day_of_week: 1, is_closed: 0, open_time: '09:00', close_time: '18:00'});
            expect(entities[5]).toMatchObject({day_of_week: 5, is_closed: 0, open_time: '18:00', close_time: '06:00'});
            const [where, storeEntity] = repo.updateStore.mock.calls[0] as [unknown, StoreEntity];
            expect(where).toEqual({store_id: STORE_ID});
            expect(storeEntity).toBeInstanceOf(StoreEntity);
            expect(storeEntity.is_always_open).toBe(0);
        });

        it('연중무휴 1 + [] → 요일 행만 지우고 넣지 않는다 · 연중무휴 여부 1', async () => {
            const {result} = await runCommand(dispatcher, {type: STORE_COMMAND.MINE_HOURS, payload: {is_always_open: 1, hours: []}, actor: MANAGER_ACTOR});

            expect(result).toEqual({result: null, error: null});
            expect(repo.deleteStoreHours).toHaveBeenCalledWith({store_id: STORE_ID});
            expect(repo.insertStoreHours).not.toHaveBeenCalled();
            expect((repo.updateStore.mock.calls[0][1] as StoreEntity).is_always_open).toBe(1);
        });
    });

    describe('[FAIL:service]', () => {
        const sameTime = weekHours();
        sameTime[2] = {day_of_week: 2, is_closed: 0, open_time: '09:00', close_time: '09:00'};
        const duplicated = weekHours();
        duplicated[6] = {day_of_week: 1, is_closed: 0, open_time: '09:00', close_time: '18:00'};

        it.each([
            ['연중무휴 1 인데 요일별 있음', 1, [weekHours()[1]], 'hours', '24시간 연중무휴면 요일별 영업시간을 비워주세요.'],
            ['연중무휴 0 인데 6개', 0, weekHours().slice(0, 6), 'hours', '일 ~ 토 7개 요일의 영업시간을 한 번씩 입력해주세요.'],
            ['7개인데 요일 중복', 0, duplicated, 'hours', '일 ~ 토 7개 요일의 영업시간을 한 번씩 입력해주세요.'],
            ['영업하는 요일의 시작 = 마감', 0, sameTime, 'hours.2.close_time', '영업 시작과 마감 시각이 같을 수 없습니다. 24시간 영업은 연중무휴로 설정해주세요.'],
        ])('%s → failed 400 validation_errors.%s, 교체 없음', async (_label, is_always_open, hours, property, message) => {
            const {result} = await runCommand(dispatcher, {type: STORE_COMMAND.MINE_HOURS, payload: {is_always_open, hours}, actor: MANAGER_ACTOR});

            expect(result?.error).toEqual({status_code: 400, body: {message, validation_errors: [{property, message}]}});
            expect(repo.deleteStoreHours).not.toHaveBeenCalled();
            expect(repo.insertStoreHours).not.toHaveBeenCalled();
            expect(repo.updateStore).not.toHaveBeenCalled();
        });
    });

    describe('[FAIL:validation] 게이트웨이 ValidationPipe — 요일 항목은 점 경로', () => {
        it('휴무가 아닌 요일의 시작 시각이 HH:mm 이 아니면 → hours.0.open_time', async () => {
            const body = await validateBody(StoreMineHoursDto, {is_always_open: 0, hours: [{day_of_week: 1, is_closed: 0, open_time: '25:00', close_time: '18:00'}]});

            expect(body).toEqual({message: '영업 시작 시각을 HH:mm 으로 입력해주세요.', validation_errors: [{property: 'hours.0.open_time', message: '영업 시작 시각을 HH:mm 으로 입력해주세요.'}]});
        });

        it('8개면 → hours', async () => {
            const body = await validateBody(StoreMineHoursDto, {is_always_open: 0, hours: [...weekHours(), weekHours()[1]]});

            expect(body).toEqual({message: '요일별 영업시간은 7개까지 입력할 수 있습니다.', validation_errors: [{property: 'hours', message: '요일별 영업시간은 7개까지 입력할 수 있습니다.'}]});
        });

        it('휴무 요일은 시각이 없어도 통과한다(짝 필드는 휴무면 검증하지 않는다)', async () => {
            await expect(validateBody(StoreMineHoursDto, {is_always_open: 0, hours: [{day_of_week: 0, is_closed: 1}]})).resolves.toBeNull();
        });
    });

    describe('[SECURITY]', () => {
        it('actor 없는 명령은 failed 401, 업체 조회 없음', async () => {
            const {result} = await runCommand(dispatcher, {type: STORE_COMMAND.MINE_HOURS, payload: {is_always_open: 1, hours: []}, actor: null});

            expect(result?.error?.status_code).toBe(401);
            expect(repo.findStoreByManager).not.toHaveBeenCalled();
        });
    });
});
