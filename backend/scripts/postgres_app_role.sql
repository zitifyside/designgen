-- AI Design Generator — Postgres 앱 전용 role (체크리스트 step 5)
-- superuser 로 붙지 않는다. 앱 DB 에만 CONNECT + 스키마 최소 권한.
-- 비밀번호는 여기에 적지 말고 Secret Manager / .env 에서 주입한다.
--
--   psql -U postgres -d designgenerator -v app_password="'...' " -f postgres_app_role.sql
-- 맥미니 실측 이름: designgenerator / designgenerator_app (2026-08-19).

CREATE ROLE designgenerator_app LOGIN PASSWORD :'app_password';

GRANT CONNECT ON DATABASE designgenerator TO designgenerator_app;
REVOKE CONNECT ON DATABASE postgres FROM designgenerator_app;
REVOKE CONNECT ON DATABASE template1 FROM designgenerator_app;

GRANT USAGE ON SCHEMA public TO designgenerator_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO designgenerator_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO designgenerator_app;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO designgenerator_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT USAGE, SELECT ON SEQUENCES TO designgenerator_app;

REVOKE CREATE ON SCHEMA public FROM PUBLIC;
REVOKE CREATE ON SCHEMA public FROM designgenerator_app;
