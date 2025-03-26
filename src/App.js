import React, { useState, useEffect, useRef } from 'react';
import { FaSpinner, FaDownload, FaInfoCircle, FaExclamationTriangle } from 'react-icons/fa';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import './App.css';

const API_BASE = "https://factorial-backend.fly.dev";
const MAX_RETRIES = 3;
const RETRY_DELAY = 2000; // 2 seconds

export default function App() {
  const [input, setInput] = useState('');
  const [jobId, setJobId] = useState(null);
  const [status, setStatus] = useState('idle');
  const [progress, setProgress] = useState(0);
  const [resultSize, setResultSize] = useState(0);
  const [timeElapsed, setTimeElapsed] = useState(0);
  const [retryCount, setRetryCount] = useState(0);
  const eventSourceRef = useRef(null);
  const timerRef = useRef(null);
  const computationStartRef = useRef(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanupResources();
    };
  }, []);

  const cleanupResources = () => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const handleError = (error, message = 'An error occurred') => {
    console.error(error);
    cleanupResources();
    setStatus('error');
    toast.error(`${message}: ${error.message || error}`);
  };

  const startComputation = async () => {
    const num = parseInt(input);
    if (isNaN(num)) {
      toast.error("Please enter a valid number");
      return;
    }
    if (num <= 0) {
      toast.error("Please enter a positive integer");
      return;
    }

    try {
      // Reset state
      setStatus('processing');
      setProgress(0);
      setTimeElapsed(0);
      setRetryCount(0);
      computationStartRef.current = Date.now();

      // Start timer
      timerRef.current = setInterval(() => {
        setTimeElapsed(Math.floor((Date.now() - computationStartRef.current) / 1000));
      }, 1000);

      await initiateComputation(num);
    } catch (error) {
      handleError(error, "Failed to start computation");
    }
  };

  const initiateComputation = async (num, attempt = 1) => {
    try {
      const res = await fetch(`${API_BASE}/compute`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache'
        },
        body: JSON.stringify({ n: num })
      });

      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
      }

      const data = await res.json();
      setJobId(data.job_id);
      setupEventStream(data.job_id);
    } catch (error) {
      if (attempt < MAX_RETRIES) {
        setRetryCount(attempt);
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * attempt));
        await initiateComputation(num, attempt + 1);
      } else {
        throw error;
      }
    }
  };

  const setupEventStream = (jobId) => {
    cleanupResources(); // Cleanup any existing connection

    eventSourceRef.current = new EventSource(`${API_BASE}/stream-status/${jobId}`);

    eventSourceRef.current.onopen = () => {
      console.log("SSE connection opened");
      setProgress(10); // Initial progress when connection established
    };

    eventSourceRef.current.onmessage = (e) => {
      try {
        const eventData = JSON.parse(e.data);
        if (eventData.event === 'complete') {
          handleCompletion(eventData.data.size);
        } else if (eventData.event === 'progress') {
          setProgress(prev => Math.min(prev + 5, 95)); // Increment progress more conservatively
        } else if (eventData.event === 'timeout') {
          handleError(new Error("Computation timed out on server"));
        }
      } catch (error) {
        handleError(error, "Error processing server event");
      }
    };

    eventSourceRef.current.onerror = () => {
      if (eventSourceRef.current.readyState === EventSource.CLOSED) {
        handleError(new Error("Connection to server lost"));
      }
    };
  };

  const handleCompletion = (size) => {
    cleanupResources();
    setStatus('complete');
    setProgress(100);
    setResultSize(size);
    toast.success(`Computation completed in ${timeElapsed} seconds!`);
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
              <><FaSpinner className="spin" /> Calculating... {retryCount > 0 && `(retry ${retryCount}/${MAX_RETRIES})`}</>
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

        {status === 'error' && (
          <div className="error-container">
            <FaExclamationTriangle className="error-icon" />
            <p>Computation failed. Please try again.</p>
            <button onClick={startComputation}>Retry</button>
          </div>
        )}

        {status === 'complete' && (
          <div className="result-container">
            <p>Computed in {timeElapsed} seconds</p>
            <p>Result size: {(resultSize / 1024).toFixed(1)} KB</p>
            <a 
              href={`${API_BASE}/download/${jobId}`} 
              className="download-btn"
              download={`factorial_${input}.txt`}
              onClick={() => toast.info("Download started")}
            >
              <FaDownload /> Download Results
            </a>
          </div>
        )}
      </div>
      
      <ToastContainer 
        position="bottom-right"
        autoClose={5000}
        hideProgressBar={false}
        newestOnTop
        closeOnClick
        rtl={false}
        pauseOnFocusLoss
        draggable
        pauseOnHover
      />
    </div>
  );
}
