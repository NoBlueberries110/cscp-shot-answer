// /api/index.js
import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import * as dotenv from "dotenv";
import OpenAI from "openai";

dotenv.config();

const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: "15mb" }));

// 模型映射：快速/准确/投票(仍用准确模型跑3次)
const MODEL_MAP = {
  fast: "gpt-4o-mini",   // 便宜、快
  accurate: "gpt-5"      // ✅ 更准（需要你的账号有 GPT-5 权限）
};

const SYSTEM_PROMPT =
  "你是一个判题助手。请从图片中的单选题中选出正确答案，严格只输出一个大写字母 A/B/C/D，不要任何其它字符、空格、换行或解释。如果看不清，也必须输出最可能的一个字母。";

function cleanLetter(s) {
  return (s || "").trim().toUpperCase().replace(/[^A-D]/g, "").slice(0, 1) || "";
}

async function askOnce(openai, { imageBase64, model }) {
  const resp = await openai.responses.create({
    model,
    temperature: 0,
    top_p: 1,
    max_output_tokens: 32,   // >=16
    input: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: [
          { type: "input_text", text: "从图片中的单选题选出正确答案，只返回 A/B/C/D。" },
          { type: "input_image", image_url: imageBase64 }
        ]
      }
    ]
  });

  let text = "";
  if (resp?.output && Array.isArray(resp.output)) {
    text = resp.output
      .filter(p => p.type === "message")
      .map(p => Array.isArray(p.content) ? p.content.map(c => c?.text || "").join("") : "")
      .join("");
  } else if (resp?.output_text) {
    text = resp.output_text;
  }
  const letter = cleanLetter(text);
  return {
    letter,
    meta: { model: resp?.model || model, id: resp?.id || null, usage: resp?.usage || null }
  };
}

function majority(votes) {
  const m = new Map();
  for (const v of votes) m.set(v, (m.get(v) || 0) + 1);
  let best = "", bestN = 0;
  for (const [k, n] of m.entries()) if (n > bestN) { best = k; bestN = n; }
  return best || votes.find(v => v) || "A";
}

app.post("/answer", async (req, res) => {
  try {
    const { imageBase64, mode = "fast" } = req.body;
    if (!imageBase64 || !imageBase64.startsWith("data:image")) {
      return res.status(400).json({ error: "imageBase64 required" });
    }

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const isVote3 = mode === "accurate_vote3";
    const baseModel = MODEL_MAP.accurate; // 投票用准确模型
    const model = isVote3 ? baseModel : (MODEL_MAP[mode] || MODEL_MAP.fast);

    if (!isVote3) {
      const one = await askOnce(openai, { imageBase64, model });
      const finalAns = one.letter || "A";
      return res.json({ answer: finalAns, meta: one.meta });
    }

    // 并发三次投票
    const [r1, r2, r3] = await Promise.all([
      askOnce(openai, { imageBase64, model }),
      askOnce(openai, { imageBase64, model }),
      askOnce(openai, { imageBase64, model })
    ]);
    const votes = [r1.letter, r2.letter, r3.letter].map(cleanLetter).filter(Boolean);
    const finalAns = majority(votes);
    const meta = {
      votes,
      model,
      ids: [r1.meta.id, r2.meta.id, r3.meta.id],
      usage: [r1.meta.usage, r2.meta.usage, r3.meta.usage]
    };
    return res.json({ answer: finalAns || "A", meta });
  } catch (err) {
    const detail = err?.response?.data || err?.message || String(err);
    console.error("Server error:", detail);
    res.status(500).json({ error: "server_error", detail });
  }
});

app.get("/", (_, res) => res.send("API OK"));
export default app;
