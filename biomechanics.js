/**
 * CONNECT AI - Biomechanics Drawing & Calculation Engine
 * Contains all mathematical calculations, drawing logic, skeleton connections,
 * Kendall posture alignment, weight-bearing, dynamic movement analyses,
 * and Center of Pressure (COP) sway radar.
 */

var biomechanics = {
    // MediaPipe BlazePose Connections
    skeletonConnections: [
        [11, 12], // shoulder to shoulder
        [23, 24], // hip to hip
        [11, 23], // left shoulder to left hip
        [12, 24], // right shoulder to right hip
        // Left arm
        [11, 13], [13, 15],
        // Right arm
        [12, 14], [14, 16],
        // Left leg
        [23, 25], [25, 27], [27, 29], [29, 31], [31, 27],
        // Right leg
        [24, 26], [26, 28], [28, 30], [30, 32], [32, 28]
    ],

    /**
     * Draws the complete skeleton on the canvas.
     */
    drawSkeleton: function(ctx, kps, color = '#ff5252') {
        if (!kps) return;
        
        ctx.save();
        // Draw connection lines
        ctx.strokeStyle = color;
        ctx.lineWidth = 4;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        this.skeletonConnections.forEach(([p1, p2]) => {
            var kp1 = kps[p1];
            var kp2 = kps[p2];
            if (kp1 && kp2 && kp1.score > 0.3 && kp2.score > 0.3) {
                ctx.beginPath();
                ctx.moveTo(kp1.x, kp1.y);
                ctx.lineTo(kp2.x, kp2.y);
                ctx.stroke();
            }
        });

        // Draw virtual ASIS lines if they exist
        var asisL = kps.find(k => k.name === 'virtual_asis_l');
        var asisR = kps.find(k => k.name === 'virtual_asis_r');
        var lHip = kps[23];
        var rHip = kps[24];
        if (asisL && asisR) {
            // Draw ASIS line
            ctx.strokeStyle = '#673ab7'; // Purple for ASIS
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(asisL.x, asisL.y);
            ctx.lineTo(asisR.x, asisR.y);
            ctx.stroke();

            // Link ASIS to respective hips
            if (lHip) {
                ctx.beginPath(); ctx.moveTo(lHip.x, lHip.y); ctx.lineTo(asisL.x, asisL.y); ctx.stroke();
            }
            if (rHip) {
                ctx.beginPath(); ctx.moveTo(rHip.x, rHip.y); ctx.lineTo(asisR.x, asisR.y); ctx.stroke();
            }
        }

        // Draw joints
        kps.forEach((kp, idx) => {
            if (kp && kp.score > 0.3 && idx < 33) {
                ctx.fillStyle = (idx % 2 === 0) ? '#00bfff' : '#ff9100'; // Cyan/Orange joints
                ctx.beginPath();
                ctx.arc(kp.x, kp.y, 6, 0, 2 * Math.PI);
                ctx.fill();
                
                // Outline
                ctx.strokeStyle = '#fff';
                ctx.lineWidth = 1.5;
                ctx.stroke();
            }
        });

        // Draw virtual ASIS nodes
        [asisL, asisR].forEach(asis => {
            if (asis) {
                ctx.fillStyle = '#ffeb3b'; // Yellow for virtual points
                ctx.beginPath();
                ctx.arc(asis.x, asis.y, 7, 0, 2 * Math.PI);
                ctx.fill();
                ctx.strokeStyle = '#000';
                ctx.lineWidth = 2;
                ctx.stroke();
            }
        });

        ctx.restore();
    },

    /**
     * Draws center vertical/horizontal grids.
     */
    drawCenterGrid: function(ctx, canvas) {
        ctx.save();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
        ctx.lineWidth = 1;
        ctx.setLineDash([5, 10]);
        
        // Vertical Center
        ctx.beginPath();
        ctx.moveTo(canvas.width / 2, 0);
        ctx.lineTo(canvas.width / 2, canvas.height);
        ctx.stroke();

        // Horizontal Center
        ctx.beginPath();
        ctx.moveTo(0, canvas.height / 2);
        ctx.lineTo(canvas.width, canvas.height / 2);
        ctx.stroke();
        ctx.restore();
    },

    /**
     * Draws local D-pad touch crosshair for point selection.
     */
    drawCrosshair: function(ctx, point, canvas) {
        ctx.save();
        ctx.strokeStyle = '#ffeb3b';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        // Horiz line
        ctx.moveTo(0, point.y); ctx.lineTo(canvas.width, point.y);
        // Vert line
        ctx.moveTo(point.x, 0); ctx.lineTo(point.x, canvas.height);
        ctx.stroke();
        ctx.restore();
    },

    /**
     * Computes Kendall plumbline and sagittal spinal offsets.
     */
    drawKendallAlignment: function(ctx, kps, pxToCmRatio, footSize, estimatedPelvicTilt, currentTab, canvasWidth, canvasHeight) {
        if (currentTab !== 'l_side' && currentTab !== 'r_side') return;
        var isLeft = currentTab === 'l_side';
        var dir = isLeft ? -1 : 1; 

        var ear = isLeft ? kps[7] : kps[8]; // Ear index
        var sh = isLeft ? kps[11] : kps[12]; // Shoulder index
        var hip = isLeft ? kps[23] : kps[24]; // Hip index
        var ankle = isLeft ? kps[27] : kps[28]; // Ankle index

        var targetAnkle = ankle && ankle.score > 0.1 ? ankle : null;
        if (!targetAnkle) {
            var heel = isLeft ? kps[29] : kps[30];
            if (heel && heel.score > 0.1) targetAnkle = heel;
        }
        
        if (!ear || !sh || !hip || !targetAnkle || ear.score < 0.1 || sh.score < 0.1 || hip.score < 0.1) return;

        var ratio = pxToCmRatio || 0.15;
        var footCm = footSize || 25;
        
        // Plumbline falls slightly anterior to the lateral malleolus (外果の約15%前方)
        var plumbOffsetPx = (footCm * 0.15) / ratio;
        var plumbX = targetAnkle.x + (dir * plumbOffsetPx);

        // Draw plumb line
        ctx.save();
        ctx.strokeStyle = 'rgba(57, 255, 20, 0.8)'; // Lime green plumbline
        ctx.lineWidth = 2.5;
        ctx.beginPath(); 
        ctx.moveTo(plumbX, 0); 
        ctx.lineTo(plumbX, canvasHeight); 
        ctx.stroke();

        // Calculate anatomical alignment points relative to the plumbline
        // C2: 頸椎 (ear x coordinate back translation)
        var c2 = { x: ear.x - (dir * (1.0 / ratio)), y: ear.y + (2.0 / ratio), name: "C2 (頸椎)", d0: 1.5 };
        // Th3: 胸椎 (shoulder x coordinate)
        var th3 = { x: sh.x, y: sh.y, name: "Th3 (胸椎)", d0: 1.0 };
        
        // S2: 仙骨 (computed using hip coordinate, shifted back based on pelvic tilt)
        var tiltRad = estimatedPelvicTilt * (Math.PI / 180);
        var s2OffsetZ = 3.0 / ratio;
        var s2OffsetY = 2.0 / ratio;
        var s2X = hip.x - (dir * (s2OffsetZ * Math.cos(tiltRad) - s2OffsetY * Math.sin(tiltRad)));
        var s2Y = hip.y + (s2OffsetZ * Math.sin(tiltRad) + s2OffsetY * Math.cos(tiltRad));
        var s2 = { x: s2X, y: s2Y, name: "S2 (仙骨)", d0: 1.0 };
        
        // L3: 腰椎 (computed using spinal depth curve offset by pelvic tilt)
        var lumbarDepth = (3.0 + (estimatedPelvicTilt * 0.1)) / ratio;
        var l3Y = s2.y - ((s2.y - sh.y) * 0.3);
        var l3X = s2.x + (dir * lumbarDepth);
        var l3 = { x: l3X, y: l3Y, name: "L3 (腰椎)", d0: 2.0 };
        
        // Th11: 胸腰移行部
        var th11Y = s2.y - ((s2.y - sh.y) * 0.65);
        var th11X = s2.x + (dir * (0.8 / ratio));
        var th11 = { x: th11X, y: th11Y, name: "Th11 (胸腰移行)", d0: 1.2 };

        var spinalPoints = [c2, th3, th11, l3, s2];

        // Draw spinal markers
        spinalPoints.forEach(pt => {
            var diffPx = pt.x - plumbX;
            var diffCm = diffPx * ratio * dir; // positive is forward alignment, negative is backward
            
            // Draw marker
            ctx.fillStyle = '#ffeb3b';
            ctx.beginPath();
            ctx.arc(pt.x, pt.y, 6, 0, 2*Math.PI);
            ctx.fill();
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 1.5;
            ctx.stroke();

            // Link line to plumbline
            ctx.strokeStyle = 'rgba(255, 235, 59, 0.4)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(pt.x, pt.y);
            ctx.lineTo(plumbX, pt.y);
            ctx.stroke();

            // Render offset labels
            ctx.fillStyle = '#deff9a';
            ctx.font = 'bold 12px sans-serif';
            ctx.textAlign = isLeft ? 'right' : 'left';
            var textX = pt.x + (dir * 12);
            var labelText = `${pt.name}: ${diffCm > 0 ? '+' : ''}${diffCm.toFixed(1)}cm`;
            ctx.fillText(labelText, textX, pt.y + 4);
        });

        // Compute posture classification
        var c2Offset = (c2.x - plumbX) * ratio * dir;
        var th3Offset = (th3.x - plumbX) * ratio * dir;
        var s2Offset = (s2.x - plumbX) * ratio * dir;

        var postureClass = "アライメント計測中...";
        var textColor = "#fff";
        
        // Kendall Classification Algorithm
        if (s2Offset < -3.0 && th3Offset > 2.0) {
            postureClass = "⚠️ スウェイバック (Sway Back)";
            textColor = "#ff5252";
        } else if (s2Offset > 2.5 && th3Offset > 2.5) {
            postureClass = "⚠️ カイホシス・ロードシス (Kyphosis-Lordosis)";
            textColor = "#ff9100";
        } else if (Math.abs(s2Offset) < 2.0 && th3Offset > 3.0) {
            postureClass = "⚠️ 円背（Thoracic Kyphosis）";
            textColor = "#ff9100";
        } else if (s2Offset < -2.0 && Math.abs(th3Offset) < 2.0) {
            postureClass = "⚠️ 平背 (Flat Back)";
            textColor = "#ffc107";
        } else if (Math.abs(s2Offset) < 2.5 && Math.abs(th3Offset) < 2.5 && Math.abs(c2Offset) < 3.0) {
            postureClass = "✅ ニュートラル (Neutral Posture)";
            textColor = "#39ff14";
        } else {
            postureClass = "軽微なアライメント偏位 (Minor Deviation)";
            textColor = "#ffeb3b";
        }

        // Draw HUD overlay in bottom right
        ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
        ctx.fillRect(canvasWidth - 320, canvasHeight - 95, 305, 80);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.lineWidth = 1;
        ctx.strokeRect(canvasWidth - 320, canvasHeight - 95, 305, 80);

        ctx.font = '12px sans-serif';
        ctx.fillStyle = '#aaa';
        ctx.textAlign = 'left';
        ctx.fillText("【ケンダル姿勢アライメント分類】", canvasWidth - 305, canvasHeight - 70);
        
        ctx.font = 'bold 15px sans-serif';
        ctx.fillStyle = textColor;
        ctx.fillText(postureClass, canvasWidth - 305, canvasHeight - 40);

        ctx.restore();
    },

    /**
     * Computes weight bearing and Center of Mass (COM).
     */
    calculateWeightBearing: function(ctx, kps, canvasWidth, canvasHeight) {
        var lAnkle = kps[27], rAnkle = kps[28]; 
        if (!lAnkle || !rAnkle || lAnkle.score < 0.3 || rAnkle.score < 0.3) return null;
        
        var nose = kps[0], lSh = kps[11], rSh = kps[12], lHip = kps[23], rHip = kps[24];
        if (!nose || !lSh || !rSh || !lHip || !rHip) return null;

        var dPx = rAnkle.x - lAnkle.x; 
        if (Math.abs(dPx) < 10) return null;
        
        var centerX = (lAnkle.x + rAnkle.x) / 2;

        // Weight distribution Center of Mass (COM) models
        var upperComX = (nose.x * 0.20) + (((lSh.x + rSh.x) / 2) * 0.80);
        var lowerComX = (lHip.x + rHip.x) / 2;
        var totalComX = (upperComX * 0.6) + (lowerComX * 0.4);

        var calcRatio = (comX) => {
            var pctR = ((comX - lAnkle.x) / dPx) * 100;
            var pctL = 100 - pctR;
            if (pctR < 0) { pctR = 0; pctL = 100; } 
            if (pctR > 100) { pctR = 100; pctL = 0; }
            return { L: pctL, R: pctR };
        };

        var upperRatio = calcRatio(upperComX);
        var lowerRatio = calcRatio(lowerComX);
        var totalRatio = calcRatio(totalComX);

        // Draw HUD
        ctx.save(); 
        ctx.font = "bold 14px sans-serif"; 
        ctx.fillStyle = "rgba(0,0,0,0.8)"; 
        ctx.fillRect(canvasWidth / 2 - 150, canvasHeight - 130, 300, 95);
        ctx.strokeStyle = "rgba(255,255,255,0.1)";
        ctx.strokeRect(canvasWidth / 2 - 150, canvasHeight - 130, 300, 95);
        ctx.textAlign = "center";
        
        ctx.fillStyle = Math.abs(totalRatio.L - 50) > 5 ? "#ff5252" : "#39ff14"; 
        ctx.fillText(`【全身荷重】 左: ${totalRatio.L.toFixed(1)}% | 右: ${totalRatio.R.toFixed(1)}%`, canvasWidth/2, canvasHeight - 105);
        
        ctx.fillStyle = Math.abs(upperRatio.L - 50) > 5 ? "#ff9100" : "#fff"; 
        ctx.fillText(`上半身偏位 左: ${upperRatio.L.toFixed(1)}% | 右: ${upperRatio.R.toFixed(1)}%`, canvasWidth/2, canvasHeight - 78);

        ctx.fillStyle = Math.abs(lowerRatio.L - 50) > 5 ? "#ff9100" : "#fff"; 
        ctx.fillText(`下半身偏位 左: ${lowerRatio.L.toFixed(1)}% | 右: ${lowerRatio.R.toFixed(1)}%`, canvasWidth/2, canvasHeight - 53);

        // Draw COM indicator lines
        ctx.strokeStyle = "rgba(255,255,255,0.3)"; 
        ctx.setLineDash([5,5]); 
        ctx.beginPath(); 
        ctx.moveTo(centerX, 0); 
        ctx.lineTo(centerX, canvasHeight); 
        ctx.stroke(); 
        ctx.setLineDash([]);

        // Upper body COM dot
        ctx.fillStyle = "#ff9100"; 
        ctx.beginPath(); 
        ctx.arc(upperComX, (lSh.y + rSh.y)/2, 6, 0, 2*Math.PI); 
        ctx.fill();

        // Lower body COM dot
        ctx.fillStyle = "#ff9100"; 
        ctx.beginPath(); 
        ctx.arc(lowerComX, (lHip.y + rHip.y)/2, 6, 0, 2*Math.PI); 
        ctx.fill();

        // Total body COM indicator (Yellow target symbol)
        ctx.fillStyle = "#ffeb3b"; 
        ctx.strokeStyle = "#000"; 
        ctx.lineWidth = 2.5; 
        ctx.beginPath(); 
        ctx.arc(totalComX, (lAnkle.y + rAnkle.y)/2 - 15, 9, 0, 2*Math.PI); 
        ctx.fill(); 
        ctx.stroke(); 

        ctx.restore();
        return totalRatio;
    },

    /**
     * Dynamic OHS Front Knee alignment analysis.
     */
    drawOHSFrontAnalysis: function(ctx, kps) {
        var evaluateSide = (hIdx, kIdx, aIdx, label) => {
            var h = kps[hIdx], k = kps[kIdx], a = kps[aIdx]; 
            if (!h || !k || !a || h.score < 0.3 || k.score < 0.3 || a.score < 0.3) return;
            
            // Reference line from Hip to Ankle
            var refX = h.x + (a.x - h.x) * ((k.y - h.y) / (a.y - h.y));
            // Knee flexion angle
            var angle = Math.abs(180 - Math.abs(Math.atan2(a.y-k.y, a.x-k.x) - Math.atan2(h.y-k.y, h.x-k.x)) * 180 / Math.PI);
            
            if (angle > 2.0) {
                var isIn = label === 'R' ? k.x > refX : k.x < refX;
                ctx.fillStyle = isIn ? "#ff5252" : "#ff9100"; // Red for valgus (in), Orange for varus (out)
                ctx.fillText((isIn ? "ニーイン " : "ニーアウト ") + angle.toFixed(1) + "°", k.x + (label === 'R' ? -130 : 25), k.y + 4);
            }
        };
        ctx.save(); 
        ctx.font = "bold 15px sans-serif"; 
        evaluateSide(24, 26, 28, 'R'); 
        evaluateSide(23, 25, 27, 'L'); 
        ctx.restore();
    },

    /**
     * Dynamic OHS Side alignment analysis.
     */
    drawOHSSideAnalysis: function(ctx, kps) {
        var lS = kps[11], lH = kps[23], lK = kps[25], lA = kps[27], lW = kps[15];
        var rS = kps[12], rH = kps[24], rK = kps[26], rA = kps[28], rW = kps[16];
        // Focus on the side facing the camera (higher coordinate score)
        var isLeftActive = (lS && rS && lS.score > rS.score);
        var s = isLeftActive ? lS : rS;
        var h = isLeftActive ? lH : rH;
        var k = isLeftActive ? lK : rK;
        var a = isLeftActive ? lA : rA;
        var w = isLeftActive ? lW : rW;

        if (!s || !h || !k || !a || s.score < 0.3 || h.score < 0.3 || k.score < 0.3) return;

        // Trunk inclination from vertical
        var trunkLean = Math.abs(Math.atan2(s.x - h.x, h.y - s.y) * 180 / Math.PI);
        // Knee flexion angle
        var kneeAng = Math.abs((Math.atan2(a.y-k.y, a.x-k.x) - Math.atan2(h.y-k.y, h.x-k.x)) * 180 / Math.PI);
        if (kneeAng > 180) kneeAng = 360 - kneeAng;
        
        ctx.save(); 
        ctx.font = "bold 15px sans-serif";
        
        // Draw trunk lean status
        ctx.fillStyle = trunkLean > 45 ? "#ff5252" : "#39ff14"; 
        ctx.fillText("体幹前傾: " + trunkLean.toFixed(1) + "°", s.x - 30, s.y - 30);
        
        // Draw knee flexion status
        ctx.fillStyle = "#00bfff"; 
        ctx.fillText("膝屈曲: " + kneeAng.toFixed(1) + "°", k.x + 25, k.y + 4);
        
        // Draw arm alignment relative to trunk
        if (w && w.score > 0.3) {
            var armAng = Math.abs((Math.atan2(w.y-s.y, w.x-s.x) - Math.atan2(h.y-s.y, h.x-s.x)) * 180 / Math.PI);
            if (armAng > 180) armAng = 360 - armAng;
            ctx.fillStyle = armAng < 155 ? "#ff5252" : "#39ff14"; 
            ctx.fillText("挙上制限: " + armAng.toFixed(1) + "°", s.x + 40, s.y + 20);
            
            ctx.strokeStyle = "rgba(255,255,255,0.4)"; 
            ctx.lineWidth = 2;
            ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(w.x, w.y); ctx.stroke();
        } 
        ctx.restore();
    },

    /**
     * Stand forward/backward bend flexion analysis.
     */
    drawFlexionAnalysis: function(ctx, kps, mode) {
        var lS = kps[11], lH = kps[23], lK = kps[25], rS = kps[12], rH = kps[24], rK = kps[26];
        var isLeft = (lS && rS && lS.score > rS.score);
        var s = isLeft ? lS : rS;
        var h = isLeft ? lH : rH;
        var k = isLeft ? lK : rK;
        if (!s || !h || !k || s.score < 0.3 || h.score < 0.3) return;

        // Hip flexion angle
        var hipFlexion = Math.abs(Math.atan2(s.y-h.y, s.x-h.x) - Math.atan2(k.y-h.y, k.x-h.x)) * 180 / Math.PI;
        if (hipFlexion > 180) hipFlexion = 360 - hipFlexion;

        ctx.save();
        ctx.font = "bold 16px sans-serif";
        ctx.fillStyle = "#39ff14";
        var labelText = mode === "dyn_flex_fwd" ? `前屈(股関節屈曲): ${hipFlexion.toFixed(1)}°` : `後屈(股関節伸展): ${hipFlexion.toFixed(1)}°`;
        ctx.fillText(labelText, h.x + 30, h.y - 10);
        ctx.restore();
    },

    /**
     * Shoulder composite mobility analysis.
     */
    drawShoulderAnalysis: function(ctx, kps, mode) {
        var lSh = kps[11], rSh = kps[12], lEl = kps[13], rEl = kps[14], lWr = kps[15], rWr = kps[16];
        var isRightUp = (mode === "dyn_shoulder_r");
        var upWr = isRightUp ? rWr : lWr;
        var loWr = isRightUp ? lWr : rWr;

        if (!upWr || !loWr || upWr.score < 0.3 || loWr.score < 0.3) return;

        // Draw distance line between wrists
        ctx.save();
        ctx.strokeStyle = "#ffeb3b";
        ctx.lineWidth = 3;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.moveTo(upWr.x, upWr.y);
        ctx.lineTo(loWr.x, loWr.y);
        ctx.stroke();
        ctx.setLineDash([]);

        var distPx = Math.hypot(upWr.x - loWr.x, upWr.y - loWr.y);
        ctx.fillStyle = "#ffeb3b";
        ctx.font = "bold 16px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(`手関節間距離: ${distPx.toFixed(1)} px`, (upWr.x + loWr.x)/2, (upWr.y + loWr.y)/2 - 15);
        ctx.restore();
    },

    /**
     * Draws the background grids and circles for the COP Radar.
     */
    clearRadar: function(ctx, color = "#ff5252") {
        var w = 150, h = 150;
        ctx.clearRect(0, 0, w, h);
        
        // Draw circular grid layers
        ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
        ctx.lineWidth = 1;
        [25, 50, 75].forEach(r => {
            ctx.beginPath();
            ctx.arc(w/2, h/2, r, 0, 2*Math.PI);
            ctx.stroke();
        });

        // Draw cross lines
        ctx.beginPath();
        ctx.moveTo(w/2, 0); ctx.lineTo(w/2, h);
        ctx.moveTo(0, h/2); ctx.lineTo(w, h/2);
        ctx.stroke();
    },

    /**
     * Draws the 95% confidence ellipse on the radar canvas based on coordinate history.
     */
    drawSwayEllipse: function(ctx, history, color = "#ff5252") {
        if (history.length < 5) return;
        var w = 150, h = 150;
        
        // Calculate average
        var sumX = 0, sumY = 0;
        history.forEach(p => { sumX += p.x; sumY += p.y; });
        var avgX = sumX / history.length;
        var avgY = sumY / history.length;

        // Calculate variance and covariance
        var varX = 0, varY = 0, covXY = 0;
        history.forEach(p => {
            var diffX = p.x - avgX;
            var diffY = p.y - avgY;
            varX += diffX * diffX;
            varY += diffY * diffY;
            covXY += diffX * diffY;
        });
        var N = history.length;
        varX /= N;
        varY /= N;
        covXY /= N;

        // Calculate eigenvalues for ellipse axes
        // Trace and determinant of covariance matrix
        var tr = varX + varY;
        var det = varX * varY - covXY * covXY;
        
        // Eigenvalues lambda_1, lambda_2 = (tr +- sqrt(tr^2 - 4 * det)) / 2
        var term = Math.sqrt(Math.max(0, tr * tr - 4 * det));
        var lambda1 = (tr + term) / 2;
        var lambda2 = (tr - term) / 2;

        // Axis radii (using 2.447 standard deviations for 95% confidence ellipse)
        var scale = 2.447;
        var rX = scale * Math.sqrt(Math.max(0, lambda1));
        var rY = scale * Math.sqrt(Math.max(0, lambda2));

        // Angle of rotation (primary eigenvector angle)
        var angle = 0;
        if (covXY !== 0) {
            angle = 0.5 * Math.atan2(2 * covXY, varX - varY);
        } else if (varX < varY) {
            angle = Math.PI / 2;
        }

        // Draw ellipse
        ctx.save();
        ctx.translate(w/2 + avgX, h/2 + avgY);
        ctx.rotate(angle);
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        // Limit maximum size on display radar (max radius 70px)
        ctx.ellipse(0, 0, Math.min(70, rX), Math.min(70, rY), 0, 0, 2*Math.PI);
        ctx.stroke();

        // Fill transparent color
        ctx.fillStyle = color === "#ff5252" ? "rgba(255, 82, 82, 0.1)" : "rgba(57, 255, 20, 0.1)";
        ctx.fill();
        ctx.restore();
    },

    /**
     * Appends COP position and redraws radar with sway path.
     */
    updateRadar: function(kps, canvasRadar, ctxRadar, swayHistory, isRecording, color = "#ff5252") {
        var lAnkle = kps[27], rAnkle = kps[28];
        if (!lAnkle || !rAnkle || lAnkle.score < 0.3 || rAnkle.score < 0.3) return;

        var nose = kps[0], lSh = kps[11], rSh = kps[12], lHip = kps[23], rHip = kps[24];
        if (!nose || !lSh || !rSh || !lHip || !rHip) return;

        var dPx = rAnkle.x - lAnkle.x;
        if (Math.abs(dPx) < 10) return;

        // Center of mass formula
        var upperComX = (nose.x * 0.20) + (((lSh.x + rSh.x) / 2) * 0.80);
        var lowerComX = (lHip.x + rHip.x) / 2;
        var totalComX = (upperComX * 0.6) + (lowerComX * 0.4);

        // Convert to radar coordinate system (centered, scaled)
        var pctR = ((totalComX - lAnkle.x) / dPx) * 100;
        var rx = (pctR - 50) * 1.8; // scale multiplier
        var ry = (totalComX - (lAnkle.x + rAnkle.x)/2) * 0.5;

        // Append to history
        if (isRecording) {
            swayHistory.push({ x: rx, y: ry });
            // Maintain max historical points
            if (swayHistory.length > 250) swayHistory.shift();
        }

        // Draw radar
        this.clearRadar(ctxRadar, color);
        var w = 150, h = 150;

        // Draw historical sway path line
        if (swayHistory.length > 1) {
            ctxRadar.save();
            ctxRadar.strokeStyle = color === "#ff5252" ? "rgba(255, 82, 82, 0.4)" : "rgba(57, 255, 20, 0.4)";
            ctxRadar.lineWidth = 1.5;
            ctxRadar.beginPath();
            ctxRadar.moveTo(w/2 + swayHistory[0].x, h/2 + swayHistory[0].y);
            for (var i = 1; i < swayHistory.length; i++) {
                ctxRadar.lineTo(w/2 + swayHistory[i].x, h/2 + swayHistory[i].y);
            }
            ctxRadar.stroke();
            ctxRadar.restore();
            
            // Draw ellipse
            this.drawSwayEllipse(ctxRadar, swayHistory, color);
        }

        // Current real-time COP pointer dot
        ctxRadar.save();
        ctxRadar.fillStyle = "#fff";
        ctxRadar.beginPath();
        ctxRadar.arc(w/2 + rx, h/2 + ry, 4.5, 0, 2*Math.PI);
        ctxRadar.fill();
        ctxRadar.strokeStyle = color;
        ctxRadar.lineWidth = 1.5;
        ctxRadar.stroke();
        ctxRadar.restore();
    },

    /**
     * Draws a semi-transparent HSL color-coded muscle polygon (fusiform) and leader label.
     * V2.6.0
     */
    drawMuscleSegment: function(ctx, p1, p2, thickness, type, labelText) {
        ctx.save();
        var dx = p2.x - p1.x;
        var dy = p2.y - p1.y;
        var len = Math.sqrt(dx*dx + dy*dy);
        if (len < 5) { ctx.restore(); return; }
        
        var normalX = -dy / len;
        var normalY = dx / len;
        
        var midX = (p1.x + p2.x) / 2;
        var midY = (p1.y + p2.y) / 2;
        
        ctx.beginPath();
        ctx.moveTo(p1.x + normalX * (thickness * 0.3), p1.y + normalY * (thickness * 0.3));
        ctx.quadraticCurveTo(midX + normalX * thickness, midY + normalY * thickness, p2.x + normalX * (thickness * 0.3), p2.y + normalY * (thickness * 0.3));
        ctx.lineTo(p2.x - normalX * (thickness * 0.3), p2.y - normalY * (thickness * 0.3));
        ctx.quadraticCurveTo(midX - normalX * thickness, midY - normalY * thickness, p1.x - normalX * (thickness * 0.3), p1.y - normalY * (thickness * 0.3));
        ctx.closePath();
        
        if (type === 'tight') {
            ctx.fillStyle = 'rgba(255, 82, 82, 0.28)'; 
            ctx.strokeStyle = 'rgba(255, 82, 82, 0.6)';
        } else if (type === 'weak') {
            ctx.fillStyle = 'rgba(0, 191, 255, 0.25)'; 
            ctx.strokeStyle = 'rgba(0, 191, 255, 0.55)';
        } else {
            ctx.restore(); return; 
        }
        
        ctx.lineWidth = 1.5;
        ctx.fill();
        ctx.stroke();
        
        if (labelText) {
            ctx.beginPath();
            ctx.strokeStyle = type === 'tight' ? 'rgba(255, 82, 82, 0.8)' : 'rgba(0, 191, 255, 0.8)';
            ctx.lineWidth = 1;
            
            var startX = midX + normalX * (thickness * 0.8);
            var startY = midY + normalY * (thickness * 0.8);
            
            var labelDir = dx > 0 ? 1 : -1; 
            if (Math.abs(dx) < 10) labelDir = normalX > 0 ? 1 : -1;
            
            var breakX = startX + labelDir * 40;
            var breakY = startY - 15;
            var endX = breakX + labelDir * 35;
            
            ctx.moveTo(startX, startY);
            ctx.lineTo(breakX, breakY);
            ctx.lineTo(endX, breakY);
            ctx.stroke();
            
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 11px sans-serif';
            ctx.textAlign = labelDir > 0 ? 'left' : 'right';
            ctx.textBaseline = 'bottom';
            ctx.fillText(labelText, breakX + labelDir * 4, breakY - 3);
            
            ctx.fillStyle = type === 'tight' ? '#ff5252' : '#00bfff';
            ctx.font = '9px sans-serif';
            var stateText = type === 'tight' ? '（過緊張）' : '（筋力低下）';
            ctx.fillText(stateText, breakX + labelDir * 4, breakY + 12);
        }
        
        ctx.restore();
    },

    /**
     * Main musculoskeletal visualization pipeline for static 4-direction postures.
     * V2.6.0
     */
    drawMusculoskeletalAnatomy: function(ctx, kps, mode, pxToCmRatio, footSize, pelvicTilt, w, h) {
        if (!kps || !['front', 'back', 'l_side', 'r_side'].includes(mode)) return;
        
        ctx.save();
        
        var nose = kps[0];
        var lSh = kps[11], rSh = kps[12];
        var lHip = kps[23], rHip = kps[24];
        var lKnee = kps[25], rKnee = kps[26];
        var lAnk = kps[27], rAnk = kps[28];
        var ear = (mode === 'l_side') ? kps[7] : kps[8];
        
        if (mode === 'l_side' || mode === 'r_side') {
            var isLeft = mode === 'l_side';
            var sh = isLeft ? lSh : rSh;
            var hip = isLeft ? lHip : rHip;
            var knee = isLeft ? lKnee : rKnee;
            var ank = isLeft ? lAnk : rAnk;
            
            if (ear && sh && hip && knee && ank) {
                var dxEarSh = Math.abs(ear.x - sh.x);
                var cmEarSh = pxToCmRatio ? dxEarSh * pxToCmRatio : dxEarSh * 0.25;
                
                if (cmEarSh >= 2.5) {
                    this.drawMuscleSegment(ctx, sh, ear, 12, 'tight', '板状筋・僧帽筋');
                }
                
                if (pelvicTilt >= 5) {
                    this.drawMuscleSegment(ctx, hip, sh, 16, 'tight', '脊柱起立筋');
                    this.drawMuscleSegment(ctx, hip, knee, 20, 'tight', '大腿直筋');
                    this.drawMuscleSegment(ctx, hip, { x: (sh.x + hip.x)/2 + (isLeft ? -15 : 15), y: (sh.y + hip.y)/2 }, 15, 'weak', '腹直筋');
                    this.drawMuscleSegment(ctx, hip, knee, 18, 'weak', 'ハムストリングス');
                } else if (pelvicTilt <= -3) {
                    this.drawMuscleSegment(ctx, hip, knee, 18, 'tight', 'ハムストリングス');
                    this.drawMuscleSegment(ctx, hip, { x: (sh.x + hip.x)/2 + (isLeft ? -15 : 15), y: (sh.y + hip.y)/2 }, 15, 'tight', '腹直筋');
                    this.drawMuscleSegment(ctx, hip, sh, 16, 'weak', '脊柱起立筋');
                }
                
                var lineX = hip.x + (ank.x - hip.x) * ((knee.y - hip.y) / (ank.y - hip.y));
                var diffKnee = (knee.x - lineX) * (isLeft ? 1 : -1); 
                var cmKnee = pxToCmRatio ? diffKnee * pxToCmRatio : diffKnee * 0.25;
                
                if (cmKnee > 2.0) {
                    this.drawMuscleSegment(ctx, hip, knee, 20, 'tight', '大腿四頭筋');
                    this.drawMuscleSegment(ctx, knee, ank, 16, 'tight', '腓腹筋');
                }
            }
        }
        else if (mode === 'front' || mode === 'back') {
            if (lSh && rSh && lHip && rHip && lKnee && rKnee && lAnk && rAnk) {
                var dySh = lSh.y - rSh.y; 
                var cmSh = pxToCmRatio ? Math.abs(dySh) * pxToCmRatio : Math.abs(dySh) * 0.25;
                
                if (cmSh >= 1.5) {
                    var higherSh = dySh < 0 ? lSh : rSh;
                    var earPoint = dySh < 0 ? kps[7] : kps[8];
                    if (earPoint) {
                        this.drawMuscleSegment(ctx, higherSh, earPoint, 12, 'tight', '僧帽筋');
                    }
                }
                
                var checkKneeIn = function(hip, knee, ank, isLeftLeg) {
                    var lineX = hip.x + (ank.x - hip.x) * ((knee.y - hip.y) / (ank.y - hip.y));
                    var diffX = knee.x - lineX; 
                    var innerDiff = isLeftLeg ? diffX : -diffX;
                    var cmDiff = pxToCmRatio ? innerDiff * pxToCmRatio : innerDiff * 0.25;
                    
                    if (cmDiff > 2.5) {
                        return 'tight';
                    } else if (cmDiff < -2.5) {
                        return 'weak';
                    }
                    return 'normal';
                };
                
                var lKneeState = checkKneeIn(lHip, lKnee, lAnk, true);
                var rKneeState = checkKneeIn(rHip, rKnee, rAnk, false);
                
                if (lKneeState === 'tight') {
                    this.drawMuscleSegment(ctx, lHip, lKnee, 20, 'tight', '内転筋群 (左)');
                } else if (lKneeState === 'weak') {
                    this.drawMuscleSegment(ctx, lHip, lKnee, 18, 'weak', '中臀筋 (左)');
                }
                
                if (rKneeState === 'tight') {
                    this.drawMuscleSegment(ctx, rHip, rKnee, 20, 'tight', '内転筋群 (右)');
                } else if (rKneeState === 'weak') {
                    this.drawMuscleSegment(ctx, rHip, rKnee, 18, 'weak', '中臀筋 (右)');
                }
                
                var dyHip = lHip.y - rHip.y;
                var cmHip = pxToCmRatio ? Math.abs(dyHip) * pxToCmRatio : Math.abs(dyHip) * 0.25;
                if (cmHip >= 1.5) {
                    var higherHip = dyHip < 0 ? lHip : rHip;
                    var higherSh = dyHip < 0 ? lSh : rSh;
                    var lowerHip = dyHip < 0 ? rHip : lHip;
                    var lowerSh = dyHip < 0 ? rSh : lSh;
                    
                    this.drawMuscleSegment(ctx, higherHip, higherSh, 16, 'tight', '腰方形筋');
                    this.drawMuscleSegment(ctx, lowerHip, lowerSh, 16, 'weak', '腹斜筋群');
                }
            }
        }
        
        ctx.restore();
    }
};
