jest.mock('typeorm-transactional', () => ({
    Transactional: () => () => undefined,
    initializeTransactionalContext: jest.fn(),
    addTransactionalDataSource: jest.fn(),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { UserLeaveCleanupService } from '../user.leave-cleanup.service';
import { USER_REPOSITORY } from '../user.symbols';

describe('UserLeaveCleanupService - processLeaveWait (자동 탈퇴처리 스케줄러)', () => {
    let service: UserLeaveCleanupService;
    let userRepository: {findLeaveReadyUsers: jest.Mock; updateUser: jest.Mock};
    const ORIGINAL_ENV = process.env.NODE_ENV;

    const build = async () => {
        userRepository = {
            findLeaveReadyUsers: jest.fn().mockResolvedValue([]),
            updateUser: jest.fn().mockResolvedValue(undefined),
        };
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                UserLeaveCleanupService,
                {provide: USER_REPOSITORY, useValue: userRepository},
            ],
        }).compile();
        service = module.get(UserLeaveCleanupService);
    };

    beforeEach(async () => { await build(); });
    afterEach(() => { process.env.NODE_ENV = ORIGINAL_ENV; });

    it('NODE_ENV!=production → findLeaveReadyUsers/updateUser 둘 다 미호출', async () => {
        process.env.NODE_ENV = 'development';
        await service.processLeaveWait();
        expect(userRepository.findLeaveReadyUsers).not.toHaveBeenCalled();
        expect(userRepository.updateUser).not.toHaveBeenCalled();
    });

    it('production + 대상 2명 → state_id=LEAVE & 백업 & PII 익명화(DEL_<stamp>_<i>)로 updateUser 2회', async () => {
        process.env.NODE_ENV = 'production';
        const u1 = {user_id: 'u1', state_id: 'LEAVE_WAIT', sns_user_id: 'sns-real-1', name: '홍길동', birth: '1990-01-01', phone: '01012345678', device_os: 'iOS', device_token: 'tok-1'};
        const u2 = {user_id: 'u2', state_id: 'LEAVE_WAIT', sns_user_id: 'sns-real-2', name: '김철수', birth: '1991-02-02', phone: '01087654321', device_os: 'AOS', device_token: 'tok-2'};
        userRepository.findLeaveReadyUsers.mockResolvedValueOnce([u1, u2]);

        await service.processLeaveWait();

        // now 는 YYYY-MM-DD HH:mm:ss 포맷으로 전달
        expect(userRepository.findLeaveReadyUsers).toHaveBeenCalledTimes(1);
        expect(userRepository.findLeaveReadyUsers.mock.calls[0][0]).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);

        expect(userRepository.updateUser).toHaveBeenCalledTimes(2);
        const [where1, e1] = userRepository.updateUser.mock.calls[0];
        const [where2, e2] = userRepository.updateUser.mock.calls[1];
        expect(where1).toEqual({user_id: 'u1'});
        expect(where2).toEqual({user_id: 'u2'});

        // state + 백업(익명화 전 원본 보존)
        expect(e1.state_id).toBe('LEAVE');
        expect(JSON.parse(e1.leave_backup)).toMatchObject({user_id: 'u1', phone: '01012345678', name: '홍길동'});
        expect(JSON.parse(e2.leave_backup)).toMatchObject({user_id: 'u2', phone: '01087654321'});

        // PII 익명화 — DEL_<YYYYMMDDHHmm>_<i>
        const re = /^DEL_\d{12}_\d+$/;
        for (const e of [e1, e2]) {
            expect(e.sns_user_id).toMatch(re);
            expect(e.name).toMatch(re);
            expect(e.birth).toMatch(re);
            expect(e.phone).toMatch(re);
            expect(e.device_os).toBeNull();
            expect(e.device_token).toBeNull();
            // 한 회원 내 4개 PII 는 동일 토큰
            expect(new Set([e.sns_user_id, e.name, e.birth, e.phone]).size).toBe(1);
        }
        // 배치 내 순번(i)으로 회원 간 유일 — u1=_0, u2=_1, phone 서로 다름
        expect(e1.phone.endsWith('_0')).toBe(true);
        expect(e2.phone.endsWith('_1')).toBe(true);
        expect(e1.phone).not.toBe(e2.phone);
    });

    it('건별 updateUser 1건 throw → 루프 미중단, 나머지 계속 처리', async () => {
        process.env.NODE_ENV = 'production';
        userRepository.findLeaveReadyUsers.mockResolvedValueOnce([{user_id: 'u1'}, {user_id: 'u2'}]);
        userRepository.updateUser.mockRejectedValueOnce(new Error('db fail'));   // u1 실패

        await service.processLeaveWait();

        // u1 실패해도 u2 까지 호출 → 총 2회
        expect(userRepository.updateUser).toHaveBeenCalledTimes(2);
        expect(userRepository.updateUser.mock.calls[1][0]).toEqual({user_id: 'u2'});
    });
});
