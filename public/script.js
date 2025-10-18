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
    dbg("initCamera error: " + e.message);
  }
}

function setStatus(msg) {
  document.getElementById("status").innerText = msg;
}
function setAnswer(ans) {
  document.getElementById("answer").innerText = ans || "";
}

// 调试输出区域
const debugDiv = document.createElement("div");
debugDiv.style.position = "fixed";
debugDiv.style.bottom = "0";
debugDiv.style.left = "0";
debugDiv.style.right = "0";
debugDiv.style.background = "rgba(0,0,0,0.7)";
debugDiv.style.color = "white";
debugDiv.style.fontSize = "12px";
debugDiv.style.zIndex = "9999";
debugDiv.style.padding = "4px";
document.body.appendChild(debugDiv);

function dbg(msg) {
  // 显示最后一条日志
  debugDiv.innerText = msg;
  console.log("DBG:", msg);
}

async function takePhotoAndSend() {
  setStatus("识别中…");
  setAnswer("");
  dbg("开始拍照");
  const video = document.getElementById("preview");
  const canvas = document.getElementById("canvas");
  const w = video.videoWidth;
  const h = video.videoHeight;
  if (!w || !h) {
    setStatus("相机未就绪，请稍后再试");
    dbg("videoWidth或videoHeight为0");
    return;
  }
  canvas.width = w; 
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(video, 0, 0, w, h);
  const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
  dbg("dataUrl 短示例: " + dataUrl.substring(0, 30));

  try {
    const r = await fetch("/answer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageBase64: dataUrl })
    });
    dbg("fetch 完成，状态 " + r.status);
    const out = await r.json();
    dbg("返回 JSON: " + JSON.stringify(out));
    if (out.answer) {
      setAnswer(out.answer);
      setStatus("完成");
    } else {
      setStatus("未能得到答案");
      dbg("out.answer 不存在");
    }
  } catch (e) {
    setStatus("请求失败：" + e.message);
    dbg("fetch error: " + e.message);
  }
}

document.getElementById("capture").addEventListener("click", takePhotoAndSend);
document.getElementById("flip").addEventListener("click", () => {
  useBackCamera = !useBackCamera;
  initCamera();
});

initCamera();
