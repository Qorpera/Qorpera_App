-- Backfill legacy "department" scope values to "domain" after department→domain rename
UPDATE "SystemJob" SET scope = 'domain' WHERE scope = 'department';
UPDATE "SystemJob" SET scope = 'cross_domain' WHERE scope = 'cross_department';
