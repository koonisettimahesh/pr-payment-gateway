# Database Schema – Payment Gateway

This document defines the complete PostgreSQL schema for the payment gateway system, covering **merchant onboarding**, **order management**, **payment processing**, **refunds**, **webhooks**, and **idempotency**.

The schema is designed to strictly match the evaluation requirements.

---

## 1. Merchants Table

Stores merchant accounts and API credentials.

```sql
CREATE TABLE merchants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  api_key VARCHAR(64) NOT NULL UNIQUE,
  api_secret VARCHAR(64) NOT NULL,
  webhook_url TEXT,
  webhook_secret VARCHAR(64),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

---

## 2. Orders Table

Stores payment orders created by merchants.

```sql
CREATE TABLE orders (
  id VARCHAR(64) PRIMARY KEY,
  merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL CHECK (amount >= 100),
  currency CHAR(3) DEFAULT 'INR',
  receipt VARCHAR(255),
  notes JSONB,
  status VARCHAR(20) DEFAULT 'created',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

### Required Index

```sql
CREATE INDEX idx_orders_merchant_id ON orders(merchant_id);
```

---

## 3. Payments Table

Stores all payment attempts.

```sql
CREATE TABLE payments (
  id VARCHAR(64) PRIMARY KEY,
  order_id VARCHAR(64) NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,
  currency CHAR(3) DEFAULT 'INR',
  method VARCHAR(20) NOT NULL CHECK (method IN ('upi', 'card')),
  status VARCHAR(20) NOT NULL,
  vpa VARCHAR(255),
  card_network VARCHAR(20),
  card_last4 CHAR(4),
  error_code VARCHAR(50),
  error_description TEXT,
  captured BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

### Required Indexes

```sql
CREATE INDEX idx_payments_order_id ON payments(order_id);
CREATE INDEX idx_payments_status ON payments(status);
```

---

## 4. Refunds Table (Deliverable 2)

Stores refund requests and processing state.

```sql
CREATE TABLE refunds (
  id VARCHAR(64) PRIMARY KEY,
  payment_id VARCHAR(64) NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,
  reason TEXT,
  status VARCHAR(20) DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  processed_at TIMESTAMP WITH TIME ZONE
);
```

### Required Index

```sql
CREATE INDEX idx_refunds_payment_id ON refunds(payment_id);
```

---

## 5. Webhook Logs Table (Deliverable 2)

Stores webhook delivery attempts and retry scheduling.

```sql
CREATE TABLE webhook_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  event VARCHAR(50) NOT NULL,
  payload JSONB NOT NULL,
  status VARCHAR(20) DEFAULT 'pending',
  attempts INTEGER DEFAULT 0,
  last_attempt_at TIMESTAMP WITH TIME ZONE,
  next_retry_at TIMESTAMP WITH TIME ZONE,
  response_code INTEGER,
  response_body TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

### Required Indexes

```sql
CREATE INDEX idx_webhook_logs_merchant_id ON webhook_logs(merchant_id);
CREATE INDEX idx_webhook_logs_status ON webhook_logs(status);
CREATE INDEX idx_webhook_logs_next_retry_at
  ON webhook_logs(next_retry_at)
  WHERE status = 'pending';
```

---

## 6. Idempotency Keys Table (Deliverable 2)

Caches API responses for idempotent payment creation.

```sql
CREATE TABLE idempotency_keys (
  key VARCHAR(255) NOT NULL,
  merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  response JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  PRIMARY KEY (key, merchant_id)
);
```

---

## 7. Seed Data – Test Merchant (Required)

This merchant **must** exist on startup.

```sql
INSERT INTO merchants (
  id,
  name,
  email,
  api_key,
  api_secret,
  webhook_secret,
  is_active,
  created_at,
  updated_at
)
VALUES (
  '550e8400-e29b-41d4-a716-446655440000',
  'Test Merchant',
  'test@example.com',
  'key_test_abc123',
  'secret_test_xyz789',
  'whsec_test_abc123',
  TRUE,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT (email) DO NOTHING;
```

---

## 8. Constraints & Business Rules

### Orders

* `id` must follow format: `order_` + 16 alphanumeric characters
* `amount` must be ≥ 100 (paise)
* `currency` defaults to `'INR'`
* `status` values:

  * `created`
  * `paid`
  * `failed`
  * `refunded`

---

### Payments

* `id` must follow format: `pay_` + 16 alphanumeric characters
* `status` values:

  * Deliverable 1: `processing → success | failed`
  * Deliverable 2: `pending → processing → success | failed`
* `method` values:

  * `upi`
  * `card`
* Card storage rules:

  * Store **only** `card_last4` and `card_network`
  * Never store full card number or CVV
* UPI rules:

  * Store `vpa` only for UPI payments

---

### Refunds

* `id` must follow format: `rfnd_` + 16 alphanumeric characters
* `status` values:

  * `pending`
  * `processed`
* Total refunded amount must not exceed `payments.amount`

---

### Webhook Logs

* `status` values:

  * `pending`
  * `success`
  * `failed`
* Retry logic:

  * Max attempts: 5
  * Exponential backoff schedule
* Payload must be stored exactly as sent

---

### Idempotency Keys

* Composite primary key: `(key, merchant_id)`
* `expires_at = created_at + 24 hours`
* Response must be returned as-is if key is reused and not expired

---

## 9. Schema Initialization Order

Recommended execution order:

```text
1. merchants
2. orders
3. payments
4. refunds
5. webhook_logs
6. idempotency_keys
7. indexes
8. seed test merchant
```

---

## 10. Notes for Docker + PostgreSQL

* Enable UUID generation:

```sql
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
```

* Use `schema.sql` inside:

```text
backend/src/db/schema.sql
```

* Load automatically on startup via Spring Boot or Flyway.

