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
                        <div className="form-group">
                            <label>問題数:</label>
                            <input
                                type="number"
                                min="1"
                                max="10"
                                value={questionCount}
                                onChange={(e) => setQuestionCount(parseInt(e.target.value) || 3)}
                            />
                        </div>
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
                    <h2>結果</h2>
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
