import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import * as dotenv from "dotenv";
import OpenAI from "openai";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.use(cors());
app.use(bodyParser.json({ limit: "10mb" }));

// 静态文件（虽然 routes 已经把 / 指向 index.html，但备用）
app.use(express.static(path.join(__dirname, "../public")));

// API 路由
app.post("/answer", async (req, res) => {
  try {
    const { imageBase64 } = req.body;
    if (!imageBase64 || !imageBase64.startsWith("data:image")) {
      return res.status(400).json({ error: "imageBase64 required" });
    }

    const system = `你是一个只返回选项字母的判题助手。
- 所有题目均为单选题（A/B/C/D）。
- 输出必须严格只包含一个大写字母：A 或 B 或 C 或 D。
- 不要输出其它字符、空格、换行或解释。`;

    const userContent = [
      { type: "input_text", text: "请从图片中的单选题里选择正确答案，只输出 A/B/C/D。" },
      { type: "input_image", image: imageBase64 }
    ];

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const response = await openai.responses.create({
      model: "gpt-4o-mini",
      reasoning: { effort: "low" },
      input: [
        { role: "system", content: system },
        { role: "user", content: userContent }
      ],
      max_output_tokens: 5
    });

    let text = "";
    try {
      text = response.output_text || "";
    } catch (e) {
      if (response && response.output && Array.isArray(response.output)) {
        const firstText = response.output.find(p => p.type === "message")?.content?.map(c => c.text).join("") || "";
        text = firstText;
      }
    }
    text = (text || "").trim().replace(/[^A-D]/g, "");
    if (!text) text = "A";

    res.json({ answer: text });
  } catch (err) {
    console.error("ERROR in /answer:", err);
    res.status(500).json({ error: "server_error", detail: String(err) });
  }
}

export default app;
