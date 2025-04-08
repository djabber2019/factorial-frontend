import React, { useState, useEffect, useRef } from 'react';
import { FaSpinner, FaDownload, FaInfoCircle, FaTimes } from 'react-icons/fa';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import './App.css';
 
const getApiBase = () => {
  if (window.location.hostname === 'localhost') {
    return 'http://localhost:8000';
  }
  // For GitHub Pages and Sliplane deployments
  return 'https://factorial-backend.sliplane.app';
};

const API_BASE = getApiBase();
console.log('Using API base:', API_BASE); 
// Verify in browser console' 
const PAYPAL_CLIENT_ID = "AVZKHeKzHVF3PFZc3SKap5FYU2bctp7kitAVF_qo2i2Wk2dXMwIgmr2c88i6oQmU00FgKn598ql748zu";
const HOSTED_BUTTON_ID = "82CSUH5M9G9YN";
const PAYMENT_THRESHOLD = process.env.REACT_APP_PAYMENT_THRESHOLD || 1000;
const PAYMENT_AMOUNT_USD = process.env.REACT_APP_PAYMENT_AMOUNT_USD || 3.99;

export default function App() {
  const [input, setInput] = useState('');
  const [jobId, setJobId] = useState(null);
  const [status, setStatus] = useState('idle');
  const [progress, setProgress] = useState(0);
  const [timeElapsed, setTimeElapsed] = useState(0);
  const [paymentInfo, setPaymentInfo] = useState(null);
  const [logs, setLogs] = useState([]);
  const [showLogs, setShowLogs] = useState(false);
  const eventSourceRef = useRef(null);
  const timerRef = useRef(null);
  const logsEndRef = useRef(null);

  // Load PayPal SDK on component mount
  useEffect(() => {
    const script = document.createElement('script');
    script.src = `https://www.paypal.com/sdk/js?client-id=${PAYPAL_CLIENT_ID}&components=hosted-buttons&disable-funding=venmo&currency=USD`;
    script.async = true;
    script.crossOrigin = "anonymous";
    document.head.appendChild(script);

    return () => {
      document.head.removeChild(script);
    };
  }, []);

  const addLog = (message) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [...prev, `${timestamp}: ${message}`]);
    setTimeout(() => logsEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
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
    setTimeElapsed(0);

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
    clearInterval(timerRef.current);
    
    timerRef.current = setInterval(() => {
      setTimeElapsed(prev => {
        if (prev % 5 === 0) addLog(`Computation in progress (${prev}s elapsed)`);
        return prev + 1;
      });
    }, 1000);

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
      handleError(error);
    }
  };

  const setupEventStream = (jobId) => {
    eventSourceRef.current?.close();
    const es = new EventSource(`${API_BASE}/stream-status/${jobId}`);
    eventSourceRef.current = es;

    es.onmessage = (e) => {
      if (e.data.trim() === ": heartbeat") {
        setProgress(prev => Math.min(prev + 1, 99));
      }
    };

    es.addEventListener('complete', (e) => {
      try {
        const data = JSON.parse(e.data);
        handleCompletion(data.size);
        es.close();
      } catch (err) {
        handleError(new Error("Invalid completion data"));
      }
    });

    es.addEventListener('error', () => {
      handleError(new Error("Computation failed"));
      es.close();
    });
  };

  const handleCompletion = (size) => {
    addLog(`Computation completed! Result size: ${(size/1024).toFixed(1)}KB`);
    clearInterval(timerRef.current);
    setStatus('complete');
    setProgress(100);
    toast.success(`Computation completed in ${timeElapsed}s`);
  };

  const handleError = (error) => {
    addLog(`Error: ${error.message}`);
    clearInterval(timerRef.current);
    setStatus('error');
    toast.error(error.message);
  };

  const clearLogs = () => {
    setLogs([]);
    addLog('Logs cleared');
  };

  const PayPalPaymentModal = () => {
    const buttonContainerRef = useRef(null);

    useEffect(() => {
      if (!window.paypal || !buttonContainerRef.current) return;

      const hostedButton = window.paypal.HostedButtons({
        hostedButtonId: HOSTED_BUTTON_ID,
        onClick: () => {
          addLog('Payment initiated via PayPal');
          setStatus('payment_processing');
        },
        onError: (err) => {
          addLog(`Payment error: ${err.message || JSON.stringify(err)}`);
          toast.error("Payment failed. Please try again.");
          setStatus('payment_pending');
        },
        onCancel: () => {
          addLog('Payment cancelled by user');
          toast.warn("Payment was cancelled");
          setStatus('payment_pending');
        },
        onApprove: async (data) => {
          try {
            addLog(`Payment approved, capturing order: ${data.orderID}`);
            setStatus('verifying_payment');
            
            const response = await fetch(`${API_BASE}/capture-paypal-order`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                payment_id: data.orderID,
                payer_id: data.payerID
              })
            });

            if (!response.ok) {
              throw new Error("Payment verification failed");
            }

            const result = await response.json();
            addLog(`Payment captured, starting job: ${result.job_id}`);
            
            setJobId(result.job_id);
            setStatus('processing');
            setupEventStream(result.job_id);
            setPaymentInfo(null);
          } catch (error) {
            addLog(`Payment error: ${error.message}`);
            toast.error(error.message);
            setStatus('payment_pending');
          }
        }
      });

      hostedButton.render(buttonContainerRef.current).catch(err => {
        addLog(`Failed to render PayPal button: ${err}`);
        toast.error("Failed to load payment button");
      });

      return () => {
        // Cleanup if needed
      };
    }, []);

    return (
      <div className="payment-modal">
        <h3>Pay with PayPal</h3>
        <div className="payment-instructions">
          <p>Payment of ${PAYMENT_AMOUNT_USD} required for n &gt; {PAYMENT_THRESHOLD}</p>
          <div ref={buttonContainerRef} id="paypal-button-container"></div>
          <button 
            onClick={() => {
              setPaymentInfo(null);
              setStatus('idle');
            }}
            className="cancel-button"
          >
            Cancel Payment
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="app-container">
      <header className="app-header">
        <h1><FaInfoCircle /> Factorial Calculator</h1>
        <p>Compute massive factorials with distributed computing</p>
      </header>

      <div className="compute-card">
        <div className="input-group">
          {parseInt(input) > PAYMENT_THRESHOLD && status === 'idle' && (
            <div className="payment-tooltip">
              Payment required for computations &gt; {PAYMENT_THRESHOLD}
            </div>
          )}

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
          <button onClick={handleCompute} className="retry-button">
            Retry Calculation
          </button>
        )}

        <div className="logs-section">
          <div className="logs-header">
            <h3>Computation Logs</h3>
            <div className="logs-controls">
              <button onClick={() => setShowLogs(!showLogs)}>
                {showLogs ? 'Hide' : 'Show'} Logs
              </button>
              <button onClick={clearLogs} title="Clear logs">
                <FaTimes />
              </button>
            </div>
          </div>
          
          {showLogs && (
            <div className="logs-container">
              {logs.length > 0 ? (
                <>
                  <div className="logs-content">
                    {logs.map((log, index) => (
                      <div key={index} className="log-entry">{log}</div>
                    ))}
                    <div ref={logsEndRef} />
                  </div>
                </>
              ) : (
                <div className="empty-logs">No logs available</div>
              )}
            </div>
          )}
        </div>
      </div>

      {paymentInfo && <PayPalPaymentModal />}

      <ToastContainer
        position="bottom-right"
        autoClose={5000}
        hideProgressBar={false}
        newestOnTop
        closeOnClick
        pauseOnFocusLoss
        draggable
        pauseOnHover
      />
    </div>
  );
}
