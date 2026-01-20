import { useLocation } from "react-router-dom";
import "../styles/Checkout.css";

export default function Success() {
  const params = new URLSearchParams(useLocation().search);
  const paymentId = params.get("payment_id");

  return (
    <div className="result-wrapper">
      <div
        className="result-card success"
        data-test-id="success-state"
      >
        <div className="icon success-icon">✓</div>

        {/* ❗ Exact heading text required */}
        <h2>Payment Successful!</h2>

        <div>
          <span>Payment ID: </span>
          <span data-test-id="payment-id">
            {paymentId}
          </span>
        </div>

        <span
          className="result-message"
          data-test-id="success-message"
        >
          Your payment has been processed successfully
        </span>
      </div>
    </div>
  );
}
