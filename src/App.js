import React, { useState, useEffect, useRef } from 'react';
import { FaSpinner, FaDownload, FaInfoCircle, FaTimes } from 'react-icons/fa';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import './App.css';

const API_BASE = window.location.protocol === 'https:' 
     ? 'https://factorial-backend.sliplane.app'
     : 'http://localhost:8000';
const PAYPAL_CLIENT_ID = "Aee8X8eVx-SCFL1sOeACxyozvwhpzNFKzQlbZbzAviLrB3YGkHUR_z1YFQYyg1i6iC2ultefi-BXHnPW";
const HOSTED_BUTTON_ID = "9EUNPRHJB3SNQ"; // Corrected button ID
const PAYMENT_THRESHOLD = process.env.REACT_APP_PAYMENT_THRESHOLD || 1000;
const PAYMENT_AMOUNT_USD = process.env.REACT_APP_PAYMENT_AMOUNT_USD || 4.99;

function ComputationStatusPage({ jobId, onBack }) {
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('processing');
  const eventSourceRef = useRef(null);

  useEffect(() => {
    eventSourceRef.current = new EventSource(`${API_BASE}/stream-status/${jobId}`);
    
    eventSourceRef.current.onmessage = (e) => {
      if (e.data.includes('complete')) {
        const data = JSON.parse(e.data);
        setStatus('complete');
      } else if (!isNaN(e.data)) {
        setProgress(parseInt(e.data));
      }
    };

    return () => {
      eventSourceRef.current?.close();
    };
  }, [jobId]);

  return (
    <div className="status-page">
      {status === 'complete' ? (
        <>
          <h3>Computation Complete!</h3>
          <a href={`${API_BASE}/download/${jobId}`} className="download-button" download>
            <FaDownload /> Download Result
          </a>
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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const formRef = useRef(null);
  const [localJobId, setLocalJobId] = useState(null);

  useEffect(() => {
    setLocalJobId(`job-${Date.now()}-${Math.floor(Math.random() * 1000)}`);
  }, []);

  const handlePaymentSubmit = (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const form = formRef.current;
    form.submit();

    const pollInterval = setInterval(async () => {
      try {
        const response = await fetch(`${API_BASE}/capture-paypal-order`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            job_id: localJobId,
            n: paymentInfo.n
          })
        });

        if (response.ok) {
          const result = await response.json();
          clearInterval(pollInterval);
          setJobId(result.job_id);
          setStatus('processing');
          setPaymentInfo(null);
        } else if (response.status !== 402) { 
          throw new Error(await response.text());
        }
      } catch (err) {
        setError(err.message || "Payment verification failed");
        clearInterval(pollInterval);
        setLoading(false);
      }
    }, 3000);  

    setTimeout(() => {
      clearInterval(pollInterval);
      setError("Payment verification timed out");
      setLoading(false);
    }, 300000);
  };

  return (
    <div className="payment-modal-overlay">
      <div className="payment-modal-content">
        <h3>Payment Required</h3>
        <p className="payment-description">
          Computation for n={paymentInfo.n} requires a payment of ${PAYMENT_AMOUNT_USD}
        </p>
        
        {loading && (
          <div className="paypal-loading">
            <FaSpinner className="spin" />
            <span>Waiting for payment verification...</span>
          </div>
        )}

        {error && (
          <div className="payment-error">
            <p>Error: {error}</p>
            <button className="retry-button" onClick={() => setError(null)}>
              Retry Payment
            </button>
          </div>
        )}

        <form 
          ref={formRef}
          action="https://www.paypal.com/cgi-bin/webscr" 
          method="post" 
          target="_top"
          onSubmit={handlePaymentSubmit}
        >
          <input type="hidden" name="cmd" value="_s-xclick" />
          <input type="hidden" name="hosted_button_id" value={HOSTED_BUTTON_ID} />
          <input type="hidden" name="custom" value={localJobId} />
          <table>
            <tr>
              <td>
                <input type="hidden" name="on0" value="Factorial Computation" />
                Factorial Computation for:
              </td>
            </tr>
            <tr>
              <td>
                <input type="hidden" name="os0" value={paymentInfo.n} />
                <div className="computation-value-display">n = {paymentInfo.n}</div>
              </td>
            </tr>
          </table>
          <input type="hidden" name="currency_code" value="USD" />
          <input 
            type="image" 
            src="https://www.paypalobjects.com/en_US/i/btn/btn_paynowCC_LG.gif" 
            border="0" 
            name="submit" 
            alt="Pay Now"
            style={{ margin: '0 auto', display: 'block' }}
          />
        </form>

        <div className="customer-note">
          <div className="customer-note-title">Important Note:</div>
          <div className="customer-note-content">
            After payment, you'll be redirected back to check your computation status.
            Please don't close this window until verification completes.
          </div>
        </div>

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
  const [logs, setLogs] = useState([]);
  const [paymentInfo, setPaymentInfo] = useState(null);
  const eventSourceRef = useRef(null);

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
    setLogs(prev => [...prev, `${timestamp}: ${message}`]);
  };

  const handleCompute = async () => {
    addLog(`Starting computation for input: ${input}`);
    const num = parseInt(input);
    
    if (isNaN(num) || num <= 0) {
      addLog(`Invalid input detected: ${input}`);
      toast.error("Please enter a valid positive number");
      return;
    }

    addLog(`Computation initiated for n=${num}`);
    setStatus(num > PAYMENT_THRESHOLD ? 'payment_pending' : 'processing');

    if (num <= PAYMENT_THRESHOLD) {
      await startComputation(num);
    } else {
      setPaymentInfo({ 
        amount: PAYMENT_AMOUNT_USD, 
        n: num,
        threshold: PAYMENT_THRESHOLD
      });
    }
  };

  const startComputation = async (num) => {
    addLog(`Initializing computation for n=${num}`);
    setStatus('processing');
    setProgress(0);
    try {
      const response = await fetch(`${API_BASE}/compute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ n: num })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || "Computation failed");
      }

      const data = await response.json();
      addLog(`Computation job created with ID: ${data.job_id}`);
      setJobId(data.job_id);
      setupEventStream(data.job_id);
    } catch (error) {
      addLog(`Error: ${error.message}`);
    }
  };

  const setupEventStream = (jobId) => {
    eventSourceRef.current?.close();
    const es = new EventSource(`${API_BASE}/stream-status/${jobId}`);
    eventSourceRef.current = es;

    es.onmessage = (e) => {
      if (e.data.includes('complete')) {
        const data = JSON.parse(e.data);
        setStatus('complete');
      } else if (!isNaN(e.data)) {
        setProgress(parseInt(e.data));
      }
    };
  };

  return (
    <div className="app">
      <h1>Factorial Computation</h1>
      <div className="computation-input">
        <input 
          type="number" 
          placeholder="Enter a number"
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
        <button onClick={handleCompute}>Start Computation</button>
      </div>

      {status === 'payment_pending' && paymentInfo && (
        <PayPalPaymentModal
          paymentInfo={paymentInfo}
          setPaymentInfo={setPaymentInfo}
          setStatus={setStatus}
          setJobId={setJobId}
        />
      )}

      {status === 'processing' && jobId && (
        <ComputationStatusPage 
          jobId={jobId}
          onBack={() => setStatus('idle')}
        />
      )}

      <ToastContainer />
    </div>
  );
}
