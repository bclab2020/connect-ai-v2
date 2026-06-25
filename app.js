/**
 * CONNECT AI - Main Application Controller
 * Manages video inputs, MediaPipe loops, recording timers, IndexedDB operations,
 * interactive canvas clicks, D-pad joint adjustments, and dashboard generation.
 */

// Global State Variables
var detectors = [];
var isRunning = false;
var isRecording = false;
var isPausedForEdit = false;
var currentTab = "front";
var currentStream = null;
var appMode = "camera"; // 'camera' or 'playback'
var isPlaying = false;

var playbackDataMP = [];
var mainRenderId = null;
var recordingDuration = 10000;
var coordinateBufferMP = [];
var poseDataLog = [];
var playbackRafId = null;

var selectedJointIndex = null;
var dpadStepVal = 1;
var isEditingPlaybackFrame = false;
var swayHistoryMP = [];

var pxToCmRatio = null; // scale multiplier
var estimatedPelvicTilt = 0;
var calibState = "idle"; // 'idle', 'wait_left', 'adjust_left', 'wait_right', 'adjust_right'
var calibrationPoints = [];

// Video Export Variables
var exportRecorder = null;
var exportChunks = [];
var isExportingVideo = false;

var renderSessionId = 0;
var playbackStartTime = 0;
var playbackBaseTime = 0;
var playbackTotalDuration = 0;

window.currentAnchorPos = null;
window.customOriginMarkers = {};
window.anchorStatus = "unlocked";

var DURATION_MAP = {
    'front': 10000, 'back': 5000, 'l_side': 5000, 'r_side': 5000,
    'dyn_overhead': 15000, 'dyn_overhead_side': 15000,
    'dyn_single_r': 15000, 'dyn_single_l': 15000,
    'dyn_flex_fwd': 10000, 'dyn_flex_bwd': 10000,
    'dyn_shoulder_r': 10000, 'dyn_shoulder_l': 10000
};

var JOINT_NAMES_JP = {
    0: "鼻", 11: "左肩", 12: "右肩", 13: "左肘", 14: "右肘", 15: "左手首", 16: "右手首",
    23: "左股関節", 24: "右股関節", 25: "左膝", 26: "右膝", 27: "左足首", 28: "右足首",
    29: "左踵", 30: "右踵", 31: "左つま先", 32: "右つま先", 33: "左ASIS (仮想)", 34: "右ASIS (仮想)"
};

window.reportDataStore = {};
Object.keys(DURATION_MAP).forEach(dir => {
    window.reportDataStore[dir] = null;
    window.customOriginMarkers[dir] = null;
});

// UI Elements
var video = document.getElementById('video');
var canvasMP = document.getElementById('canvasMP'), ctxMP = canvasMP.getContext('2d');
var canvasComb = document.getElementById('canvasCombined'), ctxComb = canvasComb.getContext('2d');
var radarWrapperMP = document.getElementById('radarWrapperMP'), canvasRadarMP = document.getElementById('canvasRadarMP'), ctxRadarMP = canvasRadarMP.getContext('2d');

var startBtn = document.getElementById('startBtn');
var recBtn = document.getElementById('recBtn');
var durationSelect = document.getElementById('durationSelect');
var timerDisplay = document.getElementById('timerDisplay');
var downloadCsvBtn = document.getElementById('downloadCsvBtn');
var showSwayAlertCheckbox = document.getElementById('showSwayAlert');
var videoSource = document.getElementById('videoSource');

var heightInput = document.getElementById('patientHeight');
var footSizeInput = document.getElementById('footSize');
var calibrateMatBtn = document.getElementById('calibrateMatBtn');
var infoPanel = document.getElementById('infoPanel');
var scaleStatus = document.getElementById('scaleStatus');
var pelvicStatus = document.getElementById('pelvicStatus');
var tiltPanel = document.getElementById('tiltPanel');
var pelvicTiltSlider = document.getElementById('pelvicTiltSlider');
var tiltValDisplay = document.getElementById('tiltValDisplay');

var toggleUiBtn = document.getElementById('toggleUiBtn');
var controlsBox = document.getElementById('controlsBox');

// Event Handlers for UI Toggle
toggleUiBtn.onclick = function() {
    if (controlsBox.style.display === 'none') {
        controlsBox.style.display = 'block';
        toggleUiBtn.innerText = '🔽 UIを隠す';
    } else {
        controlsBox.style.display = 'none';
        toggleUiBtn.innerText = '🔼 UIを表示';
    }
};

// API Modal Settings Handlers
var showApiBtn = document.getElementById('showApiBtn');
var closeApiBtn = document.getElementById('closeApiBtn');
var apiSettingPanel = document.getElementById('apiSettingPanel');
var saveApiBtn = document.getElementById('saveApiBtn');
var geminiApiKeyInput = document.getElementById('geminiApiKey');

showApiBtn.onclick = function() {
    geminiApiKeyInput.value = localStorage.getItem('gemini_api_key') || '';
    apiSettingPanel.style.display = 'block';
};
closeApiBtn.onclick = function() {
    apiSettingPanel.style.display = 'none';
};
saveApiBtn.onclick = function() {
    localStorage.setItem('gemini_api_key', geminiApiKeyInput.value.trim());
    apiSettingPanel.style.display = 'none';
    alert("APIキーを保存しました。");
};

// History Handlers
var historyPanel = document.getElementById('historyPanel');
var historyListContainer = document.getElementById('historyListContainer');
var showHistoryBtn = document.getElementById('showHistoryBtn');
var closeHistoryBtn = document.getElementById('closeHistoryBtn');

showHistoryBtn.onclick = async function() {
    if (historyPanel.style.display === 'flex' || historyPanel.style.display === 'block') {
        historyPanel.style.display = 'none';
    } else {
        await window.refreshHistoryList();
        historyPanel.style.display = 'block';
    }
};
closeHistoryBtn.onclick = function() {
    historyPanel.style.display = 'none';
};

// Mode Select Change
document.getElementById('modeSelect').onchange = function(e) {
    currentTab = e.target.value;
    recordingDuration = DURATION_MAP[currentTab] || 10000;
    durationSelect.value = recordingDuration.toString();
    
    // Toggle pelvic tilt panel for side views
    if (currentTab === 'l_side' || currentTab === 'r_side') {
        tiltPanel.style.display = 'block';
    } else {
        tiltPanel.style.display = 'none';
    }
    
    // Clear radar for static/dynamic modes
    swayHistoryMP = [];
    biomechanics.clearRadar(ctxRadarMP, currentTab.startsWith('dyn_') ? '#39ff14' : '#ff5252');
};

// Calibrate Mat Click Handler
calibrateMatBtn.onclick = function() {
    if (calibState === "idle") {
        calibState = "wait_left";
        calibrationPoints = [];
        calibrateMatBtn.classList.add('active');
        calibrateMatBtn.innerText = "📍 マット左端をタップ";
    } else if (calibState === "adjust_left") {
        calibState = "wait_right";
        document.getElementById('dpadPanel').style.display = 'none';
        calibrateMatBtn.innerText = "📍 マット右端をタップ";
    } else if (calibState === "adjust_right") {
        var distPx = Math.hypot(calibrationPoints[1].x - calibrationPoints[0].x, calibrationPoints[1].y - calibrationPoints[0].y);
        if (distPx > 10) {
            pxToCmRatio = 45.0 / distPx;
        }
        calibState = "idle";
        calibrateMatBtn.classList.remove('active');
        document.getElementById('dpadPanel').style.display = 'none';
        calibrateMatBtn.innerText = "✅ 校正完了";
        updateInfoPanel();
        setTimeout(function() {
            if (calibState === "idle") calibrateMatBtn.innerText = "📏 マット校正(45cm)";
        }, 2000);
    } else {
        calibState = "idle";
        calibrationPoints = [];
        calibrateMatBtn.classList.remove('active');
        document.getElementById('dpadPanel').style.display = 'none';
        calibrateMatBtn.innerText = "📏 マット校正(45cm)";
    }
};

// Pelvic Tilt Input Handler
pelvicTiltSlider.oninput = function(e) {
    var val = parseInt(e.target.value);
    tiltValDisplay.innerText = val === 0 ? "0°" : (val > 0 ? "+" + val + "° (前傾)" : val + "° (後傾)");
    estimatedPelvicTilt = val;
    updateInfoPanel();
};

// D-pad Handlers
document.getElementById('dpadStep').onclick = function(e) {
    dpadStepVal = dpadStepVal === 1 ? 5 : 1;
    e.target.innerText = dpadStepVal + 'px';
};

var moveJoint = function(dx, dy) {
    if (calibState === "adjust_left" && calibrationPoints[0]) {
        calibrationPoints[0].x += dx; calibrationPoints[0].y += dy;
    } else if (calibState === "adjust_right" && calibrationPoints[1]) {
        calibrationPoints[1].x += dx; calibrationPoints[1].y += dy;
    } else if (selectedJointIndex !== null) {
        var kp = null;
        if (appMode === 'playback') {
            var fIdx = parseInt(document.getElementById('timelineSlider').value);
            if (playbackDataMP[fIdx]) {
                // Check virtual index vs blaze pose standard
                if (selectedJointIndex === 33) {
                    kp = playbackDataMP[fIdx].keypoints.find(k => k.name === 'virtual_asis_l');
                } else if (selectedJointIndex === 34) {
                    kp = playbackDataMP[fIdx].keypoints.find(k => k.name === 'virtual_asis_r');
                } else {
                    kp = playbackDataMP[fIdx].keypoints[selectedJointIndex];
                }
            }
        } else if (isPausedForEdit) {
            if (selectedJointIndex === 33) {
                kp = window.reportDataStore[currentTab].find(k => k.name === 'virtual_asis_l');
            } else if (selectedJointIndex === 34) {
                kp = window.reportDataStore[currentTab].find(k => k.name === 'virtual_asis_r');
            } else {
                kp = window.reportDataStore[currentTab][selectedJointIndex];
            }
        }
        if (kp) {
            kp.x += dx;
            kp.y += dy;
        }
    }
    
    if (appMode === 'playback') {
        renderPlaybackFrame(parseInt(document.getElementById('timelineSlider').value));
    } else if (isPausedForEdit) {
        refreshReportView();
    }
};

document.getElementById('dpadUp').onclick = function() { moveJoint(0, -dpadStepVal); }; 
document.getElementById('dpadDown').onclick = function() { moveJoint(0, dpadStepVal); };
document.getElementById('dpadLeft').onclick = function() { moveJoint(-dpadStepVal, 0); }; 
document.getElementById('dpadRight').onclick = function() { moveJoint(dpadStepVal, 0); };

var closeDpad = function() { 
    if (calibState === "adjust_left") {
        calibState = "wait_left";
        calibrateMatBtn.innerText = "📍 左端をタップ";
        calibrationPoints = [];
        document.getElementById('dpadPanel').style.display = 'none';
        if (isPausedForEdit) refreshReportView();
        return;
    }
    if (calibState === "adjust_right") {
        calibState = "wait_right";
        calibrateMatBtn.innerText = "📍 右端をタップ";
        calibrationPoints.pop();
        document.getElementById('dpadPanel').style.display = 'none';
        if (isPausedForEdit) refreshReportView();
        return;
    }
    selectedJointIndex = null;
    document.getElementById('dpadPanel').style.display = 'none';
    if (appMode === 'playback') {
        renderPlaybackFrame(parseInt(document.getElementById('timelineSlider').value));
    } else if (isPausedForEdit) {
        refreshReportView();
    }
};
document.getElementById('dpadClose').onclick = closeDpad;

// Canvas Mouse Click selector for joint adjustment
canvasMP.onclick = function(e) {
    // Determine coordinates relative to canvas
    var rect = canvasMP.getBoundingClientRect();
    var clickX = (e.clientX - rect.left) * (canvasMP.width / rect.width);
    var clickY = (e.clientY - rect.top) * (canvasMP.height / rect.height);

    // 1. Calibration state intercepts
    if (calibState === "wait_left") {
        calibrationPoints[0] = { x: clickX, y: clickY };
        calibState = "adjust_left";
        calibrateMatBtn.innerText = "📍 左端調整中...";
        selectedJointIndex = null;
        document.getElementById('dpadPanel').style.display = 'block';
        return;
    }
    if (calibState === "wait_right") {
        calibrationPoints[1] = { x: clickX, y: clickY };
        calibState = "adjust_right";
        calibrateMatBtn.innerText = "📍 右端調整中...";
        selectedJointIndex = null;
        document.getElementById('dpadPanel').style.display = 'block';
        return;
    }
    if (calibState === "adjust_left" || calibState === "adjust_right") {
        return; // D-pad coordinates are editing calibration endpoints
    }

    // 2. Point Adjustment Selection (Only in paused/playback edit mode)
    if (isPausedForEdit || (appMode === 'playback' && isEditingPlaybackFrame)) {
        var kps = null;
        if (appMode === 'playback') {
            var fIdx = parseInt(document.getElementById('timelineSlider').value);
            if (playbackDataMP[fIdx]) kps = playbackDataMP[fIdx].keypoints;
        } else {
            kps = window.reportDataStore[currentTab];
        }

        if (!kps) return;

        // Find closest point within threshold (30px)
        var closestIdx = null;
        var minDist = 30.0;
        kps.forEach((kp, idx) => {
            if (kp && kp.score > 0.1) {
                // map index 33/34 for virtual nodes
                var displayIdx = idx;
                if (kp.name === 'virtual_asis_l') displayIdx = 33;
                if (kp.name === 'virtual_asis_r') displayIdx = 34;

                var dist = Math.hypot(kp.x - clickX, kp.y - clickY);
                if (dist < minDist) {
                    minDist = dist;
                    closestIdx = displayIdx;
                }
            }
        });

        if (closestIdx !== null) {
            selectedJointIndex = closestIdx;
            var jpName = JOINT_NAMES_JP[selectedJointIndex] || "関節点 " + selectedJointIndex;
            document.querySelector('#dpadPanel .dpad-header span').innerText = `🎯 微調整: ${jpName}`;
            document.getElementById('dpadPanel').style.display = 'block';
            
            // Re-render immediately to show crosshairs on the selected point
            if (appMode === 'playback') {
                renderPlaybackFrame(parseInt(document.getElementById('timelineSlider').value));
            } else {
                refreshReportView();
            }
        }
    }
};

// Playback Edit handlers
document.getElementById('editFrameBtn').onclick = function() {
    if (!isEditingPlaybackFrame) {
        togglePlay(false);
        isEditingPlaybackFrame = true;
        this.innerText = "✅ 編集完了";
        this.style.background = "var(--accent-green)";
        this.style.color = "#000";
    } else {
        isEditingPlaybackFrame = false;
        this.innerText = "✂️ 微調整";
        this.style.background = "var(--accent-orange)";
        this.style.color = "#000";
        closeDpad();
    }
};

document.getElementById('playPauseBtn').onclick = function() { togglePlay(); }; 
document.getElementById('backToCamBtn').onclick = function() { exitPlaybackMode(); };
document.getElementById('timelineSlider').oninput = function() {
    togglePlay(false);
    var fIdx = parseInt(document.getElementById('timelineSlider').value);
    renderPlaybackFrame(fIdx);
};

// Interactive COP Radar Drag-and-drop
var makeRadarDraggable = function() {
    var wrapper = document.getElementById('radarWrapperMP');
    var isDragging = false;
    var startX, startY;
    var initialLeft, initialTop;

    wrapper.addEventListener('mousedown', function(e) {
        isDragging = true;
        wrapper.classList.add('dragging');
        startX = e.clientX;
        startY = e.clientY;
        initialLeft = wrapper.offsetLeft;
        initialTop = wrapper.offsetTop;
        e.preventDefault();
    });

    document.addEventListener('mousemove', function(e) {
        if (!isDragging) return;
        var dx = e.clientX - startX;
        var dy = e.clientY - startY;
        wrapper.style.left = (initialLeft + dx) + 'px';
        wrapper.style.top = (initialTop + dy) + 'px';
        wrapper.style.right = 'auto'; // release right boundary constraint
    });

    document.addEventListener('mouseup', function() {
        if (isDragging) {
            isDragging = false;
            wrapper.classList.remove('dragging');
        }
    });

    // Touch support for mobiles
    wrapper.addEventListener('touchstart', function(e) {
        var t = e.touches[0];
        isDragging = true;
        wrapper.classList.add('dragging');
        startX = t.clientX;
        startY = t.clientY;
        initialLeft = wrapper.offsetLeft;
        initialTop = wrapper.offsetTop;
    });

    document.addEventListener('touchmove', function(e) {
        if (!isDragging) return;
        var t = e.touches[0];
        var dx = t.clientX - startX;
        var dy = t.clientY - startY;
        wrapper.style.left = (initialLeft + dx) + 'px';
        wrapper.style.top = (initialTop + dy) + 'px';
        wrapper.style.right = 'auto';
    });

    document.addEventListener('touchend', function() {
        if (isDragging) {
            isDragging = false;
            wrapper.classList.remove('dragging');
        }
    });
};

// Update Info HUD Panel text
function updateInfoPanel() {
    var scaleText = pxToCmRatio ? "校正済 (1px = " + pxToCmRatio.toFixed(3) + "cm)" : "📏 スケール未校正";
    scaleStatus.innerText = scaleText;
    pelvicStatus.innerText = "📐 骨盤傾斜: " + (estimatedPelvicTilt > 0 ? '+' : '') + estimatedPelvicTilt + "°";
}

// Refresh static view for live camera pause edit
function refreshReportView() {
    var w = video.videoWidth || canvasMP.width;
    var h = video.videoHeight || canvasMP.height;
    
    // Draw static backdrop image if stored
    if (staticBackgroundData) {
        ctxMP.putImageData(staticBackgroundData, 0, 0);
    } else {
        ctxMP.fillStyle = "#111";
        ctxMP.fillRect(0, 0, w, h);
    }

    var kps = window.reportDataStore[currentTab];
    if (kps) {
        biomechanics.drawSkeleton(ctxMP, kps, currentTab.startsWith('dyn_') ? '#39ff14' : '#ff5252');
        biomechanics.drawKendallAlignment(ctxMP, kps, pxToCmRatio, parseFloat(footSizeInput.value), estimatedPelvicTilt, currentTab, w, h);
        biomechanics.calculateWeightBearing(ctxMP, kps, w, h);
        
        // Draw selected joint crosshair
        if (selectedJointIndex !== null) {
            var kp = (selectedJointIndex === 33) ? kps.find(k=>k.name==='virtual_asis_l') :
                     (selectedJointIndex === 34) ? kps.find(k=>k.name==='virtual_asis_r') : kps[selectedJointIndex];
            if (kp) biomechanics.drawCrosshair(ctxMP, kp, canvasMP);
        }
    }
}

// History List Refresh & Database loads
window.refreshHistoryList = async function() {
    historyListContainer.innerHTML = '<div style="color:#8892b0; text-align:center; margin-top:20px;">読込中...</div>';
    try {
        var sessions = await dbManager.getAllSessions();
        historyListContainer.innerHTML = '';
        if (sessions.length === 0) {
            historyListContainer.innerHTML = '<div style="color:#8892b0; text-align:center; margin-top:20px;">保存データがありません。</div>';
            return;
        }
        
        var MODE_NAMES_JP = {
            'front': '🧍 前面', 'back': '🧍 後面', 'l_side': '🧍 左側面', 'r_side': '🧍 右側面',
            'dyn_overhead': '🏋️ OHS [前面]', 'dyn_overhead_side': '🏋️ OHS [側面]',
            'dyn_single_r': '🦵 片脚 [右]', 'dyn_single_l': '🦵 片脚 [左]',
            'dyn_flex_fwd': '🙇 立位前屈', 'dyn_flex_bwd': '🤸 立位後屈',
            'dyn_shoulder_r': '👐 肩複合 [右上]', 'dyn_shoulder_l': '👐 肩複合 [左上]'
        };

        sessions.forEach(session => {
            var date = new Date(session.timestamp);
            var dateStr = `${date.getFullYear()}/${(date.getMonth()+1).toString().padStart(2,'0')}/${date.getDate().toString().padStart(2,'0')} ${date.getHours().toString().padStart(2,'0')}:${date.getMinutes().toString().padStart(2,'0')}`;
            var modeName = MODE_NAMES_JP[session.mode] || session.mode;

            var item = document.createElement('div');
            item.className = 'history-item';
            item.innerHTML = `
                <div class="history-info" onclick="window.loadSession('${session.id}')">
                    <span class="history-mode">${modeName}</span>
                    <span class="history-date">${dateStr}</span>
                </div>
                <div class="history-actions">
                    <button class="history-action-btn vid" onclick="window.exportSessionVideo('${session.id}')">🎥 動画</button>
                    <button class="history-action-btn" onclick="window.exportSessionCsv('${session.id}')">CSV</button>
                    <button class="history-action-btn del" onclick="window.deleteSessionFromList('${session.id}')">削除</button>
                </div>
            `;
            historyListContainer.appendChild(item);
        });
    } catch (e) {
        console.error(e);
        historyListContainer.innerHTML = '<div style="color:var(--accent-red); text-align:center; margin-top:20px;">エラーが発生しました。</div>';
    }
};

window.deleteSessionFromList = async function(id) {
    if (confirm("このセッションデータを削除しますか？")) {
        await dbManager.deleteSession(id);
        window.refreshHistoryList();
    }
};

window.exportSessionCsv = async function(id) {
    try {
        var sessions = await dbManager.getAllSessions();
        var session = sessions.find(s => s.id === id);
        if (session) {
            var c = "Timestamp,Mode,PointID,PointName,X,Y\n"; 
            session.poseData.forEach(function(d) {
                d.keypoints.forEach(function(kp, idx) {
                    if (kp) {
                        c += d.time + "," + d.mode + "," + idx + "," + (kp.name || idx) + "," + kp.x.toFixed(1) + "," + kp.y.toFixed(1) + "\n";
                    }
                });
            }); 
            var a = document.createElement('a');
            a.href = URL.createObjectURL(new Blob([c], { type: 'text/csv' }));
            a.download = `connect_ai_data_${session.mode}_${session.timestamp}.csv`;
            a.click();
        }
    } catch (e) {
        console.error(e);
    }
};

window.exportSessionVideo = async function(id) {
    historyPanel.style.display = 'none';
    await window.loadSession(id);
    setTimeout(startVideoExport, 500);
};

window.loadSession = async function(id) {
    try {
        var sessions = await dbManager.getAllSessions();
        var session = sessions.find(s => s.id === id);
        if (session) {
            document.getElementById('modeSelect').value = session.mode;
            currentTab = session.mode;
            poseDataLog = session.poseData;
            pxToCmRatio = session.pxToCmRatio || null;
            estimatedPelvicTilt = session.pelvicTilt || 0;
            
            // Sync UI values
            heightInput.value = session.height || 170;
            footSizeInput.value = session.footSize || 25;
            pelvicTiltSlider.value = estimatedPelvicTilt;
            tiltValDisplay.innerText = estimatedPelvicTilt === 0 ? "0°" : (estimatedPelvicTilt > 0 ? "+" + estimatedPelvicTilt + "°" : estimatedPelvicTilt + "°");
            
            // Build dynamic coordinates sway history
            swayHistoryMP = [];
            
            playbackDataMP = poseDataLog.filter(d => d.mode === currentTab);
            if (playbackDataMP.length === 0) playbackDataMP = poseDataLog; 
            
            historyPanel.style.display = 'none';
            if (playbackDataMP.length > 1) { 
                playbackBaseTime = playbackDataMP[0].time; 
                playbackTotalDuration = playbackDataMP[playbackDataMP.length - 1].time - playbackBaseTime; 
            } else {
                playbackBaseTime = 0;
                playbackTotalDuration = 0;
            }
            
            var maxFrames = playbackDataMP.length - 1; 
            document.getElementById('timelineSlider').max = maxFrames > 0 ? maxFrames : 0; 
            document.getElementById('timelineSlider').value = 0; 
            
            appMode = 'playback'; 
            document.getElementById('mainControls').style.display = 'none'; 
            document.getElementById('playbackControls').style.display = 'flex';
            
            updateInfoPanel();
            renderPlaybackFrame(0); 
            togglePlay(true);
        }
    } catch (e) {
        console.error("Load session error", e);
        alert("データの読み込みに失敗しました。");
    }
};

// Playback scrubbing renderer
function renderPlaybackFrame(frameIdx) {
    if (!playbackDataMP[frameIdx]) return;
    var frame = playbackDataMP[frameIdx];
    var kps = frame.keypoints;
    var w = canvasMP.width;
    var h = canvasMP.height;

    // Clear frame & draw backdrop if available, otherwise solid dark
    ctxMP.fillStyle = "#050811";
    ctxMP.fillRect(0, 0, w, h);
    
    // Draw skeleton & overlays
    var color = currentTab.startsWith('dyn_') ? '#39ff14' : '#ff5252';
    biomechanics.drawSkeleton(ctxMP, kps, color);
    
    // Mode specific drawings
    if (currentTab === 'l_side' || currentTab === 'r_side') {
        biomechanics.drawKendallAlignment(ctxMP, kps, pxToCmRatio, parseFloat(footSizeInput.value), estimatedPelvicTilt, currentTab, w, h);
    } else if (currentTab === 'front' || currentTab === 'back' || currentTab === 'dyn_overhead') {
        biomechanics.calculateWeightBearing(ctxMP, kps, w, h);
    }

    if (currentTab === 'dyn_overhead') {
        biomechanics.drawOHSFrontAnalysis(ctxMP, kps);
    } else if (currentTab === 'dyn_overhead_side') {
        biomechanics.drawOHSSideAnalysis(ctxMP, kps);
    } else if (currentTab.startsWith('dyn_flex_')) {
        biomechanics.drawFlexionAnalysis(ctxMP, kps, currentTab);
    } else if (currentTab.startsWith('dyn_shoulder_')) {
        biomechanics.drawShoulderAnalysis(ctxMP, kps, currentTab);
    }

    // Update COP Radar representation
    biomechanics.updateRadar(kps, canvasRadarMP, ctxRadarMP, swayHistoryMP, true, currentTab.startsWith('dyn_') ? '#39ff14' : '#ff5252');

    // Update Frame Label HUD
    document.getElementById('frameCounter').innerText = `${frameIdx} / ${playbackDataMP.length - 1}`;
    
    // Draw crosshairs on selected editing joint
    if (selectedJointIndex !== null && isEditingPlaybackFrame) {
        var kp = (selectedJointIndex === 33) ? kps.find(k=>k.name==='virtual_asis_l') :
                 (selectedJointIndex === 34) ? kps.find(k=>k.name==='virtual_asis_r') : kps[selectedJointIndex];
        if (kp) biomechanics.drawCrosshair(ctxMP, kp, canvasMP);
    }
}

// Playback Control Play/Pause Loop
function togglePlay(forcePlay) {
    if (forcePlay !== undefined) {
        isPlaying = forcePlay;
    } else {
        isPlaying = !isPlaying;
    }

    var btn = document.getElementById('playPauseBtn');
    if (isPlaying) {
        btn.innerText = "⏸ 一時停止";
        playbackStartTime = Date.now();
        var slider = document.getElementById('timelineSlider');
        var startFrame = parseInt(slider.value);
        if (startFrame >= playbackDataMP.length - 1) {
            startFrame = 0;
            slider.value = 0;
        }
        playLoop(startFrame);
    } else {
        btn.innerText = "▶ 再生";
        if (playbackRafId) {
            cancelAnimationFrame(playbackRafId);
            playbackRafId = null;
        }
    }
}

function playLoop(startFrame) {
    if (!isPlaying) return;
    
    var slider = document.getElementById('timelineSlider');
    var currentFrame = startFrame + Math.floor((Date.now() - playbackStartTime) / 100); // ~10fps mapping
    
    if (currentFrame >= playbackDataMP.length) {
        // Loop back or pause at end
        currentFrame = 0;
        playbackStartTime = Date.now();
        slider.value = 0;
    }
    
    slider.value = currentFrame;
    renderPlaybackFrame(currentFrame);
    
    playbackRafId = requestAnimationFrame(() => playLoop(currentFrame));
}

// Camera/Live view setup loops
async function init() {
    try {
        await dbManager.init();
    } catch (e) {
        console.error("Database initialization failed:", e);
    }

    makeRadarDraggable();
    biomechanics.clearRadar(ctxRadarMP, '#ff5252');

    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) { 
        videoSource.innerHTML = '<option value="">⚠️ HTTPS必須 (デプロイ環境)</option>'; 
        startBtn.innerText = "❌ 起動不可"; 
        return; 
    }

    try {
        // Trigger webcam permission modal
        var tempStream = await navigator.mediaDevices.getUserMedia({ video: true });
        tempStream.getTracks().forEach(t => t.stop());
    } catch (e) {}

    try {
        var devices = await navigator.mediaDevices.enumerateDevices(); 
        videoSource.innerHTML = ''; 
        var camCount = 1, hasCam = false;
        devices.forEach(function(d) { 
            if (d.kind === 'videoinput') { 
                videoSource.appendChild(new Option(d.label || "カメラ " + camCount++, d.deviceId)); 
                hasCam = true; 
            } 
        });
        if (!hasCam) videoSource.innerHTML = '<option value="">カメラなし</option>';
        
        startBtn.innerText = "⏳ AIモデル読込中..."; 
        startBtn.disabled = true;
        
        await tf.setBackend('webgl'); 
        await tf.ready();
        
        // Load BlazePose Full detector
        detectors[0] = await poseDetection.createDetector(poseDetection.SupportedModels.BlazePose, { 
            runtime: 'mediapipe', 
            solutionPath: 'https://cdn.jsdelivr.net/npm/@mediapipe/pose', 
            modelType: 'full' 
        });
        
        startBtn.innerText = "📷 フルHD起動"; 
        startBtn.disabled = false; 
        updateInfoPanel();
    } catch (e) { 
        startBtn.innerText = "❌ 起動エラー"; 
        console.error("AI Initialization Error:", e);
        alert("AIエンジンの初期化に失敗しました。詳細: " + e.message);
    }
}
window.addEventListener('load', init);

// Camera Start Handler
startBtn.onclick = async function() {
    renderSessionId++;
    var currentSession = renderSessionId;

    if (mainRenderId) { cancelAnimationFrame(mainRenderId); mainRenderId = null; }
    if (currentStream) { 
        currentStream.getTracks().forEach(t => t.stop()); 
        video.pause(); 
        video.srcObject = null; 
    }
    
    // Reset status
    swayHistoryMP = [];
    selectedJointIndex = null;
    isPausedForEdit = false;
    staticBackgroundData = null;
    appMode = "camera";
    
    document.getElementById('playbackControls').style.display = 'none';
    document.getElementById('mainControls').style.display = 'flex';
    document.getElementById('recBtn').disabled = false;
    
    try {
        var constraints = {
            video: {
                width: { ideal: 1920 },
                height: { ideal: 1080 }
            }
        };
        if (videoSource.value) {
            constraints.video.deviceId = { exact: videoSource.value };
        } else {
            constraints.video.facingMode = "environment";
        }
        
        currentStream = await navigator.mediaDevices.getUserMedia(constraints);
        video.srcObject = currentStream;
        video.onloadeddata = function() { 
            canvasMP.width = video.videoWidth; 
            canvasMP.height = video.videoHeight; 
            canvasComb.width = video.videoWidth; 
            canvasComb.height = video.videoHeight; 
            isRunning = true;
            video.play(); 
            render(currentSession); 
        };
    } catch (e) {
        alert("カメラの起動に失敗しました。カメラパーミッションを確認してください。");
    }
};

// Render Loop
async function render(sessionId) {
    if (sessionId !== renderSessionId) return; 

    if (!isRunning || appMode === 'playback' || isPausedForEdit) { 
        if (isRunning) mainRenderId = requestAnimationFrame(() => render(sessionId)); 
        return; 
    }
    
    if (video.readyState < 2) { 
        mainRenderId = requestAnimationFrame(() => render(sessionId)); 
        return; 
    }
    
    var w = video.videoWidth, h = video.videoHeight;
    ctxMP.drawImage(video, 0, 0, w, h); 
    biomechanics.drawCenterGrid(ctxMP, canvasMP);

    // Render calibration points
    if (calibState !== "idle") {
        ctxMP.fillStyle = "#ffeb3b";
        if (calibrationPoints[0]) {
            ctxMP.beginPath(); ctxMP.arc(calibrationPoints[0].x, calibrationPoints[0].y, 8, 0, 2*Math.PI); ctxMP.fill();
            if (calibState === "adjust_left") biomechanics.drawCrosshair(ctxMP, calibrationPoints[0], canvasMP);
        }
        if (calibrationPoints[1]) {
            ctxMP.beginPath(); ctxMP.arc(calibrationPoints[1].x, calibrationPoints[1].y, 8, 0, 2*Math.PI); ctxMP.fill();
            if (calibState === "adjust_right") biomechanics.drawCrosshair(ctxMP, calibrationPoints[1], canvasMP);
        }
    }

    // Estimate poses
    var poses = [];
    try {
        poses = await detectors[0].estimatePoses(video);
    } catch (e) {
        console.error("Pose estimation error:", e);
    }
    
    if (poses.length > 0) {
        var kps = poses[0].keypoints;
        // Generate Virtual ASIS markers
        kps = generateVirtualASIS(kps);
        window.reportDataStore[currentTab] = kps;

        if (isRecording) {
            coordinateBufferMP.push(kps);
            poseDataLog.push({
                time: Date.now(),
                mode: currentTab,
                keypoints: JSON.parse(JSON.stringify(kps))
            });
        }

        // Draw Skeletal overlays
        var color = currentTab.startsWith('dyn_') ? '#39ff14' : '#ff5252';
        biomechanics.drawSkeleton(ctxMP, kps, color);
        
        // Static analysis drawings
        if (currentTab === 'l_side' || currentTab === 'r_side') {
            biomechanics.drawKendallAlignment(ctxMP, kps, pxToCmRatio, parseFloat(footSizeInput.value), estimatedPelvicTilt, currentTab, w, h);
        } else if (currentTab === 'front' || currentTab === 'back' || currentTab === 'dyn_overhead') {
            biomechanics.calculateWeightBearing(ctxMP, kps, w, h);
        }

        // Dynamic analysis drawings
        if (currentTab === 'dyn_overhead') {
            biomechanics.drawOHSFrontAnalysis(ctxMP, kps);
        } else if (currentTab === 'dyn_overhead_side') {
            biomechanics.drawOHSSideAnalysis(ctxMP, kps);
        } else if (currentTab.startsWith('dyn_flex_')) {
            biomechanics.drawFlexionAnalysis(ctxMP, kps, currentTab);
        } else if (currentTab.startsWith('dyn_shoulder_')) {
            biomechanics.drawShoulderAnalysis(ctxMP, kps, currentTab);
        }

        // COP Radar calculation
        biomechanics.updateRadar(kps, canvasRadarMP, ctxRadarMP, swayHistoryMP, isRecording, currentTab.startsWith('dyn_') ? '#39ff14' : '#ff5252');
    }
    
    // Draw onto secondary combined canvas
    ctxComb.drawImage(canvasMP, 0, 0, w, h); 
    mainRenderId = requestAnimationFrame(() => render(sessionId)); 
}

// Generate Virtual ASIS landmarks
function generateVirtualASIS(kps) {
    if (!kps) return kps;
    var height = parseFloat(heightInput.value) || 170;
    var distanceCm = height * 0.085; // anatomical scale estimate
    var ratio = pxToCmRatio || 0.15;
    var distancePx = distanceCm / ratio;
    
    // Pelvic tilt angle translation
    var angleRad = (45 - estimatedPelvicTilt) * (Math.PI / 180);
    var upwardOffsetPx = distancePx * Math.sin(angleRad);
    var forwardOffsetPx = distancePx * Math.cos(angleRad);
    
    var lHip = kps.find(k => k.name === 'left_hip' || k.name === '23');
    var rHip = kps.find(k => k.name === 'right_hip' || k.name === '24');
    
    if (lHip && rHip && lHip.score > 0.5 && rHip.score > 0.5) {
        var asisL = {
            x: lHip.x,
            y: lHip.y - upwardOffsetPx,
            score: 1.0,
            name: 'virtual_asis_l'
        };
        var asisR = {
            x: rHip.x,
            y: rHip.y - upwardOffsetPx,
            score: 1.0,
            name: 'virtual_asis_r'
        };
        
        if (currentTab === 'r_side') {
            asisL.x += forwardOffsetPx;
            asisR.x += forwardOffsetPx;
        } else if (currentTab === 'l_side') {
            asisL.x -= forwardOffsetPx;
            asisR.x -= forwardOffsetPx;
        }
        
        var newKps = JSON.parse(JSON.stringify(kps));
        newKps.push(asisL);
        newKps.push(asisR);
        return newKps;
    }
    return kps;
}

// Record Handler
recBtn.onclick = function() {
    if (isRecording) return;
    
    isRecording = true;
    coordinateBufferMP = [];
    poseDataLog = [];
    swayHistoryMP = [];
    
    recBtn.disabled = true;
    recBtn.innerText = "🔴 測定中...";
    timerDisplay.style.display = 'block';
    
    // Set custom WebM stream recorder if supported
    var canvasStream = canvasComb.captureStream(25); // 25fps capture
    exportChunks = [];
    try {
        exportRecorder = new MediaRecorder(canvasStream, { mimeType: 'video/webm;codecs=vp9' });
    } catch (e) {
        try {
            exportRecorder = new MediaRecorder(canvasStream, { mimeType: 'video/webm' });
        } catch (err) {
            exportRecorder = null;
        }
    }
    
    if (exportRecorder) {
        exportRecorder.ondataavailable = e => { if (e.data.size > 0) exportChunks.push(e.data); };
        exportRecorder.start();
    }

    var duration = parseInt(durationSelect.value) || 10000;
    var start = Date.now();
    
    var interval = setInterval(function() {
        var elapsed = Date.now() - start;
        var remaining = Math.max(0, (duration - elapsed) / 1000);
        timerDisplay.innerText = "REC " + remaining.toFixed(1) + "s";
        
        if (elapsed >= duration) {
            clearInterval(interval);
            stopRecording();
        }
    }, 100);
};

// Stop Recording logic
async function stopRecording() {
    isRecording = false;
    recBtn.innerText = "🔴 録画スタート";
    recBtn.disabled = false;
    timerDisplay.style.display = 'none';

    if (exportRecorder && exportRecorder.state !== 'inactive') {
        exportRecorder.stop();
    }

    // Capture the static image of canvas to preserve it for editing
    staticBackgroundData = ctxMP.getImageData(0, 0, canvasMP.width, canvasMP.height);
    isPausedForEdit = true;

    // Auto-save session to IndexedDB database
    var sessionId = "sess_" + Date.now();
    var sessionData = {
        id: sessionId,
        timestamp: Date.now(),
        mode: currentTab,
        height: parseFloat(heightInput.value) || 170,
        footSize: parseFloat(footSizeInput.value) || 25,
        pelvicTilt: estimatedPelvicTilt,
        pxToCmRatio: pxToCmRatio,
        poseData: JSON.parse(JSON.stringify(poseDataLog))
    };

    try {
        await dbManager.saveSession(sessionData);
        console.log("Session saved successfully.");
    } catch (e) {
        console.error("Save session failed:", e);
    }

    // Toggle to review editing mode directly on live pauses
    document.getElementById('mainControls').style.display = 'none';
    document.getElementById('playbackControls').style.display = 'flex';
    document.getElementById('downloadCsvBtn').disabled = false;
    
    playbackDataMP = poseDataLog;
    var maxFrames = playbackDataMP.length - 1;
    document.getElementById('timelineSlider').max = maxFrames > 0 ? maxFrames : 0;
    document.getElementById('timelineSlider').value = maxFrames > 0 ? maxFrames : 0;
    document.getElementById('frameCounter').innerText = `${maxFrames} / ${maxFrames}`;
}

// Exit playback, return to live camera feed
function exitPlaybackMode() {
    if (playbackRafId) {
        cancelAnimationFrame(playbackRafId);
        playbackRafId = null;
    }
    
    appMode = "camera";
    isPausedForEdit = false;
    isPlaying = false;
    selectedJointIndex = null;
    isEditingPlaybackFrame = false;
    
    document.getElementById('dpadPanel').style.display = 'none';
    document.getElementById('playbackControls').style.display = 'none';
    document.getElementById('mainControls').style.display = 'flex';
    document.getElementById('editFrameBtn').innerText = "✂️ 微調整";
    document.getElementById('editFrameBtn').style.background = "var(--accent-orange)";
    document.getElementById('editFrameBtn').style.color = "#000";
    
    // Restart camera loop
    startBtn.click();
}

// Export WebM video captured during recording
function startVideoExport() {
    if (exportChunks.length === 0) {
        alert("動画データがありません。");
        return;
    }
    var blob = new Blob(exportChunks, { type: 'video/webm' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = `connect_ai_video_${currentTab}_${Date.now()}.webm`;
    a.click();
}

// CSV export handler for current active playback logs
document.getElementById('downloadCsvBtn').onclick = function() {
    var c = "Timestamp,Mode,PointID,PointName,X,Y\n"; 
    playbackDataMP.forEach(function(d) {
        d.keypoints.forEach(function(kp, idx) {
            if (kp) {
                c += d.time + "," + d.mode + "," + idx + "," + (kp.name || idx) + "," + kp.x.toFixed(1) + "," + kp.y.toFixed(1) + "\n";
            }
        });
    }); 
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([c], { type: 'text/csv' }));
    a.download = `connect_ai_data_${currentTab}_${Date.now()}.csv`;
    a.click();
};

// Generate Dashboard report
async function prepareAndPrintReport() {
    var overlay = document.getElementById('dashboardOverlay');
    var grid = document.getElementById('dashGrid');
    
    grid.innerHTML = '<div style="grid-column: 1/-1; color: var(--accent-blue); text-align:center; font-size:20px; padding:50px;">📄 レポート生成中...</div>';
    overlay.style.display = 'block';

    // Mock session structure for current view
    var activeSession = {
        mode: currentTab,
        timestamp: Date.now(),
        height: parseFloat(heightInput.value) || 170,
        footSize: parseFloat(footSizeInput.value) || 25,
        pelvicTilt: estimatedPelvicTilt,
        pxToCmRatio: pxToCmRatio,
        poseData: playbackDataMP.length > 0 ? playbackDataMP : (window.reportDataStore[currentTab] ? [{ time: Date.now(), mode: currentTab, keypoints: window.reportDataStore[currentTab] }] : [])
    };

    var metrics = apiManager.extractMetrics(activeSession);
    var apiKey = localStorage.getItem('gemini_api_key') || '';

    var reportMarkdown = "";
    try {
        reportMarkdown = await apiManager.generateReport(activeSession, apiKey);
    } catch (e) {
        reportMarkdown = `### エラー\nレポートの生成に失敗しました: ${e}`;
    }

    // Build the grid cards HTML
    var gridHtml = "";

    // Card 1: Patient profile info
    gridHtml += `
    <div class="dash-card">
        <h3>🧍 被測定者プロファイル</h3>
        <div class="dash-metric"><span>測定モード</span><span class="val">${apiManager.getModeNameJp(metrics.mode)}</span></div>
        <div class="dash-metric"><span>身長</span><span class="val">${metrics.height} cm</span></div>
        <div class="dash-metric"><span>足のサイズ</span><span class="val">${metrics.footSize} cm</span></div>
        <div class="dash-metric"><span>骨盤傾斜角</span><span class="val ${metrics.pelvicTilt !== 0 ? 'warn' : ''}">${metrics.pelvicTilt}°</span></div>
        <div class="dash-metric"><span>スケール</span><span class="val">${metrics.pxToCmRatio ? (1/metrics.pxToCmRatio).toFixed(1) + ' px/cm' : '未校正'}</span></div>
    </div>`;

    // Card 2: Weight bearing card
    if (metrics.weightBearing) {
        var wDiff = Math.abs(metrics.weightBearing.total.L - metrics.weightBearing.total.R);
        gridHtml += `
        <div class="dash-card">
            <h3>⚖️ 左右荷重バランス</h3>
            <div class="dash-metric"><span>全身荷重 (左 / 右)</span><span class="val ${wDiff > 5 ? 'warn' : 'good'}">${metrics.weightBearing.total.L.toFixed(1)}% / ${metrics.weightBearing.total.R.toFixed(1)}%</span></div>
            <div class="dash-metric"><span>上半身荷重 (左 / 右)</span><span class="val">${metrics.weightBearing.upper.L.toFixed(1)}% / ${metrics.weightBearing.upper.R.toFixed(1)}%</span></div>
            <div class="dash-metric"><span>下半身荷重 (左 / 右)</span><span class="val">${metrics.weightBearing.lower.L.toFixed(1)}% / ${metrics.weightBearing.lower.R.toFixed(1)}%</span></div>
            <div class="dash-metric"><span>アシンメトリー偏位</span><span class="val">${wDiff.toFixed(1)}% ${wDiff > 5 ? '⚠️' : '✅'}</span></div>
        </div>`;
    }

    // Card 3: COP Sway metrics card
    if (metrics.swayMetrics) {
        gridHtml += `
        <div class="dash-card">
            <h3>📈 COP重心動揺アセスメント</h3>
            <div class="dash-metric"><span>動揺面積 (Ellipse)</span><span class="val ${metrics.swayMetrics.swayArea > 1500 ? 'warn' : 'good'}">${metrics.swayMetrics.swayArea.toFixed(1)} px²</span></div>
            <div class="dash-metric"><span>総動揺軌跡長</span><span class="val">${metrics.swayMetrics.pathLength.toFixed(1)} px</span></div>
            <div class="dash-metric"><span>平均動揺速度</span><span class="val">${metrics.swayMetrics.swaySpeed.toFixed(1)} px/s</span></div>
            <div class="dash-metric"><span>中心偏位 (X軸)</span><span class="val">${metrics.swayMetrics.avgDeviationX.toFixed(2)} % (${metrics.swayMetrics.avgDeviationX > 0 ? '右寄り' : '左寄り'})</span></div>
        </div>`;
    }

    // Card 4: Joint angles details card
    if (Object.keys(metrics.jointAngles).length > 0) {
        gridHtml += `
        <div class="dash-card">
            <h3>📐 測定関節角度・可動域</h3>`;
        if (metrics.jointAngles.leftKneeAngle) gridHtml += `<div class="dash-metric"><span>左膝関節角度</span><span class="val">${metrics.jointAngles.leftKneeAngle.toFixed(1)}°</span></div>`;
        if (metrics.jointAngles.rightKneeAngle) gridHtml += `<div class="dash-metric"><span>右膝関節角度</span><span class="val">${metrics.jointAngles.rightKneeAngle.toFixed(1)}°</span></div>`;
        if (metrics.jointAngles.trunkLean) gridHtml += `<div class="dash-metric"><span>体幹前傾角度</span><span class="val">${metrics.jointAngles.trunkLean.toFixed(1)}°</span></div>`;
        if (metrics.jointAngles.kneeFlexion) gridHtml += `<div class="dash-metric"><span>膝屈曲角度 (側面)</span><span class="val">${metrics.jointAngles.kneeFlexion.toFixed(1)}°</span></div>`;
        if (metrics.jointAngles.shoulderArmAngle) gridHtml += `<div class="dash-metric"><span>上腕挙上角度</span><span class="val">${metrics.jointAngles.shoulderArmAngle.toFixed(1)}°</span></div>`;
        if (metrics.jointAngles.hipFlexion) gridHtml += `<div class="dash-metric"><span>前屈/後屈股関節角度</span><span class="val">${metrics.jointAngles.hipFlexion.toFixed(1)}°</span></div>`;
        gridHtml += `</div>`;
    }

    // Card 5 (Full Span): AI Clinical Evaluation Report
    // Convert markdown headings/bullets to simple HTML for rendering in the overlay
    var formattedReport = reportMarkdown
        .replace(/### (.*)/g, '<h2>$1</h2>')
        .replace(/## (.*)/g, '<h2>$1</h2>')
        .replace(/- \*\*(.*?)\*\*:/g, '<li><strong>$1</strong>: ')
        .replace(/- (.*)/g, '<li>$1</li>')
        .replace(/\n\n/g, '<p></p>')
        .replace(/\n/g, '<br>');

    gridHtml += `
    <div class="dash-card ai-eval-card" id="aiEvalCard">
        <h3>🧠 AI 臨床インサイト評価フィードバック</h3>
        <div class="ai-eval-box" id="aiEvalContent">
            ${formattedReport}
        </div>
    </div>`;

    grid.innerHTML = gridHtml;
}
window.prepareAndPrintReport = prepareAndPrintReport;
