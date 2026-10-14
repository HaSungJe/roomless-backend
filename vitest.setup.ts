import {Logger} from '@nestjs/common';

// 모든 spec 공통 — 의도된 실패 경로의 에러 로그(스택)가 결과를 가리지 않도록 Nest 로거를 끈다.
Logger.overrideLogger(false);

// 모든 spec 공통 — @Transactional() 을 그대로 통과시킨다.
// 실제 트랜잭션은 ClsModule + TypeORM DataSource 가 필요하지만, spec 은 repository 를 mock 하므로 트랜잭션을 열 대상이 없다.
// (기존 Jest 의 `jest.mock('typeorm-transactional')` 을 spec 마다 쓰던 것을 한 곳으로 모은 것)
vi.mock('@nestjs-cls/transactional', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@nestjs-cls/transactional')>()),
    Transactional: () => (_target: object, _key: string | symbol, descriptor: PropertyDescriptor) => descriptor,
}));
