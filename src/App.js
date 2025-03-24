import React, { useState, useEffect, useRef } from 'react';
import { FaSpinner, FaDownload, FaLinkedin } from 'react-icons/fa';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import './App.css';

const API_BASE = "https://factorial-backend.fly.dev";

const App = () => {
    const [input, setInput] = useState('');
    const [status, setStatus] = useState('idle');
    const [jobId, setJobId] = useState(null);
    const [computationTime, setComputationTime] = useState(0);
    const [progress, setProgress] = useState(0);
    const [resultSize, setResultSize] = useState(0);
    const eventSourceRef = useRef(null);
    const timerRef = useRef(null);

    const formatBytes = (bytes) => {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    useEffect(() => {
        return () => {
            if (eventSourceRef.current) eventSourceRef.current.close();
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, []);

    const validateInput = (value) => {
        const num = parseInt(value, 10);
        if (isNaN(num) || num <= 0 || !Number.isInteger(num)) {
            toast.error('Please enter a valid positive integer');
            return false;
        }
        if (num > 1000000) {
            toast.warning('Note: Large numbers may take significant time to compute');
        }
        return true;
    };

    const resetState = () => {
        setStatus('idle');
        setJobId(null);
        setComputationTime(0);
        setProgress(0);
        setResultSize(0);
        if (eventSourceRef.current) eventSourceRef.current.close();
        if (timerRef.current) clearInterval(timerRef.current);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!validateInput(input)) return;

        const num = parseInt(input, 10);
        resetState();
        setStatus('processing');

        try {
            const startTime = Date.now();
            timerRef.current = setInterval(() => {
                setComputationTime(Math.floor((Date.now() - startTime) / 1000));
            }, 1000);

            const response = await fetch(`${API_BASE}/compute`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ n: num }),
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.detail || 'Failed to start computation');
            }

            const data = await response.json();
            setJobId(data.job_id);

            eventSourceRef.current = new EventSource(`${API_BASE}/stream-status/${data.job_id}`);

            eventSourceRef.current.addEventListener('complete', (event) => {
                const { result_size, message } = JSON.parse(event.data);
                setStatus('complete');
                setProgress(100);
                setResultSize(result_size);
                clearInterval(timerRef.current);
                eventSourceRef.current.close();
                toast.success(message || 'Computation completed!');
            });

            eventSourceRef.current.addEventListener('progress', (event) => {
                const { retry } = JSON.parse(event.data);
                setProgress(Math.min(20 + (retry * 1.5), 95));
            });

            eventSourceRef.current.addEventListener('error', (event) => {
                const { message } = JSON.parse(event.data);
                setStatus('error');
                clearInterval(timerRef.current);
                eventSourceRef.current.close();
                toast.error(message || 'Computation failed');
            });

            eventSourceRef.current.onerror = () => {
                setStatus('error');
                clearInterval(timerRef.current);
                toast.error('Connection to server interrupted');
            };

        } catch (err) {
            console.error('Error:', err);
            setStatus('error');
            clearInterval(timerRef.current);
            if (eventSourceRef.current) eventSourceRef.current.close();
            toast.error(err.message || 'An unexpected error occurred');
        }
    };

    const handleDownload = () => {
        if (!jobId) return;
        window.open(`${API_BASE}/download/${jobId}`, '_blank');
    };

    return (
        <div className="container">
            <ToastContainer position="top-right" autoClose={5000} />
            
            <h1>Professional Factorial Calculator</h1>
            <p className="subtitle">Calculate factorials of large numbers efficiently</p>

            <form onSubmit={handleSubmit}>
                <input
                    type="number"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    min="1"
                    step="1"
                    placeholder="Enter a positive integer (e.g., 100)"
                    disabled={status === 'processing'}
                />
                <button
                    type="submit"
                    disabled={status === 'processing' || !input.trim()}
                    className={status === 'processing' ? 'processing' : ''}
                >
                    {status === 'processing' ? (
                        <>
                            <FaSpinner className="spinner" /> Calculating...
                        </>
                    ) : (
                        'Compute Factorial'
                    )}
                </button>
            </form>

            {status === 'processing' && (
                <div className="status-container">
                    <div className="progress-bar">
                        <div 
                            className="progress-fill" 
                            style={{ width: `${progress}%` }}
                        />
                    </div>
                    <div className="status-text">
                        Calculating factorial of {input}... ({computationTime}s elapsed)
                        <br />
                        <small>Job ID: {jobId}</small>
                    </div>
                </div>
            )}

            {status === 'complete' && (
                <div className="result-container">
                    <div className="result-meta">
                        Computation completed in {computationTime} seconds
                        <br />
                        Result size: {formatBytes(resultSize)}
                    </div>
                    <button 
                        onClick={handleDownload}
                        className="download-btn"
                    >
                        <FaDownload /> Download Result (factorial_{input}.txt)
                    </button>
                </div>
            )}

            <div className="credits">
                <h3>Created by Daef Al-Shaebi</h3>
                <div className="social-links">
                    <a 
                        href="https://www.linkedin.com/in/al-shaebi-daef-jaber-709894112" 
                        target="_blank" 
                        rel="noopener noreferrer"
                        aria-label="LinkedIn profile"
                    >
                        <FaLinkedin />
                    </a>
                </div>
            </div>
        </div>
    );
};

export default App;
