// /public/script.js
let currentStream = null;
let useBackCamera = true;
let mode = "fast"; // fast / accurate / accurate_vote3

function ensureModeButton() {
  if (document.getElementById("modeToggle")) return;
  const btn = document.createElement("button");
  btn.id = "modeToggle";
  btn.textContent = `模式：快速`;
  btn.style.position = "fixed";
  btn.style.top = "12px";
  btn.style.right = "12px";
  btn.style.zIndex = "9999";
  btn.style.padding = "8px 12px";
  btn.style.borderRadius = "10px";
  btn.style.border = "1px solid #ddd";
  btn.style.background = "#fff";
  btn.style.fontSize = "14px";
  btn.onclick = () => {
    // fast → accurate → accurate_vote3 循环
    mode = mode === "fast" ? "accurate" : (mode === "accurate" ? "accurate_vote3" : "fast");
    const label = mode === "fast" ? "快速" : (mode === "accurate" ? "准确" : "更准(×3)");
    btn.textContent = `模式：${label}`;
  };
  document.body.appendChild(btn);
}

function setStatus(msg) {
  const el = document.getElementById("status");
  if (el) el.innerText = msg;
}
function setAnswer(ans, meta) {
  const el = document.getElementById("answer");
  if (el) el.innerText = ans || "";
  const metaEl = document.getElementById("modelMeta");
  if (metaEl) {
    const model = meta?.model || (Array.isArray(meta?.usage) ? "gpt-4o" : "");
    metaEl.innerText = model ? `模型：${model}${meta?.votes ? `  投票：${meta.votes.join("/")}` : ""}` : "";
  }
}

async function initCamera() {
  try {
    if (currentStream) currentStream.getTracks().forEach(t => t.stop());
    const constraints = {
      video: {
        facingMode: useBackCamera ? "environment" : "user",
        width: { ideal: 1920 },   // 提高一些清晰度
        height: { ideal: 1920 },
      },
      audio: false
    };
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    currentStream = stream;
    const video = document.getElementById("preview");
    video.srcObject = stream;
  } catch (e) {
    setStatus("无法访问相机：" + e.message);
  }
}

async function takePhotoAndSend() {
  ensureModeButton();
  setStatus("识别中…");
  setAnswer("");

  const video = document.getElementById("preview");
  const canvas = document.getElementById("canvas");
  const w = video.videoWidth;
  const h = video.videoHeight;
  if (!w || !h) {
    setStatus("相机未就绪，请稍后再试");
    return;
  }
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(video, 0, 0, w, h);
  const dataUrl = canvas.toDataURL("image/jpeg", 0.92);

  try {
    const r = await fetch("/answer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageBase64: dataUrl, mode })
    });
    const txt = await r.text();
    let out = {};
    try { out = JSON.parse(txt); } catch { setStatus("服务器返回异常"); return; }

    if (out.answer) {
      setAnswer(out.answer, out.meta);
      setStatus("完成");
      if (navigator.vibrate) navigator.vibrate(60);
    } else {
      setStatus("未能得到答案");
    }
  } catch (e) {
    setStatus("请求失败：" + e.message);
  }
}

document.getElementById("capture")?.addEventListener("click", takePhotoAndSend);
document.getElementById("flip")?.addEventListener("click", () => {
  useBackCamera = !useBackCamera;
  initCamera();
});

// 可选：在页面上预留一个展示模型的小区域
if (!document.getElementById("modelMeta")) {
  const metaDiv = document.createElement("div");
  metaDiv.id = "modelMeta";
  metaDiv.style.marginTop = "6px";
  metaDiv.style.fontSize = "12px";
  metaDiv.style.color = "#666";
  const anchor = document.getElementById("status") || document.body.firstElementChild;
  (anchor?.parentNode || document.body).insertBefore(metaDiv, (anchor?.nextSibling || null));
}

ensureModeButton();
initCamera();
