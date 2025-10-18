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

// 更强的系统提示（先读题再答；严格只输出 A/B/C/D）
const SYSTEM_PROMPT =
  "你是一个判题助手。请先在心里完整阅读题干和四个选项，再做出判断。严格只输出一个大写字母 A/B/C/D，不得包含空格、换行或任何解释。若图片不够清晰，也必须输出你最可能的一个字母。";

// 优先使用 gpt-5；没权限则自动回退 gpt-4o；再回退 gpt-4o-mini（保证可用）
const MODEL_CHAIN = ["gpt-5", "gpt-4o", "gpt-4o-mini"];

// 清洗输出为单个字母
function cleanLetter(s) {
  return (s || "").trim().toUpperCase().replace(/[^A-D]/g, "").slice(0, 1) || "";
}

// 单轮视觉问答
async function askOnce(openai, { imageBase64, model }) {
  const resp = await openai.responses.create({
    model,
    temperature: 0,
    top_p: 1,
    max_output_tokens: 64, // ↑ 足够的推理空间
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

// two-pass：先 OCR/结构化文本，再让模型只基于文本选 A/B/C/D
async function askTwoPass(openai, { imageBase64 }) {
  // 第 1 步：从图中抽取题干+选项为纯文本
  const model1 = await chooseModel(openai); // 视觉模型
  const step1 = await openai.responses.create({
    model: model1,
    temperature: 0,
    top_p: 1,
    max_output_tokens: 256,
    input: [
      {
        role: "system",
        content:
          "请从图片中提取一道单选题的清晰文本（题干+四个选项）。严格输出如下格式：\nQUESTION: <题干>\nA) <选项A>\nB) <选项B>\nC) <选项C>\nD) <选项D>"
      },
      {
        role: "user",
        content: [
          { type: "input_text", text: "请提取清晰的题目文本（仅一题）。" },
          { type: "input_image", image_url: imageBase64 }
        ]
      }
    ]
  });

  let text1 = "";
  if (step1?.output && Array.isArray(step1.output)) {
    text1 = step1.output
      .filter(p => p.type === "message")
      .map(p => Array.isArray(p.content) ? p.content.map(c => c?.text || "").join("") : "")
      .join("");
  } else if (step1?.output_text) {
    text1 = step1.output_text;
  }
  const extracted = (text1 || "").trim();

  // 第 2 步：基于提取的文本，只返回 A/B/C/D
  const model2 = await chooseModel(openai, /*vision*/ false); // 文本判断；仍可用 gpt-5
  const step2 = await openai.responses.create({
    model: model2,
    temperature: 0,
    top_p: 1,
    max_output_tokens: 64,
    input: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: [{ type: "input_text", text: extracted + "\n只返回 A/B/C/D。" }] }
    ]
  });

  let text2 = "";
  if (step2?.output && Array.isArray(step2.output)) {
    text2 = step2.output
      .filter(p => p.type === "message")
      .map(p => Array.isArray(p.content) ? p.content.map(c => c?.text || "").join("") : "")
      .join("");
  } else if (step2?.output_text) {
    text2 = step2.output_text;
  }

  const letter = cleanLetter(text2);
  return {
    letter,
    meta: { model: step2?.model || model2, id: step2?.id || null, usage: step2?.usage || null }
  };
}

// 从模型链里择优（若报错就抛回上层做回退）
async function askWithModel(openai, imageBase64, model) {
  return await askOnce(openai, { imageBase64, model });
}

// 自动回退：gpt-5 → 4o → 4o-mini
async function askWithFallback(openai, imageBase64) {
  let lastErr = null;
  for (const m of MODEL_CHAIN) {
    try {
      const r = await askWithModel(openai, imageBase64, m);
      return r;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error("all models failed");
}

// two-pass 也使用同样的优先级（选择一个视觉模型 + 一个文本模型）
// 这里简单处理：优先 gpt-5，不行回退 4o，再回退 mini
async function chooseModel(openai, vision = true) {
  for (const m of MODEL_CHAIN) {
    // 这里不真正调用，只是返回候选名称；具体错误在调用时捕获
    return m;
  }
  return MODEL_CHAIN[MODEL_CHAIN.length - 1];
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
    // 支持的 mode：
    // - fast：单次；会自动回退
    // - accurate：单次；会自动回退
    // - accurate_vote3：并发三次投票；每次自动回退（默认）
    // - accurate_vote5：并发五次投票；每次自动回退
    // - two_pass：先 OCR/结构化，再基于文本判断（单次）
    const { imageBase64, mode = "accurate_vote3" } = req.body;
    if (!imageBase64 || !imageBase64.startsWith("data:image")) {
      return res.status(400).json({ error: "imageBase64 required" });
    }

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    if (mode === "two_pass") {
      const r = await askTwoPass(openai, { imageBase64 });
      const finalAns = r.letter || "A";
      return res.json({ answer: finalAns, meta: r.meta });
    }

    if (mode === "accurate_vote5") {
      const tasks = Array.from({ length: 5 }, () => askWithFallback(openai, imageBase64));
      const results = await Promise.all(tasks);
      const votes = results.map(r => cleanLetter(r.letter)).filter(Boolean);
      const finalAns = majority(votes);
      // 取第一条的 meta 作为代表
      const meta = {
        votes,
        model: results[0]?.meta?.model,
        ids: results.map(r => r.meta?.id),
        usage: results.map(r => r.meta?.usage)
      };
      return res.json({ answer: finalAns || "A", meta });
    }

    if (mode === "accurate_vote3") {
      const [r1, r2, r3] = await Promise.all([
        askWithFallback(openai, imageBase64),
        askWithFallback(openai, imageBase64),
        askWithFallback(openai, imageBase64)
      ]);
      const votes = [r1.letter, r2.letter, r3.letter].map(cleanLetter).filter(Boolean);
      const finalAns = majority(votes);
      const meta = {
        votes,
        model: r1.meta.model,
        ids: [r1.meta.id, r2.meta.id, r3.meta.id],
        usage: [r1.meta.usage, r2.meta.usage, r3.meta.usage]
      };
      return res.json({ answer: finalAns || "A", meta });
    }

    // fast / accurate：单次（内部仍走优先-回退）
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
