# Ameya_Property360_New_Backend
This repo would be for the revamp of the existing property 360 software we are making on latest technology stack using Next Js frontend, Nest JS backend and Postgresql database.


Add these indexes in the database SQL editor
new comment



-- ============================================================
-- Lead search & performance indexes
-- Uses ACTUAL Postgres table names from Prisma @@map():
--   Lead      -> "leads"
--   LeadQuery -> "lead_queries"
-- ============================================================

-- Enable trigram extension for ILIKE and substring search
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ─── leads table ──────────────────────────────────────────────────────────────

-- Primary scope filter used by every tab query
CREATE INDEX IF NOT EXISTS idx_lead_company_active_assigned
  ON leads ("companyId", "isActive", "assignedToId");

-- Phone exact + prefix search (B-tree, O(log n))
CREATE INDEX IF NOT EXISTS idx_lead_phone_btree
  ON leads (phone);

-- Phone trigram — last-4-digit and any substring phone search
CREATE INDEX IF NOT EXISTS idx_lead_phone_trgm
  ON leads USING gin (phone gin_trgm_ops);

-- Name trigram — ILIKE prefix/substring search
CREATE INDEX IF NOT EXISTS idx_lead_name_trgm
  ON leads USING gin (name gin_trgm_ops);

-- Email trigram
CREATE INDEX IF NOT EXISTS idx_lead_email_trgm
  ON leads USING gin (email gin_trgm_ops);

-- lastActivityAt DESC for ordering in query tabs
CREATE INDEX IF NOT EXISTS idx_lead_company_activity
  ON leads ("companyId", "isActive", "lastActivityAt" DESC);

-- assignedAt DESC for ordering in fresh tab
CREATE INDEX IF NOT EXISTS idx_lead_company_assigned_at
  ON leads ("companyId", "isActive", "assignedAt" DESC);

-- ─── lead_queries table ───────────────────────────────────────────────────────

-- Critical for fresh-tab NOT EXISTS:
--   NOT EXISTS (SELECT 1 FROM lead_queries WHERE "leadId" = ? AND "createdById" = ?)
-- Without this every fresh-tab load scans ALL queries.
CREATE INDEX IF NOT EXISTS idx_leadquery_leadid_createdby
  ON lead_queries ("leadId", "createdById");

-- Tab status filter: WHERE status = ?
CREATE INDEX IF NOT EXISTS idx_leadquery_leadid_status
  ON lead_queries ("leadId", status);

-- Tab count distinct leads per status
CREATE INDEX IF NOT EXISTS idx_leadquery_status_createdat
  ON lead_queries (status, "createdAt" DESC);


Birthday notification
  Post {{baseUrl}}/leads/trigger-special-notifications# PropV2Backend

  Also run the seed file to create the initial company(prisma/seed.ts)