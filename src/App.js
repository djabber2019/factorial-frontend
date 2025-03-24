import './App.css';
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
            const payload = { n: num };
            console.log("Sending payload:", payload);

            const response = await fetch(`${API_BASE}compute`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.detail || 'Server connection failed');
            }

            const { job_id } = await response.json();
            const eventSource = new EventSource(`${API_BASE}/stream-status/${job_id}`);

            eventSource.onmessage = (event) => {
                const status = event.data;
                if (status === "complete") {
                    setStatus("complete");
                    setDownloadUrl(`${API_BASE}download/${job_id}`);
                    eventSource.close();
                } else if (status === "failed") {
                    setError("Factorial computation failed.");
                    setStatus("error");
                    eventSource.close();
                }
            };

            eventSource.onerror = () => {
                setError("Connection to server failed.");
                setStatus("error");
                eventSource.close();
            };
        } catch (err) {
            setError(err.message);
            setStatus('error');
        }
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
            {status === 'processing' && (
                <div className="loading">Calculating factorial... This may take up to 1 hour.</div>
            )}

            {status === 'complete' && (
                <a href={downloadUrl} download className="download-btn">
                    <FaDownload /> Download Result
                </a>
            )}

            <div className="credits">
                <h3>Created by Daef Al-Shaebi</h3>
                <div className="social-links">
                    <a href="https://www.linkedin.com/in/al-shaebi-daef-jaber-709894112" target="_blank" rel="noopener noreferrer">
                        <FaLinkedin />
                    </a>
                </div>
            </div>
        </div>
    );
}
