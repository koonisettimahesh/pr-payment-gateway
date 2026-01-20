# Payment Gateway – Production-Ready Fintech System

## Overview

This project implements a **production-ready payment gateway** inspired by Razorpay and Stripe. It supports merchant onboarding, order management, UPI and card payments, hosted checkout, asynchronous job processing, webhooks with retries, refunds, idempotency, and an embeddable JavaScript SDK.

It is built to demonstrate **real-world fintech architecture patterns**: API authentication, state machines for transaction lifecycles, background workers, webhook delivery with HMAC signatures, idempotency keys, retry logic with exponential backoff, and cross-origin embeddable widgets.

---

## Objectives

### Deliverable 1 – Core Gateway

* Merchant authentication via API key and secret
* Order creation and retrieval
* Payment processing (UPI and Cards)
* Hosted checkout page
* Database persistence
* Health check endpoint

### Deliverable 2 – Production Features

* Asynchronous payment processing (Redis + workers)
* Webhooks with HMAC signature verification and retries
* Refunds (full and partial)
* Idempotency keys
* Embeddable JavaScript SDK
* Enhanced merchant dashboard

---

## Architecture

**Services (Dockerized):**

* PostgreSQL (Database)
* Redis (Job Queue)
* API (Backend)
* Worker (Async Jobs)
* Dashboard (Merchant UI)
* Checkout (Hosted Payment Page)

---

## Project Structure

```
payment-gateway/
├── docker-compose.yml
├── README.md
├── .env.example
├── backend/
│   ├── Dockerfile
│   ├── Dockerfile.worker
│   ├── pom.xml / build.gradle
│   └── src/main/java/com/gateway/
│       ├── PaymentGatewayApplication.java
│       ├── config/
│       ├── controllers/
│       ├── models/
│       ├── repositories/
│       ├── services/
│       ├── workers/
│       └── jobs/
├── frontend/
│   ├── Dockerfile
│   └── src/
├── checkout-page/
│   ├── Dockerfile
│   └── src/
└── checkout-widget/
    ├── src/
    │   ├── sdk/
    │   └── iframe-content/
    ├── webpack.config.js
    └── dist/checkout.js
```

---

## Docker Setup

### Start All Services

```bash
docker-compose up -d
```

### Services & Ports

| Service    | Container Name    | Port |
| ---------- | ----------------- | ---- |
| PostgreSQL | pg_gateway        | 5432 |
| Redis      | redis_gateway     | 6379 |
| API        | gateway_api       | 8000 |
| Worker     | gateway_worker    | —    |
| Dashboard  | gateway_dashboard | 3000 |
| Checkout   | gateway_checkout  | 3001 |

---

## Environment Configuration

Create `.env` from `.env.example`:

```env
DATABASE_URL=postgresql://gateway_user:gateway_pass@postgres:5432/payment_gateway
PORT=8000

# Test merchant credentials (pre-seeded)
TEST_MERCHANT_EMAIL=test@example.com
TEST_API_KEY=key_test_abc123
TEST_API_SECRET=secret_test_xyz789

# Payment simulation config
UPI_SUCCESS_RATE=0.90
CARD_SUCCESS_RATE=0.95
PROCESSING_DELAY_MIN=5000
PROCESSING_DELAY_MAX=10000

# Test mode for evaluation (required)
TEST_MODE=false
TEST_PAYMENT_SUCCESS=true
TEST_PROCESSING_DELAY=1000

# Webhook retry test mode
WEBHOOK_RETRY_INTERVALS_TEST=false
```

---

## Database Schema

### Merchants

* `id` (UUID, PK)
* `name`, `email` (unique)
* `api_key` (unique), `api_secret`
* `webhook_url`, `webhook_secret`
* `is_active`
* `created_at`, `updated_at`

### Orders

* `id` (order_XXXXXXXXXXXXXX)
* `merchant_id` (FK)
* `amount`, `currency`
* `receipt`, `notes`
* `status`
* `created_at`, `updated_at`

### Payments

* `id` (pay_XXXXXXXXXXXXXX)
* `order_id` (FK)
* `merchant_id` (FK)
* `amount`, `currency`
* `method`, `status`
* `vpa`
* `card_network`, `card_last4`
* `error_code`, `error_description`
* `captured`
* `created_at`, `updated_at`

### Refunds

* `id` (rfnd_XXXXXXXXXXXXXX)
* `payment_id` (FK)
* `merchant_id` (FK)
* `amount`, `reason`
* `status`
* `created_at`, `processed_at`

### Webhook Logs

* `id` (UUID, PK)
* `merchant_id` (FK)
* `event`, `payload`
* `status`, `attempts`
* `last_attempt_at`, `next_retry_at`
* `response_code`, `response_body`
* `created_at`

### Idempotency Keys

* `key`, `merchant_id`
* `response`
* `created_at`, `expires_at`

---

## Seeded Test Merchant

| Field          | Value                                       |
| -------------- | ------------------------------------------- |
| id             | 550e8400-e29b-41d4-a716-446655440000        |
| name           | Test Merchant                               |
| email          | [test@example.com](mailto:test@example.com) |
| api_key        | key_test_abc123                             |
| api_secret     | secret_test_xyz789                          |
| webhook_secret | whsec_test_abc123                           |

---

## API Endpoints

### Health Check

`GET /health`

```json
{
  "status": "healthy",
  "database": "connected",
  "redis": "connected",
  "worker": "running",
  "timestamp": "2024-01-15T10:30:00Z"
}
```

---

### Create Order

`POST /api/v1/orders`

Headers:

```
X-Api-Key: key_test_abc123
X-Api-Secret: secret_test_xyz789
```

Body:

```json
{
  "amount": 50000,
  "currency": "INR",
  "receipt": "receipt_123"
}
```

---

### Get Order

`GET /api/v1/orders/{order_id}`

---

### Create Payment (Async)

`POST /api/v1/payments`

Headers:

```
X-Api-Key: key_test_abc123
X-Api-Secret: secret_test_xyz789
Idempotency-Key: unique_request_id
```

UPI:

```json
{
  "order_id": "order_xxx",
  "method": "upi",
  "vpa": "user@paytm"
}
```

Card:

```json
{
  "order_id": "order_xxx",
  "method": "card",
  "card": {
    "number": "4111111111111111",
    "expiry_month": "12",
    "expiry_year": "2025",
    "cvv": "123",
    "holder_name": "John Doe"
  }
}
```

---

### Capture Payment

`POST /api/v1/payments/{payment_id}/capture`

---

### Refund Payment

`POST /api/v1/payments/{payment_id}/refunds`

---

### Get Refund

`GET /api/v1/refunds/{refund_id}`

---

### Webhook Logs

`GET /api/v1/webhooks`

---

### Retry Webhook

`POST /api/v1/webhooks/{webhook_id}/retry`

---

### Test Endpoints

* `GET /api/v1/test/merchant`
* `GET /api/v1/test/jobs/status`

---

## Webhooks

### Events

* payment.created
* payment.pending
* payment.success
* payment.failed
* refund.created
* refund.processed

### Signature

HMAC-SHA256 over JSON payload using `webhook_secret`.

Header:

```
X-Webhook-Signature: <hex_signature>
```

---

## Job Queue

* **ProcessPaymentJob**
* **DeliverWebhookJob**
* **ProcessRefundJob**

Supports deterministic test mode:

```env
TEST_MODE=true
TEST_PAYMENT_SUCCESS=true
TEST_PROCESSING_DELAY=1000
WEBHOOK_RETRY_INTERVALS_TEST=true
```

---

## Checkout Page

URL:

```
http://localhost:3001/checkout?order_id=order_xxx
```

Supports:

* UPI & Card
* Processing state
* Polling payment status
* Success / Failure views

---

## Embeddable SDK

```html
<script src="http://localhost:3001/checkout.js"></script>
<button id="pay-button">Pay Now</button>

<script>
const checkout = new PaymentGateway({
  key: 'key_test_abc123',
  orderId: 'order_xyz',
  onSuccess: (response) => console.log(response),
  onFailure: (error) => console.log(error)
});

checkout.open();
</script>
```

---

## Dashboard

* Login: `/login`
* Home: `/dashboard`
* Transactions: `/dashboard/transactions`
* Webhooks: `/dashboard/webhooks`
* Docs: `/dashboard/docs`

---

## Testing Webhooks

```bash
node test-merchant/webhook-receiver.js
```

Webhook URL:

```
http://host.docker.internal:4000/webhook
```

---

## Common Pitfalls

* Incorrect ID formats
* Missing `/health`
* No seeded merchant
* Missing data-test-id attributes
* Improper card validation
* Not using env vars
* API starting before DB

