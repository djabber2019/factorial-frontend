import React, { useState, useEffect, useRef } from 'react';
import { FaSpinner, FaDownload, FaInfoCircle, FaExclamationTriangle } from 'react-icons/fa';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import './App.css';

const API_BASE = window.location.hostname === 'localhost' 
  ? 'http://localhost:8000' 
  : 'https://factorial-backend.fly.dev';

export default function App() {
  const [input, setInput] = useState('');
  const [jobId, setJobId] = useState(null);
  const [status, setStatus] = useState('idle');
  const [progress, setProgress] = useState(0);
  const [timeElapsed, setTimeElapsed] = useState(0);
  const eventSourceRef = useRef(null);
  const timerRef = useRef(null);

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
    
    timerRef.current = setInterval(() => {
      setTimeElapsed(prev => prev + 1);
    }, 1000);

    try {
      const response = await fetch(`${API_BASE}/compute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ n: parseInt(input) }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Request failed');
      }

      const data = await response.json();
      setJobId(data.job_id);
      setupEventStream(data.job_id);
    } catch (error) {
      handleError(error);
    }
  };

  const setupEventStream = (jobId) => {
    eventSourceRef.current?.close();
    
    const es = new EventSource(`${API_BASE}/stream-status/${jobId}`);
    eventSourceRef.current = es;

    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.event === 'complete') {
          handleCompletion(data.size);
        } else if (data.event === 'progress') {
          setProgress(prev => Math.min(prev + 10, 90));
        }
      } catch (err) {
        console.error("Error parsing event:", err);
      }
    };

    es.onerror = () => {
      es.close();
      handleError(new Error("Connection lost"));
    };
  };

  const handleCompletion = (size) => {
    clearInterval(timerRef.current);
    setStatus('complete');
    setProgress(100);
    toast.success(`Computation completed in ${timeElapsed}s`);
  };

  const handleError = (error) => {
    clearInterval(timerRef.current);
    setStatus('error');
    toast.error(error.message);
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
          >
            {status === 'processing' ? (
              <><FaSpinner className="spin" /> Computing...</>
            ) : 'Calculate Factorial'}
          </button>
        </div>

        {status === 'processing' && (
          <div className="progress-container">
            <div className="progress-bar" style={{ width: `${progress}%` }} />
            <div className="progress-info">
              <span>Elapsed: {timeElapsed}s</span>
              <span>{progress}%</span>
            </div>
          </div>
        )}

        {status === 'complete' && jobId && (
          <a
            href={`${API_BASE}/download/${jobId}`}
            className="download-button"
            download
          >
            <FaDownload /> Download Result
          </a>
        )}

        {status === 'error' && (
          <div className="error-container">
            <button onClick={handleCompute}>
              <FaExclamationTriangle /> Retry
            </button>
          </div>
        )}
      </div>

      <ToastContainer position="bottom-right" />
    </div>
  );
}
