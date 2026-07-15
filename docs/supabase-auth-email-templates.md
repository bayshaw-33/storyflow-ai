# Kiikis Supabase Auth 邮件模板

## 适用问题

如果注册确认邮件或找回密码邮件中的链接显示为一长串乱码，但点击仍然可以完成验证，优先检查 Supabase 的 Email Templates。不要把 `{{ .ConfirmationURL }}` 单独作为正文输出，应将它放进 UTF-8 HTML 的链接 `href` 中，并给用户显示正常的按钮文字。

Supabase 控制台路径：

`Authentication -> Email Templates`

同时确认：

- `Configuration -> URL Configuration -> Site URL` 设置为 `https://www.kiikis.com`
- Redirect URLs 至少包含 `https://www.kiikis.com/**` 和 `http://localhost:3000/**`
- 如果邮件服务商启用了链接追踪，先关闭链接重写功能

## Confirm signup

Subject：

```text
确认你的 Kiikis 邮箱
```

HTML Content：

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>确认你的 Kiikis 邮箱</title>
  </head>
  <body style="margin:0;background:#111;color:#f5f5f5;font-family:Arial,'PingFang SC','Microsoft YaHei',sans-serif;">
    <div style="max-width:560px;margin:0 auto;padding:40px 24px;">
      <h1 style="font-size:24px;margin:0 0 16px;">欢迎来到 Kiikis</h1>
      <p style="font-size:16px;line-height:1.7;color:#d4d4d4;">点击下面的按钮确认邮箱，开始使用你的创作工作台。</p>
      <p style="margin:28px 0;">
        <a href="{{ .ConfirmationURL }}" style="display:inline-block;padding:13px 22px;background:#fff;color:#111;text-decoration:none;border-radius:8px;font-weight:700;">确认邮箱</a>
      </p>
      <p style="font-size:13px;line-height:1.6;color:#999;">如果你没有注册 Kiikis，可以忽略此邮件。</p>
    </div>
  </body>
</html>
```

## Reset password

Subject：

```text
重置你的 Kiikis 密码
```

HTML Content：

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>重置你的 Kiikis 密码</title>
  </head>
  <body style="margin:0;background:#111;color:#f5f5f5;font-family:Arial,'PingFang SC','Microsoft YaHei',sans-serif;">
    <div style="max-width:560px;margin:0 auto;padding:40px 24px;">
      <h1 style="font-size:24px;margin:0 0 16px;">重置 Kiikis 密码</h1>
      <p style="font-size:16px;line-height:1.7;color:#d4d4d4;">点击下面的按钮设置新密码。</p>
      <p style="margin:28px 0;">
        <a href="{{ .ConfirmationURL }}" style="display:inline-block;padding:13px 22px;background:#fff;color:#111;text-decoration:none;border-radius:8px;font-weight:700;">重置密码</a>
      </p>
      <p style="font-size:13px;line-height:1.6;color:#999;">如果你没有发起密码重置，可以忽略此邮件。</p>
    </div>
  </body>
</html>
```

## 临时开放 Atlas

在 Vercel 的项目设置中新增服务端变量：

```text
ART_ATLAS_ALLOW_ALL_AUTHENTICATED_USERS=true
```

只勾选 Production（如需预览环境测试，再单独勾选 Preview），保存后重新部署。该开关只对已经登录并通过 Supabase Auth 的账号生效，不会把 Atlas Key 暴露给浏览器。

恢复白名单模式时删除该变量，或改为：

```text
ART_ATLAS_ALLOW_ALL_AUTHENTICATED_USERS=false
```

然后重新部署。
