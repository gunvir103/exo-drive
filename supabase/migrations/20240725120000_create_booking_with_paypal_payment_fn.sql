-- supabase/migrations/$(date +%Y%m%d%H%M%S)_create_booking_with_paypal_payment_fn.sql

CREATE OR REPLACE FUNCTION public.create_booking_with_paypal_payment(
    p_car_id uuid,
    p_start_date date,
    p_end_date date,
    p_total_price numeric,
    p_customer_first_name text,
    p_customer_last_name text,
    p_customer_email text,
    p_customer_phone text,
    p_paypal_order_id text,
    p_amount_paid numeric
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
    v_customer_id UUID;
    v_booking_id UUID;
    v_payment_id UUID;
    v_conflicting_dates DATE[];
BEGIN
    SET search_path = '';

    -- 1. Check for car availability first
    SELECT array_agg(ca.date)
    INTO v_conflicting_dates
    FROM public.car_availability ca
    WHERE ca.car_id = p_car_id
      AND ca.date >= p_start_date
      AND ca.date <= p_end_date
      AND ca.status IN ('booked', 'maintenance');

    IF array_length(v_conflicting_dates, 1) > 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'dates_unavailable', 'unavailableDates', v_conflicting_dates);
    END IF;

    -- 2. Find or create the customer
    SELECT id INTO v_customer_id FROM public.customers WHERE email = p_customer_email;

    IF NOT FOUND THEN
        INSERT INTO public.customers (first_name, last_name, email, phone)
        VALUES (p_customer_first_name, p_customer_last_name, p_customer_email, p_customer_phone)
        RETURNING id INTO v_customer_id;
    END IF;

    -- 3. Create the booking record
    INSERT INTO public.bookings (
        car_id, 
        customer_id, 
        start_date, 
        end_date, 
        total_price,
        payment_status,
        overall_status,
        contract_status,
        currency
    )
    VALUES (
        p_car_id,
        v_customer_id,
        p_start_date,
        p_end_date,
        p_total_price,
        'captured'::public.payment_status_enum,
        'upcoming'::public.booking_overall_status_enum,
        'not_sent'::public.contract_status_enum,
        'USD' -- Assuming USD
    )
    RETURNING id INTO v_booking_id;

    -- 4. Create the payment record
    INSERT INTO public.payments (
        booking_id,
        amount,
        status,
        currency,
        paypal_order_id,
        captured_at
    )
    VALUES (
        v_booking_id,
        p_amount_paid,
        'captured'::public.payment_status_enum,
        'USD', -- Assuming USD
        p_paypal_order_id,
        now()
    )
    RETURNING id INTO v_payment_id;

    -- 5. Update car availability for the booked dates
    UPDATE public.car_availability
    SET 
        status = 'booked'::public.car_availability_status_enum,
        booking_id = v_booking_id
    WHERE
        car_id = p_car_id
        AND date >= p_start_date
        AND date <= p_end_date;

    -- Log the event (optional but good practice)
    INSERT INTO public.booking_events (booking_id, event_type, actor_type, summary_text, details)
    VALUES (
        v_booking_id,
        'payment_captured'::public.booking_event_type_enum,
        'webhook_paypal'::public.actor_type_enum,
        'Payment successfully captured via PayPal.',
        jsonb_build_object(
            'paypalOrderId', p_paypal_order_id,
            'amount', p_amount_paid
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'bookingId', v_booking_id,
        'customerId', v_customer_id,
        'paymentId', v_payment_id
    );

EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object('success', false, 'error', 'transaction_failed', 'details', SQLERRM);
END;
$$; 