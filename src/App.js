import React, { useState, useEffect, useRef } from 'react';  
import { FaSpinner, FaDownload, FaInfoCircle, FaTimes } from 'react-icons/fa';  
import { ToastContainer, toast } from 'react-toastify';  
import 'react-toastify/dist/ReactToastify.css';  
import './App.css';  

const AppConfig = {
  MAX_INPUT: 1000000,
  // other configs...
};
// Configuration  
const API_BASE = window.location.hostname === 'localhost' 
     ? 'http://localhost:8000'
     : '/api'; 
// Works with both default Firebase domains
const PAYPAL_CLIENT_ID = "BAA8dKbVBT4qMLH-4mtdh2zLehGDZVbd7wOLXRIXmJobW_CJBNn2sqFpyqdnF5v1D6huRFXWISHMU2LSM8";  
const HOSTED_BUTTON_ID = "9EUNPRHJB3SNQ";  
const PAYMENT_THRESHOLD = process.env.REACT_APP_PAYMENT_THRESHOLD || 1000;  
const PAYMENT_AMOUNT_USD = process.env.REACT_APP_PAYMENT_AMOUNT_USD || 4.99;  
  
function ComputationStatusPage({ jobId, onBack }) {  
  const [status, setStatus] = useState('processing');  
  const [progress, setProgress] = useState(0);  
  const eventSourceRef = useRef(null);  
  // Add this new state:  
const [downloadProgress, setDownloadProgress] = useState(0);  
  
  useEffect(() => {  
    localStorage.removeItem('pendingJobId');  
  
    const checkStatus = async () => {  
      try {  
        const res = await fetch(`${API_BASE}/job/${jobId}`);  
        if (res.ok) {  
          const data = await res.json();  
          if (data.status === 'complete') setStatus('complete');  
        }  
      } catch (err) {  
        console.error('Status check failed:', err);  
        logError(err); // Send to monitoring service  
      }
      };  
  
    checkStatus();  
  
    eventSourceRef.current = new EventSource(`${API_BASE}/stream-status/${jobId}`);  
      
    eventSourceRef.current.onmessage = (e) => {  
      if (e.data.includes('complete')) {  
        setStatus('complete');  
      } else if (!isNaN(e.data)) {  
        setProgress(parseInt(e.data));  
      }  
    };  
  
    return () => eventSourceRef.current?.close();  
  }, [jobId]);  
  
  return (  
    <div className="status-page">  
      {status === 'complete' ? (  
        <>  
          <h3>Computation Complete!</h3>  
          <a   
            href={`${API_BASE}/download/${jobId}`}  
            className="download-button"  
            download={`factorial_${jobId}.txt`}  
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
                amount: PAYMENT_AMOUNT_USD.toFixed(2)  
              })  
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
            logError(err); // Send to monitoring service  
        }  
      }).render("#paypal-button-container");  
    } catch (err) {  
      logError(err); // Send to monitoring service  
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
          
        // Properly verify with backend  
        const res = await fetch(`${API_BASE}/verify-payment`, {  
          method: 'POST',  
          headers: { 'Content-Type': 'application/json' },  
          body: JSON.stringify({ transaction_id: txId })  
        });  
  
        if (!res.ok) throw new Error('Payment verification failed');  
  
        const data = await res.json();  
          
        // Use the backend-generated job_id (not a temp ID!)  
        setJobId(data.job_id);  
        setStatus('processing');  
        window.history.replaceState({}, '', `/status/${data.job_id}`);  
          
      } catch (err) {  
        logError(err); // Send to monitoring service  
        console.error('Payment verification failed:', err);  
        setStatus('idle');  
        toast.error('Payment verification failed. Contact support with TX ID: ' + txId);  
        window.history.replaceState({}, '', window.location.pathname);  
      }  
    }  
  };  
    
  verifyPayment();  
}, []);  
 /* useEffect(() => {  
  const verifyPayment = async () => {  
    const params = new URLSearchParams(window.location.search);  
    const txId = params.get('tx');  
      
    if (txId) {  
      try {  
        // Emergency debug endpoint  
        const debugRes = await fetch(`${API_BASE}/debug/paypal-capture`, {  
          method: 'POST',  
          headers: {'Content-Type': 'application/json'},  
          body: JSON.stringify({txId, timestamp: new Date().toISOString()})  
        });  
          
        if (!debugRes.ok) throw new Error('Debug endpoint failed');  
          
        // Minimal verification  
        setStatus('processing');  
        setJobId(`temp-${txId.slice(0,8)}`);  
        toast.success("Payment received! Processing...");  
          
      } catch (err) {  
        console.error('EMERGENCY MODE ERROR:', err);  
        toast.error(`System in maintenance. Your TX ID: ${txId}`);  
      }  
      finally {  
        window.history.replaceState({}, '', window.location.pathname);  
      }  
    }  
  };  
  verifyPayment();  
}, []);  
*/  
 /* useEffect(() => {  
    const verifyPaymient1 = async () => {  
      const params = new URLSearchParams(window.location.search);  
      const txId = params.get('tx');  
      const hashJobId = window.location.hash.match(/#status\/(.+)/)?.[1];  
  
      if (txId && hashJobId) {  
        try {  
          const verificationUrl = `${API_BASE}/verify-payment/${hashJobId}?tx=${txId}`;  
          const res = await fetch(verificationUrl);  
            
          if (res.ok) {  
            const data = await res.json();  
            window.history.replaceState({}, '', window.location.pathname);  
            setJobId(data.job_id);  
            setStatus('processing');  
          } else {  
            throw new Error('Verification failed');  
          }  
        } catch (err) {  
          console.error('Payment verification failed:', err);  
          setStatus('idle');  
          toast.error('Invalid or expired payment session');  
          window.history.replaceState({}, '', window.location.pathname);  
        }  
      }  
    };  
      
    verifyPayment1();  
  }, []);  
*/  
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
    setTimeout(() => logsEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);  
  };  
  
  const handleCompute = async () => {  
    const num = Math.min(  
          Math.max(parseInt(input) || 0,  // Default to 0 if NaN  
          AppConfig.MAX_INPUT || 1_000_000 // Enforce server-side limit  
);  
   if (num <= 0) {  
      toast.error("Must be positive integer");  
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
      logError(error); // Send to monitoring service  
      addLog(`Error: ${error.message}`);  
      handleError(error);  
    }  
  };  
  
  const setupEventStream = (jobId) => {  
    eventSourceRef.current?.close();  
    const es = new EventSource(`${API_BASE}/stream-status/${jobId}`);  
    eventSourceRef.current = es;  
  
    fetch(`${API_BASE}/job/${jobId}`)  
      .then(res => {  
        if (!res.ok) throw new Error('Job not found');  
        return res.json();  
      })  
      .then(data => {  
        if (data.status === 'complete') {  
          handleCompletion(data.file_size);  
        }  
      })  
      .catch(err => {  
        logError(err); // Send to monitoring service  
        addLog(`Error: ${err.message}`);  
        handleError(err);  
      });  
  
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
const handleDownload = async (jobId) => {  
  try {  
    setDownloadProgress(0); // Reset progress  
      
    // 1. Verify computation is complete first  
    const statusCheck = await fetch(`${API_BASE}/job/${jobId}`);  
    if (!statusCheck.ok) throw new Error('Failed to verify job status');  
      
    const { status } = await statusCheck.json();  
    if (status !== 'complete') {  
      throw new Error('Computation not finished yet');  
    }  
  
    // 2. Start download with 30s timeout  
    const downloadUrl = `${API_BASE}/download/${jobId}`;  
    const response = await fetch(downloadUrl, {  
      signal: AbortSignal.timeout(30000) // Fails after 30 seconds  
    });  
  
    // 3. Handle failed download  
    if (!response.ok) {  
      throw new Error(`Server responded with ${response.status}`);  
    }  
  
    // 4. Process download stream with progress  
    const reader = response.body.getReader();  
    const contentLength = +response.headers.get('Content-Length');  
    let receivedLength = 0;  
    let chunks = [];  
      
    while (true) {  
      const { done, value } = await reader.read();  
      if (done) break;  
        
      chunks.push(value);  
      receivedLength += value.length;  
      setDownloadProgress(Math.round((receivedLength / contentLength) * 100));  
    }  
  
    // 5. Create and trigger download  
    const blob = new Blob(chunks);  
    const url = window.URL.createObjectURL(blob);  
    const link = document.createElement('a');  
    link.href = url;  
    link.download = `factorial_${jobId}.txt`;  
    document.body.appendChild(link);  
    link.click();  
  
    // 6. Cleanup  
    setTimeout(() => {  
      document.body.removeChild(link);  
      window.URL.revokeObjectURL(url);  
      setDownloadProgress(0);  
    }, 100);  
  
  } catch (error) {  
    // Handle different error types  
    const errorMsg = error.name === 'TimeoutError'   
      ? 'Download timed out (30s)'   
      : error.message;  
      
    toast.error(`Download failed: ${errorMsg}`);  
    logError(error); // Send to monitoring service  
    console.error('Download error:', error);  
    setDownloadProgress(0);  
  }  
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
  <div className="download-container">  
    <button   
      onClick={() => handleDownload(jobId)}  
      className="download-button"  
      disabled={downloadProgress > 0 && downloadProgress < 100}  
    >  
      {downloadProgress === 0 ? (  
        <><FaDownload /> Download Result</>  
      ) : downloadProgress === 100 ? (  
        'Download Complete!'  
      ) : (  
        `Downloading... ${downloadProgress}%`  
      )}  
    </button>  
      
    {downloadProgress > 0 && downloadProgress < 100 && (  
      <div className="download-progress-bar">  
        <div   
          className="download-progress-fill"   
          style={{ width: `${downloadProgress}%` }}  
        />  
      </div>  
    )}  
  </div>  
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
