import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { PassportUserResultDto } from './passport.jwt.auth.dto';

export const PassportUser = createParamDecorator((data: string, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user: PassportUserResultDto = request.user;
    return data ? user?.[data] : user;
});
