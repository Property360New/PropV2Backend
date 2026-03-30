CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_lead_company_active_assigned ON leads ("companyId", "isActive", "assignedToId");
CREATE INDEX IF NOT EXISTS idx_lead_phone_btree ON leads (phone);
CREATE INDEX IF NOT EXISTS idx_lead_phone_trgm ON leads USING gin (phone gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_lead_name_trgm ON leads USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_lead_email_trgm ON leads USING gin (email gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_lead_company_activity ON leads ("companyId", "isActive", "lastActivityAt" DESC);
CREATE INDEX IF NOT EXISTS idx_lead_company_assigned_at ON leads ("companyId", "isActive", "assignedAt" DESC);
CREATE INDEX IF NOT EXISTS idx_leadquery_leadid_createdby ON lead_queries ("leadId", "createdById");
CREATE INDEX IF NOT EXISTS idx_leadquery_leadid_status ON lead_queries ("leadId", status);
CREATE INDEX IF NOT EXISTS idx_leadquery_status_createdat ON lead_queries (status, "createdAt" DESC);