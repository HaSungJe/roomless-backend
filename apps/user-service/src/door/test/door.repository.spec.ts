import {InternalServerErrorException} from '@nestjs/common';
import type {TransactionHost} from '@nestjs-cls/transactional';
import type {TransactionalAdapterTypeOrm} from '@nestjs-cls/transactional-adapter-typeorm';
import {RoomEntity} from '@app/database/entities/room/room.entity.js';
import {DoorRepository} from '../repositories/door.repository.js';

/**
 * txHost.tx(EntityManager)를 흉내 낸다 — getRepository(RoomEntity) 가 가짜 repository 를 돌려준다.
 *
 * @returns 저장소와 가짜 t_room repository
 */
function makeRepository() {
    const room = {findOne: vi.fn().mockResolvedValue(null)};
    const txHost = {tx: {getRepository: (entity: unknown) => (entity === RoomEntity ? room : undefined)}} as unknown as TransactionHost<TransactionalAdapterTypeOrm>;
    return {repository: new DoorRepository(txHost), room};
}

describe('DoorRepository — t_room 을 door 어휘로 읽기만', () => {
    it('[SUCCESS] findDoorRoom 은 받은 조건에 is_deleted = 0 을 더하고(service 는 넣지 않는다) 관계는 ID 로 읽는다', async () => {
        const {repository, room} = makeRepository();
        const found = Object.assign(new RoomEntity(), {room_id: 'r1'});
        room.findOne.mockResolvedValueOnce(found);

        const result = await repository.findDoorRoom({room_id: 'r1'});

        expect(result).toBe(found);
        expect(room.findOne).toHaveBeenCalledTimes(1);
        expect(room.findOne).toHaveBeenCalledWith({where: {room_id: 'r1', is_deleted: 0}, loadRelationIds: true});
    });

    it('[FAIL:repository] DB 실패는 통일 500', async () => {
        const {repository, room} = makeRepository();
        room.findOne.mockRejectedValueOnce(new Error('db'));

        const error = await repository.findDoorRoom({room_id: 'r1'}).catch((e: unknown) => e);

        expect(error).toBeInstanceOf(InternalServerErrorException);
        expect((error as InternalServerErrorException).getResponse()).toEqual({message: '서버에서 오류가 발생했습니다. 관리자에게 문의해주세요.'});
    });
});
