// public/script.js
let currentStream = null;
let useBackCamera = true;

// 存储日志字符串
let _logBuffer = [];

// 在页面上创建按钮和日志窗口
(function createLogUI() {
  const btn = document.createElement("button");
  btn.id = "__log_button";
  btn.innerText = "🔍 日志";
  btn.style.position = "fixed";
  btn.style.top = "8px";
  btn.style.right = "8px";
  btn.style.zIndex = "9999";
  btn.style.padding = "8px";
  btn.style.background = "#f00";
  btn.style.color = "#fff";
  btn.style.border = "none";
  btn.style.borderRadius = "4px";
  document.body.appendChild(btn);
  btn.addEventListener("click", () => {
    alert(_logBuffer.join("\n"));
  });
})();

function log(msg) {
  const ts = new Date().toISOString();
  _logBuffer.push(ts + " → " + msg);
  console.log("LOG:", msg);
}

async function initCamera() {
  try {
    if (currentStream) {
      currentStream.getTracks().forEach(t => t.stop());
    }
    const constraints = {
      video: {
        facingMode: useBackCamera ? "environment" : "user",
        width: { ideal: 1280 },
        height: { ideal: 1700 }
      },
      audio: false
    };
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    currentStream = stream;
    const video = document.getElementById("preview");
    video.srcObject = stream;
    log("initCamera success");
  } catch (e) {
    setStatus("无法访问相机：" + e.message);
    log("initCamera error: " + e.message);
  }
}

function setStatus(msg) {
  document.getElementById("status").innerText = msg;
}
function setAnswer(ans) {
  document.getElementById("answer").innerText = ans || "";
}

async function takePhotoAndSend() {
  setStatus("识别中…");
  setAnswer("");
  log("takePhotoAndSend start");
  const video = document.getElementById("preview");
  const canvas = document.getElementById("canvas");
  const w = video.videoWidth;
  const h = video.videoHeight;
  log("video size = " + w + "x" + h);
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
      body: JSON.stringify({ imageBase64: dataUrl })
    });
    log("fetch returned status: " + r.status);
    const text = await r.text();
    log("response text: " + text);
    try {
      const out = JSON.parse(text);
      log("parsed JSON: " + JSON.stringify(out));
      if (out.answer) {
        setAnswer(out.answer);
        setStatus("完成");
      } else {
        setStatus("未能得到答案");
        log("out.answer missing");
      }
    } catch (e2) {
      log("JSON parse error: " + e2.message);
    }
  } catch (e) {
    setStatus("请求失败：" + e.message);
    log("fetch error: " + e.message);
  }
}

document.getElementById("capture").addEventListener("click", takePhotoAndSend);
document.getElementById("flip").addEventListener("click", () => {
  useBackCamera = !useBackCamera;
  initCamera();
});
initCamera();
