# api-log

## API 로그는 마스킹하지 않는다 — 비밀번호 포함 전부 평문 적재

- Rule: `ApiLogInterceptor` 는 요청/응답 body 를 **있는 그대로** `t_api_log` 에 적재한다. 비밀번호(`login_pw`·`current_password`·`new_password`)나 발급된 임시 비밀번호(`temporary_password`) 같은 자격증명이 평문으로 저장되는 것을 **의도적으로 허용**한다. 민감 필드 마스킹을 제안하거나 도입하지 않는다.
- Scope: global
- Rationale: User decision 2026-07-28 — store-staff ship 리뷰에서 "임시 비밀번호가 로그에 평문 적재된다(F-1, medium)" 지적에 대해 "이건 진행하지 않음. 로그에 그냥 다 찍히게". 요청 측(`extractBody`)은 이전부터 같은 상태였고 이번 결정으로 응답 측도 동일 정책임이 확정됐다.
- 적용: 자격증명을 응답에 싣는 새 API 를 만들 때 **로그 노출을 finding 으로 올리지 않는다**. 정책상 정상 동작이다.
- AGENTS.md application: not needed (non-code — 규약이 아니라 운영 정책 결정 — 코드에 드러나지 않지만 리뷰 판단 기준으로만 쓰인다)
- Priority: takes precedence over AGENTS.md/defaults
