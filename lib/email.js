/**
 * Email service — Azure Communication Services (production) / Resend (dev fallback)
 *
 * Priority:
 *   1. ACS_CONNECTION_STRING → Azure Communication Services (production)
 *   2. RESEND_API_KEY         → Resend HTTP API (local dev / staging)
 *   3. Neither set            → log only (demo mode)
 *
 * All functions return { success: boolean, error?: string }
 */

// ============= ACS SENDER =============
async function sendViaACS(to, subject, html) {
  const { EmailClient } = await import('@azure/communication-email')

  const client = new EmailClient(process.env.ACS_CONNECTION_STRING)
  const from = process.env.ACS_FROM_EMAIL || process.env.RESEND_FROM_EMAIL || 'noreply@synthetix.ai'

  const message = {
    senderAddress: from,
    recipients: { to: [{ address: to }] },
    content: { subject, html },
  }

  const poller = await client.beginSend(message)
  const result = await poller.pollUntilDone()

  if (result.status === 'Succeeded') {
    return { success: true }
  }
  return { success: false, error: result.error?.message || 'ACS send failed' }
}

// ============= RESEND SENDER =============
async function sendViaResend(to, subject, html) {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: process.env.RESEND_FROM_EMAIL || 'noreply@synthetix.ai',
      to: [to],
      subject,
      html,
    }),
  })

  const data = await response.json()
  return { success: response.ok, data, error: response.ok ? undefined : data?.message }
}

// ============= MAIN SEND FUNCTION =============
export async function sendEmail(to, subject, html) {
  try {
    if (process.env.ACS_CONNECTION_STRING) {
      return await sendViaACS(to, subject, html)
    }

    if (process.env.RESEND_API_KEY) {
      return await sendViaResend(to, subject, html)
    }

    // No email provider configured — log in dev
    console.log('[Email] No provider configured. Would send:', { to, subject })
    return { success: false, error: 'Email provider not configured' }
  } catch (err) {
    console.error('[Email] Send error:', err.message)
    return { success: false, error: err.message }
  }
}

// ============= TEMPLATE HELPERS =============
export function passwordResetEmail(resetUrl) {
  return {
    subject: 'Reset Your Synthetix Password',
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
        <h2 style="color:#4f46e5;">Reset Your Password</h2>
        <p>You requested a password reset for your Synthetix account.</p>
        <p>Click the button below to reset your password:</p>
        <a href="${resetUrl}"
           style="display:inline-block;background:#4f46e5;color:white;padding:12px 24px;
                  text-decoration:none;border-radius:6px;margin:16px 0;">
          Reset Password
        </a>
        <p style="color:#666;font-size:14px;">This link expires in 1 hour.</p>
        <p style="color:#666;font-size:14px;">If you didn't request this, ignore this email.</p>
      </div>`,
  }
}

export function emailVerificationEmail(verifyUrl) {
  return {
    subject: 'Verify Your Synthetix Email',
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
        <h2 style="color:#4f46e5;">Verify Your Email</h2>
        <p>Thank you for registering with Synthetix. Please verify your email address.</p>
        <a href="${verifyUrl}"
           style="display:inline-block;background:#4f46e5;color:white;padding:12px 24px;
                  text-decoration:none;border-radius:6px;margin:16px 0;">
          Verify Email
        </a>
        <p style="color:#666;font-size:14px;">This link expires in 24 hours.</p>
      </div>`,
  }
}

export function approvalNotificationEmail(agentName, keyword, approvalId) {
  return {
    subject: `[Synthetix] Action Required: ${agentName}`,
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
        <h2 style="color:#4f46e5;">Action Required: Critical Action Pending</h2>
        <p>Agent <strong>${agentName}</strong> triggered a critical action requiring your approval.</p>
        <div style="background:#fef3c7;border:1px solid #f59e0b;padding:16px;border-radius:6px;margin:16px 0;">
          <p style="margin:0;color:#92400e;"><strong>Triggered keyword:</strong> "${keyword}"</p>
        </div>
        <p>Log in to your Synthetix dashboard to approve or reject this action.</p>
        <p style="color:#666;font-size:14px;">Approval ID: ${approvalId}</p>
      </div>`,
  }
}
