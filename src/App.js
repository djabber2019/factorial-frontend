import React, { useState, useEffect, useRef } from 'react';
import { FaSpinner, FaDownload, FaInfoCircle, FaTimes } from 'react-icons/fa';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import './App.css';

const API_BASE = window.location.protocol === 'https:' 
     ? 'https://factorial-backend.sliplane.app'
     : 'http://localhost:8000';
const PAYPAL_CLIENT_ID = "AVZKHeKzHVF3PFZc3SKap5FYU2bctp7kitAVF_qo2i2Wk2dXMwIgmr2c88i6oQmU00FgKn598ql748zu";
const HOSTED_BUTTON_ID = "9EUNPRHJB3SNQ";
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
          <a 
            href={`${API_BASE}/download/${jobId}`}
            className="download-button"
            download
          >
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
  const [paypalSdkReady, setPaypalSdkReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastTransactionId, setLastTransactionId] = useState(null);

  useEffect(() => {
    if (window.paypal) {
      setPaypalSdkReady(true);
      setLoading(false);
      return;
    }

const script = document.createElement('script');
script.src = `https://www.paypal.com/sdk/js?client-id=${PAYPAL_CLIENT_ID}&components=buttons,hosted-buttons&disable-funding=venmo&currency=USD&intent=capture`;
script.async = true;
script.crossOrigin = "anonymous";  // Add this to enable card payments
       
script.onload = () => {
      if (window.paypal) {
        setPaypalSdkReady(true);
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

    return () => {
     document.body.removeChild(script);
    };
  }, []);

  const initializeButton = () => {
  try {
    window.paypal.HostedButtons({
      hostedButtonId: HOSTED_BUTTON_ID,
    //  onInit: (data, actions) => {
        // Configure the hosted button behavior
       // actions.configure({
         // flow: 'checkout',  // More direct payment flow
         // enableShippingAddress: false,  // Disable address collection
          //userAction: 'pay_now'  // Skip review step
      //  });
     // }, 
     onApprove: async (data, actions) => {
          try {
            setStatus('verifying_payment');
            setLastTransactionId(data.orderID);
            
            // Extended verification period
            await new Promise(resolve => setTimeout(resolve, 3000));
            
            const response = await fetch(`${API_BASE}/capture-paypal-order`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                payment_id: data.orderID,
                payer_id: data.payerID,
                n: paymentInfo.n,
                amount: PAYMENT_AMOUNT_USD
              })
            });

            if (!response.ok) {
              const errorData = await response.json();
              throw new Error(errorData.detail || "Payment verification failed");
            }
            
            const result = await response.json();
            setJobId(result.job_id);
            setStatus('processing');
            setPaymentInfo(null);
            
            // Redirect to status page using hash router
            window.location.hash = `#status/${result.job_id}`;
            
          } catch (err) {
            console.error('Payment error:', err);
            setError(err.message || "Payment processing failed. Please try again.");
            setStatus('payment_pending');
          }
        },
        onError: (err) => {
          console.error('PayPal error:', err);
          setError(err.message || "Payment processing failed. Please try again.");
          setStatus('payment_pending');
        }
      }).render("#paypal-button-container");
    } catch (err) {
      console.error('Button render error:', err);
      setError("Failed to initialize payment button. Please refresh the page.");
    }
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
            <span>Loading payment options...</span>
          </div>
        )}

        {error && (
          <div className="payment-error">
            <p>Error: {error}</p>
            {lastTransactionId && (
              <p>Transaction ID: {lastTransactionId}</p>
            )}
            <button 
              className="retry-button"
              onClick={() => {
                setError(null);
                setLoading(true);
                setPaypalSdkReady(false);
              }}
            >
              Retry Payment
            </button>
          </div>
        )}

        <div className="customer-note">
          <div className="customer-note-title">Important Note:</div>
          <div className="customer-note-content">
            Results will be delivered as a downloadable file. 
            Large computations may take several minutes to complete.
          </div>
        </div>

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
  const eventSourceRef = useRef(null);
  const timerRef = useRef(null);
  const logsEndRef = useRef(null);

  // Handle hash routing for status page
  useEffect(() => {
    const handleHashChange = () => {
      const match = window.location.hash.match(/#status\/([a-z0-9-]+)/i);
      if (match) {
        setJobId(match[1]);
        setStatus('processing');
      }
    };
    
    window.addEventListener('hashchange', handleHashChange);
    handleHashChange(); // Check initial URL
    
    return () => window.removeEventListener('hashchange', handleHashChange);
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

  return (
    <div className="app-container">
      {status === 'processing' && jobId ? (
        <ComputationStatusPage 
          jobId={jobId}
          onBack={() => {
            setStatus('idle');
            setJobId(null);
            window.location.hash = '';
          }}
        />
      ) : (
        <>
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

          {paymentInfo && (
            <PayPalPaymentModal 
              paymentInfo={paymentInfo}
              setPaymentInfo={setPaymentInfo}
              setStatus={setStatus}
              setJobId={setJobId}
            />
          )}

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
        </>
      )}
    </div>
  );
}


