import type {Mock} from 'vitest';
import type {UserRepositoryInterface} from '../interfaces/user.repository.interface.js';

/** 회원 repository mock (scheduler) — 모든 메서드가 vi.fn() */
export type UserRepositoryMock = {[K in keyof UserRepositoryInterface]: Mock};

/**
 * scheduler 회원 repository mock 을 만든다.
 *
 * @returns 메서드별 vi.fn()
 */
export function createUserRepositoryMock(): UserRepositoryMock {
    return {findUsers: vi.fn(), updateUser: vi.fn()};
}
