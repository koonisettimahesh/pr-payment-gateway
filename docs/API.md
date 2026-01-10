# Payment Gateway API Documentation

Base URL:
http://localhost:8000

---

## Authentication

All **merchant-protected endpoints** require the following headers:

```http

X-Api-Key: <merchant_api_key>
X-Api-Secret: <merchant_api_secret>

```

Public checkout endpoints **do not require authentication**.

---

## Health Check

### GET /health

Checks application and database health.

**Response – 200**

```json
{
  "status": "healthy",
  "database": "connected",
  "timestamp": "2024-01-15T10:30:00Z"
}
```

---

## Create Order

### POST /api/v1/orders

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

**Response – 201**

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

## Get Order

### GET /api/v1/orders/{order_id}

**Headers**

```
X-Api-Key: key_test_abc123
X-Api-Secret: secret_test_xyz789
```

**Response – 200**

```json
{
  "id": "order_NXhj67fGH2jk9mPq",
  "merchant_id": "550e8400-e29b-41d4-a716-446655440000",
  "amount": 50000,
  "currency": "INR",
  "status": "created",
  "created_at": "2024-01-15T10:30:00Z",
  "updated_at": "2024-01-15T10:30:00Z"
}
```

---

## Public Order (Checkout)

### GET /api/v1/orders/{order_id}/public

Used by the hosted checkout page (no authentication).

**Response – 200**

```json
{
  "id": "order_NXhj67fGH2jk9mPq",
  "amount": 50000,
  "currency": "INR",
  "status": "created"
}
```

---

## Create Payment (Public – Checkout)

### POST /api/v1/payments/public

Creates a payment from the hosted checkout page.

---

### UPI Payment

**Request Body**

```json
{
  "order_id": "order_NXhj67fGH2jk9mPq",
  "method": "upi",
  "vpa": "user@paytm"
}
```

**Response – 201**

```json
{
  "id": "pay_H8sK3jD9s2L1pQr",
  "status": "processing"
}
```

---

### Card Payment

**Request Body**

```json
{
  "order_id": "order_NXhj67fGH2jk9mPq",
  "method": "card",
  "card": {
    "number": "4111111111111111",
    "expiry_month": "12",
    "expiry_year": "2026",
    "cvv": "123",
    "holder_name": "John Doe"
  }
}
```

**Response – 201**

```json
{
  "id": "pay_H8sK3jD9s2L1pQr",
  "status": "processing"
}
```

---

## Get Payment Status

### GET /api/v1/payments/{payment_id}

**Headers**

```
X-Api-Key: key_test_abc123
X-Api-Secret: secret_test_xyz789
```

**Response – 200**

```json
{
  "id": "pay_H8sK3jD9s2L1pQr",
  "order_id": "order_NXhj67fGH2jk9mPq",
  "amount": 50000,
  "currency": "INR",
  "method": "card",
  "status": "success",
  "created_at": "2024-01-15T10:31:00Z",
  "updated_at": "2024-01-15T10:31:10Z"
}
```

---

## Test Merchant Endpoint

### GET /api/v1/test/merchant

Returns seeded test merchant details.

**Response – 200**

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "email": "test@example.com",
  "api_key": "key_test_abc123",
  "seeded": true
}
```

---

## Error Codes

All errors follow this format:

```json
{
  "error": {
    "code": "ERROR_CODE",
    "description": "Error description"
  }
}
```

### Supported Error Codes

| Code                 | Description               |
| -------------------- | ------------------------- |
| AUTHENTICATION_ERROR | Invalid API credentials   |
| BAD_REQUEST_ERROR    | Validation error          |
| NOT_FOUND_ERROR      | Resource not found        |
| INVALID_VPA          | VPA format invalid        |
| INVALID_CARD         | Card validation failed    |
| EXPIRED_CARD         | Card expiry invalid       |
| PAYMENT_FAILED       | Payment processing failed |

---

## Notes

* Amounts are stored in **paise** (₹500 = 50000)
* Payments skip `created` state and start at `processing`
* CVV and full card numbers are **never stored**
* Public checkout APIs are unauthenticated by design