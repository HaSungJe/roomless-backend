import { Injectable } from "@nestjs/common";
import { DataSource } from "typeorm";
import { PassportUserResultDto } from "./passport.jwt.auth.dto";

@Injectable()
export class PassPortJwtAuthService {
    constructor(
        private readonly dataSource: DataSource
    ) {}

    /**
     * 로그인 정보 확인
     * 
     * @param user_id 
     * @returns 
     */
    async getLoginUser(user_id: string): Promise<PassportUserResultDto> {
        try {
            // 1. 회원 정보 조회
            const builder = this.dataSource.createQueryBuilder();
            builder.select(`
                  u.user_id 
                , u.login_id 
                , u.name 
                , u.gender
                , u.birth
                , u.nickname
                , u.store_id
                , a.auth_id
                , s.state_id 
                , s.is_login_able 
            `);
            builder.from('t_user', 'u');
            builder.innerJoin('t_state', 's', 'u.state_id = s.state_id');
            builder.innerJoin('t_auth', 'a', 'u.auth_id = a.auth_id');
            builder.innerJoin('t_user_setting', 'us', 'u.user_id = us.user_id');
            builder.where('u.user_id = :user_id', {user_id});
            builder.andWhere('s.is_login_able = 1');
            const result: PassportUserResultDto = await builder.getRawOne();
            if (result) {
                return result;
            } else {
                return null;
            }
        } catch (error) {
            return null;
        }
    }
}