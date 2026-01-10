# System Architecture – Payment Gateway Platform

## Overview

The Payment Gateway Platform is a modular, production-ready system designed to handle merchant operations and public payment flows. It utilizes a service-oriented, containerized architecture to ensure security, scalability, and clear separation of concerns.

---

## High-Level Architecture

The platform consists of four primary components isolated via Docker:

1. **Merchant Dashboard:** Private frontend for business operations.
2. **Checkout Application:** Public frontend for customer transactions.
3. **Backend API:** Core service handling business logic and security.
4. **PostgreSQL Database:** Persistent storage for all platform data.

---

## Component Breakdown

### 1. Merchant Dashboard

* **Port:** `3000` | **Tech:** React.js
* **Responsibilities:** Merchant authentication, API credential management, transaction analytics, and history.
* **Communication:** Uses authenticated requests via `X-Api-Key` and `X-Api-Secret` headers.

### 2. Checkout Application (Public)

* **Port:** `3001` | **Tech:** React.js
* **Responsibilities:** Fetching order details, rendering Payment UI (UPI/Card), and polling payment status.
* **Security:** Public access; validates requests via `order_id` context.

### 3. Backend API (Payment Gateway Service)

* **Port:** `8000` | **Tech:** Node.js + Express
* **Responsibilities:** Request validation, merchant authentication, payment simulation, and state management.
* **Design:** Stateless RESTful architecture with a dedicated services layer.

### 4. Database (PostgreSQL)

* **Port:** `5432` | **Tech:** PostgreSQL 15
* **Responsibilities:** Relational storage for Merchants, Orders, and Payments.
* **Integrity:** Uses foreign keys, indexing, and transaction-safe updates.

---

## Data Flow

### Merchant Operations

1. Merchant Dashboard requests data using **API Key/Secret**.
2. Backend validates credentials against the database.
3. Backend returns filtered transaction and analytics data.

### Transaction Flow

1. User enters checkout via `order_id`.
2. Checkout app fetches public order details.
3. Payment created via **Public API** (status: `processing`).
4. Backend simulates processing and updates status to `success` or `failed`.
5. Checkout app polls status and redirects user accordingly.

---

## Security & Data Protection

* **Authentication:** Strictly enforced for all merchant endpoints.
* **Card Security:** No full card numbers or CVVs are stored; only the last 4 digits and network are persisted.
* **Public Safety:** Checkout APIs expose only the minimum necessary data to complete a transaction.

---

## Deployment Configuration (Docker)

| Service | Container Name | Port |
| --- | --- | --- |
| **PostgreSQL** | `pg_gateway` | 5432 |
| **Backend API** | `gateway_api` | 8000 |
| **Merchant Frontend** | `gateway_frontend` | 3000 |
| **Checkout Frontend** | `gateway_checkout` | 3001 |

---

## Future Scalability

* **Horizontal Scaling:** Backend is stateless and can be scaled behind a load balancer.
* **Persistence:** Easily migrates to managed RDS/PostgreSQL instances.
* **Delivery:** Frontends are optimized for CDN deployment.
