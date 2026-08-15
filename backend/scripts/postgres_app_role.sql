-- AI Design Generator — Postgres 앱 전용 role (체크리스트 step 5)
-- superuser 로 붙지 않는다. 앱 DB 에만 CONNECT + 스키마 최소 권한.
-- 비밀번호는 여기에 적지 말고 Secret Manager / .env 에서 주입한다.
--
--   psql -U postgres -d designgen -v app_password="'...' " -f postgres_app_role.sql

CREATE ROLE adg_app LOGIN PASSWORD :'app_password';

GRANT CONNECT ON DATABASE designgen TO adg_app;
REVOKE CONNECT ON DATABASE postgres FROM adg_app;
REVOKE CONNECT ON DATABASE template1 FROM adg_app;

GRANT USAGE ON SCHEMA public TO adg_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO adg_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO adg_app;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO adg_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT USAGE, SELECT ON SEQUENCES TO adg_app;

REVOKE CREATE ON SCHEMA public FROM PUBLIC;
REVOKE CREATE ON SCHEMA public FROM adg_app;
