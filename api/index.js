// /api/index.js
import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import * as dotenv from "dotenv";
import OpenAI from "openai";

dotenv.config();

const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: "25mb" })); // 放大上限，避免图像过大报错

const SYSTEM_PROMPT =
  "你是一个判题助手。请从图片中的单选题中选出正确答案，严格只输出一个大写字母 A/B/C/D，不要任何其它字符、空格、换行或解释。如果看不清，也必须输出最可能的一个字母。";

// 优先使用 gpt-5；没权限时自动回退 gpt-4o；再回退 gpt-4o-mini（保证可用）
const MODEL_CHAIN = ["gpt-5", "gpt-4o", "gpt-4o-mini"];

function cleanLetter(s) {
  return (s || "").trim().toUpperCase().replace(/[^A-D]/g, "").slice(0, 1) || "";
}

async function askOnce(openai, { imageBase64, model }) {
  const resp = await openai.responses.create({
    model,
    temperature: 0,
    top_p: 1,
    max_output_tokens: 32, // >=16
    input: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: [
          { type: "input_text", text: "从图片中的单选题选出正确答案，只返回 A/B/C/D。" },
          { type: "input_image", image_url: imageBase64 },
        ],
      },
    ],
  });

  let text = "";
  if (resp?.output && Array.isArray(resp.output)) {
    text = resp.output
      .filter((p) => p.type === "message")
      .map((p) =>
        Array.isArray(p.content) ? p.content.map((c) => c?.text || "").join("") : ""
      )
      .join("");
  } else if (resp?.output_text) {
    text = resp.output_text;
  }
  const letter = cleanLetter(text);
  return {
    letter,
    meta: { model: resp?.model || model, id: resp?.id || null, usage: resp?.usage || null },
  };
}

// 试着用优先模型，不行就自动回退
async function askWithFallback(openai, imageBase64) {
  let lastErr = null;
  for (const m of MODEL_CHAIN) {
    try {
      const r = await askOnce(openai, { imageBase64, model: m });
      return r;
    } catch (e) {
      lastErr = e;
      // 继续尝试下一个模型
    }
  }
  throw lastErr || new Error("all models failed");
}

function majority(votes) {
  const m = new Map();
  for (const v of votes) m.set(v, (m.get(v) || 0) + 1);
  let best = "", bestN = 0;
  for (const [k, n] of m.entries()) if (n > bestN) { best = k; bestN = n; }
  return best || votes.find((v) => v) || "A";
}

app.post("/answer", async (req, res) => {
  try {
    const { imageBase64, mode = "accurate_vote3" } = req.body; // 默认就用更准×3
    if (!imageBase64 || !imageBase64.startsWith("data:image")) {
      return res.status(400).json({ error: "imageBase64 required" });
    }

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    if (mode === "accurate_vote3") {
      // 并发三次，投票；每次内部都有模型回退，最终 meta 取第一条
      const [r1, r2, r3] = await Promise.all([
        askWithFallback(openai, imageBase64),
        askWithFallback(openai, imageBase64),
        askWithFallback(openai, imageBase64),
      ]);
      const votes = [r1.letter, r2.letter, r3.letter].map(cleanLetter).filter(Boolean);
      const finalAns = majority(votes);
      const meta = {
        votes,
        model: r1.meta.model,
        ids: [r1.meta.id, r2.meta.id, r3.meta.id],
        usage: [r1.meta.usage, r2.meta.usage, r3.meta.usage],
      };
      return res.json({ answer: finalAns || "A", meta });
    }

    // 单次：fast/accurate 也都先试 gpt-5，失败回退 gpt-4o，再回退 mini
    const one = await askWithFallback(openai, imageBase64);
    const finalAns = one.letter || "A";
    return res.json({ answer: finalAns, meta: one.meta });
  } catch (err) {
    const detail = err?.response?.data || err?.message || String(err);
    console.error("Server error:", detail);
    res.status(500).json({ error: "server_error", detail });
  }
});

app.get("/", (_, res) => res.send("API OK"));
export default app;
