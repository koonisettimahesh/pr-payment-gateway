# Database Schema – Payment Gateway Platform

## Overview

The Payment Gateway Platform uses **PostgreSQL** as its primary database.
The schema is designed to ensure:

* Data integrity
* Clear relationships between entities
* Secure payment tracking
* Efficient querying for dashboards and analytics

---

## Entity Relationship Diagram (ERD)

```text
docs/images/erd.png
```

---

## Tables Overview

The database consists of the following core tables:

1. `merchants`
2. `orders`
3. `payments`

---

## 1️ merchants Table

Stores merchant (business) information and API credentials.

### Table: `merchants`

| Column Name | Type        | Description                   |
| ----------- | ----------- | ----------------------------- |
| id          | UUID / TEXT | Primary key                   |
| email       | TEXT        | Merchant email (unique)       |
| api_key     | TEXT        | API Key for authentication    |
| api_secret  | TEXT        | API Secret for authentication |
| created_at  | TIMESTAMP   | Merchant creation timestamp   |

### Constraints

* `api_key` is unique
* `api_secret` is unique

---

## 2️ orders Table

Stores orders created by merchants.

### Table: `orders`

| Column Name | Type        | Description                      |
| ----------- | ----------- | -------------------------------- |
| id          | TEXT        | Order ID (e.g. order_abc123)     |
| merchant_id | UUID / TEXT | Foreign key → merchants.id       |
| amount      | INTEGER     | Amount in smallest currency unit |
| currency    | TEXT        | Currency code (e.g. INR)         |
| status      | TEXT        | Order status                     |
| created_at  | TIMESTAMP   | Order creation time              |

### Relationships

* **Many orders belong to one merchant**

### Constraints

* `merchant_id` references `merchants.id`
* `amount` must be greater than 0

---

## 3️ payments Table

Stores payment attempts for orders.

### Table: `payments`

| Column Name    | Type        | Description                           |
| -------------- | ----------- | ------------------------------------- |
| id             | TEXT        | Payment ID (e.g. pay_xyz123)          |
| order_id       | TEXT        | Foreign key → orders.id               |
| merchant_id    | UUID / TEXT | Foreign key → merchants.id            |
| amount         | INTEGER     | Payment amount                        |
| currency       | TEXT        | Currency code                         |
| method         | TEXT        | Payment method (upi / card)           |
| status         | TEXT        | processing / success / failed         |
| vpa            | TEXT        | UPI VPA (only for UPI payments)       |
| card_network   | TEXT        | Card network (Visa, MasterCard, etc.) |
| card_last4     | TEXT        | Last 4 digits of card number          |
| failure_code   | TEXT        | Failure reason code (if any)          |
| failure_reason | TEXT        | Failure description                   |
| created_at     | TIMESTAMP   | Payment creation time                 |
| updated_at     | TIMESTAMP   | Last status update time               |

### Relationships

* **One order can have multiple payments**
* **Each payment belongs to one merchant**

---

## Relationships Summary

```text
merchants (1) ────< orders (many)
merchants (1) ────< payments (many)
orders    (1) ────< payments (many)
```

---

## Data Integrity & Validation

### Referential Integrity

* Foreign keys ensure valid merchant and order references
* Orphan payments are not allowed

### Business Rules

* Payments must reference a valid order
* Orders must belong to a valid merchant
* Payment amount must match order amount
* Card CVV is never stored
* Only last 4 digits of card are persisted

---

## Indexing Strategy

Recommended indexes:

* `merchants.api_key`
* `orders.merchant_id`
* `payments.order_id`
* `payments.merchant_id`
* `payments.status`

These indexes optimize:

* Dashboard analytics
* Transaction listing
* Payment status polling

---

## Security Considerations

* No sensitive card data stored
* API secrets never exposed via public endpoints
* Public checkout queries only return limited fields
* Database credentials injected via environment variables

---

## Extensibility

The schema is designed to support:

* Refunds table (future)
* Webhook events
* Multi-currency support
* Real payment gateway integration

---

## Summary

This database schema provides:

* Clear entity separation
* Strong data integrity
* Secure payment handling
* Scalable foundation for a production payment gateway

---