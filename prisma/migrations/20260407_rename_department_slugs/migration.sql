-- Rename EntityType slugs: department → domain, department-ai → domain-ai
UPDATE "EntityType" SET slug = 'domain', name = 'Domain', description = 'An operational domain or business area'
WHERE slug = 'department';

UPDATE "EntityType" SET slug = 'domain-ai', name = 'Domain AI', description = 'AI entity that manages a domain''s strategy and knowledge'
WHERE slug = 'department-ai';

-- Rename RelationshipType slugs: department-member → domain-member
UPDATE "RelationshipType" SET slug = 'domain-member', name = 'Domain Member'
WHERE slug = 'department-member';

-- Rename wiki page types: department_overview → domain_overview
UPDATE "KnowledgePage" SET "pageType" = 'domain_overview'
WHERE "pageType" = 'department_overview';
