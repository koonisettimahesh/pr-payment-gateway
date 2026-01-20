# Payment Gateway API Documentation

Base URL: `http://localhost:8000`

This document describes all REST API endpoints for the Payment Gateway system, including authentication, order management, payment processing, refunds, webhooks, and test utilities.

---

## Authentication

All protected endpoints require these headers:

```
X-Api-Key: <merchant_api_key>
X-Api-Secret: <merchant_api_secret>
```

For testing, use the seeded merchant:

```
X-Api-Key: key_test_abc123
X-Api-Secret: secret_test_xyz789
```

---

## Error Response Format (Standardized)

All errors follow this format:

```json
{
  "error": {
    "code": "BAD_REQUEST_ERROR",
    "description": "amount must be at least 100"
  }
}
```

### Allowed Error Codes

* `AUTHENTICATION_ERROR` – Invalid API credentials
* `BAD_REQUEST_ERROR` – Validation errors
* `NOT_FOUND_ERROR` – Resource not found
* `PAYMENT_FAILED` – Payment processing failed
* `INVALID_VPA` – VPA format invalid
* `INVALID_CARD` – Card validation failed
* `EXPIRED_CARD` – Card expiry invalid
* `INSUFFICIENT_REFUND_AMOUNT` – Refund amount exceeds available

---

## 1. Health Check

### `GET /health`

No authentication required.

**Response 200**

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

## 2. Create Order

### `POST /api/v1/orders`

**Headers**

```
X-Api-Key: key_test_abc123
X-Api-Secret: secret_test_xyz789
Content-Type: application/json
```

**Request Body**

```json
{
  "amount": 50000,
  "currency": "INR",
  "receipt": "receipt_123",
  "notes": {
    "customer_name": "John Doe"
  }
}
```

**Response 201**

```json
{
  "id": "order_NXhj67fGH2jk9mPq",
  "merchant_id": "550e8400-e29b-41d4-a716-446655440000",
  "amount": 50000,
  "currency": "INR",
  "receipt": "receipt_123",
  "notes": {
    "customer_name": "John Doe"
  },
  "status": "created",
  "created_at": "2024-01-15T10:30:00Z"
}
```

---

## 3. Get Order

### `GET /api/v1/orders/{order_id}`

**Headers**

```
X-Api-Key: key_test_abc123
X-Api-Secret: secret_test_xyz789
```

**Response 200**

```json
{
  "id": "order_NXhj67fGH2jk9mPq",
  "merchant_id": "550e8400-e29b-41d4-a716-446655440000",
  "amount": 50000,
  "currency": "INR",
  "receipt": "receipt_123",
  "notes": {},
  "status": "created",
  "created_at": "2024-01-15T10:30:00Z",
  "updated_at": "2024-01-15T10:30:00Z"
}
```

---

## 4. Create Payment (Async – Deliverable 2)

### `POST /api/v1/payments`

**Headers**

```
X-Api-Key: key_test_abc123
X-Api-Secret: secret_test_xyz789
Idempotency-Key: unique_request_id_123 (optional)
Content-Type: application/json
```

### UPI Request

```json
{
  "order_id": "order_NXhj67fGH2jk9mPq",
  "method": "upi",
  "vpa": "user@paytm"
}
```

### Card Request

```json
{
  "order_id": "order_NXhj67fGH2jk9mPq",
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

**Response 201**

```json
{
  "id": "pay_H8sK3jD9s2L1pQr",
  "order_id": "order_NXhj67fGH2jk9mPq",
  "amount": 50000,
  "currency": "INR",
  "method": "upi",
  "vpa": "user@paytm",
  "status": "pending",
  "created_at": "2024-01-15T10:31:00Z"
}
```

---

## 5. Get Payment

### `GET /api/v1/payments/{payment_id}`

**Headers**

```
X-Api-Key: key_test_abc123
X-Api-Secret: secret_test_xyz789
```

**Response 200**

```json
{
  "id": "pay_H8sK3jD9s2L1pQr",
  "order_id": "order_NXhj67fGH2jk9mPq",
  "amount": 50000,
  "currency": "INR",
  "method": "upi",
  "vpa": "user@paytm",
  "status": "success",
  "created_at": "2024-01-15T10:31:00Z",
  "updated_at": "2024-01-15T10:31:10Z"
}
```

---

## 6. Capture Payment

### `POST /api/v1/payments/{payment_id}/capture`

**Headers**

```
X-Api-Key: key_test_abc123
X-Api-Secret: secret_test_xyz789
Content-Type: application/json
```

**Request Body**

```json
{
  "amount": 50000
}
```

**Response 200**

```json
{
  "id": "pay_H8sK3jD9s2L1pQr",
  "order_id": "order_NXhj67fGH2jk9mPq",
  "amount": 50000,
  "currency": "INR",
  "method": "upi",
  "status": "success",
  "captured": true,
  "created_at": "2024-01-15T10:31:00Z",
  "updated_at": "2024-01-15T10:32:00Z"
}
```

---

## 7. Create Refund

### `POST /api/v1/payments/{payment_id}/refunds`

**Headers**

```
X-Api-Key: key_test_abc123
X-Api-Secret: secret_test_xyz789
Content-Type: application/json
```

**Request Body**

```json
{
  "amount": 50000,
  "reason": "Customer requested refund"
}
```

**Response 201**

```json
{
  "id": "rfnd_K9pL2mN4oQ5r",
  "payment_id": "pay_H8sK3jD9s2L1pQr",
  "amount": 50000,
  "reason": "Customer requested refund",
  "status": "pending",
  "created_at": "2024-01-15T10:33:00Z"
}
```

---

## 8. Get Refund

### `GET /api/v1/refunds/{refund_id}`

**Headers**

```
X-Api-Key: key_test_abc123
X-Api-Secret: secret_test_xyz789
```

**Response 200**

```json
{
  "id": "rfnd_K9pL2mN4oQ5r",
  "payment_id": "pay_H8sK3jD9s2L1pQr",
  "amount": 50000,
  "reason": "Customer requested refund",
  "status": "processed",
  "created_at": "2024-01-15T10:33:00Z",
  "processed_at": "2024-01-15T10:33:05Z"
}
```

---

## 9. List Webhook Logs

### `GET /api/v1/webhooks?limit=10&offset=0`

**Headers**

```
X-Api-Key: key_test_abc123
X-Api-Secret: secret_test_xyz789
```

**Response 200**

```json
{
  "data": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440001",
      "event": "payment.success",
      "status": "success",
      "attempts": 1,
      "created_at": "2024-01-15T10:31:10Z",
      "last_attempt_at": "2024-01-15T10:31:11Z",
      "response_code": 200
    }
  ],
  "total": 1,
  "limit": 10,
  "offset": 0
}
```

---

## 10. Retry Webhook

### `POST /api/v1/webhooks/{webhook_id}/retry`

**Headers**

```
X-Api-Key: key_test_abc123
X-Api-Secret: secret_test_xyz789
```

**Response 200**

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440001",
  "status": "pending",
  "message": "Webhook retry scheduled"
}
```

---

## 11. Public Checkout Endpoints

### Get Order (Public)

`GET /api/v1/orders/{order_id}/public`

```json
{
  "id": "order_NXhj67fGH2jk9mPq",
  "amount": 50000,
  "currency": "INR",
  "status": "created"
}
```

### Create Payment (Public)

`POST /api/v1/payments/public`

```json
{
  "order_id": "order_NXhj67fGH2jk9mPq",
  "method": "upi",
  "vpa": "user@paytm"
}
```

---

## 12. Test Endpoints (Required)

### Test Merchant

`GET /api/v1/test/merchant`

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "email": "test@example.com",
  "api_key": "key_test_abc123",
  "seeded": true
}
```

---

### Job Queue Status

`GET /api/v1/test/jobs/status`

```json
{
  "pending": 5,
  "processing": 2,
  "completed": 100,
  "failed": 0,
  "worker_status": "running"
}
```

---

## Webhook Events

Supported events:

* `payment.created`
* `payment.pending`
* `payment.success`
* `payment.failed`
* `refund.created`
* `refund.processed`

### Webhook Payload

```json
{
  "event": "payment.success",
  "timestamp": 1705315870,
  "data": {
    "payment": {
      "id": "pay_H8sK3jD9s2L1pQr",
      "order_id": "order_NXhj67fGH2jk9mPq",
      "amount": 50000,
      "currency": "INR",
      "method": "upi",
      "vpa": "user@paytm",
      "status": "success",
      "created_at": "2024-01-15T10:31:00Z"
    }
  }
}
```

---

## Environment Variables

```env
DATABASE_URL=postgresql://gateway_user:gateway_pass@postgres:5432/payment_gateway
PORT=8000

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

