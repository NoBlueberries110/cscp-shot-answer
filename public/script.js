// /public/script.js
let currentStream = null;
let useBackCamera = true;
let mode = "fast"; // fast / accurate / accurate_vote3

const video = document.getElementById("preview");
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
const statusEl = document.getElementById("status");
const answerEl = document.getElementById("answer");
const modelMetaEl = document.getElementById("modelMeta");
const fileInput = document.getElementById("fileInput");
const cropOverlay = document.getElementById("cropOverlay");

// —— 模式切换 —— //
const modeBtn = document.getElementById("modeToggle");
modeBtn.onclick = () => {
  mode = mode === "fast" ? "accurate" : (mode === "accurate" ? "accurate_vote3" : "fast");
  const label = mode === "fast" ? "快速" : (mode === "accurate" ? "准确" : "更准(×3)");
  modeBtn.textContent = `模式：${label}`;
};

// —— 状态与结果 —— //
function setStatus(msg) { statusEl.textContent = msg; }
function setAnswer(ans, meta) {
  answerEl.textContent = ans || "";
  if (meta) modelMetaEl.textContent = `模型：${meta.model || (Array.isArray(meta?.usage) ? "gpt-5" : "")}${meta.votes ? `  投票：${meta.votes.join("/")}` : ""}`;
}

// —— 相机 & 变焦 —— //
async function initCamera() {
  try {
    if (currentStream) currentStream.getTracks().forEach(t => t.stop());

    const constraints = {
      video: {
        facingMode: useBackCamera ? "environment" : "user",
        width: { ideal: 1920 },
        height: { ideal: 1920 }
      },
      audio: false
    };
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    currentStream = stream;
    video.srcObject = stream;

    video.onloadedmetadata = () => { setStatus("相机已连接"); };
    attachZoomSlider(stream);
  } catch (e) {
    setStatus("无法访问相机：" + e.message);
  }
}

function attachZoomSlider(stream) {
  const zoomWrap = document.getElementById("zoomWrap");
  const slider = document.getElementById("zoomSlider");
  const track = stream.getVideoTracks()[0];
  const caps = track.getCapabilities?.();
  if (!caps || !("zoom" in caps)) { zoomWrap.style.display = "none"; return; }
  // 设备支持 zoom
  const sMin = caps.zoom.min ?? 1;
  const sMax = caps.zoom.max ?? 1;
  const sStep = caps.zoom.step ?? 0.1;
  slider.min = sMin; slider.max = sMax; slider.step = sStep; slider.value = sMin;
  zoomWrap.style.display = "block";
  slider.oninput = () => {
    track.applyConstraints({ advanced: [{ zoom: Number(slider.value) }] }).catch(()=>{});
  };
}

// —— 拍照/上传到画布 —— //
function drawVideoToCanvas() {
  const w = video.videoWidth, h = video.videoHeight;
  if (!w || !h) throw new Error("相机未就绪");
  canvas.width = w; canvas.height = h;
  ctx.drawImage(video, 0, 0, w, h);
}

function drawImageToCanvas(img) {
  const maxW = 2000; // 防止过大
  const scale = img.width > maxW ? maxW / img.width : 1;
  const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
  canvas.width = w; canvas.height = h;
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
    return t.toDataURL("image/jpeg", 0.92);
  }
  return canvas.toDataURL("image/jpeg", 0.92);
}

// —— 裁切交互 —— //
let isCropping = false;
let cropStart = null;
let cropRect = null;

function canvasClientRect() {
  const r = video.getBoundingClientRect();
  // overlay 与 video 同大小同位置
  return r;
}

function showCropOverlay(rect) {
  if (!rect) { cropOverlay.style.display = "none"; return; }
  const r = canvasClientRect();
  cropOverlay.style.display = "block";
  cropOverlay.style.left = (r.left + rect.x) + "px";
  cropOverlay.style.top = (r.top + rect.y) + "px";
  cropOverlay.style.width = rect.w + "px";
  cropOverlay.style.height = rect.h + "px";
}

// 将页面坐标转换为画布像素
function toCanvasXY(clientX, clientY) {
  const r = video.getBoundingClientRect();
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
  // 同步画布坐标
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
    // 拍当前相机帧
    drawVideoToCanvas();
    const dataUrl = dataURLFromCanvas(); // 全图
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
    // 如果当前在用相机，先把一帧画到 canvas（上传图片则已经在画布上了）
    if (currentStream) drawVideoToCanvas();
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

// 前后摄切换
document.getElementById("flip").addEventListener("click", () => {
  useBackCamera = !useBackCamera;
  initCamera();
});

// 相册上传
fileInput.addEventListener("change", async (e) => {
  try {
    const f = e.target.files?.[0];
    if (!f) return;
    // 停掉相机，避免干扰
    if (currentStream) { currentStream.getTracks().forEach(t => t.stop()); currentStream = null; }
    video.srcObject = null;

    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        drawImageToCanvas(img);
        // 清掉上一次的裁切框
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
