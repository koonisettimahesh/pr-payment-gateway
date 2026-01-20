# Payment Gateway Architecture

## Overview

This document describes the high-level architecture and component design for the Production-Ready Payment Gateway system built across Deliverable 1 and Deliverable 2. The system emulates core capabilities of platforms like Razorpay and Stripe, including merchant onboarding, order and payment processing, hosted checkout, asynchronous background jobs, webhook delivery, refunds, and an embeddable JavaScript SDK.

The architecture follows a service-oriented, event-driven design with strong separation of concerns, asynchronous job processing, and production-grade reliability patterns.

---

## System Components

### 1. API Service (gateway_api)

**Port:** 8000
**Technology:** Spring Boot (reference), Node.js / FastAPI / Express.js (implementation-agnostic)
**Responsibilities:**

* Merchant authentication via API key and secret
* Order management (create, fetch)
* Payment creation (sync in Deliverable 1, async in Deliverable 2)
* Public checkout endpoints
* Refund initiation
* Webhook configuration and logs
* Idempotency key handling
* Job enqueueing to Redis
* Health checks

---

### 2. Worker Service (gateway_worker)

**Technology:** Same runtime as API (separate container)

**Responsibilities:**

* Background job processing using Redis queues
* Payment processing simulation
* Webhook delivery with retry logic
* Refund processing

**Workers Implemented:**

* PaymentWorker
* WebhookWorker
* RefundWorker

---

### 3. PostgreSQL Database (pg_gateway)

**Port:** 5432
**Purpose:** Persistent storage for all business data

**Core Tables:**

* merchants
* orders
* payments
* refunds
* webhook_logs
* idempotency_keys

---

### 4. Redis (redis_gateway)

**Port:** 6379
**Purpose:**

* Job queue backend
* Background processing coordination
* Job status tracking

---

### 5. Dashboard Frontend (gateway_dashboard)

**Port:** 3000
**Technology:** React

**Responsibilities:**

* Merchant login
* API credentials display
* Payment and transaction statistics
* Transactions listing
* Webhook configuration
* Webhook delivery logs
* Manual webhook retry
* API documentation and SDK usage guide

---

### 6. Checkout Frontend (gateway_checkout)

**Port:** 3001
**Technology:** React

**Responsibilities:**

* Hosted checkout page
* Order summary display
* UPI and card payment forms
* Payment submission
* Processing UI
* Polling payment status
* Displaying success and failure states

---

### 7. Embeddable SDK (checkout-widget)

**Technology:** Vanilla JavaScript + Webpack

**Responsibilities:**

* Modal overlay creation
* Iframe injection
* Checkout page embedding
* PostMessage communication
* Payment success/failure callbacks

---

## Deployment Architecture

```text
+--------------------+       +---------------------+       +---------------------+
|   Merchant App     | <---> |   gateway_api       | <---> |     PostgreSQL      |
| (SDK or Direct API)|       |   (Port 8000)       |       |     (Port 5432)     |
+--------------------+       +---------------------+       +---------------------+
           |                           |
           |                           v
           |                    +---------------------+
           |                    |        Redis        |
           |                    |    (Port 6379)      |
           |                    +---------------------+
           |                           |
           |                           v
           |                    +---------------------+
           |                    |   gateway_worker    |
           |                    |   (Background Jobs)|
           |                    +---------------------+
           |
           v
+---------------------+       +---------------------+
|  Checkout Frontend  | <---> |  Dashboard Frontend |
|    (Port 3001)      |       |     (Port 3000)     |
+---------------------+       +---------------------+
```

---

## Data Flow

### 1. Merchant Onboarding (Seeded)

* On API startup, a test merchant is auto-created:

  * email: [test@example.com](mailto:test@example.com)
  * api_key: key_test_abc123
  * api_secret: secret_test_xyz789
  * webhook_secret: whsec_test_abc123 (Deliverable 2)

---

### 2. Create Order Flow

1. Merchant calls POST /api/v1/orders
2. API authenticates merchant
3. Validates input
4. Generates order ID (order_XXXXXXXXXXXXXX)
5. Persists order
6. Returns order details

---

### 3. Create Payment Flow (Deliverable 1)

1. Merchant or checkout page submits payment request
2. API validates method-specific inputs
3. Generates payment ID (pay_XXXXXXXXXXXXXX)
4. Creates payment record with status = processing
5. Simulates delay (5–10 seconds)
6. Randomly determines success/failure
7. Updates payment status
8. Returns payment response

---

### 4. Create Payment Flow (Deliverable 2 - Async)

1. Merchant calls POST /api/v1/payments
2. API validates authentication and input
3. Checks idempotency key (if provided)
4. Generates payment ID
5. Creates payment record with status = pending
6. Enqueues ProcessPaymentJob(payment_id) to Redis
7. Returns response immediately

**Worker Side:**
8. PaymentWorker dequeues job
9. Simulates delay
10. Determines outcome
11. Updates payment status
12. Enqueues webhook delivery job

---

### 5. Webhook Delivery Flow

1. WebhookWorker fetches merchant webhook config
2. Generates HMAC-SHA256 signature
3. Sends POST request to merchant webhook_url
4. Logs attempt
5. On failure, schedules retry with exponential backoff
6. After 5 failures, marks as permanently failed

---

### 6. Refund Flow

1. Merchant calls POST /api/v1/payments/{payment_id}/refunds
2. API validates refundable state
3. Creates refund record (status = pending)
4. Enqueues ProcessRefundJob(refund_id)

**Worker Side:**
5. RefundWorker dequeues job
6. Simulates delay
7. Marks refund as processed
8. Enqueues webhook delivery job

---

### 7. Checkout Page Flow

1. User visits /checkout?order_id=xxx
2. Checkout frontend calls public order endpoint
3. Displays order summary
4. User selects payment method
5. Submits payment form
6. Calls public payment endpoint
7. Shows processing state
8. Polls /api/v1/payments/{payment_id}
9. Shows success or error state
10. Sends postMessage to SDK (if embedded)

---

### 8. Embeddable SDK Flow

1. Merchant loads checkout.js
2. Initializes PaymentGateway instance
3. Calls open()
4. SDK injects modal + iframe
5. Checkout page runs inside iframe
6. On payment completion, iframe posts message
7. SDK handles callbacks and closes modal

---

## Job Queue Architecture

**Queue Backend:** Redis

**Job Types:**

* ProcessPaymentJob
* DeliverWebhookJob
* ProcessRefundJob

**Processing Pattern:**

* API enqueues jobs
* Worker dequeues and processes jobs
* Workers update database state
* Workers enqueue follow-up jobs

---

## Database Design

### merchants

* id (UUID)
* name
* email
* api_key
* api_secret
* webhook_url
* webhook_secret
* is_active
* created_at
* updated_at

### orders

* id (order_*)
* merchant_id
* amount
* currency
* receipt
* notes (JSON)
* status
* created_at
* updated_at

### payments

* id (pay_*)
* order_id
* merchant_id
* amount
* currency
* method
* status
* vpa
* card_network
* card_last4
* error_code
* error_description
* captured
* created_at
* updated_at

### refunds

* id (rfnd_*)
* payment_id
* merchant_id
* amount
* reason
* status
* created_at
* processed_at

### webhook_logs

* id (UUID)
* merchant_id
* event
* payload (JSON)
* status
* attempts
* last_attempt_at
* next_retry_at
* response_code
* response_body
* created_at

### idempotency_keys

* key
* merchant_id
* response (JSON)
* created_at
* expires_at

---

## Security Architecture

* API authentication via X-Api-Key and X-Api-Secret
* Webhook signatures via HMAC-SHA256
* Card data protection (store only last 4 digits)
* Environment-based configuration
* Test mode for deterministic behavior

---

## Reliability Patterns

* Asynchronous job queues
* Idempotent payment creation
* Exponential backoff for webhook retries
* Health checks for all services
* Deterministic test mode

---

## Environment Configuration

```env
DATABASE_URL=postgresql://gateway_user:gateway_pass@postgres:5432/payment_gateway
PORT=8000
REDIS_URL=redis://redis:6379

TEST_MERCHANT_EMAIL=test@example.com
TEST_API_KEY=key_test_abc123
TEST_API_SECRET=secret_test_xyz789

UPI_SUCCESS_RATE=0.90
CARD_SUCCESS_RATE=0.95
PROCESSING_DELAY_MIN=5000
PROCESSING_DELAY_MAX=10000

TEST_MODE=false
TEST_PAYMENT_SUCCESS=true
TEST_PROCESSING_DELAY=1000

WEBHOOK_RETRY_INTERVALS_TEST=false
```

---

## Summary

This architecture supports:

* Production-grade payment processing
* Asynchronous background jobs
* Webhook-based event delivery
* Idempotent API operations
* Secure card and webhook handling
* Scalable job queue design
* Embeddable checkout experience

The system is modular, fault-tolerant, and extensible, following real-world fintech architectural patterns used by Stripe and Razorpay.
