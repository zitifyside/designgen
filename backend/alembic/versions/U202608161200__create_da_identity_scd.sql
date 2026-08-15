-- Rollback for 202608161200__create_da_identity_scd
-- DROP 전용. ADD 배포와 같은 회차에 실행하지 않는다 (DA 마이그레이션규칙.md).

DROP VIEW IF EXISTS "vw_user_active";
DROP VIEW IF EXISTS "vw_project_active";
DROP VIEW IF EXISTS "vw_generation_active";
DROP VIEW IF EXISTS "vw_plan_active";
DROP VIEW IF EXISTS "vw_template_active";

DROP TABLE IF EXISTS "log_user_hist";
DROP TABLE IF EXISTS "log_plan_hist";
