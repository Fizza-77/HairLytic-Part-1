import React, { useState, useEffect, useRef } from 'react';
import { Upload, Camera, RefreshCw } from 'lucide-react';

const DetectionCamera = ({
    inputMode,
    setInputMode,
    selectedFile,
    setSelectedFile,
    previewUrl,
    setPreviewUrl,
    conf,
    setConf,
    loading,
    onPredict,
    onReset
}) => {
    // Camera State
    const [cameraActive, setCameraActive] = useState(false);
    const [cameraStream, setCameraStream] = useState(null);
    const [showCameraPreview, setShowCameraPreview] = useState(true); // Toggle video vs snapshot

    const fileInputRef = useRef(null);
    const videoRef = useRef(null);
    const canvasRef = useRef(null);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            stopCamera();
        };
    }, []);

    // Sync Camera Stream to Video Element
    useEffect(() => {
        if (cameraActive && cameraStream && showCameraPreview && videoRef.current) {
            videoRef.current.srcObject = cameraStream;
        }
    }, [cameraActive, cameraStream, showCameraPreview]);

    // Camera Logic
    const startCamera = async () => {
        if (cameraActive && cameraStream) {
            setShowCameraPreview(true);
            setSelectedFile(null);
            onReset();
            return;
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } }
            });
            setCameraStream(stream);
            setCameraActive(true);
            setShowCameraPreview(true);
            setSelectedFile(null);
            onReset();
        } catch (err) {
            alert('Could not access camera. Please check permissions.');
        }
    };

    const stopCamera = () => {
        if (cameraStream) {
            cameraStream.getTracks().forEach(track => track.stop());
            setCameraStream(null);
        }
        setCameraActive(false);
        setShowCameraPreview(false);
    };

    const capturePhoto = () => {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        if (video && canvas) {
            const context = canvas.getContext('2d');
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            context.drawImage(video, 0, 0, canvas.width, canvas.height);

            canvas.toBlob((blob) => {
                const file = new File([blob], `camera_${Date.now()}.jpg`, { type: "image/jpeg" });
                if (previewUrl) URL.revokeObjectURL(previewUrl);
                const url = URL.createObjectURL(file);

                setPreviewUrl(url);
                setSelectedFile(file);
                setShowCameraPreview(false); // Show the snapshot, but KEEP stream active
            }, 'image/jpeg', 0.95);
        }
    };

    const resetDetection = () => {
        if (inputMode === 'camera') {
            setShowCameraPreview(true);
            setSelectedFile(null);
        } else {
            setSelectedFile(null);
        }
        onReset();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const onFileChange = (e) => {
        const file = e.target.files[0];
        if (file && file.type.startsWith('image/')) {
            if (previewUrl) URL.revokeObjectURL(previewUrl);
            setPreviewUrl(URL.createObjectURL(file));
            setSelectedFile(file);
            onReset();
        } else {
            alert('Please select a valid image file');
        }
    };

    const handleModeSwitch = (mode) => {
        setInputMode(mode);
        if (mode === 'upload') {
            stopCamera();
            onReset();
            setSelectedFile(null);
        } else {
            startCamera();
        }
    };

    return (
        <div className="glass p-6 md:p-8 rounded-[2rem] max-w-2xl mx-auto">
            <div className="flex bg-white/5 p-1 rounded-2xl mb-8">
                <button
                    className={`flex-1 py-3 rounded-xl text-sm font-bold transition-all ${inputMode === 'upload' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20' : 'text-slate-400 hover:text-slate-200'}`}
                    onClick={() => handleModeSwitch('upload')}
                >
                    <Upload size={16} className="inline mr-2" /> Upload
                </button>
                <button
                    className={`flex-1 py-3 rounded-xl text-sm font-bold transition-all ${inputMode === 'camera' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20' : 'text-slate-400 hover:text-slate-200'}`}
                    onClick={() => handleModeSwitch('camera')}
                >
                    <Camera size={16} className="inline mr-2" /> Live Capture
                </button>
            </div>

            {inputMode === 'upload' ? (
                <div
                    className="border-2 border-dashed border-white/10 rounded-2xl p-12 text-center cursor-pointer hover:border-indigo-500 hover:bg-white/5 transition-all group"
                    onClick={() => fileInputRef.current.click()}
                >
                    <input type="file" ref={fileInputRef} onChange={onFileChange} hidden />
                    <div className="w-16 h-16 bg-indigo-500/10 rounded-2xl flex items-center justify-center mx-auto mb-4 group-hover:scale-110 group-hover:bg-indigo-500/20 transition-all text-indigo-400">
                        <Upload size={32} />
                    </div>
                    <p className="text-slate-400">
                        {selectedFile ? (
                            <span className="text-indigo-400 font-medium">Selected: {selectedFile.name}</span>
                        ) : (
                            <>Drop image here or <span className="text-indigo-400">browse files</span></>
                        )}
                    </p>
                </div>
            ) : (
                <div className="space-y-6">
                    <div className="aspect-[4/3] bg-black rounded-2xl overflow-hidden border border-white/10 relative">
                        {showCameraPreview ? (
                            <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover -scale-x-100" />
                        ) : selectedFile ? (
                            <img src={previewUrl} alt="Captured" className="w-full h-full object-cover" />
                        ) : (
                            <div className="w-full h-full flex flex-col items-center justify-center text-slate-500 cursor-pointer" onClick={startCamera}>
                                <Camera size={48} className="mb-4" />
                                <p>Tap to start camera</p>
                            </div>
                        )}
                        <canvas ref={canvasRef} style={{ display: 'none' }} />
                    </div>

                    <div className="flex justify-center">
                        {cameraActive && showCameraPreview && (
                            <button className="bg-white text-slate-900 font-bold px-8 py-3 rounded-xl hover:scale-105 transition-transform" onClick={capturePhoto}>
                                Take Snapshot
                            </button>
                        )}
                        {!showCameraPreview && selectedFile && inputMode === 'camera' && (
                            <button className="bg-white/10 text-white font-bold px-8 py-3 rounded-xl hover:bg-white/20 flex items-center gap-2 transition-all" onClick={() => setShowCameraPreview(true)}>
                                <RefreshCw size={18} /> Retake
                            </button>
                        )}
                    </div>
                </div>
            )}

            <div className="mt-8 space-y-3">
                <div className="flex justify-between text-sm">
                    <label className="text-slate-400">Confidence Threshold</label>
                    <span className="text-indigo-400 font-bold">{conf}</span>
                </div>
                <input
                    type="range" min="0.1" max="1.0" step="0.05" value={conf}
                    onChange={(e) => setConf(parseFloat(e.target.value))}
                    className="w-full h-1.5 bg-white/10 rounded-full appearance-none cursor-pointer accent-indigo-500"
                />
            </div>

            <button
                className="w-full mt-8 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-4 rounded-2xl transition-all flex items-center justify-center gap-3 shadow-xl shadow-indigo-500/20"
                onClick={onPredict}
                disabled={!selectedFile || loading || showCameraPreview}
            >
                {loading ? (
                    <>Analyzing Image <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /></>
                ) : (
                    'Start Diagnosis'
                )}
            </button>
        </div>
    );
};

export default DetectionCamera;
