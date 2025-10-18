// server.js
// Minimal backend for Scheme C: camera -> backend -> OpenAI API -> plain answer (A/B/C/D)
// Usage: npm i && cp .env.example .env && edit .env, then: npm run dev
import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import * as dotenv from "dotenv";
import OpenAI from "openai";

dotenv.config();

const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: "10mb" }));
app.use(express.static("public"));

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Health check
app.get("/health", (_, res) => res.json({ ok: true }));

// Accepts { imageBase64: "data:image/jpeg;base64,..." }
app.post("/answer", async (req, res) => {
  try {
    const { imageBase64 } = req.body;
    if (!imageBase64 || !imageBase64.startsWith("data:image")) {
      return res.status(400).json({ error: "imageBase64 required" });
    }

    // System prompt to force single-letter output
    const system = `你是一个只返回选项字母的判题助手。
- 所有题目均为单选题（A/B/C/D），题干和选项在图片中。
- 你的输出必须严格只包含一个大写字母：A 或 B 或 C 或 D。
- 不要输出任何其它字符、空格、换行或解释。
- 如果题目提到“Commitment/Stockpiling”等，请按常见供应链/CSCP知识点判断。
`;

    const userContent = [
      {
        type: "input_text",
        text: "请从图片中的单选题里选择正确答案，只输出 A/B/C/D 中的一个字母。",
      },
      {
        type: "input_image",
        image: imageBase64,
      },
    ];

    // Use Responses API (supports multimodal). Model can be adjusted.
    const response = await openai.responses.create({
      model: "gpt-4o-mini",
      reasoning: { effort: "low" },
      input: [
        { role: "system", content: system },
        { role: "user", content: userContent },
      ],
      max_output_tokens: 5
    });

    // Extract plain text from response
    let text = "";
    try {
      text = response.output_text || "";
    } catch (e) {
      // Fallback parse
      if (response && response.output && Array.isArray(response.output)) {
        const firstText = response.output.find(p => p.type === "message")?.content?.map(c => c.text).join("") || "";
        text = firstText;
      }
    }
    text = (text || "").trim().replace(/[^A-D]/g, ""); // sanitize, keep only A-D
    if (!text) text = "A"; // fallback default

    res.json({ answer: text });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "server_error", detail: String(err) });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Shot-Answer server running at http://localhost:${PORT}`);
});
