import { useEffect, useState } from "react";
import { apiFetch } from "../services/api";
import { Link } from "react-router-dom";
import "../styles/Transactions.css";

export default function Transactions() {
  const [payments, setPayments] = useState([]);

  useEffect(() => {
    async function fetchPayments() {
      const data = await apiFetch("/api/v1/payments", {
        headers: {
          "X-Api-Key": "key_test_abc123",
          "X-Api-Secret": "secret_test_xyz789",
        },
      });
      setPayments(data);
    }

    fetchPayments();
  }, []);

  return (
    <div className="transactions-page">
      <div className="transactions-container">
        {/* 🔹 HEADER */}
        <header className="transactions-header">
          <h1>Transactions</h1>

          {/* ✅ Back to Dashboard */}
          <Link to="/dashboard" className="link">
            View Dashboard
          </Link>
        </header>

        {/* 🔹 TABLE */}
        <div className="table-card">
          <table data-test-id="transactions-table">
            <thead>
              <tr>
                <th>Payment ID</th>
                <th>Order ID</th>
                <th>Amount</th>
                <th>Method</th>
                <th>Status</th>
                <th>Created</th>
              </tr>
            </thead>

            <tbody>
              {payments.map((p) => (
                <tr
                  key={p.id}
                  data-test-id="transaction-row"
                  data-payment-id={p.id}
                >
                  <td data-test-id="payment-id">{p.id}</td>
                  <td data-test-id="order-id">{p.order_id}</td>
                  <td data-test-id="amount">₹{Math.floor(p.amount / 100)}</td>
                  <td data-test-id="method">{p.method}</td>
                  <td data-test-id="status" className={`status ${p.status}`}>
                    {p.status.toLowerCase()}
                  </td>

                  <td data-test-id="created-at">
                    {new Date(p.created_at).toLocaleString()}
                  </td>
                </tr>
              ))}

              {payments.length === 0 && (
                <tr>
                  <td colSpan="6" className="empty">
                    No transactions found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
