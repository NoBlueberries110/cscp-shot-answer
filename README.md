# 拍题速答（极简 Scheme C）

一个只有“拍照并作答”按钮的超简界面：
- 📸 调用手机/电脑摄像头拍照题目
- ☁️ 后端调用 OpenAI 多模态模型识别题目并选择答案
- ✅ 前端仅显示一个大写字母：A / B / C / D

> 适合做 CSCP 等英文单选题的“连拍速答”。

---

## 本地运行（约 2 分钟）
1. 安装 Node.js 18+
2. 解压项目，进入目录：
   ```bash
   npm i
   cp .env.example .env
   # 打开 .env，把你的 OPENAI_API_KEY 填进去
   npm run dev
   ```
3. 打开浏览器访问：`http://localhost:3000`
4. 允许使用摄像头，点击 **“📸 拍照并作答”**

---

## 自定义/注意事项
- **只输出答案字母**：后端强制要求模型只返回 `A/B/C/D`，已做二次清洗。
- **镜头切换**：右侧按钮可切换前/后摄像头。
- **接口安全**：请务必把 `.env` 和 API Key 放在服务器端，不要硬编码在前端。
- **模型可调**：`server.js` 中的 `model` 默认为 `gpt-4o-mini`，可改为你的可用多模态模型。
- **部署**：可用 Vercel/Render/Fly.io/Docker 等，一键部署需保证 Node 18+ 且允许自定义端口。

---

## 常见问题
- **为什么不能纯前端？** 因为直接从浏览器调用 OpenAI API 会暴露你的密钥且受 CORS 限制，所以需要一个轻量后端代理。
- **识别错误？** 尽量确保题目和四个选项都清晰可见；可略微拉远、确保光线均匀；如果题干很长，建议横向拍全。
- **只想要字母，不要解释**？已默认只回字母。如果你要“字母+选项全文”，可在 `server.js` 调整系统提示词。

---

## 文件结构
```
cscp-shot-answer/
  ├─ server.js          # Node/Express 后端：转发图片到 OpenAI 并返回字母
  ├─ package.json
  ├─ .env.example
  ├─ public/
  │   ├─ index.html     # 极简页面（只有拍照与切换镜头）
  │   ├─ script.js
  │   └─ style.css
  └─ README.md
```

祝你刷题顺利，稳定高分 💪


---

## 手机端使用指南（iPhone & Android）

### 推荐：部署到 Vercel（HTTPS，摄像头权限稳定）
1. 安装并登录 [Vercel](https://vercel.com)（免费版即可）。
2. 把本项目上传到 GitHub（或直接在 Vercel 导入 Zip）。
3. 在 Vercel 的「Project Settings → Environment Variables」里添加：
   - `OPENAI_API_KEY`：你的密钥
   - `PORT`：可留空（Vercel 会自动分配）
4. 部署完成后，用手机访问生成的网址（为 HTTPS），允许相机权限即可使用。
5. Safari 菜单选择「**添加到主屏幕**」，以后可一键打开，近似原生 App。

### 临时：本地电脑启动，手机同网访问
- 在电脑 `npm run dev` 启动后，手机连接同一个 Wi‑Fi，访问：
  `http://<你的电脑IP>:3000`
- 注意：iOS 对相机权限通常要求 HTTPS 环境；如果相机打不开，请使用上面的 Vercel 部署方案。

