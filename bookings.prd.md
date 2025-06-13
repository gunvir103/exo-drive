# Bookings PRD – Exodrive

> Status: Implemented · Last updated December 13, 2024

---

## 1. Purpose & Vision

Enable customers to reserve an Exodrive vehicle online in < 90 seconds, while guaranteeing that exactly one booking exists per car per day. Provide a comprehensive admin dashboard for staff to efficiently manage bookings, track their lifecycle in real-time, and perform necessary follow-up actions.

---

## 2. Goals & Success Metrics

| Goal | Metric | Target |
|------|--------|--------|
| Seamless checkout | Avg. time from **Select Dates → Booking Confirmed** | ≤ 90 s |
| Prevent double-booking | % overlapping bookings in DB | 0 % |
| Staff awareness & efficiency | % bookings surfaced in admin dashboard with actionable status | 100 % |
| Real-time status updates | Latency for webhook-driven updates (e.g., payment, contract) to reflect in admin UI | < 15 s |
| Uptime | API availability (p95) | ≥ 99.9 % |

---

## 3. Personas

1. **Customer (Unauthenticated)** – wants to rent a car quickly without creating an account.
2. **Admin (Staff)** – monitors new bookings, performs manual verifications, and marks bookings as *upcoming* once payment clears.

---

## 4. User Stories

### Customer
- *As a customer*, I can see up-to-date availability for a car across a date range so I avoid wasted time.
- *As a customer*, I can create a booking by entering my details and paying, receiving immediate confirmation.
- *As a customer*, I can access a secure URL with my booking details without logging in.

### Admin
- *As an admin*, every successful booking and its subsequent updates should appear in the **Admin Dashboard** so I have a clear overview and never miss critical changes.
- *As an admin*, I can view a comprehensive list of bookings, filterable by status (e.g., All, Active, Upcoming, Completed) and search for specific bookings to quickly find information.
- *As an admin*, I can view detailed information for a specific booking, including a booking summary, full customer data, payment details, a chronological booking timeline, and associated documents (like rental agreement, ID scan, pickup/dropoff media).
- *As an admin*, I can change a booking's status (e.g., pending payment → upcoming → active → completed, contract sent → contract signed) to reflect real-world progress, with some transitions automated via webhooks.
- *As an admin*, I can perform actions on bookings such as marking them as completed, sending reminders, sending emails to customers, printing booking details, and canceling bookings directly from the dashboard.
- *As an admin*, I can create new bookings directly from the dashboard, including specifying customer details, car, dates, and pricing.
- *As an admin*, I can edit certain details of existing bookings (e.g., dates, notes, customer contact) subject to business rules.
- *As an admin*, I can initiate the creation of a PayPal invoice for a booking directly from the dashboard, pre-filled with booking details.
- *As an admin*, in the event of a payment dispute, I can easily access all relevant documentation (signed rental agreement, ID scan, pickup/dropoff photos/videos, communication logs) linked to the booking and its PayPal transaction to efficiently manage the dispute.

---

## 5. Functional Requirements (MVP)

### 5.1 Car Availability
1. Endpoint `GET /api/availability` returns availability for a `car_id`, `start`, `end`.
2. FE calendar disables dates returned as **unavailable**.

### 5.2 Booking Creation
1. Endpoint `POST /api/bookings` accepts:
   ```ts
   {
     carId: string;
     startDate: string; // YYYY-MM-DD
     endDate: string;   // YYYY-MM-DD
     customer: {
       fullName: string;
       email: string;
       phone?: string;
     };
   }
   ```
2. Server flow:
   1. Acquire Redis lock `lock:car:{car_id}:{hash(start..end)}` (TTL 30 s).
   2. Begin Postgres TX; re-check availability; insert **booking** & daily rows in `car_availability` (status `pending`).
   3. Generate `booking_secure_tokens.token` (128-bit random) and return `bookingUrl`.
   4. Release Redis lock on commit.
3. Response `201 Created` with `bookingId` & `bookingUrl`.

### 5.3 Admin Booking Management & Inbox Integration
The Admin Dashboard will serve as the central hub for managing bookings.
1.  **Manage Bookings Page:**
    *   Displays a list of all bookings, with tabs for filtering by status (e.g., "All Bookings", "Active", "Upcoming", "Completed").
    *   Each booking in the list will be a card displaying: car name (and small image placeholder), rental period, customer name, email, phone, booking ID, and total amount.
    *   Prominent, color-coded status badges (e.g., "Active", "Payment Authorized", "Contract Signed", "Completed", "Payment Captured", "Contract Pending"). Multiple relevant badges can be shown.
    *   Actions available directly on the card might include "View Details" and context-specific actions like "Mark as Completed" or "Send Contract Reminder".
    *   A search bar allows admins to find bookings by customer name, car, booking ID, etc.
2.  **Booking Details Page:**
    *   Accessible by clicking "View Details" on the Manage Bookings page. Includes a "Back to Bookings" link.
    *   **Booking Summary Section:** Displays car image, name, rental period, total days, customer name/email, and any special notes. Also shows payment amount, booking ID, and creation date. Actions like "Mark as Completed", "Edit Booking" (for certain fields).
    *   **Customer Information Section:** Shows full name, email, phone, address, Driver's License details (if collected), and verification status.
    *   **Payment Details Section:** Details the payment method (e.g., Visa ending in 4242), daily rate, total amount, and current payment status (e.g., "Authorized", "Pre-authorization of $X on card. Payment will be captured after rental completion.").
    *   **Booking Timeline Section:** A chronological log of key events with timestamps, such as:
        *   Booking created
        *   Payment pre-authorized
        *   Identity verified (if applicable)
        *   Contract sent
        *   Contract viewed
        *   Contract signed
        *   Car picked up
        *   Car returned
        *   Payment captured
        *   Booking completed
    *   **Actions Panel:** Contextual actions available to the admin, such as "Send Email to Customer", "Print Booking Details", "Cancel Booking".

### 5.4 Status State Machine
The booking lifecycle will be managed through a state machine, with statuses updated manually by admins or automatically via webhooks.
```
graph TD
    A[Pending Customer Action] -- Booking Submitted --> B(Pending Payment/Pre-Auth);
    B -- Payment Pre-Authorized (Webhook) --> C(Pending Contract);
    C -- Contract Sent --> D(Contract Pending Signature);
    D -- Contract Signed (Webhook) --> E(Upcoming);
    E -- Pick-up Day / Manual --> F(Active);
    F -- Drop-off Day / Manual --> G(Post-Rental / Pending Finalization);
    G -- Payment Captured / No Issues --> H(Completed);
    G -- Issues Reported --> I(Disputed/Requires Attention);

    B -- Payment Failed --> A;
    C -- Admin Cancel --> J(Cancelled);
    D -- Contract Declined (Webhook) --> C;
    E -- Customer/Admin Cancel --> J;
    F -- Early Return / Issues --> G;
```
*Detailed sub-statuses for payment and contract (e.g., `Payment Authorized`, `Payment Captured`, `Contract Sent`, `Contract Viewed`) will be tracked and visible on the timeline and booking details.*
*Transitions enforced server-side; invalid moves → 400 Bad Request.*

### 5.5 Secure Booking Page
* Route `/booking/[token]` (Server Component).
* Displays booking metadata, car info, current primary status, and potentially a simplified timeline.

### 5.6 Notifications & Real-time Updates
System will utilize webhooks for real-time updates and to trigger notifications.
1.  **Webhook Endpoints:**
    *   `POST /api/webhooks/resend`: For email delivery status, opens, clicks.
    *   `POST /api/webhooks/paypal`: For payment pre-authorization, capture, refund, dispute notifications.
    *   `POST /api/webhooks/esignature`: For e-signature events (e.g., contract sent, viewed, signed, declined from services like DocuSeal or Dropbox Sign).
2.  **Internal Notifications:**
    *   Confirmation email to customer upon successful booking.
    *   Notification email to admins for new bookings and critical updates (e.g., contract signed, payment issues).
    *   Updates triggered by webhooks will refresh relevant data in the Admin Dashboard in near real-time.

### 5.7 Dispute Management & Evidence Collection
To effectively handle payment chargebacks and disputes:
1.  **Automated Evidence Linkage & PayPal Invoice Attachments:** The system will automatically link key documents and media to a booking record internally. Crucially, when a PayPal invoice is generated (either by admin or system), best efforts should be made to **attach core evidence directly to the PayPal invoice via their system/API**. This includes:
    *   Signed rental agreement (from e-signature provider via webhook or manual upload).
    *   Customer ID scan (uploaded during booking or manually by admin).
    *   Key pickup and dropoff photos/videos (uploaded by customer or admin).
    *   These documents will also be stored and linked internally via the `booking_media` table for comprehensive record-keeping and easy access from the admin dashboard.
2.  **Dispute Tracking:** When a dispute is initiated (e.g., via PayPal webhook), a record will be created in the `disputes` table, linked to the `booking_id` and relevant `payment_id` / `paypal_invoice_id`. The record should note if evidence was attached to the original PayPal invoice.
3.  **Admin Dispute Interface:**
    *   The admin dashboard will provide a view of active and past disputes.
    *   For a specific dispute, admins can view all internally linked evidence and verify/manage attachments on the corresponding PayPal invoice.
    *   The system should facilitate easy gathering of this evidence (both internal links and references to PayPal invoice attachments) for submission to the payment provider.

### 5.8 Admin Booking & Invoice Management
1.  **Admin Booking Creation:** Admins can create new bookings via a form in the dashboard. This form will allow selection of car, customer (new or existing), dates, and will calculate pricing. This bypasses the customer-facing checkout flow but should still adhere to availability rules (with override capability for admins if necessary).
2.  **Admin Booking Modification:** Admins can modify certain aspects of existing bookings (e.g., extend/shorten dates if availability permits, update customer notes, change assigned car if necessary before rental starts). All modifications should be logged in `booking_events`.
3.  **Admin PayPal Invoice Creation:** Admins can trigger the creation of a PayPal invoice for a booking. The system should pre-fill invoice details from the booking. **If using PayPal's invoicing system directly or via API, the system should attempt to attach key documents (e.g., rental agreement PDF, summary of terms) to the PayPal invoice. Admins should be guided to ensure critical documents are attached.** The generated `paypal_invoice_id` will be stored and linked to the booking.

---

## 6. Non-Functional Requirements

| Area | Requirement |
|------|-------------|
| Security | RLS on every relevant table; tokens expire after configurable TTL. Secure handling of webhook payloads. |
| Concurrency | Redis locks + DB `UNIQUE(car_id, date)` guarantee single booking. Webhook handlers must be idempotent. |
| Performance | p95 < 300 ms for availability & booking endpoints. Admin dashboard loads quickly, timeline updates are responsive. |
| Accessibility | Booking form & Admin Dashboard WCAG AA at minimum. |
| Observability | Instrumentation via Sentry + custom analytics events. |

---

## 7. Data Model (Delta)

Refer to `booking.md` for the comprehensive technical data model. Key entities for PRD focus:
```
bookings                customers              inbox_items (or booking_events)
─────────               ─────────              ──────────────────────────────
id  (PK)                id  (PK)               id  (PK)
car_id (FK→cars)        email UNIQUE           type enum('booking_created', 'payment_update', 'contract_status', 'admin_action', …)
start_date              full_name              booking_id FK
end_date                phone                  status enum('pending','done', 'failed', 'viewed', 'signed')
status enum             …                      timestamp
(e.g., pending_payment, upcoming, active, completed, cancelled)
payment_status enum                            payload jsonb (details of the event)
contract_status enum                           created_at
customer_id (FK)
secure_token_id (FK)
…

booking_secure_tokens   car_availability
──────────────────────  ────────────────
booking_id UNIQUE FK    id
token UNIQUE            car_id
expires_at              date UNIQUE (car_id,date)
                        status enum('available', 'pending_confirmation', 'booked')
```
*   The `inbox_items` table might be better named `booking_events` to store the detailed timeline events.
*   `bookings` table will need distinct `payment_status` and `contract_status` fields to support detailed filtering and display.
*See `booking.md` for full technical model.*

---

## 8. API Design

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET    | `/api/availability` | Public | Returns array of dates with `available: boolean`. |
| POST   | `/api/bookings` | Public | Creates booking; returns `bookingUrl`. |
| GET    | `/api/bookings` | Admin | Lists all bookings with filters for status, date range, search. |
| GET    | `/api/bookings/[id]` | Admin | Fetch single booking with all details (customer, payment, timeline events). |
| PATCH  | `/api/bookings/[id]` | Admin | Updates editable booking fields (e.g., notes, assigned admin). |
| PATCH  | `/api/bookings/[id]/status` | Admin | Manually transition primary booking status. |
| POST   | `/api/bookings/[id]/send-email` | Admin | Triggers sending a specific email to the customer. |
| POST   | `/api/admin/bookings`           | Admin | Creates a new booking directly (bypassing customer flow). |
| PATCH  | `/api/admin/bookings/[id]`      | Admin | Modifies an existing booking. |
| POST   | `/api/admin/bookings/[id]/invoice` | Admin | Creates/sends a PayPal invoice for the booking. (Should investigate PayPal API for attaching documents like agreement PDF). |
| GET    | `/api/admin/disputes`           | Admin | Lists payment disputes. |
| GET    | `/api/admin/disputes/[dispute_id]` | Admin | Gets details of a specific dispute and linked evidence. |
| POST   | `/api/admin/disputes/[dispute_id]/submit-evidence` | Admin | (Placeholder) Marks evidence as submitted to provider. |
| POST   | `/api/webhooks/resend` | Webhook | Handles Resend webhook events. |
| POST   | `/api/webhooks/paypal` | Webhook | Handles PayPal webhook events. |
| POST   | `/api/webhooks/esignature` | Webhook | Handles e-signature webhook events. |

---

## 9. Admin Dashboard

The Admin Dashboard is the primary interface for staff to manage all aspects of car bookings.

1.  **Main Navigation (Sidebar):**
    *   Dashboard (Overview/Summary)
    *   Bookings (Leads to Manage Bookings page)
    *   Cars
    *   Customers (Potentially)
    *   Settings (Hero Settings, Homepage Settings, etc. - as per existing layout)

2.  **Manage Bookings Page:**
    *   **Tabs for Filtering:** "All Bookings", "Active", "Upcoming", "Completed", potentially "Action Required".
    *   **Booking List/Grid:** Displays booking cards with:
        *   Car Image (small thumbnail) & Name
        *   Rental Period (e.g., Mar 10, 2024 - Mar 12, 2024)
        *   Customer: Name, john.smith@example.com, (555) 555-0123
        *   Booking ID: book_1ng-2
        *   Total: $2400
        *   **Status Badges:** Prominently displayed, color-coded (e.g., "Active", "Payment Authorized", "Contract Signed", "Completed", "Payment Captured", "Contract Pending"). Multiple relevant badges can be shown.
    *   **Actions per Card:** "View Details", and contextual actions like "Mark as Completed", "Send Contract Reminder".
    *   **Search Functionality:** Allows searching by booking ID, customer name/email, car name.

3.  **Booking Details Page:**
    *   **Navigation:** "← Back to Bookings" link.
    *   **Header:** Booking ID, primary status badges.
    *   **Booking Summary Section:**
        *   Car Image (larger), Name, Model (e.g., Lamborghini Huracán).
        *   Rental Period, Number of Days.
        *   Customer Name, Email.
        *   Notes (e.g., "Customer requested airport pickup").
        *   Payment: $1200/day, Total: $2400.
        *   Booking ID, Created on Date.
        *   Actions: "Mark as Completed", "Edit Booking" (modal for editable fields).
    *   **Customer Information Section:**
        *   Full Name, Email, Phone.
        *   Address (e.g., 123 Main St, Washington, DC 20001).
        *   Driver's License (e.g., DC12345678).
        *   Verification Status (e.g., Verified badge).
    *   **Payment Details Section:**
        *   Payment Method (e.g., Visa ending in 4242).
        *   Status Badge (e.g., "Authorized").
        *   Daily Rate, Total Amount.
        *   Payment Status line (e.g., "Pre-authorization hold of $2400 placed on card. Payment will be captured after rental completion.").
    *   **Booking Timeline Section:**
        *   A vertical, chronological list of events with icons and timestamps. Examples:
            *   Booking created (Mar 10, 2024, 12:45 PM - Customer submitted booking request)
            *   Payment pre-authorized (Mar 10, 2024, 12:46 PM - Pre-authorization hold of $X placed on card ending in YYYY)
            *   Identity verified (Mar 10, 2024, 01:15 PM - Customer completed ID verification)
            *   Contract sent (Mar 10, 2024, 01:20 PM - Rental agreement sent to customer)
            *   Contract signed (Mar 14, 2024, 12:00 PM - Customer signed rental agreement via [E-signature Platform])
            *   Car picked up (Mar 15, 2024, 10:00 AM - Customer picked up the vehicle)
            *   Car returned
            *   Payment captured
            *   Booking completed
    *   **Actions Panel (Right Sidebar/Bottom):**
        *   "Send Email to Customer" (opens modal with email templates).
        *   "Print Booking Details".
        *   "Cancel Booking" (with confirmation and reason).
        *   "Edit Booking" (for modifiable fields, subject to rules).
        *   "Create/View PayPal Invoice".
        *   "View/Manage Dispute" (if a dispute exists).

4.  **Calendar View** (Stretch goal) using FullCalendar or similar, showing bookings across cars and dates.
5.  **Disputes Section:** (New Section/Tab)
    *   List of disputes with status, booking ID, customer, amount.
    *   Detail view for each dispute showing linked evidence and dispute history.

---

## 10. Analytics & Instrumentation

Event | Properties
------|-----------
`booking_created` | `booking_id`, `car_id`, `days`, `source` (web/mobile/admin)
`booking_status_changed` | `booking_id`, `from_status`, `to_status`, `actor` (customer/admin/system)
`booking_edited_by_admin` | `booking_id`, `admin_id`, `changed_fields`
`payment_event` | `booking_id`, `event_type` (e.g., preauth_success, preauth_fail, capture_success, refund_initiated), `amount`, `gateway_id`
`contract_event` | `booking_id`, `event_type` (e.g., sent, viewed, signed, declined), `provider_id`
`admin_action` | `booking_id`, `action_type` (e.g., email_sent, booking_edited, booking_cancelled, invoice_created), `admin_id`
`dispute_event` | `dispute_id`, `booking_id`, `event_type` (e.g., opened, evidence_submitted, resolved), `provider`

---

## 11. Timeline

| Phase | Tasks | ETA |
|-------|-------|-----|
| 1 | DB migrations (align with `booking.md`, `databaseplan.md` & new statuses) + Supabase types | Day 1–4 |
| 2 | Availability endpoint + FE calendar (Customer Facing) | Day 5–6 |
| 3 | Booking API (Create, Read - Customer) + Redis locking | Day 7–9 |
| 4 | Secure booking page (Customer Facing) | Day 10-11 |
| 5 | **Admin Dashboard - Core Structure & Manage Bookings Page (List View)** | Day 12–15 |
| 6 | **Admin Dashboard - Booking Details Page (Summary, Customer, Payment, Basic Timeline sections)** | Day 16-19 |
| 7 | **Webhook Handlers Implementation (PayPal, E-signature, Resend - Core events for status updates)** | Day 20-23 |
| 8 | **Admin Dashboard - Booking Timeline Integration (displaying events from `booking_events`) & Real-time Updates** | Day 24-26 |
| 9 | Payment Integration (PayPal pre-auth & capture logic tied to webhooks/admin actions) | Day 27-29 |
| 10 | E-signature Integration (DocuSeal/Dropbox Sign - Contract generation, sending, status tracking, linking to booking) | Day 30-32 |
| 11 | **Admin Booking Management (Create/Edit Booking APIs & UI)** | Day 33-36 |
| 12 | **Admin PayPal Invoice Creation (API & UI integration)** | Day 37-39 |
| 13 | **Dispute Management Foundation (API for disputes, evidence linking, basic UI view, noting PayPal invoice attachments)** | Day 40-43 |
| 14 | Admin actions implementation (Send email, cancel booking, etc. from dashboard) | Day 44-46 |
| 15 | QA, Refinements & Load tests | Day 47-52 |

---

## 12. Out-of-Scope (Next Milestones)

*   ~~PayPal payment & auth-hold flows.~~ (Now largely in scope for MVP due to admin UI dependencies)
*   ~~Docuseal signature capture.~~ (E-signature integration is now in scope for MVP)
*   ~~Email & webhook notifications via Resend.~~ (Core Resend webhooks for status are in scope, advanced notification workflows can be a fast follow)
*   Advanced customer account area for multi-booking history (beyond the single secure booking page).
*   **Full automated evidence submission to PayPal via API (MVP focuses on gathering and linking, and leveraging PayPal invoice attachments).**
*   **Advanced UI for composing/managing dispute responses within the app (MVP relies on PayPal's interface, supported by our evidence gathering).**
*   Full media upload and management for disputes (basic linking and viewing in scope).
*   **Automated attachment of all relevant documents to PayPal invoices at the time of creation or dispute, if not already attached (MVP will attempt key attachments or guide admin).**

---

## 13. Open Questions

1.  Should we allow logged-in users to view multi-booking history now or later? (Current plan: Later, focus on secure link for single booking).
2.  Which Redis provider (Upstash vs Elasticache) will we finalise? (Decision needed before Phase 3).
3.  Exact cutoff time for same-day bookings?
4.  **Confirm specific e-signature solution (e.g., DocuSeal, Dropbox Sign) to finalize API and webhook integration details.**
5.  **Define the exact mapping of webhook events from PayPal and the chosen e-signature service to Booking Timeline events and status updates.**
6.  Prioritize which email templates are MVP for "Send Email to Customer" admin action.
7.  **GraphQL for Future API Development:** While the current booking system MVP will use the defined REST API, should we evaluate GraphQL for future API versions or new modules to optimize data fetching for complex UIs?
8.  **Car Component Reusability & Refactor:** As we develop the admin booking UI, evaluate existing car display components. Plan for refactoring or creating new, more granular car components if current ones are not easily adaptable for the required views (e.g., booking cards, booking detail summaries) to ensure reusability and maintainability.

---

*End of document.* 