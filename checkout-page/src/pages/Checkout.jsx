import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../services/api";
import "../styles/Checkout.css";

export default function Checkout() {
  function sendMessageToParent(type, data) {
    if (window.parent !== window) {
      window.parent.postMessage({ type, data }, "*");
    }
  }

  function handleCancel() {
    sendMessageToParent("close_modal");
  }

  const navigate = useNavigate();

  const [order, setOrder] = useState(null);
  const [method, setMethod] = useState(null);
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");
  const params = new URLSearchParams(window.location.search);
  const orderId = params.get("order_id");

  useEffect(() => {
    async function fetchOrder() {
      try {
        const data = await apiFetch(`/api/v1/orders/${orderId}/public`);
        setOrder(data);
      } catch {
        setError("Order not found");
      }
    }

    fetchOrder();
  }, [orderId]);

  if (!orderId) {
    return <div>Invalid checkout URL. Missing order_id.</div>;
  }

  function pollPayment(paymentId) {
    const interval = setInterval(async () => {
      try {
        const res = await fetch(
          `http://localhost:8000/api/v1/payments/${paymentId}`,
          {
            headers: {
              "X-Api-Key": "key_test_abc123",
              "X-Api-Secret": "secret_test_xyz789",
            },
          },
        );

        const data = await res.json();

        // 🔹 Deliverable-2 async status check
        if (data.status !== "pending") {
          clearInterval(interval);

          if (data.status === "success") {
            sendMessageToParent("payment_success", {
              paymentId,
              orderId,
            });

            navigate(`/checkout/success?payment_id=${paymentId}`);
          } else {
            sendMessageToParent("payment_failed", {
              reason: "Payment failed",
              orderId,
            });

            navigate(`/checkout/failure?error=Payment failed`);
          }
        }
      } catch {
        clearInterval(interval);

        sendMessageToParent("payment_failed", {
          reason: "Payment failed",
          orderId,
        });

        navigate(`/checkout/failure?error=Payment failed`);
      }
    }, 2000);
  }

  /* UPI Payment */
  async function handleUPIPay(e) {
    e.preventDefault();
    setStatus("processing");
    setError("");

    try {
      const res = await apiFetch("/api/v1/payments/public", {
        method: "POST",
        headers: {
          "X-Api-Key": "key_test_abc123",
          "X-Api-Secret": "secret_test_xyz789",
        },
        body: JSON.stringify({
          order_id: orderId,
          method: "upi",
          vpa: e.target.vpa.value,
        }),
      });

      pollPayment(res.id);
    } catch (err) {
      setStatus("failed");
      const msg = err.error?.description || "Payment failed";
      setError(msg);

      sendMessageToParent("payment_failed", {
        reason: msg,
        orderId,
      });
    }
  }

  /* Card Payment */
  async function handleCardPay(e) {
    e.preventDefault();
    setStatus("processing");
    setError("");

    const rawNumber = e.target.number.value;
    const cleanedNumber = rawNumber.replace(/\s+/g, "");

    const [month, year] = e.target.expiry.value.split("/");
    const fullYear = year.length === 2 ? `20${year}` : year;

    try {
      const res = await apiFetch("/api/v1/payments", {
        method: "POST",
        headers: {
          "X-Api-Key": "key_test_abc123",
          "X-Api-Secret": "secret_test_xyz789",
        },
        body: JSON.stringify({
          order_id: orderId,
          method: "card",
          card: {
            number: cleanedNumber,
            expiry_month: month,
            expiry_year: fullYear,
            cvv: e.target.cvv.value,
            holder_name: e.target.name.value,
          },
        }),
      });

      pollPayment(res.id);
    } catch (err) {
      setStatus("failed");
      const msg = err.error?.description || "Payment failed";
      setError(msg);

      sendMessageToParent("payment_failed", {
        reason: msg,
        orderId,
      });
    }
  }

  if (!order) {
    return <div>Loading...</div>;
  }

  return (
    <div data-test-id="checkout-container">
      <div className="checkout-card">
        <div data-test-id="order-summary">
          <h2>Complete Payment</h2>

          <div>
            <span>Amount: </span>
            <span data-test-id="order-amount">
              ₹{(order.amount / 100).toFixed(2)}
            </span>
          </div>

          <div>
            <span>Order ID: </span>
            <span data-test-id="order-id">{order.id}</span>
          </div>
        </div>

        {/* Payment Methods */}
        <div data-test-id="payment-methods">
          <button
            data-test-id="method-upi"
            data-method="upi"
            onClick={() => setMethod("upi")}
          >
            UPI
          </button>

          <button
            data-test-id="method-card"
            data-method="card"
            onClick={() => setMethod("card")}
          >
            Card
          </button>
        </div>

        {/* UPI Form */}
        {method === "upi" && (
          <form data-test-id="upi-form" onSubmit={handleUPIPay}>
            <input
              data-test-id="vpa-input"
              name="vpa"
              placeholder="username@bank"
              required
            />
            <button data-test-id="pay-button" type="submit">
              Pay ₹{(order.amount / 100).toFixed(2)}
            </button>
          </form>
        )}

        {/* Card Form */}
        {method === "card" && (
          <form data-test-id="card-form" onSubmit={handleCardPay}>
            <input
              data-test-id="card-number-input"
              name="number"
              placeholder="Card Number"
              required
            />
            <input
              data-test-id="expiry-input"
              name="expiry"
              placeholder="MM/YY"
              required
            />
            <input
              data-test-id="cvv-input"
              name="cvv"
              placeholder="CVV"
              required
            />
            <input
              data-test-id="cardholder-name-input"
              name="name"
              placeholder="Name on Card"
              required
            />
            <button data-test-id="pay-button" type="submit">
              Pay ₹{(order.amount / 100).toFixed(2)}
            </button>
          </form>
        )}

        {/* Processing */}
        {status === "processing" && (
          <div data-test-id="processing-state">
            <span data-test-id="processing-message">Processing payment...</span>
          </div>
        )}

        {/* Error */}
        {status === "failed" && (
          <div data-test-id="error-state">
            <span data-test-id="error-message">{error}</span>
          </div>
        )}

        {/* Cancel */}
        <button
          data-test-id="cancel-button"
          onClick={handleCancel}
          style={{ marginTop: "10px" }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
