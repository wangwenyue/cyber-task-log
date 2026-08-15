# NEON LOG

赛博朋克风格的个人每日任务与工作记录应用。纯静态页面，无需构建工具，可直接发布到 GitHub Pages。

## 功能

- 在日历中选择日期并添加任务，可设置截止时间和紧急程度
- 完成任务后自动从当前队列隐藏
- 显示、恢复、编辑或删除任务
- 汇总最近 30 天完成的工作、活跃天数和完成率
- 使用 Supabase Auth 登录，任务存储在云端 Postgres
- 同一账号可在电脑和手机间同步任务
- 首次登录时自动迁移旧版浏览器本地任务
- 可在账号设置中配置每日待办邮件、发送时间和时区
- Supabase Cron 每分钟检查提醒，由 Edge Function 通过 Resend 发送（邮件中包含截止时间和紧急程度）
- 适配桌面和手机屏幕

## 本地预览

在此目录运行：

```bash
python3 -m http.server 8000
```

然后打开 `http://localhost:8000/`。

## 发布到 GitHub Pages

推荐将本目录内容放进一个新的 GitHub 仓库，例如 `neon-log`：

1. 推送到仓库的 `main` 分支。
2. 进入 **Settings → Pages**。
3. 在 **Build and deployment** 中选择 **Deploy from a branch**。
4. 选择 `main` 和 `/(root)`，保存。

发布地址通常为 `https://<用户名>.github.io/neon-log/`。

## 云端配置

前端通过 Supabase publishable key 连接云端，数据访问由 Auth 与 Row Level Security 隔离。`service_role` 或 secret key 不得写入前端文件。

邮件服务端密钥保存在 Supabase Edge Function Secrets：

- `RESEND_API_KEY`
- `EMAIL_FROM`

数据库迁移位于 `supabase/migrations/`，邮件函数位于 `supabase/functions/send-task-reminders/`。
