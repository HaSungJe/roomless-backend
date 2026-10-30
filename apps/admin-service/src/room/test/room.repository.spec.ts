import {BadRequestException, InternalServerErrorException} from '@nestjs/common';
import type {TransactionHost} from '@nestjs-cls/transactional';
import type {TransactionalAdapterTypeOrm} from '@nestjs-cls/transactional-adapter-typeorm';
import {DataSource, ILike, QueryFailedError} from 'typeorm';
import {ENTITIES} from '@app/database/entities.js';
import {RoomGroupImageEntity} from '@app/database/entities/room/room-group-image.entity.js';
import {RoomGroupPlanPriceEntity} from '@app/database/entities/room/room-group-plan-price.entity.js';
import {RoomGroupPlanEntity} from '@app/database/entities/room/room-group-plan.entity.js';
import {RoomGroupEntity} from '@app/database/entities/room/room-group.entity.js';
import {RoomPlanEntity} from '@app/database/entities/room/room-plan.entity.js';
import {RoomEntity} from '@app/database/entities/room/room.entity.js';
import {StoreEntity} from '@app/database/entities/store/store.entity.js';
import type {RoomGroupPlanRow, RoomGroupRow, RoomPlanRow, RoomRow} from '../interfaces/room.repository.interface.js';
import {RoomRepository} from '../repositories/room.repository.js';
import {buildPlanPriceOverlapWhere} from '../room.util.js';

/** RoomPlanRow 키 — raw select 별칭과 비교 */
const ROOM_PLAN_ROW_KEYS: (keyof RoomPlanRow)[] = ['room_plan_id', 'store_id', 'room_plan_type_id', 'room_plan_type_name', 'is_used', 'days_of_week', 'usage_hours', 'check_in_time', 'check_out_time'];

/** RoomGroupRow 키 */
const ROOM_GROUP_ROW_KEYS: (keyof RoomGroupRow)[] = ['room_group_id', 'room_group_name', 'created_at', 'room_count', 'cover_file_key'];

/** RoomGroupPlanRow 키 */
const ROOM_GROUP_PLAN_ROW_KEYS: (keyof RoomGroupPlanRow)[] = ['room_group_plan_id', 'room_group_id', 'room_plan_type_id', 'room_plan_type_name', 'is_used', 'price'];

/** RoomRow 키 */
const ROOM_ROW_KEYS: (keyof RoomRow)[] = ['room_id', 'room_group_id', 'room_group_name', 'room_name', 'floor', 'room_state_id', 'room_state_name', 'created_at'];

/**
 * PostgreSQL 드라이버가 던지는 것과 같은 모양의 제약 위반 오류.
 *
 * @param code 23505(UK) | 23503(FK) | 23P01(배타 제약)
 * @param constraint 제약명
 * @returns QueryFailedError
 */
function constraintError(code: '23505' | '23503' | '23P01', constraint: string): QueryFailedError {
    return new QueryFailedError('INSERT ...', [], Object.assign(new Error('violates constraint'), {code, constraint}));
}

/**
 * txHost.tx(EntityManager)를 흉내 낸다 — getRepository(엔티티) 가 엔티티별 가짜 repository 를 돌려준다.
 *
 * @returns 저장소와 엔티티별 가짜 repository
 */
function makeRepository() {
    const fake = () => ({
        insert: vi.fn().mockResolvedValue({}),
        findOne: vi.fn().mockResolvedValue(null),
        find: vi.fn().mockResolvedValue([]),
        update: vi.fn().mockResolvedValue({affected: 1}),
        delete: vi.fn(),
        count: vi.fn().mockResolvedValue(0),
    });
    const repos = new Map<unknown, ReturnType<typeof fake>>([
        [StoreEntity, fake()],
        [RoomPlanEntity, fake()],
        [RoomGroupEntity, fake()],
        [RoomGroupPlanEntity, fake()],
        [RoomGroupImageEntity, fake()],
        [RoomGroupPlanPriceEntity, fake()],
        [RoomEntity, fake()],
    ]);
    const txHost = {tx: {getRepository: (entity: unknown) => repos.get(entity)}} as unknown as TransactionHost<TransactionalAdapterTypeOrm>;
    return {
        repository: new RoomRepository(txHost),
        store: repos.get(StoreEntity)!,
        roomPlan: repos.get(RoomPlanEntity)!,
        group: repos.get(RoomGroupEntity)!,
        groupPlan: repos.get(RoomGroupPlanEntity)!,
        image: repos.get(RoomGroupImageEntity)!,
        price: repos.get(RoomGroupPlanPriceEntity)!,
        room: repos.get(RoomEntity)!,
    };
}

/**
 * raw select 의 별칭 목록 (` AS "<키>"`)
 *
 * @param sql 공백을 한 칸으로 줄인 SQL
 * @returns 별칭 목록 (나온 순서)
 */
function selectAliases(sql: string): string[] {
    return [...sql.matchAll(/ AS "([a-z_]+)"/g)].map((match) => match[1]);
}

describe('RoomRepository — TypeORM 오류 → HTTP 예외 매핑', () => {
    const GROUP_NAME_TAKEN = {message: '이미 있는 그룹명입니다.', validation_errors: [{property: 'room_group_name', message: '이미 있는 그룹명입니다.'}]};
    const ROOM_NAME_TAKEN = {message: '이미 있는 호실명입니다.', validation_errors: [{property: 'room_name', message: '이미 있는 호실명입니다.'}]};
    const IMAGE_TAKEN = {message: '이미 등록된 사진입니다.'};
    const PRICE_OVERLAP = {message: '같은 상품의 다른 기간 가격과 날짜가 겹칩니다.'};

    it.each([
        ['insertRoomGroup', 'group', 'insert', '23505', 'UK_RoomGroup_StoreIdRoomGroupName', GROUP_NAME_TAKEN],
        ['updateRoomGroup', 'group', 'update', '23505', 'UK_RoomGroup_StoreIdRoomGroupName', GROUP_NAME_TAKEN],
        ['insertRoom', 'room', 'insert', '23505', 'UK_Room_StoreIdRoomName', ROOM_NAME_TAKEN],
        ['updateRoom', 'room', 'update', '23505', 'UK_Room_StoreIdRoomName', ROOM_NAME_TAKEN],
        ['insertRoomGroupImage', 'image', 'insert', '23505', 'UK_RoomGroupImage_FileKey', IMAGE_TAKEN],
        ['insertRoomGroupPlanPrice', 'price', 'insert', '23P01', 'EXC_RoomGroupPlanPrice_RoomGroupPlanIdDateRange', PRICE_OVERLAP],
        ['updateRoomGroupPlanPrice', 'price', 'update', '23P01', 'EXC_RoomGroupPlanPrice_RoomGroupPlanIdDateRange', PRICE_OVERLAP],
    ] as const)('[FAIL:repository] %s — %s.%s 가 %s %s 위반 → 400', async (method, repo, fn, code, constraint, body) => {
        const fakes = makeRepository();
        fakes[repo][fn].mockRejectedValueOnce(constraintError(code, constraint));

        const error = await (fakes.repository[method] as (...args: unknown[]) => Promise<unknown>)({}, {}).catch((e: unknown) => e);

        expect(error).toBeInstanceOf(BadRequestException);
        expect((error as BadRequestException).getResponse()).toEqual(body);
    });

    it.each([
        ['insertRoomGroup — 다른 UK', 'insertRoomGroup', 'group', 'insert', '23505', 'UK_Room_StoreIdRoomName'],
        ['insertRoom — FK 위반', 'insertRoom', 'room', 'insert', '23503', 'FK_Room_RoomGroup'],
        ['insertRoomGroupPlanPrice — 제약명이 같아도 코드가 23P01 이 아님', 'insertRoomGroupPlanPrice', 'price', 'insert', '23505', 'EXC_RoomGroupPlanPrice_RoomGroupPlanIdDateRange'],
        ['updateRoomGroupPlanPrice — 다른 배타 제약', 'updateRoomGroupPlanPrice', 'price', 'update', '23P01', 'EXC_Other'],
        ['insertRoomGroupPlans — 새 그룹이라 UK 와 겹칠 수 없다', 'insertRoomGroupPlans', 'groupPlan', 'insert', '23505', 'UK_RoomGroupPlan_RoomGroupIdRoomPlanTypeId'],
    ] as const)('[FAIL:repository] %s → 통일 500', async (_label, method, repo, fn, code, constraint) => {
        const fakes = makeRepository();
        fakes[repo][fn].mockRejectedValueOnce(constraintError(code, constraint));

        await expect((fakes.repository[method] as (...args: unknown[]) => Promise<unknown>)({}, {})).rejects.toBeInstanceOf(InternalServerErrorException);
    });

    it('그룹 · 사진 · 기간 가격 · 호실의 조회 · 개수 · 수정은 받은 조건에 is_deleted: 0 을 더한다(배열 OR 은 조건마다), 단건 조회는 loadRelationIds', async () => {
        const {repository, group, image, price, room} = makeRepository();
        const groupEntity = new RoomGroupEntity();
        const imageEntity = new RoomGroupImageEntity();
        const priceEntity = new RoomGroupPlanPriceEntity();
        const roomEntity = new RoomEntity();

        await repository.findRoomGroup({room_group_id: 'g1', store_id: 's1'});
        await repository.countRoomGroups({store_id: 's1'});
        await repository.countRoomGroups([{store_id: 's1', room_group_name: ILike('%룸%')}, {store_id: 's2'}]);
        await repository.updateRoomGroup({room_group_id: 'g1'}, groupEntity);
        await repository.findRoomGroupImage({room_group_image_id: 'i1', room_group_id: 'g1'});
        await repository.updateRoomGroupImage({room_group_image_id: 'i1'}, imageEntity);
        await repository.countRoomGroupPlanPrices({room_group_plan_id: 'gp1'});
        await repository.findRoomGroupPlanPrice({room_group_plan_price_id: 'pp1', room_group_plan_id: 'gp1'});
        await repository.updateRoomGroupPlanPrice({room_group_plan_price_id: 'pp1'}, priceEntity);
        await repository.countRooms({store_id: 's1', floor: -1});
        await repository.findRoom({room_id: 'r1', store_id: 's1'});
        await repository.updateRoom({room_id: 'r1'}, roomEntity);

        expect(group.findOne).toHaveBeenCalledWith({where: {room_group_id: 'g1', store_id: 's1', is_deleted: 0}, loadRelationIds: true});
        expect(group.count).toHaveBeenNthCalledWith(1, {where: {store_id: 's1', is_deleted: 0}});
        expect(group.count).toHaveBeenNthCalledWith(2, {
            where: [
                {store_id: 's1', room_group_name: ILike('%룸%'), is_deleted: 0},
                {store_id: 's2', is_deleted: 0},
            ],
        });
        expect(group.update).toHaveBeenCalledWith({room_group_id: 'g1', is_deleted: 0}, groupEntity);
        expect(image.findOne).toHaveBeenCalledWith({where: {room_group_image_id: 'i1', room_group_id: 'g1', is_deleted: 0}, loadRelationIds: true});
        expect(image.update).toHaveBeenCalledWith({room_group_image_id: 'i1', is_deleted: 0}, imageEntity);
        expect(price.count).toHaveBeenCalledWith({where: {room_group_plan_id: 'gp1', is_deleted: 0}});
        expect(price.findOne).toHaveBeenCalledWith({where: {room_group_plan_price_id: 'pp1', room_group_plan_id: 'gp1', is_deleted: 0}, loadRelationIds: true});
        expect(price.update).toHaveBeenCalledWith({room_group_plan_price_id: 'pp1', is_deleted: 0}, priceEntity);
        expect(room.count).toHaveBeenCalledWith({where: {store_id: 's1', floor: -1, is_deleted: 0}});
        expect(room.findOne).toHaveBeenCalledWith({where: {room_id: 'r1', store_id: 's1', is_deleted: 0}, loadRelationIds: true});
        expect(room.update).toHaveBeenCalledWith({room_id: 'r1', is_deleted: 0}, roomEntity);
    });

    it('삭제 표시가 없는 업체 상품 설정 · 그룹 상품은 받은 조건 그대로(행을 지우지 않는 테이블)', async () => {
        const {repository, roomPlan, groupPlan} = makeRepository();
        const planEntity = new RoomPlanEntity();
        const groupPlanEntity = new RoomGroupPlanEntity();

        await repository.findRoomPlan({store_id: 's1', room_plan_type_id: 'HOURLY'});
        await repository.updateRoomPlan({room_plan_id: 'p1'}, planEntity);
        await repository.findRoomGroupPlan({room_group_id: 'g1', room_plan_type_id: 'NIGHT'});
        await repository.updateRoomGroupPlan({room_group_plan_id: 'gp1'}, groupPlanEntity);

        expect(roomPlan.findOne).toHaveBeenCalledWith({where: {store_id: 's1', room_plan_type_id: 'HOURLY'}, loadRelationIds: true});
        expect(roomPlan.update).toHaveBeenCalledWith({room_plan_id: 'p1'}, planEntity);
        expect(groupPlan.findOne).toHaveBeenCalledWith({where: {room_group_id: 'g1', room_plan_type_id: 'NIGHT'}, loadRelationIds: true});
        expect(groupPlan.update).toHaveBeenCalledWith({room_group_plan_id: 'gp1'}, groupPlanEntity);
    });

    it('insert 는 받은 엔티티(그룹 상품은 배열)를 그대로 한 번에 넘긴다 — @BeforeInsert 훅이 돈다', async () => {
        const {repository, group, groupPlan, image, price, room} = makeRepository();
        const groupEntity = new RoomGroupEntity();
        const plans = [new RoomGroupPlanEntity(), new RoomGroupPlanEntity(), new RoomGroupPlanEntity()];
        const imageEntity = new RoomGroupImageEntity();
        const priceEntity = new RoomGroupPlanPriceEntity();
        const roomEntity = new RoomEntity();

        await repository.insertRoomGroup(groupEntity);
        await repository.insertRoomGroupPlans(plans);
        await repository.insertRoomGroupImage(imageEntity);
        await repository.insertRoomGroupPlanPrice(priceEntity);
        await repository.insertRoom(roomEntity);

        expect(group.insert).toHaveBeenCalledTimes(1);
        expect(group.insert.mock.calls[0][0]).toBe(groupEntity);
        expect(groupPlan.insert).toHaveBeenCalledTimes(1);
        expect(groupPlan.insert.mock.calls[0][0]).toBe(plans);
        expect(image.insert.mock.calls[0][0]).toBe(imageEntity);
        expect(price.insert.mock.calls[0][0]).toBe(priceEntity);
        expect(room.insert.mock.calls[0][0]).toBe(roomEntity);
    });

    it.each([
        ['deleteRoomGroup', 'group', RoomGroupEntity, {room_group_id: 'g1'}],
        ['deleteRoomGroupImage', 'image', RoomGroupImageEntity, {room_group_image_id: 'i1'}],
        ['deleteRoomGroupImages', 'image', RoomGroupImageEntity, {room_group_id: 'g1'}],
        ['deleteRoom', 'room', RoomEntity, {room_id: 'r1'}],
        ['deleteRooms', 'room', RoomEntity, {room_group_id: 'g1'}],
    ] as const)('%s 는 실제로 지우지 않고 지워지지 않은 행을 삭제 표시한다(소프트 삭제)', async (method, repo, Entity, where) => {
        const fakes = makeRepository();

        await (fakes.repository[method] as (condition: unknown) => Promise<unknown>)(where);

        expect(fakes[repo].delete).not.toHaveBeenCalled();
        expect(fakes[repo].update).toHaveBeenCalledTimes(1);
        const [condition, entity] = fakes[repo].update.mock.calls[0] as [unknown, object];
        expect(condition).toEqual({...where, is_deleted: 0});
        expect(entity).toBeInstanceOf(Entity);
        expect({...entity}).toEqual({is_deleted: 1});
    });

    it.each([
        [1, true],
        [0, false],
    ])('deleteRoomGroupPlanPrice — affected %s → %s, 넘긴 조건 + 지워지지 않은 행만(그 그룹 상품 것만) 삭제 표시', async (affected, expected) => {
        const {repository, price} = makeRepository();
        price.update.mockResolvedValueOnce({affected});

        await expect(repository.deleteRoomGroupPlanPrice({room_group_plan_price_id: 'pp1', room_group_plan_id: 'gp1'})).resolves.toBe(expected);
        const [where, deleted] = price.update.mock.calls[0] as [unknown, object];
        expect(where).toEqual({room_group_plan_price_id: 'pp1', room_group_plan_id: 'gp1', is_deleted: 0});
        expect(deleted).toBeInstanceOf(RoomGroupPlanPriceEntity);
        expect({...deleted}).toEqual({is_deleted: 1});
        expect(price.delete).not.toHaveBeenCalled();
    });

    it.each([
        ['findRoomPlan', 'roomPlan', 'findOne'],
        ['updateRoomPlan', 'roomPlan', 'update'],
        ['countRoomGroups', 'group', 'count'],
        ['findRoomGroup', 'group', 'findOne'],
        ['insertRoomGroup', 'group', 'insert'],
        ['updateRoomGroup', 'group', 'update'],
        ['deleteRoomGroup', 'group', 'update'],
        ['insertRoomGroupPlans', 'groupPlan', 'insert'],
        ['findRoomGroupPlan', 'groupPlan', 'findOne'],
        ['updateRoomGroupPlan', 'groupPlan', 'update'],
        ['findRoomGroupImage', 'image', 'findOne'],
        ['insertRoomGroupImage', 'image', 'insert'],
        ['updateRoomGroupImage', 'image', 'update'],
        ['deleteRoomGroupImage', 'image', 'update'],
        ['deleteRoomGroupImages', 'image', 'update'],
        ['countRoomGroupPlanPrices', 'price', 'count'],
        ['findRoomGroupPlanPrice', 'price', 'findOne'],
        ['insertRoomGroupPlanPrice', 'price', 'insert'],
        ['updateRoomGroupPlanPrice', 'price', 'update'],
        ['deleteRoomGroupPlanPrice', 'price', 'update'],
        ['countRooms', 'room', 'count'],
        ['findRoom', 'room', 'findOne'],
        ['insertRoom', 'room', 'insert'],
        ['updateRoom', 'room', 'update'],
        ['deleteRoom', 'room', 'update'],
        ['deleteRooms', 'room', 'update'],
    ] as const)('%s 실패는 통일 500', async (method, repo, fn) => {
        const fakes = makeRepository();
        fakes[repo][fn].mockRejectedValueOnce(new Error('db'));

        await expect((fakes.repository[method] as (...args: unknown[]) => Promise<unknown>)({}, {})).rejects.toBeInstanceOf(InternalServerErrorException);
    });

    it.each([
        ['findManagerStore', 'buildManagerStoreQuery', ['u1', true]],
        ['findRoomPlanRows', 'buildRoomPlanRowsQuery', ['s1']],
        ['findRoomGroupRows', 'buildRoomGroupRowsQuery', [{store_id: 's1'}, 20, 0]],
        ['findRoomGroupPlanRows', 'buildRoomGroupPlanRowsQuery', ['g1']],
        ['findRoomGroupImages', 'buildRoomGroupImagesQuery', ['g1']],
        ['findRoomGroupPlanPriceList', 'buildRoomGroupPlanPriceListQuery', [{room_group_plan_id: 'gp1'}, 20, 0]],
        ['findRoomRows', 'buildRoomRowsQuery', [{store_id: 's1', floor: null, room_group_id: null}, 20, 0]],
    ] as const)('%s 는 같은 인자로 %s 를 실행하고, 실패는 통일 500', async (method, builder, args) => {
        const {repository} = makeRepository();
        const failing = {getOne: vi.fn().mockRejectedValue(new Error('db')), getMany: vi.fn().mockRejectedValue(new Error('db')), getRawMany: vi.fn().mockRejectedValue(new Error('db'))};
        const spy = vi.spyOn(repository as unknown as Record<string, (...params: unknown[]) => unknown>, builder).mockReturnValue(failing);

        await expect((repository[method] as (...params: unknown[]) => Promise<unknown>)(...args)).rejects.toBeInstanceOf(InternalServerErrorException);
        expect(spy).toHaveBeenCalledTimes(1);
        expect(spy).toHaveBeenCalledWith(...args);
    });
});

describe('[SMOKE:data-access] 소속 업체 · 상품 설정 · 그룹 목록 · 그룹 상품 · 그룹 사진 · 기간 가격(목록 · 겹침) · 호실 목록 — DB 연결 없이 SQL 빌드, 지워지지 않은 행만', () => {
    let dataSource: DataSource;
    let repository: RoomRepository;

    /** 매니저의 소속 업체(잠금 절 제외) — 형제 store buildStoreByManagerQuery 와 같은 문자열이어야 한다(STORE_SELECT + t_user 조인 + 조건) */
    const MANAGER_STORE_SQL =
        'SELECT "s"."store_id" AS "s_store_id", "s"."store_code" AS "s_store_code", "s"."store_name" AS "s_store_name", "s"."business_number" AS "s_business_number", "s"."owner_name" AS "s_owner_name", "s"."phone" AS "s_phone", "s"."address" AS "s_address", "s"."address_detail" AS "s_address_detail", "s"."latitude" AS "s_latitude", "s"."longitude" AS "s_longitude", "s"."introduction" AS "s_introduction", "s"."is_always_open" AS "s_is_always_open", "s"."is_open" AS "s_is_open", "s"."maintenance_minutes" AS "s_maintenance_minutes", "s"."booking_open_hours" AS "s_booking_open_hours", "s"."refund_deadline_hours" AS "s_refund_deadline_hours", "s"."suspend_comment" AS "s_suspend_comment", "s"."is_deleted" AS "s_is_deleted", "s"."delete_backup" AS "s_delete_backup", "s"."created_at" AS "s_created_at", "s"."updated_at" AS "s_updated_at", "s"."store_state_id" AS "s_store_state_id" FROM "t_store" "s" INNER JOIN "t_user" "u" ON "u"."store_id" = "s"."store_id" WHERE "u"."user_id" = $1 AND "u"."login_scope" = $2 AND "s"."store_state_id" <> $3 AND "s"."is_deleted" = 0';
    /** 업체 상품 설정 행 */
    const ROOM_PLAN_ROWS_SQL =
        'SELECT "p"."room_plan_id" AS "room_plan_id", "p"."store_id" AS "store_id", "p"."room_plan_type_id" AS "room_plan_type_id", "p"."is_used" AS "is_used", "p"."days_of_week" AS "days_of_week", "p"."usage_hours" AS "usage_hours", "p"."check_in_time" AS "check_in_time", "p"."check_out_time" AS "check_out_time", "t"."room_plan_type_name" AS "room_plan_type_name" FROM "t_room_plan" "p" INNER JOIN "t_room_plan_type" "t" ON "t"."room_plan_type_id" = "p"."room_plan_type_id" WHERE "p"."store_id" = $1';
    /** 객실 그룹 목록 — 검색어 없음 */
    const ROOM_GROUP_ROWS_SQL =
        'SELECT "g"."room_group_id" AS "room_group_id", "g"."room_group_name" AS "room_group_name", "g"."created_at" AS "created_at", (SELECT CAST(COUNT(*) AS integer) FROM "t_room" "r" WHERE "r"."room_group_id" = "g"."room_group_id" AND "r"."is_deleted" = 0) AS "room_count", (SELECT "i"."file_key" FROM "t_room_group_image" "i" WHERE "i"."room_group_id" = "g"."room_group_id" AND "i"."is_deleted" = 0 ORDER BY "i"."sort_order" ASC, "i"."created_at" ASC LIMIT 1) AS "cover_file_key" FROM "t_room_group" "g" WHERE (("g"."store_id" = $1) AND ("g"."is_deleted" = $2)) ORDER BY "g"."created_at" DESC LIMIT 10 OFFSET 20';
    /** 객실 그룹 목록 — 검색어 */
    const ROOM_GROUP_ROWS_KEYWORD_SQL =
        'SELECT "g"."room_group_id" AS "room_group_id", "g"."room_group_name" AS "room_group_name", "g"."created_at" AS "created_at", (SELECT CAST(COUNT(*) AS integer) FROM "t_room" "r" WHERE "r"."room_group_id" = "g"."room_group_id" AND "r"."is_deleted" = 0) AS "room_count", (SELECT "i"."file_key" FROM "t_room_group_image" "i" WHERE "i"."room_group_id" = "g"."room_group_id" AND "i"."is_deleted" = 0 ORDER BY "i"."sort_order" ASC, "i"."created_at" ASC LIMIT 1) AS "cover_file_key" FROM "t_room_group" "g" WHERE (("g"."store_id" = $1) AND ("g"."room_group_name" ILIKE $2) AND ("g"."is_deleted" = $3)) ORDER BY "g"."created_at" DESC LIMIT 20 OFFSET 0';
    /** 그룹 상품 행 */
    const ROOM_GROUP_PLAN_ROWS_SQL =
        'SELECT "gp"."room_group_plan_id" AS "room_group_plan_id", "gp"."room_group_id" AS "room_group_id", "gp"."room_plan_type_id" AS "room_plan_type_id", "gp"."is_used" AS "is_used", "gp"."price" AS "price", "t"."room_plan_type_name" AS "room_plan_type_name" FROM "t_room_group_plan" "gp" INNER JOIN "t_room_plan_type" "t" ON "t"."room_plan_type_id" = "gp"."room_plan_type_id" WHERE "gp"."room_group_id" = $1';
    /** 그룹 사진 */
    const ROOM_GROUP_IMAGES_SQL =
        'SELECT "i"."room_group_image_id" AS "i_room_group_image_id", "i"."file_key" AS "i_file_key", "i"."file_name" AS "i_file_name", "i"."content_type" AS "i_content_type", "i"."sort_order" AS "i_sort_order", "i"."is_deleted" AS "i_is_deleted", "i"."created_at" AS "i_created_at", "i"."updated_at" AS "i_updated_at", "i"."room_group_id" AS "i_room_group_id" FROM "t_room_group_image" "i" WHERE (("i"."room_group_id" = $1) AND ("i"."is_deleted" = $2)) ORDER BY "i"."sort_order" ASC, "i"."created_at" ASC';
    /** 기간 가격 목록 */
    const PLAN_PRICE_LIST_SQL =
        'SELECT "pp"."room_group_plan_price_id" AS "pp_room_group_plan_price_id", "pp"."start_date" AS "pp_start_date", "pp"."end_date" AS "pp_end_date", "pp"."price" AS "pp_price", "pp"."memo" AS "pp_memo", "pp"."is_deleted" AS "pp_is_deleted", "pp"."created_at" AS "pp_created_at", "pp"."updated_at" AS "pp_updated_at", "pp"."room_group_plan_id" AS "pp_room_group_plan_id" FROM "t_room_group_plan_price" "pp" WHERE (("pp"."room_group_plan_id" = $1) AND ("pp"."is_deleted" = $2)) ORDER BY "pp"."start_date" ASC LIMIT 20 OFFSET 0';
    /** 기간 가격 겹침 (등록) */
    const PLAN_PRICE_OVERLAP_SQL =
        'SELECT "pp"."room_group_plan_price_id" AS "pp_room_group_plan_price_id", "pp"."start_date" AS "pp_start_date", "pp"."end_date" AS "pp_end_date", "pp"."price" AS "pp_price", "pp"."memo" AS "pp_memo", "pp"."is_deleted" AS "pp_is_deleted", "pp"."created_at" AS "pp_created_at", "pp"."updated_at" AS "pp_updated_at", "pp"."room_group_plan_id" AS "pp_room_group_plan_id" FROM "t_room_group_plan_price" "pp" WHERE (("pp"."room_group_plan_id" = $1) AND ("pp"."start_date" <= $2) AND ("pp"."end_date" >= $3) AND ("pp"."is_deleted" = $4)) ORDER BY "pp"."start_date" ASC LIMIT 1 OFFSET 0';
    /** 기간 가격 겹침 (수정 — 자기 자신 제외) */
    const PLAN_PRICE_OVERLAP_EXCLUDE_SQL =
        'SELECT "pp"."room_group_plan_price_id" AS "pp_room_group_plan_price_id", "pp"."start_date" AS "pp_start_date", "pp"."end_date" AS "pp_end_date", "pp"."price" AS "pp_price", "pp"."memo" AS "pp_memo", "pp"."is_deleted" AS "pp_is_deleted", "pp"."created_at" AS "pp_created_at", "pp"."updated_at" AS "pp_updated_at", "pp"."room_group_plan_id" AS "pp_room_group_plan_id" FROM "t_room_group_plan_price" "pp" WHERE (("pp"."room_group_plan_id" = $1) AND ("pp"."start_date" <= $2) AND ("pp"."end_date" >= $3) AND ("pp"."room_group_plan_price_id" != $4) AND ("pp"."is_deleted" = $5)) ORDER BY "pp"."start_date" ASC LIMIT 1 OFFSET 0';
    /** 호실 목록 — 필터 없음 */
    const ROOM_ROWS_SQL =
        'SELECT "r"."room_id" AS "room_id", "r"."room_group_id" AS "room_group_id", "r"."room_name" AS "room_name", "r"."floor" AS "floor", "r"."room_state_id" AS "room_state_id", "r"."created_at" AS "created_at", "g"."room_group_name" AS "room_group_name", "st"."room_state_name" AS "room_state_name" FROM "t_room" "r" INNER JOIN "t_room_group" "g" ON "g"."room_group_id" = "r"."room_group_id" INNER JOIN "t_room_state" "st" ON "st"."room_state_id" = "r"."room_state_id" WHERE "r"."store_id" = $1 AND "r"."is_deleted" = 0 AND "g"."is_deleted" = 0 ORDER BY "r"."floor" ASC, "r"."room_name" ASC LIMIT 10 OFFSET 20';
    /** 호실 목록 — 층 + 그룹 필터 */
    const ROOM_ROWS_FILTER_SQL =
        'SELECT "r"."room_id" AS "room_id", "r"."room_group_id" AS "room_group_id", "r"."room_name" AS "room_name", "r"."floor" AS "floor", "r"."room_state_id" AS "room_state_id", "r"."created_at" AS "created_at", "g"."room_group_name" AS "room_group_name", "st"."room_state_name" AS "room_state_name" FROM "t_room" "r" INNER JOIN "t_room_group" "g" ON "g"."room_group_id" = "r"."room_group_id" INNER JOIN "t_room_state" "st" ON "st"."room_state_id" = "r"."room_state_id" WHERE "r"."store_id" = $1 AND "r"."is_deleted" = 0 AND "g"."is_deleted" = 0 AND "r"."floor" = $2 AND "r"."room_group_id" = $3 ORDER BY "r"."floor" ASC, "r"."room_name" ASC LIMIT 20 OFFSET 0';
    /** 호실 목록 — 0층 필터(0 도 필터다) */
    const ROOM_ROWS_FLOOR_ZERO_SQL =
        'SELECT "r"."room_id" AS "room_id", "r"."room_group_id" AS "room_group_id", "r"."room_name" AS "room_name", "r"."floor" AS "floor", "r"."room_state_id" AS "room_state_id", "r"."created_at" AS "created_at", "g"."room_group_name" AS "room_group_name", "st"."room_state_name" AS "room_state_name" FROM "t_room" "r" INNER JOIN "t_room_group" "g" ON "g"."room_group_id" = "r"."room_group_id" INNER JOIN "t_room_state" "st" ON "st"."room_state_id" = "r"."room_state_id" WHERE "r"."store_id" = $1 AND "r"."is_deleted" = 0 AND "g"."is_deleted" = 0 AND "r"."floor" = $2 ORDER BY "r"."floor" ASC, "r"."room_name" ASC LIMIT 20 OFFSET 0';

    beforeAll(async () => {
        // 접속하지 않는다 — 엔티티 메타데이터만 만들어 QueryBuilder 가 SQL 을 조립하게 한다
        dataSource = new DataSource({type: 'postgres', database: 'smoke', entities: ENTITIES});
        await (dataSource as unknown as {buildMetadatas: () => Promise<void>}).buildMetadatas();
        repository = new RoomRepository({tx: dataSource.manager} as unknown as TransactionHost<TransactionalAdapterTypeOrm>);
    });

    it.each([
        [false, ''],
        [true, ' FOR UPDATE OF s'],
    ])('매니저의 소속 업체 (잠금 %s) — t_user 매니저 그룹 조인 · 탈퇴 · 지운 업체 제외, 잠금이면 업체 행만', (lock, lockClause) => {
        const [sql, parameters] = repository.buildManagerStoreQuery('u1', lock).getQueryAndParameters();
        const flat = sql.replace(/\s+/g, ' ');

        expect(parameters).toEqual(['u1', 'MANAGER', 'LEAVE']);
        expect(flat).toContain('FROM "t_store" "s" INNER JOIN "t_user" "u" ON "u"."store_id" = "s"."store_id"');
        expect(flat).toContain('"u"."user_id" = $1 AND "u"."login_scope" = $2 AND "s"."store_state_id" <> $3 AND "s"."is_deleted" = 0');
        expect(flat.includes('FOR UPDATE')).toBe(lock);
        expect(flat.endsWith(' FOR UPDATE OF s')).toBe(lock);
        expect(flat).toBe(`${MANAGER_STORE_SQL}${lockClause}`);
    });

    it('업체 상품 설정 — 종류명 조인 · 그 업체 행만(삭제 표시 없는 테이블), select 별칭 = RoomPlanRow 키', () => {
        const [sql, parameters] = repository.buildRoomPlanRowsQuery('s1').getQueryAndParameters();
        const flat = sql.replace(/\s+/g, ' ');

        expect(parameters).toEqual(['s1']);
        expect(flat).toContain('FROM "t_room_plan" "p"');
        expect(flat).toContain('INNER JOIN "t_room_plan_type" "t"');
        expect(flat).toContain('"p"."store_id" = $1');
        expect(flat).not.toContain('is_deleted');
        expect([...selectAliases(flat)].sort()).toEqual([...ROOM_PLAN_ROW_KEYS].sort());
        expect(flat).toBe(ROOM_PLAN_ROWS_SQL);
    });

    it('객실 그룹 목록 — 지워지지 않은 그룹, 호실 수는 지워지지 않은 호실만 · 대표 사진은 지워지지 않은 사진 중 첫 순서, 등록일 최신순 · 페이지', () => {
        const [sql, parameters] = repository.buildRoomGroupRowsQuery({store_id: 's1'}, 10, 20).getQueryAndParameters();
        const flat = sql.replace(/\s+/g, ' ');

        expect(parameters).toEqual(expect.arrayContaining(['s1']));
        expect(flat).toContain('FROM "t_room_group" "g"');
        expect(flat).toMatch(/"g"\."store_id" = \$\d+/);
        expect(flat).toMatch(/"g"\."is_deleted" = (0|\$\d+)/);
        expect(flat).toContain('"t_room" "r"');
        expect(flat).toContain('"r"."is_deleted" = 0');
        expect(flat).toContain('"t_room_group_image" "i"');
        expect(flat).toContain('"i"."is_deleted" = 0');
        expect(flat).toContain('ORDER BY "g"."created_at" DESC');
        expect(flat).toContain('LIMIT 10 OFFSET 20');
        expect(selectAliases(flat)).toEqual(expect.arrayContaining(ROOM_GROUP_ROW_KEYS));
        expect(flat).toBe(ROOM_GROUP_ROWS_SQL);
    });

    it('객실 그룹 목록 — 검색어는 그룹명 ILIKE(이스케이프한 패턴 그대로)', () => {
        const [sql, parameters] = repository.buildRoomGroupRowsQuery({store_id: 's1', room_group_name: ILike('%a\\_b%')}, 20, 0).getQueryAndParameters();
        const flat = sql.replace(/\s+/g, ' ');

        expect(parameters).toEqual(expect.arrayContaining(['s1', '%a\\_b%']));
        expect(flat).toMatch(/"g"\."room_group_name" ILIKE \$\d+/);
        expect(flat).toMatch(/"g"\."is_deleted" = (0|\$\d+)/);
        expect(flat).toContain('LIMIT 20 OFFSET 0');
        expect(flat).toBe(ROOM_GROUP_ROWS_KEYWORD_SQL);
    });

    it('그룹 상품 — 종류명 조인 · 그 그룹 행만(삭제 표시 없는 테이블), select 별칭 = RoomGroupPlanRow 키', () => {
        const [sql, parameters] = repository.buildRoomGroupPlanRowsQuery('g1').getQueryAndParameters();
        const flat = sql.replace(/\s+/g, ' ');

        expect(parameters).toEqual(['g1']);
        expect(flat).toContain('FROM "t_room_group_plan" "gp"');
        expect(flat).toContain('INNER JOIN "t_room_plan_type" "t"');
        expect(flat).toContain('"gp"."room_group_id" = $1');
        expect(flat).not.toContain('is_deleted');
        expect([...selectAliases(flat)].sort()).toEqual([...ROOM_GROUP_PLAN_ROW_KEYS].sort());
        expect(flat).toBe(ROOM_GROUP_PLAN_ROWS_SQL);
    });

    it('그룹 사진 — 그 그룹 · 지워지지 않은 사진, 정렬 순서 · 등록일 순', () => {
        const [sql, parameters] = repository.buildRoomGroupImagesQuery('g1').getQueryAndParameters();
        const flat = sql.replace(/\s+/g, ' ');

        expect(parameters).toEqual(['g1', 0]);
        expect(flat).toContain('FROM "t_room_group_image" "i"');
        expect(flat).toContain('WHERE (("i"."room_group_id" = $1) AND ("i"."is_deleted" = $2))');
        expect(flat).toContain('ORDER BY "i"."sort_order" ASC, "i"."created_at" ASC');
        expect(flat).toBe(ROOM_GROUP_IMAGES_SQL);
    });

    it('기간 가격 목록 — 그 그룹 상품 · 지워지지 않은 것, 시작 날짜 순 · 페이지', () => {
        const [sql, parameters] = repository.buildRoomGroupPlanPriceListQuery({room_group_plan_id: 'gp1'}, 20, 0).getQueryAndParameters();
        const flat = sql.replace(/\s+/g, ' ');

        expect(parameters).toEqual(['gp1', 0]);
        expect(flat).toContain('FROM "t_room_group_plan_price" "pp"');
        expect(flat).toContain('WHERE (("pp"."room_group_plan_id" = $1) AND ("pp"."is_deleted" = $2))');
        expect(flat).toContain('ORDER BY "pp"."start_date" ASC LIMIT 20 OFFSET 0');
        expect(flat).toBe(PLAN_PRICE_LIST_SQL);
    });

    it('기간 가격 겹침 (등록) — 지워지지 않은 다른 기간의 시작 ≤ 새 종료 그리고 종료 ≥ 새 시작(양 끝 포함)', () => {
        const [sql, parameters] = repository.buildRoomGroupPlanPriceListQuery(buildPlanPriceOverlapWhere('gp1', '2026-07-01', '2026-08-31', null), 1, 0).getQueryAndParameters();
        const flat = sql.replace(/\s+/g, ' ');

        expect(parameters).toEqual(['gp1', '2026-08-31', '2026-07-01', 0]);
        expect(flat).toContain('WHERE (("pp"."room_group_plan_id" = $1) AND ("pp"."start_date" <= $2) AND ("pp"."end_date" >= $3) AND ("pp"."is_deleted" = $4))');
        expect(flat).not.toContain('"pp"."room_group_plan_price_id" !=');
        expect(flat).toBe(PLAN_PRICE_OVERLAP_SQL);
    });

    it('기간 가격 겹침 (수정) — 자기 자신(Not)은 빼고 센다', () => {
        const [sql, parameters] = repository.buildRoomGroupPlanPriceListQuery(buildPlanPriceOverlapWhere('gp1', '2026-07-01', '2026-08-31', 'pp1'), 1, 0).getQueryAndParameters();
        const flat = sql.replace(/\s+/g, ' ');

        expect(parameters).toEqual(['gp1', '2026-08-31', '2026-07-01', 'pp1', 0]);
        expect(flat).toContain('("pp"."start_date" <= $2) AND ("pp"."end_date" >= $3) AND ("pp"."room_group_plan_price_id" != $4) AND ("pp"."is_deleted" = $5)');
        expect(flat).toBe(PLAN_PRICE_OVERLAP_EXCLUDE_SQL);
    });

    it('호실 목록 (필터 없음) — 지워지지 않은 그룹 · 상태 조인, 그 업체 · 지워지지 않은 호실, 층 · 호실명 순 · 페이지, select 별칭 = RoomRow 키', () => {
        const [sql, parameters] = repository.buildRoomRowsQuery({store_id: 's1', floor: null, room_group_id: null}, 10, 20).getQueryAndParameters();
        const flat = sql.replace(/\s+/g, ' ');

        expect(parameters).toEqual(['s1']);
        expect(flat).toContain('FROM "t_room" "r"');
        expect(flat).toContain('INNER JOIN "t_room_group" "g"');
        expect(flat).toContain('INNER JOIN "t_room_state" "st"');
        expect(flat).toContain('"g"."is_deleted" = 0');
        expect(flat).toContain('"r"."is_deleted" = 0');
        expect(flat).toContain('"r"."store_id" = $1');
        expect(flat).not.toMatch(/"r"\."floor" = \$\d/);
        expect(flat).not.toMatch(/"r"\."room_group_id" = \$\d/);
        expect(flat).toContain('ORDER BY "r"."floor" ASC, "r"."room_name" ASC LIMIT 10 OFFSET 20');
        expect([...selectAliases(flat)].sort()).toEqual([...ROOM_ROW_KEYS].sort());
        expect(flat).toBe(ROOM_ROWS_SQL);
    });

    it.each([
        ['층 -1 + 그룹', {store_id: 's1', floor: -1, room_group_id: 'g1'}, ['s1', -1, 'g1'], ['"r"."floor" = $2', '"r"."room_group_id" = $3'], ROOM_ROWS_FILTER_SQL],
        ['0층(0 도 필터다)', {store_id: 's1', floor: 0, room_group_id: null}, ['s1', 0], ['"r"."floor" = $2'], ROOM_ROWS_FLOOR_ZERO_SQL],
    ] as const)('호실 목록 (%s) — 넘긴 필터만 조건에 더한다', (_label, filter, expectedParameters, fragments, expectedSql) => {
        const [sql, parameters] = repository.buildRoomRowsQuery(filter, 20, 0).getQueryAndParameters();
        const flat = sql.replace(/\s+/g, ' ');

        expect(parameters).toEqual(expectedParameters);
        for (const fragment of fragments) {
            expect(flat).toContain(fragment);
        }
        expect(flat).toContain('"r"."is_deleted" = 0');
        expect(flat).toBe(expectedSql);
    });
});
