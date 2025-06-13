# Supabase Edge Function: `create-booking-transaction`

> **Status:** Implemented · **Last updated:** December 13, 2024

---

## 1. Purpose

This Supabase Edge Function, `create-booking-transaction`, serves as an intermediary that receives a booking request from the Next.js API route (`POST /api/bookings/route.ts`) and invokes a PL/pgSQL database function (`public.create_booking_transactional`) to atomically create a new booking and all its related records.

The primary goals are:
*   To provide a secure and controlled HTTP endpoint for initiating complex booking transactions.
*   To leverage a PL/pgSQL function for ensuring atomicity and data consistency within the database. If any step in the booking creation process fails within the database function, the entire transaction is rolled back.

---

## 2. Function Location

*   **Edge Function Code:** `supabase/functions/create-booking-transaction/index.ts`
*   **Shared CORS Helper:** `supabase/functions/create-booking-transaction/cors.ts` (included with the function deployment)
*   **PL/pgSQL Database Function:** `public.create_booking_transactional` (defined via migrations `create_booking_transaction_function_fix` and `make_token_booking_id_nullable`)

---

## 3. Invocation (from Next.js API Route)

The Next.js API route (`app/api/bookings/route.ts`) invokes this Edge Function using the Supabase client after initial client-side validation and acquiring a Redis lock:

```typescript
// In app/api/bookings/route.ts
const { data: functionResponse, error: functionError } = await supabase.functions.invoke(
  'create-booking-transaction',
  {
    body: { // This is the BookingPayload defined below
      carId,
      startDate,
      endDate,
      customerDetails: {
        firstName, // Derived from fullName
        lastName,  // Derived from fullName
        email: customerDetails.email,
        phone: customerDetails.phone,
      },
      totalPrice, // Assumed to be pre-calculated
      currency,
      securityDepositAmount,
      secureTokenValue, // Pre-generated in Next.js API route
      tokenExpiresAt,   // Pre-calculated in Next.js API route
      bookingDays,      // Pre-calculated in Next.js API route
      initialOverallStatus: 'pending_payment',
      initialPaymentStatus: 'pending',
      initialContractStatus: 'not_sent',
    }
  }
);
```

---

## 4. Input Payload (Expected by Edge Function - `BookingPayload`)

The Edge Function expects a JSON body with the following structure:

```typescript
// Interface defined in supabase/functions/create-booking-transaction/index.ts
interface CustomerDetails {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
}

interface BookingPayload {
  carId: string; // UUID
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  customerDetails: CustomerDetails;
  totalPrice: number;
  currency: string;
  securityDepositAmount: number;
  secureTokenValue: string; // The pre-generated secure token string
  tokenExpiresAt: string;   // ISO string for token expiry
  bookingDays: number;
  initialOverallStatus: string;  // e.g., 'pending_payment'
  initialPaymentStatus: string;  // e.g., 'pending'
  initialContractStatus: string; // e.g., 'not_sent'
}
```

---

## 5. Logic / Steps

### 5.1. Edge Function (`index.ts`) Logic:

1.  **Handle CORS Preflight:** Responds to `OPTIONS` requests.
2.  **Parse & Validate Payload:** Deserializes the JSON request body. Performs basic checks for essential fields.
3.  **Initialize Supabase Client:** Uses `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` environment variables to create a Supabase client instance. The service role key is used to allow the subsequent RPC call to operate with sufficient privileges for the transaction.
4.  **Invoke PL/pgSQL Function:** Calls `public.create_booking_transactional` via `supabaseClient.rpc()` with parameters mapped from the `BookingPayload`.
    ```typescript
    // Inside Edge Function
    const { data, error } = await supabaseClient.rpc("create_booking_transactional", {
      p_car_id: payload.carId,
      p_start_date: payload.startDate,
      // ... other parameters mapped ...
      p_initial_contract_status: payload.initialContractStatus,
    });
    ```
5.  **Handle Response/Error from RPC:**
    *   If the RPC call itself errors or if the PL/pgSQL function returns `{ "success": false, ... }`, the Edge Function relays this error information in its HTTP response, setting appropriate status codes (e.g., 409 for `dates_unavailable`, 400 for `invalid_status_value`, 500 for other errors).
    *   If successful, the Edge Function returns the JSON response from the PL/pgSQL function (which includes `bookingId`, `customerId`, `secureTokenId`, and `success: true`) with an HTTP 201 status.
6.  **Catch Unhandled Errors:** Generic error handling for any other exceptions.

### 5.2. PL/pgSQL Function (`public.create_booking_transactional`) Logic:

This database function executes all operations within a single atomic transaction.

1.  **Parameter Casting & Initialization:**
    *   Casts text status inputs (e.g., `p_initial_overall_status`) to their respective enum types (e.g., `public.booking_overall_status_enum`). Handles `invalid_text_representation` errors.
    *   Sets `search_path = ''`.
2.  **Re-validate Car Availability (Critical Section):**
    *   Queries `public.car_availability` for the given `carId` and date range.
    *   If any date within the range has a status of `pending_confirmation`, `booked`, or `maintenance` (using their enum types), it returns a JSONB object: `{ "success": false, "error": "dates_unavailable", "unavailableDates": [...] }`.
3.  **Create/Fetch Customer Record:**
    *   Checks if a customer exists with `p_customer_email` in `public.customers`.
    *   If exists, retrieves `customerId`.
    *   If not, inserts a new record and retrieves the new `customerId`.
4.  **Insert Secure Token:**
    *   Inserts a new record into `public.booking_secure_tokens` with `p_secure_token_value`, `p_token_expires_at`, and `booking_id` initially set to `NULL`. (Note: `booking_id` was made nullable via migration `make_token_booking_id_nullable`).
    *   Retrieves the new `secureTokenId`.
5.  **Insert Booking Record:**
    *   Inserts a new record into `public.bookings` using the `p_car_id`, `v_customer_id` (from step 3), `v_secure_token_id` (from step 4), and other payload details like dates, statuses, price, etc.
    *   Retrieves the new `bookingId`.
6.  **Update `booking_secure_tokens.booking_id`:**
    *   Updates the `public.booking_secure_tokens` record (created in step 4, identified by `v_secure_token_id`) to set its `booking_id` column to the `v_booking_id` obtained in step 5. This correctly links the token to the booking.
7.  **Bulk Update `car_availability`:**
    *   For each date from `p_start_date` to `p_end_date` (inclusive):
        *   Upserts into `public.car_availability`: sets `car_id`, `date`, `status` (to `pending_confirmation` enum value), and `booking_id`.
        *   Handles conflicts on `(car_id, date)` by updating `status` and `booking_id`.
8.  **Return Success:** If all steps succeed, the transaction is committed implicitly, and the function returns a JSONB object: `{ "success": true, "bookingId": "...", "customerId": "...", "secureTokenId": "..." }`.
9.  **Exception Handling:** If any other database error occurs during the transaction, it's caught, the transaction is rolled back, and the function returns `{ "success": false, "error": "transaction_failed", "details": "SQLERRM" }`.

---

## 6. Error Handling (Edge Function & PL/pgSQL)

*   **Edge Function:**
    *   Returns 400 for missing required fields in the payload.
    *   Relays specific errors from the PL/pgSQL function (like `dates_unavailable` with 409, `invalid_status_value` with 400).
    *   Returns 500 for general RPC errors or other unhandled exceptions.
*   **PL/pgSQL Function:**
    *   Handles `invalid_text_representation` for status enums.
    *   Explicitly checks and returns for `dates_unavailable`.
    *   Uses a general `EXCEPTION WHEN OTHERS` block to catch all other errors, ensuring transaction rollback and returning a structured error JSONB.

---

## 7. Response (from Edge Function to Next.js API Route)

*   **Success (HTTP 201 Created):**
    ```json
    {
      "success": true,
      "bookingId": "uuid-of-booking",
      "customerId": "uuid-of-customer",
      "secureTokenId": "uuid-of-secure-token-record"
    }
    ```
*   **Error (HTTP 400, 409, or 500):**
    ```json
    // Example for unavailable dates (HTTP 409)
    {
      "success": false,
      "error": "dates_unavailable",
      "unavailableDates": ["YYYY-MM-DD", ...]
    }
    ```
    ```json
    // Example for general error (HTTP 500)
    {
      "success": false,
      "error": "transaction_failed", // or "rpc_error", "missing_required_fields", etc.
      "details": "More details about the error, if any"
    }
    ```

---

## 8. Deployment & Environment

*   **Edge Function:** Deployed to Supabase, runs in Deno. Relies on `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` environment variables.
*   **PL/pgSQL Function:** Deployed via database migrations. `SECURITY INVOKER` is used, meaning it runs with the permissions of the role that calls it (in this case, the service role via the Edge Function). `search_path` is explicitly set to `''`.

---

*End of document.* 