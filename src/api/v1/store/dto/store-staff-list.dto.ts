import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsOptional, Matches, MaxLength } from 'class-validator';
import { PaginationDto, PaginationResultDto } from '@root/common/dto/pagination.dto';

/**
 * 업체 인력 목록 조회 입력.
 * Query DTO 규약 — 생성자를 세트로 갖고, 파라미터는 선택(ValidationPipe 가 인자 없이 new 한다).
 * 부모 필드는 재선언하지 않는다(useDefineForClassFields 로 기본값이 덮인다).
 */
export class StoreStaffListDto extends PaginationDto {
    @ApiProperty({description: '가맹점 ID (ADMIN 만 유효, 총괄매니저는 자기 업체로 고정)', required: false})
    @IsOptional()
    @Matches(/^[a-f0-9]{32}$/, {message: '가맹점 ID 형식이 올바르지 않습니다.'})
    store_id: string | null;

    @ApiProperty({description: '역할 필터', required: false, enum: ['HEAD_MANAGER', 'MANAGER']})
    @IsOptional()
    @IsIn(['HEAD_MANAGER', 'MANAGER'], {message: '역할이 올바르지 않습니다.'})
    auth_id: string | null;

    @ApiProperty({description: '검색어 — 아이디·이름·닉네임 통합 (최대 100자)', required: false})
    @IsOptional()
    @MaxLength(100, {message: '검색어는 최대 100자까지 입력할 수 있습니다.'})
    search_keyword: string | null;

    constructor(data?: Partial<StoreStaffListDto>) {
        super(data);
        this.store_id = data?.store_id ?? null;
        this.auth_id = data?.auth_id ?? null;
        this.search_keyword = data?.search_keyword ?? null;
    }
}

/**
 * 인력 목록 항목
 */
export class StoreStaffItemDto {
    @ApiProperty({description: '회원 ID'})
    user_id: string;

    @ApiProperty({description: '로그인 아이디'})
    login_id: string;

    @ApiProperty({description: '이름'})
    name: string;

    @ApiProperty({description: '닉네임'})
    nickname: string;

    @ApiProperty({description: '권한 ID (HEAD_MANAGER / MANAGER)'})
    auth_id: string;

    @ApiProperty({description: '상태 ID'})
    state_id: string;

    @ApiProperty({description: '소속 가맹점 ID (없으면 null)'})
    store_id: string | null;

    @ApiProperty({description: '소속 가맹점 상호명 (없으면 null)'})
    store_name: string | null;

    @ApiProperty({description: '등록일'})
    create_at: Date;
}

/**
 * 인력 목록 조회 응답
 */
export class StoreStaffListResultDto {
    @ApiProperty({description: '인력 목록', isArray: true, type: () => StoreStaffItemDto})
    list: Array<StoreStaffItemDto>;

    @ApiProperty({description: '페이지 정보', type: () => PaginationResultDto})
    pagination: PaginationResultDto;
}
