import { useEffect, useState } from "react";
import "../styles/Dashboard.css";

export default function Webhooks() {
  const [webhookUrl, setWebhookUrl] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [logs, setLogs] = useState([]);

  const headers = {
    "X-Api-Key": "key_test_abc123",
    "X-Api-Secret": "secret_test_xyz789",
    "Content-Type": "application/json",
  };

  async function fetchConfig() {
    setWebhookUrl("");
    setWebhookSecret("whsec_test_abc123");
  }

  async function fetchLogs() {
    try {
      const res = await fetch(
        "http://localhost:8000/api/v1/webhooks?limit=10&offset=0",
        { headers }
      );
      const data = await res.json();
      setLogs(data.data || []);
    } catch (err) {
      console.error("Failed to load webhook logs", err);
    }
  }

  useEffect(() => {
    fetchConfig();
    fetchLogs();
  }, []);

  async function saveConfig(e) {
    e.preventDefault();

    try {
      await fetch("http://localhost:8000/api/v1/webhooks/config", {
        method: "POST",
        headers,
        body: JSON.stringify({ webhook_url: webhookUrl }),
      });

      alert("Webhook configuration saved");
    } catch (err) {
      console.error("Failed to save webhook config", err);
    }
  }

  async function regenerateSecret() {
    const newSecret = "whsec_" + Math.random().toString(36).substring(2, 10);
    setWebhookSecret(newSecret);
    alert("Webhook secret regenerated");
  }

  async function sendTestWebhook() {
    try {
      await fetch("http://localhost:8000/api/v1/webhooks/test", {
        method: "POST",
        headers
      });

      alert("Test webhook sent");
      fetchLogs();
    } catch (err) {
      console.error("Failed to send test webhook", err);
    }
  }

  async function retryWebhook(id) {
    try {
      await fetch(`http://localhost:8000/api/v1/webhooks/${id}/retry`, {
        method: "POST",
        headers,
      });

      fetchLogs();
    } catch (err) {
      console.error("Failed to retry webhook", err);
    }
  }

  return (
    <div data-test-id="webhook-config" className="dashboard-page">
      <h2>Webhook Configuration</h2>

      <form
        data-test-id="webhook-config-form"
        onSubmit={saveConfig}
      >
        <div className="credential">
          <label>Webhook URL</label>
          <input
            data-test-id="webhook-url-input"
            type="url"
            placeholder="https://yoursite.com/webhook"
            value={webhookUrl}
            onChange={(e) => setWebhookUrl(e.target.value)}
          />
        </div>

        <div className="credential">
          <label>Webhook Secret</label>
          <span data-test-id="webhook-secret">
            {webhookSecret || "Not generated"}
          </span>
          <button
            type="button"
            data-test-id="regenerate-secret-button"
            onClick={regenerateSecret}
            style={{ marginLeft: "12px" }}
          >
            Regenerate
          </button>
        </div>

        <div style={{ marginTop: "12px" }}>
          <button type="submit" data-test-id="save-webhook-button">
            Save Configuration
          </button>

          <button
            type="button"
            data-test-id="test-webhook-button"
            onClick={sendTestWebhook}
            style={{ marginLeft: "12px" }}
          >
            Send Test Webhook
          </button>
        </div>
      </form>

      <h3>Webhook Logs</h3>

      <table data-test-id="webhook-logs-table" className="transactions-table">
        <thead>
          <tr>
            <th>Event</th>
            <th>Status</th>
            <th>Attempts</th>
            <th>Last Attempt</th>
            <th>Response Code</th>
            <th>Actions</th>
          </tr>
        </thead>

        <tbody>
          {logs.map((log) => (
            <tr
              key={log.id}
              data-test-id="webhook-log-item"
              data-webhook-id={log.id}
            >
              <td data-test-id="webhook-event">{log.event}</td>

              <td data-test-id="webhook-status">{log.status}</td>

              <td data-test-id="webhook-attempts">{log.attempts}</td>

              <td data-test-id="webhook-last-attempt">
                {log.last_attempt_at
                  ? new Date(log.last_attempt_at).toLocaleString()
                  : "-"}
              </td>

              <td data-test-id="webhook-response-code">
                {log.response_code || "-"}
              </td>

              <td>
                {log.status === "failed" && (
                  <button
                    data-test-id="retry-webhook-button"
                    data-webhook-id={log.id}
                    onClick={() => retryWebhook(log.id)}
                  >
                    Retry
                  </button>
                )}
              </td>
            </tr>
          ))}

          {logs.length === 0 && (
            <tr>
              <td colSpan="6">No webhook logs found</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
