import type {TestingModule} from '@nestjs/testing';
import {STORE_COMMAND} from '@app/contracts/store/store.commands.js';
import {StoreApplicationEntity} from '@app/database/entities/store/store-application.entity.js';
import type {CommandDispatcher} from '@app/messaging/command.dispatcher.js';
import {ADMIN_ACTOR, APPLICATION_ID, applicationRow, bootCommandPath, createStoreRepositoryMock, runCommand, StoreRepositoryMock} from './store.test-helper.js';

const PAYLOAD = {store_application_id: APPLICATION_ID, reject_comment: '사업자등록증 사진이 흐립니다.'};

describe('admin.store.application-reject — 입점 반려 (큐 경로)', () => {
    let repo: StoreRepositoryMock;
    let dispatcher: CommandDispatcher;
    let module: TestingModule;

    beforeEach(async () => {
        repo = createStoreRepositoryMock();
        repo.findApplication.mockResolvedValue(applicationRow());
        ({dispatcher, module} = await bootCommandPath(repo));
    });

    afterEach(async () => {
        vi.clearAllMocks();
        await module.close();
    });

    describe('[SUCCESS]', () => {
        it('대기 신청을 대기 조건으로 반려(사유 · 검토일)한다 — 파일은 남긴다', async () => {
            const {result} = await runCommand(dispatcher, {type: STORE_COMMAND.APPLICATION_REJECT, payload: PAYLOAD, actor: ADMIN_ACTOR});

            expect(result).toEqual({result: null, error: null});
            expect(repo.findApplication).toHaveBeenCalledWith({store_application_id: APPLICATION_ID});
            const [where, rejected] = repo.updateApplication.mock.calls[0] as [unknown, StoreApplicationEntity];
            expect(where).toEqual({store_application_id: APPLICATION_ID, store_application_state_id: 'WAIT'});
            expect(rejected).toBeInstanceOf(StoreApplicationEntity);
            expect(rejected).toMatchObject({store_application_state_id: 'REJECTED', reject_comment: '사업자등록증 사진이 흐립니다.'});
            expect(rejected.reviewed_at).toBeInstanceOf(Date);
            expect(repo.deleteStoreFile).not.toHaveBeenCalled();
        });
    });

    describe('[FAIL:service]', () => {
        it('신청이 없으면 failed 404, 수정 없음', async () => {
            repo.findApplication.mockResolvedValueOnce(null);

            const {result} = await runCommand(dispatcher, {type: STORE_COMMAND.APPLICATION_REJECT, payload: PAYLOAD, actor: ADMIN_ACTOR});

            expect(result?.error).toEqual({status_code: 404, body: {message: '입점 신청을 찾을 수 없습니다.', validation_errors: null}});
            expect(repo.updateApplication).not.toHaveBeenCalled();
        });

        it('이미 승인된 신청은 failed 400, 수정 없음', async () => {
            repo.findApplication.mockResolvedValueOnce(applicationRow({store_application_state_id: 'APPROVED'}));

            const {result} = await runCommand(dispatcher, {type: STORE_COMMAND.APPLICATION_REJECT, payload: PAYLOAD, actor: ADMIN_ACTOR});

            expect(result?.error).toEqual({status_code: 400, body: {message: '대기 중인 입점 신청만 처리할 수 있습니다.', validation_errors: null}});
            expect(repo.updateApplication).not.toHaveBeenCalled();
        });

        it('그 사이 취소 · 승인돼 수정이 0건이면 failed 400', async () => {
            repo.updateApplication.mockResolvedValueOnce(false);

            const {result} = await runCommand(dispatcher, {type: STORE_COMMAND.APPLICATION_REJECT, payload: PAYLOAD, actor: ADMIN_ACTOR});

            expect(result?.error).toEqual({status_code: 400, body: {message: '대기 중인 입점 신청만 처리할 수 있습니다.', validation_errors: null}});
        });
    });
});
