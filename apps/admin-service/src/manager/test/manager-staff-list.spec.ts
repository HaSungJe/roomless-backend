import {INestApplication} from '@nestjs/common';
import request from 'supertest';
import {ILike, In} from 'typeorm';
import {
    bootHttpPath,
    createJwtServiceMock,
    createManagerRepositoryMock,
    FIXED_TIME,
    HEAD_ACTOR,
    headManagerRow,
    internalHeaders,
    ManagerRepositoryMock,
    STAFF_ID,
    STORE_ID,
    staffRow,
} from './manager.test-helper.js';

const PATH = '/internal/v1/admin-service/manager/staff';
const BASE = {login_scope: 'MANAGER', store_id: STORE_ID, state_id: In(['ACTIVE', 'BLOCK'])};

describe('GET /internal/v1/admin-service/manager/staff — 업체 관리자 목록 (업체 총관리자, 동기 경로)', () => {
    let app: INestApplication;
    let repo: ManagerRepositoryMock;

    beforeEach(async () => {
        repo = createManagerRepositoryMock();
        repo.findManager.mockResolvedValue(headManagerRow());
        repo.countStaff.mockResolvedValue(1);
        repo.findStaffList.mockResolvedValue([staffRow({phone: null})]);
        app = await bootHttpPath(repo, createJwtServiceMock('a', 'r'));
    });

    afterEach(async () => {
        vi.clearAllMocks();
        await app.close();
    });

    describe('[SUCCESS]', () => {
        it('헤더의 업체 총관리자로 업체를 찾아 그 업체의 매니저 그룹(삭제 제외)을 기본 페이지로 센 뒤 목록', async () => {
            const res = await request(app.getHttpServer()).get(PATH).set(internalHeaders('10.0.0.1', HEAD_ACTOR));

            expect(res.status).toBe(200);
            expect(repo.findManager).toHaveBeenCalledWith({user_id: HEAD_ACTOR.user_id, login_scope: 'MANAGER', auth_id: 'HEAD_MANAGER'});
            expect(repo.countStaff).toHaveBeenCalledWith([BASE]);
            expect(repo.findStaffList).toHaveBeenCalledWith([BASE], 20, 0);
            expect(res.body.list).toEqual([
                {user_id: STAFF_ID, login_id: 'staff01', name: '김직원', phone: null, auth_id: 'MANAGER', state_id: 'ACTIVE', is_password_change_required: 1, created_at: FIXED_TIME.toISOString()},
            ]);
            expect(res.body.pagination).toMatchObject({total_count: 1, page: 1});
        });

        it('검색어는 아이디 · 이름 · 휴대폰 번호 부분 일치 OR(% · _ 이스케이프)', async () => {
            await request(app.getHttpServer())
                .get(`${PATH}?keyword=${encodeURIComponent('a_b')}`)
                .set(internalHeaders('10.0.0.1', HEAD_ACTOR));

            const where = [
                {...BASE, login_id: ILike('%a\\_b%')},
                {...BASE, name: ILike('%a\\_b%')},
                {...BASE, phone: ILike('%a\\_b%')},
            ];
            expect(repo.countStaff).toHaveBeenCalledWith(where);
            expect(repo.findStaffList).toHaveBeenCalledWith(where, 20, 0);
        });
    });

    describe('[FAIL:service]', () => {
        it('업체 총관리자 · 소속 업체가 없으면 404, 목록 조회 없음', async () => {
            repo.findManager.mockResolvedValueOnce(headManagerRow({store_id: null}));

            const res = await request(app.getHttpServer()).get(PATH).set(internalHeaders('10.0.0.1', HEAD_ACTOR));

            expect(res.status).toBe(404);
            expect(res.body).toEqual({message: '소속 업체를 찾을 수 없습니다.', validation_errors: null});
            expect(repo.countStaff).not.toHaveBeenCalled();
        });
    });

    describe('[FAIL:validation]', () => {
        it('검색어 101자 → 400 validation_errors.keyword, 조회 없음', async () => {
            const res = await request(app.getHttpServer())
                .get(`${PATH}?keyword=${encodeURIComponent('가'.repeat(101))}`)
                .set(internalHeaders('10.0.0.1', HEAD_ACTOR));

            expect(res.status).toBe(400);
            expect(res.body.validation_errors).toContainEqual({property: 'keyword', message: '검색어는 100자 이내로 입력해주세요.'});
            expect(repo.findManager).not.toHaveBeenCalled();
        });
    });
});
