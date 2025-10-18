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

// ===== 调试输出设置 =====
(function setupDebug() {
  const debugDiv = document.createElement("div");
  debugDiv.id = "__debug_div";
  debugDiv.style.position = "fixed";
  debugDiv.style.bottom = "0";
  debugDiv.style.left = "0";
  debugDiv.style.right = "0";
  debugDiv.style.background = "rgba(0,0,0,0.8)";
  debugDiv.style.color = "white";
  debugDiv.style.fontSize = "13px";
  debugDiv.style.zIndex = "9999";
  debugDiv.style.padding = "4px";
  debugDiv.style.maxHeight = "120px";
  debugDiv.style.overflowY = "auto";
  document.body.appendChild(debugDiv);

  function dbg(msg) {
    const d = document.getElementById("__debug_div");
    if (d) {
      d.innerText = msg;
    }
    console.log("DBG:", msg);
  }

  // 覆盖 console.log / error
  const origLog = console.log;
  const origError = console.error;
  console.log = function (...args) {
    dbg(args.map(a => String(a)).join(" "));
    origLog.apply(console, args);
  };
  console.error = function (...args) {
    dbg(args.map(a => String(a)).join(" "));
    origError.apply(console, args);
  };

  window.onerror = function (message, source, lineno, colno, error) {
    dbg("window.onerror: " + message + " (" + source + ":" + lineno + ")");
  };

  // 暴露 dbg 供后面使用
  window.dbg = dbg;
})();
// ===== 调试结束 =====

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
    dbg("videoWidth 或 videoHeight 为 0");
    return;
  }
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(video, 0, 0, w, h);
  const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
  dbg("dataUrl 前 30 字: " + (dataUrl ? dataUrl.slice(0, 30) : ""));

  try {
    const r = await fetch("/answer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageBase64: dataUrl })
    });
    dbg("fetch 返回状态: " + r.status);
    const out = await r.json();
    dbg("解析 JSON: " + JSON.stringify(out));
    if (out.answer) {
      setAnswer(out.answer);
      setStatus("完成");
    } else {
      setStatus("未能得到答案");
      dbg("out.answer 不存在");
    }
  } catch (e) {
    setStatus("请求失败：" + e.message);
    dbg("fetch 出错: " + e.message);
  }
}

document.getElementById("capture").addEventListener("click", takePhotoAndSend);
document.getElementById("flip").addEventListener("click", () => {
  useBackCamera = !useBackCamera;
  initCamera();
});

initCamera();
