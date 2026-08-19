# 手机管理后台

`index.html` 是手机管理后台页面。

功能：

- 创建激活码
- 吊销激活码
- 查看激活码列表
- 查看设备绑定和剩余次数

部署方式：

1. 将 `index.html` 部署到任意静态托管，例如 Vercel、Cloudflare Pages、GitHub Pages。
2. 打开页面后输入 `ADMIN_PASSWORD`。
3. 页面会调用 Supabase Edge Function。

不要把 `ADMIN_PASSWORD` 写进这个 HTML。
