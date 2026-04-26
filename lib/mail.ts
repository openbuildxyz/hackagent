const MAILGUN_DOMAIN = process.env.MAILGUN_DOMAIN || 'build.openbuild.xyz'
const MAILGUN_API_KEY = process.env.MAILGUN_API_KEY
const FROM = process.env.MAIL_FROM || `claw@${MAILGUN_DOMAIN}`
const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://hackathon.xyz'

function requireMailgunApiKey() {
  if (!MAILGUN_API_KEY) {
    throw new Error('MAILGUN_API_KEY is required to send email')
  }
  return MAILGUN_API_KEY
}

async function sendMail(to: string, subject: string, html: string) {
  const apiKey = requireMailgunApiKey()
  const form = new URLSearchParams()
  form.append('from', FROM)
  form.append('to', to)
  form.append('subject', subject)
  form.append('html', html)

  const response = await fetch(`https://api.mailgun.net/v3/${MAILGUN_DOMAIN}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`api:${apiKey}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: form.toString(),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Mailgun error: ${response.status} ${text}`)
  }
}

export async function sendVerificationEmail(email: string, token: string) {
  const link = `${BASE_URL}/verify?token=${token}`
  await sendMail(
    email,
    '验证您的 HackAgent 邮箱',
    `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
      <h2 style="color: #111;">欢迎使用 HackAgent</h2>
      <p>请点击以下链接验证您的邮箱地址：</p>
      <a href="${link}" style="display: inline-block; background: #4f46e5; color: #fff; padding: 12px 24px; border-radius: 6px; text-decoration: none; margin: 16px 0;">验证邮箱</a>
      <p style="color: #666; font-size: 13px;">链接有效期 24 小时。如果您未注册 HackAgent，请忽略此邮件。</p>
    </div>
    `
  )
}

export async function sendPasswordResetEmail(email: string, token: string) {
  const link = `${BASE_URL}/reset-password?token=${token}`
  await sendMail(
    email,
    '重置您的 HackAgent 密码',
    `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
      <h2 style="color: #111;">重置密码</h2>
      <p>我们收到了您的密码重置请求，请点击以下链接设置新密码：</p>
      <a href="${link}" style="display: inline-block; background: #4f46e5; color: #fff; padding: 12px 24px; border-radius: 6px; text-decoration: none; margin: 16px 0;">重置密码</a>
      <p style="color: #666; font-size: 13px;">链接有效期 1 小时。如果您未申请重置密码，请忽略此邮件。</p>
    </div>
    `
  )
}

export async function sendReviewerInviteEmail(
  email: string,
  inviteToken: string,
  eventName: string,
  inviterEmail: string
) {
  const link = `${BASE_URL}/reviewer-invite?token=${inviteToken}`
  await sendMail(
    email,
    `您被邀请参与 HackAgent 黑客松评审：${eventName}`,
    `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
      <h2 style="color: #111;">您收到一份评审邀请</h2>
      <p><strong>${inviterEmail}</strong> 邀请您参与黑客松项目评审活动：</p>
      <p style="font-size: 18px; font-weight: bold; color: #111; margin: 16px 0;">${eventName}</p>
      <p>点击以下按钮注册账号并开始评审（您的专属邀请链接，无需另行填写邀请码）：</p>
      <a href="${link}" style="display: inline-block; background: #4f46e5; color: #fff; padding: 12px 24px; border-radius: 6px; text-decoration: none; margin: 16px 0;">接受邀请并注册</a>
      <p style="color: #666; font-size: 13px;">链接有效期 7 天。如果您已有账号，登录后将自动加入该活动评审。</p>
      <p style="color: #aaa; font-size: 12px;">如果您不认识发件人，请忽略此邮件。</p>
    </div>
    `
  )
}

export async function sendReviewerNotifyEmail(
  email: string,
  eventName: string,
  inviterEmail: string,
  reviewUrl: string
) {
  await sendMail(
    email,
    `您被邀请参与 HackAgent 黑客松评审：${eventName}`,
    `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
      <h2 style="color: #111;">您收到一份评审邀请</h2>
      <p><strong>${inviterEmail}</strong> 邀请您参与黑客松项目评审活动：</p>
      <p style="font-size: 18px; font-weight: bold; color: #111; margin: 16px 0;">${eventName}</p>
      <p>您已有 HackAgent 账号，登录后直接访问以下链接开始评审：</p>
      <a href="${BASE_URL}${reviewUrl}" style="display: inline-block; background: #4f46e5; color: #fff; padding: 12px 24px; border-radius: 6px; text-decoration: none; margin: 16px 0;">进入评审页面</a>
      <p style="color: #aaa; font-size: 12px;">如果您不认识发件人，请忽略此邮件。</p>
    </div>
    `
  )
}

export async function sendWelcomeEmail(email: string) {
  await sendMail(
    email,
    '欢迎使用 HackAgent 🎉',
    `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
      <h2 style="color: #111;">邮箱验证成功！</h2>
      <p>您的账号已激活，初始赠送 200 积分。</p>
      <p style="margin: 16px 0;">
        <a href="${BASE_URL}/login" style="color: #4f46e5; text-decoration: underline; font-weight: bold; font-size: 15px;">立即登录 →</a>
      </p>
      <p style="color: #666; font-size: 13px;">或复制以下链接到浏览器：${BASE_URL}/login</p>
    </div>
    `
  )
}
