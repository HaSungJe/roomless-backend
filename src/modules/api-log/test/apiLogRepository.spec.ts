import { InternalServerErrorException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { ApiLogEntity } from '../api-log.entity';
import { ApiLogRepository } from '../api-log.repository';

describe('ApiLogRepository', () => {
    let repo: ApiLogRepository;
    let typeormRepoMock: jest.Mocked<Pick<Repository<ApiLogEntity>, 'insert'>>;

    beforeEach(() => {
        typeormRepoMock = {insert: jest.fn()};
        repo = new ApiLogRepository(typeormRepoMock as any);
    });

    it('[SUCCESS] insert — typeorm repository.insert 호출 위임', async () => {
        typeormRepoMock.insert.mockResolvedValue(undefined);

        const entity = new ApiLogEntity();
        entity.method = 'POST';
        entity.path = '/api/v1/dept';
        entity.status_code = 200;
        entity.duration_ms = 10;

        await repo.insert(entity);

        expect(typeormRepoMock.insert).toHaveBeenCalledTimes(1);
        expect(typeormRepoMock.insert).toHaveBeenCalledWith(entity);
    });

    it('[FAIL:repository] insert 실패 시 InternalServerErrorException', async () => {
        typeormRepoMock.insert.mockRejectedValue(new Error('db down'));

        const entity = new ApiLogEntity();
        entity.method = 'GET';
        entity.path = '/api/v1/x';
        entity.status_code = 500;
        entity.duration_ms = 5;

        await expect(repo.insert(entity)).rejects.toThrow(InternalServerErrorException);
        expect(typeormRepoMock.insert).toHaveBeenCalledTimes(1);
        expect(typeormRepoMock.insert).toHaveBeenCalledWith(entity);
    });
});
