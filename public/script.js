<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover" />
  <title>拍照秒答 · 极简</title>
  <style>
    body { margin:0; font-family:-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial; background:#f8f9fb; }
    header { padding:12px 16px; font-weight:600; font-size:18px; }
    .wrap { padding:12px 16px; }
    .panel { background:#fff; border-radius:14px; box-shadow:0 6px 20px rgba(0,0,0,.05); padding:12px; margin-bottom:12px; }
    video, canvas { width:100%; border-radius:12px; background:#000; }
    .btns { display:flex; gap:8px; flex-wrap:wrap; margin-top:10px; }
    button, label.btn { flex:1; padding:12px 10px; border-radius:12px; border:1px solid #e5e7eb; background:#fff; font-size:15px; }
    #zoomWrap { position:fixed; left:12px; bottom:12px; z-index:9999; width:65%; display:none; }
    #zoomSlider { width:100%; }
    .status { color:#666; font-size:14px; margin-top:6px; }
    .answer { font-size:28px; font-weight:800; margin-top:6px; }
    .meta { font-size:12px; color:#888; margin-top:4px; }
  </style>
</head>
<body>
  <header>拍照秒答</header>
  <div class="wrap">
    <div class="panel">
      <video id="preview" playsinline autoplay muted></video>
      <canvas id="canvas" style="display:none;"></canvas>
      <div id="zoomWrap"><input id="zoomSlider" type="range" min="1" max="1" step="0.1" value="1" /></div>

      <div class="btns">
        <button id="capture">拍照并作答</button>
        <label class="btn">
          从相册选图
          <input id="fileInput" type="file" accept="image/*" style="display:none;" />
        </label>
      </div>

      <div class="status" id="status">准备就绪</div>
      <div class="answer" id="answer"></div>
      <div class="meta"><span id="modelMeta"></span></div>
    </div>
  </div>

  <script src="script.js"></script>
</body>
</html>
