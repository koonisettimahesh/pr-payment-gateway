import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import "../styles/Dashboard.css";

export default function Dashboard() {
  const [stats, setStats] = useState({
    totalTransactions: 0,
    totalAmount: 0,
    successRate: 0,
  });

  useEffect(() => {
    async function fetchDashboardStats() {
      try {
        const payments = await fetch("http://localhost:8000/api/v1/payments", {
          headers: {
            "X-Api-Key": "key_test_abc123",
            "X-Api-Secret": "secret_test_xyz789",
          },
        }).then((res) => res.json());

        const totalTransactions = payments.length;

        const successfulPayments = payments.filter(
          (p) => p.status === "success",
        );

        const totalAmount = successfulPayments.reduce(
          (sum, p) => sum + p.amount,
          0,
        );

        const successRate =
          totalTransactions === 0
            ? 0
            : Math.round((successfulPayments.length / totalTransactions) * 100);

        setStats({
          totalTransactions,
          totalAmount,
          successRate,
        });
      } catch (err) {
        console.error("Failed to load dashboard stats", err);
      }
    }

    fetchDashboardStats();
  }, []);

  return (
    <div className="dashboard-page" data-test-id="dashboard">
      <header className="dashboard-header">
        <h1>Dashboard</h1>
        <Link to="/dashboard/transactions" className="link">
          View Transactions
        </Link>
      </header>

      {/* API Credentials */}
      <section className="card" data-test-id="api-credentials">
        <h2>API Credentials</h2>

        <div className="credential">
          <label>API Key</label>
          <span data-test-id="api-key">key_test_abc123</span>
        </div>

        <div className="credential">
          <label>API Secret</label>
          <span data-test-id="api-secret">secret_test_xyz789</span>
        </div>
      </section>

      {/* Stats */}
      <section className="stats" data-test-id="stats-container">
        <div className="stat-card">
          <span className="stat-label">Total Transactions</span>
          <span className="stat-value" data-test-id="total-transactions">
            {stats.totalTransactions}
          </span>
        </div>

        <div className="stat-card">
          <span className="stat-label">Total Amount</span>
          <span className="stat-value" data-test-id="total-amount">
            ₹{Math.floor(stats.totalAmount / 100)}
          </span>
        </div>

        <div className="stat-card">
          <span className="stat-label">Success Rate</span>
          <span className="stat-value" data-test-id="success-rate">
            {stats.successRate}%
          </span>
        </div>
      </section>
      <div style={{ marginTop: "16px" }}>
        <Link to="/dashboard/docs" className="link">
          API Docs
        </Link>

        {" | "}

        <Link to="/dashboard/webhooks" className="link">
          Webhooks
        </Link>
      </div>
    </div>
  );
}
