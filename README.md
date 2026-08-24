# 授权管理后台

此目录包含后台网页、Supabase Edge Functions、数据库迁移与部署说明。后台不使用共享管理员密码；请先完成 [SECURITY_SETUP.md](SECURITY_SETUP.md) 中的身份、白名单和 Cloudflare Access 配置，再上线。

不要将任何 Supabase service role 密钥、管理员密码或 `.env` 文件提交到 GitHub。

## 企业订阅模块

后台在保留个人版次数卡的同时，新增独立的企业订阅创建、分页管理、收款统计和使用日志页面。企业版使用 `enterprise_activation_codes`、`enterprise_payments` 与 `enterprise_logs`，不与个人版表混用。

上线前必须先审阅并从企业订阅服务的迁移历史应用 `database/010_enterprise_admin_integration.sql`，再部署五个 `enterprise-admin-*` 管理函数，最后发布网页。不要从本目录直接执行一次未经核对的完整 `supabase db push`。
