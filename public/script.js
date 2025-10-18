// /public/script.js
let currentStream = null;
let useBackCamera = true;
// 默认更准(×3)
let mode = "accurate_vote3"; // fast / accurate / accurate_vote3

const video = document.getElementById("preview");
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
const statusEl = document.getElementById("status");
const answerEl = document.getElementById("answer");
const modelMetaEl = document.getElementById("modelMeta");
const fileInput = document.getElementById("fileInput");
const cropOverlay = document.getElementById("cropOverlay");

// —— 模式切换按钮 —— //
const modeBtn = document.getElementById("modeToggle");
modeBtn.textContent = "模式：更准(×3)";
modeBtn.onclick = () => {
  mode = mode === "accurate_vote3" ? "accurate" : (mode === "accurate" ? "fast" : "accurate_vote3");
  const label = mode === "accurate_vote3" ? "更准(×3)" : (mode === "accurate" ? "准确" : "快速");
  modeBtn.textContent = `模式：${label}`;
};

function setStatus(msg) { statusEl.textContent = msg; }
function setAnswer(ans, meta) {
  answerEl.textContent = ans || "";
  modelMetaEl.textContent = meta?.model ? `模型：${meta.model}${meta.votes ? `  投票：${meta.votes.join("/")}` : ""}` : "";
}

// —— 相机初始化（考虑横屏 & 就绪）—— //
async function initCamera() {
  try {
    if (currentStream) currentStream.getTracks().forEach(t => t.stop());

    const constraints = {
      video: {
        facingMode: useBackCamera ? "environment" : "user",
        width: { ideal: 1920 },   // 提高分辨率，横屏更清晰
        height: { ideal: 1920 },
      },
      audio: false
    };
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    currentStream = stream;
    video.srcObject = stream;

    // 等待就绪，确保 videoWidth/Height 可用
    await new Promise(resolve => {
      const check = () => (video.readyState >= 2 ? resolve() : requestAnimationFrame(check));
      check();
    });
    setStatus("相机已连接");
    attachZoomSlider(stream);
  } catch (e) {
    setStatus("无法访问相机：" + e.message);
  }
}

// —— 变焦滑杆（支持才显示）—— //
function attachZoomSlider(stream) {
  const zoomWrap = document.getElementById("zoomWrap");
  const slider = document.getElementById("zoomSlider");
  const track = stream.getVideoTracks()[0];
  const caps = track.getCapabilities?.();
  if (!caps || !("zoom" in caps)) { zoomWrap.style.display = "none"; return; }
  const sMin = caps.zoom.min ?? 1;
  const sMax = caps.zoom.max ?? 1;
  const sStep = caps.zoom.step ?? 0.1;
  slider.min = sMin; slider.max = sMax; slider.step = sStep; slider.value = sMin;
  zoomWrap.style.display = "block";
  slider.oninput = () => {
    track.applyConstraints({ advanced: [{ zoom: Number(slider.value) }] }).catch(()=>{});
  };
}

// —— 把当前视频帧画到画布（横/竖都按原始方向绘制）—— //
function drawVideoToCanvas() {
  const w = video.videoWidth;
  const h = video.videoHeight;
  if (!w || !h) throw new Error("相机未就绪");
  canvas.width = w;
  canvas.height = h;
  // 不强制旋转：保持摄像头原始方向（横屏时 w>h，自然是横向）
  ctx.drawImage(video, 0, 0, w, h);
}

// —— 把上传图片画到画布（最长边 2000 等比压缩）—— //
function drawImageToCanvas(img) {
  const maxEdge = 2000;
  const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
  const w = Math.round(img.width * scale);
  const h = Math.round(img.height * scale);
  canvas.width = w;
  canvas.height = h;
  ctx.drawImage(img, 0, 0, w, h);
}

function dataURLFromCanvas(cropRect) {
  if (cropRect) {
    const { x, y, w, h } = cropRect;
    const t = document.createElement("canvas");
    t.width = Math.max(1, Math.round(w));
    t.height = Math.max(1, Math.round(h));
    const tctx = t.getContext("2d");
    tctx.drawImage(canvas, x, y, w, h, 0, 0, t.width, t.height);
    return t.toDataURL("image/jpeg", 0.9);
  }
  return canvas.toDataURL("image/jpeg", 0.9);
}

// —— 裁剪交互（横/竖都按可视区域计算）—— //
let isCropping = false;
let cropStart = null;
let cropRect = null;

function videoClientRect() {
  return video.getBoundingClientRect();
}
function showCropOverlay(rect) {
  if (!rect) { cropOverlay.style.display = "none"; return; }
  const r = videoClientRect();
  cropOverlay.style.display = "block";
  cropOverlay.style.left = (r.left + rect.x) + "px";
  cropOverlay.style.top = (r.top + rect.y) + "px";
  cropOverlay.style.width = rect.w + "px";
  cropOverlay.style.height = rect.h + "px";
}
function toCanvasXY(clientX, clientY) {
  const r = videoClientRect();
  const xRate = canvas.width / r.width;
  const yRate = canvas.height / r.height;
  return { x: (clientX - r.left) * xRate, y: (clientY - r.top) * yRate, visX: clientX - r.left, visY: clientY - r.top };
}
function startCrop(e) {
  const t = e.touches ? e.touches[0] : e;
  cropStart = toCanvasXY(t.clientX, t.clientY);
  isCropping = true;
}
function moveCrop(e) {
  if (!isCropping || !cropStart) return;
  const t = e.touches ? e.touches[0] : e;
  const cur = toCanvasXY(t.clientX, t.clientY);
  const w = Math.abs(cur.visX - cropStart.visX);
  const h = Math.abs(cur.visY - cropStart.visY);
  const x = Math.min(cur.visX, cropStart.visX);
  const y = Math.min(cur.visY, cropStart.visY);
  showCropOverlay({ x, y, w, h });

  // 转画布坐标
  const rx = Math.min(cur.x, cropStart.x);
  const ry = Math.min(cur.y, cropStart.y);
  const rw = Math.abs(cur.x - cropStart.x);
  const rh = Math.abs(cur.y - cropStart.y);
  cropRect = { x: rx, y: ry, w: rw, h: rh };
}
function endCrop() { isCropping = false; }

video.addEventListener("mousedown", startCrop);
video.addEventListener("mousemove", moveCrop);
document.addEventListener("mouseup", endCrop);
video.addEventListener("touchstart", startCrop, { passive: true });
video.addEventListener("touchmove", moveCrop, { passive: true });
document.addEventListener("touchend", endCrop, { passive: true });

// —— 调用后端 —— //
async function sendToServer(imgDataUrl) {
  const r = await fetch("/answer", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ imageBase64: imgDataUrl, mode })
  });
  const txt = await r.text();
  let out = {};
  try { out = JSON.parse(txt); } catch { throw new Error("服务器返回异常"); }
  if (!out.answer) throw new Error("未能得到答案");
  return out;
}

// —— 事件 —— //
document.getElementById("capture").addEventListener("click", async () => {
  try {
    setStatus("识别中…");
    setAnswer("");
    // 等待就绪，避免 0×0
    if (video.readyState < 2) {
      await new Promise(resolve => {
        const check = () => (video.readyState >= 2 ? resolve() : requestAnimationFrame(check));
        check();
      });
    }
    drawVideoToCanvas(); // 横屏时 w>h，自然是横向
    const dataUrl = dataURLFromCanvas();
    const out = await sendToServer(dataUrl);
    setAnswer(out.answer, out.meta);
    setStatus("完成");
    if (navigator.vibrate) navigator.vibrate(60);
  } catch (e) {
    setStatus("失败：" + e.message);
  }
});

document.getElementById("cropDetect").addEventListener("click", async () => {
  try {
    if (!cropRect || cropRect.w < 5 || cropRect.h < 5) {
      setStatus("请先在预览上拖动，框选题目区域");
      return;
    }
    setStatus("识别中（裁切）…");
    setAnswer("");
    const dataUrl = dataURLFromCanvas(cropRect);
    const out = await sendToServer(dataUrl);
    setAnswer(out.answer, out.meta);
    setStatus("完成");
    if (navigator.vibrate) navigator.vibrate(60);
  } catch (e) {
    setStatus("失败：" + e.message);
  }
});

document.getElementById("flip").addEventListener("click", () => {
  useBackCamera = !useBackCamera;
  initCamera();
});

fileInput.addEventListener("change", async (e) => {
  try {
    const f = e.target.files?.[0];
    if (!f) return;
    if (currentStream) { currentStream.getTracks().forEach(t => t.stop()); currentStream = null; }
    video.srcObject = null;

    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        drawImageToCanvas(img);         // 等比压缩（最长边 2000）
        cropRect = null; showCropOverlay(null);
        setStatus("图片已加载，可直接识别或拖动框选后点“仅识别框选区域”");
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(f);
  } catch (err) {
    setStatus("读取图片失败：" + err.message);
  }
});

// 启动
initCamera();
