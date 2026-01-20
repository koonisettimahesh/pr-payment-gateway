import React from "react";

const Docs = () => {
  return (
    <div
      data-test-id="api-docs"
      style={{ padding: "24px", maxWidth: "900px", margin: "0 auto" }}
    >
      <h2>Integration Guide</h2>

      {/* 1. Create Order */}
      <section data-test-id="section-create-order" style={{ marginTop: "24px" }}>
        <h3>1. Create Order</h3>
        <pre data-test-id="create-order-code">
          <code>{`curl -X POST http://localhost:8000/api/v1/orders \\
  -H "X-Api-Key: key_test_abc123" \\
  -H "X-Api-Secret: secret_test_xyz789" \\
  -H "Content-Type: application/json" \\
  -d '{
    "amount": 50000,
    "currency": "INR",
    "receipt": "receipt_123"
  }'`}</code>
        </pre>
      </section>

      {/* 2. SDK Integration */}
      <section
        data-test-id="section-sdk-integration"
        style={{ marginTop: "24px" }}
      >
        <h3>2. SDK Integration</h3>
        <pre data-test-id="sdk-integration-code">
          <code>{`<script src="http://localhost:3001/checkout.js"></script>
<script>
const checkout = new PaymentGateway({
  key: 'key_test_abc123',
  orderId: 'order_xyz',
  onSuccess: (response) => {
    console.log('Payment ID:', response.paymentId);
  }
});
checkout.open();
</script>`}</code>
        </pre>
      </section>

      {/* 3. Verify Webhook Signature */}
      <section
        data-test-id="section-webhook-verification"
        style={{ marginTop: "24px" }}
      >
        <h3>3. Verify Webhook Signature</h3>
        <pre data-test-id="webhook-verification-code">
          <code>{`const crypto = require('crypto');

function verifyWebhook(payload, signature, secret) {
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(JSON.stringify(payload))
    .digest('hex');

  return signature === expectedSignature;
}`}</code>
        </pre>
      </section>
    </div>
  );
};

export default Docs;
