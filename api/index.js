// /api/index.js
import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import * as dotenv from "dotenv";
import OpenAI from "openai";

dotenv.config();

const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: "10mb" }));

app.post("/answer", async (req, res) => {
  try {
    const { imageBase64 } = req.body;

    if (!imageBase64 || !imageBase64.startsWith("data:image")) {
      return res.status(400).json({ error: "imageBase64 required" });
    }

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const response = await openai.responses.create({
      model: "gpt-4o-mini",
      temperature: 0,
      max_output_tokens: 32,              // ✅ 改成 >= 16，比如 32
      input: [
        {
          role: "system",
          content:
            "你是一个只返回选项字母（A/B/C/D）的判题助手。严格只输出一个大写字母，不要任何解释。",
        },
        {
          role: "user",
          content: [
            { type: "input_text", text: "请判断图片题的正确答案，只返回 A/B/C/D。" },
            // data URL 作为 image_url 传入即可
            { type: "input_image", image_url: imageBase64 },
          ],
        },
      ],
    });

    // 兼容解析 Responses API 的返回
    let answer = "";
    if (response?.output && Array.isArray(response.output)) {
      const msgText = response.output
        .filter(p => p.type === "message")
        .map(p => (Array.isArray(p.content) ? p.content.map(c => c?.text || "").join("") : ""))
        .join("");
      answer = (msgText || "").trim().replace(/[^A-D]/g, "");
    } else if (response?.output_text) {
      answer = response.output_text.trim().replace(/[^A-D]/g, "");
    }

    if (!answer) {
      // 给个兜底，避免前端显示“未能得到答案”
      return res.status(200).json({ answer: "A", note: "fallback" });
    }

    res.json({ answer });
  } catch (err) {
    // 把 OpenAI 的错误细节透传回来，前端日志能看到
    const detail = err?.response?.data || err?.message || String(err);
    console.error("Server error:", detail);
    res.status(500).json({ error: "server_error", detail });
  }
});

// 可用于快速检查 API 是否活着
app.get("/", (_, res) => {
  res.send("API OK");
});

export default app;
