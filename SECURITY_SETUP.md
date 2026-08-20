# 后台上线前安全配置

本目录中的代码已取消共享管理员密码。后台现在使用 Supabase Auth 登录，并由 Edge Function 校验登录邮箱是否在管理员白名单中。

## 必须完成的配置

1. 在 Supabase Auth 中创建一个仅供你本人使用的邮箱/密码账户，并确认邮箱。
2. 在 Supabase Edge Function Secrets 中设置：

   - `ADMIN_EMAILS`：`2778934515@qq.com`；多个邮箱时用英文逗号分隔。
   - `ALLOWED_ORIGINS`：`https://admin.panini-pigs.cn`
   - 保留已有的 `SERVICE_ROLE_KEY`；它只能保存在 Supabase Secrets，绝不能放入网页或 GitHub。

3. 在 Supabase SQL Editor 依次执行 `database/007_security_hardening.sql` 与 `database/008_dashboard_and_batch_management.sql`。
4. 部署 `create-license`、`list-licenses`、`revoke-key`、`activate-key`、`validate-token`、`consume-export`、`dashboard-stats` 和 `delete-licenses` 八个函数。
5. 在 Cloudflare Zero Trust 为 `admin.panini-pigs.cn` 创建 Access 应用，仅允许你的邮箱登录。

## 上线前验证

- 未登录时，生成、查询和注销接口必须返回 `401`。
- 使用不在 `ADMIN_EMAILS` 中的账户登录后，接口必须返回 `401`。
- 同一个导出 token 并发调用时，导出次数不得超过授权上限。
- 授权码列表只应显示掩码，例如 `DY-****-****-ABCD`。
- 工作台统计应正常显示今日成交、累计收入与近七日趋势。
- 批量删除只能删除未激活的激活码。

## 旧明文授权码清理

新授权码已不再写入 `key_plaintext`。确认新版本稳定、且不再需要在列表中查看旧授权码后，再手工执行：

```sql
update public.license_keys set key_plaintext = null where key_plaintext is not null;
```

此步骤不可逆；执行前请确认旧授权码已通过其他方式妥善记录。
