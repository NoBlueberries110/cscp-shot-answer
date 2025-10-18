// /public/script.js
let currentStream = null;
let useBackCamera = true;
let mode = "fast"; // fast / accurate

// —— UI 辅助 —— //
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
    mode = mode === "fast" ? "accurate" : "fast";
    btn.textContent = `模式：${mode === "fast" ? "快速" : "准确"}`;
    log(`mode switched -> ${mode}`);
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
  // 把模型名也显示一下，方便你确认
  const metaEl = document.getElementById("modelMeta");
  if (metaEl && meta?.model) metaEl.innerText = `模型：${meta.model}`;
}

function log(msg) {
  try {
    const list = (window.__debugLogs ||= []);
    const line = `${new Date().toISOString()} → ${msg}`;
    list.push(line);
  } catch {}
}

function showLogs() {
  const list = window.__debugLogs || [];
  const host = window.location.host;
  const text = [`${host}`, ...list].join("\n\n");
  alert(text);
}

// 如果页面上没有“调试”按钮，这里自动加一个
(function ensureDebugButton() {
  if (!document.getElementById("debugBtn")) {
    const btn = document.createElement("button");
    btn.id = "debugBtn";
    btn.textContent = "🔍 日志";
    btn.style.position = "fixed";
    btn.style.bottom = "12px";
    btn.style.right = "12px";
    btn.style.zIndex = "9999";
    btn.style.padding = "10px 14px";
    btn.style.borderRadius = "50px";
    btn.style.border = "1px solid #ddd";
    btn.style.background = "#fff";
    btn.style.fontSize = "14px";
    btn.onclick = showLogs;
    document.body.appendChild(btn);
  } else {
    document.getElementById("debugBtn").onclick = showLogs;
  }
})();

// —— 相机逻辑 —— //
async function initCamera() {
  try {
    if (currentStream) {
      currentStream.getTracks().forEach((t) => t.stop());
    }
    const constraints = {
      video: {
        facingMode: useBackCamera ? "environment" : "user",
        width: { ideal: 1280 },
        height: { ideal: 1700 },
      },
      audio: false,
    };
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    currentStream = stream;
    const video = document.getElementById("preview");
    video.srcObject = stream;

    video.onloadedmetadata = () => {
      log("initCamera success");
    };
  } catch (e) {
    setStatus("无法访问相机：" + e.message);
    log("initCamera error: " + e.message);
  }
}

async function takePhotoAndSend() {
  setStatus("识别中…");
  setAnswer("");
  ensureModeButton();

  const video = document.getElementById("preview");
  const canvas = document.getElementById("canvas");
  const w = video.videoWidth;
  const h = video.videoHeight;

  log("takePhotoAndSend start");
  log(`video size = ${w}x${h}`);

  if (!w || !h) {
    setStatus("相机未就绪，请稍后再试");
    log("video size invalid");
    return;
  }

  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(video, 0, 0, w, h);
  const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
  log("dataUrl prefix: " + dataUrl.slice(0, 30));

  try {
    const r = await fetch("/answer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageBase64: dataUrl, mode }), // 关键：把模式传给后端
    });

    const txt = await r.text();
    log(`fetch returned status: ${r.status}`);
    log(`response text: ${txt.slice(0, 400)}`);

    let out;
    try {
      out = JSON.parse(txt);
      log("parsed JSON: " + txt.slice(0, 400));
    } catch (e) {
      log("JSON parse error: " + e.message);
      setStatus("服务器返回异常");
      return;
    }

    if (out.answer) {
      setAnswer(out.answer, out.meta);
      setStatus("完成");
      if (navigator.vibrate) navigator.vibrate(80);
    } else {
      setStatus("未能得到答案");
      log("out.answer missing");
    }
  } catch (e) {
    setStatus("请求失败：" + e.message);
    log("fetch error: " + e.message);
  }
}

// —— 绑定按钮 —— //
document.getElementById("capture")?.addEventListener("click", takePhotoAndSend);
document.getElementById("flip")?.addEventListener("click", () => {
  useBackCamera = !useBackCamera;
  initCamera();
});
document.getElementById("debugBtn")?.addEventListener("click", showLogs);

// 页面启动
ensureModeButton();
initCamera();

// 如果你有一个 <div id="modelMeta"></div>，会显示当前模型名字
