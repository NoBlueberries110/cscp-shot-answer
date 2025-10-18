// public/script.js
let currentStream = null;
let useBackCamera = true;

// 创建一个日志区域（强制显示）
const logArea = document.createElement("pre");
logArea.id = "__log_area";
logArea.style.position = "fixed";
logArea.style.bottom = "0";
logArea.style.left = "0";
logArea.style.right = "0";
logArea.style.background = "rgba(0,0,0,0.8)";
logArea.style.color = "white";
logArea.style.fontSize = "12px";
logArea.style.zIndex = "9999";
logArea.style.padding = "4px";
logArea.style.maxHeight = "160px";
logArea.style.overflowY = "auto";
logArea.style.whiteSpace = "pre-wrap";
document.body.appendChild(logArea);

function log(msg) {
  const d = document.getElementById("__log_area");
  if (d) {
    d.innerText += msg + "\n";
  }
  console.log(msg);
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
    log("initCamera: success");
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
  log("video size: " + w + "x" + h);
  if (!w || !h) {
    setStatus("相机未就绪，请稍后再试");
    log("拍照失败：videoWidth 或 videoHeight 为 0");
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
    log("fetch text response: " + text);
    try {
      const out = JSON.parse(text);
      log("parsed JSON: " + JSON.stringify(out));
      if (out.answer) {
        setAnswer(out.answer);
        setStatus("完成");
      } else {
        setStatus("未能得到答案");
        log("out.answer undefined");
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
