# 芯菜园 - Render一键部署指南

## 什么是Render
Render是国外免费的网站托管平台，支持Node.js后端，URL固定不变。

## 部署步骤（5分钟搞定）

### 1. 注册Render账号
- 打开：https://render.com/
- 点 "Get Started for Free"
- 用GitHub账号登录（推荐），或者用邮箱注册

### 2. 创建GitHub仓库
- 打开：https://github.com/new
- Repository name: `xincaiyuan`
- 选 Public
- 点 Create repository

### 3. 上传代码到这个仓库
有两种方式：

**方式A（简单，推荐）**：GitHub网页上传
1. 进入刚创建的仓库页面
2. 点 "uploading an existing file"
3. 把这个文件夹里的4个文件全拖上去：
   - server.js
   - app.html
   - package.json
   - render.yaml
4. 点 "Commit changes"

**方式B（用git）**：
```bash
cd /path/to/xincaiyuan-render
git init
git add .
git commit -m "initial"
git branch -M main
git remote add origin https://github.com/你的用户名/xincaiyuan.git
git push -u origin main
```

### 4. 在Render部署
1. Render控制台：https://dashboard.render.com/
2. 点 "New +" → "Blueprint"
3. 选择刚才创建的GitHub仓库
4. Render会自动读取render.yaml文件
5. 点 "Apply"
6. 等待2-3分钟部署完成

### 5. 获取URL
部署完成后Render会给一个URL，类似：
```
https://xincaiyuan.onrender.com
```

**这个URL就是永久固定的**，打开就能看到产品，AI对话、植物识别全能用。

### 6. 把URL告诉太阳
部署完成后告诉我URL，我重新生成二维码。

---

## 常见问题

**Q: Render免费版有什么限制？**
A: 每月750小时运行时间（够用），15分钟无访问会休眠（首次访问会慢几秒）

**Q: 如果不想用GitHub？**
A: 可以用Render的 "Manual Deploy"，但比较麻烦，不推荐

**Q: URL能改吗？**
A: 免费版只能用 `xxx.onrender.com` 子域名，改不了。如果需要自己的域名，需要付费plan。

**Q: 数据安全吗？**
A: 免费plan的代码是公开的，但API Key放在环境变量里，不公开。

---

## 文件说明

- `server.js` - Node.js后端（含AI对话、植物识别API）
- `app.html` - 前端页面
- `package.json` - Node.js项目配置
- `render.yaml` - Render自动部署配置（包含API Key）