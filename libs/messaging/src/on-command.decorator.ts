import {SetMetadata} from '@nestjs/common';

/** `@OnCommand` 메타데이터 키 */
export const ON_COMMAND_METADATA = 'roomless:on-command';

/**
 * 서비스의 RabbitMQ 인바운드 어댑터 메서드를 명령 type 에 연결한다.
 * 메서드는 명령 봉투를 받아 service 를 호출하고, 반환값이 done 결과가 된다. 던진 예외는 failed 결과가 된다.
 *
 * @param type 명령 type (예: USER_COMMAND.SIGN)
 * @returns 메서드 데코레이터
 */
export const OnCommand = (type: string): MethodDecorator => SetMetadata(ON_COMMAND_METADATA, type);
