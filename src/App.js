import { useState } from 'react';
import { FaLinkedin, FaDownload } from 'react-icons/fa';

const API_BASE = "https://factorial-backend.fly.dev/";

export default function App() {
  const [input, setInput] = useState('');
  const [status, setStatus] = useState('idle');
  const [downloadUrl, setDownloadUrl] = useState(null);
  const [error, setError] = useState('');

  const validateInput = (value) => {
    const num = parseInt(value);
    if (isNaN(num) || num <= 0 || num !== parseFloat(value)) {
      setError('Please enter a valid positive integer.');
      return false;
    }
    setError('');
    return true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const num = parseInt(input);
    if (isNaN(num) || num <= 0 || num !== parseFloat(input)) {
      setError('Please enter a valid positive integer.');
      return;
    }

    setStatus('processing');

    try {
      console.log("Request body:", JSON.stringify({ n: num }));
      const response = await fetch(`${API_BASE}compute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ n: num }),
      });

      if (!response.ok) {
        throw new Error('Server connection failed');
      }

      const { job_id } = await response.json();
      pollStatus(job_id);
    } catch (err) {
      setError('Server connection failed');
      setStatus('error');
    }
  };

  const pollStatus = (jobId) => {
    let attempts = 0;
    const maxAttempts = 30;

    const interval = setInterval(async () => {
      attempts++;
      if (attempts > maxAttempts) {
        clearInterval(interval);
        setError('Calculation timed out. Please try again.');
        setStatus('error');
        return;
      }

      try {
        const response = await fetch(`${API_BASE}status/${jobId}`);
        if (!response.ok) {
          throw new Error('Status check failed');
        }

        const { status } = await response.json();

        if (status === 'complete') {
          clearInterval(interval);
          setStatus('complete');
          setDownloadUrl(`${API_BASE}download/${jobId}`);
        }
      } catch (err) {
        clearInterval(interval);
        setError('Status check failed. Please try again.');
        setStatus('error');
      }
    }, 2000);
  };

  return (
    <div className="container">
      <h1>Professional Factorial Calculator</h1>

      <form onSubmit={handleSubmit}>
        <input
          type="number"
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setError('');
          }}
          min="1"
          step="1"
          placeholder="Enter positive integer"
        />
        <button
          type="submit"
          disabled={status === 'processing'}
          aria-label={status === 'processing' ? 'Calculating factorial' : 'Compute factorial'}
        >
          {status === 'processing' ? 'Calculating...' : 'Compute'}
        </button>
      </form>

      {error && <div className="error">{error}</div>}
      {status === 'processing' && <div className="loading">Calculating factorial...</div>}

      {status === 'complete' && (
        <a href={downloadUrl} download className="download-btn">
          <FaDownload /> Download Result
        </a>
      )}

      <div className="credits">
        <h3>Created by Daef Al-Shaebi</h3>
        <div className="social-links">
          <a href="https://www.linkedin.com/in/al-shaebi-daef-jaber-709894112?utm_source=share&utm_campaign=share_via&utm_content=profile&utm_medium=android_app" target="_blank" rel="noopener noreferrer">
            <FaLinkedin />
          </a>
        </div>
      </div>
    </div>
  );
}
