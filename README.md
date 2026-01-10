---

# Payment Gateway Platform – Multi-Method Processing & Hosted Checkout

A **production-ready Payment Gateway platform** inspired by **Razorpay** and **Stripe**, designed for merchants to create orders via APIs and for customers to pay through a **hosted checkout page** supporting **UPI** and **Card payments**.

Ideal for **fintech learning**, **backend system design demonstrations**, and **full-stack development projects**.

---

## Features

* **Merchant Authentication**

  * API Key & Secret
  * Auto-seeded test merchant on startup
* **Order Management**

  * Create, retrieve, and monitor orders via backend API
* **Multi-Method Payments**

  * **UPI**: VPA validation
  * **Cards**: Luhn validation, expiry check, network detection (Visa, Mastercard, Amex, RuPay)
* **Hosted Checkout Page** for customers
* **Payment Lifecycle**

  * `processing → success / failed`
  * Deterministic Test Mode for predictable outcomes
* **Merchant Dashboard**

  * View API credentials
  * Transaction stats & history
* **Dockerized Architecture** for one-command startup
* **Health Check Endpoint** for monitoring
* Responsive UI for both dashboard and checkout

---

## Quick Start

```bash
# Clone the repository
git clone <repo-url>
cd payment-gateway

# Start all services
docker-compose up -d --build
```

### Access URLs

| Service            | URL                                                                                                  |
| ------------------ | ---------------------------------------------------------------------------------------------------- |
| Merchant Dashboard | [http://localhost:3000](http://localhost:3000)                                                       |
| Hosted Checkout    | [http://localhost:3001/checkout?order_id=ORDER_ID](http://localhost:3001/checkout?order_id=ORDER_ID) |
| Backend API        | [http://localhost:8000](http://localhost:8000)                                                       |
| Health Check       | [http://localhost:8000/health](http://localhost:8000/health)                                         |

---

## Demo Video

[Watch Demo](https://drive.google.com/file/d/1qnAQA95StjVnTD4pBCNtRbydoR7L8rI5/view?usp=sharing)

---

## Test Merchant Credentials

Auto-seeded on startup:

* **Email:** [test@example.com](mailto:test@example.com)
* **API Key:** key_test_abc123
* **API Secret:** secret_test_xyz789

Use for all API requests and dashboard access.

---

## Test Payment Details

**UPI:**

```text
user@paytm
test@phonepe
```

**Card (Visa – Recommended):**

```text
Card Number: 4111 1111 1111 1111
Expiry: 12/26
CVV: 123
Name: Test User
```

---

## Project Structure

```text
├── backend/            # Node.js + Express API
├── frontend/           # Merchant Dashboard (React)
├── checkout-page/      # Hosted Checkout (React)
├── docker-compose.yml
├── .env.example
└── README.md
```

---

## Services & Ports

| Service            | Port | Description           |
| ------------------ | ---- | --------------------- |
| Backend API        | 8000 | Payment gateway logic |
| Merchant Dashboard | 3000 | Merchant UI           |
| Hosted Checkout    | 3001 | Customer UI           |
| PostgreSQL         | 5432 | Persistent storage    |

---

## Technology Stack

**Frontend:** React (Vite), React Router, Fetch API, Custom CSS, Nginx
**Backend:** Node.js (v18), Express.js, Validation Utilities
**Database:** PostgreSQL (v15)
**DevOps:** Docker, Docker Compose, Nginx

---

## Architecture Overview

* **Merchant Dashboard:** View API credentials, stats, and transactions
* **Checkout Page:** Public-facing page for customer payments
* **Backend API:** Handles authentication, order/payment processing, validation, and lifecycle management
* **Database:** Stores merchants, orders, and payments with relationships and indexing

**Architecture Diagrams:**

* [System Architecture](docs/images/architecture.png)
* [Database ERD](docs/images/erd.png)

---

## Environment Configuration

Copy `.env.example` to `.env` and configure:

```env
DATABASE_URL=postgresql://gateway_user:gateway_pass@postgres:5432/payment_gateway
PORT=8000

# Test merchant
TEST_MERCHANT_EMAIL=test@example.com
TEST_API_KEY=key_test_abc123
TEST_API_SECRET=secret_test_xyz789

# Payment simulation
TEST_MODE=false
TEST_PAYMENT_SUCCESS=true
TEST_PROCESSING_DELAY=1000
```

---

## Payment Flow

1. Merchant creates order via API
2. Customer opens hosted checkout
3. Selects payment method (UPI / Card)
4. Payment enters `processing` state
5. Backend simulates bank processing
6. Payment completes:

   * **Success →** `/success`
   * **Failure →** `/failure`
7. Merchant views transaction in dashboard

---

## Testing Failure Scenarios

Force all payments to fail (demo purposes):

```env
TEST_MODE=true
TEST_PAYMENT_SUCCESS=false
```

Restart backend only:

```bash
docker-compose restart api
```

---

## Health Check

```bash
curl http://localhost:8000/health
```

**Response:**

```json
{
  "status": "healthy",
  "database": "connected",
  "timestamp": "..."
}
```

Do you want me to do that?
