/**
 * CONNECT AI - API & Clinical Report Engine
 * Integrates Google Gemini API for advanced biomechanical clinical reports.
 * Falls back to an offline expert rule-based report if no API key is provided.
 */

var apiManager = {
    /**
     * Generates a clinical report.
     * @param {Object} session - The recorded session data.
     * @param {string} apiKey - The Gemini API key (optional).
     * @returns {Promise<string>} - The clinical report in Markdown format.
     */
    generateReport: async function(session, apiKey) {
        // Prepare biomechanical summaries for the prompt/rules
        var metrics = this.extractMetrics(session);
        var report = "";
        
        if (apiKey && apiKey.trim() !== "") {
            try {
                report = await this.fetchGeminiReport(metrics, apiKey);
            } catch (e) {
                console.error("Gemini API Error, falling back to offline analysis:", e);
                report = this.generateOfflineReport(metrics, "⚠️ [APIエラーによりオフライン生成されました: " + e + "]\n\n");
            }
        } else {
            report = this.generateOfflineReport(metrics);
        }

        // Append expert evaluation if present!
        if (session.expertComment && session.expertComment.trim() !== "") {
            report += `\n\n---\n\n## 👩‍⚕️ 担当専門家・メンターによる評価カルテ\n`;
            report += `**指導者アセスメント**:\n${session.expertComment}\n\n`;
            if (session.expertExercises && session.expertExercises.trim() !== "") {
                report += `**指導者処方リハビリメニュー**:\n${session.expertExercises}\n`;
            }
        }
        return report;
    },

    /**
     * Extracts coordinates, angles, and sway data into a clean analysis structure.
     */
    extractMetrics: function(session) {
        var mode = session.mode;
        var dataPoints = session.poseData || [];
        if (dataPoints.length === 0) return { mode: mode, count: 0 };

        // Basic details
        var result = {
            mode: mode,
            timestamp: session.timestamp,
            height: session.height || 170,
            footSize: session.footSize || 25,
            frameCount: dataPoints.length,
            pelvicTilt: session.pelvicTilt || 0,
            weightBearing: null,
            swayMetrics: null,
            jointAngles: {}
        };

        // Calculate averages or select the representative frame
        // For static, we take the last frame (or average). Let's analyze the last frame as the primary measurement.
        var lastFrame = dataPoints[dataPoints.length - 1];
        var kps = lastFrame.keypoints;

        // Extract weight bearing if applicable (from the last frame or average)
        var lAnkle = kps.find(k=>k.name==='left_ankle'||k.name==='27');
        var rAnkle = kps.find(k=>k.name==='right_ankle'||k.name==='28');
        var nose = kps.find(k=>k.name==='nose'||k.name==='0');
        var lSh = kps.find(k=>k.name==='left_shoulder'||k.name==='11');
        var rSh = kps.find(k=>k.name==='right_shoulder'||k.name==='12');
        var lHip = kps.find(k=>k.name==='left_hip'||k.name==='23');
        var rHip = kps.find(k=>k.name==='right_hip'||k.name==='24');

        if (lAnkle && rAnkle && lAnkle.score > 0.3 && rAnkle.score > 0.3) {
            var dPx = rAnkle.x - lAnkle.x;
            if (Math.abs(dPx) > 5) {
                var upperComX = (nose.x * 0.20) + (((lSh.x + rSh.x) / 2) * 0.80);
                var lowerComX = (lHip.x + rHip.x) / 2;
                var totalComX = (upperComX * 0.6) + (lowerComX * 0.4);

                var calcPct = (comX) => {
                    var pctR = ((comX - lAnkle.x) / dPx) * 100;
                    var pctL = 100 - pctR;
                    return { L: Math.max(0, Math.min(100, pctL)), R: Math.max(0, Math.min(100, pctR)) };
                };
                result.weightBearing = {
                    total: calcPct(totalComX),
                    upper: calcPct(upperComX),
                    lower: calcPct(lowerComX)
                };
            }
        }

        // Calculate dynamic specific parameters
        if (mode === 'dyn_overhead') {
            // Knee Valgus/Varus (knee-in/out)
            var calcAngle = (a, b, c) => {
                var ang = Math.abs(Math.atan2(c.y-b.y, c.x-b.x) - Math.atan2(a.y-b.y, a.x-b.x)) * 180 / Math.PI;
                return ang > 180 ? 360 - ang : ang;
            };
            var lKnee = kps.find(k=>k.name==='left_knee'||k.name==='25');
            var rKnee = kps.find(k=>k.name==='right_knee'||k.name==='26');
            if (lHip && lKnee && lAnkle) result.jointAngles.leftKneeAngle = calcAngle(lHip, lKnee, lAnkle);
            if (rHip && rKnee && rAnkle) result.jointAngles.rightKneeAngle = calcAngle(rHip, rKnee, rAnkle);
        } else if (mode === 'dyn_overhead_side') {
            var lKnee = kps.find(k=>k.name==='left_knee'||k.name==='25');
            var rKnee = kps.find(k=>k.name==='right_knee'||k.name==='26');
            var lWrist = kps.find(k=>k.name==='left_wrist'||k.name==='15');
            var rWrist = kps.find(k=>k.name==='right_wrist'||k.name==='16');
            var isLeft = (lSh && rSh && lSh.score > rSh.score);
            var s = isLeft ? lSh : rSh, h = isLeft ? lHip : rHip, k = isLeft ? lKnee : rKnee, a = isLeft ? lAnkle : rAnkle, w = isLeft ? lWrist : rWrist;
            
            if (s && h && k && a) {
                var trunkLean = Math.abs(Math.atan2(s.x - h.x, h.y - s.y) * 180 / Math.PI);
                var kneeAng = Math.abs((Math.atan2(a.y-k.y, a.x-k.x) - Math.atan2(h.y-k.y, h.x-k.x)) * 180 / Math.PI);
                if(kneeAng > 180) kneeAng = 360 - kneeAng;
                result.jointAngles.trunkLean = trunkLean;
                result.jointAngles.kneeFlexion = kneeAng;

                if (w && w.score > 0.3) {
                    var armAng = Math.abs((Math.atan2(w.y-s.y, w.x-s.x) - Math.atan2(h.y-s.y, h.x-s.x)) * 180 / Math.PI);
                    if(armAng > 180) armAng = 360 - armAng;
                    result.jointAngles.shoulderArmAngle = armAng;
                }
            }
        } else if (mode.startsWith('dyn_flex_')) {
            var lKnee = kps.find(k=>k.name==='left_knee'||k.name==='25');
            var isLeft = (lSh && rSh && lSh.score > rSh.score);
            var s = isLeft ? lSh : rSh, h = isLeft ? lHip : rHip, k = isLeft ? lKnee : rKnee;
            if (s && h && k) {
                var hipFlexion = Math.abs(Math.atan2(s.y-h.y, s.x-h.x) - Math.atan2(k.y-h.y, k.x-h.x)) * 180 / Math.PI;
                if(hipFlexion > 180) hipFlexion = 360 - hipFlexion;
                result.jointAngles.hipFlexion = hipFlexion;
            }
        }

        // Calculate COP Sway Metrics if there are multiple frames
        if (dataPoints.length > 5) {
            var copHistory = [];
            dataPoints.forEach(frame => {
                var fkps = frame.keypoints;
                var flAnkle = fkps.find(k=>k.name==='left_ankle'||k.name==='27');
                var frAnkle = fkps.find(k=>k.name==='right_ankle'||k.name==='28');
                var fnose = fkps.find(k=>k.name==='nose'||k.name==='0');
                var flSh = fkps.find(k=>k.name==='left_shoulder'||k.name==='11');
                var frSh = fkps.find(k=>k.name==='right_shoulder'||k.name==='12');
                var flHip = fkps.find(k=>k.name==='left_hip'||k.name==='23');
                var frHip = fkps.find(k=>k.name==='right_hip'||k.name==='24');

                if (flAnkle && frAnkle && flAnkle.score > 0.3 && frAnkle.score > 0.3) {
                    var dPx = frAnkle.x - flAnkle.x;
                    if (Math.abs(dPx) > 5) {
                        var upperComX = (fnose.x * 0.20) + (((flSh.x + frSh.x) / 2) * 0.80);
                        var lowerComX = (flHip.x + frHip.x) / 2;
                        var totalComX = (upperComX * 0.6) + (lowerComX * 0.4);
                        var pctR = ((totalComX - flAnkle.x) / dPx) * 100;
                        
                        // Represent COP as (x_percent, y_offset)
                        var pctY = (totalComX - (flAnkle.x + frAnkle.x)/2); // sway lateral dev
                        copHistory.push({ x: pctR - 50, y: pctY });
                    }
                }
            });

            if (copHistory.length > 0) {
                var sumX = 0, sumY = 0;
                copHistory.forEach(p => { sumX += p.x; sumY += p.y; });
                var avgX = sumX / copHistory.length;
                var avgY = sumY / copHistory.length;

                // Simple path length calculation (standard deviation approximation)
                var pathLength = 0;
                for (var i = 1; i < copHistory.length; i++) {
                    pathLength += Math.hypot(copHistory[i].x - copHistory[i-1].x, copHistory[i].y - copHistory[i-1].y);
                }

                // Variance
                var varX = 0, varY = 0;
                copHistory.forEach(p => {
                    varX += Math.pow(p.x - avgX, 2);
                    varY += Math.pow(p.y - avgY, 2);
                });
                var stdX = Math.sqrt(varX / copHistory.length);
                var stdY = Math.sqrt(varY / copHistory.length);
                
                // Sway area: approximate 95% Confidence Ellipse area (pi * 2 * stdX * 2 * stdY)
                var swayArea = Math.PI * 2 * stdX * 2 * stdY;

                result.swayMetrics = {
                    avgDeviationX: avgX, // % dev from center
                    swayArea: swayArea,
                    pathLength: pathLength,
                    swaySpeed: pathLength / (session.poseData.length * 0.1) // pixels/sec (assuming ~10fps)
                };
            }
        }

        return result;
    },

    /**
     * Call the Gemini API.
     */
    fetchGeminiReport: async function(metrics, apiKey) {
        var model = "gemini-2.5-flash";
        var url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

        var prompt = `あなたは理学療法士、バイオメカニクス研究者、およびAI臨床姿勢分析の専門家です。
以下の姿勢・動作計測データに基づいて、極めて詳細で専門的な臨床バイオメカニクス評価レポートを日本語で作成してください。

【計測データ】
- 測定項目: ${metrics.mode} (${this.getModeNameJp(metrics.mode)})
- 被測定者の身長: ${metrics.height} cm
- 被測定者の足サイズ: ${metrics.footSize} cm
- 骨盤傾斜角 (手動補正): ${metrics.pelvicTilt} 度
- 総計測フレーム数: ${metrics.frameCount}

${metrics.weightBearing ? `- 左右荷重比率: 
  - 全身: 左 ${metrics.weightBearing.total.L.toFixed(1)}% | 右 ${metrics.weightBearing.total.R.toFixed(1)}%
  - 上半身偏位: 左 ${metrics.weightBearing.upper.L.toFixed(1)}% | 右 ${metrics.weightBearing.upper.R.toFixed(1)}%
  - 下半身偏位: 左 ${metrics.weightBearing.lower.L.toFixed(1)}% | 右 ${metrics.weightBearing.lower.R.toFixed(1)}%` : ""}

${metrics.swayMetrics ? `- 足底圧中心 (COP) 重心動揺データ:
  - 左右の平均偏位: ${metrics.swayMetrics.avgDeviationX.toFixed(2)} % (${metrics.swayMetrics.avgDeviationX > 0 ? "右寄り" : "左寄り"})
  - 重心動揺面積 (95%信頼楕円近似): ${metrics.swayMetrics.swayArea.toFixed(1)} px²
  - 総軌跡長: ${metrics.swayMetrics.pathLength.toFixed(1)} px
  - 平均動揺速度: ${metrics.swayMetrics.swaySpeed.toFixed(1)} px/s` : ""}

${Object.keys(metrics.jointAngles).length > 0 ? `- 主要関節・セグメント角度:
  ${JSON.stringify(metrics.jointAngles)}` : ""}

【レポート要件】
1. マークダウン形式で出力すること。
2. 以下の4つのセクションを必ず含めること：
   - ## 📋 姿勢・アライメント総合評価 (Summary of Posture Alignment)
     測定データの要約、全体的なアライメントの崩れの有無と分類（ケンダルの姿勢分類に基づくニュートラル、ロードシス、カイホシス・ロードシス、フラットバック、スウェイバック等への言及）。
   - ## 🔍 バイオメカニクス的逸脱 (Biomechanical Deviations)
     荷重左右差、骨盤傾斜、関節角度、動揺データに見られる詳細な問題点を指摘し、重症度（軽度、中等度、重度）を判定。
   - ## ⚡ 臨床的インプリケーションと潜在的障害リスク (Clinical Implications & Impairment Risks)
     このアライメントが日常生活や動作時に与える腰椎、頸椎、膝関節、足関節への負担、発生し得る具体的な痛みのリスク。
   - ## 🏋️ 推奨されるアプローチ・リハビリ運動療法 (Recommended Corrective Exercise Protocol)
     このアライメント不良を改善するための具体的なストレッチや筋力トレーニングのメニュー（ターゲット部位、回数、セット数を含む）。
3. トーンはプロフェッショナルで、アカデミックかつ実用的なものにすること。専門用語を適切に使用しつつ、クライアント向けの説明としても十分に理解できる表現にしてください。
`;

        var response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { temperature: 0.2 }
            })
        });

        if (!response.ok) {
            var errText = await response.text();
            throw new Error(`HTTP ${response.status}: ${errText}`);
        }

        var json = await response.json();
        return json.candidates[0].content.parts[0].text;
    },

    /**
     * Offline local expert evaluation system.
     */
    generateOfflineReport: function(metrics, prefix = "") {
        var mode = metrics.mode;
        var height = metrics.height;
        var wb = metrics.weightBearing;
        var sway = metrics.swayMetrics;
        var ja = metrics.jointAngles;
        var tilt = metrics.pelvicTilt;

        var report = prefix + `# 📊 バイオメカニクス簡易評価レポート (CONNECT AI Expert Local Engine)\n\n`;
        report += `**測定項目**: ${this.getModeNameJp(mode)}  \n`;
        report += `**計測日時**: ${new Date(metrics.timestamp).toLocaleString()}  \n\n`;

        // 1. Summary
        report += `## 📋 姿勢・アライメント総合評価\n`;
        if (mode === 'front' || mode === 'back') {
            report += `前面/後面アライメント測定において、冠状面（左右）での対称性と荷重分布を評価しました。\n`;
            if (wb) {
                var diff = Math.abs(wb.total.L - wb.total.R);
                if (diff < 5) {
                    report += `左右の荷重バランスは極めて良好（左右差 ${diff.toFixed(1)}%）で、ほぼ均等に荷重が分散されています。骨格にかかる静的負荷は対称的です。\n`;
                } else if (diff < 12) {
                    report += `左右の荷重に軽度な非対称性（左右差 ${diff.toFixed(1)}%）が観察されます。荷重偏位側は **${wb.total.L > wb.total.R ? "左脚" : "右脚"}** です。\n`;
                } else {
                    report += `左右の荷重に顕著な非対称性（左右差 ${diff.toFixed(1)}%）が見られます。**${wb.total.L > wb.total.R ? "左脚" : "右脚"}** に過剰な荷重がかかっており、代償動作や関節の局所的ストレスの原因となります。\n`;
                }
            }
        } else if (mode === 'l_side' || mode === 'r_side') {
            report += `矢状面（側面）アライメント測定において、ケンダルの姿勢分類に基づく評価を行いました。\n`;
            report += `骨盤の傾斜角は **${tilt === 0 ? "0°（ニュートラル）" : (tilt > 0 ? "前傾 " + tilt + "°" : "後傾 " + Math.abs(tilt) + "°")}** です。\n`;
            
            if (tilt > 8) {
                report += `骨盤の過度な前傾が認められ、腰椎前弯の亢進に伴う「反り腰（Lordosis）」または「カイホシス・ロードシス（円背・反り腰）」アライメントの傾向にあります。\n`;
            } else if (tilt < -5) {
                report += `骨盤の後傾が認められ、フラットバック（平背）またはスウェイバック（骨盤前方偏位・後傾）姿勢の傾向にあります。\n`;
            } else {
                report += `骨盤傾斜角はほぼ正常範囲内です。体幹セグメントおよび頭部、肩、大転子、外果のアライメントラインはおおむね良好な垂直アライメント（Plumb-line）を維持しています。\n`;
            }
        } else if (mode.startsWith('dyn_overhead')) {
            report += `動的動作（オーバーヘッドスクワット）におけるアライメントを評価しました。スクワット動作は股関節・膝関節・足関節の協調運動と、体幹の支持性を総合的に示す機能的評価です。\n`;
        } else {
            report += `動的機能および可動性テストを実施し、アライメント偏位を測定しました。\n`;
        }
        report += `\n`;

        // 2. Deviations
        report += `## 🔍 バイオメカニクス的逸脱\n`;
        var hasDeviations = false;
        
        if (wb && Math.abs(wb.total.L - wb.total.R) > 5) {
            var diff = Math.abs(wb.total.L - wb.total.R);
            var severity = diff > 12 ? "【重度】" : "【軽度〜中等度】";
            report += `- **荷重バランス非対称性 ${severity}**: 荷重中心が ${wb.total.L > wb.total.R ? "左側" : "右側"} に ${diff.toFixed(1)}% 偏位しています。\n`;
            hasDeviations = true;
        }

        if (tilt > 8 || tilt < -5) {
            var severity = Math.abs(tilt) > 15 ? "【重度】" : "【中等度】";
            report += `- **骨盤アライメント異常 ${severity}**: 骨盤が ${tilt > 0 ? "前傾" : "後傾"} に ${Math.abs(tilt)}° 傾斜しています。\n`;
            hasDeviations = true;
        }

        if (ja.leftKneeAngle && ja.rightKneeAngle && mode === 'dyn_overhead') {
            var kneeDiff = Math.abs(ja.leftKneeAngle - ja.rightKneeAngle);
            if (kneeDiff > 5) {
                report += `- **膝関節屈曲非対称性 【中等度】**: スクワット時の膝関節角度に ${kneeDiff.toFixed(1)}° の左右差があります（左: ${ja.leftKneeAngle.toFixed(1)}° / 右: ${ja.rightKneeAngle.toFixed(1)}°）。\n`;
                hasDeviations = true;
            }
        }

        if (ja.trunkLean && mode === 'dyn_overhead_side') {
            if (ja.trunkLean > 40) {
                report += `- **体幹前傾の過多 【中等度〜重度】**: 体幹の前傾角が ${ja.trunkLean.toFixed(1)}° と深く、股関節および大腿四頭筋の硬さ、あるいは体幹深層筋の支持性低下を示唆します。\n`;
                hasDeviations = true;
            }
            if (ja.shoulderArmAngle && ja.shoulderArmAngle < 155) {
                report += `- **上腕挙上不足 【中等度】**: スクワット中の腕と体幹のなす角度が ${ja.shoulderArmAngle.toFixed(1)}° と狭く、広背筋や大胸筋の硬さ、または肩甲骨周囲筋の機能低下を示します。\n`;
                hasDeviations = true;
            }
        }

        if (sway) {
            if (sway.swayArea > 1500) {
                report += `- **COP重心動揺領域の増大 【中等度】**: 動揺面積が ${sway.swayArea.toFixed(1)} px² と広く、静的バランスの維持における安定性低下（足底受容器・前庭系・視覚によるフィードバックの遅れや足関節の剛性不足）を示しています。\n`;
                hasDeviations = true;
            }
        }

        if (!hasDeviations) {
            report += `顕著なバイオメカニクス的逸脱は検出されませんでした。すべてアライメント指標は安全基準範囲内です。\n`;
        }
        report += `\n`;

        // 3. Clinical Implications
        report += `## ⚡ 臨床的インプリケーションと潜在的障害リスク\n`;
        if (wb && Math.abs(wb.total.L - wb.total.R) > 5) {
            var dominantSide = wb.total.L > wb.total.R ? "左" : "右";
            var lightSide = wb.total.L > wb.total.R ? "右" : "左";
            report += `- **${dominantSide}膝・股関節・足関節の過負荷**: 荷重が増大している側の関節における軟骨・靭帯への機械的ストレスが増大し、長期的に変形性関節症や腱炎のリスクが高まります。\n`;
            report += `- **${lightSide}腰背部の筋筋膜性ストレス**: 荷重非対称性を代償するために、反対側の腰椎周囲筋（腰方形筋、脊柱起立筋）が過剰に緊張し、非特異的腰痛を発症しやすくなります。\n`;
        }

        if (tilt > 8) {
            report += `- **仙腸関節および腰椎椎間関節症**: 骨盤の前傾は腰椎の過前弯を引き起こし、椎間関節の圧迫ストレス（腰痛）や、大腿四頭筋・腸腰筋の短縮、ハムストリングスの伸張性過緊張を誘発します。\n`;
        } else if (tilt < -5) {
            report += `- **椎間板ヘルニアおよびフラットバック症候群**: 骨盤の後傾は脊椎本来の緩衝機能を司るS字カーブを消失させ、椎間板（特にL4/L5-S1）への軸圧ストレスを増大させ、ヘルニアや坐骨神経痛のリスクとなります。\n`;
        }

        if (ja.trunkLean && ja.trunkLean > 40 && mode === 'dyn_overhead_side') {
            report += `- **腰部・膝関節蓋大腿関節への代償ストレス**: 体幹の過度な前傾は、大腿四頭筋への依存を強め、膝蓋腱炎（ジャンパー膝）や膝前面痛の原因となります。また、腰椎部のモーメントアームが長くなり、脊柱起立筋への負担が極端に増加します。\n`;
        }

        if (wb === null && tilt === 0 && !ja.trunkLean) {
            report += `- **一般的な姿勢維持機能の維持**: 現在は良好な状態ですが、デスクワークなどの持続的な同姿勢によりインナーマッスル（コア）が弱化すると、アライメント不良へ移行する可能性があります。\n`;
        }
        report += `\n`;

        // 4. Corrective Exercise
        report += `## 🏋️ 推奨されるアプローチ・リハビリ運動療法\n`;
        
        if (wb && Math.abs(wb.total.L - wb.total.R) > 5) {
            var weakSide = wb.total.L > wb.total.R ? "右" : "左";
            report += `### 1. 荷重左右差の是正\n`;
            report += `- **${weakSide}脚の片脚デッドリフト (Single-Leg Romanian Deadlift)**\n`;
            report += `  - ターゲット: ${weakSide}側の大臀筋、ハムストリングス、骨盤の水平安定性\n`;
            report += `  - アプローチ: 片脚で立ち、背部を伸ばしたまま股関節から上体を前に倒します。10回×3セット。\n`;
        }

        if (tilt > 8) {
            report += `### 2. 骨盤前傾・反り腰の改善\n`;
            report += `- **腸腰筋・大腿四頭筋のストレッチ**\n`;
            report += `  - アプローチ: 片膝立ちになり、骨盤を後傾させながら前方に体重を移動し、股関節前面を伸ばします。左右各30秒×3回。\n`;
            report += `- **プランク (Plank) & ドローイン**\n`;
            report += `  - アプローチ: 前腕とつま先で体を支え、腹横筋を意識して骨盤をニュートラルに維持します。30〜60秒×3セット。\n`;
        } else if (tilt < -5) {
            report += `### 2. 骨盤後傾・平背の改善\n`;
            report += `- **ハムストリングスの動的ストレッチ**\n`;
            report += `  - アプローチ: 仰向けに寝て片膝を抱え、そこから膝をゆっくり伸ばして太もも裏側を伸ばします。左右各20回×2セット。\n`;
            report += `- **キャット＆カウ (Cat & Cow)**\n`;
            report += `  - アプローチ: 四つん這いになり、骨盤から背骨を一つずつ動かすように、丸める・反らすを繰り返します。15回×2セット。\n`;
        }

        if (ja.trunkLean && ja.trunkLean > 40 && mode === 'dyn_overhead_side') {
            report += `### 3. オーバーヘッドスクワットパターンの改善\n`;
            report += `- **ヒップヒンジの練習 (Hip Hinge Practice with Wall)**\n`;
            report += `  - アプローチ: 壁から足1足分前に立ち、お尻を後ろの壁にタッチさせるように股関節から屈曲します。膝を前に出さない感覚を養います。15回×3セット。\n`;
            report += `- **胸椎の伸展・回旋モビリティ**\n`;
            report += `  - アプローチ: 四つん這いから片手を頭の後ろにあて、胸を横に開くように体幹を回旋します。上腕の挙上可動域を改善します。左右各10回×3セット。\n`;
        }

        if (!wb && tilt === 0 && !ja.trunkLean) {
            report += `### 1. 全身のコアスタビリティの維持\n`;
            report += `- **バードドッグ (Bird-Dog)**\n`;
            report += `  - ターゲット: 脊柱起立筋、多裂筋、臀筋、コアの対角支持性\n`;
            report += `  - アプローチ: 四つん這いから右手と左脚（または左手と右脚）を水平に伸ばし、3秒維持します。左右交互に15回×3セット。\n`;
        }

        return report;
    },

    /**
     * Translates mode strings to Japanese names.
     */
    getModeNameJp: function(mode) {
        var names = {
            'front': '静止姿勢・前面',
            'back': '静止姿勢・後面',
            'l_side': '静止姿勢・左側面',
            'r_side': '静止姿勢・右側面',
            'dyn_overhead': 'オーバーヘッドスクワット (前面)',
            'dyn_overhead_side': 'オーバーヘッドスクワット (側面)',
            'dyn_single_r': '片脚立位バランス (右軸脚)',
            'dyn_single_l': '片脚立位バランス (左軸脚)',
            'dyn_flex_fwd': '立位体前屈テスト',
            'dyn_flex_bwd': '立位体後屈テスト',
            'dyn_shoulder_r': '肩複合可動性 (右上)',
            'dyn_shoulder_l': '肩複合可動性 (左上)'
        };
        return names[mode] || mode;
    }
};
