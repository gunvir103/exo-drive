import { NextResponse } from 'next/server';
import { getPayPalAccessToken } from '@/lib/paypal-client';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server';

const PAYPAL_API_BASE = process.env.PAYPAL_MODE === 'sandbox' 
    ? 'https://api-m.sandbox.paypal.com' 
    : 'https://api-m.paypal.com';

export async function POST(request: Request) {
  const supabase = createSupabaseServiceRoleClient();
  try {
    const { orderID, bookingDetails } = await request.json();

    if (!orderID) {
        return NextResponse.json({ error: 'Order ID is required' }, { status: 400 });
    }
    if (!bookingDetails) {
        return NextResponse.json({ error: 'Booking details are required' }, { status: 400 });
    }

    const accessToken = await getPayPalAccessToken();

    // Capture the payment
    const captureResponse = await fetch(`${PAYPAL_API_BASE}/v2/checkout/orders/${orderID}/capture`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
            'PayPal-Request-Id': `capture-${Date.now()}`,
        },
    });

    const capturedData = await captureResponse.json();

    if (!captureResponse.ok || capturedData.status !== 'COMPLETED') {
        console.error('PayPal payment capture failed:', capturedData);
        return NextResponse.json({ error: 'Failed to capture payment', details: capturedData }, { status: captureResponse.status });
    }
    
    // --- Database Operations ---
    // At this point, the payment is successful. Now, create the booking in the database.
    // This should ideally be a single transaction. We can use a Supabase edge function (RPC) for this.
    
    const { carId, startDate, endDate, totalPrice, customer } = bookingDetails;

    const { data: bookingResult, error } = await supabase.rpc('create_booking_with_paypal_payment', {
        p_car_id: carId,
        p_start_date: startDate,
        p_end_date: endDate,
        p_total_price: totalPrice,
        p_customer_first_name: customer.firstName,
        p_customer_last_name: customer.lastName,
        p_customer_email: customer.email,
        p_customer_phone: customer.phone,
        p_paypal_order_id: capturedData.id,
        p_amount_paid: capturedData.purchase_units[0].payments.captures[0].amount.value,
    });

    if (error || (bookingResult && !bookingResult.success)) {
        console.error('Supabase booking creation error:', error || bookingResult.error);
        // If the booking fails, we should ideally refund the payment.
        // This is a complex flow that requires further implementation.
        // For now, we'll log the error and return a failure response.
        const errorDetails = error ? error.message : (bookingResult.details || 'Unknown database error');
        return NextResponse.json({ error: 'Booking creation failed after successful payment.', details: errorDetails }, { status: 500 });
    }

    return NextResponse.json({ success: true, bookingId: bookingResult.bookingId, capturedData });
  } catch (error) {
    console.error('Failed to capture PayPal order:', error);
    // Type guard for error
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return NextResponse.json({ error: 'Failed to capture order', details: errorMessage }, { status: 500 });
  }
} 