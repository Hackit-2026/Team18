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
  stopBtn: document.getElementById("stopBtn"),
  cameraLabel: document.getElementById("cameraLabel"),
  cameraSelect: document.getElementById("cameraSelect"),
  chatList: document.getElementById("chatList"),
  chatNote: document.getElementById("chatNote"),
  flowToggle: document.getElementById("flowToggle"),
  danmakuLayer: document.getElementById("danmakuLayer"),
  liveBadge: document.getElementById("liveBadge"),
  viewers: document.getElementById("viewers"),
  summaryModal: document.getElementById("summaryModal"),
  summaryText: document.getElementById("summaryText"),
  closeSummary: document.getElementById("closeSummary"),
  viewArchive: document.getElementById("viewArchive"),
  archiveBtn: document.getElementById("archiveBtn"),
  archiveModal: document.getElementById("archiveModal"),
  closeArchive: document.getElementById("closeArchive"),
  prevMonth: document.getElementById("prevMonth"),
  nextMonth: document.getElementById("nextMonth"),
  calendarTitle: document.getElementById("calendarTitle"),
  calendarGrid: document.getElementById("calendarGrid"),
  archiveDetail: document.getElementById("archiveDetail"),
  userBtn: document.getElementById("userBtn"),
  userAvatar: document.getElementById("userAvatar"),
  userName: document.getElementById("userName"),
  userModal: document.getElementById("userModal"),
  userForm: document.getElementById("userForm"),
  userModalTitle: document.getElementById("userModalTitle"),
  userNameInput: document.getElementById("userNameInput"),
  userError: document.getElementById("userError"),
  cancelUser: document.getElementById("cancelUser"),
  smokeStage: document.getElementById("smokeStage"),
  startupMessage: document.getElementById("startupMessage"),
  welcomeMessage: document.getElementById("welcomeMessage"),
  welcomeName: document.getElementById("welcomeName"),
  logoutBtn: document.getElementById("logoutBtn"),
  startOnboarding: document.getElementById("startOnboarding"),
  browseArchive: document.getElementById("browseArchive"),
};

const USER_NAME_KEY = "airs-user-name";
const LEGACY_OWNER_KEY = "airs-legacy-archive-owner";

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
  flowEnabled: false, // ONの時だけニコニコ風コメントを映像上にも流す
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
  stopping: false,       // 配信終了処理の二重実行を防ぐ
  archiveRecorder: null,
  archiveChunks: [],
  streamStartedAt: null,
  calendarMonth: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  archiveObjectUrls: [],
  userName: "",
  onboardingTimer: null,
  archiveBrowseAll: false,
  archiveFromLanding: false,
};

// 映像フレームを送信する間隔
const CAPTURE_INTERVAL_MS = 5000;

// ---- 発話区切りの調整パラメータ ----
const VAD = {
  startLevel: 0.025,   // これを超えたら「喋っている」とみなす
  keepLevel: 0.018,     // これを下回る状態が続いたら「区切り」
  silenceMs: 1400,      // 無音がこの時間続いたら1区切り
  minSpeechMs: 800,    // これより短い音は無視（雑音対策）
  maxSpeechMs: 12000,  // 長すぎる発話は強制的に区切る
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

// ---- ユーザー名 ----
function readSavedUserName() {
  try { return localStorage.getItem(USER_NAME_KEY)?.trim() || ""; } catch { return ""; }
}

function updateUserDisplay(name) {
  state.userName = name;
  els.userName.textContent = name || "未設定";
  els.userAvatar.textContent = name ? Array.from(name)[0].toUpperCase() : "?";
}

function showUserModal(isEditing = false) {
  clearTimeout(state.onboardingTimer);
  els.startupMessage.classList.remove("step-leaving");
  els.userForm.classList.remove("step-leaving");
  els.welcomeMessage.classList.remove("step-leaving", "show-tagline");
  els.userModalTitle.textContent = isEditing ? "ユーザー名を変更" : "ユーザー名を決めましょう";
  els.userNameInput.value = state.userName;
  els.userError.textContent = "";
  els.cancelUser.hidden = !isEditing;
  els.userModal.hidden = false;
  els.userModal.classList.remove("is-leaving");
  els.userModal.classList.toggle("onboarding-mode", !isEditing);
  els.startupMessage.hidden = true;
  els.welcomeMessage.hidden = true;

  if (isEditing) {
    els.userForm.hidden = false;
    setTimeout(() => els.userNameInput.focus(), 0);
    return;
  }

  els.userForm.hidden = true;
  els.startupMessage.hidden = false;
}

function showOnboardingForm() {
  clearTimeout(state.onboardingTimer);
  els.startupMessage.classList.add("step-leaving");
  state.onboardingTimer = setTimeout(() => {
    els.startupMessage.hidden = true;
    els.startupMessage.classList.remove("step-leaving");
    els.welcomeMessage.hidden = true;
    els.userForm.hidden = false;
    els.userModalTitle.textContent = "ユーザー名を決めましょう";
    els.userNameInput.value = state.userName;
    els.userError.textContent = "";
    els.cancelUser.hidden = true;
    els.userNameInput.focus();
  }, 750);
}

function playSmoke() {
  els.smokeStage.classList.remove("play");
  void els.smokeStage.offsetWidth;
  els.smokeStage.classList.add("play");
}

function playWelcome(name) {
  clearTimeout(state.onboardingTimer);
  els.welcomeName.textContent = name;
  els.welcomeMessage.classList.remove("headline-leaving", "show-tagline", "tagline-leaving", "step-leaving");
  els.userForm.classList.add("step-leaving");
  state.onboardingTimer = setTimeout(() => {
    els.userForm.hidden = true;
    els.userForm.classList.remove("step-leaving");
    els.startupMessage.hidden = true;
    els.welcomeMessage.hidden = false;
    playSmoke();
    state.onboardingTimer = setTimeout(() => {
      els.welcomeMessage.classList.add("headline-leaving");
      state.onboardingTimer = setTimeout(() => {
        els.welcomeMessage.classList.add("show-tagline");
        state.onboardingTimer = setTimeout(() => {
          els.welcomeMessage.classList.add("tagline-leaving");
          state.onboardingTimer = setTimeout(() => {
            els.userModal.classList.add("is-leaving");
            state.onboardingTimer = setTimeout(() => {
              els.userModal.hidden = true;
              els.userModal.classList.remove("onboarding-mode", "is-leaving");
              els.welcomeMessage.classList.remove("headline-leaving", "show-tagline", "tagline-leaving");
              els.welcomeMessage.hidden = true;
            }, 1100);
          }, 1100);
        }, 2100);
      }, 850);
    }, 1600);
  }, 750);
}

function initializeUser() {
  const name = readSavedUserName();
  updateUserDisplay(name);
  showUserModal(false);
}

function logoutUser() {
  if (state.live) {
    alert("配信中はログアウトできません。先に配信を終了してください。");
    return;
  }
  if (!confirm("ログアウトしますか？ 配信アーカイブは削除されません。")) return;
  try {
    localStorage.removeItem(USER_NAME_KEY);
  } catch {
    alert("ログアウト情報を更新できませんでした。ブラウザの設定を確認してください。");
    return;
  }
  updateUserDisplay("");
  showUserModal(false);
}

function validateUserName(value) {
  const name = value.trim().replace(/\s+/g, " ");
  if (!name) return { error: "ユーザー名を入力してください。" };
  if (Array.from(name).length > 20) return { error: "ユーザー名は20文字以内で入力してください。" };
  if (/[\u0000-\u001f\u007f]/.test(name)) return { error: "使用できない文字が含まれています。" };
  return { name };
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
  state.streamStartedAt = new Date();
  startArchiveRecording();
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
  state.captureTimer = setTimeout(async () => {
    await sendFrame();
    scheduleCapture();
  }, CAPTURE_INTERVAL_MS);
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
  addChatMessage(name, text, type);
  if (state.flowEnabled) {
    addFlowComment(name, text);
  }

  pushHistory(name, text);
  state.log.push({ name, text });
}

// 通常のチャット欄表示
function addChatMessage(name, text, type) {
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
}

// ニコニコ風: 映像の上を右から左にコメントを流す
function addFlowComment(name, text) {
  const div = document.createElement("div");
  div.className = "danmaku-item";
  div.innerHTML =
    `<span class="name"></span><span class="text"></span>`;
  div.querySelector(".name").textContent = name;
  div.querySelector(".name").style.color = colorFor(name);
  div.querySelector(".text").textContent = text;

  const lane = Math.floor(Math.random() * 8); // 8段のレーンに分けて重なりを減らす
  div.style.top = 6 + lane * 11 + "%";

  const len = (name.length + text.length) || 10;
  const duration = Math.min(12, Math.max(6, len * 0.28));
  div.style.animationDuration = duration + "s";

  div.addEventListener("animationend", () => div.remove());
  els.danmakuLayer.appendChild(div);
}

// ---- コメント流しのON/OFF ----
els.flowToggle.addEventListener("change", () => {
  state.flowEnabled = els.flowToggle.checked;
});

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
  if (!state.live || state.stopping) return;
  state.stopping = true;
  els.stopBtn.disabled = true;
  state.live = false;
  clearTimeout(state.captureTimer);
  clearInterval(state.viewerTimer);
  clearInterval(state.vadTimer);
  if (state.recorder && state.recorder.state !== "inactive") state.recorder.stop();
  const videoBlob = await stopArchiveRecording();
  if (state.audioCtx) state.audioCtx.close().catch(() => {});
  els.liveBadge.textContent = "OFFLINE";
  els.liveBadge.classList.remove("on");

  if (state.stream) state.stream.getTracks().forEach((t) => t.stop());

  els.summaryModal.hidden = false;
  els.summaryText.textContent = "まとめています…";
  let summary = "振り返りを取得できませんでした。";
  try {
    const res = await fetch("/api/summary", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ log: state.log }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || data.error || "振り返りの生成に失敗しました。");

    summary = data.summary || "うまくまとめられませんでした。";
  } catch (err) {
    console.error("振り返りの取得エラー:", err);
  }

  try {
    await saveArchive({
      id: Date.now(),
      date: localDate(new Date()),
      startedAt: state.streamStartedAt?.toISOString() || new Date().toISOString(),
      endedAt: new Date().toISOString(),
      summary,
      videoBlob,
      mimeType: videoBlob?.type || "",
      owner: state.userName,
    });
    els.summaryText.textContent = summary + "\n\n✓ 配信アーカイブカレンダーに保存しました。";
  } catch (err) {
    console.error("アーカイブ保存エラー:", err);
    els.summaryText.textContent = summary + "\n\n⚠ アーカイブを保存できませんでした。ブラウザの空き容量を確認してください。";
  }
}

// ==========================================================
// 配信全体の録画 + 専用アーカイブカレンダー（IndexedDB）
// ==========================================================
function pickArchiveMime() {
  const types = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm", "video/mp4"];
  return types.find((type) => MediaRecorder.isTypeSupported(type)) || "";
}

function startArchiveRecording() {
  if (!window.MediaRecorder || !state.stream) return;
  try {
    const mimeType = pickArchiveMime();
    state.archiveChunks = [];
    state.archiveRecorder = new MediaRecorder(state.stream, mimeType ? { mimeType } : undefined);
    state.archiveRecorder.ondataavailable = (event) => {
      if (event.data.size) state.archiveChunks.push(event.data);
    };
    state.archiveRecorder.start(1000);
  } catch (err) {
    console.error("配信アーカイブの録画を開始できません:", err);
  }
}

function stopArchiveRecording() {
  const recorder = state.archiveRecorder;
  if (!recorder) return Promise.resolve(null);
  if (recorder.state === "inactive") {
    return Promise.resolve(new Blob(state.archiveChunks, { type: recorder.mimeType }));
  }
  return new Promise((resolve) => {
    recorder.addEventListener("stop", () => {
      resolve(new Blob(state.archiveChunks, { type: recorder.mimeType || "video/webm" }));
    }, { once: true });
    recorder.stop();
  });
}

function localDate(value) {
  return [value.getFullYear(), String(value.getMonth() + 1).padStart(2, "0"), String(value.getDate()).padStart(2, "0")].join("-");
}

function openArchiveDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("airs-archive", 1);
    request.onupgradeneeded = () => {
      const store = request.result.createObjectStore("streams", { keyPath: "id" });
      store.createIndex("date", "date", { unique: false });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function saveArchive(record) {
  const db = await openArchiveDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("streams", "readwrite");
    tx.objectStore("streams").put(record);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

async function getArchives() {
  const db = await openArchiveDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction("streams", "readonly").objectStore("streams").getAll();
    request.onsuccess = () => {
      db.close();
      let legacyOwner = "";
      try { legacyOwner = localStorage.getItem(LEGACY_OWNER_KEY) || ""; } catch {}
      const records = state.archiveBrowseAll
        ? request.result
        : request.result.filter((record) =>
            record.owner === state.userName || (!record.owner && legacyOwner === state.userName)
          );
      resolve(records.sort((a, b) => b.id - a.id));
    };
    request.onerror = () => { db.close(); reject(request.error); };
  });
}

async function renameArchiveOwner(oldName, newName) {
  if (!oldName || oldName === newName) return;
  const db = await openArchiveDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("streams", "readwrite");
    const store = tx.objectStore("streams");
    const request = store.openCursor();
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return;
      if (cursor.value.owner === oldName) cursor.update({ ...cursor.value, owner: newName });
      cursor.continue();
    };
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

async function renderCalendar(selectedDate) {
  const records = await getArchives();
  const month = state.calendarMonth;
  els.calendarTitle.textContent = `${month.getFullYear()}年 ${month.getMonth() + 1}月`;
  els.calendarGrid.replaceChildren();
  const firstDay = new Date(month.getFullYear(), month.getMonth(), 1).getDay();
  const lastDate = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const today = localDate(new Date());

  for (let i = 0; i < firstDay; i++) {
    const blank = document.createElement("span");
    blank.className = "calendar-day outside";
    els.calendarGrid.appendChild(blank);
  }
  for (let day = 1; day <= lastDate; day++) {
    const date = localDate(new Date(month.getFullYear(), month.getMonth(), day));
    const count = records.filter((record) => record.date === date).length;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "calendar-day" + (date === today ? " today" : "") + (date === selectedDate ? " selected" : "");
    button.innerHTML = `<span class="day-number">${day}</span>${count ? `<span class="archive-mark">● ${count}件</span>` : ""}`;
    button.addEventListener("click", () => {
      renderCalendar(date);
      renderArchiveDetail(date, records.filter((record) => record.date === date));
    });
    els.calendarGrid.appendChild(button);
  }
}

function renderArchiveDetail(date, records) {
  state.archiveObjectUrls.forEach((url) => URL.revokeObjectURL(url));
  state.archiveObjectUrls = [];
  els.archiveDetail.replaceChildren();
  if (!records.length) {
    els.archiveDetail.innerHTML = `<div class="archive-empty">${escapeHtml(date)} の配信アーカイブはありません。</div>`;
    return;
  }
  records.forEach((record) => {
    const entry = document.createElement("article");
    entry.className = "archive-entry";
    const started = new Date(record.startedAt);
    const ended = new Date(record.endedAt);
    const duration = Math.max(1, Math.round((ended - started) / 60000));
    const url = record.videoBlob ? URL.createObjectURL(record.videoBlob) : "";
    if (url) state.archiveObjectUrls.push(url);
    entry.innerHTML = `<h3>${started.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })} の配信</h3>
      <p class="archive-meta">約${duration}分</p>
      ${url ? `<video class="archive-video" controls src="${url}"></video>` : `<p class="archive-meta">動画は保存されていません。</p>`}
      <h4>振り返り</h4><p class="archive-summary"></p>`;
    entry.querySelector(".archive-summary").textContent = record.summary;
    els.archiveDetail.appendChild(entry);
  });
}

async function openArchiveCalendar({ browseAll = false, fromLanding = false } = {}) {
  els.summaryModal.hidden = true;
  els.userModal.hidden = true;
  els.archiveModal.hidden = false;
  state.archiveBrowseAll = browseAll;
  state.archiveFromLanding = fromLanding;
  state.calendarMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  try {
    await renderCalendar(localDate(new Date()));
    const records = await getArchives();
    renderArchiveDetail(localDate(new Date()), records.filter((record) => record.date === localDate(new Date())));
  } catch (err) {
    els.archiveDetail.innerHTML = `<div class="archive-empty">アーカイブを読み込めませんでした。</div>`;
  }
}

// ---- イベント登録 ----
els.startBtn.addEventListener("click", start);
els.stopBtn.addEventListener("click", stop);
els.userBtn.addEventListener("click", () => showUserModal(true));
els.logoutBtn.addEventListener("click", logoutUser);
els.startOnboarding.addEventListener("click", showOnboardingForm);
els.browseArchive.addEventListener("click", () => openArchiveCalendar({ browseAll: true, fromLanding: true }));
els.userForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const isOnboarding = els.userModal.classList.contains("onboarding-mode");
  const result = validateUserName(els.userNameInput.value);
  if (result.error) {
    els.userError.textContent = result.error;
    return;
  }
  try {
    await renameArchiveOwner(state.userName, result.name);
    localStorage.setItem(USER_NAME_KEY, result.name);
    const legacyOwner = localStorage.getItem(LEGACY_OWNER_KEY);
    if (!legacyOwner || legacyOwner === state.userName) localStorage.setItem(LEGACY_OWNER_KEY, result.name);
  } catch {
    els.userError.textContent = "ユーザー名を保存できませんでした。ブラウザの設定を確認してください。";
    return;
  }
  updateUserDisplay(result.name);
  if (isOnboarding) playWelcome(result.name);
  else els.userModal.hidden = true;
});
els.cancelUser.addEventListener("click", () => { els.userModal.hidden = true; });
els.archiveBtn.addEventListener("click", () => openArchiveCalendar());
els.viewArchive.addEventListener("click", () => openArchiveCalendar());
els.closeArchive.addEventListener("click", () => {
  state.archiveObjectUrls.forEach((url) => URL.revokeObjectURL(url));
  state.archiveObjectUrls = [];
  els.archiveModal.hidden = true;
  if (state.archiveFromLanding) showUserModal(false);
  state.archiveBrowseAll = false;
  state.archiveFromLanding = false;
});
els.prevMonth.addEventListener("click", () => {
  state.calendarMonth = new Date(state.calendarMonth.getFullYear(), state.calendarMonth.getMonth() - 1, 1);
  renderCalendar();
});
els.nextMonth.addEventListener("click", () => {
  state.calendarMonth = new Date(state.calendarMonth.getFullYear(), state.calendarMonth.getMonth() + 1, 1);
  renderCalendar();
});
els.closeSummary.addEventListener("click", () => {
  els.summaryModal.hidden = true;
  location.reload();
});

initializeUser();
