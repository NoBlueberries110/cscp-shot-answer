// 极简：只有“拍照并作答 / 相册选图”
// 默认：更准(×3)；横屏/竖屏按原始分辨率截帧；支持变焦（设备支持才展示）
// 关键提升：PNG 传输（文字保真）、上传图最长边 2560、相机就绪等待

let currentStream = null;
const mode = "accurate_vote3"; // 默认更准(×3)：并发三次 + 模型自动回退（后端已实现）

const video = document.getElementById("preview");
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
const statusEl = document.getElementById("status");
const answerEl = document.getElementById("answer");
const modelMetaEl = document.getElementById("modelMeta");
const fileInput = document.getElementById("fileInput");

// —— 状态与结果 —— //
function setStatus(msg) { statusEl.textContent = msg; }
function setAnswer(ans, meta) {
  answerEl.textContent = ans || "";
  modelMetaEl.textContent = meta?.model
    ? `模型：${meta.model}${meta.votes ? `  投票：${meta.votes.join("/")}` : ""}`
    : "";
}

// —— 相机初始化（等待就绪，兼容横屏）—— //
async function initCamera() {
  try {
    if (currentStream) currentStream.getTracks().forEach(t => t.stop());

    const constraints = {
      video: {
        facingMode: "environment",   // 默认后摄
        width:  { ideal: 1920 },
        height: { ideal: 1920 }
      },
      audio: false
    };
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    currentStream = stream;
    video.srcObject = stream;

    // 等待相机就绪，确保 videoWidth/Height 可用（横屏也能拿到正确尺寸）
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

// —— 变焦滑杆（设备支持才展示）—— //
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

// —— 将当前视频帧绘制到画布（横/竖都按原始方向）—— //
function drawVideoToCanvas() {
  const w = video.videoWidth;
  const h = video.videoHeight;
  if (!w || !h) throw new Error("相机未就绪");
  canvas.width = w;
  canvas.height = h;
  ctx.drawImage(video, 0, 0, w, h);
  // （可选轻微增强：对比度/锐化，默认先不启用）
}

// —— 上传图片等比压缩（最长边 2560）—— //
function drawImageToCanvas(img) {
  const maxEdge = 2560; // ↑ 提高上限，保真更好
  const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
  const w = Math.round(img.width * scale);
  const h = Math.round(img.height * scale);
  canvas.width = w;
  canvas.height = h;
  ctx.drawImage(img, 0, 0, w, h);
}

// —— 以 PNG 传输（提升文字保真）—— //
function dataURLFromCanvas() {
  return canvas.toDataURL("image/png"); // ← 关键：PNG
}

// —— 调用后端 —— //
async function sendToServer(imgDataUrl) {
  const r = await fetch("/answer", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ imageBase64: imgDataUrl, mode }) // 默认更准(×3)
  });
  const txt = await r.text();
  let out = {};
  try { out = JSON.parse(txt); } catch { throw new Error("服务器返回异常"); }
  if (!out.answer) throw new Error("未能得到答案");
  return out;
}

// —— 事件：拍照并作答 —— //
document.getElementById("capture").addEventListener("click", async () => {
  try {
    setStatus("识别中…");
    setAnswer("");
    if (video.readyState < 2) {
      await new Promise(resolve => {
        const check = () => (video.readyState >= 2 ? resolve() : requestAnimationFrame(check));
        check();
      });
    }
    drawVideoToCanvas();                  // 横屏时 w>h，自然是横向清晰截帧
    const dataUrl = dataURLFromCanvas();  // PNG
    const out = await sendToServer(dataUrl);
    setAnswer(out.answer, out.meta);
    setStatus("完成");
    if (navigator.vibrate) navigator.vibrate(60);
  } catch (e) {
    setStatus("失败：" + e.message);
  }
});

// —— 事件：相册选图 —— //
fileInput.addEventListener("change", async (e) => {
  try {
    const f = e.target.files?.[0];
    if (!f) return;

    const reader = new FileReader();
    reader.onload = async () => {
      const img = new Image();
      img.onload = async () => {
        drawImageToCanvas(img);           // 等比压缩（最长边 2560）
        setStatus("识别中…");
        setAnswer("");
        try {
          const dataUrl = dataURLFromCanvas(); // PNG
          const out = await sendToServer(dataUrl);
          setAnswer(out.answer, out.meta);
          setStatus("完成");
          if (navigator.vibrate) navigator.vibrate(60);
        } catch (err) {
          setStatus("失败：" + err.message);
        }
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
