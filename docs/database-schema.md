# Database Schema – Payment Gateway Platform

## Overview

The Payment Gateway Platform uses **PostgreSQL** as its primary database. The schema is designed for high integrity, clear relational mapping, and efficient analytical querying for merchant dashboards.

---

## Entity Relationship Diagram (ERD)

---

## Tables Overview

The core of the system is built upon three primary tables:

1. `merchants`
2. `orders`
3. `payments`

---

## 1. merchants Table

Stores business identity and API credentials for authentication.

| Column Name | Type | Description |
| --- | --- | --- |
| `id` | UUID / TEXT | Primary key |
| `email` | TEXT | Merchant email (unique) |
| `api_key` | TEXT | API Key (unique) |
| `api_secret` | TEXT | API Secret (unique) |
| `created_at` | TIMESTAMP | Merchant creation timestamp |

---

## 2. orders Table

Stores transactional intent created by merchants.

| Column Name | Type | Description |
| --- | --- | --- |
| `id` | TEXT | Order ID (e.g., `order_abc123`) |
| `merchant_id` | UUID / TEXT | Foreign key → `merchants.id` |
| `amount` | INTEGER | Amount in smallest unit (paise/cents) |
| `currency` | TEXT | Currency code (e.g., INR) |
| `status` | TEXT | Current state (created, paid, etc.) |
| `created_at` | TIMESTAMP | Order creation time |

**Relationships:** Many orders belong to one merchant.

---

## 3. payments Table

Stores specific payment attempts associated with an order.

| Column Name | Type | Description |
| --- | --- | --- |
| `id` | TEXT | Payment ID (e.g., `pay_xyz123`) |
| `order_id` | TEXT | Foreign key → `orders.id` |
| `merchant_id` | UUID / TEXT | Foreign key → `merchants.id` |
| `amount` | INTEGER | Payment amount |
| `method` | TEXT | Payment method (upi / card) |
| `status` | TEXT | processing / success / failed |
| `vpa` | TEXT | UPI VPA (UPI only) |
| `card_network` | TEXT | Visa, MasterCard, etc. (Card only) |
| `card_last4` | TEXT | Masked card digits (Card only) |
| `failure_code` | TEXT | Error code if failed |
| `created_at` | TIMESTAMP | Attempt timestamp |
| `updated_at` | TIMESTAMP | Last status update |

**Relationships:** One order can have multiple payment attempts; each payment belongs to one merchant.

---

## Relationships Summary

```text
merchants (1) ────< orders (many)
merchants (1) ────< payments (many)
orders    (1) ────< payments (many)

```

---

## Data Integrity & Security

* **Referential Integrity:** Foreign keys prevent orphan payments and ensure valid merchant links.
* **Business Logic:** Payment amounts must match order amounts for successful reconciliation.
* **Security:** **CVV and full card numbers are never stored.** Only the last 4 digits and network are persisted for identification.
* **Indexing:** Core indexes are applied to `api_key`, `merchant_id`, and `order_id` to ensure sub-second response times for dashboards and status polling.

---

## Extensibility

The schema is built to accommodate future features such as a `refunds` table, `webhooks` logging, and multi-currency conversion logs without requiring a complete redesign.
