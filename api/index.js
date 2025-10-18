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

// 两种模型：快速(便宜) / 准确(更稳)
const MODEL_MAP = {
  fast: "gpt-4o-mini",
  accurate: "gpt-4o",
};

app.post("/answer", async (req, res) => {
  try {
    const { imageBase64, mode = "fast" } = req.body;

    if (!imageBase64 || !imageBase64.startsWith("data:image")) {
      return res.status(400).json({ error: "imageBase64 required" });
    }

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const model = MODEL_MAP[mode] || MODEL_MAP.fast;

    const response = await openai.responses.create({
      model,
      temperature: 0,
      max_output_tokens: 32, // >= 16，之前报错就是这里太小
      input: [
        {
          role: "system",
          content:
            "你是一个判题助手。请从图片中的单选题中选出正确答案，严格只输出一个大写字母 A/B/C/D，不要任何其它字符、空格、换行或解释。如果看不清，也必须输出最可能的一个字母。",
        },
        {
          role: "user",
          content: [
            { type: "input_text", text: "请判断图片题的正确答案，只返回 A/B/C/D。" },
            // data URL 直接放在 image_url 即可
            { type: "input_image", image_url: imageBase64 },
          ],
        },
      ],
    });

    // 解析 Responses API 的返回
    let answer = "";
    if (response?.output && Array.isArray(response.output)) {
      const text = response.output
        .filter((p) => p.type === "message")
        .map((p) =>
          Array.isArray(p.content) ? p.content.map((c) => c?.text || "").join("") : ""
        )
        .join("");
      answer = (text || "").trim().replace(/[^A-D]/g, "");
    } else if (response?.output_text) {
      answer = response.output_text.trim().replace(/[^A-D]/g, "");
    }

    if (!answer) {
      // 兜底，避免前端空
      return res.status(200).json({ answer: "A", meta: { fallback: true } });
    }

    res.json({
      answer,
      meta: {
        model: response?.model || model,
        id: response?.id || null,
        usage: response?.usage || null,
      },
    });
  } catch (err) {
    const detail = err?.response?.data || err?.message || String(err);
    console.error("Server error:", detail);
    res.status(500).json({ error: "server_error", detail });
  }
});

app.get("/", (_, res) => res.send("API OK"));
export default app;
