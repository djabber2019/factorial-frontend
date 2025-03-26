// App.js
import React, { useState, useEffect } from 'react';
import { FaSpinner, FaDownload, FaInfoCircle } from 'react-icons/fa';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import './App.css';

const API_BASE = "https://factorial-backend.fly.dev";

export default function App() {
  const [input, setInput] = useState('');
  const [jobId, setJobId] = useState(null);
  const [status, setStatus] = useState('idle');
  const [progress, setProgress] = useState(0);
  const [resultSize, setResultSize] = useState(0);
  const [timeElapsed, setTimeElapsed] = useState(0);
  const eventSourceRef = React.useRef(null);

  useEffect(() => {
    return () => {
      if (eventSourceRef.current) eventSourceRef.current.close();
    };
  }, []);

  const startComputation = async () => {
    const num = parseInt(input);
    if (isNaN(num) || num <= 0) {
      toast.error("Please enter a positive integer");
      return;
    }

    setStatus('processing');
    setProgress(0);
    setTimeElapsed(0);

    try {
      // Start timer
      const startTime = Date.now();
      const timer = setInterval(() => {
        setTimeElapsed(Math.floor((Date.now() - startTime) / 1000));
      }, 1000);

      // Start computation
      const res = await fetch(`${API_BASE}/compute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ n: num })
      });
      const data = await res.json();
      setJobId(data.job_id);

      // SSE for real-time updates
      eventSourceRef.current = new EventSource(`${API_BASE}/stream-status/${data.job_id}`);
      
      eventSourceRef.current.onmessage = (e) => {
        const eventData = JSON.parse(e.data);
        if (eventData.event === 'complete') {
          setStatus('complete');
          setProgress(100);
          setResultSize(eventData.data.size);
          clearInterval(timer);
          toast.success("Computation completed!");
        } else if (eventData.event === 'progress') {
          setProgress(prev => Math.min(prev + 1, 95));
        }
      };

      eventSourceRef.current.onerror = () => {
        clearInterval(timer);
        setStatus('error');
        toast.error("Connection to server lost");
      };

    } catch (err) {
      setStatus('error');
      toast.error(err.message);
    }
  };

  return (
    <div className="container">
      <h1><FaInfoCircle /> Factorial Calculator</h1>
      
      <div className="card">
        <form onSubmit={(e) => { e.preventDefault(); startComputation(); }}>
          <input
            type="number"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            min="1"
            placeholder="Enter positive integer (e.g., 100000)"
            disabled={status === 'processing'}
          />
          <button 
            type="submit" 
            disabled={status === 'processing'}
            aria-busy={status === 'processing'}
          >
            {status === 'processing' ? (
              <><FaSpinner className="spin" /> Calculating...</>
            ) : 'Compute Factorial'}
          </button>
        </form>

        {status === 'processing' && (
          <div className="progress-container">
            <div className="progress-bar" style={{ width: `${progress}%` }}></div>
            <div className="progress-info">
              <span>Elapsed: {timeElapsed}s</span>
              <span>{progress}%</span>
            </div>
          </div>
        )}

        {status === 'complete' && (
          <div className="result-container">
            <p>Computed in {timeElapsed} seconds</p>
            <p>Result size: {(resultSize / 1024).toFixed(1)} KB</p>
            <a 
              href={`${API_BASE}/download/${jobId}`} 
              className="download-btn"
              download
            >
              <FaDownload /> Download Results
            </a>
          </div>
        )}
      </div>
      
      <ToastContainer position="bottom-right" />
    </div>
  );
}
