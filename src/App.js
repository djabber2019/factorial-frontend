import React, { useState, useEffect, useRef } from 'react';
import { FaSpinner, FaDownload, FaInfoCircle } from 'react-icons/fa';
import { PayPalScriptProvider, PayPalButtons } from "@paypal/react-paypal-js";
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import './App.css';

const API_BASE = process.env.REACT_APP_API_BASE || 'https://factorial-backend.sliplane.app';
const PAYMENT_THRESHOLD = 1000;
const PAYMENT_AMOUNT_USD = 3.99;

export default function App() {
  const [input, setInput] = useState('');
  const [jobId, setJobId] = useState(null);
  const [status, setStatus] = useState('idle');
  const [progress, setProgress] = useState(0);
  const [timeElapsed, setTimeElapsed] = useState(0);
  const [paymentInfo, setPaymentInfo] = useState(null);
  const eventSourceRef = useRef(null);
  const timerRef = useRef(null);

  useEffect(() => {
    return () => {
      eventSourceRef.current?.close();
      clearInterval(timerRef.current);
    };
  }, []);

  const handleCompute = async () => {
    const num = parseInt(input);
    if (isNaN(num) || num <= 0) {
      toast.error("Please enter a valid positive number");
      return;
    }

    setStatus(num > PAYMENT_THRESHOLD ? 'payment_pending' : 'processing');
    setTimeElapsed(0);

    if (num <= PAYMENT_THRESHOLD) {
      await startComputation(num);
    }
  };

  const startComputation = async (num) => {
    setStatus('processing');
    setProgress(0);
    clearInterval(timerRef.current);
    timerRef.current = setInterval(() => setTimeElapsed(prev => prev + 1), 1000);

    try {
      const response = await fetch(`${API_BASE}/compute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ n: num })
      });

      if (!response.ok) throw new Error("Computation failed");
      const data = await response.json();
      setJobId(data.job_id);
      setupEventStream(data.job_id);
    } catch (error) {
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

    es.addEventListener('error', (e) => {
      handleError(new Error("Computation failed"));
      es.close();
    });
  };

  const handleCompletion = (size) => {
    clearInterval(timerRef.current);
    setStatus('complete');
    setProgress(100);
    toast.success(`Computation completed in ${timeElapsed}s | Result size: ${(size/1024).toFixed(1)}KB`);
  };

  const handleError = (error) => {
    clearInterval(timerRef.current);
    setStatus('error');
    toast.error(error.message);
  };

  const PayPalPaymentModal = () => (
    <div className="payment-modal">
      <h3>Pay with PayPal</h3>
      <div className="payment-instructions">
        <p>Payment of ${PAYMENT_AMOUNT_USD} USD required for computations > {PAYMENT_THRESHOLD}</p>
        
        <PayPalScriptProvider 
          options={{ 
            "client-id": process.env.REACT_APP_PAYPAL_CLIENT_ID,
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
