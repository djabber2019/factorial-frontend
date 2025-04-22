import React, { useState, useEffect, useRef } from 'react';
import { FaSpinner, FaDownload, FaInfoCircle, FaTimes } from 'react-icons/fa';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import './App.css';

// Configuration
const API_BASE = window.location.hostname === 'localhost' 
     ? 'http://localhost:8000'
     : '/api'; // Works with both default Firebase domains
const PAYPAL_CLIENT_ID = "BAA8dKbVBT4qMLH-4mtdh2zLehGDZVbd7wOLXRIXmJobW_CJBNn2sqFpyqdnF5v1D6huRFXWISHMU2LSM8";
const HOSTED_BUTTON_ID = "9EUNPRHJB3SNQ";
const PAYMENT_THRESHOLD = process.env.REACT_APP_PAYMENT_THRESHOLD || 1000;
const PAYMENT_AMOUNT_USD = process.env.REACT_APP_PAYMENT_AMOUNT_USD || 4.99;
const AppConfig = {
  MAX_INPUT: 1000000,
};

function ComputationStatusPage({ jobId, onBack, handleDownload, downloadProgress }) {
  return (
    <div className="status-page">
      {status === 'complete' ? (
        <>
          <h3>Computation Complete!</h3>
          <button
            className="download-button"
            onClick={() => handleDownload(jobId)}
          >
            <FaDownload />
            {downloadProgress > 0 && downloadProgress < 100
              ? `Downloading... ${downloadProgress}%`
              : 'Download Result'}
          </button>
        </>
      ) : (
        <>
          <h3>Computing Factorial...</h3>
          <div className="progress-container">
            <div className="progress-bar" style={{ width: `${progress}%` }} />
            <div className="progress-info">
              <span>{progress}% complete</span>
            </div>
          </div>
        </>
      )}
      <button onClick={onBack} className="back-button">
        Back to Calculator
      </button>
    </div>
  );
}

const PayPalPaymentModal = ({ paymentInfo, setPaymentInfo, setStatus, setJobId }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const loadPayPal = async () => {
      if (window.paypal) {
        initializeButton();
        return;
      }

      const script = document.createElement('script');
      script.src = `https://www.paypal.com/sdk/js?client-id=${PAYPAL_CLIENT_ID}&components=buttons,hosted-buttons&disable-funding=venmo&currency=USD&intent=capture`;
      script.async = true;
      script.crossOrigin = "anonymous";

      script.onload = () => {
        if (window.paypal) {
          initializeButton();
        } else {
          setError("PayPal SDK failed to load");
        }
        setLoading(false);
      };

      script.onerror = () => {
        setError("Failed to load PayPal SDK");
        setLoading(false);
      };

      document.body.appendChild(script);
      return () => document.body.removeChild(script);
    };

    loadPayPal();
  }, []);

  const initializeButton = () => {
    try {
      window.paypal.HostedButtons({
        hostedButtonId: HOSTED_BUTTON_ID,
        onApprove: async (data) => {
          try {
            setStatus('verifying_payment');

            const response = await fetch(`${API_BASE}/capture-paypal-order`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                payment_id: data.orderID,
                payer_id: data.payerID,
                n: paymentInfo.n,
                amount: PAYMENT_AMOUNT_USD.toFixed(2),
              }),
            });

            if (!response.ok) throw new Error("Payment verification failed");

            const result = await response.json();
            localStorage.setItem('pendingJobId', result.job_id);

            window.history.replaceState(
              {},
              '',
              `${window.location.pathname}#status/${result.job_id}?tx=${data.orderID}`
            );
            window.dispatchEvent(new Event('hashchange'));
          } catch (err) {
            setError(err.message);
            setStatus('payment_failed');
            toast.error(`Payment failed: ${err.message}`);
          }
        },
      }).render("#paypal-button-container");
    } catch (err) {
      setError("Failed to initialize PayPal button");
      setLoading(false);
    }
  };

  return (
    <div className="payment-modal-overlay">
      <div className="payment-modal-content">
        <h3>Payment Required</h3>
        <p>Computation for n={paymentInfo.n} requires payment of ${PAYMENT_AMOUNT_USD}</p>

        {loading && <div className="paypal-loading">Loading payment options...</div>}
        {error && <div className="payment-error">Error: {error}</div>}

        <div id="paypal-button-container"></div>

        <button
          className="payment-cancel-button"
          onClick={() => {
            setPaymentInfo(null);
            setStatus('idle');
          }}
        >
          Cancel Payment
        </button>
      </div>
    </div>
  );
};

export default function App() {
  const [input, setInput] = useState('');
  const [jobId, setJobId] = useState(null);
  const [status, setStatus] = useState('idle');
  const [progress, setProgress] = useState(0);
  const [timeElapsed, setTimeElapsed] = useState(0);
  const [paymentInfo, setPaymentInfo] = useState(null);
  const [logs, setLogs] = useState([]);
  const [showLogs, setShowLogs] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const eventSourceRef = useRef(null);
  const timerRef = useRef(null);
  const logsEndRef = useRef(null);

  useEffect(() => {
    const verifyPayment = async () => {
      const params = new URLSearchParams(window.location.search);
      const txId = params.get('tx');
      const hashJobId = window.location.hash.match(/#status\/(.+)/)?.[1];

      if (txId && hashJobId) {
        try {
          setStatus('verifying_payment');

          const res = await fetch(`${API_BASE}/verify-payment`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ transaction_id: txId }),
          });

          if (!res.ok) throw new Error('Payment verification failed');

          const data = await res.json();

          setJobId(data.job_id);
          setStatus('processing');
          window.history.replaceState({}, '', `/status/${data.job_id}`);
        } catch (err) {
          setStatus('idle');
          toast.error('Payment verification failed. Contact support with TX ID: ' + txId);
          window.history.replaceState({}, '', window.location.pathname);
        }
      }
    };

    verifyPayment();
  }, []);

  useEffect(() => {
    const handleHashChange = () => {
      const match = window.location.hash.match(/#status\/([a-z0-9-]+)/i);
      if (match) {
        setJobId(match[1]);
        setStatus('processing');
      }
    };

    window.addEventListener('hashchange', handleHashChange);
    handleHashChange();

    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const addLog = (message) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs((prev) => [...prev, `${timestamp}: ${message}`]);
    setTimeout(() => logsEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
  };

  const handleCompute = async () => {
    const num = Math.min(Math.max(parseInt(input) || 0, 1), AppConfig.MAX_INPUT);

    if (num <= 0) {
      toast.error("Must be a positive integer");
      return;
    }

    if (num > PAYMENT_THRESHOLD) {
      setPaymentInfo({ n: num, amount: PAYMENT_AMOUNT_USD });
      setStatus('payment_pending');
      return;
    }

    await startComputation(num);
  };

  const startComputation = async (num) => {
    addLog(`Initializing computation for n=${num}`);
    setStatus('processing');
    setProgress(0);
    clearInterval(timerRef.current);

    timerRef.current = setInterval(() => {
      setTimeElapsed((prev) => {
        if (prev % 5 === 0) addLog(`Computation in progress (${prev}s elapsed)`);
        return prev + 1;
      });
    }, 1000);

    try {
      const response = await fetch(`${API_BASE}/compute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ n: num }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || "Computation failed");
      }
      const result = await response.json();
      setJobId(result.job_id);
      setStatus('processing');
      setProgress(0);
      setTimeElapsed(0);
      setDownloadProgress(0);

      // Set up Server-Sent Event (SSE) listener for progress updates
      eventSourceRef.current = new EventSource(`${API_BASE}/status/${result.job_id}`);

      eventSourceRef.current.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.status === 'complete') {
          setStatus('complete');
          setProgress(100);
        } else if (data.status === 'processing') {
          setProgress(data.progress || 0);
        }
      };

      eventSourceRef.current.onerror = (error) => {
        console.error("Error in SSE:", error);
        setStatus('failed');
        addLog("Error in computation progress");
      };
    } catch (err) {
      setStatus('failed');
      toast.error(`Computation failed: ${err.message}`);
      addLog(`Computation failed: ${err.message}`);
    }
  };

  const handleDownload = async (jobId) => {
    try {
      setDownloadProgress(0);
      const res = await fetch(`${API_BASE}/download/${jobId}`);

      if (!res.ok) throw new Error("Failed to download the result");

      const totalSize = parseInt(res.headers.get("Content-Length"), 10);
      const reader = res.body.getReader();
      let loaded = 0;
      const chunks = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        loaded += value.length;
        setDownloadProgress(Math.round((loaded / totalSize) * 100));
      }

      const blob = new Blob(chunks);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `factorial_${jobId}.txt`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setDownloadProgress(0);
      toast.error(`Download failed: ${err.message}`);
      addLog(`Download failed: ${err.message}`);
    }
  };

  const handleCancelComputation = () => {
    setStatus('idle');
    clearInterval(timerRef.current);
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }
    setInput('');
    setJobId(null);
    setProgress(0);
    setTimeElapsed(0);
    setLogs([]);
    setDownloadProgress(0);
  };

  return (
    <div className="App">
      <ToastContainer />

      {status === 'payment_pending' && paymentInfo && (
        <PayPalPaymentModal
          paymentInfo={paymentInfo}
          setPaymentInfo={setPaymentInfo}
          setStatus={setStatus}
          setJobId={setJobId}
        />
      )}

      {status === 'complete' || status === 'failed' ? (
        <ComputationStatusPage
          jobId={jobId}
          onBack={() => setStatus('idle')}
          handleDownload={handleDownload}
          downloadProgress={downloadProgress}
        />
      ) : (
        <div className="computation-form">
          <h1>Factorial Computation</h1>
          <input
            type="number"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Enter a number"
          />
          <button onClick={handleCompute}>Compute</button>

          <button
            className="cancel-button"
            onClick={handleCancelComputation}
            disabled={status === 'idle'}
          >
            Cancel Computation
          </button>
        </div>
      )}

      {status === 'processing' && (
        <div className="status-container">
          <div className="status-info">
            <h3>Computation in Progress</h3>
            <p>Elapsed time: {timeElapsed}s</p>
            <div className="progress-bar-container">
              <div className="progress-bar" style={{ width: `${progress}%` }} />
            </div>
            <p>{progress}% complete</p>
          </div>
          <button onClick={handleCancelComputation} className="back-button">
            Cancel Computation
          </button>
        </div>
      )}

      {status === 'failed' && (
        <div className="status-container">
          <h3>Computation Failed</h3>
          <button onClick={handleCancelComputation} className="back-button">
            Retry
          </button>
        </div>
      )}

      <div className="logs-container">
        <button
          onClick={() => setShowLogs(!showLogs)}
          className="logs-toggle-button"
        >
          {showLogs ? 'Hide Logs' : 'Show Logs'}
        </button>
        {showLogs && (
          <div className="logs-content">
            {logs.map((log, idx) => (
              <div key={idx} className="log-entry">
                {log}
              </div>
            ))}
            <div ref={logsEndRef} />
          </div>
        )}
      </div>
    </div>
  );
}
      
