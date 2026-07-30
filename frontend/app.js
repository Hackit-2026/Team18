// AIRS フロントエンド
// 配信開始と同時にマイクを常時ON。喋って少し黙ると1区切りとして
// バックエンドに送り、視聴者コメント（質問など）を受け取って流す。
// 自分の発言（文字起こし）はチャットには表示しない。

const els = {
  video: document.getElementById("video"),
  capture: document.getElementById("capture"),
  startOverlay: document.getElementById("startOverlay"),
  startBtn: document.getElementById("startBtn"),
  videoControls: document.getElementById("videoControls"),
  micState: document.getElementById("micState"),
  stopBtn: document.getElementById("stopBtn"),
  modeSelect: document.getElementById("modeSelect"),
  cameraLabel: document.getElementById("cameraLabel"),
  cameraSelect: document.getElementById("cameraSelect"),
  paceRange: document.getElementById("paceRange"),
  chatList: document.getElementById("chatList"),
  chatNote: document.getElementById("chatNote"),
  liveBadge: document.getElementById("liveBadge"),
  viewers: document.getElementById("viewers"),
  summaryModal: document.getElementById("summaryModal"),
  summaryText: document.getElementById("summaryText"),
  closeSummary: document.getElementById("closeSummary"),
};

const state = {
  stream: null,
  live: false,
  captureTimer: null,
  viewerTimer: null,
  inFlight: false,       // 映像リクエストの二重送信を防ぐ
  history: [],           // 直近のやり取り（AIへの文脈用。画面には出さない分も含む）
  log: [],               // 表示したコメントのログ（振り返り用）
  viewers: 0,
  nameColors: {},
  // 音声まわり
  audioCtx: null,
  analyser: null,
  vadTimer: null,
  recorder: null,
  chunks: [],
  speaking: false,
  lastLoudAt: 0,
  segStartAt: 0,
  sending: false,        // 音声送信中フラグ
};

// ---- 発話区切りの調整パラメータ ----
const VAD = {
  startLevel: 0.045,   // これを超えたら「喋っている」とみなす
  keepLevel: 0.03,     // これを下回る状態が続いたら「区切り」
  silenceMs: 900,      // 無音がこの時間続いたら1区切り
  minSpeechMs: 400,    // これより短い音は無視（雑音対策）
  maxSpeechMs: 15000,  // 長すぎる発話は強制的に区切る
};

// ---- 名前の色を安定させる ----
const PALETTE = [
  "#ff7a33", "#4dd4c0", "#7aa2ff", "#ff6fa5", "#c58bff",
  "#ffd166", "#8ce99a", "#ff9f7a", "#66d9ef", "#f7a1c4",
];
function colorFor(name) {
  if (state.nameColors[name]) return state.nameColors[name];
  const c = PALETTE[Object.keys(state.nameColors).length % PALETTE.length];
  state.nameColors[name] = c;
  return c;
}

// ---- 配信開始 ----
async function start() {
  try {
    state.stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 1280, height: 720 },
      audio: true,
    });
  } catch (err) {
    alert("カメラ/マイクを開始できませんでした: " + err.message);
    return;
  }
  els.video.srcObject = state.stream;
  await setupCameraSelect();
  els.startOverlay.hidden = true;
  els.videoControls.hidden = false;
  els.chatNote.textContent = "AI視聴者が集まってきました。話しかけると反応します。";

  state.live = true;
  els.liveBadge.textContent = "● LIVE";
  els.liveBadge.classList.add("on");

  // 視聴者数の演出
  state.viewers = 20 + Math.floor(Math.random() * 40);
  updateViewers();
  state.viewerTimer = setInterval(() => {
    state.viewers = Math.max(3, state.viewers + Math.floor(Math.random() * 5) - 2);
    updateViewers();
  }, 4000);

  startVoiceDetection();
  scheduleCapture();
}

function updateViewers() {
  els.viewers.textContent = "👤 " + state.viewers;
}

// ==========================================================
// カメラ選択（iPhone連携カメラ等が誤って選ばれるのを避け、
// 複数カメラがある場合は切り替えられるようにする）
// ==========================================================
async function setupCameraSelect() {
  let devices;
  try {
    devices = await navigator.mediaDevices.enumerateDevices();
  } catch {
    return;
  }
  const cams = devices.filter((d) => d.kind === "videoinput");
  if (cams.length < 2) {
    els.cameraLabel.hidden = true;
    return;
  }

  els.cameraSelect.innerHTML = cams
    .map((c, i) => `<option value="${c.deviceId}">${escapeHtml(c.label || `カメラ ${i + 1}`)}</option>`)
    .join("");
  els.cameraLabel.hidden = false;

  const currentId = state.stream.getVideoTracks()[0]?.getSettings().deviceId;
  const isRemoteLike = (label) => /iphone|ipad|continuity/i.test(label || "");
  const currentCam = cams.find((c) => c.deviceId === currentId);

  let targetId = currentId;
  if (!currentCam || isRemoteLike(currentCam.label)) {
    const preferred = cams.find((c) => !isRemoteLike(c.label));
    if (preferred && preferred.deviceId !== currentId) targetId = preferred.deviceId;
  }

  els.cameraSelect.value = targetId;
  if (targetId !== currentId) await switchCamera(targetId);
}

async function switchCamera(deviceId) {
  let newStream;
  try {
    newStream = await navigator.mediaDevices.getUserMedia({
      video: { deviceId: { exact: deviceId }, width: 1280, height: 720 },
    });
  } catch (err) {
    console.error("カメラの切り替えに失敗:", err);
    return;
  }
  const newTrack = newStream.getVideoTracks()[0];
  const oldTrack = state.stream.getVideoTracks()[0];
  if (oldTrack) {
    state.stream.removeTrack(oldTrack);
    oldTrack.stop();
  }
  state.stream.addTrack(newTrack);
  els.video.srcObject = state.stream;
  els.cameraSelect.value = deviceId;
}

els.cameraSelect.addEventListener("change", () => {
  if (state.live) switchCamera(els.cameraSelect.value);
});

// ==========================================================
// 映像フレームを定期送信
// ==========================================================
function scheduleCapture() {
  if (!state.live) return;
  const pace = parseInt(els.paceRange.value, 10) || 5000;
  state.captureTimer = setTimeout(async () => {
    await sendFrame();
    scheduleCapture();
  }, pace);
}

function grabFrameDataURL() {
  const v = els.video;
  if (!v.videoWidth) return null;
  const maxW = 512;
  const scale = Math.min(1, maxW / v.videoWidth);
  const w = Math.round(v.videoWidth * scale);
  const h = Math.round(v.videoHeight * scale);
  const cv = els.capture;
  cv.width = w;
  cv.height = h;
  cv.getContext("2d").drawImage(v, 0, 0, w, h);
  return cv.toDataURL("image/jpeg", 0.6);
}

async function sendFrame() {
  if (state.inFlight || !state.live) return;
  const image = grabFrameDataURL();
  if (!image) return;
  state.inFlight = true;
  try {
    const res = await fetch("/api/react", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        image,
        mode: els.modeSelect.value,
        history: state.history.slice(-8),
      }),
    });
    const data = await res.json();
    if (data.comments) staggerComments(data.comments);
  } catch (err) {
    console.error("フレーム送信エラー:", err);
  } finally {
    state.inFlight = false;
  }
}

// 複数コメントを少しずつ時間差で流す
function staggerComments(comments) {
  comments.forEach((c, i) => {
    setTimeout(() => addMessage(c.name, c.text, c.type), i * (500 + Math.random() * 900));
  });
}

// ==========================================================
// コメント表示 / 文脈管理
// ==========================================================
// 画面に表示する視聴者コメント
function addMessage(name, text, type) {
  const div = document.createElement("div");
  div.className = "msg";
  const badge = type ? `<span class="badge">${escapeHtml(type)}</span>` : "";
  div.innerHTML =
    `<span class="name">${escapeHtml(name)}</span>` +
    `<span class="text"></span>${badge}`;
  div.querySelector(".name").style.color = colorFor(name);
  div.querySelector(".text").textContent = text;
  els.chatList.appendChild(div);
  els.chatList.scrollTop = els.chatList.scrollHeight;

  pushHistory(name, text);
  state.log.push({ name, text });
}

// 画面には出さず、AIへの文脈だけに残す（自分の発言はこちら）
function pushHistory(name, text) {
  state.history.push({ name: name || "誰か", text });
  if (state.history.length > 20) state.history.shift();
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (m) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m])
  );
}

// ==========================================================
// 常時マイク + 無音検知（VAD）で発話を自動区切り
// ==========================================================
function startVoiceDetection() {
  const audioTracks = state.stream.getAudioTracks();
  if (!audioTracks.length) return;

  state.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  const source = state.audioCtx.createMediaStreamSource(new MediaStream(audioTracks));
  state.analyser = state.audioCtx.createAnalyser();
  state.analyser.fftSize = 1024;
  source.connect(state.analyser);

  const buf = new Uint8Array(state.analyser.fftSize);

  state.vadTimer = setInterval(() => {
    if (!state.live) return;
    state.analyser.getByteTimeDomainData(buf);
    // 音量(RMS)を 0〜1 で計算
    let sum = 0;
    for (let i = 0; i < buf.length; i++) {
      const v = (buf[i] - 128) / 128;
      sum += v * v;
    }
    const level = Math.sqrt(sum / buf.length);
    const now = Date.now();

    if (!state.speaking) {
      // 待機中: 一定以上の音量で発話開始
      if (level > VAD.startLevel && !state.sending) {
        beginSegment(now);
      }
    } else {
      // 発話中: 音量が続いていれば更新、無音が続いたら区切る
      if (level > VAD.keepLevel) state.lastLoudAt = now;
      const silence = now - state.lastLoudAt;
      const dur = now - state.segStartAt;
      if (silence > VAD.silenceMs || dur > VAD.maxSpeechMs) {
        endSegment(dur);
      }
    }

    // 聞き取り中インジケータ
    if (els.micState) {
      els.micState.textContent = state.speaking ? "🎤 聞き取り中…" : "🎤 音声待機中";
      els.micState.classList.toggle("active", state.speaking);
    }
  }, 100);
}

function pickMime() {
  const cands = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
  return cands.find((t) => window.MediaRecorder && MediaRecorder.isTypeSupported(t)) || "";
}

function beginSegment(now) {
  const audioTracks = state.stream.getAudioTracks();
  const mimeType = pickMime();
  try {
    state.recorder = new MediaRecorder(new MediaStream(audioTracks), mimeType ? { mimeType } : undefined);
  } catch (err) {
    console.error("録音を開始できません:", err);
    return;
  }
  state.chunks = [];
  state.recorder.ondataavailable = (e) => e.data.size && state.chunks.push(e.data);
  state.recorder.onstop = onSegmentStop;
  state.recorder.start();
  state.speaking = true;
  state.segStartAt = now;
  state.lastLoudAt = now;
}

function endSegment(dur) {
  state.speaking = false;
  const tooShort = dur < VAD.minSpeechMs;
  state._dropSegment = tooShort; // 短すぎる音は捨てる
  if (state.recorder && state.recorder.state !== "inactive") {
    state.recorder.stop();
  }
}

async function onSegmentStop() {
  const type = state.recorder ? state.recorder.mimeType : "audio/webm";
  const blob = new Blob(state.chunks, { type: type || "audio/webm" });
  state.recorder = null;
  if (state._dropSegment || blob.size < 1500) return;

  state.sending = true;
  const form = new FormData();
  form.append("audio", blob, "speech.webm");
  form.append("mode", els.modeSelect.value);
  form.append("history", JSON.stringify(state.history.slice(-8)));

  try {
    const res = await fetch("/api/voice", { method: "POST", body: form });
    const data = await res.json();
    // 自分の発言はチャットに表示しない。文脈にだけ残す。
    if (data.transcript) pushHistory("配信者", data.transcript);
    if (data.comments) staggerComments(data.comments);
  } catch (err) {
    console.error("音声送信エラー:", err);
  } finally {
    state.sending = false;
  }
}

// ==========================================================
// 配信終了 → 振り返り
// ==========================================================
async function stop() {
  state.live = false;
  clearTimeout(state.captureTimer);
  clearInterval(state.viewerTimer);
  clearInterval(state.vadTimer);
  if (state.recorder && state.recorder.state !== "inactive") state.recorder.stop();
  if (state.audioCtx) state.audioCtx.close().catch(() => {});
  els.liveBadge.textContent = "OFFLINE";
  els.liveBadge.classList.remove("on");

  if (state.stream) state.stream.getTracks().forEach((t) => t.stop());

  els.summaryModal.hidden = false;
  els.summaryText.textContent = "まとめています…";
  try {
    const res = await fetch("/api/summary", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ log: state.log }),
    });
    const data = await res.json();
    els.summaryText.textContent = data.summary || "うまくまとめられませんでした。";
  } catch (err) {
    els.summaryText.textContent = "振り返りの取得に失敗しました。";
  }
}

// ---- イベント登録 ----
els.startBtn.addEventListener("click", start);
els.stopBtn.addEventListener("click", stop);
els.closeSummary.addEventListener("click", () => {
  els.summaryModal.hidden = true;
  location.reload();
});
