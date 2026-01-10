# System Architecture – Payment Gateway Platform

## Overview

The Payment Gateway Platform is designed as a **modular, production-ready system** that supports:

* Merchant dashboards
* Public checkout flow
* Secure payment processing
* Asynchronous payment status updates
* Clear separation between merchant and public access

The system follows a **service-oriented, containerized architecture** using Docker.

---

## High-Level Architecture

The platform consists of **four major components**:

1. **Merchant Dashboard (Frontend)**
2. **Checkout Application (Public Frontend)**
3. **Backend API (Payment Gateway Service)**
4. **PostgreSQL Database**

Each component is isolated, scalable, and communicates through well-defined interfaces.

---

## Architecture Diagram

```text
docs/images/architecture.png
```

---

## Component Breakdown

### 1. Merchant Dashboard (Frontend)

**Port:** `3000`
**Technology:** React.js

**Responsibilities:**

* Merchant login
* Display API credentials
* Dashboard analytics (transactions, amount, success rate)
* View transactions list
* Secure API access using API Key & Secret

**Communication:**

* Talks to Backend API using authenticated requests
* Uses `X-Api-Key` and `X-Api-Secret` headers

---

### 2. Checkout Application (Public Frontend)

**Port:** `3001`
**Technology:** React.js

**Responsibilities:**

* Accept `order_id` via URL
* Fetch public order details
* Display payment UI (UPI / Card)
* Create payments using public APIs
* Poll payment status
* Redirect to success or failure pages

**Security Model:**

* No authentication headers
* Access validated using `order_id` ownership on backend

---

### 3. Backend API (Payment Gateway Service)

**Port:** `8000`
**Technology:** Node.js + Express

**Core Responsibilities:**

* Merchant authentication (API Key & Secret)
* Order management
* Payment creation and validation
* Payment processing simulation
* Payment status polling
* Public checkout endpoints
* Data validation and error handling

**Key Design Principles:**

* RESTful APIs
* Clear separation between public and protected routes
* Stateless request handling
* Centralized business logic (services layer)

---

### 4. Database (PostgreSQL)

**Port:** `5432`
**Technology:** PostgreSQL 15

**Responsibilities:**

* Store merchants
* Store orders
* Store payments
* Maintain relationships and integrity
* Track payment status changes

**Key Features:**

* Foreign key constraints
* Indexed IDs
* Transaction-safe updates
* Supports analytics queries

---

## Data Flow

### Merchant Dashboard Flow

1. Merchant logs in
2. Dashboard fetches payments using authenticated API
3. Backend validates API key & secret
4. Backend fetches data from database
5. Dashboard renders analytics and transactions

---

### Checkout Flow

1. User opens checkout page with `order_id`
2. Checkout app fetches order using public API
3. User selects payment method
4. Payment is created via public endpoint
5. Backend validates order ownership
6. Payment status is set to `processing`
7. Backend simulates processing
8. Status updates to `success` or `failed`
9. Checkout app polls status
10. User is redirected to success or failure page

---

## Security Architecture

### Merchant APIs

* Protected using API Key + API Secret
* Requests without valid credentials are rejected

### Checkout APIs

* Public endpoints
* Validate `order_id` belongs to a valid merchant
* No sensitive merchant data exposed

### Data Protection

* No card details stored
* Only last 4 digits and card network saved
* CVV never persisted

---

## Deployment Architecture (Docker)

All services are containerized using Docker Compose:

| Service           | Container Name   | Port |
| ----------------- | ---------------- | ---- |
| PostgreSQL        | pg_gateway       | 5432 |
| Backend API       | gateway_api      | 8000 |
| Merchant Frontend | gateway_frontend | 3000 |
| Checkout Frontend | gateway_checkout | 3001 |

**Benefits:**

* One-command startup
* Environment consistency
* Easy scaling
* Clear service isolation

---

## Scalability Considerations

* Backend is stateless → horizontally scalable
* Database can be upgraded to managed PostgreSQL
* Frontends can be deployed behind CDN
* Payment processing logic can be replaced with real gateways

---

## Summary

This architecture ensures:

* Strong separation of concerns
* Secure merchant operations
* Safe public checkout experience
* Production-grade extensibility
* Easy deployment and evaluation

---