import React, { useState } from 'react';

function CheckoutForm() {
  const params = new URLSearchParams(window.location.search);
  const orderId = params.get('order_id');
  const apiKey = params.get('key');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  function sendMessageToParent(type, data) {
    window.parent.postMessage(
      {
        type: type, // 'payment_success', 'payment_failed', 'close_modal'
        data: data,
      },
      '*'
    );
  }

  async function handlePay() {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('http://localhost:8000/api/v1/payments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Api-Key': apiKey,
          'X-Api-Secret': 'secret_test_xyz789',
        },
        body: JSON.stringify({
          order_id: orderId,
          method: 'upi',
          vpa: 'user@paytm',
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error?.description || 'Payment failed');
      }

      // Send success message to parent
      sendMessageToParent('payment_success', {
        paymentId: data.id,
        status: data.status,
      });
    } catch (err) {
      setError(err.message);
      sendMessageToParent('payment_failed', {
        error: err.message,
      });
    } finally {
      setLoading(false);
    }
  }

  function handleClose() {
    sendMessageToParent('close_modal');
  }

  return (
    <div style={{ padding: '20px', fontFamily: 'Arial' }}>
      <h3>Checkout</h3>
      <p>Order ID: {orderId}</p>

      <button onClick={handlePay} disabled={loading}>
        {loading ? 'Processing...' : 'Pay Now'}
      </button>

      {error && <p style={{ color: 'red' }}>{error}</p>}

      <button onClick={handleClose} style={{ marginTop: '10px' }}>
        Cancel
      </button>
    </div>
  );
}

export default CheckoutForm;
