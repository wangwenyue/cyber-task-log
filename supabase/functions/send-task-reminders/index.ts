import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

type ReminderSetting = {
  user_id: string
  email: string
  enabled: boolean
  reminder_time: string
  timezone: string
  last_sent_on: string | null
}

type Task = { title: string }

function localClock(timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date())
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return { date: `${value.year}-${value.month}-${value.day}`, time: `${value.hour}:${value.minute}` }
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  })[character]!)
}

function emailHtml(date: string, tasks: Task[]) {
  const items = tasks.map((task) => `<li style="margin:0 0 12px;padding:12px 14px;border-left:3px solid #5bf5df;background:#111722;color:#e7f4f2">${escapeHtml(task.title)}</li>`).join('')
  return `<!doctype html><html><body style="margin:0;padding:28px;background:#06080d;font-family:Arial,sans-serif;color:#e7f4f2"><div style="max-width:600px;margin:auto;border:1px solid #202b38;background:#0d1119;padding:28px"><div style="color:#5bf5df;font:12px monospace;letter-spacing:2px">NEON LOG // DAILY OPERATIONS</div><h1 style="margin:14px 0 8px;font-size:28px">${date} 今日待办</h1><p style="margin:0 0 24px;color:#778792">你有 ${tasks.length} 项任务等待完成。</p><ul style="list-style:none;margin:0;padding:0">${items}</ul><p style="margin:24px 0 0;color:#778792;font-size:12px">打开 <a href="https://wangwenyue.github.io/cyber-task-log/" style="color:#5bf5df">NEON LOG</a> 更新进度。</p></div></body></html>`
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405, headers: corsHeaders })

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const resendKey = Deno.env.get('RESEND_API_KEY')
  const emailFrom = Deno.env.get('EMAIL_FROM') || 'NEON LOG <onboarding@resend.dev>'
  if (!resendKey) return Response.json({ error: 'RESEND_API_KEY is not configured' }, { status: 500, headers: corsHeaders })

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })
  const body = await request.json().catch(() => ({}))
  let testUserId: string | null = null

  if (body.test === true) {
    const token = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '')
    if (!token) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders })
    const { data: { user }, error } = await admin.auth.getUser(token)
    if (error || !user) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders })
    testUserId = user.id
  }

  let query = admin.from('reminder_settings').select('*')
  query = testUserId ? query.eq('user_id', testUserId) : query.eq('enabled', true)
  const { data: settings, error: settingsError } = await query
  if (settingsError) return Response.json({ error: settingsError.message }, { status: 500, headers: corsHeaders })

  const results = []
  for (const setting of (settings || []) as ReminderSetting[]) {
    let clock
    try { clock = localClock(setting.timezone) }
    catch { results.push({ userId: setting.user_id, status: 'invalid_timezone' }); continue }

    const isTest = Boolean(testUserId)
    if (!isTest && (clock.time !== setting.reminder_time.slice(0, 5) || setting.last_sent_on === clock.date)) continue

    const { data: tasks, error: taskError } = await admin.from('tasks')
      .select('title').eq('user_id', setting.user_id).eq('task_date', clock.date).eq('completed', false).order('created_at')
    if (taskError) { results.push({ userId: setting.user_id, status: 'task_error' }); continue }

    if (!tasks?.length && !isTest) {
      await admin.from('reminder_settings').update({ last_sent_on: clock.date, updated_at: new Date().toISOString() }).eq('user_id', setting.user_id)
      results.push({ userId: setting.user_id, status: 'no_tasks' }); continue
    }

    const mailTasks = tasks?.length ? tasks : [{ title: '目前没有未完成任务，今天也要保持节奏。' }]
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': `neon-log-${setting.user_id}-${clock.date}-${isTest ? Date.now() : 'daily'}`,
      },
      body: JSON.stringify({
        from: emailFrom, to: [setting.email],
        subject: isTest ? 'NEON LOG 测试邮件' : `NEON LOG｜${clock.date} 今日待办`,
        html: emailHtml(clock.date, mailTasks),
      }),
    })

    if (!response.ok) {
      results.push({ userId: setting.user_id, status: 'send_error', detail: await response.text() }); continue
    }
    if (!isTest) await admin.from('reminder_settings').update({ last_sent_on: clock.date, updated_at: new Date().toISOString() }).eq('user_id', setting.user_id)
    results.push({ userId: setting.user_id, status: 'sent' })
  }

  return Response.json({ ok: true, results }, { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
})
