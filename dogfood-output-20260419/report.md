# HackAgent QA 报告 — 2026-04-19

**测试目标：** https://hackathon.xyz  
**范围：** 未登录态公开路径（首页、活动广场、活动详情、vote、docs、登录/注册）  
**限制：** 未登录态，登录后的 dashboard / api-keys / 活动创建 / 投票互动等未覆盖

---

## 部署验证 ✅
- 域名 `hackathon.xyz` 返回 HTTP 200
- 首页文案已是新版（"从发布到公布结果，四个阶段"、"几天的工作压缩到几小时"），4-18 `commit 9146840` 及 4-17 之后的 `37083c8`/`42bea0d`/`02eeba9` 都已上线
- 最新 commit：`37083c8 fix: /register and /auth/register aliases`

---

## Bug 清单

### 🔴 P0-1  登录/注册页表单错误提示未渲染到 UI
- **URL：** `/login`、`/login?mode=register`
- **复现：**
  1. 打开登录页
  2. 填错误邮箱/密码 → 点登录
  3. 页面无任何反馈，用户不知道发生了什么
- **实际：** API `POST /api/auth/login` 返回 `401 {"error":"邮箱或密码错误"}`，但前端没展示
- **注册页同问题：** `POST /api/auth/register` 返回 `400 {"error":"密码至少 8 位"}`，前端也不展示
- **期望：** 按钮下方或顶部展示 error toast/inline message
- **严重度：** P0 —— 这是用户第一次接触产品的入口，无反馈会让人以为站崩了
- **预计修复位置：** 登录/注册 form 组件的 `onSubmit` 错误分支

### 🟡 P2-2  文档里 API Key 前缀写错
- **位置：** `public/docs.html:318、321-322`，`public/agent.md`（整份），`public/skills/hack2ai/*`，`public/skills/hack2ai.md`
- **问题：** 文档示例用 `hka_xxx` 和环境变量 `HACK2AI_API_KEY`
- **实际：** 代码 `lib/apikey.ts:7` 生成的是 `hk_live_<32 hex>`，变量名应统一为 `HACKAGENT_API_KEY`（老名 HACK2AI 是改名前的遗留）
- **影响：** agent 开发者照文档写代码会以为前缀是 `hka_`，搜不到文档和实际一致

### 🟡 P2-3  已结束活动的「查看评审结果」按钮点进去显示「投票暂未开放」
- **URL：** `/events/public/7c9c52a8-...` → 点"查看评审结果" → `/vote/7c9c52a8-...`
- **实际：** 页面显示 `投票暂未开放 / 该活动的公开投票尚未开启`
- **期望：** 要么显示评审结果排行榜，要么按钮文案改为"公开投票未开启"/隐藏按钮。Mantle Hackathon 活动进入按钮无用页面。
- **对照：** 另一个已结束活动 `3cd04217-...`（RIP Hackathon）同入口能正常显示投票结果页

### 🟢 P3-4  Vote 页 Header 与主站不一致
- **URL：** `/vote/:id`
- **实际：** 使用了独立精简 Header（⚡ HackAgent + theme + Login），没有活动广场、文档、Skill 等全站导航
- **期望：** 统一用 PublicNavbar

### 🟢 P3-5  首页空状态：活动广场只有"已结束"活动
- **URL：** `/events/public`
- **实际：** 2 条活动都已结束，没有任何进行中/即将开始的活动
- **根因：** 之前内存中提到的 TEST-OPEN 测试活动（`e1420eaf-...`）在公开列表中不展示（可能已被过滤或删除）
- **建议：** 产品侧需要至少一个"进行中"活动摆在首位，否则 landing → 活动广场 → 全是结束的，对新访客体验不佳

### 🟢 P3-6  RSC prefetch 请求 docs.html 404
- **详情：** 浏览器控制台多次出现 `GET /docs.html?_rsc=xxxx 404`
- **原因：** `docs.html` 是 public 静态文件，Next.js 把它当 Route 试图 prefetch RSC payload
- **影响：** 功能正常，只污染 console；建议给 Navbar 的 `/docs.html` 链接加 `prefetch={false}`，或把 docs 做成 Next.js 页面

---

## 未测到的区域（需要后续补）
- 登录后所有功能：dashboard、/api-keys、/my/events、活动创建向导、CSV 导入、评委邀请、评分
- 主办方端的「新建活动」流程（没有 organizer 账号）
- Agent API 端到端（register/submit/result）
- 移动端响应式
- i18n：大部分页面只跑了中文

---

## 总结
- **部署是新版，上线 OK**
- 6 个 bug：1 个 P0（登录错误不显示）、2 个 P2（文档 key 前缀错、结束活动入口坏）、3 个 P3（小问题）
- P0 建议今天修。文档的 hka_/HACK2AI 遗留也值得顺手清掉，影响 agent 开发者。
