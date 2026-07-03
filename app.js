/**
 * ÉLITE PERFORMANCE - Athletecore Pro
 * Main Application Controller
 * Coordinates camera loops, MediaPipe Pose estimations, auto-scale calibrations,
 * PWA hooks, specialist logins, client-specialist JSON data exchanges,
 * and expert assessment dashboards.
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

// Gyro/Level/Auto-REC States (V2.3)
var isGyroEnabled = false;
var deviceOrientation = { beta: 90, gamma: 0 };
var isDeviceVertical = false;
var isAthleteFullyVisible = false;
var autoRecCountdownTimer = null;
var autoRecCountdownVal = 3;
var isAutoRecActive = false;
var isMobileView = false;
var isSelfie = false; // V2.5
var cameraFacingMode = "environment"; // V2.5
var isAutoRecReady = false; // V2.5.1
var autoRecStandbyTimer = null; // V2.5.1
var currentCategory = "static"; // V2.5.4

var playbackDataMP = [];
var mainRenderId = null;
var recordingDuration = 5000;
var coordinateBufferMP = [];
var poseDataLog = [];
var playbackRafId = null;

var selectedJointIndex = null;
var dpadStepVal = 1;
var isEditingPlaybackFrame = false;
var swayHistoryMP = [];

var pxToCmRatio = null; // scale multiplier: cm per pixel
var estimatedPelvicTilt = 0;
var calibState = "idle"; // 'idle', 'wait_left', 'adjust_left', 'wait_right', 'adjust_right'
var calibrationPoints = [];

// Session Metadata
var activeSessionId = null;
var activePatientName = "ゲスト";
var activeExpertComment = "";
var activeExpertExercises = "";

// Specialist Mode State
var isSpecialist = false;

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
    'front': 5000, 'back': 5000, 'l_side': 5000, 'r_side': 5000,
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
var toggleCameraModeBtn = document.getElementById('toggleCameraModeBtn');

var patientNameInput = document.getElementById('patientName');
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

// Specialist Login Modal Elements
var modeUnlockBtn = document.getElementById('modeUnlockBtn');
var logoutBtn = document.getElementById('logoutBtn');
var specialistLoginModal = document.getElementById('specialistLoginModal');
var closeLoginBtn = document.getElementById('closeLoginBtn');
var submitLoginBtn = document.getElementById('submitLoginBtn');
var specialistIdInput = document.getElementById('specialistId');
var specialistPassInput = document.getElementById('specialistPass');
var loginErrorMsg = document.getElementById('loginErrorMsg');

// Paid Mentor Booking Modal Elements
var mentorBookingModal = document.getElementById('mentorBookingModal');
var closeBookingBtn = document.getElementById('closeBookingBtn');
var submitBookingBtn = document.getElementById('submitBookingBtn');
var mentorSelect = document.getElementById('mentorSelect');
var bookingDateInput = document.getElementById('bookingDate');
var bookingInquiryInput = document.getElementById('bookingInquiry');

// JSON import element
var importSessionJson = document.getElementById('importSessionJson');
var importJsonGroup = document.getElementById('importJsonGroup');
var exportSessionJsonBtn = document.getElementById('exportSessionJsonBtn');

// UI Toggles
toggleUiBtn.onclick = function() {
    var settings = document.getElementById('settingsWrapper');
    if (settings) {
        if (settings.style.display === 'none') {
            settings.style.display = 'flex';
            toggleUiBtn.innerText = '🔽 UIを隠す';
        } else {
            settings.style.display = 'none';
            toggleUiBtn.innerText = '🔼 UIを表示';
        }
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

// V2.5 Camera Mode Toggle Handler
if (toggleCameraModeBtn) {
    toggleCameraModeBtn.onclick = function() {
        cameraFacingMode = (cameraFacingMode === "environment") ? "user" : "environment";
        isSelfie = (cameraFacingMode === "user");
        updateCameraModeBadge();
        
        // Auto restart if camera is already running
        if (isRunning) {
            startBtn.click();
        }
    };
}

// V2.5.1 Camera Mode Badge Update Handler
function updateCameraModeBadge() {
    var badge = document.getElementById('cameraModeBadge');
    var toggleBtn = document.getElementById('toggleCameraModeBtn');
    if (!badge) return;
    
    if (isSelfie) {
        badge.innerText = "🤳 セルフ撮影（鏡像）";
        badge.classList.add('selfie-active');
        if (toggleBtn) {
            toggleBtn.innerText = "🧍 通常撮影へ";
            toggleBtn.classList.add('selfie-active');
        }
    } else {
        badge.innerText = "🧍 通常撮影（標準）";
        badge.classList.remove('selfie-active');
        if (toggleBtn) {
            toggleBtn.innerText = "🤳 セルフ撮影へ";
            toggleBtn.classList.remove('selfie-active');
        }
    }
}

// Specialist Authorization check
function updateAuthUI() {
    var titleLabel = document.getElementById('appHeaderTitle');
    if (isSpecialist) {
        document.body.classList.add('specialist-unlocked');
        modeUnlockBtn.style.display = 'none';
        logoutBtn.style.display = 'inline-block';
        importJsonGroup.style.display = 'flex';
        exportSessionJsonBtn.style.display = 'inline-block';
        titleLabel.innerHTML = `ATHLETECORE PRO <span class="badge" style="background:var(--accent-orange); color:#000;">Specialist Portal</span>`;
    } else {
        document.body.classList.remove('specialist-unlocked');
        modeUnlockBtn.style.display = 'inline-block';
        logoutBtn.style.display = 'none';
        importJsonGroup.style.display = 'none';
        exportSessionJsonBtn.style.display = 'none';
        titleLabel.innerHTML = `ÉLITE PERFORMANCE <span class="badge">Precision in Motion</span>`;
    }
}

modeUnlockBtn.onclick = function() {
    loginErrorMsg.style.display = 'none';
    specialistPassInput.value = '';
    specialistLoginModal.style.display = 'block';
};

closeLoginBtn.onclick = function() {
    specialistLoginModal.style.display = 'none';
};

submitLoginBtn.onclick = function() {
    var id = specialistIdInput.value.trim();
    var pass = specialistPassInput.value.trim();

    if (id === 'specialist' && pass === 'athletecore2026') {
        isSpecialist = true;
        sessionStorage.setItem('isSpecialist', 'true');
        specialistLoginModal.style.display = 'none';
        updateAuthUI();
        alert("専門家認証に成功しました。");
    } else {
        loginErrorMsg.style.display = 'block';
    }
};

logoutBtn.onclick = function() {
    isSpecialist = false;
    sessionStorage.removeItem('isSpecialist');
    updateAuthUI();
    alert("ログアウトしました。アスリートモードに戻ります。");
    if (appMode === 'playback') {
        exitPlaybackMode();
    }
};

// Mentor booking modal handlers
closeBookingBtn.onclick = function() {
    mentorBookingModal.style.display = 'none';
};

submitBookingBtn.onclick = function() {
    var mentor = mentorSelect.value;
    var mentorName = mentorSelect.options[mentorSelect.selectedIndex].text;
    var date = bookingDateInput.value;
    var inquiry = bookingInquiryInput.value.trim();

    if (!date) {
        alert("希望日時を選択してください。");
        return;
    }

    // Save booking request simulated locally
    var booking = {
        id: "book_" + Date.now(),
        patientName: patientNameInput.value.trim() || "ゲスト",
        mentor: mentor,
        mentorName: mentorName,
        date: date,
        inquiry: inquiry,
        timestamp: Date.now()
    };
    
    var bookings = JSON.parse(localStorage.getItem('mentor_bookings') || '[]');
    bookings.push(booking);
    localStorage.setItem('mentor_bookings', JSON.stringify(bookings));

    mentorBookingModal.style.display = 'none';
    alert(`個別相談セッションのご予約を受け付けました！\n\n【予約詳細】\n担当: ${mentorName}\n日時: ${new Date(date).toLocaleString()}\n\n折り返し、決済リンクおよびWebミーティングの案内をメールでお送りいたします。`);
};

// JSON data import handler
importSessionJson.onchange = function(event) {
    var file = event.target.files[0];
    if (!file) return;

    var reader = new FileReader();
    reader.onload = function(e) {
        try {
            var data = jsonDecode(e.target.result);
            if (!data.poseData || data.poseData.length === 0) {
                throw new Error("無効なセッションデータ構造です。");
            }
            
            // Set session properties
            activeSessionId = data.id || "sess_" + Date.now();
            activePatientName = data.patientName || "ゲスト";
            patientNameInput.value = activePatientName;
            
            poseDataLog = data.poseData;
            playbackDataMP = poseDataLog;
            pxToCmRatio = data.pxToCmRatio || null;
            estimatedPelvicTilt = data.pelvicTilt || 0;
            
            heightInput.value = data.height || 170;
            footSizeInput.value = data.footSize || 25;
            pelvicTiltSlider.value = estimatedPelvicTilt;
            tiltValDisplay.innerText = estimatedPelvicTilt === 0 ? "0°" : (estimatedPelvicTilt > 0 ? "+" + estimatedPelvicTilt + "°" : estimatedPelvicTilt + "°");
            
            activeExpertComment = data.expertComment || "";
            activeExpertExercises = data.expertExercises || "";
            
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
            updateModeUI(data.mode || "front");
            
            document.getElementById('mainControls').style.display = 'none'; 
            document.getElementById('playbackControls').style.display = 'flex';
            document.getElementById('downloadCsvBtn').disabled = false;
            
            updateInfoPanel();
            renderPlaybackFrame(0); 
            togglePlay(true);
            
            alert(`患者データ [${activePatientName} 様 - ${apiManager.getModeNameJp(currentTab)}] を正常にインポートしました。`);
        } catch (err) {
            alert("JSONファイルの解析に失敗しました。ファイルが破損しているか無効な形式です。\nエラー: " + err.message);
        }
    };
    reader.readAsText(file);
    // Reset file input value so same file can be imported again
    importSessionJson.value = '';
};

// Safe JSON decoder
function jsonDecode(str) {
    return JSON.parse(str);
}

// JSON data export handler
exportSessionJsonBtn.onclick = function() {
    if (playbackDataMP.length === 0) {
        alert("書き出しできる測定データがありません。");
        return;
    }
    
    var sessionData = {
        id: activeSessionId || "sess_" + Date.now(),
        timestamp: Date.now(),
        patientName: patientNameInput.value.trim() || "ゲスト",
        mode: currentTab,
        height: parseFloat(heightInput.value) || 170,
        footSize: parseFloat(footSizeInput.value) || 25,
        pelvicTilt: estimatedPelvicTilt,
        pxToCmRatio: pxToCmRatio,
        expertComment: activeExpertComment,
        expertExercises: activeExpertExercises,
        poseData: playbackDataMP
    };
    
    var jsonStr = JSON.stringify(sessionData, null, 2);
    var blob = new Blob([jsonStr], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = `session_${sessionData.patientName}_${currentTab}_${Date.now()}.json`;
    a.click();
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
    updateModeUI(e.target.value);
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
    
    // V2.5.8: 微調整画像のリアルタイム更新
    if (appMode === 'playback') {
        captureSkeletonImage(currentTab);
    }
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
    var rect = canvasMP.getBoundingClientRect();
    var clickX = (e.clientX - rect.left) * (canvasMP.width / rect.width);
    var clickY = (e.clientY - rect.top) * (canvasMP.height / rect.height);

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
        return; 
    }

    if (isPausedForEdit || (appMode === 'playback' && isEditingPlaybackFrame)) {
        var kps = null;
        if (appMode === 'playback') {
            var fIdx = parseInt(document.getElementById('timelineSlider').value);
            if (playbackDataMP[fIdx]) kps = playbackDataMP[fIdx].keypoints;
        } else {
            kps = window.reportDataStore[currentTab];
        }

        if (!kps) return;

        var closestIdx = null;
        var minDist = 30.0;
        kps.forEach((kp, idx) => {
            if (kp && kp.score > 0.1) {
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
        wrapper.style.right = 'auto'; 
    });

    document.addEventListener('mouseup', function() {
        if (isDragging) {
            isDragging = false;
            wrapper.classList.remove('dragging');
        }
    });

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

// ==========================================================================
// Smartphone Orientation & Auto-REC Utilities (V2.3)
// ==========================================================================

function updateModeUI(mode) {
    currentTab = mode;
    recordingDuration = DURATION_MAP[currentTab] || 10000;
    
    var durationSelect = document.getElementById('durationSelect');
    if (durationSelect) durationSelect.value = recordingDuration.toString();
    
    // V2.5.4 Tab visual sync when loading URL deep link or switching modes directly
    syncTabButtonsForMode(currentTab);
    
    var modeSelect = document.getElementById('modeSelect');
    if (modeSelect) modeSelect.value = currentTab;
    
    // V2.5.8: 次の測定ナビゲーションボタンの表示制御
    var nextBtn = document.getElementById('nextMeasureBtn');
    if (nextBtn) {
        var isStaticMode = ['front', 'back', 'l_side', 'r_side'].includes(mode);
        if (isStaticMode && appMode === 'playback') {
            nextBtn.style.display = 'inline-block';
            var labels = {
                'front': '決定して左側面へ ➡',
                'l_side': '決定して後面へ ➡',
                'back': '決定して右側面へ ➡',
                'r_side': '決定してレポート表示 📊'
            };
            nextBtn.innerText = labels[mode] || '決定して次へ';
        } else {
            nextBtn.style.display = 'none';
        }
    }
    
    // Toggle pelvic tilt panel
    var tiltPanel = document.getElementById('tiltPanel');
    if (tiltPanel) {
        var shouldShowTilt = (currentTab === 'l_side' || currentTab === 'r_side');
        // V2.5.9: PC/タブレット/スマホすべてのデバイスにおいて、カメラ起動中(撮影中)はパネルを完全に隠し、被写体の見やすさを最優先する
        if (shouldShowTilt && appMode === 'playback') {
            tiltPanel.style.display = 'block';
        } else {
            tiltPanel.style.display = 'none';
        }
    }
    
    swayHistoryMP = [];
    biomechanics.clearRadar(ctxRadarMP, currentTab.startsWith('dyn_') ? '#39ff14' : '#ff5252');
}

// V2.5.8: Auto-navigation binding trigger
var nextMeasureBtn = document.getElementById('nextMeasureBtn');
if (nextMeasureBtn) {
    nextMeasureBtn.onclick = function() {
        advanceToNextMeasurement();
    };
}

async function advanceToNextMeasurement() {
    // 1. 現在の画面（骨格・アライメント描画済み状態）をキャプチャしてメモリ保存
    captureSkeletonImage(currentTab);
    
    // 2. 次のステップへの判定
    var nextModeMap = {
        'front': 'l_side',
        'l_side': 'back',
        'back': 'r_side',
        'r_side': 'report'
    };
    
    var nextMode = nextModeMap[currentTab];
    if (!nextMode) return;
    
    if (nextMode === 'report') {
        prepareAndPrintReport();
        return;
    }
    
    // 3. 次のモードへ移行
    console.log("Auto-navigating to next mode: " + nextMode);
    
    var guideTexts = {
        'l_side': "左側面を向いて、次の測定を始めてください",
        'back': "後面を向いて、次の測定を始めてください",
        'r_side': "右側面を向いて、次の測定を始めてください"
    };
    if (guideTexts[nextMode]) {
        speakGuidance(guideTexts[nextMode]);
    }
    
    var modeSelect = document.getElementById('modeSelect');
    if (modeSelect) {
        syncTabButtonsForMode(nextMode);
        modeSelect.value = nextMode;
    }
    updateModeUI(nextMode);
    
    // 4. カメラを再起動してLive測定に戻る
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
    
    startBtn.click();
}

// V2.5.4 Analysis Category Tab Switcher
function switchAnalysisTab(category) {
    if (category !== 'static' && category !== 'dynamic') return;
    currentCategory = category;
    
    // Update tab button classes
    var tabStatic = document.getElementById('tabStaticBtn');
    var tabDynamic = document.getElementById('tabDynamicBtn');
    if (tabStatic && tabDynamic) {
        if (category === 'static') {
            tabStatic.classList.add('active');
            tabDynamic.classList.remove('active');
        } else {
            tabStatic.classList.remove('active');
            tabDynamic.classList.add('active');
        }
    }
    
    // Filter the dropdown list options
    filterModeDropdown();
    
    // Auto select first mode in the active category
    var modeSelect = document.getElementById('modeSelect');
    if (modeSelect) {
        var firstVal = (category === 'static') ? 'front' : 'dyn_overhead';
        modeSelect.value = firstVal;
        updateModeUI(firstVal);
    }
}

// Filter mode select options depending on the active tab category
function filterModeDropdown() {
    var modeSelect = document.getElementById('modeSelect');
    if (!modeSelect) return;
    
    // Clear current options
    modeSelect.innerHTML = "";
    
    if (currentCategory === 'static') {
        var optGroup = document.createElement('optgroup');
        optGroup.label = "■ 静止姿勢アライメント (順序順)";
        
        var options = [
            { val: 'front', label: '🧍 前面' },
            { val: 'l_side', label: '🧍 左側面' },
            { val: 'back', label: '🧍 後面' },
            { val: 'r_side', label: '🧍 右側面' }
        ];
        
        options.forEach(opt => {
            var el = document.createElement('option');
            el.value = opt.val;
            el.innerText = opt.label;
            optGroup.appendChild(el);
        });
        modeSelect.appendChild(optGroup);
    } else {
        var optGroup = document.createElement('optgroup');
        optGroup.label = "■ 動的機能評価";
        
        var options = [
            { val: 'dyn_overhead', label: '🏋️ OHS [前面]' },
            { val: 'dyn_overhead_side', label: '🏋️ OHS [側面]' },
            { val: 'dyn_single_r', label: '🦵 片脚バランス [右軸]' },
            { val: 'dyn_single_l', label: '🦵 片脚バランス [左軸]' },
            { val: 'dyn_flex_fwd', label: '🙇 立位体前屈' },
            { val: 'dyn_flex_bwd', label: '🤸 立位体後屈' },
            { val: 'dyn_shoulder_r', label: '👐 肩複合可動性 [右上]' },
            { val: 'dyn_shoulder_l', label: '👐 肩複合可動性 [左上]' }
        ];
        
        options.forEach(opt => {
            var el = document.createElement('option');
            el.value = opt.val;
            el.innerText = opt.label;
            optGroup.appendChild(el);
        });
        modeSelect.appendChild(optGroup);
    }
}

// Automatically switch and sync tab active visual when deep mode changes
function syncTabButtonsForMode(mode) {
    var isStaticMode = ['front', 'back', 'l_side', 'r_side'].includes(mode);
    var category = isStaticMode ? 'static' : 'dynamic';
    
    if (currentCategory !== category) {
        currentCategory = category;
        filterModeDropdown();
    }
    
    var tabStatic = document.getElementById('tabStaticBtn');
    var tabDynamic = document.getElementById('tabDynamicBtn');
    if (tabStatic && tabDynamic) {
        if (category === 'static') {
            tabStatic.classList.add('active');
            tabDynamic.classList.remove('active');
        } else {
            tabStatic.classList.remove('active');
            tabDynamic.classList.add('active');
        }
    }
}

function checkDeviceType() {
    isMobileView = window.innerWidth < 768;
    var container = document.getElementById('gyroLevelContainer');
    if (container) {
        container.style.display = (isMobileView && isRunning && appMode === 'camera') ? 'flex' : 'none';
    }
}
window.addEventListener('resize', checkDeviceType);

function requestDeviceOrientationPermission() {
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
        DeviceOrientationEvent.requestPermission()
            .then(permissionState => {
                if (permissionState === 'granted') {
                    window.addEventListener('deviceorientation', handleOrientation);
                    isGyroEnabled = true;
                    document.getElementById('gyroPermissionModal').style.display = 'none';
                    checkDeviceType();
                } else {
                    alert("傾きセンサーの利用が拒否されました。手持ち測定水準器は無効化されます。");
                    document.getElementById('gyroPermissionModal').style.display = 'none';
                }
            })
            .catch(err => {
                console.error("DeviceOrientation permission error:", err);
                document.getElementById('gyroPermissionModal').style.display = 'none';
            });
    } else {
        window.addEventListener('deviceorientation', handleOrientation);
        isGyroEnabled = true;
        document.getElementById('gyroPermissionModal').style.display = 'none';
        checkDeviceType();
    }
}

// Gyro smoothing filter state (V2.3.1)
var smoothOrientation = { beta: 90, gamma: 0 };

function handleOrientation(event) {
    if (event.beta !== null) {
        // Low-pass filter to smooth hand jitter (80% old value, 20% new value)
        smoothOrientation.beta = smoothOrientation.beta * 0.8 + event.beta * 0.2;
    }
    if (event.gamma !== null) {
        smoothOrientation.gamma = smoothOrientation.gamma * 0.8 + event.gamma * 0.2;
    }
    updateDigitalLevel();
}

function updateDigitalLevel() {
    var dot = document.getElementById('gyroLevelDot');
    var container = document.getElementById('gyroLevelContainer');
    if (!dot || !container) return;

    var pitchErr = smoothOrientation.beta - 90; // Pitch error (vertical offset)
    var rollErr = smoothOrientation.gamma; // Roll error (horizontal tilt)

    // V2.5.1: 自撮り（鏡像）時は水準器のドットの左右反応を反転して操作性を一致させる
    if (isSelfie) {
        rollErr = -rollErr;
    }

    // Scale errors for visualization inside circular HUD
    var scaleFactor = 3.5;
    var dx = rollErr * scaleFactor;
    var dy = pitchErr * scaleFactor;
    
    var dist = Math.hypot(dx, dy);
    var maxDist = 38;
    if (dist > maxDist) {
        dx = (dx / dist) * maxDist;
        dy = (dy / dist) * maxDist;
    }

    dot.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;

    // Relaxed tolerances:
    // Pitch (front/back) is allowed within ±15 degrees (makes it easy to view screen while standing)
    // Roll (left/right) is allowed within ±5 degrees (to keep camera level and prevent perspective bias)
    if (Math.abs(pitchErr) <= 15 && Math.abs(rollErr) <= 5) {
        container.classList.add('aligned');
        document.getElementById('gyroLevelStatus').innerText = "📐 垂直・水平OK！全身を収めてください";
        isDeviceVertical = true;
    } else {
        container.classList.remove('aligned');
        document.getElementById('gyroLevelStatus').innerText = "📐 カメラを垂直・水平に保ってください";
        isDeviceVertical = false;
        resetAutoRecCountdown();
    }
}

function checkAthleteVisibility(kps) {
    var requiredJoints = ['left_shoulder', 'right_shoulder', 'left_hip', 'right_hip', 'left_knee', 'right_knee', 'left_ankle', 'right_ankle'];
    var visibleCount = 0;
    
    requiredJoints.forEach(name => {
        var kp = kps.find(k => k.name === name);
        if (!kp) {
            var idxMap = {
                'left_shoulder': 11, 'right_shoulder': 12,
                'left_hip': 23, 'right_hip': 24,
                'left_knee': 25, 'right_knee': 26,
                'left_ankle': 27, 'right_ankle': 28
            };
            kp = kps[idxMap[name]];
        }
        if (kp && kp.score > 0.5) {
            visibleCount++;
        }
    });

    isAthleteFullyVisible = (visibleCount === requiredJoints.length);
}

// V2.5.6: Voice Guidance Helper using Web Speech API
function speakGuidance(text) {
    if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel(); // Cancel any ongoing speak immediately for responsive feedback
        var utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'ja-JP';
        utterance.volume = 1.0;
        utterance.rate = 1.2; // Slightly fast speech rate for tempo
        window.speechSynthesis.speak(utterance);
    }
}

function triggerAutoRecStandby() {
    if (isAutoRecReady || isAutoRecActive || isRecording) return;
    isAutoRecReady = true;
    
    // V2.5.6 Voice Guidance
    speakGuidance("レディ");
    
    var readyMsg = document.getElementById('autoRecReadyMessage');
    if (readyMsg) {
        readyMsg.innerText = "Ready... 静止してください";
        readyMsg.style.display = 'block';
    }
    
    // V2.5.1: 2秒間姿勢をキープしたらカウントダウンへ移行
    autoRecStandbyTimer = setTimeout(function() {
        if (isAutoRecReady) {
            if (readyMsg) readyMsg.style.display = 'none';
            isAutoRecReady = false;
            triggerAutoRecCountdown();
        }
    }, 2000);
}

function triggerAutoRecCountdown() {
    isAutoRecActive = true;
    autoRecCountdownVal = 3;
    var overlay = document.getElementById('autoRecCountdown');
    overlay.innerText = autoRecCountdownVal;
    overlay.style.display = 'block';
    
    document.body.classList.add('recording-active');

    // V2.5.6 Voice Guidance - First count
    speakGuidance("さん");

    autoRecCountdownTimer = setInterval(function() {
        autoRecCountdownVal--;
        if (autoRecCountdownVal > 0) {
            overlay.innerText = autoRecCountdownVal;
            // V2.5.6 Voice Guidance
            var countWords = { 2: "にい", 1: "いち" };
            if (countWords[autoRecCountdownVal]) {
                speakGuidance(countWords[autoRecCountdownVal]);
            }
        } else {
            clearInterval(autoRecCountdownTimer);
            autoRecCountdownTimer = null;
            overlay.style.display = 'none';
            isAutoRecActive = false;
            
            // V2.5.6 Voice Guidance
            speakGuidance("スタート");
            
            // Trigger actual record click
            recBtn.click();
        }
    }, 1000);
}

function resetAutoRecCountdown() {
    var wasActive = isAutoRecReady || isAutoRecActive;
    
    if (isAutoRecReady) {
        clearTimeout(autoRecStandbyTimer);
        autoRecStandbyTimer = null;
        isAutoRecReady = false;
        var readyMsg = document.getElementById('autoRecReadyMessage');
        if (readyMsg) readyMsg.style.display = 'none';
    }
    
    if (isAutoRecActive) {
        clearInterval(autoRecCountdownTimer);
        autoRecCountdownTimer = null;
        isAutoRecActive = false;
        var overlay = document.getElementById('autoRecCountdown');
        if (overlay) overlay.style.display = 'none';
        
        if (!isRecording) {
            document.body.classList.remove('recording-active');
        }
    }
    
    // V2.5.6 Voice Guidance on Reset (only if we were actually in standby/countdown state)
    if (wasActive) {
        speakGuidance("リセット");
    }
}

// Update Info HUD Panel text
function updateInfoPanel() {
    var scaleText = pxToCmRatio ? "校正済 (1px = " + pxToCmRatio.toFixed(3) + "cm)" : "📏 スケール未校正 (自動推定中)";
    scaleStatus.innerText = scaleText;
    pelvicStatus.innerText = "📐 骨盤傾斜: " + (estimatedPelvicTilt > 0 ? '+' : '') + estimatedPelvicTilt + "°";
}

// V2.5.8: Capture skeleton canvas as Base64 for report inclusion
function captureSkeletonImage(mode) {
    if (!['front', 'back', 'l_side', 'r_side'].includes(mode)) return;
    
    var canvas = document.getElementById('canvasMP');
    if (canvas) {
        try {
            var base64 = canvas.toDataURL('image/jpeg', 0.85);
            if (!window.reportDataStore[mode]) {
                window.reportDataStore[mode] = [];
            }
            window.reportDataStore[mode].capturedImage = base64;
            console.log("Captured alignment image for mode: " + mode);
        } catch (e) {
            console.error("Failed to capture image:", e);
        }
    }
}

// Automatic Scale Ratio Estimation (Biological model based on athlete height)
function autoEstimateScaleRatio(kps) {
    if (pxToCmRatio) return; // Skip if manually calibrated

    var nose = kps.find(k=>k.name==='nose'||k.name==='0');
    var lAnkle = kps.find(k=>k.name==='left_ankle'||k.name==='27');
    var rAnkle = kps.find(k=>k.name==='right_ankle'||k.name==='28');

    if (nose && lAnkle && rAnkle && nose.score > 0.4 && lAnkle.score > 0.4 && rAnkle.score > 0.4) {
        var ankleY = (lAnkle.y + rAnkle.y) / 2;
        var heightPx = ankleY - nose.y;
        if (heightPx > 50) {
            var heightCm = parseFloat(heightInput.value) || 170;
            // Biological height ratio: nose height is approx 86% of total height from the floor
            var estimatedTotalHeightPx = heightPx / 0.86;
            pxToCmRatio = heightCm / estimatedTotalHeightPx;
            updateInfoPanel();
        }
    }
}

// Refresh static view for live camera pause edit
function refreshReportView() {
    var w = video.videoWidth || canvasMP.width;
    var h = video.videoHeight || canvasMP.height;
    
    if (staticBackgroundData) {
        ctxMP.putImageData(staticBackgroundData, 0, 0);
    } else {
        ctxMP.fillStyle = "#111";
        ctxMP.fillRect(0, 0, w, h);
    }

    var kps = window.reportDataStore[currentTab];
    if (kps) {
        // Automatically run scale estimation in paused state if missing
        autoEstimateScaleRatio(kps);
        
        // V2.6.0: 骨格線の背後に、問題のある抗重力筋ポリゴンとバネをレイヤー描画
        biomechanics.drawMusculoskeletalAnatomy(ctxMP, kps, currentTab, pxToCmRatio, parseFloat(footSizeInput.value), estimatedPelvicTilt, w, h);
        
        biomechanics.drawSkeleton(ctxMP, kps, currentTab.startsWith('dyn_') ? '#39ff14' : '#ff5252');
        biomechanics.drawKendallAlignment(ctxMP, kps, pxToCmRatio, parseFloat(footSizeInput.value), estimatedPelvicTilt, currentTab, w, h);
        biomechanics.calculateWeightBearing(ctxMP, kps, w, h);
        
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
            var patName = session.patientName || "ゲスト";

            var item = document.createElement('div');
            item.className = 'history-item';
            item.innerHTML = `
                <div class="history-info" onclick="window.loadSession('${session.id}')">
                    <span class="history-mode">${patName} 様 - ${modeName}</span>
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
            a.download = `connect_ai_data_${session.patientName || 'guest'}_${session.mode}_${session.timestamp}.csv`;
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
            activeSessionId = session.id;
            activePatientName = session.patientName || "ゲスト";
            
            // V2.5.8: 過去セッション画像データの復元
            if (session.images) {
                Object.keys(session.images).forEach(mode => {
                    if (!window.reportDataStore[mode]) {
                        window.reportDataStore[mode] = {};
                    }
                    // デモセッション時は、撮影キャッシュ(capturedImage)に上書きさせないようにする
                    if (id === 'demo_connect_town_2026') {
                        window.reportDataStore[mode].capturedImage = null;
                    } else {
                        window.reportDataStore[mode].capturedImage = session.images[mode];
                    }
                });
            } else {
                ['front', 'back', 'l_side', 'r_side'].forEach(mode => {
                    if (window.reportDataStore[mode]) {
                        window.reportDataStore[mode].capturedImage = null;
                    }
                });
            }
            patientNameInput.value = activePatientName;
            
            poseDataLog = session.poseData;
            pxToCmRatio = session.pxToCmRatio || null;
            estimatedPelvicTilt = session.pelvicTilt || 0;
            
            activeExpertComment = session.expertComment || "";
            activeExpertExercises = session.expertExercises || "";
            
            // Sync UI values
            heightInput.value = session.height || 170;
            footSizeInput.value = session.footSize || 25;
            pelvicTiltSlider.value = estimatedPelvicTilt;
            tiltValDisplay.innerText = estimatedPelvicTilt === 0 ? "0°" : (estimatedPelvicTilt > 0 ? "+" + estimatedPelvicTilt + "°" : estimatedPelvicTilt + "°");
            
            playbackDataMP = poseDataLog.filter(d => d.mode === session.mode);
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
            updateModeUI(session.mode);
            
            document.getElementById('mainControls').style.display = 'none'; 
            document.getElementById('playbackControls').style.display = 'flex';
            document.getElementById('downloadCsvBtn').disabled = false;
            
            updateInfoPanel();
            renderPlaybackFrame(0); 
            togglePlay(true);
        }
    } catch (e) {
        console.error("Load session error", e);
        alert("データの読み込みに失敗しました。\nエラー詳細: " + e.message + "\n" + e.stack);
    }
};

// Playback scrubbing renderer
function renderPlaybackFrame(frameIdx) {
    if (!playbackDataMP[frameIdx]) return;
    var frame = playbackDataMP[frameIdx];
    var kps = frame.keypoints;
    var w = canvasMP.width;
    var h = canvasMP.height;

    ctxMP.fillStyle = "#050811";
    ctxMP.fillRect(0, 0, w, h);
    
    // V2.6.0: 骨格線の背後に、問題のある抗重力筋ポリゴンとバネをレイヤー描画
    biomechanics.drawMusculoskeletalAnatomy(ctxMP, kps, currentTab, pxToCmRatio, parseFloat(footSizeInput.value), estimatedPelvicTilt, w, h);
    
    var color = currentTab.startsWith('dyn_') ? '#39ff14' : '#ff5252';
    biomechanics.drawSkeleton(ctxMP, kps, color);
    if (window.updateWebGLPose) window.updateWebGLPose(kps, w, h);
    
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

    biomechanics.updateRadar(kps, canvasRadarMP, ctxRadarMP, swayHistoryMP, true, currentTab.startsWith('dyn_') ? '#39ff14' : '#ff5252');

    document.getElementById('frameCounter').innerText = `${frameIdx} / ${playbackDataMP.length - 1}`;
    
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
    var currentFrame = startFrame + Math.floor((Date.now() - playbackStartTime) / 100); 
    
    if (currentFrame >= playbackDataMP.length) {
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

    if (sessionStorage.getItem('isSpecialist') === 'true') {
        isSpecialist = true;
    }
    updateAuthUI();

    // 1. Initialize DB and seed demo data FIRST (fully non-blocking)
    try {
        await dbManager.init();
        if (typeof seedDemoDataIfEmpty === 'function') {
            await seedDemoDataIfEmpty();
        }
        if (typeof window.refreshHistoryList === 'function') {
            window.refreshHistoryList();
        }
    } catch (e) {
        console.error("Database initialization failed:", e);
    }

    makeRadarDraggable();
    if (typeof biomechanics !== 'undefined' && biomechanics.clearRadar) {
        biomechanics.clearRadar(ctxRadarMP, '#ff5252');
    }

    // 2. Discover cameras without getUserMedia on boot to avoid iOS Safari prompt freeze
    if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
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
        } catch (e) {
            console.warn("Could not enumerate devices directly on load:", e);
            videoSource.innerHTML = '<option value="">カメラ検出スキップ</option>';
        }
    } else {
        videoSource.innerHTML = '<option value="">⚠️ HTTPS必須 (デプロイ環境)</option>';
    }

    // 3. Load TensorFlow / BlazePose asynchronously
    try {
        startBtn.innerText = "⏳ AIモデル読込中...";
        startBtn.disabled = true;

        await tf.setBackend('webgl');
        await tf.ready();

        detectors[0] = await poseDetection.createDetector(poseDetection.SupportedModels.BlazePose, {
            runtime: 'mediapipe',
            solutionPath: 'https://cdn.jsdelivr.net/npm/@mediapipe/pose',
            modelType: 'full'
        });

        startBtn.innerText = "📷 フルHD起動";
        startBtn.disabled = false;
        updateInfoPanel();
        updateCameraModeBadge(); 
        filterModeDropdown(); 
        syncTabButtonsForMode(currentTab); 
        updateModeUI(currentTab); 
        
        var gyroBtn = document.getElementById('submitGyroPermissionBtn');
        if (gyroBtn) gyroBtn.onclick = requestDeviceOrientationPermission;
    } catch (e) {
        startBtn.innerText = "❌ 起動エラー";
        console.error("AI Initialization Error:", e);
    }
}
// Safe document load binding to prevent event bypass
if (document.readyState === 'complete' || document.readyState === 'interactive') {
    init();
} else {
    window.addEventListener('load', init);
}
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
    
    swayHistoryMP = [];
    selectedJointIndex = null;
    isPausedForEdit = false;
    staticBackgroundData = null;
    appMode = "camera";
    
    // Clear expert notes for fresh captures
    activeExpertComment = "";
    activeExpertExercises = "";
    activeSessionId = null;
    
    document.getElementById('playbackControls').style.display = 'none';
    document.getElementById('mainControls').style.display = 'flex';
    document.getElementById('recBtn').disabled = false;
    updateCameraModeBadge(); // V2.5.1
    
    try {
        var constraints = {
            video: {
                width: { ideal: 1920 },
                height: { ideal: 1080 }
            }
        };
        if (isMobileView) {
            // V2.5.7: モバイル時は選択したモードのカメラへ確実に強制固定する (exact)
            constraints.video.facingMode = { exact: cameraFacingMode };
        } else if (videoSource.value) {
            constraints.video.deviceId = { exact: videoSource.value };
        } else {
            constraints.video.facingMode = { ideal: "environment" };
        }
        
        try {
            currentStream = await navigator.mediaDevices.getUserMedia(constraints);
        } catch (err) {
            console.warn("Exact facingMode constraint failed, falling back to ideal:", err);
            // V2.5.7: フォールバック（PCや背面カメラのない特殊環境用）
            if (constraints.video.facingMode) {
                constraints.video.facingMode = { ideal: cameraFacingMode };
            }
            if (constraints.video.deviceId) {
                delete constraints.video.deviceId;
            }
            currentStream = await navigator.mediaDevices.getUserMedia(constraints);
        }
        video.srcObject = currentStream;
        video.onloadeddata = function() { 
            canvasMP.width = video.videoWidth; 
            canvasMP.height = video.videoHeight; 
            canvasComb.width = video.videoWidth; 
            canvasComb.height = video.videoHeight; 
            isRunning = true;
            video.play(); 
            
            // カメラ起動完了後に自動で設定パネルを閉じて、プレビューを全画面表示にする
            var isMobileOrTablet = window.innerWidth < 1024;
            if (isMobileOrTablet) {
                var settings = document.getElementById('settingsWrapper');
                var btn = document.getElementById('toggleUiBtn');
                if (settings && btn) {
                    settings.style.display = 'none';
                    btn.innerText = '🔼 UIを表示';
                }
            }
            
            // Check gyro settings on mobile startup
            if (window.innerWidth < 768 && !isGyroEnabled) {
                if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
                    document.getElementById('gyroPermissionModal').style.display = 'block';
                } else {
                    requestDeviceOrientationPermission();
                }
            }
            checkDeviceType();
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
    
    // V2.5: 自撮りモード時は鏡映像として表示するために左右反転描画
    if (isSelfie) {
        ctxMP.save();
        ctxMP.translate(w, 0);
        ctxMP.scale(-1, 1);
        ctxMP.drawImage(video, 0, 0, w, h);
        ctxMP.restore();
    } else {
        ctxMP.drawImage(video, 0, 0, w, h);
    }
    
    biomechanics.drawCenterGrid(ctxMP, canvasMP);

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

    var poses = [];
    try {
        poses = await detectors[0].estimatePoses(video);
    } catch (e) {
        console.error("Pose estimation error:", e);
    }
    
    if (poses.length > 0) {
        var kps = poses[0].keypoints;
        kps = generateVirtualASIS(kps);
        window.reportDataStore[currentTab] = kps;

        // Auto estimate scale ratio during live tracking
        autoEstimateScaleRatio(kps);

        if (isRecording) {
            coordinateBufferMP.push(kps);
            poseDataLog.push({
                time: Date.now(),
                mode: currentTab,
                keypoints: JSON.parse(JSON.stringify(kps))
            });
        }

        // V2.5: 画面描画および重心表示のため、自撮りモード時はX座標を反転させたキーポイントを作成
        var drawKps = JSON.parse(JSON.stringify(kps));
        if (isSelfie) {
            drawKps.forEach(kp => {
                if (kp) kp.x = w - kp.x;
            });
        }

        var color = currentTab.startsWith('dyn_') ? '#39ff14' : '#ff5252';
        biomechanics.drawSkeleton(ctxMP, drawKps, color);
        if (window.updateWebGLPose) window.updateWebGLPose(drawKps, w, h);
        
        if (currentTab === 'l_side' || currentTab === 'r_side') {
            biomechanics.drawKendallAlignment(ctxMP, drawKps, pxToCmRatio, parseFloat(footSizeInput.value), estimatedPelvicTilt, currentTab, w, h);
        } else if (currentTab === 'front' || currentTab === 'back' || currentTab === 'dyn_overhead') {
            biomechanics.calculateWeightBearing(ctxMP, drawKps, w, h);
        }

        if (currentTab === 'dyn_overhead') {
            biomechanics.drawOHSFrontAnalysis(ctxMP, drawKps);
        } else if (currentTab === 'dyn_overhead_side') {
            biomechanics.drawOHSSideAnalysis(ctxMP, drawKps);
        } else if (currentTab.startsWith('dyn_flex_')) {
            biomechanics.drawFlexionAnalysis(ctxMP, drawKps, currentTab);
        } else if (currentTab.startsWith('dyn_shoulder_')) {
            biomechanics.drawShoulderAnalysis(ctxMP, drawKps, currentTab);
        }

        biomechanics.updateRadar(drawKps, canvasRadarMP, ctxRadarMP, swayHistoryMP, isRecording, currentTab.startsWith('dyn_') ? '#39ff14' : '#ff5252');
        
        // Mobile Auto-REC check
        if (appMode === 'camera' && isRunning) {
            checkAthleteVisibility(kps);
            // V2.5.5: 自動録画（スタンバイ➡カウントダウン）はセルフ撮影（インカメラ）の時のみ作動させる
            if (isMobileView && isSelfie && isDeviceVertical && isAthleteFullyVisible && !isRecording) {
                if (!isAutoRecActive && !isAutoRecReady) {
                    triggerAutoRecStandby();
                }
            } else if (isMobileView && (!isSelfie || !isDeviceVertical || !isAthleteFullyVisible)) {
                resetAutoRecCountdown();
            }
        }
    }
    
    ctxComb.drawImage(canvasMP, 0, 0, w, h); 
    mainRenderId = requestAnimationFrame(() => render(sessionId)); 
}

// Generate Virtual ASIS landmarks
function generateVirtualASIS(kps) {
    if (!kps) return kps;
    var height = parseFloat(heightInput.value) || 170;
    var distanceCm = height * 0.085; 
    var ratio = pxToCmRatio || 0.15;
    var distancePx = distanceCm / ratio;
    
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
    document.body.classList.add('recording-active');
    coordinateBufferMP = [];
    poseDataLog = [];
    swayHistoryMP = [];
    
    recBtn.disabled = true;
    recBtn.innerText = "🔴 測定中...";
    timerDisplay.style.display = 'block';
    
    var canvasStream = canvasComb.captureStream(25); 
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
    
    document.body.classList.remove('recording-active');
    var gyroContainer = document.getElementById('gyroLevelContainer');
    if (gyroContainer) gyroContainer.style.display = 'none';

    if (exportRecorder && exportRecorder.state !== 'inactive') {
        exportRecorder.stop();
    }

    staticBackgroundData = ctxMP.getImageData(0, 0, canvasMP.width, canvasMP.height);
    isPausedForEdit = true;
    appMode = 'playback';
    updateModeUI(currentTab);

    // V2.5.8: 録画完了直後の描画状態を自動キャプチャ
    captureSkeletonImage(currentTab);

    activeSessionId = "sess_" + Date.now();
    activePatientName = patientNameInput.value.trim() || "ゲスト";

    var sessionImages = {};
    ['front', 'back', 'l_side', 'r_side'].forEach(mode => {
        if (window.reportDataStore[mode] && window.reportDataStore[mode].capturedImage) {
            sessionImages[mode] = window.reportDataStore[mode].capturedImage;
        }
    });

    var sessionData = {
        id: activeSessionId,
        timestamp: Date.now(),
        patientName: activePatientName,
        mode: currentTab,
        height: parseFloat(heightInput.value) || 170,
        footSize: parseFloat(footSizeInput.value) || 25,
        pelvicTilt: estimatedPelvicTilt,
        pxToCmRatio: pxToCmRatio,
        expertComment: activeExpertComment,
        expertExercises: activeExpertExercises,
        poseData: JSON.parse(JSON.stringify(poseDataLog)),
        images: sessionImages // V2.5.8
    };

    try {
        await dbManager.saveSession(sessionData);
        console.log("Session saved successfully.");
    } catch (e) {
        console.error("Save session failed:", e);
    }
    
    // V2.5.8 Voice Guidance on capture complete
    var nextLabelsAudio = {
        'front': "前面の撮影が完了しました。決定して左側面へ進んでください",
        'l_side': "左側面の撮影が完了しました。決定して後面へ進んでください",
        'back': "後面の撮影が完了しました。決定して右側面へ進んでください",
        'r_side': "すべての姿勢撮影が完了しました。決定してレポートを表示してください"
    };
    if (nextLabelsAudio[currentTab]) {
        speakGuidance(nextLabelsAudio[currentTab]);
    }

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
    
    checkDeviceType();
    updateModeUI(currentTab);
    updateCameraModeBadge(); // V2.5.1
    
    document.getElementById('dpadPanel').style.display = 'none';
    document.getElementById('playbackControls').style.display = 'none';
    document.getElementById('mainControls').style.display = 'flex';
    document.getElementById('editFrameBtn').innerText = "✂️ 微調整";
    document.getElementById('editFrameBtn').style.background = "var(--accent-orange)";
    document.getElementById('editFrameBtn').style.color = "#000";
    
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
    a.download = `connect_ai_video_${patientNameInput.value.trim() || 'guest'}_${currentTab}_${Date.now()}.webm`;
    a.click();
}

// Save expert evaluation form comments to IndexedDB session
async function saveExpertComment() {
    var expComment = document.getElementById('expertCommentInput').value.trim();
    var expExercises = document.getElementById('expertExercisesInput').value.trim();
    
    activeExpertComment = expComment;
    activeExpertExercises = expExercises;
    
    if (activeSessionId) {
        var sessionData = {
            id: activeSessionId,
            timestamp: Date.now(),
            patientName: patientNameInput.value.trim() || "ゲスト",
            mode: currentTab,
            height: parseFloat(heightInput.value) || 170,
            footSize: parseFloat(footSizeInput.value) || 25,
            pelvicTilt: estimatedPelvicTilt,
            pxToCmRatio: pxToCmRatio,
            expertComment: activeExpertComment,
            expertExercises: activeExpertExercises,
            poseData: playbackDataMP
        };

        try {
            await dbManager.saveSession(sessionData);
            alert("専門家によるアセスメント（カルテ）を保存しました。");
            
            // Re-render report to reflect saved values
            prepareAndPrintReport();
        } catch (e) {
            console.error("Save expert notes failed:", e);
            alert("アセスメントの保存に失敗しました。");
        }
    } else {
        alert("保存対象の測定ログがありません。一度測定を行うか、JSONをインポートしてください。");
    }
}
window.saveExpertComment = saveExpertComment;

// Generate Dashboard report
async function prepareAndPrintReport() {
    var overlay = document.getElementById('dashboardOverlay');
    var grid = document.getElementById('dashGrid');
    
    grid.innerHTML = '<div style="grid-column: 1/-1; color: var(--accent-blue); text-align:center; font-size:20px; padding:50px;">📄 レポート生成中...</div>';
    overlay.style.display = 'block';

    var patName = patientNameInput.value.trim() || "ゲスト";

    var activeSession = {
        mode: currentTab,
        timestamp: Date.now(),
        patientName: patName,
        height: parseFloat(heightInput.value) || 170,
        footSize: parseFloat(footSizeInput.value) || 25,
        pelvicTilt: estimatedPelvicTilt,
        pxToCmRatio: pxToCmRatio,
        expertComment: activeExpertComment,
        expertExercises: activeExpertExercises,
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
        <div class="dash-metric"><span>氏名 / ID</span><span class="val">${patName} 様</span></div>
        <div class="dash-metric"><span>測定モード</span><span class="val">${apiManager.getModeNameJp(metrics.mode)}</span></div>
        <div class="dash-metric"><span>身長</span><span class="val">${metrics.height} cm</span></div>
        <div class="dash-metric"><span>足のサイズ</span><span class="val">${metrics.footSize} cm</span></div>
        <div class="dash-metric"><span>骨盤傾斜角</span><span class="val ${metrics.pelvicTilt !== 0 ? 'warn' : ''}">${metrics.pelvicTilt}°</span></div>
        <div class="dash-metric"><span>スケール</span><span class="val">${metrics.pxToCmRatio ? (1/metrics.pxToCmRatio).toFixed(1) + ' px/cm' : '未校正 (自動推定)'}</span></div>
    </div>`;

    // Card 1.5: 4-Direction Posture Images (V2.5.8)
    var imageCardsHtml = "";
    var modeLabelsJp = { 'front': '前面', 'l_side': '左側面', 'back': '後面', 'r_side': '右側面' };
    
    ['front', 'l_side', 'back', 'r_side'].forEach(mode => {
        var base64 = null;
        if (window.reportDataStore[mode] && window.reportDataStore[mode].capturedImage) {
            base64 = window.reportDataStore[mode].capturedImage;
        }
        
        if (base64) {
            var subInfo = (mode === 'l_side' || mode === 'r_side') ? "ケンダル垂直基準線" : "荷重バランス比率対象";
            imageCardsHtml += `
            <div class="report-image-card">
                <img src="${base64}" alt="${modeLabelsJp[mode]}">
                <div class="report-image-label">🧍 ${modeLabelsJp[mode]}</div>
                <div class="report-image-sub">${subInfo}</div>
            </div>`;
        } else {
            imageCardsHtml += `
            <div class="report-image-card" style="opacity: 0.4;">
                <div style="aspect-ratio:4/3; background:#0f1c3f; border: 1px dashed rgba(255,255,255,0.2); border-radius:4px; display:flex; align-items:center; justify-content:center; color:var(--text-secondary); font-size:11px;">未測定</div>
                <div class="report-image-label">🧍 ${modeLabelsJp[mode]}</div>
                <div class="report-image-sub">データなし</div>
            </div>`;
        }
    });

    gridHtml += `
    <div class="dash-card report-image-section" style="grid-column: 1 / -1;">
        <div class="report-image-title">📸 静止姿勢アライメント 4方向分析画像</div>
        <div class="report-image-grid">
            ${imageCardsHtml}
        </div>
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

    // Card 5: Specialist customカルテ inputs (Only for Specialist Mode, otherwise shows as Card 6 read-only)
    if (isSpecialist) {
        gridHtml += `
        <div class="dash-card expert-card" style="grid-column: 1 / -1;">
            <h3>📝 専門家・指導者カルテ評価入力（事業者専用）</h3>
            <div class="input-field">
                <label for="expertCommentInput" style="color:var(--accent-orange);">指導者アセスメント・フィードバック</label>
                <textarea id="expertCommentInput" style="width:100%; height:80px; background:#0f1c3f; border:1px solid var(--accent-orange); border-radius:8px; color:white; padding:10px; font-family:inherit; resize:none; outline:none; box-sizing:border-box;">${activeExpertComment}</textarea>
            </div>
            <div class="input-field">
                <label for="expertExercisesInput" style="color:var(--accent-orange);">処方ストレッチ・トレーニングリハビリメニュー</label>
                <textarea id="expertExercisesInput" style="width:100%; height:80px; background:#0f1c3f; border:1px solid var(--accent-orange); border-radius:8px; color:white; padding:10px; font-family:inherit; resize:none; outline:none; box-sizing:border-box;">${activeExpertExercises}</textarea>
            </div>
            <div style="display:flex; justify-content:flex-end; margin-top:10px;">
                <button onclick="saveExpertComment()" class="btn primary-btn" style="background:var(--accent-orange); color:black; font-weight:700;">📋 評価をカルテに保存</button>
            </div>
        </div>`;
    }

    // Card 6 (Full Span): AI Clinical Evaluation Report
    var formattedReport = reportMarkdown
        .replace(/### (.*)/g, '<h2>$1</h2>')
        .replace(/## (.*)/g, '<h2>$1</h2>')
        .replace(/- \*\*(.*?)\*\*:/g, '<li><strong>$1</strong>: ')
        .replace(/- (.*)/g, '<li>$1</li>')
        .replace(/\n\n/g, '<p></p>')
        .replace(/\n/g, '<br>');

    gridHtml += `
    <div class="dash-card ai-eval-card" id="aiEvalCard">
        <h3>🧠 AI 臨床インサイト・アセスメント</h3>
        <div class="ai-eval-box" id="aiEvalContent">
            ${formattedReport}
        </div>
        ${!isSpecialist ? `
        <div style="text-align:center;">
            <button id="bookMentorBtn" class="btn primary-btn" style="background:var(--accent-purple); color:white; width:100%; max-width:400px; margin-top:20px; font-weight:700; box-shadow: 0 4px 15px rgba(138,43,226,0.3);" onclick="document.getElementById('mentorBookingModal').style.display='block'">💬 専門家メンターに個別相談する（有料予約）</button>
        </div>` : ''}
    </div>`;

    grid.innerHTML = gridHtml;
}
window.prepareAndPrintReport = prepareAndPrintReport;



// ==========================================================================
// V2.7.0 App-based Interactive Client Viewer & Seeding
// ==========================================================================

async function seedDemoDataIfEmpty() {
    try {
        var sessions = await dbManager.getAllSessions();
        var hasNewDemo = sessions.some(s => s.id === "demo_connect_town_2026");
        if (hasNewDemo) {
            return; // 既に存在する場合は何もしない
        }
        
        console.log("Seeding lightweight demo data for CONNECT TOWN...");
        var demoSession = {
            id: "demo_connect_town_2026",
            athleteName: "CONNECT TOWN",
            height: 170,
            footSize: 25,
            timestamp: new Date().toISOString(),
            mode: "dyn_squat",
            aiReportText: "【動作解析デモデータ】\n膝の最大屈曲時に骨盤前傾ストレスが発生しています。\n大腿四頭筋（大腿直筋）の緊張を緩和し、骨盤を立てるスクワットを推奨します。",
            measurements: {
                l_side: { pelvicTilt: 4.8 },
                r_side: { pelvicTilt: 4.5 }
            },
            history: []
        };
        
        // ダミーの軌跡フレーム（タイムライン再生用）を生成
        for (var f = 0; f < 60; f++) {
            var ratio = f / 59;
            var squatPhase = (Math.sin(ratio * Math.PI) + 1) / 2; // Squat motion 0..1
            var kneeAngle = squatPhase * 105;
            
            // MediaPipe 座標のダミー
            var kps = [
                { name: "nose", x: 320, y: 120 + squatPhase * 30 },
                { name: "left_ear", x: 310, y: 110 + squatPhase * 30 },
                { name: "right_ear", x: 330, y: 110 + squatPhase * 30 },
                { name: "left_shoulder", x: 290, y: 160 + squatPhase * 30 },
                { name: "right_shoulder", x: 350, y: 160 + squatPhase * 30 },
                { name: "left_hip", x: 295, y: 260 + squatPhase * 15 },
                { name: "right_hip", x: 345, y: 260 + squatPhase * 15 },
                { name: "left_knee", x: 290 - squatPhase * 20, y: 340 + squatPhase * 5 },
                { name: "right_knee", x: 350 + squatPhase * 20, y: 340 + squatPhase * 5 },
                { name: "left_ankle", x: 295, y: 420 },
                { name: "right_ankle", x: 345, y: 420 }
            ];
            
            demoSession.history.push({
                frameIndex: f,
                keypoints: kps,
                timestamp: Date.now() + (f * 33)
            });
        }
        
        await dbManager.saveSession(demoSession);
        console.log("Demo data seed successful!");
        if (typeof window.refreshHistoryList === 'function') {
            window.refreshHistoryList();
        }
    } catch (e) {
        console.error("Error seeding demo data:", e);
    }
}

window.closeFullscreenModal = function() {
    // Legacy support, viewer modal deleted
};

// ==========================================================================
// V2.8.0 WebGL Stealth HUD Core Logic (Three.js integration)
// ==========================================================================
var glCanvas;
var glScene, glCamera, glRenderer;
var glJoints = {};
var glMuscles = [];
var glClock;

var hudWidth = 640;
var hudHeight = 480;

window.initWebGLHUD = function() {
    // Safety check for Three.js loading order
    if (typeof THREE === 'undefined') {
        console.warn("Three.js not loaded yet. Retrying in 500ms...");
        setTimeout(window.initWebGLHUD, 500);
        return;
    }
    
    glCanvas = document.getElementById('webgl-canvas');
    if (!glCanvas) {
        console.warn("webgl-canvas element not found. Retrying in 500ms...");
        setTimeout(window.initWebGLHUD, 500);
        return;
    }
    
    glScene = new THREE.Scene();
    glClock = new THREE.Clock();
    
    // Set up ortho projection matching camera aspect ratios
    glCamera = new THREE.OrthographicCamera(-320, 320, 240, -240, 1, 1000);
    glCamera.position.set(0, 0, 100);
    
    glRenderer = new THREE.WebGLRenderer({ canvas: glCanvas, alpha: true, antialias: true });
    glRenderer.setSize(glCanvas.clientWidth, glCanvas.clientHeight);
    glRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    
    // Auto-adjust WebGL canvas dimensions on window scale
    var resizeObserver = new ResizeObserver(entries => {
        for (let entry of entries) {
            var w = entry.contentRect.width;
            var h = entry.contentRect.height;
            glRenderer.setSize(w, h);
            glCamera.updateProjectionMatrix();
        }
    });
    resizeObserver.observe(glCanvas);
    
    // Lightweight material shaders representing bones & joints
    var jointMat = new THREE.MeshBasicMaterial({ color: 0xcccccc, transparent: true, opacity: 0.6 });
    var sphereGeo = new THREE.SphereGeometry(6, 16, 16);
    
    var jointNames = [
        'nose', 'left_ear', 'right_ear', 
        'left_shoulder', 'right_shoulder', 
        'left_hip', 'right_hip', 
        'left_knee', 'right_knee', 
        'left_ankle', 'right_ankle'
    ];
    
    jointNames.forEach(name => {
        var mesh = new THREE.Mesh(sphereGeo, jointMat);
        mesh.position.set(0, 0, -9999); // Offscreen initially
        glScene.add(mesh);
        glJoints[name] = mesh;
    });
    
    // 3D Cylinder geometries mapping Rectus Femoris, Trapezius and Erector loads
    var cylinderGeo = new THREE.CylinderGeometry(8, 5, 1, 12, 1);
    
    glMuscles = [
        {
            name: 'trapezius_l',
            start: 'left_ear', end: 'left_shoulder',
            mesh: new THREE.Mesh(cylinderGeo, new THREE.MeshBasicMaterial({ color: 0x333333, transparent: true, opacity: 0.3, side: THREE.DoubleSide })),
            barId: 'bar-cervical',
            maxVal: 40
        },
        {
            name: 'rectus_femoris_l',
            start: 'left_hip', end: 'left_knee',
            mesh: new THREE.Mesh(cylinderGeo, new THREE.MeshBasicMaterial({ color: 0x333333, transparent: true, opacity: 0.3, side: THREE.DoubleSide })),
            barId: 'bar-l-knee',
            maxVal: 105
        },
        {
            name: 'rectus_femoris_r',
            start: 'right_hip', end: 'right_knee',
            mesh: new THREE.Mesh(cylinderGeo, new THREE.MeshBasicMaterial({ color: 0x333333, transparent: true, opacity: 0.3, side: THREE.DoubleSide })),
            barId: 'bar-r-knee',
            maxVal: 105
        },
        {
            name: 'erectors',
            start: 'left_shoulder', end: 'left_hip',
            mesh: new THREE.Mesh(cylinderGeo, new THREE.MeshBasicMaterial({ color: 0x333333, transparent: true, opacity: 0.3, side: THREE.DoubleSide })),
            barId: 'bar-pelvic-tilt',
            maxVal: 17.5
        }
    ];
    
    glMuscles.forEach(muscle => {
        glScene.add(muscle.mesh);
    });
    
    requestAnimationFrame(glRenderLoop);
};

function glRenderLoop() {
    if (!glRenderer || !glScene || !glCamera) return;
    requestAnimationFrame(glRenderLoop);
    
    var time = glClock.getElapsedTime();
    
    glMuscles.forEach(m => {
        if (m.isCritical) {
            m.mesh.material.opacity = Math.sin(time * 12) * 0.15 + 0.65;
        } else {
            m.mesh.material.opacity = 0.3;
        }
    });
    
    glRenderer.render(glScene, glCamera);
}

function mapMpToGl(x, y, w, h) {
    // Map MediaPipe X:0..w, Y:0..h coordinates to Ortho -320..320, 240..-240
    var normX = (x / w) * 640;
    var normY = (y / h) * 480;
    var glX = normX - 320;
    var glY = 240 - normY;
    return { x: glX, y: glY };
}

window.updateWebGLPose = function(keypoints, w, h) {
    if (!glScene || !glJoints || !glMuscles || glMuscles.length < 4) return;
    
    hudWidth = w || 640;
    hudHeight = h || 480;

    // Reset visibility if no keypoints provided
    if (!keypoints || keypoints.length === 0) {
        Object.keys(glJoints).forEach(k => glJoints[k].position.set(0, 0, -9999));
        glMuscles.forEach(m => m.mesh.visible = false);
        return;
    }
    
    // 1. Update Joint meshes positions with noise confidence filtering (score >= 0.55)
    var foundKps = {};
    keypoints.forEach(kp => {
        var name = kp.name;
        if (glJoints[name]) {
            if (kp.score !== undefined && kp.score < 0.55) {
                glJoints[name].position.set(0, 0, -9999);
                return;
            }
            var glPos = mapMpToGl(kp.x, kp.y, hudWidth, hudHeight);
            glJoints[name].position.set(glPos.x, glPos.y, 0);
            foundKps[name] = glPos;
        }
    });
    
    // 2. Position cylinder segment muscles connecting joints
    glMuscles.forEach(muscle => {
        var startMesh = glJoints[muscle.start];
        var endMesh = glJoints[muscle.end];
        
        if (startMesh && endMesh && startMesh.position.z > -5000 && endMesh.position.z > -5000) {
            var startPos = startMesh.position;
            var endPos = endMesh.position;
            
            var dir = new THREE.Vector3().subVectors(endPos, startPos);
            var len = dir.length();
            
            muscle.mesh.scale.set(1, len, 1);
            var midPoint = new THREE.Vector3().addVectors(startPos, endPos).multiplyScalar(0.5);
            muscle.mesh.position.copy(midPoint);
            dir.normalize();
            muscle.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
            
            muscle.mesh.visible = true;
        } else {
            muscle.mesh.visible = false;
        }
    });

    // 3. Precision calculations based on joint nodes and dynamic updating
    var getAngle = (a, b, c) => {
        var ab = { x: b.x - a.x, y: b.y - a.y };
        var cb = { x: b.x - c.x, y: b.y - c.y };
        var dot = ab.x * cb.x + ab.y * cb.y;
        var normAB = Math.sqrt(ab.x**2 + ab.y**2);
        var normCB = Math.sqrt(cb.x**2 + cb.y**2);
        if (normAB === 0 || normCB === 0) return 0;
        var angleRad = Math.acos(dot / (normAB * normCB));
        return (angleRad * 180 / Math.PI);
    };

    var valKneeL = 0, valKneeR = 0, valPelvic = 0, valCervical = 0;

    if (foundKps.left_hip && foundKps.left_knee && foundKps.left_ankle) {
        valKneeL = Math.max(0, 180 - getAngle(foundKps.left_hip, foundKps.left_knee, foundKps.left_ankle));
    }
    if (foundKps.right_hip && foundKps.right_knee && foundKps.right_ankle) {
        valKneeR = Math.max(0, 180 - getAngle(foundKps.right_hip, foundKps.right_knee, foundKps.right_ankle));
    }
    if (foundKps.left_shoulder && foundKps.left_hip) {
        valPelvic = estimatedPelvicTilt || 4.8;
    }
    if (foundKps.left_ear && foundKps.left_shoulder) {
        valCervical = pxToCmRatio ? (Math.abs(foundKps.left_ear.x - foundKps.left_shoulder.x) * pxToCmRatio * 10) : 38;
    }

    // Fallbacks for demo sessions
    if (activeSessionId === 'demo_connect_town_2026') {
        var mockSquatPhase = (Math.sin(glClock.getElapsedTime() * 1.5) + 1) / 2;
        valKneeL = mockSquatPhase * 105;
        valKneeR = mockSquatPhase * 105;
        valPelvic = 4.8 + (mockSquatPhase * 12.5);
        valCervical = 25 + (mockSquatPhase * 13.0);
    }

    // Update Monospace Texts
    document.getElementById('val-l-knee').innerText = valKneeL.toFixed(1) + "°";
    document.getElementById('val-r-knee').innerText = valKneeR.toFixed(1) + "°";
    document.getElementById('val-pelvic-tilt').innerText = valPelvic.toFixed(1) + "°";
    document.getElementById('val-cervical').innerText = valCervical.toFixed(0) + " mm";

    // Update Monospace Indicator bar widths
    document.getElementById('bar-l-knee').style.width = Math.min(100, (valKneeL / 105) * 100) + "%";
    document.getElementById('bar-r-knee').style.width = Math.min(100, (valKneeR / 105) * 100) + "%";
    document.getElementById('bar-pelvic-tilt').style.width = Math.min(100, (valPelvic / 17.5) * 100) + "%";
    document.getElementById('bar-cervical').style.width = Math.min(100, (valCervical / 40) * 100) + "%";

    // 4. Color logic transitions
    var updateColors = (muscleIndex, ratio) => {
        var m = glMuscles[muscleIndex];
        var color = new THREE.Color();
        var bar = document.getElementById(m.barId);
        
        if (ratio < 0.3) {
            color.setHex(0x333333);
            m.isCritical = false;
            bar.style.backgroundColor = '#333333';
        } else if (ratio < 0.8) {
            var sub = (ratio - 0.3) / 0.5;
            color.lerpColors(new THREE.Color(0x333333), new THREE.Color(0xffaa00), sub);
            m.isCritical = false;
            bar.style.backgroundColor = '#ffaa00';
        } else {
            var sub = (ratio - 0.8) / 0.2;
            color.lerpColors(new THREE.Color(0xffaa00), new THREE.Color(0xff3c00), sub);
            m.isCritical = true;
            bar.style.backgroundColor = '#ff3c00';
        }
        m.mesh.material.color.copy(color);
    };

    updateColors(0, valCervical / 40);
    updateColors(1, valKneeL / 105);
    updateColors(2, valKneeR / 105);
    updateColors(3, valPelvic / 17.5);
};

// Auto initialize on startup
setTimeout(() => {
    window.initWebGLHUD();
    
    // Bind toggle drawer button for mobile/tablet HUD
    var toggleBtn = document.getElementById('toggleAnalyticsBtn');
    var analyticsArea = document.getElementById('analyticsArea');
    if (toggleBtn && analyticsArea) {
        toggleBtn.onclick = function(e) {
            e.stopPropagation();
            analyticsArea.classList.toggle('analytics-open');
            if (analyticsArea.classList.contains('analytics-open')) {
                toggleBtn.innerText = "✖ 閉じる";
                toggleBtn.style.borderColor = "var(--accent-red)";
                toggleBtn.style.color = "var(--accent-red)";
            } else {
                toggleBtn.innerText = "📊 動作データ";
                toggleBtn.style.borderColor = "var(--accent-teal)";
                toggleBtn.style.color = "var(--accent-teal)";
            }
        };
        
        // Tap outside drawer to close
        document.addEventListener('click', function(e) {
            if (analyticsArea.classList.contains('analytics-open') && !analyticsArea.contains(e.target) && e.target !== toggleBtn) {
                analyticsArea.classList.remove('analytics-open');
                toggleBtn.innerText = "📊 動作データ";
                toggleBtn.style.borderColor = "var(--accent-teal)";
                toggleBtn.style.color = "var(--accent-teal)";
            }
        });
    }
    
    seedDemoDataIfEmpty();
}, 2000);
