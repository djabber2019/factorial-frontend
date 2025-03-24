import './App.css';
import { useState, useEffect, useRef } from 'react';
import { FaLinkedin, FaDownload, FaSpinner } from 'react-icons/fa';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

const API_BASE = process.env.REACT_APP_API_URL || "https://factorial-backend.fly.dev/";
const COMPUTATION_TIMEOUT = 300000; // 5 minutes timeout

export default function App() {
    const [input, setInput] = useState('');
    const [status, setStatus] = useState('idle'); // idle | processing | complete | error
    const [jobId, setJobId] = useState(null);
    const [computationTime, setComputationTime] = useState(0);
    const [progress, setProgress] = useState(0);
    const eventSourceRef = useRef(null);
    const timerRef = useRef(null);
    const timeoutRef = useRef(null);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (eventSourceRef.current) eventSourceRef.current.close();
            if (timerRef.current) clearInterval(timerRef.current);
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
        };
    }, []);

    const validateInput = (value) => {
        const num = parseInt(value);
        if (isNaN(num) || num <= 0 || num !== parseFloat(value)) {
            toast.error('Please enter a valid positive integer (e.g., 5, 100)');
            return false;
        }
        if (num > 1000000) {
            toast.warning('For numbers > 1,000,000, computation may take very long');
        }
        return true;
    };

    const resetState = () => {
        setStatus('idle');
        setJobId(null);
        setComputationTime(0);
        setProgress(0);
        if (eventSourceRef.current) {
            eventSourceRef.current.close();
            eventSourceRef.current = null;
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!validateInput(input)) return;

        const num = parseInt(input);
        resetState();
        setStatus('processing');
        
        try {
            // Start timer
            const startTime = Date.now();
            timerRef.current = setInterval(() => {
                setComputationTime(Math.floor((Date.now() - startTime) / 1000));
                setProgress(prev => Math.min(prev + 0.5, 95)); // Slow progression until completion
            }, 1000);

            // Set timeout
            timeoutRef.current = setTimeout(() => {
                if (status === 'processing') {
                    setStatus('error');
                    toast.error('Computation timed out after 5 minutes');
                    eventSourceRef.current?.close();
                    clearInterval(timerRef.current);
                }
            }, COMPUTATION_TIMEOUT);

            // Start computation
            const response = await fetch(`${API_BASE}compute`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ n: num }),
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.detail || 'Failed to start computation');
            }

            const { job_id } = await response.json();
            setJobId(job_id);

            // Set up SSE connection
            eventSourceRef.current = new EventSource(`${API_BASE}stream-status/${job_id}`);

            eventSourceRef.current.addEventListener('complete', () => {
                setStatus("complete");
                setProgress(100);
                clearInterval(timerRef.current);
                clearTimeout(timeoutRef.current);
                eventSourceRef.current?.close();
                toast.success('Computation completed!');
            });

            eventSourceRef.current.addEventListener('error', (e) => {
                setStatus("error");
                clearInterval(timerRef.current);
                clearTimeout(timeoutRef.current);
                eventSourceRef.current?.close();
                toast.error(e.data || 'Computation failed');
            });

            eventSourceRef.current.onerror = () => {
                setStatus("error");
                clearInterval(timerRef.current);
                clearTimeout(timeoutRef.current);
                toast.error('Connection to server interrupted');
            };

        } catch (err) {
            console.error('Error:', err);
            setStatus('error');
            clearInterval(timerRef.current);
            clearTimeout(timeoutRef.current);
            eventSourceRef.current?.close();
            toast.error(err.message || 'An unexpected error occurred');
        }
    };

    const handleDownload = async () => {
        if (!jobId) return;
        
        try {
            // Trigger download via hidden link
            const downloadUrl = `${API_BASE}download/${jobId}`;
            const link = document.createElement('a');
            link.href = downloadUrl;
            link.setAttribute('download', `factorial_${input}.txt`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        } catch (err) {
            toast.error('Failed to download result');
            console.error('Download error:', err);
        }
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
                            className="progress" 
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
                    <button 
                        onClick={handleDownload}
                        className="download-btn"
                    >
                        <FaDownload /> Download Result (factorial_of_{input}.txt)
                    </button>
                    <div className="completion-time">
                        Computed in {computationTime} seconds
                    </div>
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
}
