import React, { useState, useEffect, useRef } from 'react';
import { FaSpinner, FaDownload, FaInfoCircle, FaExclamationTriangle } from 'react-icons/fa';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import './App.css';

const API_BASE = process.env.NODE_ENV === 'development' 
  ? 'http://localhost:8000' 
  : 'https://factorial-backend.fly.dev';

export default function App() {
  const [input, setInput] = useState('');
  const [jobId, setJobId] = useState(null);
  const [status, setStatus] = useState('idle');
  const [progress, setProgress] = useState(0);
  const [resultSize, setResultSize] = useState(0);
  const [timeElapsed, setTimeElapsed] = useState(0);
  const [isConnected, setIsConnected] = useState(false);
  const eventSourceRef = useRef(null);
  const timerRef = useRef(null);
  const computationStartRef = useRef(null);

  useEffect(() => {
    return () => {
      eventSourceRef.current?.close();
      clearInterval(timerRef.current);
    };
  }, []);

  const handleCompute = async () => {
    if (!input || isNaN(input) || input <= 0) {
      toast.error("Please enter a valid positive number");
      return;
    }

    setStatus('processing');
    setProgress(0);
    setTimeElapsed(0);
    setIsConnected(false);
    computationStartRef.current = Date.now();

    timerRef.current = setInterval(() => {
      setTimeElapsed(Math.floor((Date.now() - computationStartRef.current) / 1000));
    }, 1000);

    try {
      const res = await fetch(`${API_BASE}/compute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ n: parseInt(input) })
      });
      
      if (!res.ok) throw new Error(await res.text());
      
      const { job_id } = await res.json();
      setJobId(job_id);
      setupEventStream(job_id);
    } catch (err) {
      handleError(err);
    }
  };

  const setupEventStream = (jobId) => {
    eventSourceRef.current?.close();
    
    const es = new EventSource(`${API_BASE}/stream-status/${jobId}`);
    eventSourceRef.current = es;

    es.onopen = () => {
      setIsConnected(true);
      setProgress(10);
    };

    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.event === 'complete') {
          handleCompletion(data.size);
        } else if (data.event === 'progress') {
          setProgress(prev => Math.min(prev + 5, 95));
        }
      } catch (err) {
        console.error("SSE Error:", err);
      }
    };

    es.onerror = () => {
      setIsConnected(false);
      if (eventSourceRef.current?.readyState === EventSource.CLOSED) {
        setTimeout(() => status === 'processing' && setupEventStream(jobId), 2000);
      }
    };
  };

  const handleCompletion = (size) => {
    cleanupResources();
    setStatus('complete');
    setProgress(100);
    setResultSize(size);
    toast.success(`Computation completed in ${timeElapsed}s`);
  };

  const handleError = (error) => {
    cleanupResources();
    setStatus('error');
    toast.error(error.message || "Computation failed");
  };

  const cleanupResources = () => {
    eventSourceRef.current?.close();
    clearInterval(timerRef.current);
  };

  return (
    <div className="app-container">
      <header className="app-header">
        <h1><FaInfoCircle /> Factorial Calculator</h1>
        <p>Compute massive factorials with distributed computing</p>
      </header>

      <div className="compute-card">
        <div className="input-group">
          <input
            type="number"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            min="1"
            placeholder="Enter a positive integer"
            disabled={status === 'processing'}
          />
          <button
            onClick={handleCompute}
            disabled={status === 'processing' || !input}
            className={status === 'processing' ? 'processing' : ''}
          >
            {status === 'processing' ? (
              <><FaSpinner className="spin" /> Computing...</>
            ) : 'Calculate Factorial'}
          </button>
        </div>

        {status === 'processing' && (
          <>
            <div className="connection-status">
              {isConnected ? (
                <span className="connected">● Connected</span>
              ) : (
                <span className="disconnected">● Connecting...</span>
              )}
            </div>
            <div className="progress-container">
              <div className="progress-bar" style={{ width: `${progress}%` }}></div>
              <div className="progress-info">
                <span>Elapsed: {timeElapsed}s</span>
                <span>{progress}%</span>
              </div>
            </div>
          </>
        )}

        {status === 'complete' && (
          <div className="result-container">
            <div className="result-meta">
              <span>Computation time: {timeElapsed}s</span>
              <span>Result size: {(resultSize / 1024).toFixed(1)} KB</span>
            </div>
            <a
              href={`${API_BASE}/download/${jobId}`}
              className="download-button"
              download={`factorial_${input}.txt`}
            >
              <FaDownload /> Download Result
            </a>
          </div>
        )}

        {status === 'error' && (
          <div className="error-container">
            <FaExclamationTriangle className="error-icon" />
            <p>Something went wrong. Please try again.</p>
            <button onClick={handleCompute}>Retry</button>
          </div>
        )}
      </div>

      <ToastContainer
        position="bottom-right"
        autoClose={5000}
        newestOnTop
        closeOnClick
        pauseOnFocusLoss
      />
    </div>
  );
}
