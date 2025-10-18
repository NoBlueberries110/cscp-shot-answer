// public/script.js
let currentStream = null;
let useBackCamera = true;

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
  } catch (e) {
    setStatus("无法访问相机：" + e.message);
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
  const dataUrl = canvas.toDataURL("image/jpeg", 0.9);

  try {
    const r = await fetch("/answer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageBase64: dataUrl })
    });
    const out = await r.json();
    if (out.answer) {
      setAnswer(out.answer);
      setStatus("完成");
      // 震动反馈（如果支持）
      if (window.navigator.vibrate) navigator.vibrate(80);
    } else {
      setStatus("未能得到答案");
    }
  } catch (e) {
    setStatus("请求失败：" + e.message);
  }
}

document.getElementById("capture").addEventListener("click", takePhotoAndSend);
document.getElementById("flip").addEventListener("click", () => {
  useBackCamera = !useBackCamera;
  initCamera();
});

initCamera();
