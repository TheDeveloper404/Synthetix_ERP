import { MongoClient } from 'mongodb'
import { v4 as uuidv4 } from 'uuid'
import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { redisRateLimit, blacklistToken, isTokenBlacklisted } from '../../../lib/redis.js'
import { sendEmail, passwordResetEmail, emailVerificationEmail, approvalNotificationEmail } from '../../../lib/email.js'

// ============= CONFIGURATION =============
const isProduction = process.env.NODE_ENV === 'production'
const JWT_SECRET = isProduction 
  ? (process.env.JWT_SECRET?.length >= 32 ? process.env.JWT_SECRET : (() => { throw new Error('JWT_SECRET must be at least 32 characters in production') })())
  : (process.env.JWT_SECRET || 'dev-secret-change-in-production')
const JWT_EXPIRES_IN = '7d'
const DEMO_MODE = process.env.DEMO_MODE === 'true' || !process.env.OPENAI_API_KEY
const OPENAI_API_KEY = process.env.OPENAI_API_KEY
const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1'
const AGENT_PORT_BASE = parseInt(process.env.AGENT_PORT_BASE || '3080')

// ============= STRIPE CONFIG (env vars; implement billing when ready for prod) =============
const STRIPE_PRICE_IDS = {
  starter: process.env.STRIPE_PRICE_STARTER,
  professional: process.env.STRIPE_PRICE_PROFESSIONAL,
  enterprise: process.env.STRIPE_PRICE_ENTERPRISE,
}

// ============= SUBSCRIPTION TIERS =============
const SUBSCRIPTION_TIERS = {
  free: {
    name: 'Free',
    price: 0,
    limits: {
      max_agents: 2,
      max_requests_per_day: 100,
      max_tokens_per_month: 50000,
      max_spend_per_month: 5,
      max_team_members: 1,
      rate_limit_requests: 5,
      rate_limit_window: 60,
      audit_retention_days: 7,
      features: ['basic_proxy', 'pii_redaction']
    }
  },
  starter: {
    name: 'Starter',
    price: 29,
    limits: {
      max_agents: 10,
      max_requests_per_day: 1000,
      max_tokens_per_month: 500000,
      max_spend_per_month: 100,
      max_team_members: 5,
      rate_limit_requests: 10,
      rate_limit_window: 30,
      audit_retention_days: 30,
      features: ['basic_proxy', 'pii_redaction', 'critical_actions', 'webhooks']
    }
  },
  professional: {
    name: 'Professional',
    price: 99,
    limits: {
      max_agents: 50,
      max_requests_per_day: 10000,
      max_tokens_per_month: 5000000,
      max_spend_per_month: 1000,
      max_team_members: 20,
      rate_limit_requests: 20,
      rate_limit_window: 30,
      audit_retention_days: 90,
      features: ['basic_proxy', 'pii_redaction', 'critical_actions', 'webhooks', 'analytics', 'api_keys', 'priority_support']
    }
  },
  enterprise: {
    name: 'Enterprise',
    price: 499,
    limits: {
      max_agents: -1, // unlimited
      max_requests_per_day: -1,
      max_tokens_per_month: -1,
      max_spend_per_month: -1,
      max_team_members: -1,
      rate_limit_requests: 50,
      rate_limit_window: 30,
      audit_retention_days: 365,
      features: ['basic_proxy', 'pii_redaction', 'critical_actions', 'webhooks', 'analytics', 'api_keys', 'priority_support', 'dedicated_support', 'sla', 'custom_models', 'sso']
    }
  }
}

// Get subscription limits
function getSubscriptionLimits(tier) {
  return SUBSCRIPTION_TIERS[tier]?.limits || SUBSCRIPTION_TIERS.free.limits
}

// Check if feature is available for subscription
function hasFeature(tier, feature) {
  const limits = getSubscriptionLimits(tier)
  return limits.features.includes(feature)
}

// Check subscription limit (-1 means unlimited)
function isWithinLimit(value, limit) {
  return limit === -1 || value < limit
}

// ============= DATABASE =============
let client
let db

async function connectToMongo() {
  if (!client) {
    client = new MongoClient(process.env.MONGO_URL)
    await client.connect()
    db = client.db(process.env.DB_NAME || 'synthetix')
    
    // Create indexes for production performance
    await createIndexes()
  }
  return db
}

async function createIndexes() {
  try {
    // Users collection
    await db.collection('users').createIndex({ email: 1 }, { unique: true })
    await db.collection('users').createIndex({ org_id: 1 })
    
    // Organizations
    await db.collection('organizations').createIndex({ id: 1 }, { unique: true })
    
    // Agents
    await db.collection('agents').createIndex({ id: 1 }, { unique: true })
    await db.collection('agents').createIndex({ org_id: 1 })
    await db.collection('agents').createIndex({ api_key: 1 }, { sparse: true })
    
    // Policies
    await db.collection('policies').createIndex({ id: 1 }, { unique: true })
    await db.collection('policies').createIndex({ org_id: 1 })
    
    // Audit logs - with TTL for retention (90 days)
    await db.collection('audit_logs').createIndex({ id: 1 }, { unique: true })
    await db.collection('audit_logs').createIndex({ org_id: 1, timestamp: -1 })
    await db.collection('audit_logs').createIndex({ agent_id: 1, timestamp: -1 })
    await db.collection('audit_logs').createIndex(
      { timestamp: 1 }, 
      { expireAfterSeconds: 90 * 24 * 60 * 60 } // 90 days retention
    )
    
    // Rate limiting
    await db.collection('rate_limits').createIndex({ key: 1 }, { unique: true })
    await db.collection('rate_limits').createIndex(
      { updated_at: 1 }, 
      { expireAfterSeconds: 60 } // Auto-cleanup after 60 seconds
    )
    
    // Password reset tokens
    await db.collection('password_resets').createIndex({ token: 1 }, { unique: true })
    await db.collection('password_resets').createIndex(
      { created_at: 1 },
      { expireAfterSeconds: 3600 } // 1 hour expiry
    )

    // Email verification tokens (24 hours)
    await db.collection('email_verifications').createIndex({ token: 1 }, { unique: true })
    await db.collection('email_verifications').createIndex(
      { created_at: 1 },
      { expireAfterSeconds: 86400 } // 24 hour expiry
    )
    
    // Team members
    await db.collection('team_members').createIndex({ id: 1 }, { unique: true })
    await db.collection('team_members').createIndex({ org_id: 1 })
    await db.collection('team_members').createIndex({ email: 1, org_id: 1 })
    
    // Pending approvals
    await db.collection('pending_approvals').createIndex({ id: 1 }, { unique: true })
    await db.collection('pending_approvals').createIndex({ org_id: 1, status: 1 })
    
    // Port allocations
    await db.collection('port_allocations').createIndex({ port: 1 }, { unique: true })
    await db.collection('port_allocations').createIndex({ agent_id: 1 }, { unique: true, sparse: true })
    
    // Usage tracking
    await db.collection('usage_tracking').createIndex({ org_id: 1, date: 1 }, { unique: true })
    await db.collection('usage_tracking').createIndex(
      { date: 1 }, 
      { expireAfterSeconds: 90 * 24 * 60 * 60 }
    )
    
    console.log('Database indexes created successfully')
  } catch (error) {
    // Indexes may already exist, that's fine
    console.log('Index creation:', error.message)
  }
}

// ============= INPUT VALIDATION =============
const validators = {
  email: (value) => {
    if (!value || typeof value !== 'string') return false
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    return emailRegex.test(value.toLowerCase().trim())
  },
  
  password: (value) => {
    if (!value || typeof value !== 'string') return false
    if (value.length < 8) return false
    if (!/[a-zA-Z]/.test(value)) return false
    if (!/[0-9]/.test(value)) return false
    return true
  },
  
  uuid: (value) => {
    if (!value || typeof value !== 'string') return false
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    return uuidRegex.test(value)
  },
  
  apiKey: (value) => {
    if (!value || typeof value !== 'string') return false
    return value.startsWith('syx_') && value.length > 10
  },
  
  webhookUrl: (value) => {
    if (!value) return true // Optional
    try {
      const url = new URL(value)
      // Enforce HTTPS only in production
      if (isProduction && url.protocol !== 'https:') return false
      if (!['https:', 'http:'].includes(url.protocol)) return false

      // Block SSRF: private, loopback, link-local, and metadata service IPs
      const hostname = url.hostname.toLowerCase()

      // Block localhost variants
      if (hostname === 'localhost' || hostname === '0.0.0.0') return false

      // Block by IP ranges (parsed as dotted-decimal IPv4)
      const ipv4 = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
      if (ipv4) {
        const [, a, b, c, d] = ipv4.map(Number)
        if (a === 10) return false                                    // 10.0.0.0/8
        if (a === 172 && b >= 16 && b <= 31) return false            // 172.16.0.0/12
        if (a === 192 && b === 168) return false                      // 192.168.0.0/16
        if (a === 127) return false                                   // 127.0.0.0/8 loopback
        if (a === 169 && b === 254) return false                      // 169.254.0.0/16 link-local / IMDS
        if (a === 0) return false                                     // 0.0.0.0/8
        if (a === 100 && b >= 64 && b <= 127) return false           // 100.64.0.0/10 shared address
        if (a === 198 && (b === 18 || b === 19)) return false        // 198.18.0.0/15 benchmarking
      }

      // Block Azure IMDS endpoint
      if (hostname === '169.254.169.254') return false

      return true
    } catch {
      return false
    }
  },
  
  sanitizeString: (value, maxLength = 1000) => {
    if (!value || typeof value !== 'string') return ''
    return value.trim().slice(0, maxLength)
  },
  
  sanitizeNumber: (value, min = 0, max = Number.MAX_SAFE_INTEGER) => {
    const num = parseFloat(value)
    if (isNaN(num)) return min
    return Math.max(min, Math.min(max, num))
  }
}

// ============= AUTHENTICATION HELPERS =============
async function hashPassword(password) {
  return bcrypt.hash(password, 12)
}

async function verifyPassword(password, hashedPassword) {
  return bcrypt.compare(password, hashedPassword)
}

function generateToken(userId, email, orgId, role) {
  const jti = uuidv4()
  return jwt.sign({ userId, email, orgId, role, jti }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN })
}

function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET)
  } catch {
    return null
  }
}

async function getUserFromRequest(request) {
  const authHeader = request.headers.get('authorization')
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null
  const decoded = verifyToken(authHeader.substring(7))
  if (!decoded) return null
  // Check JWT blacklist (server-side logout)
  if (decoded.jti && await isTokenBlacklisted(decoded.jti)) return null
  return decoded
}

// ============= RBAC (Role-Based Access Control) =============
const PERMISSIONS = {
  admin: ['*'], // All permissions
  manager: ['read', 'write', 'approve', 'manage_agents', 'manage_policies'],
  viewer: ['read']
}

function hasPermission(role, permission) {
  if (!role) return false
  const rolePerms = PERMISSIONS[role] || []
  return rolePerms.includes('*') || rolePerms.includes(permission)
}

async function requireAuth(request, permission = 'read') {
  const user = await getUserFromRequest(request)
  if (!user) {
    return { error: 'Unauthorized', status: 401 }
  }
  if (!hasPermission(user.role, permission)) {
    return { error: 'Forbidden - insufficient permissions', status: 403 }
  }
  return { user }
}

// ============= OWNERSHIP / MULTI-TENANT CHECK =============
// Verifies that the authenticated user belongs to the org being accessed.
// Admins with no org_id (super-admins) are allowed through.
function assertOrgAccess(user, orgId) {
  if (!orgId) return { error: 'org_id required', status: 400 }
  if (user.orgId && user.orgId !== orgId) {
    return { error: 'Forbidden - resource belongs to a different organization', status: 403 }
  }
  return { ok: true }
}

// ============= FIELD WHITELISTS (mass-assignment protection) =============
const ALLOWED_ORG_UPDATE_FIELDS = ['name', 'webhook_url', 'slack_webhook', 'discord_webhook', 'webhook_events', 'email_notifications']
const ALLOWED_AGENT_UPDATE_FIELDS = ['name', 'purpose', 'assigned_model', 'cost_cap']
const ALLOWED_TEAM_UPDATE_FIELDS = ['name', 'role']

function pickFields(obj, allowedFields) {
  return allowedFields.reduce((acc, key) => {
    if (Object.prototype.hasOwnProperty.call(obj, key)) acc[key] = obj[key]
    return acc
  }, {})
}

// ============= PORT ALLOCATION =============
async function allocatePort(agentId) {
  // Find next available port starting from AGENT_PORT_BASE
  const allocations = await db.collection('port_allocations').find({}).sort({ port: 1 }).toArray()
  const usedPorts = new Set(allocations.map(a => a.port))
  
  let port = AGENT_PORT_BASE
  while (usedPorts.has(port)) {
    port++
  }
  
  // Max 1000 ports
  if (port >= AGENT_PORT_BASE + 1000) {
    return null
  }
  
  await db.collection('port_allocations').insertOne({
    port,
    agent_id: agentId,
    allocated_at: new Date()
  })
  
  return port
}

async function deallocatePort(agentId) {
  await db.collection('port_allocations').deleteOne({ agent_id: agentId })
}

async function getAgentPort(agentId) {
  const allocation = await db.collection('port_allocations').findOne({ agent_id: agentId })
  return allocation?.port || null
}

// ============= USAGE TRACKING =============
async function trackUsage(orgId, requests = 0, tokens = 0, spend = 0) {
  const today = new Date().toISOString().slice(0, 10)
  
  await db.collection('usage_tracking').updateOne(
    { org_id: orgId, date: today },
    {
      $inc: { requests, tokens, spend },
      $setOnInsert: { org_id: orgId, date: today, created_at: new Date() }
    },
    { upsert: true }
  )
}

async function getUsageStats(orgId, days = 30) {
  const startDate = new Date()
  startDate.setDate(startDate.getDate() - days)
  const startDateStr = startDate.toISOString().slice(0, 10)
  
  const usage = await db.collection('usage_tracking').find({
    org_id: orgId,
    date: { $gte: startDateStr }
  }).toArray()
  
  const totals = usage.reduce((acc, u) => ({
    requests: acc.requests + (u.requests || 0),
    tokens: acc.tokens + (u.tokens || 0),
    spend: acc.spend + (u.spend || 0)
  }), { requests: 0, tokens: 0, spend: 0 })
  
  // Get today's usage
  const today = new Date().toISOString().slice(0, 10)
  const todayUsage = usage.find(u => u.date === today) || { requests: 0, tokens: 0, spend: 0 }
  
  return { totals, today: todayUsage, history: usage }
}

// Check if org is within subscription limits
async function checkSubscriptionLimits(orgId, tier, action = 'request') {
  const limits = getSubscriptionLimits(tier)
  const usage = await getUsageStats(orgId, 30)
  
  const checks = {
    request: {
      ok: isWithinLimit(usage.today.requests, limits.max_requests_per_day),
      message: `Daily request limit (${limits.max_requests_per_day}) exceeded`
    },
    tokens: {
      ok: isWithinLimit(usage.totals.tokens, limits.max_tokens_per_month),
      message: `Monthly token limit (${limits.max_tokens_per_month}) exceeded`
    },
    spend: {
      ok: isWithinLimit(usage.totals.spend, limits.max_spend_per_month),
      message: `Monthly spend limit ($${limits.max_spend_per_month}) exceeded`
    }
  }
  
  const check = checks[action]
  if (!check) return { allowed: true }
  
  return { allowed: check.ok, message: check.message, usage, limits }
}

// ============= RATE LIMITING (Redis primary / MongoDB fallback) =============
async function checkRateLimit(key, maxRequests = 10, windowSeconds = 30) {
  // Try Redis first (sliding window, accurate)
  const redisResult = await redisRateLimit(key, maxRequests, windowSeconds)
  if (redisResult !== null) return redisResult

  // MongoDB fallback (approximate sliding window)
  const now = Date.now()
  const windowMs = windowSeconds * 1000

  try {
    const record = await db.collection('rate_limits').findOneAndUpdate(
      { key },
      {
        $push: {
          requests: {
            $each: [now],
            $slice: -maxRequests * 2
          }
        },
        $set: { updated_at: new Date() }
      },
      { upsert: true, returnDocument: 'after' }
    )

    const requests = record?.requests || []
    const recentRequests = requests.filter(t => now - t < windowMs)

    if (recentRequests.length > maxRequests) {
      return { allowed: false, count: recentRequests.length, limit: maxRequests }
    }

    return { allowed: true, count: recentRequests.length, limit: maxRequests }
  } catch (error) {
    console.error('Rate limit error:', error)
    return { allowed: false, count: 0, limit: maxRequests } // Fail-closed
  }
}

// ============= EMAIL SERVICE (lib/email.js — ACS / Resend / log) =============
async function sendPasswordResetEmail(email, token, baseUrl) {
  const resetUrl = `${baseUrl}/reset-password?token=${token}`
  const { subject, html } = passwordResetEmail(resetUrl)
  return sendEmail(email, subject, html)
}

async function sendApprovalNotificationEmail(email, agentName, keyword, approvalId) {
  const { subject, html } = approvalNotificationEmail(agentName, keyword, approvalId)
  return sendEmail(email, subject, html)
}

// ============= WEBHOOK NOTIFICATIONS =============
async function sendWebhookNotification(webhookUrl, payload) {
  if (!webhookUrl) return { success: false, error: 'No webhook URL' }
  
  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
    return { success: response.ok, status: response.status }
  } catch (error) {
    console.error('Webhook error:', error)
    return { success: false, error: error.message }
  }
}

async function notifyAllChannels(org, event, payload) {
  const notifications = []
  
  // Check if event is enabled
  const enabledEvents = org.webhook_events || ['critical_action', 'budget_exceeded', 'agent_locked']
  if (!enabledEvents.includes(event)) return notifications
  
  // Custom webhook
  if (org.webhook_url) {
    notifications.push(sendWebhookNotification(org.webhook_url, payload))
  }
  
  // Slack
  if (org.slack_webhook) {
    const slackPayload = {
      text: `*Synthetix Alert: ${event.replace('_', ' ').toUpperCase()}*`,
      blocks: [
        { type: 'header', text: { type: 'plain_text', text: `🤖 ${event.replace('_', ' ').toUpperCase()}` } },
        { type: 'section', text: { type: 'mrkdwn', text: payload.message || JSON.stringify(payload) } }
      ]
    }
    notifications.push(sendWebhookNotification(org.slack_webhook, slackPayload))
  }
  
  // Discord
  if (org.discord_webhook) {
    const discordPayload = {
      embeds: [{
        title: `🤖 Synthetix: ${event.replace('_', ' ').toUpperCase()}`,
        description: payload.message || JSON.stringify(payload),
        color: event === 'critical_action' ? 0xf59e0b : 0x4f46e5
      }]
    }
    notifications.push(sendWebhookNotification(org.discord_webhook, discordPayload))
  }
  
  // Email notifications
  if (org.email_notifications && RESEND_API_KEY) {
    // Get org admins
    const admins = await db.collection('users').find({ org_id: org.id, role: 'admin' }).toArray()
    for (const admin of admins) {
      if (event === 'critical_action') {
        notifications.push(sendApprovalNotificationEmail(
          admin.email, 
          payload.agent_name || 'Unknown Agent',
          payload.triggered_keyword || 'Unknown',
          payload.approval_id || ''
        ))
      }
    }
  }
  
  return Promise.all(notifications)
}

// ============= COST CALCULATION =============
const MODEL_COSTS = {
  'gpt-4o': { input: 0.005, output: 0.015 },
  'gpt-4o-mini': { input: 0.00015, output: 0.0006 },
  'gpt-4.1': { input: 0.002, output: 0.008 },
  'gpt-4-turbo': { input: 0.01, output: 0.03 },
  'gpt-3.5-turbo': { input: 0.0005, output: 0.0015 },
  'claude-3-opus': { input: 0.015, output: 0.075 },
  'claude-3-sonnet': { input: 0.003, output: 0.015 },
  'claude-sonnet-4-5-20250929': { input: 0.003, output: 0.015 },
  'claude-4-sonnet-20250514': { input: 0.003, output: 0.015 },
  'gemini-2.5-flash': { input: 0.00035, output: 0.0015 },
  'gemini-3-flash-preview': { input: 0.0005, output: 0.002 },
  'default': { input: 0.005, output: 0.015 }
}

function calculateCost(model, inputTokens, outputTokens) {
  const costs = MODEL_COSTS[model] || MODEL_COSTS['default']
  const inputCost = (inputTokens / 1000) * costs.input
  const outputCost = (outputTokens / 1000) * costs.output
  return {
    inputCost: parseFloat(inputCost.toFixed(6)),
    outputCost: parseFloat(outputCost.toFixed(6)),
    totalCost: parseFloat((inputCost + outputCost).toFixed(6))
  }
}

function estimateTokens(text) {
  return Math.ceil((text || '').length / 4)
}

// ============= PII DETECTION =============
const PII_PATTERNS = [
  { name: 'email', pattern: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, replacement: '[EMAIL_REDACTED]' },
  { name: 'phone', pattern: /\b(?:\+?1[-.]?)?\(?[0-9]{3}\)?[-.]?[0-9]{3}[-.]?[0-9]{4}\b/g, replacement: '[PHONE_REDACTED]' },
  { name: 'ssn', pattern: /\b\d{3}[-]?\d{2}[-]?\d{4}\b/g, replacement: '[SSN_REDACTED]' },
  { name: 'credit_card', pattern: /\b(?:\d{4}[-\s]?){3}\d{4}\b/g, replacement: '[CREDIT_CARD_REDACTED]' },
  { name: 'ip_address', pattern: /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, replacement: '[IP_REDACTED]' }
]

function scanForPII(text, policy = 'redact') {
  let result = text
  let detectedPII = []
  
  for (const pii of PII_PATTERNS) {
    const matches = text.match(pii.pattern)
    if (matches) {
      detectedPII.push({ type: pii.name, count: matches.length })
      if (policy === 'redact') {
        result = result.replace(pii.pattern, pii.replacement)
      } else if (policy === 'block') {
        return { blocked: true, reason: `Detected ${pii.name}`, detectedPII }
      }
    }
  }
  
  return { blocked: false, text: result, detectedPII }
}

// ============= CRITICAL ACTION DETECTION =============
const CRITICAL_KEYWORDS = [
  'delete database', 'drop table', 'drop database', 'truncate table',
  'wire transfer', 'send money', 'transfer funds', 'payment',
  'sign contract', 'execute agreement', 'approve purchase',
  'terminate employee', 'fire employee', 'layoff',
  'access password', 'admin credentials', 'root access',
  'delete all', 'remove all', 'purge', 'destroy',
  'shutdown', 'reboot server', 'restart production'
]

function checkCriticalActions(text) {
  const lowerText = text.toLowerCase()
  for (const keyword of CRITICAL_KEYWORDS) {
    if (lowerText.includes(keyword)) {
      return { requiresApproval: true, keyword }
    }
  }
  return { requiresApproval: false }
}

// ============= CORS HELPER =============
const ALLOWED_ORIGINS = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map(o => o.trim())
  .filter(Boolean)

function handleCORS(response, requestOrigin) {
  const origin = ALLOWED_ORIGINS.length > 0 && requestOrigin && ALLOWED_ORIGINS.includes(requestOrigin)
    ? requestOrigin
    : (ALLOWED_ORIGINS[0] || null)

  if (origin) {
    response.headers.set('Access-Control-Allow-Origin', origin)
    response.headers.set('Vary', 'Origin')
  }
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS')
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Agent-ID, X-Org-ID, X-API-Key')
  response.headers.set('Access-Control-Allow-Credentials', 'true')
  return response
}

// ============= ERROR RESPONSE HELPER =============
function errorResponse(message, status = 400, details = null) {
  const body = { error: message }
  // Never expose internal details in production
  if (details && !isProduction) body.details = details
  return handleCORS(NextResponse.json(body, { status }))
}

// ============= OPTIONS HANDLER =============
export async function OPTIONS(request) {
  const origin = request.headers.get('origin')
  return handleCORS(new NextResponse(null, { status: 200 }), origin)
}

// ============= MAIN ROUTE HANDLER =============
async function handleRoute(request, { params }) {
  const { path = [] } = await params
  const requestOrigin = request.headers.get('origin')
  const route = `/${path.join('/')}`
  const method = request.method

  // Per-request CORS + error helpers bound to the incoming origin
  const cors = (res) => handleCORS(res, requestOrigin)
  const err = (message, status = 400, details = null) => {
    const body = { error: message }
    if (details && !isProduction) body.details = details
    return cors(NextResponse.json(body, { status }))
  }

  try {
    const db = await connectToMongo()

    // ============= HEALTH CHECK =============
    if (route === '/health' && method === 'GET') {
      return cors(NextResponse.json({ status: 'ok', timestamp: new Date().toISOString() }))
    }

    // ============= ROOT =============
    if ((route === '/root' || route === '/') && method === 'GET') {
      return cors(NextResponse.json({ 
        message: "Synthetix ERP API",
        version: "3.0.0",
        demo_mode: DEMO_MODE,
        endpoints: [
          '/api/auth/register', '/api/auth/login', '/api/auth/logout', '/api/auth/me',
          '/api/auth/forgot-password', '/api/auth/reset-password',
          '/api/organizations', '/api/agents', '/api/policies',
          '/api/team', '/api/audit-logs', '/api/pending-approvals',
          '/api/analytics/costs', '/api/analytics/usage', '/api/analytics/pii',
          '/api/webhooks', '/api/proxy/chat/completions'
        ]
      }))
    }

    // ============= AUTH: REGISTER =============
    if (route === '/auth/register' && method === 'POST') {
      const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
      const regRateCheck = await checkRateLimit(`auth:register:${clientIp}`, 5, 3600)
      if (!regRateCheck.allowed) return err('Too many registration attempts. Try again later.', 429)

      const body = await request.json()
      const email = validators.sanitizeString(body.email, 255).toLowerCase()
      const password = body.password
      const name = validators.sanitizeString(body.name, 100)
      const orgName = validators.sanitizeString(body.organization_name, 100)

      if (!validators.email(email)) {
        return err('Invalid email format')
      }
      if (!validators.password(password)) {
        return err('Password must be at least 8 characters and contain at least one letter and one number')
      }
      if (!name) {
        return err('Name is required')
      }
      
      const existingUser = await db.collection('users').findOne({ email })
      if (existingUser) {
        return err('User already exists', 409)
      }
      
      let orgId = null
      if (orgName) {
        const org = {
          id: uuidv4(),
          name: orgName,
          subscription_tier: 'free', // Start with free, upgrade after
          subscription_status: 'pending_selection', // Need to select plan
          global_spending_limit: getSubscriptionLimits('free').max_spend_per_month,
          current_spend: 0,
          webhook_url: null,
          slack_webhook: null,
          discord_webhook: null,
          webhook_events: ['critical_action', 'budget_exceeded', 'agent_locked'],
          email_notifications: true,
          created_at: new Date(),
          updated_at: new Date()
        }
        await db.collection('organizations').insertOne(org)
        orgId = org.id
      }
      
      const hashedPassword = await hashPassword(password)
      const user = {
        id: uuidv4(),
        email,
        password: hashedPassword,
        name,
        org_id: orgId,
        role: 'admin',
        email_verified: false,
        created_at: new Date(),
        updated_at: new Date()
      }
      await db.collection('users').insertOne(user)

      // Send verification email (best-effort, don't block registration)
      try {
        const verifyToken = uuidv4()
        await db.collection('email_verifications').insertOne({
          token: verifyToken,
          user_id: user.id,
          email,
          created_at: new Date()
        })
        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'
        const verifyUrl = `${baseUrl}/verify-email?token=${verifyToken}`
        const { subject, html } = emailVerificationEmail(verifyUrl)
        await sendEmail(email, subject, html)
      } catch (e) {
        console.error('[Register] Failed to send verification email:', e.message)
      }

      const authToken = generateToken(user.id, user.email, user.org_id, user.role)

      return cors(NextResponse.json({
        message: 'Registration successful. Please verify your email.',
        token: authToken,
        user: { id: user.id, email: user.email, name: user.name, org_id: user.org_id, role: user.role }
      }, { status: 201 }))
    }

    // ============= AUTH: VERIFY EMAIL =============
    if (route === '/auth/verify-email' && method === 'GET') {
      const token = request.nextUrl?.searchParams?.get('token') || new URL(request.url).searchParams.get('token')
      if (!token) return err('Token required')

      const record = await db.collection('email_verifications').findOne({ token })
      if (!record) return err('Invalid or expired verification token', 400)

      await db.collection('users').updateOne(
        { id: record.user_id },
        { $set: { email_verified: true, updated_at: new Date() } }
      )
      await db.collection('email_verifications').deleteOne({ token })

      return cors(NextResponse.json({ message: 'Email verified successfully' }))
    }

    // ============= AUTH: LOGIN =============
    if (route === '/auth/login' && method === 'POST') {
      const body = await request.json()
      const email = validators.sanitizeString(body.email, 255).toLowerCase()
      const password = body.password

      if (!email || !password) {
        return err('Email and password required')
      }

      // Rate limit: 10 attempts per 15 min per email + IP combined
      const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
      const loginRateCheck = await checkRateLimit(`auth:login:${email}:${clientIp}`, 10, 900)
      if (!loginRateCheck.allowed) return err('Too many login attempts. Try again in 15 minutes.', 429)

      const user = await db.collection('users').findOne({ email })
      if (!user) {
        return err('Invalid credentials', 401)
      }

      const isValid = await verifyPassword(password, user.password)
      if (!isValid) {
        return err('Invalid credentials', 401)
      }
      
      await db.collection('users').updateOne(
        { id: user.id },
        { $set: { last_login: new Date() } }
      )
      
      const token = generateToken(user.id, user.email, user.org_id, user.role)
      
      return cors(NextResponse.json({
        message: 'Login successful',
        token,
        user: { id: user.id, email: user.email, name: user.name, org_id: user.org_id, role: user.role }
      }))
    }
    
    // ============= AUTH: CURRENT USER =============
    if (route === '/auth/me' && method === 'GET') {
      const auth = await requireAuth(request)
      if (auth.error) return err(auth.error, auth.status)
      
      const user = await db.collection('users').findOne({ id: auth.user.userId })
      if (!user) return err('User not found', 404)
      
      const org = user.org_id ? await db.collection('organizations').findOne({ id: user.org_id }) : null
      
      return cors(NextResponse.json({
        user: { id: user.id, email: user.email, name: user.name, org_id: user.org_id, role: user.role },
        organization: org ? { id: org.id, name: org.name, subscription_tier: org.subscription_tier } : null
      }))
    }
    
    // ============= AUTH: FORGOT PASSWORD =============
    if (route === '/auth/forgot-password' && method === 'POST') {
      const body = await request.json()
      const email = validators.sanitizeString(body.email, 255).toLowerCase()

      if (!validators.email(email)) {
        return err('Invalid email')
      }

      // Rate limit: 3 reset requests per hour per email
      const forgotRateCheck = await checkRateLimit(`auth:forgot:${email}`, 3, 3600)
      if (!forgotRateCheck.allowed) return err('Too many reset attempts. Try again later.', 429)
      
      const user = await db.collection('users').findOne({ email })
      if (user) {
        const token = uuidv4()
        await db.collection('password_resets').insertOne({
          token,
          user_id: user.id,
          email,
          created_at: new Date()
        })
        
        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'
        await sendPasswordResetEmail(email, token, baseUrl)
      }
      
      // Always return success to prevent email enumeration
      return cors(NextResponse.json({
        message: 'If an account exists, a reset link has been sent'
      }))
    }
    
    // ============= AUTH: RESET PASSWORD =============
    if (route === '/auth/reset-password' && method === 'POST') {
      const body = await request.json()
      const { token, password } = body
      
      if (!token || !validators.password(password)) {
        return err('Invalid token or password')
      }
      
      const resetRecord = await db.collection('password_resets').findOne({ token })
      if (!resetRecord) {
        return err('Invalid or expired reset token', 400)
      }
      
      const hashedPassword = await hashPassword(password)
      await db.collection('users').updateOne(
        { id: resetRecord.user_id },
        { $set: { password: hashedPassword, updated_at: new Date() } }
      )
      
      await db.collection('password_resets').deleteOne({ token })

      return cors(NextResponse.json({ message: 'Password reset successful' }))
    }

    // ============= AUTH: LOGOUT =============
    if (route === '/auth/logout' && method === 'POST') {
      const authHeader = request.headers.get('authorization')
      if (authHeader?.startsWith('Bearer ')) {
        const token = authHeader.substring(7)
        const decoded = verifyToken(token)
        if (decoded?.jti && decoded?.exp) {
          const ttlSeconds = Math.max(0, decoded.exp - Math.floor(Date.now() / 1000))
          if (ttlSeconds > 0) {
            await blacklistToken(decoded.jti, ttlSeconds)
          }
        }
      }
      return cors(NextResponse.json({ message: 'Logged out successfully' }))
    }

    // ============= SUBSCRIPTION TIERS =============
    if (route === '/subscriptions/tiers' && method === 'GET') {
      return cors(NextResponse.json({
        tiers: Object.entries(SUBSCRIPTION_TIERS).map(([key, tier]) => ({
          id: key,
          name: tier.name,
          price: tier.price,
          limits: tier.limits
        }))
      }))
    }

    // Select FREE subscription — paid tiers go through /subscriptions/checkout (Stripe)
    if (route === '/subscriptions/select' && method === 'POST') {
      const auth = await requireAuth(request, 'write')
      if (auth.error) return err(auth.error, auth.status)

      const body = await request.json()
      const { tier } = body
      const orgId = auth.user.orgId  // Always use authenticated user's org

      if (!tier) return err('tier required')
      if (!SUBSCRIPTION_TIERS[tier]) return err('Invalid subscription tier')

      const limits = getSubscriptionLimits(tier)

      await db.collection('organizations').updateOne(
        { id: orgId },
        { $set: {
          subscription_tier: tier,
          subscription_status: 'active',
          subscription_selected_at: new Date(),
          global_spending_limit: limits.max_spend_per_month === -1 ? 100000 : limits.max_spend_per_month,
          updated_at: new Date()
        }}
      )

      return cors(NextResponse.json({ message: 'Subscription selected', tier, limits }))
    }

    // Get subscription status and usage
    if (route === '/subscriptions/status' && method === 'GET') {
      const auth = await requireAuth(request)
      if (auth.error) return err(auth.error, auth.status)

      const orgId = auth.user.orgId

      const org = await db.collection('organizations').findOne({ id: orgId })
      if (!org) return err('Organization not found', 404)

      const tier = org.subscription_tier || 'free'
      const limits = getSubscriptionLimits(tier)
      const usage = await getUsageStats(orgId, 30)
      const agentCount = await db.collection('agents').countDocuments({ org_id: orgId })
      const teamCount = await db.collection('team_members').countDocuments({ org_id: orgId })

      return cors(NextResponse.json({
        subscription: {
          tier,
          name: SUBSCRIPTION_TIERS[tier]?.name || 'Free',
          status: org.subscription_status || 'active',
          selected_at: org.subscription_selected_at
        },
        limits,
        usage: {
          agents: { used: agentCount, limit: limits.max_agents },
          team_members: { used: teamCount, limit: limits.max_team_members },
          requests_today: { used: usage.today.requests, limit: limits.max_requests_per_day },
          tokens_this_month: { used: usage.totals.tokens, limit: limits.max_tokens_per_month },
          spend_this_month: { used: usage.totals.spend, limit: limits.max_spend_per_month }
        },
        features: limits.features
      }))
    }

    // Upgrade subscription (dev only) — production upgrades go through Stripe /subscriptions/checkout
    if (route === '/subscriptions/upgrade' && method === 'POST') {
      const auth = await requireAuth(request, 'write')
      if (auth.error) return err(auth.error, auth.status)

      const body = await request.json()
      const { tier } = body
      const orgId = auth.user.orgId  // Always use authenticated user's org

      if (!tier) return err('tier required')
      if (!SUBSCRIPTION_TIERS[tier]) return err('Invalid tier')

      const org = await db.collection('organizations').findOne({ id: orgId })
      if (!org) return err('Organization not found', 404)

      const currentTier = org.subscription_tier || 'free'
      const tierOrder = ['free', 'starter', 'professional', 'enterprise']

      if (tierOrder.indexOf(tier) <= tierOrder.indexOf(currentTier)) {
        return err('Can only upgrade to a higher tier')
      }

      const limits = getSubscriptionLimits(tier)

      await db.collection('organizations').updateOne(
        { id: orgId },
        { $set: {
          subscription_tier: tier,
          subscription_status: 'active',
          subscription_upgraded_at: new Date(),
          global_spending_limit: limits.max_spend_per_month === -1 ? 100000 : limits.max_spend_per_month,
          updated_at: new Date()
        }}
      )

      await db.collection('audit_logs').insertOne({
        id: uuidv4(),
        org_id: orgId,
        action: 'SUBSCRIPTION_UPGRADED',
        status: 'completed',
        details: { from: currentTier, to: tier, upgraded_by: auth.user.userId },
        timestamp: new Date()
      })

      return cors(NextResponse.json({ message: 'Subscription upgraded', tier, limits }))
    }

    // ============= STRIPE BILLING (placeholders — implement when ready for prod) =============

    // POST /subscriptions/checkout — creates a Stripe Checkout Session for paid plans
    // TODO (when ready for prod):
    //   1. const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)
    //   2. Find or create stripe_customer_id on the org
    //   3. const session = await stripe.checkout.sessions.create({ mode: 'subscription', line_items: [{ price: STRIPE_PRICE_IDS[tier], quantity: 1 }], ... })
    //   4. return cors(NextResponse.json({ url: session.url }))
    if (route === '/subscriptions/checkout' && method === 'POST') {
      const auth = await requireAuth(request, 'write')
      if (auth.error) return err(auth.error, auth.status)
      return err('Stripe billing not yet configured. Use /subscriptions/select for the free plan or contact support.', 501)
    }

    // POST /subscriptions/portal — redirects to Stripe Customer Portal (manage billing, cancel, change card)
    // TODO (when ready for prod):
    //   1. const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)
    //   2. Fetch org.stripe_customer_id from DB
    //   3. const session = await stripe.billingPortal.sessions.create({ customer: stripe_customer_id, return_url: baseUrl })
    //   4. return cors(NextResponse.json({ url: session.url }))
    if (route === '/subscriptions/portal' && method === 'POST') {
      const auth = await requireAuth(request, 'write')
      if (auth.error) return err(auth.error, auth.status)
      return err('Stripe billing portal not yet configured.', 501)
    }

    // POST /webhooks/stripe — receives Stripe events (subscription changes, payment failures, etc.)
    // TODO (when ready for prod):
    //   IMPORTANT: must read rawBody as text (not JSON) for signature verification
    //   const sig = request.headers.get('stripe-signature')
    //   const event = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET)
    //   Handle: checkout.session.completed, customer.subscription.updated, customer.subscription.deleted, invoice.payment_failed
    if (route === '/webhooks/stripe' && method === 'POST') {
      return cors(NextResponse.json({ received: true }))
    }

    // ============= ORGANIZATIONS =============
    if (route === '/organizations' && method === 'GET') {
      const auth = await requireAuth(request)
      if (auth.error) return err(auth.error, auth.status)
      // Each user sees only their own org
      const query = { id: auth.user.orgId }
      const orgs = await db.collection('organizations').find(query).toArray()
      return cors(NextResponse.json(orgs.map(({ _id, ...rest }) => rest)))
    }

    if (route === '/organizations' && method === 'POST') {
      // Organization creation is part of register flow — protected by register rate limit
      const auth = await requireAuth(request, 'write')
      if (auth.error) return err(auth.error, auth.status)

      const body = await request.json()
      const org = {
        id: uuidv4(),
        name: validators.sanitizeString(body.name, 100),
        subscription_tier: 'free',
        subscription_status: 'pending_selection',
        global_spending_limit: 0,
        current_spend: 0,
        webhook_url: null,
        slack_webhook: null,
        discord_webhook: null,
        webhook_events: ['critical_action', 'budget_exceeded', 'agent_locked'],
        email_notifications: true,
        created_at: new Date(),
        updated_at: new Date()
      }

      if (!org.name) return err('Organization name required')

      await db.collection('organizations').insertOne(org)
      const { _id, ...result } = org
      return cors(NextResponse.json(result, { status: 201 }))
    }

    if (route.match(/^\/organizations\/[^/]+$/) && method === 'GET') {
      const auth = await requireAuth(request)
      if (auth.error) return err(auth.error, auth.status)

      const orgId = path[1]
      if (!validators.uuid(orgId)) return err('Invalid organization ID')

      const ownershipCheck = assertOrgAccess(auth.user, orgId)
      if (ownershipCheck.error) return err(ownershipCheck.error, ownershipCheck.status)

      const org = await db.collection('organizations').findOne({ id: orgId })
      if (!org) return err('Organization not found', 404)

      const { _id, ...result } = org
      return cors(NextResponse.json(result))
    }

    if (route.match(/^\/organizations\/[^/]+$/) && method === 'PUT') {
      const auth = await requireAuth(request, 'write')
      if (auth.error) return err(auth.error, auth.status)

      const orgId = path[1]
      const ownershipCheck = assertOrgAccess(auth.user, orgId)
      if (ownershipCheck.error) return err(ownershipCheck.error, ownershipCheck.status)

      const body = await request.json()
      // Whitelist: only safe fields, no subscription/billing fields
      const updateData = { ...pickFields(body, ALLOWED_ORG_UPDATE_FIELDS), updated_at: new Date() }

      const result = await db.collection('organizations').findOneAndUpdate(
        { id: orgId },
        { $set: updateData },
        { returnDocument: 'after' }
      )

      if (!result) return err('Organization not found', 404)
      const { _id, ...response } = result
      return cors(NextResponse.json(response))
    }

    // ============= AGENTS =============
    if (route === '/agents' && method === 'GET') {
      const auth = await requireAuth(request)
      if (auth.error) return err(auth.error, auth.status)
      // Always filter by the authenticated user's org — ignore any org_id query param
      const agents = await db.collection('agents').find({ org_id: auth.user.orgId }).toArray()
      return cors(NextResponse.json(agents.map(({ _id, api_key, ...rest }) => rest)))
    }

    if (route === '/agents' && method === 'POST') {
      const auth = await requireAuth(request, 'write')
      if (auth.error) return err(auth.error, auth.status)

      const body = await request.json()
      if (!body.name) return err('Agent name required')

      // Always create agent in the authenticated user's org
      const orgId = auth.user.orgId
      const org = await db.collection('organizations').findOne({ id: orgId })
      if (!org) return err('Organization not found', 404)

      const tier = org.subscription_tier || 'free'
      const limits = getSubscriptionLimits(tier)
      const agentCount = await db.collection('agents').countDocuments({ org_id: orgId })

      if (!isWithinLimit(agentCount, limits.max_agents)) {
        return err(
          `Agent limit reached. Your ${SUBSCRIPTION_TIERS[tier]?.name || 'Free'} plan allows ${limits.max_agents} agent${limits.max_agents !== 1 ? 's' : ''}. Please upgrade to add more agents.`,
          402,
          { current_count: agentCount, limit: limits.max_agents, tier, upgrade_url: '/settings#subscription' }
        )
      }

      const agentId = uuidv4()
      const allocatedPort = await allocatePort(agentId)

      const agent = {
        id: agentId,
        org_id: orgId,
        name: validators.sanitizeString(body.name, 100),
        purpose: validators.sanitizeString(body.purpose, 500) || 'General Assistant',
        assigned_model: body.assigned_model || 'gpt-4o',
        cost_cap: validators.sanitizeNumber(body.cost_cap, 1, 100000),
        current_balance: validators.sanitizeNumber(body.cost_cap, 1, 100000),
        total_spend: 0,
        total_requests: 0,
        total_tokens: 0,
        status: 'active',
        api_key: null,
        port: allocatedPort,
        created_at: new Date(),
        updated_at: new Date(),
        last_active: null
      }

      await db.collection('agents').insertOne(agent)
      const { _id, ...result } = agent
      return cors(NextResponse.json(result, { status: 201 }))
    }

    if (route.match(/^\/agents\/[^/]+$/) && method === 'GET') {
      const auth = await requireAuth(request)
      if (auth.error) return err(auth.error, auth.status)

      const agentId = path[1]
      const agent = await db.collection('agents').findOne({ id: agentId })
      if (!agent) return err('Agent not found', 404)

      const ownershipCheck = assertOrgAccess(auth.user, agent.org_id)
      if (ownershipCheck.error) return err(ownershipCheck.error, ownershipCheck.status)

      const { _id, api_key, ...result } = agent
      return cors(NextResponse.json(result))
    }

    if (route.match(/^\/agents\/[^/]+$/) && method === 'PUT') {
      const auth = await requireAuth(request, 'manage_agents')
      if (auth.error) return err(auth.error, auth.status)

      const agentId = path[1]
      const agent = await db.collection('agents').findOne({ id: agentId })
      if (!agent) return err('Agent not found', 404)

      const ownershipCheck = assertOrgAccess(auth.user, agent.org_id)
      if (ownershipCheck.error) return err(ownershipCheck.error, ownershipCheck.status)

      const body = await request.json()
      // Whitelist: only safe editable fields
      const updateData = { ...pickFields(body, ALLOWED_AGENT_UPDATE_FIELDS), updated_at: new Date() }

      const result = await db.collection('agents').findOneAndUpdate(
        { id: agentId },
        { $set: updateData },
        { returnDocument: 'after' }
      )

      if (!result) return err('Agent not found', 404)
      const { _id, api_key, ...response } = result
      return cors(NextResponse.json(response))
    }

    if (route.match(/^\/agents\/[^/]+$/) && method === 'DELETE') {
      const auth = await requireAuth(request, 'manage_agents')
      if (auth.error) return err(auth.error, auth.status)

      const agentId = path[1]
      const agent = await db.collection('agents').findOne({ id: agentId })
      if (!agent) return err('Agent not found', 404)

      const ownershipCheck = assertOrgAccess(auth.user, agent.org_id)
      if (ownershipCheck.error) return err(ownershipCheck.error, ownershipCheck.status)

      await db.collection('agents').deleteOne({ id: agentId })
      await deallocatePort(agentId)

      return cors(NextResponse.json({ message: 'Agent deleted' }))
    }

    // Kill agent
    if (route.match(/^\/agents\/[^/]+\/kill$/) && method === 'POST') {
      const auth = await requireAuth(request, 'manage_agents')
      if (auth.error) return err(auth.error, auth.status)

      const agentId = path[1]
      const agentToKill = await db.collection('agents').findOne({ id: agentId })
      if (!agentToKill) return err('Agent not found', 404)

      const ownershipCheck = assertOrgAccess(auth.user, agentToKill.org_id)
      if (ownershipCheck.error) return err(ownershipCheck.error, ownershipCheck.status)

      const result = await db.collection('agents').findOneAndUpdate(
        { id: agentId },
        { $set: { status: 'locked', locked_reason: 'Manual kill switch', updated_at: new Date() } },
        { returnDocument: 'after' }
      )

      await db.collection('audit_logs').insertOne({
        id: uuidv4(),
        agent_id: agentId,
        org_id: result.org_id,
        action: 'KILL_SWITCH',
        status: 'completed',
        details: { reason: 'Manual kill switch', triggered_by: auth.user.userId },
        timestamp: new Date()
      })

      const org = await db.collection('organizations').findOne({ id: result.org_id })
      if (org) {
        notifyAllChannels(org, 'agent_locked', {
          agent_id: agentId,
          agent_name: result.name,
          reason: 'Manual kill switch',
          message: `Agent "${result.name}" was locked via kill switch`
        })
      }

      const { _id, api_key, ...response } = result
      return cors(NextResponse.json(response))
    }

    // Generate API key
    if (route.match(/^\/agents\/[^/]+\/api-key$/) && method === 'POST') {
      const auth = await requireAuth(request, 'manage_agents')
      if (auth.error) return err(auth.error, auth.status)

      const agentId = path[1]
      const agentForKey = await db.collection('agents').findOne({ id: agentId })
      if (!agentForKey) return err('Agent not found', 404)

      const ownershipCheck = assertOrgAccess(auth.user, agentForKey.org_id)
      if (ownershipCheck.error) return err(ownershipCheck.error, ownershipCheck.status)

      const apiKey = `syx_${uuidv4().replace(/-/g, '')}`
      await db.collection('agents').updateOne(
        { id: agentId },
        { $set: { api_key: apiKey, updated_at: new Date() } }
      )

      return cors(NextResponse.json({ api_key: apiKey }))
    }

    // ============= TEAM MANAGEMENT =============
    if (route === '/team' && method === 'GET') {
      const auth = await requireAuth(request)
      if (auth.error) return err(auth.error, auth.status)
      // Always return members of the authenticated user's org
      const members = await db.collection('team_members').find({ org_id: auth.user.orgId }).toArray()
      return cors(NextResponse.json(members.map(({ _id, ...rest }) => rest)))
    }

    if (route === '/team' && method === 'POST') {
      const auth = await requireAuth(request, 'write')
      if (auth.error) return err(auth.error, auth.status)

      const body = await request.json()
      const email = validators.sanitizeString(body.email, 255).toLowerCase()
      const orgId = auth.user.orgId

      if (!validators.email(email)) return err('Invalid email')

      const existing = await db.collection('team_members').findOne({ email, org_id: orgId })
      if (existing) return err('Member already exists', 409)

      const member = {
        id: uuidv4(),
        org_id: orgId,
        email,
        name: validators.sanitizeString(body.name, 100),
        role: ['admin', 'manager', 'viewer'].includes(body.role) ? body.role : 'viewer',
        status: 'invited',
        created_at: new Date()
      }

      await db.collection('team_members').insertOne(member)
      const { _id, ...result } = member
      return cors(NextResponse.json(result, { status: 201 }))
    }

    if (route.match(/^\/team\/[^/]+$/) && method === 'PUT') {
      const auth = await requireAuth(request, 'write')
      if (auth.error) return err(auth.error, auth.status)

      const memberId = path[1]
      const memberToUpdate = await db.collection('team_members').findOne({ id: memberId })
      if (!memberToUpdate) return err('Member not found', 404)

      const ownershipCheck = assertOrgAccess(auth.user, memberToUpdate.org_id)
      if (ownershipCheck.error) return err(ownershipCheck.error, ownershipCheck.status)

      const body = await request.json()
      if (body.role && !['admin', 'manager', 'viewer'].includes(body.role)) {
        return err('Invalid role')
      }

      // Whitelist: only safe editable fields
      const updateData = { ...pickFields(body, ALLOWED_TEAM_UPDATE_FIELDS), updated_at: new Date() }

      const result = await db.collection('team_members').findOneAndUpdate(
        { id: memberId },
        { $set: updateData },
        { returnDocument: 'after' }
      )

      const { _id, ...response } = result
      return cors(NextResponse.json(response))
    }

    if (route.match(/^\/team\/[^/]+$/) && method === 'DELETE') {
      const auth = await requireAuth(request, 'write')
      if (auth.error) return err(auth.error, auth.status)

      const memberId = path[1]
      const memberToDelete = await db.collection('team_members').findOne({ id: memberId })
      if (!memberToDelete) return err('Member not found', 404)

      const ownershipCheck = assertOrgAccess(auth.user, memberToDelete.org_id)
      if (ownershipCheck.error) return err(ownershipCheck.error, ownershipCheck.status)

      await db.collection('team_members').deleteOne({ id: memberId })
      return cors(NextResponse.json({ message: 'Member removed' }))
    }

    // ============= POLICIES =============
    if (route === '/policies' && method === 'GET') {
      const auth = await requireAuth(request)
      if (auth.error) return err(auth.error, auth.status)
      const policies = await db.collection('policies').find({ org_id: auth.user.orgId }).toArray()
      return cors(NextResponse.json(policies.map(({ _id, ...rest }) => rest)))
    }

    if (route === '/policies' && method === 'POST') {
      const auth = await requireAuth(request, 'write')
      if (auth.error) return err(auth.error, auth.status)

      const body = await request.json()
      const policy = {
        id: uuidv4(),
        org_id: auth.user.orgId,
        name: validators.sanitizeString(body.name, 100),
        type: validators.sanitizeString(body.type, 50),
        enabled: body.enabled !== false,
        config: body.config || {},
        created_at: new Date(),
        updated_at: new Date()
      }

      if (!policy.name || !policy.type) {
        return err('name and type required')
      }

      await db.collection('policies').insertOne(policy)
      const { _id, ...result } = policy
      return cors(NextResponse.json(result, { status: 201 }))
    }

    if (route.match(/^\/policies\/[^/]+$/) && method === 'PUT') {
      const auth = await requireAuth(request, 'manage_policies')
      if (auth.error) return err(auth.error, auth.status)

      const policyId = path[1]
      const policyToUpdate = await db.collection('policies').findOne({ id: policyId })
      if (!policyToUpdate) return err('Policy not found', 404)

      const ownershipCheck = assertOrgAccess(auth.user, policyToUpdate.org_id)
      if (ownershipCheck.error) return err(ownershipCheck.error, ownershipCheck.status)

      const body = await request.json()
      const updateData = {
        name: body.name ? validators.sanitizeString(body.name, 100) : undefined,
        enabled: typeof body.enabled === 'boolean' ? body.enabled : undefined,
        config: body.config || undefined,
        updated_at: new Date()
      }
      // Remove undefined keys
      Object.keys(updateData).forEach(k => updateData[k] === undefined && delete updateData[k])

      const result = await db.collection('policies').findOneAndUpdate(
        { id: policyId },
        { $set: updateData },
        { returnDocument: 'after' }
      )

      const { _id, ...response } = result
      return cors(NextResponse.json(response))
    }

    // ============= AUDIT LOGS =============
    if (route === '/audit-logs' && method === 'GET') {
      const auth = await requireAuth(request)
      if (auth.error) return err(auth.error, auth.status)

      const url = new URL(request.url)
      const agentId = url.searchParams.get('agent_id')
      const limit = validators.sanitizeNumber(url.searchParams.get('limit'), 1, 1000) || 100

      // Always scope to authenticated user's org
      const query = { org_id: auth.user.orgId }
      if (agentId) query.agent_id = agentId

      const logs = await db.collection('audit_logs')
        .find(query)
        .sort({ timestamp: -1 })
        .limit(limit)
        .toArray()

      return cors(NextResponse.json(logs.map(({ _id, ...rest }) => rest)))
    }

    // ============= PENDING APPROVALS =============
    if (route === '/pending-approvals' && method === 'GET') {
      const auth = await requireAuth(request)
      if (auth.error) return err(auth.error, auth.status)
      // Always scope to authenticated user's org
      const approvals = await db.collection('pending_approvals')
        .find({ org_id: auth.user.orgId, status: 'pending_approval' })
        .toArray()
      return cors(NextResponse.json(approvals.map(({ _id, ...rest }) => rest)))
    }

    if (route.match(/^\/pending-approvals\/[^/]+$/) && method === 'POST') {
      const auth = await requireAuth(request, 'approve')
      if (auth.error) return err(auth.error, auth.status)

      const approvalId = path[1]
      const body = await request.json()
      const action = body.action

      if (!['approve', 'reject'].includes(action)) {
        return err('Action must be approve or reject')
      }

      const approval = await db.collection('pending_approvals').findOne({ id: approvalId })
      if (!approval) return err('Approval not found', 404)

      const ownershipCheck = assertOrgAccess(auth.user, approval.org_id)
      if (ownershipCheck.error) return err(ownershipCheck.error, ownershipCheck.status)

      await db.collection('pending_approvals').updateOne(
        { id: approvalId },
        { $set: { status: action === 'approve' ? 'approved' : 'rejected', resolved_at: new Date(), resolved_by: auth.user.userId } }
      )

      await db.collection('audit_logs').insertOne({
        id: uuidv4(),
        agent_id: approval.agent_id,
        org_id: approval.org_id,
        action: action === 'approve' ? 'APPROVAL_GRANTED' : 'APPROVAL_REJECTED',
        status: 'completed',
        details: { approval_id: approvalId, keyword: approval.triggered_keyword, resolved_by: auth.user.email },
        timestamp: new Date()
      })

      return cors(NextResponse.json({ message: `Action ${action}ed` }))
    }

    // ============= WEBHOOKS =============
    if (route === '/webhooks' && method === 'GET') {
      const auth = await requireAuth(request)
      if (auth.error) return err(auth.error, auth.status)

      const org = await db.collection('organizations').findOne({ id: auth.user.orgId })
      if (!org) return err('Organization not found', 404)

      return cors(NextResponse.json({
        webhook_url: org.webhook_url || null,
        slack_webhook: org.slack_webhook || null,
        discord_webhook: org.discord_webhook || null,
        webhook_events: org.webhook_events || ['critical_action', 'budget_exceeded', 'agent_locked'],
        email_notifications: org.email_notifications !== false
      }))
    }

    if (route === '/webhooks' && method === 'POST') {
      const auth = await requireAuth(request, 'write')
      if (auth.error) return err(auth.error, auth.status)

      const body = await request.json()
      const { webhook_url, slack_webhook, discord_webhook, webhook_events, email_notifications } = body
      const orgId = auth.user.orgId

      if (webhook_url && !validators.webhookUrl(webhook_url)) return err('Invalid webhook URL')
      if (slack_webhook && !validators.webhookUrl(slack_webhook)) return err('Invalid Slack webhook URL')
      if (discord_webhook && !validators.webhookUrl(discord_webhook)) return err('Invalid Discord webhook URL')

      await db.collection('organizations').updateOne(
        { id: orgId },
        { $set: {
          webhook_url: webhook_url || null,
          slack_webhook: slack_webhook || null,
          discord_webhook: discord_webhook || null,
          webhook_events: webhook_events || ['critical_action', 'budget_exceeded', 'agent_locked'],
          email_notifications: email_notifications !== false,
          updated_at: new Date()
        }}
      )

      return cors(NextResponse.json({ message: 'Webhook configuration saved' }))
    }

    if (route === '/webhooks/test' && method === 'POST') {
      const auth = await requireAuth(request, 'write')
      if (auth.error) return err(auth.error, auth.status)

      const body = await request.json()
      const { type } = body
      const orgId = auth.user.orgId

      const org = await db.collection('organizations').findOne({ id: orgId })
      if (!org) return err('Organization not found', 404)

      const testPayload = {
        event: 'test',
        message: 'Synthetix webhook test - your integration is working!',
        timestamp: new Date().toISOString(),
        org_id: orgId
      }

      let result = { success: false, error: 'No webhook configured for this type' }

      if (type === 'slack' && org.slack_webhook) {
        result = await sendWebhookNotification(org.slack_webhook, {
          text: `✅ *Synthetix Test*\nYour Slack integration is working!\n_${new Date().toISOString()}_`
        })
      } else if (type === 'discord' && org.discord_webhook) {
        result = await sendWebhookNotification(org.discord_webhook, {
          embeds: [{
            title: '✅ Synthetix Test',
            description: 'Your Discord integration is working!',
            color: 0x4f46e5,
            timestamp: new Date().toISOString()
          }]
        })
      } else if ((type === 'custom' || !type) && org.webhook_url) {
        result = await sendWebhookNotification(org.webhook_url, testPayload)
      }

      return cors(NextResponse.json(result))
    }

    // ============= ANALYTICS =============
    if (route === '/analytics/costs' && method === 'GET') {
      const auth = await requireAuth(request)
      if (auth.error) return err(auth.error, auth.status)

      const url = new URL(request.url)
      const period = url.searchParams.get('period') || '7d'
      const groupBy = url.searchParams.get('group_by') || 'day'

      const periodDays = { '1d': 1, '7d': 7, '30d': 30, '90d': 90 }
      const days = periodDays[period] || 7
      const startDate = new Date()
      startDate.setDate(startDate.getDate() - days)

      // Always scope to authenticated user's org
      const query = { org_id: auth.user.orgId, timestamp: { $gte: startDate }, 'cost.totalCost': { $exists: true } }

      const logs = await db.collection('audit_logs').find(query).sort({ timestamp: 1 }).toArray()
      
      const costsByDate = {}
      const costsByModel = {}
      const costsByAgent = {}
      
      logs.forEach(log => {
        const date = new Date(log.timestamp)
        let key
        if (groupBy === 'hour') key = date.toISOString().slice(0, 13) + ':00'
        else if (groupBy === 'week') {
          const weekStart = new Date(date)
          weekStart.setDate(date.getDate() - date.getDay())
          key = weekStart.toISOString().slice(0, 10)
        } else key = date.toISOString().slice(0, 10)
        
        if (!costsByDate[key]) costsByDate[key] = { date: key, cost: 0, requests: 0, tokens: 0 }
        costsByDate[key].cost += log.cost?.totalCost || 0
        costsByDate[key].requests++
        costsByDate[key].tokens += log.total_tokens || 0
        
        const model = log.model || 'unknown'
        if (!costsByModel[model]) costsByModel[model] = { model, cost: 0, requests: 0, tokens: 0 }
        costsByModel[model].cost += log.cost?.totalCost || 0
        costsByModel[model].requests++
        costsByModel[model].tokens += log.total_tokens || 0
        
        const agentId = log.agent_id || 'unknown'
        if (!costsByAgent[agentId]) costsByAgent[agentId] = { agent_id: agentId, cost: 0, requests: 0, tokens: 0 }
        costsByAgent[agentId].cost += log.cost?.totalCost || 0
        costsByAgent[agentId].requests++
        costsByAgent[agentId].tokens += log.total_tokens || 0
      })
      
      const agentIds = Object.keys(costsByAgent).filter(id => id !== 'unknown')
      const agents = await db.collection('agents').find({ id: { $in: agentIds } }).toArray()
      const agentNames = {}
      agents.forEach(a => { agentNames[a.id] = a.name })
      Object.keys(costsByAgent).forEach(id => { costsByAgent[id].agent_name = agentNames[id] || 'Unknown' })
      
      const totalCost = logs.reduce((sum, l) => sum + (l.cost?.totalCost || 0), 0)
      const totalTokens = logs.reduce((sum, l) => sum + (l.total_tokens || 0), 0)
      
      return cors(NextResponse.json({
        period,
        group_by: groupBy,
        summary: {
          total_cost: parseFloat(totalCost.toFixed(6)),
          total_requests: logs.length,
          total_tokens: totalTokens,
          avg_cost_per_request: logs.length > 0 ? parseFloat((totalCost / logs.length).toFixed(6)) : 0
        },
        by_date: Object.values(costsByDate).map(d => ({ ...d, cost: parseFloat(d.cost.toFixed(6)) })),
        by_model: Object.values(costsByModel).map(m => ({ ...m, cost: parseFloat(m.cost.toFixed(6)) })),
        by_agent: Object.values(costsByAgent).map(a => ({ ...a, cost: parseFloat(a.cost.toFixed(6)) }))
      }))
    }

    if (route === '/analytics/usage' && method === 'GET') {
      const auth = await requireAuth(request)
      if (auth.error) return err(auth.error, auth.status)

      const url = new URL(request.url)
      const period = url.searchParams.get('period') || '7d'

      const periodDays = { '1d': 1, '7d': 7, '30d': 30, '90d': 90 }
      const days = periodDays[period] || 7
      const startDate = new Date()
      startDate.setDate(startDate.getDate() - days)

      const query = { org_id: auth.user.orgId, timestamp: { $gte: startDate } }

      const logs = await db.collection('audit_logs').find(query).toArray()
      
      const actionCounts = {}
      const statusCounts = {}
      const hourlyDistribution = Array(24).fill(0)
      
      logs.forEach(log => {
        actionCounts[log.action] = (actionCounts[log.action] || 0) + 1
        statusCounts[log.status] = (statusCounts[log.status] || 0) + 1
        const hour = new Date(log.timestamp).getHours()
        hourlyDistribution[hour]++
      })
      
      const latencies = logs.filter(l => l.latency_ms).map(l => l.latency_ms)
      const avgLatency = latencies.length > 0 ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 0
      
      return cors(NextResponse.json({
        period,
        total_requests: logs.length,
        by_action: Object.entries(actionCounts).map(([action, count]) => ({ action, count })),
        by_status: Object.entries(statusCounts).map(([status, count]) => ({ status, count })),
        hourly_distribution: hourlyDistribution.map((count, hour) => ({ hour, count })),
        latency: {
          avg_ms: Math.round(avgLatency),
          max_ms: latencies.length > 0 ? Math.max(...latencies) : 0,
          min_ms: latencies.length > 0 ? Math.min(...latencies) : 0
        }
      }))
    }

    if (route === '/analytics/pii' && method === 'GET') {
      const auth = await requireAuth(request)
      if (auth.error) return err(auth.error, auth.status)

      const url = new URL(request.url)
      const period = url.searchParams.get('period') || '7d'

      const periodDays = { '1d': 1, '7d': 7, '30d': 30, '90d': 90 }
      const days = periodDays[period] || 7
      const startDate = new Date()
      startDate.setDate(startDate.getDate() - days)

      const query = { org_id: auth.user.orgId, timestamp: { $gte: startDate }, pii_detected: { $exists: true, $ne: [] } }

      const logs = await db.collection('audit_logs').find(query).toArray()
      
      const piiTypeCounts = {}
      let totalPiiInstances = 0
      
      logs.forEach(log => {
        (log.pii_detected || []).forEach(pii => {
          piiTypeCounts[pii.type] = (piiTypeCounts[pii.type] || 0) + pii.count
          totalPiiInstances += pii.count
        })
      })
      
      const safetyScores = logs.map(l => l.safety_score || 100)
      const avgSafetyScore = safetyScores.length > 0 ? safetyScores.reduce((a, b) => a + b, 0) / safetyScores.length : 100
      
      return cors(NextResponse.json({
        period,
        requests_with_pii: logs.length,
        total_pii_instances: totalPiiInstances,
        by_type: Object.entries(piiTypeCounts).map(([type, count]) => ({ type, count })),
        avg_safety_score: Math.round(avgSafetyScore)
      }))
    }

    // ============= DASHBOARD STATS =============
    if (route === '/dashboard/stats' && method === 'GET') {
      const auth = await requireAuth(request)
      if (auth.error) return err(auth.error, auth.status)

      const orgId = auth.user.orgId

      const agents = await db.collection('agents').find({ org_id: orgId }).toArray()

      const totalAgents = agents.length
      const activeAgents = agents.filter(a => a.status === 'active').length
      const lockedAgents = agents.filter(a => a.status === 'locked').length
      const totalSpend = agents.reduce((sum, a) => sum + (a.total_spend || 0), 0)
      const totalRequests = agents.reduce((sum, a) => sum + (a.total_requests || 0), 0)
      const totalTokens = agents.reduce((sum, a) => sum + (a.total_tokens || 0), 0)

      const recentLogs = await db.collection('audit_logs')
        .find({ org_id: orgId })
        .sort({ timestamp: -1 })
        .limit(10)
        .toArray()

      const pendingCount = await db.collection('pending_approvals').countDocuments({ org_id: orgId, status: 'pending_approval' })
      
      const avgHumanHourlyCost = 50
      const avgTasksPerHour = 10
      const estimatedHumanCost = (totalRequests / avgTasksPerHour) * avgHumanHourlyCost
      const costSavings = estimatedHumanCost - totalSpend
      
      return cors(NextResponse.json({
        total_agents: totalAgents,
        active_agents: activeAgents,
        locked_agents: lockedAgents,
        total_spend: parseFloat(totalSpend.toFixed(4)),
        total_requests: totalRequests,
        total_tokens: totalTokens,
        pending_approvals: pendingCount,
        estimated_human_cost: parseFloat(estimatedHumanCost.toFixed(2)),
        cost_savings: parseFloat(costSavings.toFixed(2)),
        savings_percentage: totalRequests > 0 ? parseFloat(((costSavings / estimatedHumanCost) * 100).toFixed(1)) : 0,
        recent_activity: recentLogs.map(({ _id, ...rest }) => rest)
      }))
    }

    // ============= INTELLIGENT PROXY =============
    if (route === '/proxy/chat/completions' && method === 'POST') {
      const startTime = Date.now()
      
      // Auth: API Key or Agent ID header
      // Only X-API-Key is accepted — X-Agent-ID alone is not sufficient (no secret)
      const apiKey = request.headers.get('x-api-key')

      if (!apiKey || !validators.apiKey(apiKey)) {
        return err('X-API-Key header required', 401)
      }

      let agent
      agent = await db.collection('agents').findOne({ api_key: apiKey })
      if (!agent) return err('Invalid API key', 401)
      
      if (agent.status === 'locked') {
        return err('Agent is locked', 403, { reason: agent.locked_reason })
      }
      
      // Get org and check subscription limits
      const org = await db.collection('organizations').findOne({ id: agent.org_id })
      if (org) {
        const tier = org.subscription_tier || 'free'
        const limitCheck = await checkSubscriptionLimits(agent.org_id, tier, 'request')
        
        if (!limitCheck.allowed) {
          await db.collection('audit_logs').insertOne({
            id: uuidv4(),
            agent_id: agent.id,
            org_id: agent.org_id,
            action: 'SUBSCRIPTION_LIMIT_EXCEEDED',
            status: 'blocked',
            details: { message: limitCheck.message, usage: limitCheck.usage, limits: limitCheck.limits },
            timestamp: new Date()
          })
          
          return err(limitCheck.message, 402, {
            tier,
            usage: limitCheck.usage,
            limits: limitCheck.limits,
            upgrade_url: '/settings#subscription'
          })
        }
      }
      
      // Rate limit check (subscription-based)
      const rateLimits = org ? getSubscriptionLimits(org.subscription_tier || 'free') : getSubscriptionLimits('free')
      const rateCheck = await checkRateLimit(`agent:${agent.id}`, rateLimits.rate_limit_requests, rateLimits.rate_limit_window)
      if (!rateCheck.allowed) {
        await db.collection('agents').updateOne(
          { id: agent.id },
          { $set: { status: 'locked', locked_reason: 'Rate limit exceeded - loop detected' } }
        )
        
        await db.collection('audit_logs').insertOne({
          id: uuidv4(),
          agent_id: agent.id,
          org_id: agent.org_id,
          action: 'LOOP_DETECTED',
          status: 'blocked',
          details: { request_count: rateCheck.count, limit: rateCheck.limit },
          timestamp: new Date()
        })
        
        return err('Rate limit exceeded - agent locked', 429, rateCheck)
      }
      
      // Budget check
      if (agent.current_balance <= 0) {
        const org = await db.collection('organizations').findOne({ id: agent.org_id })
        if (org) {
          notifyAllChannels(org, 'budget_exceeded', {
            agent_id: agent.id,
            agent_name: agent.name,
            message: `Agent "${agent.name}" has exhausted its budget`
          })
        }
        return err('Budget exhausted', 402, { current_balance: agent.current_balance, cost_cap: agent.cost_cap })
      }
      
      const body = await request.json()
      const messages = body.messages || []
      const model = body.model || agent.assigned_model || 'gpt-4o'
      const userMessage = messages.find(m => m.role === 'user')?.content || ''
      
      // Get policies
      const policies = await db.collection('policies').find({ org_id: agent.org_id, enabled: true }).toArray()
      const piiPolicy = policies.find(p => p.type === 'pii_scan')
      const criticalPolicy = policies.find(p => p.type === 'critical_action')
      
      // PII scan
      let sanitizedMessage = userMessage
      let piiScanResult = { blocked: false, detectedPII: [] }
      
      if (piiPolicy) {
        const piiAction = piiPolicy.config?.action || 'redact'
        piiScanResult = scanForPII(userMessage, piiAction)
        
        if (piiScanResult.blocked) {
          await db.collection('audit_logs').insertOne({
            id: uuidv4(),
            agent_id: agent.id,
            org_id: agent.org_id,
            action: 'PII_BLOCKED',
            status: 'blocked',
            details: piiScanResult,
            timestamp: new Date()
          })
          
          const org = await db.collection('organizations').findOne({ id: agent.org_id })
          if (org) notifyAllChannels(org, 'pii_detected', { agent_name: agent.name, ...piiScanResult })
          
          return err('Request blocked - PII detected', 403, piiScanResult)
        }
        
        if (piiScanResult.text) sanitizedMessage = piiScanResult.text
      }
      
      // Critical action check
      if (criticalPolicy) {
        const criticalCheck = checkCriticalActions(userMessage)
        if (criticalCheck.requiresApproval) {
          const pendingApproval = {
            id: uuidv4(),
            agent_id: agent.id,
            org_id: agent.org_id,
            status: 'pending_approval',
            triggered_keyword: criticalCheck.keyword,
            original_request: body,
            created_at: new Date()
          }
          await db.collection('pending_approvals').insertOne(pendingApproval)
          
          await db.collection('audit_logs').insertOne({
            id: uuidv4(),
            agent_id: agent.id,
            org_id: agent.org_id,
            action: 'CRITICAL_ACTION_PENDING',
            status: 'pending',
            details: { keyword: criticalCheck.keyword, approval_id: pendingApproval.id },
            timestamp: new Date()
          })
          
          const org = await db.collection('organizations').findOne({ id: agent.org_id })
          if (org) {
            notifyAllChannels(org, 'critical_action', {
              agent_id: agent.id,
              agent_name: agent.name,
              triggered_keyword: criticalCheck.keyword,
              approval_id: pendingApproval.id,
              message: `Agent "${agent.name}" triggered critical action: "${criticalCheck.keyword}"`
            })
          }
          
          return cors(NextResponse.json({
            error: 'Critical action requires approval',
            approval_id: pendingApproval.id,
            triggered_keyword: criticalCheck.keyword
          }, { status: 202 }))
        }
      }
      
      // Prepare sanitized messages
      const sanitizedMessages = messages.map(m => {
        if (m.role === 'user' && m.content === userMessage) {
          return { ...m, content: sanitizedMessage }
        }
        return m
      })
      
      // Call LLM or use demo mode
      let llmData
      
      if (DEMO_MODE) {
        const mockResponses = [
          "I understand your request. Let me help you with that.",
          "That's an interesting question! Here's what I think...",
          "Based on my analysis, I can provide the following insight.",
          "Great question! Let me break this down for you."
        ]
        const inputTokens = estimateTokens(JSON.stringify(sanitizedMessages))
        const outputTokens = estimateTokens(mockResponses[0])
        
        llmData = {
          id: `chatcmpl-${uuidv4().slice(0, 8)}`,
          object: 'chat.completion',
          created: Math.floor(Date.now() / 1000),
          model: model,
          choices: [{
            index: 0,
            message: {
              role: 'assistant',
              content: `${mockResponses[Math.floor(Math.random() * mockResponses.length)]} [DEMO MODE]`
            },
            finish_reason: 'stop'
          }],
          usage: { prompt_tokens: inputTokens, completion_tokens: outputTokens, total_tokens: inputTokens + outputTokens }
        }
      } else {
        try {
          const llmResponse = await fetch(`${OPENAI_BASE_URL}/chat/completions`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${OPENAI_API_KEY}`
            },
            body: JSON.stringify({
              model,
              messages: sanitizedMessages,
              max_tokens: body.max_tokens || 2048,
              temperature: body.temperature || 0.7
            })
          })
          
          llmData = await llmResponse.json()
          
          if (!llmResponse.ok) {
            await db.collection('audit_logs').insertOne({
              id: uuidv4(),
              agent_id: agent.id,
              org_id: agent.org_id,
              action: 'LLM_ERROR',
              status: 'error',
              details: llmData,
              timestamp: new Date()
            })
            return err('LLM request failed', llmResponse.status, llmData)
          }
        } catch (error) {
          return err('LLM connection failed', 503, { error: error.message })
        }
      }
      
      const endTime = Date.now()
      const latency = endTime - startTime
      
      // Calculate costs
      const inputTokens = llmData.usage?.prompt_tokens || estimateTokens(JSON.stringify(sanitizedMessages))
      const outputTokens = llmData.usage?.completion_tokens || estimateTokens(llmData.choices?.[0]?.message?.content || '')
      const totalTokens = inputTokens + outputTokens
      const costs = calculateCost(model, inputTokens, outputTokens)
      
      // Update agent stats
      await db.collection('agents').updateOne(
        { id: agent.id },
        {
          $inc: { total_spend: costs.totalCost, total_requests: 1, total_tokens: totalTokens, current_balance: -costs.totalCost },
          $set: { last_active: new Date(), updated_at: new Date() }
        }
      )
      
      // Track usage for subscription limits
      await trackUsage(agent.org_id, 1, totalTokens, costs.totalCost)
      
      // Log request
      const safetyScore = piiScanResult.detectedPII.length === 0 ? 100 : Math.max(0, 100 - (piiScanResult.detectedPII.length * 20))
      
      await db.collection('audit_logs').insertOne({
        id: uuidv4(),
        agent_id: agent.id,
        org_id: agent.org_id,
        action: 'CHAT_COMPLETION',
        status: 'completed',
        input_preview: sanitizedMessage.substring(0, 200),
        output_preview: (llmData.choices?.[0]?.message?.content || '').substring(0, 200),
        model,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        total_tokens: totalTokens,
        cost: costs,
        latency_ms: latency,
        pii_detected: piiScanResult.detectedPII,
        safety_score: safetyScore,
        timestamp: new Date()
      })
      
      // Return response with telemetry
      return cors(NextResponse.json({
        ...llmData,
        _synthetix: {
          agent_id: agent.id,
          cost: costs,
          tokens: { input: inputTokens, output: outputTokens, total: totalTokens },
          latency_ms: latency,
          pii_detected: piiScanResult.detectedPII,
          safety_score: safetyScore,
          remaining_balance: agent.current_balance - costs.totalCost,
          demo_mode: DEMO_MODE
        }
      }))
    }

    // Route not found
    return err(`Route ${route} not found`, 404)

  } catch (error) {
    console.error('API Error:', error)
    return err('Internal server error', 500, { message: error.message })
  }
}

export const GET = handleRoute
export const POST = handleRoute
export const PUT = handleRoute
export const DELETE = handleRoute
export const PATCH = handleRoute
