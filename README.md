# Synthetix - AI Workforce Management Platform

**Enterprise-grade governance and management for AI agents**

![Version](https://img.shields.io/badge/Version-3.0-indigo)
![Production Ready](https://img.shields.io/badge/Production-Ready-green)

## Overview

Synthetix is an intelligent proxy system that acts as a governance layer between AI agents and LLM providers. It provides comprehensive budget management, PII protection, rate limiting, audit logging, and team collaboration for enterprise AI agent deployments.

## Features

### Core Functionality
- **Intelligent Proxy** - OpenAI-compatible endpoint with governance
- **Multi-tenant Architecture** - Organization-based data isolation
- **PII Detection & Redaction** - Automatic scanning for sensitive data
- **Critical Action Detection** - Human-in-the-loop approval workflow
- **Rate Limiting & Loop Detection** - Prevents runaway agents
- **Cost Tracking** - Real-time spend monitoring per agent

### Authentication & Security
- **JWT Authentication** - Secure token-based auth
- **Password Hashing** - bcrypt with 12 rounds
- **Password Reset Flow** - Email-based reset via Resend
- **Role-Based Access Control** - Admin, Manager, Viewer roles
- **API Key Authentication** - Per-agent API keys for proxy

### Integrations
- **Email Notifications** - Via Resend (configurable)
- **Slack Webhooks** - Real-time alerts
- **Discord Webhooks** - Real-time alerts
- **Custom Webhooks** - POST to any URL

### Analytics & Monitoring
- **Cost Analytics** - By date, model, and agent
- **Usage Analytics** - Request distribution, latency stats
- **PII Reports** - Detection frequency and types
- **Live Audit Stream** - Terminal-style log viewer

### Database Optimization
- **MongoDB Indexes** - Optimized queries
- **TTL Indexes** - 90-day audit log retention
- **Rate Limit Cleanup** - Auto-expiring records

## Environment Variables

```env
# Database
MONGO_URL=mongodb://localhost:27017
DB_NAME=synthetix_db

# Application
NEXT_PUBLIC_BASE_URL=https://your-domain.com
CORS_ORIGINS=*

# Authentication
JWT_SECRET=your-secure-random-string-here

# LLM Provider
OPENAI_API_KEY=sk-your-openai-key
OPENAI_BASE_URL=https://api.openai.com/v1

# Redis (optional - for distributed rate limiting)
REDIS_URL=redis://localhost:6379

# Email Notifications (Resend)
RESEND_API_KEY=re_your-resend-key
RESEND_FROM_EMAIL=notifications@yourdomain.com

# Demo Mode (auto-enabled if no OPENAI_API_KEY)
DEMO_MODE=true
```

## API Endpoints

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Create account + organization |
| POST | `/api/auth/login` | Sign in |
| GET | `/api/auth/me` | Get current user |
| POST | `/api/auth/forgot-password` | Request password reset |
| POST | `/api/auth/reset-password` | Reset password with token |

### Organizations
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/organizations` | List organizations |
| POST | `/api/organizations` | Create organization |
| GET | `/api/organizations/:id` | Get organization |
| PUT | `/api/organizations/:id` | Update organization |

### Agents
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/agents` | List agents |
| POST | `/api/agents` | Create agent |
| GET | `/api/agents/:id` | Get agent |
| PUT | `/api/agents/:id` | Update agent |
| DELETE | `/api/agents/:id` | Delete agent |
| POST | `/api/agents/:id/kill` | Kill switch |
| POST | `/api/agents/:id/api-key` | Generate API key |

### Team Management
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/team?org_id=x` | List team members |
| POST | `/api/team` | Add team member |
| PUT | `/api/team/:id` | Update member role |
| DELETE | `/api/team/:id` | Remove member |

### Policies
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/policies` | List policies |
| POST | `/api/policies` | Create policy |
| PUT | `/api/policies/:id` | Update policy |

### Analytics
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/analytics/costs` | Cost analytics |
| GET | `/api/analytics/usage` | Usage analytics |
| GET | `/api/analytics/pii` | PII detection stats |

### Webhooks
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/webhooks?org_id=x` | Get webhook config |
| POST | `/api/webhooks` | Update webhook config |
| POST | `/api/webhooks/test` | Test webhook |

### Other
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/audit-logs` | Get audit logs |
| GET | `/api/pending-approvals` | Get pending approvals |
| POST | `/api/pending-approvals/:id` | Approve/reject |
| GET | `/api/dashboard/stats` | Dashboard statistics |

### Intelligent Proxy
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/proxy/chat/completions` | OpenAI-compatible chat |

## Proxy Authentication

The proxy accepts two authentication methods:

### 1. API Key (Recommended for production)
```bash
curl -X POST https://your-domain.com/api/proxy/chat/completions \
  -H "Content-Type: application/json" \
  -H "X-API-Key: syx_your-agent-api-key" \
  -d '{"messages": [{"role": "user", "content": "Hello"}]}'
```

### 2. Agent ID Header
```bash
curl -X POST https://your-domain.com/api/proxy/chat/completions \
  -H "Content-Type: application/json" \
  -H "X-Agent-ID: agent-uuid" \
  -d '{"messages": [{"role": "user", "content": "Hello"}]}'
```

### Response with Telemetry
```json
{
  "choices": [...],
  "_synthetix": {
    "agent_id": "uuid",
    "cost": {"inputCost": 0.00005, "outputCost": 0.00015, "totalCost": 0.0002},
    "tokens": {"input": 10, "output": 30, "total": 40},
    "latency_ms": 245,
    "pii_detected": [],
    "safety_score": 100,
    "remaining_balance": 99.99,
    "demo_mode": false
  }
}
```

## Role-Based Access Control

| Role | Permissions |
|------|-------------|
| Admin | Full access to all features |
| Manager | Read, write, approve actions, manage agents/policies |
| Viewer | Read-only access |

## Supported LLM Models

| Model | Input $/1K | Output $/1K |
|-------|------------|-------------|
| gpt-4o | $0.005 | $0.015 |
| gpt-4o-mini | $0.00015 | $0.0006 |
| gpt-4-turbo | $0.01 | $0.03 |
| gpt-3.5-turbo | $0.0005 | $0.0015 |
| claude-3-sonnet | $0.003 | $0.015 |
| gemini-2.5-flash | $0.00035 | $0.0015 |

## PII Detection

Automatically detects and handles:
- Email addresses
- Phone numbers
- Social Security Numbers
- Credit card numbers
- IP addresses

## Critical Action Keywords

Triggers human approval for:
- Database operations: `delete database`, `drop table`, etc.
- Financial: `wire transfer`, `send money`, etc.
- HR: `terminate employee`, `fire employee`, etc.
- Security: `admin credentials`, `root access`, etc.

## Getting Started

1. Clone and install dependencies:
```bash
yarn install
```

2. Configure environment variables in `.env`

3. Start the development server:
```bash
yarn dev
```

4. Access the dashboard at `http://localhost:3000`

## Production Checklist

- [ ] Set secure `JWT_SECRET`
- [ ] Configure `OPENAI_API_KEY` (disables demo mode)
- [ ] Set up `RESEND_API_KEY` for email notifications
- [ ] Configure webhook URLs for Slack/Discord
- [ ] Set `DEMO_MODE=false`
- [ ] Enable HTTPS
- [ ] Set up MongoDB replication

## License

MIT License
