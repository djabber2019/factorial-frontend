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

  useEffect(() => {
    return () => {
      if (eventSourceRef.current) eventSourceRef.current.close();
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const num = parseInt(input, 10);
    if (isNaN(num) || num <= 0) {
      toast.error('Please enter a valid positive integer');
      return;
    }

    setStatus('processing');
    setJobId(null);
    setComputationTime(0);
    setProgress(0);

    try {
      const startTime = Date.now();
      timerRef.current = setInterval(() => {
        setComputationTime(Math.floor((Date.now() - startTime) / 1000));
      }, 1000);

      const response = await fetch(`${API_BASE}/compute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ n: num })
      });

      if (!response.ok) throw new Error('Failed to start computation');
      const data = await response.json();
      setJobId(data.job_id);

      eventSourceRef.current = new EventSource(`${API_BASE}/stream-status/${data.job_id}`);
      eventSourceRef.current.onmessage = (e) => {
        const { status, message, result_size } = JSON.parse(e.data);
        if (status === 'complete') {
          setStatus('complete');
          setProgress(100);
          setResultSize(result_size);
          clearInterval(timerRef.current);
          toast.success(message);
        } else if (status === 'progress') {
          setProgress(prev => Math.min(prev + 5, 90));
        }
      };
    } catch (err) {
      setStatus('error');
      clearInterval(timerRef.current);
      toast.error(err.message);
    }
  };

  return (
    <div className="container">
      <ToastContainer />
      <h1>Factorial Calculator</h1>
      <form onSubmit={handleSubmit}>
        <input
          type="number"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          min="1"
          placeholder="Enter a positive integer"
        />
        <button type="submit" disabled={status === 'processing'}>
          {status === 'processing' ? <FaSpinner className="spinner" /> : 'Calculate'}
        </button>
      </form>
      {status === 'processing' && (
        <div className="progress-container">
          <div className="progress-bar" style={{ width: `${progress}%` }} />
          <p>Calculating... ({computationTime}s)</p>
        </div>
      )}
      {status === 'complete' && (
        <button onClick={() => window.open(`${API_BASE}/download/${jobId}`, '_blank')}>
          <FaDownload /> Download Result
        </button>
      )}
    </div>
  );
};

export default App;
