# Database Plan for Exodrive Bookings Enhancement

> Status: Implemented · Last updated December 13, 2024

This document outlines the necessary database schema changes and enhancements to support the features detailed in `bookings.prd.md` and `booking.md`.

---

## 1. Summary of Changes

The following modifications and additions are proposed:

1.  **Enum Type Updates & Additions:**
    *   Modify `booking_status_enum`.
    *   Modify `payment_status_enum`.
    *   Create new `contract_status_enum`.
    *   Create new `car_availability_status_enum`.
    *   Create new `booking_event_type_enum`.
    *   Create new `booking_media_type_enum`, `booking_media_stage_enum`, `booking_media_uploader_enum`.
    *   Create new `booking_location_type_enum`.
    *   Create new `actor_type_enum` for `booking_events`.
2.  **Table Enhancements:**
    *   `bookings` table: Add new status columns, security deposit, and link to secure token.
    *   `car_availability` table: Change status column to new enum type and ensure `booking_id` is UUID with FK.
3.  **New Tables:**
    *   `booking_secure_tokens`
    *   `booking_locations`
    *   `booking_media`
    *   `disputes`
    *   `booking_events` (for timeline)
4.  **Row Level Security (RLS):** Define and apply for all new and modified tables.
5.  **Indexes:** Add necessary indexes for performance.
6.  **Storage Buckets:** Review and create/update as needed.

---

## 2. Enum Type Definitions and Modifications

### 2.1. `booking_status_enum` (Modify)
Align with PRD lifecycle and admin dashboard needs.
**Current Values (from migration):** `('pending', 'authorized', 'booked', 'active', 'completed', 'cancelled')`
**Proposed Values:**
```sql
CREATE TYPE booking_overall_status_enum AS ENUM (
  'pending_customer_action', -- Initial state, awaiting payment/contract
  'pending_payment',         -- Awaiting payment pre-authorization
  'pending_contract',        -- Payment done, awaiting contract sending/signing
  'upcoming',                -- Payment and contract complete, before rental start
  'active',                  -- Rental in progress
  'post_rental_finalization',-- After drop-off, before closing (e.g. check for damages)
  'completed',               -- Rental finished, all clear
  'cancelled',               -- Booking cancelled by user or admin
  'disputed'                 -- Issues reported, requires attention
);
-- It might be better to rename the existing booking_status_enum or create a new one
-- to avoid conflicts if existing data uses 'booked' or 'authorized' in a way that
-- doesn't map to the new more granular statuses.
-- For this plan, we'll assume we create a new one for clarity in the bookings table.
```

### 2.2. `payment_status_enum` (Modify)
**Current Values (from migration):** `('none', 'authorized', 'captured', 'refunded')`
**Proposed Values:**
```sql
-- Option 1: Add 'voided' and 'pending' to existing enum
ALTER TYPE payment_status_enum ADD VALUE 'pending'; -- If not already there from a different migration
ALTER TYPE payment_status_enum ADD VALUE 'voided';
ALTER TYPE payment_status_enum ADD VALUE 'failed';

-- Option 2: Create a new, more comprehensive enum if existing one is too restrictive
-- CREATE TYPE booking_payment_status_enum AS ENUM (
--   'pending',      -- Payment initiated but not yet processed/authorized
--   'authorized',   -- Payment pre-authorized
--   'failed',       -- Payment authorization or capture failed
--   'captured',     -- Payment successfully captured
--   'voided',       -- Pre-authorization voided
--   'refunded',     -- Payment refunded (partial or full)
--   'partial_refund'
-- );
-- For this plan, we'll assume modifying the existing one.
```

### 2.3. `contract_status_enum` (New)
To track the status of the rental agreement.
```sql
CREATE TYPE contract_status_enum AS ENUM (
  'not_sent',
  'sent',
  'viewed',
  'signed',
  'declined',
  'voided'
);
```

### 2.4. `car_availability_status_enum` (New/Modify)
For `car_availability.status` column.
**Current `car_availability.status` CHECK:** `('available', 'booked', 'maintenance', 'pending')`
**Proposed Enum:**
```sql
CREATE TYPE car_availability_status_enum AS ENUM (
  'available',
  'pending_confirmation', -- Temporarily held during booking process
  'booked',
  'maintenance'
);
```

### 2.5. `booking_event_type_enum` (New)
For `booking_events.event_type`.
```sql
CREATE TYPE booking_event_type_enum AS ENUM (
  -- Core Booking Lifecycle
  'booking_created',
  'booking_cancelled',
  'booking_updated', -- Generic update, details in payload
  'status_changed_overall',
  'status_changed_payment',
  'status_changed_contract',

  -- Payment Events
  'payment_initiated',
  'payment_authorized',
  'payment_authorization_failed',
  'payment_captured',
  'payment_capture_failed',
  'payment_voided',
  'payment_refunded',

  -- Contract Events
  'contract_sent',
  'contract_viewed',
  'contract_signed',
  'contract_declined',

  -- Operational Events
  'car_picked_up',
  'car_returned',
  'vehicle_inspected_pickup',
  'vehicle_inspected_return',

  -- Communication
  'email_sent',         -- e.g., confirmation, reminder
  'email_delivered',
  'email_opened',
  'email_bounced',

  -- Admin/System Actions
  'admin_note_added',
  'admin_manual_override', -- For status changes etc.
  'dispute_opened',
  'dispute_evidence_submitted',
  'dispute_resolved',
  'system_reminder_sent'
);
```

### 2.6. Enums for `booking_media` (New)
```sql
CREATE TYPE booking_media_type_enum AS ENUM ('photo', 'video', 'pdf', 'other');
CREATE TYPE booking_media_stage_enum AS ENUM ('pickup_pre_rental', 'dropoff_post_rental', 'rental_agreement', 'id_scan', 'dispute_evidence', 'general_attachment');
CREATE TYPE booking_media_uploader_enum AS ENUM ('customer', 'admin', 'system');
```

### 2.7. `booking_location_type_enum` (New)
```sql
CREATE TYPE booking_location_type_enum AS ENUM ('pickup', 'dropoff');
```

### 2.8. `actor_type_enum` (New)
For `booking_events.actor_type`.
```sql
CREATE TYPE actor_type_enum AS ENUM ('customer', 'admin', 'system', 'webhook_paypal', 'webhook_resend', 'webhook_esignature');
```

---

## 3. Table Modifications

### 3.1. `public.bookings`
```sql
-- Add new status columns
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS contract_status contract_status_enum DEFAULT 'not_sent',
  -- Rename existing 'status' to 'overall_status' and use the new enum,
  -- or alter existing enum if feasible (data migration might be needed)
  -- For this plan, let's assume altering and adding values to existing enums first,
  -- and if it becomes too complex, create new columns with new enums.
  -- Example: If changing 'status' to use booking_overall_status_enum:
  -- ALTER TABLE public.bookings RENAME COLUMN status TO legacy_status; -- if data migration is needed
  -- ALTER TABLE public.bookings ADD COLUMN overall_status booking_overall_status_enum DEFAULT 'pending_customer_action';
  -- Ensure payment_status uses the modified payment_status_enum
  ALTER TABLE public.bookings ALTER COLUMN payment_status SET DEFAULT 'pending'; -- if 'pending' is added

  ADD COLUMN IF NOT EXISTS security_deposit_amount NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS secure_token_id UUID UNIQUE; -- Will be FK to booking_secure_tokens.id

-- Add Foreign Key constraint for secure_token_id (deferred until booking_secure_tokens is created)
-- ALTER TABLE public.bookings
--   ADD CONSTRAINT fk_booking_secure_token
--   FOREIGN KEY (secure_token_id) REFERENCES public.booking_secure_tokens(id) ON DELETE SET NULL;

-- Update existing 'status' column to use the more granular enum if possible,
-- or add a new column. This plan assumes modifications to existing enums first.
-- If `booking_status_enum` is modified to include 'upcoming':
-- No ALTER needed for the column type itself, just ensure the enum definition is updated.
-- If `payment_status_enum` is modified:
-- No ALTER needed for the column type itself.

-- Update RLS as needed to reflect new columns or access patterns.
```
**Notes for `bookings` table:**
*   The existing `status booking_status_enum` and `payment_status payment_status_enum` need careful handling.
    *   If the PRD's distinct `overall_status`, `payment_status`, and `contract_status` fields on the `bookings` table are desired, then:
        1.  The existing `bookings.status` might be renamed (e.g., to `primary_booking_status`).
        2.  The existing `bookings.payment_status` column is fine.
        3.  A new `bookings.contract_status contract_status_enum` column is needed.
    *   The `bookings.prd.md` (Section 7) shows `bookings` with `status enum (e.g. pending_payment, upcoming, active, completed, cancelled)`, `payment_status enum`, `contract_status enum`. This is the target.
*   The migration `20240514_add_booking_core.sql` already sets `bookings.status` default to `'pending'` and `bookings.payment_status` default to `'none'`. These defaults need to align with the new enum values and PRD logic.

### 3.2. `public.car_availability`
```sql
-- Change status column type from TEXT to the new enum
-- This requires existing data to be compatible or a CAST / data migration.
-- ALTER TABLE public.car_availability
--   DROP CONSTRAINT IF EXISTS car_availability_status_check; -- Drop existing CHECK constraint
-- ALTER TABLE public.car_availability
--   ALTER COLUMN status TYPE car_availability_status_enum USING status::car_availability_status_enum;

-- Ensure booking_id is UUID and FK to bookings.id
ALTER TABLE public.car_availability
  ALTER COLUMN booking_id TYPE UUID USING booking_id::UUID; -- If it was TEXT and stores UUIDs

-- Add FK if not already correctly defined or if it was text
-- ALTER TABLE public.car_availability
--   ADD CONSTRAINT fk_car_availability_booking
--   FOREIGN KEY (booking_id) REFERENCES public.bookings(id) ON DELETE SET NULL;
-- Note: The migration 20240320_car_tables.sql has booking_id as TEXT. This needs to be UUID.
-- The migration 20240514_add_booking_core.sql adds an index on car_availability(booking_id) but doesn't change its type.

-- Add/Update RLS policies
-- Public read is okay. Admin write access.
-- Service role should be able to update status to 'pending_confirmation' and 'booked'.
```

---

## 4. New Table Definitions

### 4.1. `public.booking_secure_tokens`
Stores tokens for shareable booking URLs.
```sql
CREATE TABLE IF NOT EXISTS public.booking_secure_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), -- New primary key for the token itself
  booking_id UUID NOT NULL UNIQUE REFERENCES public.bookings(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_booking_secure_tokens_token ON public.booking_secure_tokens(token);
CREATE INDEX IF NOT EXISTS idx_booking_secure_tokens_booking_id ON public.booking_secure_tokens(booking_id);
CREATE INDEX IF NOT EXISTS idx_booking_secure_tokens_expires_at ON public.booking_secure_tokens(expires_at);

-- Add FK from bookings.secure_token_id to this table's id
ALTER TABLE public.bookings
  ADD CONSTRAINT fk_booking_secure_token
  FOREIGN KEY (secure_token_id) REFERENCES public.booking_secure_tokens(id) ON DELETE SET NULL;

-- RLS:
ALTER TABLE public.booking_secure_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_secure_tokens FORCE ROW LEVEL SECURITY;

-- Service role can create tokens (backend operation)
CREATE POLICY "Service role can manage secure tokens"
  ON public.booking_secure_tokens FOR ALL
  TO service_role
  WITH CHECK (true);

-- Admins can manage tokens
CREATE POLICY "Admins can manage secure tokens"
  ON public.booking_secure_tokens FOR ALL
  USING ((auth.jwt() ->> 'role') = 'admin')
  WITH CHECK ((auth.jwt() ->> 'role') = 'admin');
```

### 4.2. `public.booking_locations`
Stores pickup and dropoff location details.
```sql
CREATE TABLE IF NOT EXISTS public.booking_locations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  type booking_location_type_enum NOT NULL, -- 'pickup' or 'dropoff'
  address_line1 TEXT,
  address_line2 TEXT,
  city TEXT,
  state_province TEXT,
  postal_code TEXT,
  country TEXT,
  latitude NUMERIC(9,6),
  longitude NUMERIC(9,6),
  formatted_address TEXT,
  special_instructions TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (booking_id, type) -- Typically one pickup and one dropoff per booking
);

CREATE INDEX IF NOT EXISTS idx_booking_locations_booking_id ON public.booking_locations(booking_id);

-- Trigger for updated_at
CREATE TRIGGER update_booking_locations_timestamp
BEFORE UPDATE ON public.booking_locations
FOR EACH ROW EXECUTE FUNCTION update_modified_column();

-- RLS:
ALTER TABLE public.booking_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_locations FORCE ROW LEVEL SECURITY;

-- Service role can manage locations (backend operation during booking)
CREATE POLICY "Service role can manage booking locations"
  ON public.booking_locations FOR ALL
  TO service_role
  WITH CHECK (true);

-- Users can select locations for their own bookings
CREATE POLICY "Users can select their own booking locations"
  ON public.booking_locations FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.bookings b
    JOIN public.customers c ON b.customer_id = c.id
    WHERE b.id = booking_locations.booking_id AND c.user_id = auth.uid()
  ));

-- Admins can manage all locations
CREATE POLICY "Admins can manage booking locations"
  ON public.booking_locations FOR ALL
  USING ((auth.jwt() ->> 'role') = 'admin')
  WITH CHECK ((auth.jwt() ->> 'role') = 'admin');
```

### 4.3. `public.booking_media`
Stores files related to bookings (photos, videos, PDFs).
```sql
CREATE TABLE IF NOT EXISTS public.booking_media (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  stage booking_media_stage_enum NOT NULL, -- e.g., 'pickup_pre_rental', 'rental_agreement'
  file_path TEXT NOT NULL, -- Path in Supabase Storage, e.g., "booking-media/booking_id/filename.jpg"
  storage_bucket_id TEXT NOT NULL DEFAULT 'booking-media',
  file_name TEXT NOT NULL,
  mime_type TEXT,
  file_size_bytes BIGINT,
  type booking_media_type_enum NOT NULL, -- 'photo', 'video', 'pdf'
  description TEXT,
  uploaded_by_type booking_media_uploader_enum NOT NULL, -- 'customer', 'admin', 'system'
  uploaded_by_id UUID, -- Optional: FK to customers.id or auth.users.id if applicable
  uploaded_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now() -- Same as uploaded_at initially
);

CREATE INDEX IF NOT EXISTS idx_booking_media_booking_id ON public.booking_media(booking_id);
CREATE INDEX IF NOT EXISTS idx_booking_media_stage ON public.booking_media(stage);
CREATE INDEX IF NOT EXISTS idx_booking_media_type ON public.booking_media(type);

-- RLS:
ALTER TABLE public.booking_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_media FORCE ROW LEVEL SECURITY;

-- Service role can insert media (e.g. system generated PDFs)
CREATE POLICY "Service role can insert booking media"
  ON public.booking_media FOR INSERT
  TO service_role
  WITH CHECK (true);

-- Authenticated users can insert media for their own bookings (e.g. customer uploads)
CREATE POLICY "Authenticated users can insert media for their bookings"
  ON public.booking_media FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.bookings b
    JOIN public.customers c ON b.customer_id = c.id
    WHERE b.id = booking_media.booking_id AND c.user_id = auth.uid()
  ) AND uploaded_by_type = 'customer' AND uploaded_by_id = auth.uid()); -- Or link uploaded_by_id to customers.id

-- Users can select media for their own bookings
CREATE POLICY "Users can select their own booking media"
  ON public.booking_media FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.bookings b
    JOIN public.customers c ON b.customer_id = c.id
    WHERE b.id = booking_media.booking_id AND c.user_id = auth.uid()
  ));

-- Admins can manage all media
CREATE POLICY "Admins can manage booking media"
  ON public.booking_media FOR ALL
  USING ((auth.jwt() ->> 'role') = 'admin')
  WITH CHECK ((auth.jwt() ->> 'role') = 'admin');

-- Consider policies for deleting media (e.g., only uploader or admin).
```

### 4.4. `public.disputes`
Tracks payment disputes (e.g., PayPal disputes).
```sql
CREATE TABLE IF NOT EXISTS public.disputes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_id UUID NOT NULL UNIQUE REFERENCES public.bookings(id) ON DELETE RESTRICT, -- One dispute per booking
  payment_id UUID REFERENCES public.payments(id) ON DELETE SET NULL, -- Optional link to specific payment
  dispute_provider TEXT NOT NULL DEFAULT 'PayPal', -- e.g. 'PayPal', 'Stripe'
  provider_dispute_id TEXT NOT NULL UNIQUE, -- ID from PayPal/Stripe
  status TEXT NOT NULL, -- e.g., 'OPEN', 'UNDER_REVIEW', 'RESOLVED_CUSTOMER_FAVOR', 'RESOLVED_MERCHANT_FAVOR'
  reason TEXT,
  amount NUMERIC(10,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  opened_at TIMESTAMPTZ NOT NULL, -- When dispute was opened with provider
  evidence_due_date TIMESTAMPTZ,
  evidence_submitted_at TIMESTAMPTZ,
  initial_invoice_attachments_info TEXT, -- e.g., 'Key documents attached to original invoice', or JSONB with list of attached file types
  provider_communication JSONB, -- Log of communications/updates from provider
  resolved_at TIMESTAMPTZ,
  resolution_outcome TEXT,
  internal_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_disputes_booking_id ON public.disputes(booking_id);
CREATE INDEX IF NOT EXISTS idx_disputes_provider_dispute_id ON public.disputes(provider_dispute_id);
CREATE INDEX IF NOT EXISTS idx_disputes_status ON public.disputes(status);

-- Trigger for updated_at
CREATE TRIGGER update_disputes_timestamp
BEFORE UPDATE ON public.disputes
FOR EACH ROW EXECUTE FUNCTION update_modified_column();

-- RLS:
ALTER TABLE public.disputes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.disputes FORCE ROW LEVEL SECURITY;

-- Service role can manage disputes (for webhook updates from PayPal)
CREATE POLICY "Service role can manage disputes"
  ON public.disputes FOR ALL
  TO service_role
  WITH CHECK (true);

-- Admins can manage all disputes
CREATE POLICY "Admins can manage disputes"
  ON public.disputes FOR ALL
  USING ((auth.jwt() ->> 'role') = 'admin')
  WITH CHECK ((auth.jwt() ->> 'role') = 'admin');
```

### 4.4.1. `public.dispute_evidence_items` (New)
Links dispute records to specific media items used as evidence.
```sql
CREATE TABLE IF NOT EXISTS public.dispute_evidence_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  dispute_id UUID NOT NULL REFERENCES public.disputes(id) ON DELETE CASCADE,
  booking_media_id UUID NOT NULL REFERENCES public.booking_media(id) ON DELETE RESTRICT,
  description TEXT, -- Optional: why this media is relevant for the dispute
  added_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (dispute_id, booking_media_id)
);

CREATE INDEX IF NOT EXISTS idx_dispute_evidence_items_dispute_id ON public.dispute_evidence_items(dispute_id);
CREATE INDEX IF NOT EXISTS idx_dispute_evidence_items_booking_media_id ON public.dispute_evidence_items(booking_media_id);

-- RLS:
ALTER TABLE public.dispute_evidence_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dispute_evidence_items FORCE ROW LEVEL SECURITY;

-- Admins can manage dispute evidence links
CREATE POLICY "Admins can manage dispute evidence items"
  ON public.dispute_evidence_items FOR ALL
  USING ((auth.jwt() ->> 'role') = 'admin')
  WITH CHECK ((auth.jwt() ->> 'role') = 'admin');
```

### 4.5. `public.booking_events` (Timeline)
Generic table to store all events related to a booking for timeline display.
```sql
CREATE TABLE IF NOT EXISTS public.booking_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  event_type booking_event_type_enum NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
  actor_type actor_type_enum, -- 'customer', 'admin', 'system', 'webhook_paypal', etc.
  actor_id TEXT, -- Optional: customer_id, auth.user_id for admin, webhook name, etc.
  actor_name TEXT, -- Optional: e.g. admin email, customer name for display
  details JSONB, -- Event-specific data (e.g., old_status, new_status, payment_id, note_content, email_subject)
  summary_text TEXT, -- A human-readable summary of the event for quick display
  created_at TIMESTAMPTZ DEFAULT now() -- Redundant with timestamp but common pattern
);

CREATE INDEX IF NOT EXISTS idx_booking_events_booking_id_timestamp ON public.booking_events(booking_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_booking_events_event_type ON public.booking_events(event_type);
CREATE INDEX IF NOT EXISTS idx_booking_events_actor_type ON public.booking_events(actor_type);

-- RLS:
ALTER TABLE public.booking_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_events FORCE ROW LEVEL SECURITY;

-- Service role and Admin can insert events
CREATE POLICY "Service role or Admin can insert booking events"
  ON public.booking_events FOR INSERT
  WITH CHECK (auth.role() = 'service_role' OR (auth.jwt() ->> 'role') = 'admin');

-- Users can select events for their own bookings
CREATE POLICY "Users can select events for their own bookings"
  ON public.booking_events FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.bookings b
    JOIN public.customers c ON b.customer_id = c.id
    WHERE b.id = booking_events.booking_id AND c.user_id IS NOT NULL AND c.user_id = auth.uid()
  ));

-- Admins can select all events
CREATE POLICY "Admins can select all booking events"
  ON public.booking_events FOR SELECT
  USING ((auth.jwt() ->> 'role') = 'admin');

-- Deletion/Update of events should typically be restricted or disallowed for audit purposes.
CREATE POLICY "Admins can delete booking events if necessary" -- Use with extreme caution
  ON public.booking_events FOR DELETE
  USING ((auth.jwt() ->> 'role') = 'admin');
```

### 4.6. `public.paypal_invoices` (Enhance Existing)
This table is already defined in a migration. We are enhancing it here.
```sql
-- Presumed existing columns from migration: invoice_id (PK, TEXT), booking_id (FK, UUID), status (TEXT), gross_amount (NUMERIC), currency (TEXT), created_at, updated_at

-- New Enum for status
CREATE TYPE paypal_invoice_status_enum AS ENUM (
  'DRAFT',
  'SENT',
  'SCHEDULED',
  'PAYMENT_PENDING', -- For PayPal, this often means sent and awaiting payment
  'PAID',
  'MARKED_AS_PAID',  -- Manually marked by admin
  'CANCELLED',
  'REFUNDED',
  'PARTIALLY_REFUNDED',
  'MARKED_AS_REFUNDED',
  'VOIDED'
);

ALTER TABLE public.paypal_invoices
  ADD COLUMN IF NOT EXISTS line_items JSONB, -- For invoices generated by our system/admin
  ADD COLUMN IF NOT EXISTS due_date DATE,
  ADD COLUMN IF NOT EXISTS notes_to_recipient TEXT,
  ADD COLUMN IF NOT EXISTS terms_and_conditions TEXT,
  ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS discount_percentage NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS tax_amount NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS tax_name TEXT,
  ADD COLUMN IF NOT EXISTS created_by_actor_type actor_type_enum, -- e.g., 'admin', 'system'
  ADD COLUMN IF NOT EXISTS created_by_actor_id TEXT, -- user_id of admin or system identifier
  -- Change status column type to the new enum
  -- This requires existing data to be compatible or a CAST / data migration.
  ALTER COLUMN status TYPE paypal_invoice_status_enum USING status::paypal_invoice_status_enum;

-- Ensure RLS is enabled and appropriate policies are in place for admins to manage these invoices.
ALTER TABLE public.paypal_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.paypal_invoices FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin manage paypal_invoices" ON public.paypal_invoices;
CREATE POLICY "Admin manage paypal_invoices"
  ON public.paypal_invoices FOR ALL
  USING ((auth.jwt() ->> 'role') = 'admin')
  WITH CHECK ((auth.jwt() ->> 'role') = 'admin');

-- Users might need to view invoices linked to their bookings.
DROP POLICY IF EXISTS "Users can view their paypal_invoices" ON public.paypal_invoices;
CREATE POLICY "Users can view their paypal_invoices"
  ON public.paypal_invoices FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.bookings b
    JOIN public.customers c ON b.customer_id = c.id
    WHERE b.id = paypal_invoices.booking_id AND c.user_id = auth.uid()
  ));
```

---

## 5. Storage Buckets

Based on `booking.md` (Section 8) and existing migrations:

1.  **`booking-media` (New or ensure exists):**
    *   Purpose: Store photos, videos, PDFs uploaded by customers or admins related to a booking (e.g., pre/post rental checks, damage photos).
    *   Access: Public read for general media if needed (e.g. car pickup condition photos shared with customer via a link). Authenticated write for users (their own bookings) and admins. Service role for system-generated files.
    *   RLS on `storage.objects` will be needed:
        ```sql
        -- Example policy for customer uploads to their booking's folder (pseudo-code for path check)
        -- CREATE POLICY "Customers can upload to their booking media folder"
        -- ON storage.objects FOR INSERT TO authenticated
        -- WITH CHECK (bucket_id = 'booking-media' AND storage.foldername(name)[1] = 'user_' || auth.uid() || '_booking_' || booking_media.booking_id);
        -- This type of path check needs to be handled carefully, often via security definer functions if complex.
        -- A simpler model is to allow upload to a general area and link via booking_media table with strong RLS.

        CREATE POLICY "Allow public read for booking-media bucket"
          ON storage.objects FOR SELECT
          USING (bucket_id = 'booking-media'); -- Adjust if only certain files should be public

        CREATE POLICY "Allow authenticated write for booking-media bucket (admins/service_role/customers)"
          ON storage.objects FOR INSERT
          WITH CHECK (bucket_id = 'booking-media' AND auth.role() IN ('authenticated', 'service_role'));
        -- Further refine with RLS on booking_media table to control who can *create the record* linking to the storage object.
        ```

2.  **`rental-agreements` (New or ensure exists):**
    *   Purpose: Store signed rental agreement PDFs.
    *   Access: Private. Service role write (when system generates/stores it). Admin read. Customer read (their own agreement).
    *   RLS on `storage.objects`:
        ```sql
        CREATE POLICY "Allow service_role/admin write for rental-agreements"
          ON storage.objects FOR INSERT
          WITH CHECK (bucket_id = 'rental-agreements' AND (auth.role() = 'service_role' OR (auth.jwt() ->> 'role') = 'admin'));

        -- Policy for customer to read their own agreement (path check needed)
        -- CREATE POLICY "Customer can read their own rental agreement"
        -- ON storage.objects FOR SELECT TO authenticated
        -- USING (bucket_id = 'rental-agreements' AND name LIKE auth.uid() || '_agreement_%'); -- Example path

        CREATE POLICY "Admins can read all rental agreements"
          ON storage.objects FOR SELECT
          USING (bucket_id = 'rental-agreements' AND (auth.jwt() ->> 'role') = 'admin');
        ```
Existing buckets (`cars`, `hero`, `general`, `vehicle-images`) from `20240320_car_tables.sql` should be reviewed to ensure they don't unnecessarily overlap or if their policies need adjustment.

---

## 6. Functions and Triggers

*   Ensure `update_modified_column()` trigger is applied to `updated_at` columns in new tables (`booking_locations`, `disputes`).
*   Review existing triggers (`free_car_availability_after_cancel`, `confirm_car_availability_after_confirm`) for compatibility with new enum values and status flows. New triggers might be needed for `booking_events` generation based on CRUD operations on `bookings`, `payments`, etc.

---

## 7. Implementation Notes & Order

1.  Create/Alter Enum types.
2.  Create New Tables without FKs that depend on other new tables first (e.g., `booking_secure_tokens`, `booking_events`).
3.  Modify Existing Tables.
4.  Create remaining New Tables and establish all Foreign Key constraints.
5.  Implement RLS policies for all affected tables.
6.  Create/Update Storage Buckets and their policies.
7.  Review/Update/Create database functions and triggers.
8.  Add necessary indexes.
9.  Perform data migration if changing types of columns with existing data (e.g. `car_availability.status`, `car_availability.booking_id`).

This plan should be broken down into sequential SQL migration scripts.
Consider using Supabase branching for developing and testing these schema changes.

---
*End of Database Plan.* 