const express = require('express');
const crypto = require('crypto');

const app = express();
app.use(express.json());

app.post('/webhook', (req, res) => {
  const signature = req.headers['x-webhook-signature'];
  const payload = JSON.stringify(req.body);

  const expectedSignature = crypto
    .createHmac(
      'sha256',
      'whsec_test_1f969752537297d5a3604e5c2a4e6620920ec731f11dc640'
    )
    .update(payload)
    .digest('hex');

  if (signature !== expectedSignature) {
    console.log('❌ Invalid signature');
    return res.status(401).send('Invalid signature');
  }

  console.log('✅ Webhook verified:', req.body.event);
  console.log('Payment ID:', req.body.data.payment.id);

  res.status(200).send('OK');
});

app.listen(4000, '0.0.0.0', () => {
  console.log('Test merchant webhook running on port 4000');
});
