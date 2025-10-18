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
      input: [
        {
          role: "system",
          content:
            "你是一个只返回选项字母（A/B/C/D）的判题助手。只输出一个大写字母，不要解释。",
        },
        {
          role: "user",
          content: [
            { type: "input_text", text: "请判断图片题的正确答案，只返回 A/B/C/D。" },
            { type: "input_image", image_url: imageBase64 },
          ],
        },
      ],
      max_output_tokens: 5,
    });

    // 安全解析 OpenAI 的返回
    let answer = "";
    if (response.output && Array.isArray(response.output)) {
      const messages = response.output
        .filter((p) => p.type === "message")
        .map((p) =>
          p.content.map((c) => (c.text ? c.text : "")).join("")
        )
        .join("");
      answer = (messages || "").trim().replace(/[^A-D]/g, "");
    } else if (response.output_text) {
      answer = response.output_text.trim().replace(/[^A-D]/g, "");
    }

    if (!answer) answer = "A";

    res.json({ answer });
  } catch (err) {
    console.error("Server error:", err);
    res.status(500).json({ error: "server_error", detail: err.message });
  }
});

app.get("/", (req, res) => {
  res.send("API 正常运行中");
});

export default app;
