'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
import { 
  Bot, Users, DollarSign, Activity, Shield, AlertTriangle, 
  Plus, Power, PowerOff, Trash2, RefreshCw, Send, Terminal,
  TrendingUp, Clock, Zap, Eye, Settings, CheckCircle, XCircle,
  Building2, FileText, ChevronRight, BarChart3, LogIn, LogOut,
  UserPlus, Bell, Webhook, Key, Copy, UserCog, Mail, MessageSquare,
  Crown, Rocket, Star, Server
} from 'lucide-react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area, PieChart, Pie, Cell, BarChart, Bar } from 'recharts'

const MODELS = [
  { value: 'gpt-4o', label: 'GPT-4o', provider: 'OpenAI' },
  { value: 'gpt-4.1', label: 'GPT-4.1', provider: 'OpenAI' },
  { value: 'gpt-5.1', label: 'GPT-5.1', provider: 'OpenAI' },
  { value: 'claude-sonnet-4-5-20250929', label: 'Claude Sonnet 4.5', provider: 'Anthropic' },
  { value: 'claude-4-sonnet-20250514', label: 'Claude 4 Sonnet', provider: 'Anthropic' },
  { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', provider: 'Google' },
  { value: 'gemini-3-flash-preview', label: 'Gemini 3 Flash', provider: 'Google' },
]

const POLICY_TYPES = [
  { value: 'pii_scan', label: 'PII Scanning', description: 'Detect and handle personally identifiable information' },
  { value: 'critical_action', label: 'Critical Actions', description: 'Require approval for sensitive operations' },
  { value: 'budget_limit', label: 'Budget Limits', description: 'Set spending caps for agents' },
  { value: 'rate_limit', label: 'Rate Limiting', description: 'Prevent runaway agent loops' },
]

const ROLES = [
  { value: 'admin', label: 'Admin', description: 'Full access to all features' },
  { value: 'manager', label: 'Manager', description: 'Can manage agents and approve actions' },
  { value: 'viewer', label: 'Viewer', description: 'Read-only access to dashboard' },
]

// Auth hook
function useAuth() {
  const [user, setUser] = useState(null)
  const [token, setToken] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const storedToken = localStorage.getItem('synthetix_token')
    const storedUser = localStorage.getItem('synthetix_user')
    if (storedToken && storedUser) {
      setToken(storedToken)
      setUser(JSON.parse(storedUser))
    }
    setLoading(false)
  }, [])

  const login = async (email, password) => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    })
    const data = await res.json()
    if (res.ok) {
      localStorage.setItem('synthetix_token', data.token)
      localStorage.setItem('synthetix_user', JSON.stringify(data.user))
      setToken(data.token)
      setUser(data.user)
      return { success: true }
    }
    return { success: false, error: data.error }
  }

  const register = async (email, password, name, organizationName) => {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, name, organization_name: organizationName })
    })
    const data = await res.json()
    if (res.ok) {
      localStorage.setItem('synthetix_token', data.token)
      localStorage.setItem('synthetix_user', JSON.stringify(data.user))
      setToken(data.token)
      setUser(data.user)
      return { success: true }
    }
    return { success: false, error: data.error }
  }

  const logout = () => {
    localStorage.removeItem('synthetix_token')
    localStorage.removeItem('synthetix_user')
    setToken(null)
    setUser(null)
  }

  return { user, token, loading, login, register, logout }
}

// Auth Screen
function AuthScreen({ onLogin }) {
  const [view, setView] = useState('welcome') // welcome, login, signup, forgot
  const [showForgotPassword, setShowForgotPassword] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [orgName, setOrgName] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(false)
  const { login, register } = useAuth()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      if (view === 'login') {
        const result = await login(email, password)
        if (!result.success) setError(result.error)
        else onLogin()
      } else if (view === 'signup') {
        const result = await register(email, password, name, orgName)
        if (!result.success) setError(result.error)
        else onLogin()
      }
    } catch (err) {
      setError('An error occurred')
    }
    setLoading(false)
  }

  const handleForgotPassword = async (e) => {
    e.preventDefault()
    setError('')
    setSuccess('')
    setLoading(true)
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      })
      if (res.ok) {
        setSuccess('If an account exists, a reset link has been sent to your email.')
      }
    } catch (err) {
      setError('An error occurred')
    }
    setLoading(false)
  }

  // Welcome Page
  if (view === 'welcome') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 flex items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="max-w-4xl w-full"
        >
          <div className="text-center mb-12">
            <motion.div 
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
              className="inline-flex items-center justify-center p-4 bg-indigo-600 rounded-2xl mb-6"
            >
              <Bot className="h-12 w-12 text-white" />
            </motion.div>
            <motion.h1 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
              className="text-5xl font-bold text-white mb-4"
            >
              Synthetix
            </motion.h1>
            <motion.p 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4 }}
              className="text-xl text-indigo-200 mb-2"
            >
              AI Workforce Management Platform
            </motion.p>
            <motion.p 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
              className="text-slate-400"
            >
              Enterprise-grade governance and management for AI agents
            </motion.p>
          </div>
          
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 }}
            className="grid md:grid-cols-3 gap-6 mb-12"
          >
            <motion.div 
              whileHover={{ scale: 1.05 }}
              className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-xl p-6"
            >
              <Shield className="h-8 w-8 text-indigo-400 mb-4" />
              <h3 className="text-lg font-semibold text-white mb-2">Secure Governance</h3>
              <p className="text-slate-400 text-sm">PII detection, critical action blocking, and role-based access control</p>
            </motion.div>
            <motion.div 
              whileHover={{ scale: 1.05 }}
              className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-xl p-6"
            >
              <Activity className="h-8 w-8 text-indigo-400 mb-4" />
              <h3 className="text-lg font-semibold text-white mb-2">Real-time Analytics</h3>
              <p className="text-slate-400 text-sm">Track costs, usage, and performance across all your AI agents</p>
            </motion.div>
            <motion.div 
              whileHover={{ scale: 1.05 }}
              className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-xl p-6"
            >
              <Zap className="h-8 w-8 text-indigo-400 mb-4" />
              <h3 className="text-lg font-semibold text-white mb-2">Intelligent Proxy</h3>
              <p className="text-slate-400 text-sm">OpenAI-compatible endpoint with budget controls and audit logging</p>
            </motion.div>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.7 }}
            className="flex flex-col sm:flex-row gap-4 justify-center"
          >
            <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
              <Button 
                onClick={() => setView('signup')}
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-3 text-lg"
              >
                <UserPlus className="h-5 w-5 mr-2" />
                Get Started
              </Button>
            </motion.div>
            <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
              <Button 
                onClick={() => setView('login')}
                variant="outline"
                className="border-slate-600 text-white hover:bg-slate-800 hover:text-white px-8 py-3 text-lg"
              >
                <LogIn className="h-5 w-5 mr-2" />
                Sign In
              </Button>
            </motion.div>
          </motion.div>
          
          <motion.p 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.8 }}
            className="text-center text-slate-500 mt-8 text-sm"
          >
            Trusted by enterprises worldwide
          </motion.p>

          <motion.footer 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1 }}
            className="text-center mt-8 pt-8 border-t border-slate-800"
          >
            <p className="text-slate-500 text-sm">
              Powered by <span className="text-indigo-400 font-semibold">@ACL Smart Software</span>
            </p>
          </motion.footer>
        </motion.div>
      </div>
    )
  }

  if (showForgotPassword) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <AnimatePresence mode="wait">
          <motion.div
            key="forgot"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.3 }}
            className="w-full max-w-md"
          >
            <Card className="w-full bg-white border-slate-200 shadow-xl">
              <CardHeader className="text-center pb-2">
                <button onClick={() => setShowForgotPassword(false)} className="absolute top-4 left-4 text-slate-500 hover:text-slate-700">
                  <ChevronRight className="h-5 w-5 rotate-180" />
                </button>
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.1, type: "spring", stiffness: 200 }}
                  className="mx-auto p-3 bg-indigo-600 rounded-xl w-fit mb-4"
                >
                  <Bot className="h-8 w-8 text-white" />
                </motion.div>
                <CardTitle className="text-2xl text-slate-900">Reset Password</CardTitle>
                <CardDescription className="text-slate-500">Enter your email to receive a reset link</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleForgotPassword} className="space-y-4">
                  <div>
                    <Label className="text-slate-700">Email</Label>
                    <Input 
                      type="email"
                      value={email} 
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@company.com"
                      className="bg-white border-slate-300"
                      required
                    />
                  </div>
                  {error && <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">{error}</motion.div>}
                  {success && <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-3 bg-green-50 border border-green-200 rounded-lg text-green-600 text-sm">{success}</motion.div>}
                  <Button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-700 text-white" disabled={loading}>
                    {loading ? <RefreshCw className="h-4 w-4 animate-spin mr-2" /> : null}
                    Send Reset Link
                  </Button>
                </form>
                <div className="mt-4 text-center">
                  <button onClick={() => setShowForgotPassword(false)} className="text-indigo-600 hover:text-indigo-700 text-sm font-medium">
                    Back to Sign In
                  </button>
                </div>
              </CardContent>
              <motion.footer 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.3 }}
                className="text-center py-4 border-t border-slate-200"
              >
                <p className="text-slate-500 text-xs">
                  Powered by <span className="text-indigo-600 font-semibold">@ACL Smart Software</span>
                </p>
              </motion.footer>
            </Card>
          </motion.div>
        </AnimatePresence>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <AnimatePresence mode="wait">
        <motion.div
          key={view}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.3 }}
          className="w-full max-w-md"
        >
          <Card className="w-full bg-white border-slate-200 shadow-xl">
            <CardHeader className="text-center pb-2">
              <button onClick={() => setView('welcome')} className="absolute top-4 left-4 text-slate-500 hover:text-slate-700">
                <ChevronRight className="h-5 w-5 rotate-180" />
              </button>
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.1, type: "spring", stiffness: 200 }}
                className="mx-auto p-3 bg-indigo-600 rounded-xl w-fit mb-4"
              >
                <Bot className="h-8 w-8 text-white" />
              </motion.div>
              <CardTitle className="text-2xl text-slate-900">{view === 'login' ? 'Welcome Back' : 'Create Account'}</CardTitle>
              <CardDescription className="text-slate-500">{view === 'login' ? 'Sign in to your account' : 'Start managing your AI workforce'}</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                {view === 'signup' && (
                  <>
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.2 }}
                    >
                      <Label className="text-slate-700">Full Name</Label>
                      <Input 
                        value={name} 
                        onChange={(e) => setName(e.target.value)}
                        placeholder="John Doe"
                        className="bg-white border-slate-300 focus:border-indigo-500 focus:ring-indigo-500"
                        required={view === 'signup'}
                      />
                    </motion.div>
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.3 }}
                    >
                      <Label className="text-slate-700">Organization Name</Label>
                      <Input 
                        value={orgName} 
                        onChange={(e) => setOrgName(e.target.value)}
                        placeholder="Acme Corp"
                        className="bg-white border-slate-300 focus:border-indigo-500 focus:ring-indigo-500"
                      />
                    </motion.div>
                  </>
                )}
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: view === 'signup' ? 0.4 : 0.2 }}
                >
                  <Label className="text-slate-700">Email</Label>
                  <Input 
                    type="email"
                    value={email} 
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@company.com"
                    className="bg-white border-slate-300 focus:border-indigo-500 focus:ring-indigo-500"
                    required
                  />
                </motion.div>
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: view === 'signup' ? 0.5 : 0.3 }}
                >
                  <Label className="text-slate-700">Password</Label>
                  <Input 
                    type="password"
                    value={password} 
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="bg-white border-slate-300 focus:border-indigo-500 focus:ring-indigo-500"
                    required
                  />
                </motion.div>
                {error && (
                  <motion.div 
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm"
                  >
                    {error}
                  </motion.div>
                )}
                <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                  <Button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-700 text-white" disabled={loading}>
                    {loading ? <RefreshCw className="h-4 w-4 animate-spin mr-2" /> : null}
                    {view === 'login' ? 'Sign In' : 'Create Account'}
                  </Button>
                </motion.div>
              </form>
              <div className="mt-4 text-center space-y-2">
                <button 
                  onClick={() => setView(view === 'login' ? 'signup' : 'login')} 
                  className="text-indigo-600 hover:text-indigo-700 text-sm font-medium block w-full"
            >
              {view === 'login' ? "Don't have an account? Sign up" : "Already have an account? Sign in"}
            </button>
            {view === 'login' && (
              <button 
                onClick={() => setShowForgotPassword(true)} 
                className="text-slate-500 hover:text-slate-700 text-sm block w-full"
              >
                Forgot your password?
              </button>
            )}
          </div>
          <Separator className="my-6" />
          <Button variant="outline" className="w-full border-slate-300 text-slate-700 hover:bg-slate-50" onClick={onLogin}>
            Continue as Guest
          </Button>
        </CardContent>
        <motion.footer 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="text-center py-4 border-t border-slate-200"
        >
          <p className="text-slate-500 text-xs">
            Powered by <span className="text-indigo-600 font-semibold">@ACL Smart Software</span>
          </p>
        </motion.footer>
      </Card>
      </motion.div>
    </AnimatePresence>
    </div>
  )
}

export default function SynthetixDashboard() {
  const auth = useAuth()
  const [showAuth, setShowAuth] = useState(false)
  
  const [activeTab, setActiveTab] = useState('overview')
  const [stats, setStats] = useState(null)
  const [agents, setAgents] = useState([])
  const [organizations, setOrganizations] = useState([])
  const [policies, setPolicies] = useState([])
  const [auditLogs, setAuditLogs] = useState([])
  const [pendingApprovals, setPendingApprovals] = useState([])
  const [teamMembers, setTeamMembers] = useState([])
  const [selectedOrg, setSelectedOrg] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [showNewAgentDialog, setShowNewAgentDialog] = useState(false)
  const [showNewOrgDialog, setShowNewOrgDialog] = useState(false)
  const [showNewPolicyDialog, setShowNewPolicyDialog] = useState(false)
  const [showNewMemberDialog, setShowNewMemberDialog] = useState(false)
  const [showApiKeyDialog, setShowApiKeyDialog] = useState(false)
  const [selectedAgentForKey, setSelectedAgentForKey] = useState(null)
  const [generatedApiKey, setGeneratedApiKey] = useState(null)
  const [testPrompt, setTestPrompt] = useState('')
  const [testResponse, setTestResponse] = useState(null)
  const [testLoading, setTestLoading] = useState(false)
  const [selectedAgent, setSelectedAgent] = useState(null)
  
  const [costAnalytics, setCostAnalytics] = useState(null)
  const [usageAnalytics, setUsageAnalytics] = useState(null)
  const [piiAnalytics, setPiiAnalytics] = useState(null)
  const [analyticsPeriod, setAnalyticsPeriod] = useState('7d')
  
  const [webhookUrl, setWebhookUrl] = useState('')
  const [slackWebhook, setSlackWebhook] = useState('')
  const [discordWebhook, setDiscordWebhook] = useState('')
  const [webhookEvents, setWebhookEvents] = useState(['critical_action', 'budget_exceeded', 'agent_locked'])
  const [emailNotifications, setEmailNotifications] = useState(true)
  
  // Subscription state
  const [subscriptionTiers, setSubscriptionTiers] = useState([])
  const [subscriptionStatus, setSubscriptionStatus] = useState(null)
  const [showSubscriptionDialog, setShowSubscriptionDialog] = useState(false)
  const [selectedTier, setSelectedTier] = useState(null)
  
  const [newAgent, setNewAgent] = useState({ name: '', purpose: '', assigned_model: 'gpt-4o', cost_cap: 100 })
  const [newOrg, setNewOrg] = useState({ name: '', subscription_tier: 'starter', global_spending_limit: 1000 })
  const [newPolicy, setNewPolicy] = useState({ name: '', type: 'pii_scan', enabled: true, config: { action: 'redact' } })
  const [newMember, setNewMember] = useState({ email: '', name: '', role: 'viewer' })

  const fetchData = useCallback(async () => {
    try {
      setIsLoading(true)
      const orgQuery = selectedOrg ? `?org_id=${selectedOrg}` : ''
      const [statsRes, agentsRes, orgsRes, policiesRes, logsRes, approvalsRes, membersRes] = await Promise.all([
        fetch(`/api/dashboard/stats${orgQuery}`),
        fetch(`/api/agents${orgQuery}`),
        fetch('/api/organizations'),
        fetch(`/api/policies${orgQuery}`),
        fetch(`/api/audit-logs${orgQuery ? orgQuery + '&' : '?'}limit=50`),
        fetch(`/api/pending-approvals${orgQuery}`),
        selectedOrg ? fetch(`/api/team?org_id=${selectedOrg}`) : Promise.resolve({ json: () => [] })
      ])
      
      const [statsData, agentsData, orgsData, policiesData, logsData, approvalsData, membersData] = await Promise.all([
        statsRes.json(), agentsRes.json(), orgsRes.json(), policiesRes.json(),
        logsRes.json(), approvalsRes.json(), membersRes.json ? membersRes.json() : []
      ])
      
      setStats(statsData)
      setAgents(Array.isArray(agentsData) ? agentsData : [])
      setOrganizations(Array.isArray(orgsData) ? orgsData : [])
      setPolicies(Array.isArray(policiesData) ? policiesData : [])
      setAuditLogs(Array.isArray(logsData) ? logsData : [])
      setPendingApprovals(Array.isArray(approvalsData) ? approvalsData : [])
      setTeamMembers(Array.isArray(membersData) ? membersData : [])
    } catch (error) {
      console.error('Error fetching data:', error)
    } finally {
      setIsLoading(false)
    }
  }, [selectedOrg])

  const fetchAnalytics = useCallback(async () => {
    if (!selectedOrg) return
    try {
      const [costRes, usageRes, piiRes] = await Promise.all([
        fetch(`/api/analytics/costs?org_id=${selectedOrg}&period=${analyticsPeriod}`),
        fetch(`/api/analytics/usage?org_id=${selectedOrg}&period=${analyticsPeriod}`),
        fetch(`/api/analytics/pii?org_id=${selectedOrg}&period=${analyticsPeriod}`)
      ])
      const [costData, usageData, piiData] = await Promise.all([costRes.json(), usageRes.json(), piiRes.json()])
      setCostAnalytics(costData)
      setUsageAnalytics(usageData)
      setPiiAnalytics(piiData)
    } catch (error) {
      console.error('Error fetching analytics:', error)
    }
  }, [selectedOrg, analyticsPeriod])

  const fetchWebhook = useCallback(async () => {
    if (!selectedOrg) return
    try {
      const res = await fetch(`/api/webhooks?org_id=${selectedOrg}`)
      const data = await res.json()
      setWebhookUrl(data.webhook_url || '')
      setSlackWebhook(data.slack_webhook || '')
      setDiscordWebhook(data.discord_webhook || '')
      setWebhookEvents(data.webhook_events || ['critical_action', 'budget_exceeded', 'agent_locked'])
      setEmailNotifications(data.email_notifications !== false)
    } catch (error) {
      console.error('Error fetching webhook:', error)
    }
  }, [selectedOrg])

  const fetchSubscription = useCallback(async () => {
    try {
      // Fetch all tiers
      const tiersRes = await fetch('/api/subscriptions/tiers')
      const tiersData = await tiersRes.json()
      setSubscriptionTiers(tiersData.tiers || [])
      
      // Fetch org subscription status if org selected
      if (selectedOrg) {
        const statusRes = await fetch(`/api/subscriptions/status?org_id=${selectedOrg}`)
        const statusData = await statusRes.json()
        setSubscriptionStatus(statusData)
      }
    } catch (error) {
      console.error('Error fetching subscription:', error)
    }
  }, [selectedOrg])

  const selectSubscription = async (tier) => {
    if (!selectedOrg) return
    try {
      const res = await fetch('/api/subscriptions/select', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ org_id: selectedOrg, tier })
      })
      if (res.ok) {
        setShowSubscriptionDialog(false)
        fetchSubscription()
        fetchData()
      }
    } catch (error) {
      console.error('Error selecting subscription:', error)
    }
  }

  const upgradeSubscription = async (tier) => {
    if (!selectedOrg) return
    try {
      const res = await fetch('/api/subscriptions/upgrade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ org_id: selectedOrg, tier })
      })
      if (res.ok) {
        fetchSubscription()
        alert('Subscription upgraded successfully!')
      } else {
        const data = await res.json()
        alert(data.error || 'Failed to upgrade')
      }
    } catch (error) {
      console.error('Error upgrading subscription:', error)
    }
  }

  useEffect(() => {
    fetchData()
    const interval = setInterval(fetchData, 10000)
    return () => clearInterval(interval)
  }, [fetchData])

  useEffect(() => {
    if (activeTab === 'analytics') fetchAnalytics()
    if (activeTab === 'settings') {
      fetchWebhook()
      fetchSubscription()
    }
  }, [activeTab, fetchAnalytics, fetchWebhook, fetchSubscription])

  const createOrganization = async () => {
    const res = await fetch('/api/organizations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newOrg)
    })
    if (res.ok) {
      setShowNewOrgDialog(false)
      setNewOrg({ name: '', subscription_tier: 'starter', global_spending_limit: 1000 })
      fetchData()
    }
  }

  const createAgent = async () => {
    if (!selectedOrg) return alert('Please select an organization first')
    const res = await fetch('/api/agents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...newAgent, org_id: selectedOrg })
    })
    if (res.ok) {
      setShowNewAgentDialog(false)
      setNewAgent({ name: '', purpose: '', assigned_model: 'gpt-4o', cost_cap: 100 })
      fetchData()
    }
  }

  const killAgent = async (agentId) => {
    await fetch(`/api/agents/${agentId}/kill`, { method: 'POST' })
    fetchData()
  }

  const reactivateAgent = async (agentId) => {
    await fetch(`/api/agents/${agentId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'active', locked_reason: null })
    })
    fetchData()
  }

  const deleteAgent = async (agentId) => {
    if (!confirm('Delete this agent?')) return
    await fetch(`/api/agents/${agentId}`, { method: 'DELETE' })
    fetchData()
  }

  const generateApiKey = async (agentId) => {
    const res = await fetch(`/api/agents/${agentId}/api-key`, { method: 'POST' })
    const data = await res.json()
    setGeneratedApiKey(data.api_key)
    setSelectedAgentForKey(agentId)
    setShowApiKeyDialog(true)
  }

  const createPolicy = async () => {
    if (!selectedOrg) return alert('Please select an organization first')
    const res = await fetch('/api/policies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...newPolicy, org_id: selectedOrg })
    })
    if (res.ok) {
      setShowNewPolicyDialog(false)
      setNewPolicy({ name: '', type: 'pii_scan', enabled: true, config: { action: 'redact' } })
      fetchData()
    }
  }

  const togglePolicy = async (policyId, enabled) => {
    await fetch(`/api/policies/${policyId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled })
    })
    fetchData()
  }

  const handleApproval = async (approvalId, action) => {
    await fetch(`/api/pending-approvals/${approvalId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action })
    })
    fetchData()
  }

  const addTeamMember = async () => {
    if (!selectedOrg) return
    const res = await fetch('/api/team', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...newMember, org_id: selectedOrg })
    })
    if (res.ok) {
      setShowNewMemberDialog(false)
      setNewMember({ email: '', name: '', role: 'viewer' })
      fetchData()
    }
  }

  const removeTeamMember = async (memberId) => {
    if (!confirm('Remove this team member?')) return
    await fetch(`/api/team/${memberId}`, { method: 'DELETE' })
    fetchData()
  }

  const saveWebhook = async () => {
    if (!selectedOrg) return
    await fetch('/api/webhooks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        org_id: selectedOrg, 
        webhook_url: webhookUrl, 
        slack_webhook: slackWebhook,
        discord_webhook: discordWebhook,
        webhook_events: webhookEvents,
        email_notifications: emailNotifications
      })
    })
    alert('Settings saved!')
  }

  const testWebhook = async (type) => {
    if (!selectedOrg) return
    const res = await fetch('/api/webhooks/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ org_id: selectedOrg, type })
    })
    const data = await res.json()
    alert(data.success ? 'Test sent!' : `Failed: ${data.error}`)
  }

  const testProxy = async () => {
    if (!selectedAgent || !testPrompt) return
    setTestLoading(true)
    setTestResponse(null)
    try {
      const res = await fetch('/api/proxy/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Agent-ID': selectedAgent,
          'X-Org-ID': selectedOrg || ''
        },
        body: JSON.stringify({
          messages: [{ role: 'user', content: testPrompt }],
          model: agents.find(a => a.id === selectedAgent)?.assigned_model || 'gpt-4o'
        })
      })
      setTestResponse(await res.json())
      fetchData()
    } catch (error) {
      setTestResponse({ error: error.message })
    } finally {
      setTestLoading(false)
    }
  }

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text)
    alert('Copied!')
  }

  const costChartData = (Array.isArray(auditLogs) ? auditLogs : [])
    .filter(log => log.cost).slice(0, 20).reverse()
    .map((log, i) => ({ name: `#${i + 1}`, cost: log.cost.totalCost * 1000, tokens: log.total_tokens }))

  const agentStatusData = [
    { name: 'Active', value: stats?.active_agents || 0, color: '#4f46e5' },
    { name: 'Locked', value: stats?.locked_agents || 0, color: '#94a3b8' }
  ].filter(d => d.value > 0)

  if (showAuth && !auth.user) {
    return <AuthScreen onLogin={() => setShowAuth(false)} />
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="border-b border-slate-200 bg-white sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-indigo-600 rounded-lg">
                <Bot className="h-5 w-5 text-white" />
              </div>
              <span className="text-xl font-semibold text-slate-900">Synthetix</span>
            </div>
            
            <div className="flex items-center gap-4">
              <Select value={selectedOrg || 'all'} onValueChange={(v) => setSelectedOrg(v === 'all' ? null : v)}>
                <SelectTrigger className="w-[200px] bg-white border-slate-300">
                  <Building2 className="h-4 w-4 mr-2 text-slate-500" />
                  <SelectValue placeholder="All Organizations" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Organizations</SelectItem>
                  {organizations.map(org => (
                    <SelectItem key={org.id} value={org.id}>{org.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              
              <Button variant="ghost" size="icon" onClick={fetchData}>
                <RefreshCw className={`h-4 w-4 text-slate-500 ${isLoading ? 'animate-spin' : ''}`} />
              </Button>
              
              {auth.user ? (
                <div className="flex items-center gap-3">
                  <span className="text-sm text-slate-600">{auth.user.email}</span>
                  <Button variant="ghost" size="sm" onClick={auth.logout}>
                    <LogOut className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <Button variant="outline" size="sm" onClick={() => setShowAuth(true)} className="border-slate-300">
                  <LogIn className="h-4 w-4 mr-2" /> Sign In
                </Button>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-6">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="bg-white border border-slate-200 p-1 mb-6">
            <TabsTrigger value="overview" className="data-[state=active]:bg-indigo-600 data-[state=active]:text-white">
              <BarChart3 className="h-4 w-4 mr-2" /> Overview
            </TabsTrigger>
            <TabsTrigger value="agents" className="data-[state=active]:bg-indigo-600 data-[state=active]:text-white">
              <Bot className="h-4 w-4 mr-2" /> Agents
            </TabsTrigger>
            <TabsTrigger value="team" className="data-[state=active]:bg-indigo-600 data-[state=active]:text-white">
              <Users className="h-4 w-4 mr-2" /> Team
            </TabsTrigger>
            <TabsTrigger value="policies" className="data-[state=active]:bg-indigo-600 data-[state=active]:text-white">
              <Shield className="h-4 w-4 mr-2" /> Policies
            </TabsTrigger>
            <TabsTrigger value="analytics" className="data-[state=active]:bg-indigo-600 data-[state=active]:text-white">
              <Activity className="h-4 w-4 mr-2" /> Analytics
            </TabsTrigger>
            <TabsTrigger value="audit" className="data-[state=active]:bg-indigo-600 data-[state=active]:text-white">
              <Terminal className="h-4 w-4 mr-2" /> Audit
            </TabsTrigger>
            <TabsTrigger value="settings" className="data-[state=active]:bg-indigo-600 data-[state=active]:text-white">
              <Settings className="h-4 w-4 mr-2" /> Settings
            </TabsTrigger>
          </TabsList>

          {/* OVERVIEW */}
          <TabsContent value="overview" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card className="bg-white border-slate-200">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-slate-500 font-medium">Total Agents</p>
                      <p className="text-3xl font-bold text-slate-900">{stats?.total_agents || 0}</p>
                    </div>
                    <div className="p-3 bg-indigo-50 rounded-lg">
                      <Bot className="h-6 w-6 text-indigo-600" />
                    </div>
                  </div>
                  <div className="mt-4 flex items-center gap-2">
                    <Badge className="bg-indigo-100 text-indigo-700 hover:bg-indigo-100">{stats?.active_agents || 0} Active</Badge>
                    <Badge variant="outline" className="border-slate-300 text-slate-600">{stats?.locked_agents || 0} Locked</Badge>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-white border-slate-200">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-slate-500 font-medium">Total Spend</p>
                      <p className="text-3xl font-bold text-slate-900">${stats?.total_spend?.toFixed(4) || '0.00'}</p>
                    </div>
                    <div className="p-3 bg-indigo-50 rounded-lg">
                      <DollarSign className="h-6 w-6 text-indigo-600" />
                    </div>
                  </div>
                  <div className="mt-4 flex items-center gap-2 text-sm text-slate-600">
                    <TrendingUp className="h-4 w-4 text-indigo-600" />
                    ${stats?.cost_savings?.toFixed(2) || '0'} saved vs human labor
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-white border-slate-200">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-slate-500 font-medium">Total Requests</p>
                      <p className="text-3xl font-bold text-slate-900">{stats?.total_requests?.toLocaleString() || 0}</p>
                    </div>
                    <div className="p-3 bg-indigo-50 rounded-lg">
                      <Activity className="h-6 w-6 text-indigo-600" />
                    </div>
                  </div>
                  <p className="mt-4 text-sm text-slate-500">{stats?.total_tokens?.toLocaleString() || 0} tokens processed</p>
                </CardContent>
              </Card>

              <Card className="bg-white border-slate-200">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-slate-500 font-medium">Pending Approvals</p>
                      <p className="text-3xl font-bold text-slate-900">{stats?.pending_approvals || 0}</p>
                    </div>
                    <div className="p-3 bg-indigo-50 rounded-lg">
                      <AlertTriangle className="h-6 w-6 text-indigo-600" />
                    </div>
                  </div>
                  <p className="mt-4 text-sm text-slate-500">{stats?.pending_approvals > 0 ? 'Requires attention' : 'All clear'}</p>
                </CardContent>
              </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <Card className="lg:col-span-2 bg-white border-slate-200">
                <CardHeader>
                  <CardTitle className="text-slate-900">Cost Over Time</CardTitle>
                  <CardDescription>Recent API costs (millicents)</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={costChartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis dataKey="name" stroke="#64748b" />
                        <YAxis stroke="#64748b" />
                        <Tooltip contentStyle={{ backgroundColor: '#fff', border: '1px solid #e2e8f0' }} />
                        <Area type="monotone" dataKey="cost" stroke="#4f46e5" fill="#4f46e5" fillOpacity={0.1} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-white border-slate-200">
                <CardHeader>
                  <CardTitle className="text-slate-900">Agent Status</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-[300px] flex items-center justify-center">
                    {agentStatusData.length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={agentStatusData} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={5} dataKey="value">
                            {agentStatusData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.color} />
                            ))}
                          </Pie>
                          <Tooltip />
                        </PieChart>
                      </ResponsiveContainer>
                    ) : (
                      <p className="text-slate-400">No agents yet</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>

            {pendingApprovals.length > 0 && (
              <Card className="bg-white border-slate-200">
                <CardHeader>
                  <CardTitle className="text-slate-900 flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-indigo-600" />
                    Pending Approvals
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {pendingApprovals.map(approval => (
                      <div key={approval.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-lg border border-slate-200">
                        <div>
                          <p className="text-slate-900 font-medium">Critical Action Detected</p>
                          <p className="text-sm text-indigo-600">Keyword: "{approval.triggered_keyword}"</p>
                        </div>
                        <div className="flex gap-2">
                          <Button size="sm" onClick={() => handleApproval(approval.id, 'approve')} className="bg-indigo-600 hover:bg-indigo-700 text-white">
                            <CheckCircle className="h-4 w-4 mr-1" /> Approve
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => handleApproval(approval.id, 'reject')} className="border-slate-300">
                            <XCircle className="h-4 w-4 mr-1" /> Reject
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* AGENTS */}
          <TabsContent value="agents" className="space-y-6">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-2xl font-bold text-slate-900">Agent Fleet</h2>
                <p className="text-slate-500">Manage your AI workforce</p>
              </div>
              <Dialog open={showNewAgentDialog} onOpenChange={setShowNewAgentDialog}>
                <DialogTrigger asChild>
                  <Button className="bg-indigo-600 hover:bg-indigo-700 text-white">
                    <Plus className="h-4 w-4 mr-2" /> New Agent
                  </Button>
                </DialogTrigger>
                <DialogContent className="bg-white">
                  <DialogHeader>
                    <DialogTitle>Create New Agent</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div>
                      <Label>Agent Name</Label>
                      <Input placeholder="Research Assistant" value={newAgent.name} onChange={(e) => setNewAgent({...newAgent, name: e.target.value})} />
                    </div>
                    <div>
                      <Label>Purpose</Label>
                      <Input placeholder="Market Research" value={newAgent.purpose} onChange={(e) => setNewAgent({...newAgent, purpose: e.target.value})} />
                    </div>
                    <div>
                      <Label>Model</Label>
                      <Select value={newAgent.assigned_model} onValueChange={(v) => setNewAgent({...newAgent, assigned_model: v})}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {MODELS.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Budget Cap ($)</Label>
                      <Input type="number" value={newAgent.cost_cap} onChange={(e) => setNewAgent({...newAgent, cost_cap: parseFloat(e.target.value)})} />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setShowNewAgentDialog(false)}>Cancel</Button>
                    <Button onClick={createAgent} className="bg-indigo-600 hover:bg-indigo-700 text-white">Create</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>

            {!selectedOrg && (
              <Card className="bg-indigo-50 border-indigo-200">
                <CardContent className="p-4 flex items-center gap-3">
                  <AlertTriangle className="h-5 w-5 text-indigo-600" />
                  <p className="text-indigo-700">Select an organization to manage agents</p>
                </CardContent>
              </Card>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {agents.map(agent => (
                <Card key={agent.id} className="bg-white border-slate-200">
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg ${agent.status === 'active' ? 'bg-indigo-100' : 'bg-slate-100'}`}>
                          <Bot className={`h-5 w-5 ${agent.status === 'active' ? 'text-indigo-600' : 'text-slate-400'}`} />
                        </div>
                        <div>
                          <CardTitle className="text-slate-900">{agent.name}</CardTitle>
                          <CardDescription>{agent.purpose}</CardDescription>
                        </div>
                      </div>
                      <Badge className={agent.status === 'active' ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-600'}>
                        {agent.status}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-500">Model</span>
                        <span className="text-slate-900">{agent.assigned_model}</span>
                      </div>
                      <div>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="text-slate-500">Budget</span>
                          <span className="text-slate-900">${agent.total_spend?.toFixed(4) || '0'} / ${agent.cost_cap}</span>
                        </div>
                        <Progress value={(agent.total_spend / agent.cost_cap) * 100} className="h-2" />
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-500">Requests</span>
                        <span className="text-slate-900">{agent.total_requests || 0}</span>
                      </div>
                      {agent.port && (
                        <div className="flex items-center gap-2 p-2 bg-indigo-50 rounded text-xs">
                          <Server className="h-3 w-3 text-indigo-500" />
                          <span className="text-indigo-600 font-mono">Port: {agent.port}</span>
                        </div>
                      )}
                      {agent.api_key && (
                        <div className="flex items-center gap-2 p-2 bg-slate-50 rounded text-xs">
                          <Key className="h-3 w-3 text-slate-400" />
                          <span className="text-slate-500 font-mono truncate">{agent.api_key.slice(0, 20)}...</span>
                        </div>
                      )}
                      <Separator />
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" className="flex-1" onClick={() => generateApiKey(agent.id)}>
                          <Key className="h-4 w-4 mr-1" /> API Key
                        </Button>
                        {agent.status === 'active' ? (
                          <Button size="sm" variant="outline" onClick={() => killAgent(agent.id)}>
                            <PowerOff className="h-4 w-4" />
                          </Button>
                        ) : (
                          <Button size="sm" variant="outline" onClick={() => reactivateAgent(agent.id)}>
                            <Power className="h-4 w-4" />
                          </Button>
                        )}
                        <Button size="sm" variant="outline" onClick={() => deleteAgent(agent.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
              {agents.length === 0 && (
                <Card className="col-span-full bg-white border-slate-200 border-dashed">
                  <CardContent className="p-12 text-center">
                    <Bot className="h-12 w-12 text-slate-300 mx-auto mb-4" />
                    <p className="text-slate-500">No agents yet. Create your first agent.</p>
                  </CardContent>
                </Card>
              )}
            </div>

            {/* API Key Dialog */}
            <Dialog open={showApiKeyDialog} onOpenChange={setShowApiKeyDialog}>
              <DialogContent className="bg-white">
                <DialogHeader>
                  <DialogTitle>Agent API Key</DialogTitle>
                  <DialogDescription>Use this key to authenticate requests for this agent</DialogDescription>
                </DialogHeader>
                <div className="py-4">
                  <div className="flex items-center gap-2 p-3 bg-slate-50 rounded-lg border">
                    <code className="flex-1 text-sm font-mono text-slate-700 break-all">{generatedApiKey}</code>
                    <Button size="sm" variant="ghost" onClick={() => copyToClipboard(generatedApiKey)}>
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                  <p className="mt-3 text-sm text-slate-500">Save this key securely. It won't be shown again.</p>
                </div>
              </DialogContent>
            </Dialog>
          </TabsContent>

          {/* TEAM */}
          <TabsContent value="team" className="space-y-6">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-2xl font-bold text-slate-900">Team Management</h2>
                <p className="text-slate-500">Manage team members and roles</p>
              </div>
              <Dialog open={showNewMemberDialog} onOpenChange={setShowNewMemberDialog}>
                <DialogTrigger asChild>
                  <Button className="bg-indigo-600 hover:bg-indigo-700 text-white">
                    <UserPlus className="h-4 w-4 mr-2" /> Add Member
                  </Button>
                </DialogTrigger>
                <DialogContent className="bg-white">
                  <DialogHeader>
                    <DialogTitle>Add Team Member</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div>
                      <Label>Email</Label>
                      <Input type="email" placeholder="member@company.com" value={newMember.email} onChange={(e) => setNewMember({...newMember, email: e.target.value})} />
                    </div>
                    <div>
                      <Label>Name</Label>
                      <Input placeholder="John Doe" value={newMember.name} onChange={(e) => setNewMember({...newMember, name: e.target.value})} />
                    </div>
                    <div>
                      <Label>Role</Label>
                      <Select value={newMember.role} onValueChange={(v) => setNewMember({...newMember, role: v})}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {ROLES.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setShowNewMemberDialog(false)}>Cancel</Button>
                    <Button onClick={addTeamMember} className="bg-indigo-600 hover:bg-indigo-700 text-white">Add</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>

            {!selectedOrg && (
              <Card className="bg-indigo-50 border-indigo-200">
                <CardContent className="p-4 flex items-center gap-3">
                  <AlertTriangle className="h-5 w-5 text-indigo-600" />
                  <p className="text-indigo-700">Select an organization to manage team</p>
                </CardContent>
              </Card>
            )}

            <Card className="bg-white border-slate-200">
              <CardContent className="p-0">
                <table className="w-full">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="text-left p-4 text-sm font-medium text-slate-600">Member</th>
                      <th className="text-left p-4 text-sm font-medium text-slate-600">Role</th>
                      <th className="text-left p-4 text-sm font-medium text-slate-600">Status</th>
                      <th className="text-right p-4 text-sm font-medium text-slate-600">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {teamMembers.map(member => (
                      <tr key={member.id} className="border-b border-slate-100 last:border-0">
                        <td className="p-4">
                          <div>
                            <p className="font-medium text-slate-900">{member.name}</p>
                            <p className="text-sm text-slate-500">{member.email}</p>
                          </div>
                        </td>
                        <td className="p-4">
                          <Badge className="bg-indigo-100 text-indigo-700">{member.role}</Badge>
                        </td>
                        <td className="p-4">
                          <Badge variant="outline" className="border-slate-300">Active</Badge>
                        </td>
                        <td className="p-4 text-right">
                          <Button size="sm" variant="ghost" onClick={() => removeTeamMember(member.id)}>
                            <Trash2 className="h-4 w-4 text-slate-400" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                    {teamMembers.length === 0 && (
                      <tr>
                        <td colSpan={4} className="p-12 text-center text-slate-500">
                          No team members yet
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* POLICIES */}
          <TabsContent value="policies" className="space-y-6">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-2xl font-bold text-slate-900">Safety Policies</h2>
                <p className="text-slate-500">Configure AI governance rules</p>
              </div>
              <Dialog open={showNewPolicyDialog} onOpenChange={setShowNewPolicyDialog}>
                <DialogTrigger asChild>
                  <Button className="bg-indigo-600 hover:bg-indigo-700 text-white">
                    <Plus className="h-4 w-4 mr-2" /> New Policy
                  </Button>
                </DialogTrigger>
                <DialogContent className="bg-white">
                  <DialogHeader>
                    <DialogTitle>Create Policy</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div>
                      <Label>Policy Name</Label>
                      <Input placeholder="Block All PII" value={newPolicy.name} onChange={(e) => setNewPolicy({...newPolicy, name: e.target.value})} />
                    </div>
                    <div>
                      <Label>Type</Label>
                      <Select value={newPolicy.type} onValueChange={(v) => setNewPolicy({...newPolicy, type: v})}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {POLICY_TYPES.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setShowNewPolicyDialog(false)}>Cancel</Button>
                    <Button onClick={createPolicy} className="bg-indigo-600 hover:bg-indigo-700 text-white">Create</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>

            <div className="space-y-3">
              {policies.map(policy => (
                <Card key={policy.id} className="bg-white border-slate-200">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className={`p-2 rounded-lg ${policy.enabled ? 'bg-indigo-100' : 'bg-slate-100'}`}>
                          <Shield className={`h-5 w-5 ${policy.enabled ? 'text-indigo-600' : 'text-slate-400'}`} />
                        </div>
                        <div>
                          <h3 className="font-medium text-slate-900">{policy.name}</h3>
                          <p className="text-sm text-slate-500">{POLICY_TYPES.find(p => p.value === policy.type)?.description}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <Badge variant="outline" className="border-slate-300">{policy.type}</Badge>
                        <Switch checked={policy.enabled} onCheckedChange={(checked) => togglePolicy(policy.id, checked)} />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
              {policies.length === 0 && (
                <Card className="bg-white border-slate-200 border-dashed">
                  <CardContent className="p-12 text-center">
                    <Shield className="h-12 w-12 text-slate-300 mx-auto mb-4" />
                    <p className="text-slate-500">No policies configured</p>
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>

          {/* ANALYTICS */}
          <TabsContent value="analytics" className="space-y-6">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-2xl font-bold text-slate-900">Analytics</h2>
                <p className="text-slate-500">Insights into your AI workforce</p>
              </div>
              <Select value={analyticsPeriod} onValueChange={setAnalyticsPeriod}>
                <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="1d">Last 24 hours</SelectItem>
                  <SelectItem value="7d">Last 7 days</SelectItem>
                  <SelectItem value="30d">Last 30 days</SelectItem>
                  <SelectItem value="90d">Last 90 days</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {!selectedOrg ? (
              <Card className="bg-indigo-50 border-indigo-200">
                <CardContent className="p-4 flex items-center gap-3">
                  <AlertTriangle className="h-5 w-5 text-indigo-600" />
                  <p className="text-indigo-700">Select an organization to view analytics</p>
                </CardContent>
              </Card>
            ) : (
              <>
                <div className="grid grid-cols-4 gap-4">
                  <Card className="bg-white border-slate-200">
                    <CardContent className="p-4">
                      <p className="text-sm text-slate-500">Total Cost</p>
                      <p className="text-2xl font-bold text-indigo-600">${costAnalytics?.summary?.total_cost?.toFixed(4) || '0.00'}</p>
                    </CardContent>
                  </Card>
                  <Card className="bg-white border-slate-200">
                    <CardContent className="p-4">
                      <p className="text-sm text-slate-500">Requests</p>
                      <p className="text-2xl font-bold text-slate-900">{costAnalytics?.summary?.total_requests || 0}</p>
                    </CardContent>
                  </Card>
                  <Card className="bg-white border-slate-200">
                    <CardContent className="p-4">
                      <p className="text-sm text-slate-500">Tokens</p>
                      <p className="text-2xl font-bold text-slate-900">{costAnalytics?.summary?.total_tokens?.toLocaleString() || 0}</p>
                    </CardContent>
                  </Card>
                  <Card className="bg-white border-slate-200">
                    <CardContent className="p-4">
                      <p className="text-sm text-slate-500">Avg Latency</p>
                      <p className="text-2xl font-bold text-slate-900">{usageAnalytics?.latency?.avg_ms || 0}ms</p>
                    </CardContent>
                  </Card>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <Card className="bg-white border-slate-200">
                    <CardHeader>
                      <CardTitle className="text-slate-900">Cost Trends</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="h-[300px]">
                        {costAnalytics?.by_date?.length > 0 ? (
                          <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={costAnalytics.by_date}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                              <XAxis dataKey="date" stroke="#64748b" tick={{fontSize: 12}} />
                              <YAxis stroke="#64748b" />
                              <Tooltip contentStyle={{ backgroundColor: '#fff', border: '1px solid #e2e8f0' }} />
                              <Area type="monotone" dataKey="cost" stroke="#4f46e5" fill="#4f46e5" fillOpacity={0.1} />
                            </AreaChart>
                          </ResponsiveContainer>
                        ) : (
                          <div className="h-full flex items-center justify-center text-slate-400">No data</div>
                        )}
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="bg-white border-slate-200">
                    <CardHeader>
                      <CardTitle className="text-slate-900">Hourly Distribution</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="h-[300px]">
                        {usageAnalytics?.hourly_distribution?.length > 0 ? (
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={usageAnalytics.hourly_distribution}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                              <XAxis dataKey="hour" stroke="#64748b" />
                              <YAxis stroke="#64748b" />
                              <Tooltip contentStyle={{ backgroundColor: '#fff', border: '1px solid #e2e8f0' }} />
                              <Bar dataKey="count" fill="#4f46e5" />
                            </BarChart>
                          </ResponsiveContainer>
                        ) : (
                          <div className="h-full flex items-center justify-center text-slate-400">No data</div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </div>

                <Card className="bg-white border-slate-200">
                  <CardHeader>
                    <CardTitle className="text-slate-900">PII Detection Summary</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-3 gap-4">
                      <div className="p-4 bg-slate-50 rounded-lg">
                        <p className="text-sm text-slate-500">Requests with PII</p>
                        <p className="text-2xl font-bold text-slate-900">{piiAnalytics?.requests_with_pii || 0}</p>
                      </div>
                      <div className="p-4 bg-slate-50 rounded-lg">
                        <p className="text-sm text-slate-500">Total PII Instances</p>
                        <p className="text-2xl font-bold text-slate-900">{piiAnalytics?.total_pii_instances || 0}</p>
                      </div>
                      <div className="p-4 bg-slate-50 rounded-lg">
                        <p className="text-sm text-slate-500">Avg Safety Score</p>
                        <p className="text-2xl font-bold text-indigo-600">{piiAnalytics?.avg_safety_score || 100}%</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </>
            )}
          </TabsContent>

          {/* AUDIT */}
          <TabsContent value="audit" className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold text-slate-900">Audit Log</h2>
              <p className="text-slate-500">Real-time activity stream</p>
            </div>

            <Card className="bg-white border-slate-200">
              <CardContent className="p-0">
                <div className="flex items-center gap-2 p-3 bg-slate-900 rounded-t-lg">
                  <Terminal className="h-4 w-4 text-indigo-400" />
                  <span className="text-indigo-400 text-sm font-mono">audit-stream</span>
                </div>
                <ScrollArea className="h-[600px] p-4 bg-slate-50">
                  <div className="space-y-2 font-mono text-sm">
                    {auditLogs.map((log, i) => (
                      <div key={i} className={`p-3 rounded-lg border ${
                        log.status === 'completed' ? 'bg-white border-slate-200' :
                        log.status === 'blocked' ? 'bg-red-50 border-red-200' :
                        'bg-indigo-50 border-indigo-200'
                      }`}>
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-slate-400">[{new Date(log.timestamp).toLocaleTimeString()}]</span>
                          <Badge className={
                            log.status === 'completed' ? 'bg-indigo-100 text-indigo-700' :
                            log.status === 'blocked' ? 'bg-red-100 text-red-700' :
                            'bg-slate-100 text-slate-700'
                          }>{log.action}</Badge>
                        </div>
                        {log.input_preview && <p className="text-slate-600"><span className="text-indigo-600">IN:</span> {log.input_preview}</p>}
                        {log.output_preview && <p className="text-slate-600"><span className="text-indigo-600">OUT:</span> {log.output_preview}</p>}
                        <div className="flex gap-4 text-xs text-slate-400 mt-2">
                          {log.model && <span>model: {log.model}</span>}
                          {log.total_tokens && <span>tokens: {log.total_tokens}</span>}
                          {log.cost && <span>cost: ${log.cost.totalCost.toFixed(6)}</span>}
                          {log.latency_ms && <span>latency: {log.latency_ms}ms</span>}
                        </div>
                      </div>
                    ))}
                    {auditLogs.length === 0 && (
                      <div className="text-slate-400 text-center py-12">Waiting for activity...</div>
                    )}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          {/* SETTINGS */}
          <TabsContent value="settings" className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold text-slate-900">Settings</h2>
              <p className="text-slate-500">Configure notifications and integrations</p>
            </div>

            {!selectedOrg ? (
              <Card className="bg-indigo-50 border-indigo-200">
                <CardContent className="p-4 flex items-center gap-3">
                  <AlertTriangle className="h-5 w-5 text-indigo-600" />
                  <p className="text-indigo-700">Select an organization to configure settings</p>
                </CardContent>
              </Card>
            ) : (
              <>
                {/* Subscription & Plan */}
                <Card className="bg-white border-slate-200">
                  <CardHeader>
                    <CardTitle className="text-slate-900 flex items-center gap-2">
                      <Crown className="h-5 w-5 text-indigo-600" /> Subscription Plan
                    </CardTitle>
                    <CardDescription>Manage your organization's subscription and usage limits</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    {/* Current Plan */}
                    <div className="p-4 bg-gradient-to-r from-indigo-50 to-slate-50 rounded-lg border border-indigo-100">
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-indigo-600 rounded-lg">
                            {subscriptionStatus?.subscription?.tier === 'enterprise' ? (
                              <Star className="h-5 w-5 text-white" />
                            ) : subscriptionStatus?.subscription?.tier === 'professional' ? (
                              <Rocket className="h-5 w-5 text-white" />
                            ) : (
                              <Crown className="h-5 w-5 text-white" />
                            )}
                          </div>
                          <div>
                            <h3 className="font-semibold text-slate-900">
                              {subscriptionStatus?.subscription?.name || 'Free'} Plan
                            </h3>
                            <p className="text-sm text-slate-500">
                              {subscriptionStatus?.subscription?.tier === 'enterprise' ? 'Unlimited resources' : 
                               `${subscriptionStatus?.limits?.max_agents || 2} agents, ${subscriptionStatus?.limits?.max_requests_per_day?.toLocaleString() || 100} requests/day`}
                            </p>
                          </div>
                        </div>
                        <Badge className="bg-indigo-100 text-indigo-700">
                          {subscriptionStatus?.subscription?.status || 'Active'}
                        </Badge>
                      </div>
                      
                      {/* Usage Stats */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <div className="p-3 bg-white rounded-lg border border-slate-200">
                          <p className="text-xs text-slate-500 mb-1">Agents</p>
                          <p className="font-semibold text-slate-900">
                            {subscriptionStatus?.usage?.agents?.used || 0} / {subscriptionStatus?.usage?.agents?.limit === -1 ? '∞' : subscriptionStatus?.usage?.agents?.limit || 2}
                          </p>
                          <Progress 
                            value={subscriptionStatus?.usage?.agents?.limit === -1 ? 10 : 
                              ((subscriptionStatus?.usage?.agents?.used || 0) / (subscriptionStatus?.usage?.agents?.limit || 2)) * 100} 
                            className="h-1 mt-2" 
                          />
                        </div>
                        <div className="p-3 bg-white rounded-lg border border-slate-200">
                          <p className="text-xs text-slate-500 mb-1">Requests Today</p>
                          <p className="font-semibold text-slate-900">
                            {subscriptionStatus?.usage?.requests_today?.used || 0} / {subscriptionStatus?.usage?.requests_today?.limit === -1 ? '∞' : subscriptionStatus?.usage?.requests_today?.limit?.toLocaleString() || 100}
                          </p>
                          <Progress 
                            value={subscriptionStatus?.usage?.requests_today?.limit === -1 ? 10 : 
                              ((subscriptionStatus?.usage?.requests_today?.used || 0) / (subscriptionStatus?.usage?.requests_today?.limit || 100)) * 100} 
                            className="h-1 mt-2" 
                          />
                        </div>
                        <div className="p-3 bg-white rounded-lg border border-slate-200">
                          <p className="text-xs text-slate-500 mb-1">Tokens This Month</p>
                          <p className="font-semibold text-slate-900">
                            {(subscriptionStatus?.usage?.tokens_this_month?.used || 0).toLocaleString()} / {subscriptionStatus?.usage?.tokens_this_month?.limit === -1 ? '∞' : (subscriptionStatus?.usage?.tokens_this_month?.limit || 50000).toLocaleString()}
                          </p>
                          <Progress 
                            value={subscriptionStatus?.usage?.tokens_this_month?.limit === -1 ? 10 : 
                              ((subscriptionStatus?.usage?.tokens_this_month?.used || 0) / (subscriptionStatus?.usage?.tokens_this_month?.limit || 50000)) * 100} 
                            className="h-1 mt-2" 
                          />
                        </div>
                        <div className="p-3 bg-white rounded-lg border border-slate-200">
                          <p className="text-xs text-slate-500 mb-1">Spend This Month</p>
                          <p className="font-semibold text-slate-900">
                            ${(subscriptionStatus?.usage?.spend_this_month?.used || 0).toFixed(2)} / {subscriptionStatus?.usage?.spend_this_month?.limit === -1 ? '∞' : `$${subscriptionStatus?.usage?.spend_this_month?.limit || 5}`}
                          </p>
                          <Progress 
                            value={subscriptionStatus?.usage?.spend_this_month?.limit === -1 ? 10 : 
                              ((subscriptionStatus?.usage?.spend_this_month?.used || 0) / (subscriptionStatus?.usage?.spend_this_month?.limit || 5)) * 100} 
                            className="h-1 mt-2" 
                          />
                        </div>
                      </div>
                    </div>

                    {/* Available Plans */}
                    <div>
                      <h4 className="font-medium text-slate-900 mb-3">Available Plans</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                        {subscriptionTiers.map(tier => (
                          <div 
                            key={tier.id} 
                            className={`p-4 rounded-lg border-2 transition-all ${
                              subscriptionStatus?.subscription?.tier === tier.id 
                                ? 'border-indigo-500 bg-indigo-50' 
                                : 'border-slate-200 bg-white hover:border-indigo-200'
                            }`}
                          >
                            <div className="flex items-center justify-between mb-2">
                              <h5 className="font-semibold text-slate-900">{tier.name}</h5>
                              {tier.id === 'professional' && (
                                <Badge className="bg-indigo-600 text-white text-xs">Popular</Badge>
                              )}
                            </div>
                            <p className="text-2xl font-bold text-indigo-600 mb-3">
                              ${tier.price}<span className="text-sm font-normal text-slate-500">/mo</span>
                            </p>
                            <ul className="space-y-1 text-sm text-slate-600 mb-4">
                              <li>• {tier.limits?.max_agents === -1 ? 'Unlimited' : tier.limits?.max_agents} agents</li>
                              <li>• {tier.limits?.max_requests_per_day === -1 ? 'Unlimited' : tier.limits?.max_requests_per_day?.toLocaleString()} requests/day</li>
                              <li>• {tier.limits?.max_tokens_per_month === -1 ? 'Unlimited' : (tier.limits?.max_tokens_per_month/1000000).toFixed(1) + 'M'} tokens/mo</li>
                              <li>• {tier.limits?.audit_retention_days} days audit logs</li>
                            </ul>
                            {subscriptionStatus?.subscription?.tier === tier.id ? (
                              <Button disabled className="w-full" variant="outline">
                                Current Plan
                              </Button>
                            ) : (
                              <Button 
                                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white"
                                onClick={() => {
                                  const tierOrder = ['free', 'starter', 'professional', 'enterprise']
                                  const currentIndex = tierOrder.indexOf(subscriptionStatus?.subscription?.tier || 'free')
                                  const newIndex = tierOrder.indexOf(tier.id)
                                  if (newIndex > currentIndex) {
                                    upgradeSubscription(tier.id)
                                  } else {
                                    selectSubscription(tier.id)
                                  }
                                }}
                              >
                                {(() => {
                                  const tierOrder = ['free', 'starter', 'professional', 'enterprise']
                                  const currentIndex = tierOrder.indexOf(subscriptionStatus?.subscription?.tier || 'free')
                                  const newIndex = tierOrder.indexOf(tier.id)
                                  return newIndex > currentIndex ? 'Upgrade' : 'Select'
                                })()}
                              </Button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Features */}
                    <div className="p-4 bg-slate-50 rounded-lg">
                      <h4 className="font-medium text-slate-900 mb-2">Included Features</h4>
                      <div className="flex flex-wrap gap-2">
                        {(subscriptionStatus?.features || ['basic_proxy', 'pii_redaction']).map(feature => (
                          <Badge key={feature} variant="outline" className="border-slate-300 text-slate-600">
                            {feature.replace(/_/g, ' ')}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Email Notifications */}
                <Card className="bg-white border-slate-200">
                  <CardHeader>
                    <CardTitle className="text-slate-900 flex items-center gap-2">
                      <Mail className="h-5 w-5 text-indigo-600" /> Email Notifications
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
                      <div>
                        <p className="font-medium text-slate-900">Enable Email Alerts</p>
                        <p className="text-sm text-slate-500">Receive email notifications for critical events</p>
                      </div>
                      <Switch checked={emailNotifications} onCheckedChange={setEmailNotifications} />
                    </div>
                    <p className="mt-3 text-sm text-slate-500">Email integration via Resend (coming soon)</p>
                  </CardContent>
                </Card>

                {/* Slack Integration */}
                <Card className="bg-white border-slate-200">
                  <CardHeader>
                    <CardTitle className="text-slate-900 flex items-center gap-2">
                      <MessageSquare className="h-5 w-5 text-indigo-600" /> Slack Integration
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <Label>Slack Webhook URL</Label>
                      <Input 
                        placeholder="https://hooks.slack.com/services/..." 
                        value={slackWebhook} 
                        onChange={(e) => setSlackWebhook(e.target.value)} 
                      />
                    </div>
                    <Button variant="outline" onClick={() => testWebhook('slack')} disabled={!slackWebhook}>
                      Test Slack
                    </Button>
                  </CardContent>
                </Card>

                {/* Discord Integration */}
                <Card className="bg-white border-slate-200">
                  <CardHeader>
                    <CardTitle className="text-slate-900 flex items-center gap-2">
                      <MessageSquare className="h-5 w-5 text-indigo-600" /> Discord Integration
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <Label>Discord Webhook URL</Label>
                      <Input 
                        placeholder="https://discord.com/api/webhooks/..." 
                        value={discordWebhook} 
                        onChange={(e) => setDiscordWebhook(e.target.value)} 
                      />
                    </div>
                    <Button variant="outline" onClick={() => testWebhook('discord')} disabled={!discordWebhook}>
                      Test Discord
                    </Button>
                  </CardContent>
                </Card>

                {/* Custom Webhook */}
                <Card className="bg-white border-slate-200">
                  <CardHeader>
                    <CardTitle className="text-slate-900 flex items-center gap-2">
                      <Webhook className="h-5 w-5 text-indigo-600" /> Custom Webhook
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <Label>Webhook URL</Label>
                      <Input 
                        placeholder="https://your-server.com/webhook" 
                        value={webhookUrl} 
                        onChange={(e) => setWebhookUrl(e.target.value)} 
                      />
                    </div>
                    <div>
                      <Label className="mb-3 block">Events</Label>
                      <div className="grid grid-cols-2 gap-2">
                        {['critical_action', 'budget_exceeded', 'agent_locked', 'pii_detected'].map(event => (
                          <div key={event} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                            <span className="text-sm text-slate-700 capitalize">{event.replace('_', ' ')}</span>
                            <Switch 
                              checked={webhookEvents.includes(event)}
                              onCheckedChange={(checked) => {
                                if (checked) setWebhookEvents([...webhookEvents, event])
                                else setWebhookEvents(webhookEvents.filter(e => e !== event))
                              }}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                    <Button variant="outline" onClick={() => testWebhook('custom')} disabled={!webhookUrl}>
                      Test Webhook
                    </Button>
                  </CardContent>
                </Card>

                <Button onClick={saveWebhook} className="bg-indigo-600 hover:bg-indigo-700 text-white">
                  Save All Settings
                </Button>

                {/* Proxy Tester */}
                <Card className="bg-white border-slate-200">
                  <CardHeader>
                    <CardTitle className="text-slate-900">Proxy Tester</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-4">
                        <div>
                          <Label>Agent</Label>
                          <Select value={selectedAgent || 'none'} onValueChange={(v) => setSelectedAgent(v === 'none' ? null : v)}>
                            <SelectTrigger><SelectValue placeholder="Select agent" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">Select agent</SelectItem>
                              {agents.filter(a => a.status === 'active').map(a => (
                                <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label>Prompt</Label>
                          <textarea
                            className="w-full h-32 p-3 border border-slate-300 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            placeholder="Enter test prompt..."
                            value={testPrompt}
                            onChange={(e) => setTestPrompt(e.target.value)}
                          />
                        </div>
                        <Button onClick={testProxy} disabled={!selectedAgent || !testPrompt || testLoading} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white">
                          {testLoading ? <RefreshCw className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
                          Send
                        </Button>
                      </div>
                      <div>
                        <Label>Response</Label>
                        <ScrollArea className="h-[250px] bg-slate-50 rounded-lg p-3 border">
                          {testResponse ? (
                            <pre className="text-xs text-slate-700 whitespace-pre-wrap">{JSON.stringify(testResponse, null, 2)}</pre>
                          ) : (
                            <p className="text-slate-400 text-center py-8">Response will appear here</p>
                          )}
                        </ScrollArea>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </>
            )}
          </TabsContent>
        </Tabs>
      </main>
    </div>
  )
}
