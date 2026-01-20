import { useLocation } from "react-router-dom";
import "../styles/Checkout.css";

export default function Failure() {
  const params = new URLSearchParams(useLocation().search);
  const error =
    params.get("error") || "Payment could not be processed";

  return (
    <div className="result-wrapper">
      <div
        className="result-card failure"
        data-test-id="error-state"
      >
        <div className="icon failure-icon">✕</div>

        <h2>Payment Failed</h2>

        <span
          className="result-message"
          data-test-id="error-message"
        >
          {error}
        </span>

        <button
          className="retry-btn"
          data-test-id="retry-button"
          onClick={() => window.history.back()}
        >
          Try Again
        </button>
      </div>
    </div>
  );
}
