import type {TransactionHost} from '@nestjs-cls/transactional';
import type {TransactionalAdapterTypeOrm} from '@nestjs-cls/transactional-adapter-typeorm';
import {DataSource, LessThanOrEqual} from 'typeorm';
import {ENTITIES} from '@app/database/entities.js';
import {UserRepository} from '../repositories/user.repository.js';

describe('[SMOKE:data-access] UserRepository(scheduler).buildUsersQuery — DB 연결 없이 SQL 빌드', () => {
    let repository: UserRepository;

    beforeAll(async () => {
        // 접속하지 않는다 — 엔티티 메타데이터만 만들어 QueryBuilder 가 SQL 을 조립하게 한다
        const dataSource = new DataSource({type: 'postgres', database: 'smoke', entities: ENTITIES});
        await (dataSource as unknown as {buildMetadatas: () => Promise<void>}).buildMetadatas();
        repository = new UserRepository({tx: dataSource.manager} as unknown as TransactionHost<TransactionalAdapterTypeOrm>);
    });

    it('탈퇴 자동처리 대상 — FK 문자열 state_id 와 예약시각 문자열 비교를 t_user 한 테이블 where 로 만든다(조인 없음)', () => {
        const [sql, parameters] = repository.buildUsersQuery({state_id: 'LEAVE_WAIT', leave_reserved_at: LessThanOrEqual('2026-01-15 09:30:00')}).getQueryAndParameters();

        expect(parameters).toEqual(['LEAVE_WAIT', '2026-01-15 09:30:00']);
        expect(sql).toContain('FROM "t_user" "u" WHERE (("u"."state_id" = $1) AND ("u"."leave_reserved_at" <= $2))');
        expect(sql).not.toContain('JOIN');
    });
});
