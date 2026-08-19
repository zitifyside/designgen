GRANT USAGE ON SCHEMA public TO mae_backup;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO mae_backup;
GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO mae_backup;
ALTER DEFAULT PRIVILEGES FOR ROLE designgenerator_app IN SCHEMA public
    GRANT SELECT ON TABLES TO mae_backup;
ALTER DEFAULT PRIVILEGES FOR ROLE designgenerator_app IN SCHEMA public
    GRANT SELECT ON SEQUENCES TO mae_backup;
SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE';
