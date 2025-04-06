import React, { useState, useEffect, useRef } from 'react';
import { FaSpinner, FaDownload, FaInfoCircle, FaTimes } from 'react-icons/fa';
import { PayPalScriptProvider, PayPalButtons } from "@paypal/react-paypal-js";
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import './App.css';

const API_BASE = process.env.REACT_APP_API_BASE || 'https://factorial-backend.sliplane.app';
const PAYPAL_CLIENT_ID = process.env.PAYPAL_CLIENT_ID || 'AVZKHeKzHVF3PFZc3SKap5FYU2bctp7kitAVF_qo2i2Wk2dXMwIgmr2c88i6oQmU00FgKn598ql748zu';
const PAYMENT_THRESHOLD = 1000;
const PAYMENT_AMOUNT_USD = 3.99;

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

  const addLog = (message) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [...prev, `${timestamp}: ${message}`]);
    setTimeout(() => logsEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
  };

  useEffect(() => {
    return () => {
      addLog('Cleaning up computation resources');
      eventSourceRef.current?.close();
      clearInterval(timerRef.current);
    };
  }, []);

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
      addLog('Starting computation without payment');
      await startComputation(num);
    } else {
      addLog(`Payment required for computations > ${PAYMENT_THRESHOLD}`);
      setPaymentInfo({ amount: PAYMENT_AMOUNT_USD, n: num });
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
      addLog('Sending request to computation backend');
      const response = await fetch(`${API_BASE}/compute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ n: num })
      });

      if (!response.ok) {
        const errorData = await response.text();
        addLog(`Computation failed: ${errorData}`);
        throw new Error("Computation failed");
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
    addLog(`Setting up event stream for job ${jobId}`);
    eventSourceRef.current?.close();
    const es = new EventSource(`${API_BASE}/stream-status/${jobId}`);
    eventSourceRef.current = es;

    es.onopen = () => {
      addLog('Connected to computation event stream');
    };

    es.onmessage = (e) => {
      if (e.data.trim() === ": heartbeat") {
        setProgress(prev => {
          const newProgress = Math.min(prev + 1, 99);
          if (newProgress % 10 === 0) addLog(`Progress: ${newProgress}%`);
          return newProgress;
        });
      }
    };

    es.addEventListener('complete', (e) => {
      try {
        const data = JSON.parse(e.data);
        addLog(`Computation completed! Result size: ${data.size} bytes`);
        handleCompletion(data.size);
        es.close();
      } catch (err) {
        addLog('Error parsing completion data');
        handleError(new Error("Invalid completion data"));
      }
    });

    es.addEventListener('error', (e) => {
      addLog('Event stream error - computation failed');
      handleError(new Error("Computation failed"));
      es.close();
    });
  };

  const handleCompletion = (size) => {
    addLog(`Finalizing computation results (${(size/1024).toFixed(1)}KB)`);
    clearInterval(timerRef.current);
    setStatus('complete');
    setProgress(100);
    toast.success(`Computation completed in ${timeElapsed}s | Result size: ${(size/1024).toFixed(1)}KB`);
  };

  const handleError = (error) => {
    addLog(`Computation error: ${error.message}`);
    clearInterval(timerRef.current);
    setStatus('error');
    toast.error(error.message);
  };

  const clearLogs = () => {
    setLogs([]);
    addLog('Logs cleared - ready for new computation');
  };

  const PayPalPaymentModal = () => (
    <div className="payment-modal">
      <h3>Pay with PayPal</h3>
      <div className="payment-instructions">
        <p>Payment of ${PAYMENT_AMOUNT_USD} USD required for computations > {PAYMENT_THRESHOLD}</p>
        
        <PayPalScriptProvider 
          options={{ 
            "client-id": process.env.PAYPAL_CLIENT_ID,
            "currency": "USD",
            "intent": "capture"
          }}
        >
          <PayPalButtons
            style={{ 
              layout: "vertical",
              color: "gold",
              shape: "rect",
              label: "buynow",
              height: 45
            }}
            createOrder={async (data, actions) => {
              const response = await fetch(`${API_BASE}/create-paypal-order`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ n: parseInt(input) })
              });
              const orderData = await response.json();
              return orderData.paymentID;
            }}
            onApprove={async (data, actions) => {
              setStatus('verifying');
              try {
                const response = await fetch(`${API_BASE}/capture-paypal-order`, {
                  method: "POST",
                  headers: { "Content-Type": "application/x-www-form-urlencoded" },
                  body: `paymentID=${data.orderID}&payerID=${data.payerID}`
                });

                if (!response.ok) throw new Error("Payment verification failed");
                
                const result = await response.json();
                setJobId(result.job_id);
                setStatus('processing');
                setupEventStream(result.job_id);
                setPaymentInfo(null);
              } catch (error) {
                toast.error(error.message);
                setStatus('payment_pending');
              }
            }}
            onError={(err) => {
              toast.error("Payment failed");
              setStatus('payment_pending');
            }}
            onCancel={() => {
              toast.warning("Payment cancelled");
              setStatus('idle');
            }}
          />
        </PayPalScriptProvider>
      </div>
    </div>
  );

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
              Payment required for computations > {PAYMENT_THRESHOLD}
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
