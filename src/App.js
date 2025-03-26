import React, { useState, useEffect, useRef } from 'react';
import { FaSpinner, FaDownload, FaInfoCircle, FaExclamationTriangle } from 'react-icons/fa';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

const API_BASE = "https://factorial-backend.fly.dev";
const MAX_RETRIES = 3;
const RETRY_DELAY = 2000;
const SSE_TIMEOUT = 10000;

export default function App() {
  const [input, setInput] = useState('');
  const [jobId, setJobId] = useState(null);
  const [status, setStatus] = useState('idle');
  const eventSourceRef = useRef(null);

  // Cleanup on unmount
  useEffect(() => () => {
    eventSourceRef.current?.close();
  }, []);

  const handleCompute = async () => {
    try {
      setStatus('processing');
      const res = await fetch(`${API_BASE}/compute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ n: parseInt(input) })
      });
      
      const { job_id } = await res.json();
      setJobId(job_id);
      setupSSE(job_id);
    } catch (err) {
      toast.error("Computation failed");
      setStatus('error');
    }
  };

  const setupSSE = (jobId) => {
    eventSourceRef.current?.close();
    
    const es = new EventSource(`${API_BASE}/stream-status/${jobId}`);
    const timeout = setTimeout(() => es.close(), SSE_TIMEOUT);

    es.onmessage = (e) => {
      clearTimeout(timeout);
      const { event, data } = JSON.parse(e.data);
      if (event === 'complete') {
        setStatus('complete');
        toast.success(`Result ready! Size: ${(data.size / 1024).toFixed(1)} KB`);
      }
    };

    es.onerror = () => {
      clearTimeout(timeout);
      es.close();
      if (status === 'processing') {
        toast.warn("Connection interrupted");
        setStatus('error');
      }
    };

    eventSourceRef.current = es;
  };

  return (
    <div className="container">
      <h1><FaInfoCircle /> Factorial Calculator</h1>
      
      <input
        type="number"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        min="1"
        placeholder="Enter positive integer"
      />
      
      <button 
        onClick={handleCompute}
        disabled={status === 'processing'}
      >
        {status === 'processing' ? <FaSpinner className="spin" /> : 'Compute'}
      </button>

      {status === 'complete' && jobId && (
        <a 
          href={`${API_BASE}/download/${jobId}`}
          className="download-btn"
          download
        >
          <FaDownload /> Download Result
        </a>
      )}

      <ToastContainer position="bottom-right" />
    </div>
  );
}
