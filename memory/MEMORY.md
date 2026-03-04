# Synthetix ERP — Project Memory

## Stack
- Next.js 14 (monorepo: frontend port 3081, backend/API port 3080)
- MongoDB (single `route.js` file: `app/api/[[...path]]/route.js`, ~2004 lines)
- Docker Compose (local), target: **Azure** (all services)
- Auth: JWT (7d), bcrypt 12 rounds, RBAC (admin/manager/viewer)

## Target Infrastructure (Azure)
- DB: Azure Cosmos DB for MongoDB
- Cache/Rate limiting: Azure Cache for Redis
- Email: Azure Communication Services
- Secrets: Azure Key Vault
- Hosting: Azure Container Apps
- CDN + WAF: Azure Front Door
- Payments: Stripe (setup in progress)

## Key Files
- `app/api/[[...path]]/route.js` — entire backend API (~2004 lines)
- `next.config.js` — security headers (missing CSP, HSTS)
- `docker-compose.yml` — local dev orchestration
- `.env` / `.env.example` / `.env.docker`
- `.gitignore` — MISSING .env exclusions (bug)

## Known Issues (Audit 2026-03-04)
See: `memory/audit-sprints.md` for full sprint plan
Critical: unauthenticated endpoints, mass assignment, IDOR, .env not in .gitignore
