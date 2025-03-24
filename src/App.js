import './App.css';
import { useState } from 'react';
import { FaLinkedin, FaDownload } from 'react-icons/fa';

// Backend URL
const API_BASE = "https://factorial-backend.fly.dev/";

export default function App() {
    const [input, setInput] = useState(''); // User input for the factorial number
    const [status, setStatus] = useState('idle'); // Current status of the computation
    const [downloadUrl, setDownloadUrl] = useState(null); // URL to download the result
    const [error, setError] = useState(''); // Error message to display

    // Validate the input to ensure it's a positive integer
    const validateInput = (value) => {
        const num = parseInt(value);
        if (isNaN(num) || num <= 0 || num !== parseFloat(value)) {
            setError('Please enter a valid positive integer.');
            return false;
        }
        setError('');
        return true;
    };

    // Handle form submission
    const handleSubmit = async (e) => {
        e.preventDefault();
        const num = parseInt(input);

        // Validate input
        if (isNaN(num) || num <= 0 || num !== parseFloat(input)) {
            setError('Please enter a valid positive integer.');
            return;
        }

        // Set status to "processing"
        setStatus('processing');
        setError('');

        try {
            // Send a POST request to the backend to start the computation
            const payload = { n: num };
            console.log("Sending payload:", payload);

            const response = await fetch(`${API_BASE}compute`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });

            console.log("Response status:", response.status);

            // Handle errors from the backend
            if (!response.ok) {
                const errorData = await response.json();
                console.log("Error data:", errorData);
                throw new Error(errorData.detail || 'Server connection failed');
            }

            // Get the job ID from the response
            const { job_id } = await response.json();
            console.log("Job ID:", job_id);

            // Set up Server-Sent Events (SSE) to listen for status updates
            const eventSource = new EventSource(`${API_BASE}/stream-status/${job_id}`);

            eventSource.onmessage = (event) => {
                const status = event.data;
                console.log("Received status:", status);

                // Handle status updates
                if (status === "complete") {
                    setStatus("complete");
                    setDownloadUrl(`${API_BASE}download/${job_id}`);
                    eventSource.close(); // Close the connection
                } else if (status === "failed") {
                    setError("Factorial computation failed. Please try again.");
                    setStatus("error");
                    eventSource.close(); // Close the connection
                }
            };

            // Handle SSE errors
            eventSource.onerror = () => {
                console.log("SSE error occurred");
                setError("Connection to server failed. Please check your network or try again later.");
                setStatus("error");
                eventSource.close(); // Close the connection
            };
        } catch (err) {
            console.log("Error:", err);
            setError(err.message);
            setStatus('error');
        }
    };

    return (
        <div className="container">
            <h1>Professional Factorial Calculator</h1>

            {/* Input form */}
            <form onSubmit={handleSubmit}>
                <input
                    type="number"
                    value={input}
                    onChange={(e) => {
                        setInput(e.target.value);
                        setError(''); // Clear error when input changes
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

            {/* Error message */}
            {error && <div className="error">{error}</div>}

            {/* Loading message */}
            {status === 'processing' && (
                <div className="loading">Calculating factorial... This may take up to 1 hour.</div>
            )}

            {/* Download button */}
            {status === 'complete' && (
                <a href={downloadUrl} download className="download-btn">
                    <FaDownload /> Download Result
                </a>
            )}

            {/* Credits */}
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
