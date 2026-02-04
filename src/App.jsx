import React, { useState, useRef, useEffect, useCallback } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { GoogleGenerativeAI } from "@google/generative-ai";
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import ReactCrop from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
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

    // Sheet info
    const [sheetTitle, setSheetTitle] = useState("");
    const [assignDate, setAssignDate] = useState(new Date().toISOString().split('T')[0]);
    const [dueDate, setDueDate] = useState("");

    // Saved sheets
    const [savedSheets, setSavedSheets] = useState([]);
    const [showSavedListModal, setShowSavedListModal] = useState(false);

    // Cropping state
    const [tempImage, setTempImage] = useState(null);
    const [showCropModal, setShowCropModal] = useState(false);
    const [crop, setCrop] = useState({ unit: '%', width: 90, height: 90, x: 5, y: 5 });
    const [completedCrop, setCompletedCrop] = useState(null);
    const cropImageRef = useRef(null);

    const videoRef = useRef(null);
    const canvasRef = useRef(null);
    const [mediaStream, setMediaStream] = useState(null);

    const PRESETS = [
        { label: "難しめ", value: "難易度を少し上げて" },
        { label: "計算重視", value: "途中式を詳しく書いて" },
        { label: "解説重視", value: "解説を詳しくして" },
    ];

    // Load saved sheets from localStorage on mount
    useEffect(() => {
        const saved = localStorage.getItem('ruidai_saved_sheets');
        if (saved) {
            try {
                setSavedSheets(JSON.parse(saved));
            } catch (e) {
                console.error('Error loading saved sheets:', e);
            }
        }
    }, []);

    // Save settings to localStorage
    useEffect(() => {
        localStorage.setItem('ruidai_api_key', apiKey);
        localStorage.setItem('ruidai_model', model);
        localStorage.setItem('ruidai_student', studentName);
        localStorage.setItem('ruidai_instructor', instructorName);
    }, [apiKey, model, studentName, instructorName]);

    // Save current sheet to localStorage
    const saveSheet = () => {
        if (!result) {
            alert('保存する内容がありません');
            return;
        }
        const newSheet = {
            id: Date.now(),
            title: sheetTitle || '無題',
            studentName,
            instructorName,
            assignDate,
            dueDate,
            result,
            createdAt: new Date().toISOString()
        };
        const updatedSheets = [...savedSheets, newSheet];
        setSavedSheets(updatedSheets);
        localStorage.setItem('ruidai_saved_sheets', JSON.stringify(updatedSheets));
        alert('保存しました！');
    };

    // Load a saved sheet
    const loadSheet = (sheet) => {
        setSheetTitle(sheet.title);
        setStudentName(sheet.studentName || '');
        setInstructorName(sheet.instructorName || '');
        setAssignDate(sheet.assignDate || '');
        setDueDate(sheet.dueDate || '');
        setResult(sheet.result);
        setShowSavedListModal(false);
    };

    // Delete a saved sheet
    const deleteSheet = (id) => {
        if (!confirm('この問題シートを削除しますか？')) return;
        const updatedSheets = savedSheets.filter(s => s.id !== id);
        setSavedSheets(updatedSheets);
        localStorage.setItem('ruidai_saved_sheets', JSON.stringify(updatedSheets));
    };

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
            // Show crop modal instead of adding directly
            setTempImage(imageData);
            setShowCropModal(true);
            stopCamera();
            console.log("Image captured, showing crop modal");
        }
    };

    // Get cropped image from canvas
    const getCroppedImage = useCallback(() => {
        if (!completedCrop || !cropImageRef.current) return null;

        const image = cropImageRef.current;
        const canvas = document.createElement('canvas');
        const scaleX = image.naturalWidth / image.width;
        const scaleY = image.naturalHeight / image.height;

        canvas.width = completedCrop.width * scaleX;
        canvas.height = completedCrop.height * scaleY;

        const ctx = canvas.getContext('2d');
        ctx.drawImage(
            image,
            completedCrop.x * scaleX,
            completedCrop.y * scaleY,
            completedCrop.width * scaleX,
            completedCrop.height * scaleY,
            0,
            0,
            canvas.width,
            canvas.height
        );

        return canvas.toDataURL('image/png');
    }, [completedCrop]);

    const confirmCrop = () => {
        const croppedImage = getCroppedImage();
        if (croppedImage) {
            setImages(prev => [...prev, croppedImage]);
        } else if (tempImage) {
            // If no crop, use original
            setImages(prev => [...prev, tempImage]);
        }
        setShowCropModal(false);
        setTempImage(null);
        setCompletedCrop(null);
    };

    const cancelCrop = () => {
        setShowCropModal(false);
        setTempImage(null);
        setCompletedCrop(null);
    };

    const deleteImage = (index) => {
        setImages(prev => prev.filter((_, i) => i !== index));
    };

    // Long press timer ref
    const longPressTimer = useRef(null);

    // Paste from clipboard (for long press)
    const pasteFromClipboard = async () => {
        try {
            const clipboardItems = await navigator.clipboard.read();
            for (const item of clipboardItems) {
                for (const type of item.types) {
                    if (type.startsWith('image/')) {
                        const blob = await item.getType(type);
                        const reader = new FileReader();
                        reader.onload = (event) => {
                            setTempImage(event.target.result);
                            setShowCropModal(true);
                        };
                        reader.readAsDataURL(blob);
                        return;
                    }
                }
            }
            alert("クリップボードに画像がありません");
        } catch (err) {
            console.error("Clipboard read failed:", err);
            alert("クリップボードからの読み取りに失敗しました。ブラウザの設定を確認してください。");
        }
    };

    // Long press handlers
    const handleTouchStart = () => {
        longPressTimer.current = setTimeout(() => {
            pasteFromClipboard();
        }, 800); // 800ms for long press
    };

    const handleTouchEnd = () => {
        if (longPressTimer.current) {
            clearTimeout(longPressTimer.current);
            longPressTimer.current = null;
        }
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
            const genModel = genAI.getGenerativeModel({
                model,
                generationConfig: {
                    maxOutputTokens: 8192,
                }
            });

            const imagesParts = images.map(img => ({
                inlineData: {
                    data: img.split(',')[1],
                    mimeType: "image/png"
                }
            }));

            const prompt = `あなたは中学生向けの教育のプロフェッショナルです。添付された問題画像を分析し、類似した${questionCount}問の問題を作成してください。

${customInstructions ? `追加指示: ${customInstructions}` : ''}

【絶対厳守】数式の書き方：
- 数式は必ず LaTeX 形式で書いてください
- 数式の前後にはスペースを入れてください
- 例: 答えは $x = 3$ です。（正しい）
- 例: 答えは$x=3$です。（間違い - スペースがない）
- 複数の解がある場合: $x = 3$ または $x = -5$
- 平方根: $\\sqrt{2}$ や $\\sqrt{x+1}$
- 分数: $\\frac{1}{2}$ や $\\frac{a}{b}$
- べき乗: $x^2$ や $a^3$
- 因数分解: $(x + 5)(x - 3) = 0$
- 必ず $ の前後にスペースを入れてください
- 化学式（例: $ZnSO_4$）などは途中で改行しないでください

以下の形式で出力してください：

## 問題

### 問題1
[問題文をここに書く]

### 問題2
[問題文をここに書く]

(以下同様)

---

## 解答・解説

### 問題1の解答
**答え:** $x = [値]$
**解説:**
1. [ステップ1]
2. [ステップ2]
...

### 問題2の解答
**答え:** $x = [値]$
**解説:**
1. [ステップ1]
2. [ステップ2]
...

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
        // Parse result sections with robust regex
        const problemMatch = result.match(/## 問題([\s\S]*?)(?=## 解答・解説|$)/);
        const solutionMatch = result.match(/## 解答・解説([\s\S]*?)(?=## 講師向けガイド|$)/);
        const instructorMatch = result.match(/## 講師向けガイド([\s\S]*?)$/);

        // Remove potential trailing horizontal rules used as separators
        const cleanSection = (text) => text.replace(/[\r\n]+---[\r\n]*$/, '').trim();

        const problemContent = problemMatch ? cleanSection(problemMatch[1]) : '';
        const solutionContent = solutionMatch ? cleanSection(solutionMatch[1]) : '';
        const instructorContent = instructorMatch ? cleanSection(instructorMatch[1]) : '';

        // Build content based on mode
        let printContent = '';
        let title = '';

        const renderSection = (sectionTitle, content) => {
            return `
                <div class="print-section">
                    <h2>${sectionTitle}</h2>
                    ${markdownToHtml(content)}
                </div>
            `;
        };

        // Header generation helper (similar to Vanilla)
        const getHeader = (showScore = true) => {
            const dateStr = assignDate ? new Date(assignDate).toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' }) : '';
            return `
            <div class="print-header">
              <div class="header-top">
                 <h1 class="main-title" id="displayTitle">${title}</h1>
              </div>
              <div class="header-bottom">
                  <div class="header-left">
                    ${dateStr ? `<span class="date">${dateStr}</span>` : ''}
                    <div class="names">
                        ${studentName ? `<span class="student">生徒: ${studentName}</span>` : ''}
                        ${instructorName ? `<span class="instructor">講師: ${instructorName}</span>` : ''}
                    </div>
                  </div>
                  
                  <div class="header-right">
                    ${showScore ? `
                    <div class="score-box">
                         <div class="score-item">目標時間<div class="score-line"></div>分</div>
                         <div class="score-item">得点<div class="score-line"></div>/100</div>
                    </div>` : ''}
                  </div>
              </div>
            </div>
            `;
        };

        switch (mode) {
            case 'problem':
                title = '問題';
                printContent = `
                    ${getHeader(true)}
                    ${renderSection('問題', problemContent)}
                `;
                break;
            case 'solution':
                title = '解答・解説';
                printContent = `
                    ${getHeader(false)}
                    ${renderSection('解答・解説', solutionContent)}
                `;
                break;
            case 'full':
                title = '類題プリント';
                printContent = `
                    ${getHeader(true)}
                    ${renderSection('問題', problemContent)}
                    <div class="page-break"></div>
                    ${getHeader(false)}
                    ${renderSection('解答・解説', solutionContent)}
                    <div class="page-break"></div>
                    ${getHeader(false)}
                    ${renderSection('講師向けガイド', instructorContent)}
                `;
                break;
            case 'instructor':
                title = '講師向けガイド';
                printContent = `
                    ${getHeader(false)}
                    ${renderSection('講師向けガイド', instructorContent)}
                `;
                break;
            default:
                title = '類題';
                printContent = markdownToHtml(result);
        }

        const printWindow = window.open('', '_blank');

        // Copy all styles from current document
        const styles = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'))
            .map(node => node.outerHTML)
            .join('');

        const printHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <title>${title} - RUIDAI (Print)</title>
          ${styles}
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Zen+Maru+Gothic:wght@400;500;700&display=swap');
            
            body {
                background: #e5e7eb !important; /* Gray background for preview */
                margin: 0;
                padding: 0;
                padding-top: 80px; /* Space for controls */
                color: #333;
                font-family: 'Zen Maru Gothic', sans-serif;
            }
            .print-wrapper {
                max-width: 210mm;
                margin: 0 auto;
                padding: 15mm;
                padding-bottom: 20mm; /* Space for footer */
                background: white;
                min-height: 297mm;
                box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
                position: relative;
            }
            
            /* Section Styling */
            .result-content { line-height: 1.6; }
            .print-section { margin-bottom: 20px; }
            
            h2 {
                margin-bottom: 1rem;
                font-size: 1.25rem;
                color: #333;
                border-left: 5px solid #888;
                padding-left: 10px;
                margin-top: 0;
            }
            
            /* Header Styling */
            .print-header {
              margin-bottom: 20px;
              border-bottom: 2px solid #333;
              padding-bottom: 5px;
            }
            .header-top { text-align: center; margin-bottom: 10px; }
            .main-title { font-size: 24px; margin: 0; letter-spacing: 2px; }
            .header-bottom { display: flex; justify-content: space-between; align-items: flex-end; }
            .header-left .date { font-weight: 500; margin-right: 15px; }
            .names { display: inline-flex; gap: 15px; }
            .score-box {
              border: 2px solid #333;
              border-radius: 8px;
              padding: 5px 15px;
              display: flex;
              gap: 20px;
              background: #fff;
            }
            .score-item { font-size: 14px; display: flex; align-items: flex-end; }
            .score-line { border-bottom: 1px solid #333; width: 60px; margin-left: 5px; }
            
            .page-break {
                page-break-after: always;
                height: 0;
                display: block;
                border: none;
            }
            
            /* Footer */
            .print-footer {
                position: fixed;
                bottom: 0;
                left: 0;
                width: 100%;
                text-align: center;
                font-size: 10px;
                color: #666;
                padding-bottom: 5mm;
                background-color: rgba(255, 255, 255, 0.9);
                z-index: 1000;
            }

            /* Controls */
            .print-controls {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 60px;
                background: #f3f4f6;
                border-bottom: 1px solid #d1d5db;
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 0 20px;
                box-sizing: border-box;
                z-index: 9999;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            }
            .control-group { display: flex; align-items: center; gap: 15px; }
            .control-group label { font-weight: bold; color: #374151; }
            input[type=range] { width: 150px; cursor: pointer; }
            input[type=text] { padding: 5px; border-radius: 4px; border: 1px solid #ccc; width: 150px; }
            .buttons { display: flex; gap: 10px; }
            .btn { padding: 8px 16px; border-radius: 6px; border: none; cursor: pointer; font-weight: bold; transition: opacity 0.2s; }
            .btn-print { background: #4f46e5; color: white; }
            .btn-close { background: #6b7280; color: white; }
            .btn:hover { opacity: 0.9; }

            @page {
                size: A4 portrait;
                margin: 10mm;
            }

            @media print {
                .print-controls { display: none !important; }
                body { padding-top: 0 !important; background: white !important; }
                .print-wrapper { width: 100%; max-width: none; margin: 0; padding: 0; box-shadow: none; padding-bottom: 0; }
                .print-footer { display: block !important; }
            }
          </style>
        </head>
        <body>
          <div class="print-controls">
            <div class="control-group">
                <label>タイトル:</label>
                <input type="text" id="titleInput" value="${title}">
                
                <label style="margin-left: 15px;">サイズ: <span id="scaleVal">100%</span></label>
                <input type="range" id="scaleSlider" min="50" max="150" value="100" step="5">
            </div>
            <div class="buttons">
                <button class="btn btn-print" onclick="window.print()">🖨️ 印刷</button>
                <button class="btn btn-close" onclick="window.close()">✕ 閉じる</button>
            </div>
          </div>

          <div class="print-wrapper result-content">
             ${printContent}
             <div class="print-footer">
                ©ECCベストワン藍住・北島中央
             </div>
          </div>
          
          <script>
            const slider = document.getElementById('scaleSlider');
            const label = document.getElementById('scaleVal');
            const titleInput = document.getElementById('titleInput');
            
            slider.addEventListener('input', (e) => {
                const val = e.target.value;
                label.textContent = val + '%';
                document.body.style.zoom = val + '%';
            });
            
            titleInput.addEventListener('input', (e) => {
                const newTitle = e.target.value;
                document.querySelectorAll('.main-title').forEach(el => el.textContent = newTitle);
                document.title = newTitle;
            });
          </script>
        </body>
      </html>
    `;

        printWindow.document.write(printHtml);
        printWindow.document.close();
    };

    // Simple markdown to HTML converter using ReactMarkdown
    const markdownToHtml = (md) => {
        if (!md) return '';
        // Remove trailing spaces to prevent hard breaks
        const cleanMd = md.replace(/ +$/gm, '');
        return renderToStaticMarkup(
            <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
                {cleanMd}
            </ReactMarkdown>
        );
    };

    return (
        <div className="app">
            {/* Header */}
            <header className="header">
                <h1>RUIDAI <span className="badge">Mobile</span></h1>
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

            {/* Crop Modal */}
            {showCropModal && tempImage && (
                <div className="modal-overlay crop-modal-overlay">
                    <div className="crop-modal">
                        <h3>📐 トリミング</h3>
                        <div className="crop-container">
                            <ReactCrop
                                crop={crop}
                                onChange={(c) => setCrop(c)}
                                onComplete={(c) => setCompletedCrop(c)}
                            >
                                <img
                                    ref={cropImageRef}
                                    src={tempImage}
                                    alt="Crop preview"
                                    style={{ maxWidth: '100%', maxHeight: '60vh' }}
                                />
                            </ReactCrop>
                        </div>
                        <div className="crop-actions">
                            <button className="cancel-crop-btn" onClick={cancelCrop}>キャンセル</button>
                            <button className="confirm-crop-btn" onClick={confirmCrop}>✓ 確定</button>
                        </div>
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
                        <div
                            className="upload-area"
                            onClick={startCamera}
                            onTouchStart={handleTouchStart}
                            onTouchEnd={handleTouchEnd}
                            onMouseDown={handleTouchStart}
                            onMouseUp={handleTouchEnd}
                            onMouseLeave={handleTouchEnd}
                        >
                            <div className="drop-icon">📸</div>
                            <p>タップでカメラ起動</p>
                            <p className="hint-text">長押しでクリップボードから貼付</p>
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
                                    value={assignDate}
                                    onChange={(e) => setAssignDate(e.target.value)}
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

