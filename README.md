# NEON LOG

赛博朋克风格的个人每日任务与工作记录应用。纯静态页面，无需构建工具，可直接发布到 GitHub Pages。

## 功能

- 在日历中选择日期并添加任务
- 完成任务后自动从当前队列隐藏
- 显示、恢复、编辑或删除任务
- 汇总最近 30 天完成的工作、活跃天数和完成率
- 数据通过 `localStorage` 保存在当前浏览器
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

> GitHub Pages 只提供静态托管，因此当前版本的数据不会跨浏览器或跨设备同步。
