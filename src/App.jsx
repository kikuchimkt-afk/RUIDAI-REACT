import React, { useState, useRef, useEffect } from 'react';
import { GoogleGenerativeAI } from "@google/generative-ai";
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import './App.css';

function App() {
    const [images, setImages] = useState([]);
    const [result, setResult] = useState("");
    const [loading, setLoading] = useState(false);
    const [apiKey, setApiKey] = useState(localStorage.getItem('ruidai_api_key') || "");
    const [model, setModel] = useState(localStorage.getItem('ruidai_model') || "gemini-3-flash-preview");
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [isCameraOpen, setIsCameraOpen] = useState(false);
    const [questionCount, setQuestionCount] = useState(3);
    const [customInstructions, setCustomInstructions] = useState("");
    const [studentName, setStudentName] = useState(localStorage.getItem('ruidai_student') || "");
    const [instructorName, setInstructorName] = useState(localStorage.getItem('ruidai_instructor') || "");
    const [printDate, setPrintDate] = useState(new Date().toISOString().split('T')[0]);

    const videoRef = useRef(null);
    const canvasRef = useRef(null);
    const [mediaStream, setMediaStream] = useState(null);

    const PRESETS = [
        { label: "難しめ", value: "難易度を少し上げて" },
        { label: "計算重視", value: "途中式を詳しく書いて" },
        { label: "解説重視", value: "解説を詳しくして" },
    ];

    // Save settings to localStorage
    useEffect(() => {
        localStorage.setItem('ruidai_api_key', apiKey);
        localStorage.setItem('ruidai_model', model);
        localStorage.setItem('ruidai_student', studentName);
        localStorage.setItem('ruidai_instructor', instructorName);
    }, [apiKey, model, studentName, instructorName]);

    // Initialize camera when isCameraOpen changes
    useEffect(() => {
        if (isCameraOpen && mediaStream && videoRef.current) {
            videoRef.current.srcObject = mediaStream;
            videoRef.current.play().catch(e => console.error("Video play failed:", e));
        }
    }, [isCameraOpen, mediaStream]);

    const startCamera = async () => {
        console.log("Starting camera...");

        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            alert("カメラ機能がサポートされていません。HTTPSまたはローカルホストで接続してください。");
            return;
        }

        try {
            const constraints = {
                video: { facingMode: { ideal: 'environment' } }
            };
            const stream = await navigator.mediaDevices.getUserMedia(constraints);
            setMediaStream(stream);
            setIsCameraOpen(true);
            console.log("Camera started successfully");
        } catch (err) {
            console.error("Error accessing camera:", err);
            alert("カメラの起動に失敗しました。詳細: " + err.message);
        }
    };

    const stopCamera = () => {
        console.log("Stopping camera...");
        if (mediaStream) {
            mediaStream.getTracks().forEach(track => track.stop());
            setMediaStream(null);
        }
        setIsCameraOpen(false);
    };

    const captureImage = () => {
        console.log("Capturing image...");
        if (videoRef.current && canvasRef.current) {
            const video = videoRef.current;
            const canvas = canvasRef.current;
            const context = canvas.getContext('2d');

            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            context.drawImage(video, 0, 0, canvas.width, canvas.height);

            const imageData = canvas.toDataURL('image/png');
            setImages(prev => [...prev, imageData]);
            stopCamera();
            console.log("Image captured and added");
        }
    };

    const deleteImage = (index) => {
        setImages(prev => prev.filter((_, i) => i !== index));
    };

    // Paste handler
    useEffect(() => {
        const handlePaste = (e) => {
            const items = e.clipboardData?.items;
            if (!items) return;

            for (const item of items) {
                if (item.type.indexOf('image') === 0) {
                    const blob = item.getAsFile();
                    const reader = new FileReader();
                    reader.onload = (event) => {
                        setImages(prev => [...prev, event.target.result]);
                    };
                    reader.readAsDataURL(blob);
                }
            }
        };

        window.addEventListener('paste', handlePaste);
        return () => window.removeEventListener('paste', handlePaste);
    }, []);

    const handleGenerate = async () => {
        if (images.length === 0) return;
        if (!apiKey) {
            alert("APIキーを入力してください");
            setIsSettingsOpen(true);
            return;
        }

        setLoading(true);
        try {
            const genAI = new GoogleGenerativeAI(apiKey);
            const genModel = genAI.getGenerativeModel({ model });

            const imagesParts = images.map(img => ({
                inlineData: {
                    data: img.split(',')[1],
                    mimeType: "image/png"
                }
            }));

            const prompt = `あなたは教育のプロフェッショナルです。添付された問題画像を分析し、類似した${questionCount}問の問題を作成してください。

${customInstructions ? `追加指示: ${customInstructions}` : ''}

以下の形式で出力してください：

## 問題

### 問題1
[問題文]

### 問題2
[問題文]

(以下同様)

---

## 解答・解説

### 問題1の解答
**答え:** [答え]
**解説:** [解説]

### 問題2の解答
**答え:** [答え]
**解説:** [解説]

(以下同様)

---

## 講師向けガイド

### 指導のポイント
[この問題を教える際の重要ポイント]

### つまずきやすいポイント
[生徒がつまずきやすい箇所と対策]
`;

            const response = await genModel.generateContent([prompt, ...imagesParts]);
            const text = response.response.text();
            setResult(text);
        } catch (error) {
            console.error(error);
            alert(`生成に失敗しました: ${error.message}`);
        } finally {
            setLoading(false);
        }
    };

    // ========== Print Preview Function ==========
    const openPrintPreview = (mode) => {
        if (!result) return;

        // Parse result sections
        const problemMatch = result.match(/## 問題([\s\S]*?)(?=---|\n## |$)/);
        const solutionMatch = result.match(/## 解答・解説([\s\S]*?)(?=---|\n## |$)/);
        const instructorMatch = result.match(/## 講師向けガイド([\s\S]*?)$/);

        const problemContent = problemMatch ? problemMatch[1].trim() : '';
        const solutionContent = solutionMatch ? solutionMatch[1].trim() : '';
        const instructorContent = instructorMatch ? instructorMatch[1].trim() : '';

        // Build content based on mode
        let printContent = '';
        let title = '';

        switch (mode) {
            case 'problem':
                printContent = `<h2>問題</h2>${markdownToHtml(problemContent)}`;
                title = '問題';
                break;
            case 'solution':
                printContent = `<h2>解答・解説</h2>${markdownToHtml(solutionContent)}`;
                title = '解答・解説';
                break;
            case 'full':
                printContent = `<h2>問題</h2>${markdownToHtml(problemContent)}<hr/><h2>解答・解説</h2>${markdownToHtml(solutionContent)}`;
                title = '問題と解答';
                break;
            case 'instructor':
                printContent = `<h2>講師向けガイド</h2>${markdownToHtml(instructorContent)}`;
                title = '講師向けガイド';
                break;
            default:
                printContent = markdownToHtml(result);
                title = '類題';
        }

        // Header with student/instructor info
        const headerHtml = `
      <div class="print-header">
        <div class="header-left">
          <span class="date">${printDate}</span>
          <span class="student">${studentName ? '生徒: ' + studentName : ''}</span>
        </div>
        <div class="header-right">
          <span class="instructor">${instructorName ? '講師: ' + instructorName : ''}</span>
        </div>
      </div>
    `;

        // Scale-to-fit JavaScript
        const scaleScript = `
      <script>
        function scaleToFit() {
          const content = document.getElementById('print-content');
          if (!content) return;
          
          // A4 paper dimensions (in mm, converted to pixels at 96 DPI)
          const pageHeight = 277 * 3.78; // ~1047px (A4 height minus margins)
          const contentHeight = content.scrollHeight;
          
          if (contentHeight > pageHeight) {
            const scale = pageHeight / contentHeight;
            content.style.transform = 'scale(' + scale + ')';
            content.style.transformOrigin = 'top left';
            content.style.width = (100 / scale) + '%';
          }
        }
        window.onload = scaleToFit;
        window.onbeforeprint = scaleToFit;
      </script>
    `;

        const printHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <title>${title} - RUIDAI</title>
          <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css">
          <style>
            * { box-sizing: border-box; margin: 0; padding: 0; }
            body { 
              font-family: 'Noto Sans JP', sans-serif; 
              padding: 20px; 
              line-height: 1.6;
            }
            .print-header { 
              display: flex; 
              justify-content: space-between; 
              border-bottom: 2px solid #333; 
              padding-bottom: 10px; 
              margin-bottom: 20px; 
            }
            .print-controls { 
              position: fixed; 
              top: 10px; 
              right: 10px; 
              display: flex; 
              gap: 10px;
              z-index: 1000;
            }
            .print-controls button {
              padding: 10px 20px;
              border: none;
              border-radius: 5px;
              cursor: pointer;
              font-size: 14px;
            }
            .print-btn { background: #6366f1; color: white; }
            .close-btn { background: #6b7280; color: white; }
            
            /* Scale slider */
            .scale-control {
              display: flex;
              align-items: center;
              gap: 10px;
              padding: 5px 15px;
              background: white;
              border-radius: 5px;
              border: 1px solid #ddd;
            }
            .scale-control input { width: 100px; }
            
            h2 { color: #6366f1; margin: 20px 0 10px; }
            h3 { margin: 15px 0 8px; }
            hr { margin: 20px 0; border: 1px dashed #ccc; }
            
            #print-content {
              transition: transform 0.2s;
            }
            
            @media print {
              .print-controls { display: none !important; }
              body { padding: 0; }
            }
          </style>
        </head>
        <body>
          <div class="print-controls">
            <div class="scale-control">
              <label>サイズ: <span id="scale-value">100</span>%</label>
              <input type="range" id="scale-slider" min="50" max="150" value="100" oninput="updateScale(this.value)">
            </div>
            <button class="print-btn" onclick="window.print()">🖨️ 印刷</button>
            <button class="close-btn" onclick="window.close()">✕ 閉じる</button>
          </div>
          ${headerHtml}
          <div id="print-content">
            ${printContent}
          </div>
          <script>
            function updateScale(value) {
              document.getElementById('scale-value').textContent = value;
              const content = document.getElementById('print-content');
              content.style.transform = 'scale(' + (value / 100) + ')';
              content.style.transformOrigin = 'top left';
              content.style.width = (10000 / value) + '%';
            }
            
            // Auto-fit on load
            window.onload = function() {
              const content = document.getElementById('print-content');
              const pageHeight = 277 * 3.78; // A4 height in pixels
              const contentHeight = content.scrollHeight;
              
              if (contentHeight > pageHeight) {
                const scale = Math.floor((pageHeight / contentHeight) * 100);
                document.getElementById('scale-slider').value = scale;
                updateScale(scale);
              }
            };
          </script>
        </body>
      </html>
    `;

        const printWindow = window.open('', '_blank');
        printWindow.document.write(printHtml);
        printWindow.document.close();
    };

    // Simple markdown to HTML converter
    const markdownToHtml = (md) => {
        if (!md) return '';
        return md
            .replace(/### (.*?)$/gm, '<h3>$1</h3>')
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/\n\n/g, '<br/><br/>')
            .replace(/\n/g, '<br/>');
    };

    return (
        <div className="app">
            {/* Header */}
            <header className="header">
                <h1>RUIDAI <span className="badge">React</span></h1>
                <button className="settings-btn" onClick={() => setIsSettingsOpen(true)}>⚙️</button>
            </header>

            {/* Settings Modal */}
            {isSettingsOpen && (
                <div className="modal-overlay" onClick={() => setIsSettingsOpen(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()}>
                        <h3>設定</h3>
                        <div className="setting-item">
                            <label>API Key:</label>
                            <input
                                type="password"
                                value={apiKey}
                                onChange={(e) => setApiKey(e.target.value)}
                                placeholder="Gemini API Key"
                            />
                            <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer">
                                キーを取得 ↗
                            </a>
                        </div>
                        <div className="setting-item">
                            <label>モデル:</label>
                            <select value={model} onChange={(e) => setModel(e.target.value)}>
                                <option value="gemini-1.5-pro">Gemini 1.5 Pro</option>
                                <option value="gemini-1.5-flash">Gemini 1.5 Flash</option>
                                <option value="gemini-2.0-flash-exp">Gemini 2.0 Flash</option>
                                <option value="gemini-3-flash-preview">Gemini 3 Flash Preview</option>
                            </select>
                        </div>
                        <button className="primary-btn" onClick={() => setIsSettingsOpen(false)}>閉じる</button>
                    </div>
                </div>
            )}

            <main className="main-content">
                {/* Left Panel - Input */}
                <aside className="left-panel">
                    {/* Camera Section */}
                    {isCameraOpen ? (
                        <div className="camera-container">
                            <video ref={videoRef} playsInline autoPlay />
                            <canvas ref={canvasRef} style={{ display: 'none' }} />
                            <div className="camera-controls">
                                <button className="capture-btn" onClick={captureImage}>📷 撮影</button>
                                <button className="cancel-btn" onClick={stopCamera}>✕ 閉じる</button>
                            </div>
                        </div>
                    ) : (
                        <div className="upload-area" onClick={startCamera}>
                            <div className="drop-icon">📸</div>
                            <p>タップでカメラを起動</p>
                            <button className="start-camera-btn" onClick={(e) => { e.stopPropagation(); startCamera(); }}>
                                カメラを起動
                            </button>
                        </div>
                    )}

                    {/* Image Preview */}
                    {images.length > 0 && (
                        <div className="image-preview">
                            <h3>問題画像 ({images.length}枚)</h3>
                            <div className="image-grid">
                                {images.map((img, index) => (
                                    <div key={index} className="image-item">
                                        <img src={img} alt={`問題 ${index + 1}`} />
                                        <button className="delete-btn" onClick={() => deleteImage(index)}>✕</button>
                                        <span className="page-number">P.{index + 1}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Config */}
                    <div className="config-section">
                        <div className="form-row">
                            <div className="form-group">
                                <label>日付:</label>
                                <input
                                    type="date"
                                    value={printDate}
                                    onChange={(e) => setPrintDate(e.target.value)}
                                />
                            </div>
                            <div className="form-group">
                                <label>問題数:</label>
                                <div className="number-stepper">
                                    <button
                                        type="button"
                                        onClick={() => setQuestionCount(Math.max(1, questionCount - 1))}
                                        className="stepper-btn"
                                    >−</button>
                                    <span className="stepper-value">{questionCount}</span>
                                    <button
                                        type="button"
                                        onClick={() => setQuestionCount(Math.min(10, questionCount + 1))}
                                        className="stepper-btn"
                                    >+</button>
                                </div>
                            </div>
                        </div>
                        <div className="form-row">
                            <div className="form-group">
                                <label>生徒名:</label>
                                <input
                                    type="text"
                                    value={studentName}
                                    onChange={(e) => setStudentName(e.target.value)}
                                    placeholder="生徒名"
                                />
                            </div>
                            <div className="form-group">
                                <label>講師名:</label>
                                <input
                                    type="text"
                                    value={instructorName}
                                    onChange={(e) => setInstructorName(e.target.value)}
                                    placeholder="講師名"
                                />
                            </div>
                        </div>
                        <div className="preset-chips">
                            {PRESETS.map(preset => (
                                <button
                                    key={preset.label}
                                    className={`chip-btn ${customInstructions === preset.value ? 'active' : ''}`}
                                    onClick={() => setCustomInstructions(preset.value)}
                                >
                                    {preset.label}
                                </button>
                            ))}
                        </div>
                        <textarea
                            value={customInstructions}
                            onChange={(e) => setCustomInstructions(e.target.value)}
                            placeholder="追加指示..."
                            rows={2}
                        />
                    </div>

                    {/* Generate Button */}
                    <button
                        className="generate-btn"
                        disabled={images.length === 0 || loading}
                        onClick={handleGenerate}
                    >
                        {loading ? '作成中...' : '類題を作成 ✨'}
                    </button>
                </aside>

                {/* Right Panel - Result */}
                <section className="right-panel">
                    <div className="result-header">
                        <h2>結果</h2>
                        {result && (
                            <div className="print-buttons">
                                <button className="print-chip" onClick={() => openPrintPreview('problem')}>🖨️ 問題</button>
                                <button className="print-chip" onClick={() => openPrintPreview('solution')}>🖨️ 解答</button>
                                <button className="print-chip" onClick={() => openPrintPreview('full')}>🖨️ 全て</button>
                                <button className="print-chip" onClick={() => openPrintPreview('instructor')}>🖨️ 講師用</button>
                            </div>
                        )}
                    </div>
                    {loading ? (
                        <div className="loading">
                            <div className="spinner"></div>
                            <p>類題を作成中...</p>
                        </div>
                    ) : result ? (
                        <div className="result-content">
                            <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
                                {result}
                            </ReactMarkdown>
                        </div>
                    ) : (
                        <div className="placeholder">
                            <p>📝 問題画像を撮影し、「類題を作成」ボタンを押してください</p>
                        </div>
                    )}
                </section>
            </main>
        </div>
    );
}

export default App;

