import { BadRequestException, Injectable, InternalServerErrorException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, LessThanOrEqual, Repository } from 'typeorm';
import { UserEntity } from '../entities/user.entity';
import { UserSettingEntity } from '../entities/user-setting.entity';
import { SessionEntity } from '../entities/session.entity';
import { SessionRefreshEntity } from '../entities/session-refresh.entity';
import { UserRepositoryInterface } from '../interfaces/user.repository.interface';

@Injectable()
export class UserRepository implements UserRepositoryInterface {
    constructor(
        @InjectRepository(UserEntity)
        private readonly userRepository: Repository<UserEntity>,
        @InjectRepository(UserSettingEntity)
        private readonly userSettingRepository: Repository<UserSettingEntity>,
        @InjectRepository(SessionEntity)
        private readonly sessionRepository: Repository<SessionEntity>,
        @InjectRepository(SessionRefreshEntity)
        private readonly sessionRefreshRepository: Repository<SessionRefreshEntity>,
    ) {}

    /**
     * 회원 등록
     */
    async insertUser(entity: UserEntity): Promise<void> {
        try {
            await this.userRepository.insert(entity);
        } catch (error) {
            if (error.errno === 1062 && error.sqlMessage.indexOf('UK_User_LoginId') !== -1) {
                throw new BadRequestException({message: '이미 존재하는 로그인 ID입니다.'});
            } else if (error.errno === 1062 && error.sqlMessage.indexOf('UK_User_UserSearchCode') !== -1) {
                throw new BadRequestException({message: '이미 존재하는 검색 코드입니다.'});
            } else if (error.errno === 1062 && error.sqlMessage.indexOf('UK_User_SnsSnsUserId') !== -1) {
                throw new BadRequestException({message: '이미 가입된 SNS 계정입니다.'});
            } else if (error.errno === 1452 && error.sqlMessage.indexOf('FK_User_Auth') !== -1) {
                throw new BadRequestException({message: '존재하지 않는 권한입니다.'});
            } else if (error.errno === 1452 && error.sqlMessage.indexOf('FK_User_State') !== -1) {
                throw new BadRequestException({message: '존재하지 않는 상태입니다.'});
            } else if (error.errno === 1452 && error.sqlMessage.indexOf('FK_User_Sns') !== -1) {
                throw new BadRequestException({message: '존재하지 않는 SNS 유형입니다.'});
            } else {
                throw new InternalServerErrorException({message: '서버에서 오류가 발생했습니다. 관리자에게 문의해주세요.'});
            }
        }
    }

    /**
     * 회원 설정 등록 — 이미 존재하면 스킵 (UK_UserSetting_UserId 중복 시 무시)
     */
    async insertUserSetting(entity: UserSettingEntity): Promise<void> {
        try {
            await this.userSettingRepository.insert(entity);
        } catch (error) {
            if (error.errno === 1062 && error.sqlMessage.indexOf('UK_UserSetting_UserId') !== -1) {
                return;
            } else if (error.errno === 1452 && error.sqlMessage.indexOf('FK_UserSetting_User') !== -1) {
                throw new BadRequestException({message: '존재하지 않는 회원입니다.'});
            } else {
                throw new InternalServerErrorException({message: '서버에서 오류가 발생했습니다. 관리자에게 문의해주세요.'});
            }
        }
    }

    /**
     * 세션 등록
     */
    async insertSession(entity: SessionEntity): Promise<void> {
        try {
            await this.sessionRepository.insert(entity);
        } catch (error) {
            if (error.errno === 1452 && error.sqlMessage.indexOf('FK_Session_User') !== -1) {
                throw new BadRequestException({message: '존재하지 않는 회원입니다.'});
            } else {
                throw new InternalServerErrorException({message: '서버에서 오류가 발생했습니다. 관리자에게 문의해주세요.'});
            }
        }
    }

    /**
     * Refresh Token 등록
     */
    async insertSessionRefresh(entity: SessionRefreshEntity): Promise<void> {
        try {
            await this.sessionRefreshRepository.insert(entity);
        } catch (error) {
            if (error.errno === 1062 && error.sqlMessage.indexOf('UK_SessionRefresh_RefreshHash') !== -1) {
                throw new BadRequestException({message: '이미 존재하는 Refresh Token입니다.'});
            } else if (error.errno === 1452 && error.sqlMessage.indexOf('FK_SessionRefresh_Session') !== -1) {
                throw new BadRequestException({message: '존재하지 않는 세션입니다.'});
            } else {
                throw new InternalServerErrorException({message: '서버에서 오류가 발생했습니다. 관리자에게 문의해주세요.'});
            }
        }
    }

    /**
     * 회원 단건 조회
     */
    async findUser(where: FindOptionsWhere<UserEntity>): Promise<UserEntity | null> {
        try {
            return await this.userRepository.findOne({where, loadRelationIds: true});
        } catch (error) {
            throw new InternalServerErrorException({message: '서버에서 오류가 발생했습니다. 관리자에게 문의해주세요.'});
        }
    }

    /**
     * 탈퇴 자동처리 대상 조회 — LEAVE_WAIT 이고 예약시각(문자열)이 now 이하인 회원.
     * leave_reserved_at 은 'YYYY-MM-DD HH:mm:ss' 사전식 정렬 가능 문자열 → 문자열 비교로 경과 판단.
     */
    async findLeaveReadyUsers(now: string): Promise<UserEntity[]> {
        try {
            return await this.userRepository.find({
                where: {state_id: 'LEAVE_WAIT', leave_reserved_at: LessThanOrEqual(now)},
                loadRelationIds: true,
            });
        } catch (error) {
            throw new InternalServerErrorException({message: '서버에서 오류가 발생했습니다. 관리자에게 문의해주세요.'});
        }
    }

    /**
     * 세션 단건 조회
     */
    async findSession(where: FindOptionsWhere<SessionEntity>): Promise<SessionEntity | null> {
        try {
            return await this.sessionRepository.findOne({where, loadRelationIds: true});
        } catch (error) {
            throw new InternalServerErrorException({message: '서버에서 오류가 발생했습니다. 관리자에게 문의해주세요.'});
        }
    }

    /**
     * Refresh 세션 단건 조회
     */
    async findSessionRefresh(where: FindOptionsWhere<SessionRefreshEntity>): Promise<SessionRefreshEntity | null> {
        try {
            return await this.sessionRefreshRepository.findOne({where, loadRelationIds: true});
        } catch (error) {
            throw new InternalServerErrorException({message: '서버에서 오류가 발생했습니다. 관리자에게 문의해주세요.'});
        }
    }

    /**
     * Refresh 세션 수정 (end_at 단축 등)
     */
    async updateSessionRefresh(where: FindOptionsWhere<SessionRefreshEntity>, entity: SessionRefreshEntity): Promise<void> {
        try {
            await this.sessionRefreshRepository.update(where, entity);
        } catch (error) {
            throw new InternalServerErrorException({message: '서버에서 오류가 발생했습니다. 관리자에게 문의해주세요.'});
        }
    }

    /** 회원 정보 수정 — new UserEntity() + 필드 할당으로 호출(@BeforeUpdate update_at 트리거) */
    async updateUser(where: FindOptionsWhere<UserEntity>, entity: UserEntity): Promise<void> {
        try {
            await this.userRepository.update(where, entity);
        } catch (error) {
            throw new InternalServerErrorException({message: '서버에서 오류가 발생했습니다. 관리자에게 문의해주세요.'});
        }
    }
}
