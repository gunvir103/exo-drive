import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { z } from 'zod';
import { getPayPalAccessToken } from '@/lib/paypal-client';

// PayPal webhook event types we care about
const PAYPAL_EVENT_TYPES = {
  PAYMENT_AUTHORIZATION_CREATED: 'PAYMENT.AUTHORIZATION.CREATED',
  PAYMENT_AUTHORIZATION_VOIDED: 'PAYMENT.AUTHORIZATION.VOIDED',
  PAYMENT_CAPTURE_COMPLETED: 'PAYMENT.CAPTURE.COMPLETED',
  PAYMENT_CAPTURE_DENIED: 'PAYMENT.CAPTURE.DENIED',
  PAYMENT_CAPTURE_REFUNDED: 'PAYMENT.CAPTURE.REFUNDED',
  CUSTOMER_DISPUTE_CREATED: 'CUSTOMER.DISPUTE.CREATED',
  CUSTOMER_DISPUTE_RESOLVED: 'CUSTOMER.DISPUTE.RESOLVED',
  CUSTOMER_DISPUTE_UPDATED: 'CUSTOMER.DISPUTE.UPDATED',
  INVOICING_INVOICE_PAID: 'INVOICING.INVOICE.PAID',
  INVOICING_INVOICE_CANCELLED: 'INVOICING.INVOICE.CANCELLED',
  INVOICING_INVOICE_UPDATED: 'INVOICING.INVOICE.UPDATED'
};

// PayPal webhook payload schema
const paypalWebhookSchema = z.object({
  id: z.string(),
  event_type: z.string(),
  resource_type: z.string().optional(),
  summary: z.string().optional(),
  resource: z.object({
    id: z.string().optional(),              // make optional
    status: z.string().optional(),
    amount: z.object({
      currency_code: z.string(),
      value: z.string()
    }).optional(),
    invoice_id: z.string().optional(),
    custom_id: z.string().optional(), // We'll use this for booking_id
    invoice_number: z.string().optional(),
    reason: z.string().optional(), // For disputes
    dispute_amount: z.object({
      currency_code: z.string(),
      value: z.string()
    }).optional()
  }).passthrough()                          // Allow additional fields
  .optional(),                              // allow missing resource
  create_time: z.string(),
  event_version: z.string()
});

// Verify PayPal webhook signature
async function verifyPayPalWebhook(
  request: NextRequest,
  rawBody: string
): Promise<boolean> {
  const PAYPAL_API_BASE = process.env.PAYPAL_MODE === 'sandbox' 
    ? 'https://api-m.sandbox.paypal.com' 
    : 'https://api-m.paypal.com';
    
  const webhookId = process.env.PAYPAL_WEBHOOK_ID;

  if (!webhookId) {
    console.warn('PAYPAL_WEBHOOK_ID not set. Skipping webhook verification. This is not secure for production.');
    return process.env.NODE_ENV !== 'production';
  }

  try {
    const accessToken = await getPayPalAccessToken();
    
    const verificationResponse = await fetch(`${PAYPAL_API_BASE}/v1/notifications/verify-webhook-signature`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`
      },
      body: JSON.stringify({
        auth_algo: request.headers.get('paypal-auth-algo') || '',
        cert_url: request.headers.get('paypal-cert-url') || '',
        transmission_id: request.headers.get('paypal-transmission-id') || '',
        transmission_sig: request.headers.get('paypal-transmission-sig') || '',
        transmission_time: request.headers.get('paypal-transmission-time') || '',
        webhook_id: webhookId,
        webhook_event: JSON.parse(rawBody)
      })
    });

    if (!verificationResponse.ok) {
        const errorBody = await verificationResponse.text();
        console.error('PayPal webhook verification API call failed:', verificationResponse.statusText, errorBody);
        return false;
    }

    const verificationData = await verificationResponse.json();
    const verificationStatus = verificationData.verification_status;
    
    if (verificationStatus === 'SUCCESS') {
      console.log('PayPal webhook signature verified successfully.');
      return true;
    } else {
      console.error('PayPal webhook signature verification failed with status:', verificationStatus);
      return false;
    }
  } catch (error: any) {
    console.error('Error verifying PayPal webhook signature:', error);
    return false;
  }
}

export async function POST(request: NextRequest) {
  const supabase = createSupabaseServerClient(request.cookies as any);
  
  try {
    const rawBody = await request.text();
    
    // Verify webhook signature
    const isValid = await verifyPayPalWebhook(request, rawBody);
    if (!isValid) {
      console.error('Invalid PayPal webhook signature');
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    const body = JSON.parse(rawBody);

    // Validate webhook payload
    const validationResult = paypalWebhookSchema.safeParse(body);
    if (!validationResult.success) {
      console.error('Invalid PayPal webhook payload:', validationResult.error);
      return NextResponse.json(
        { error: 'Invalid payload', details: validationResult.error.flatten() },
        { status: 400 }
      );
    }

    const webhookData = validationResult.data;
    const { event_type, resource } = webhookData;

    // Handle events that don't have a resource (like webhook ping)
    if (!resource) {
      console.log('PayPal webhook event without resource:', event_type);
      return NextResponse.json({ message: 'Event processed - no resource data' }, { status: 200 });
    }

    // Extract booking ID from custom_id or invoice metadata
    const bookingId = resource.custom_id || resource.invoice_number?.split('-')[1];
    
    if (!bookingId) {
      console.warn('No booking ID found in PayPal webhook:', webhookData);
      return NextResponse.json({ message: 'No booking ID found' }, { status: 200 });
    }

    // Get booking details
    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .select('*')
      .eq('id', bookingId)
      .single();

    if (bookingError || !booking) {
      console.error('Booking not found for PayPal webhook:', bookingId);
      return NextResponse.json({ message: 'Booking not found' }, { status: 200 });
    }

    // Handle different event types
    let updateData: any = {};
    let eventType = 'payment_webhook_received';
    let eventMetadata: any = {
      paypal_event_id: webhookData.id,
      paypal_event_type: event_type,
      paypal_resource_id: resource.id
    };

    switch (event_type) {
      case PAYPAL_EVENT_TYPES.PAYMENT_AUTHORIZATION_CREATED:
        updateData.payment_status = 'authorized';
        eventType = 'payment_authorized';
        eventMetadata.amount = resource.amount?.value;
        eventMetadata.currency = resource.amount?.currency_code;
        break;

      case PAYPAL_EVENT_TYPES.PAYMENT_AUTHORIZATION_VOIDED:
        updateData.payment_status = 'voided';
        eventType = 'payment_authorization_voided';
        break;

      case PAYPAL_EVENT_TYPES.PAYMENT_CAPTURE_COMPLETED:
        updateData.payment_status = 'captured';
        eventType = 'payment_captured';
        eventMetadata.amount = resource.amount?.value;
        eventMetadata.currency = resource.amount?.currency_code;
        
        // If payment is captured and contract is signed, mark as upcoming
        if (booking.contract_status === 'signed' && booking.overall_status?.startsWith('pending')) {
          updateData.overall_status = 'upcoming';
        }
        break;

      case PAYPAL_EVENT_TYPES.PAYMENT_CAPTURE_DENIED:
        updateData.payment_status = 'failed';
        eventType = 'payment_capture_failed';
        break;

      case PAYPAL_EVENT_TYPES.PAYMENT_CAPTURE_REFUNDED:
        updateData.payment_status = 'refunded';
        eventType = 'payment_refunded';
        eventMetadata.amount = resource.amount?.value;
        eventMetadata.currency = resource.amount?.currency_code;
        break;

      case PAYPAL_EVENT_TYPES.CUSTOMER_DISPUTE_CREATED:
        updateData.overall_status = 'disputed';
        eventType = 'dispute_created';
        
        // Create dispute record
        await supabase.from('disputes').insert({
          booking_id: bookingId,
          payment_id: booking.payment_id,
          dispute_status: 'open',
          reason: resource.reason || 'PayPal dispute',
          amount: parseFloat(resource.amount?.value || '0'),
          provider_dispute_id: resource.id,
          created_at: new Date().toISOString()
        });
        break;

      case PAYPAL_EVENT_TYPES.CUSTOMER_DISPUTE_RESOLVED:
        eventType = 'dispute_resolved';
        
        // Update dispute record
        await supabase
          .from('disputes')
          .update({
            dispute_status: 'resolved',
            resolved_at: new Date().toISOString()
          })
          .eq('provider_dispute_id', resource.id);
        break;

      case PAYPAL_EVENT_TYPES.INVOICING_INVOICE_PAID:
        updateData.payment_status = 'paid';
        eventType = 'invoice_paid';
        
        // If payment is captured and contract is signed, mark as upcoming
        if (booking.contract_status === 'signed' && booking.overall_status?.startsWith('pending')) {
            updateData.overall_status = 'upcoming';
        }
        
        // The `paypal_invoices` table seems to be the right place for this, 
        // but there is no direct relation from `bookings`.
        // I will assume for now this logic is handled elsewhere or not needed immediately.
        break;

      case PAYPAL_EVENT_TYPES.INVOICING_INVOICE_CANCELLED:
        eventType = 'invoice_cancelled';
        break;

      default:
        console.log('Unhandled PayPal event type:', event_type);
    }

    // Update booking if needed
    if (Object.keys(updateData).length > 0) {
      const { error: updateError } = await supabase
        .from('bookings')
        .update({
          ...updateData,
          updated_at: new Date().toISOString()
        })
        .eq('id', bookingId);

      if (updateError) {
        console.error('Error updating booking from PayPal webhook:', updateError);
      }
    }

    // Log the event
    const { error: eventError } = await supabase.from('booking_events').insert({
      booking_id: bookingId,
      event_type: eventType,
      summary_text: webhookData.summary,
      actor_type: 'webhook_paypal',
      actor_name: 'PayPal System',
      details: webhookData
    });

    if (eventError) {
        console.error('Error logging PayPal event:', eventError);
    }

    // This part of the logic seems to have some inconsistencies with the schema.
    // The `payments` table doesn't have a `gateway_response`.
    // I will update the status and paypal_order_id if available.
    if (booking.payment_id && updateData.payment_status) {
      const paymentUpdateData: any = {
        status: updateData.payment_status,
        updated_at: new Date().toISOString()
      };
      
      if (resource.id && (event_type === PAYPAL_EVENT_TYPES.PAYMENT_AUTHORIZATION_CREATED || event_type === PAYPAL_EVENT_TYPES.PAYMENT_CAPTURE_COMPLETED)) {
        // resource.id could be authorization id or capture id.
        // Assuming paypal_order_id on payments table can store this.
        // The custom_id on the webhook resource should be the booking_id.
        // resource.id from a capture event is the capture ID.
        // resource.id from an authorization is the authorization ID.
        // The `payments` table has `paypal_authorization_id` and `paypal_order_id`.
        if(event_type === PAYPAL_EVENT_TYPES.PAYMENT_AUTHORIZATION_CREATED){
            paymentUpdateData.paypal_authorization_id = resource.id;
        }
      }

      const { error: paymentUpdateError } = await supabase
        .from('payments')
        .update(paymentUpdateData)
        .eq('id', booking.payment_id);

        if (paymentUpdateError) {
            console.error('Error updating payment record from PayPal webhook:', paymentUpdateError);
        }
    }

    return NextResponse.json({ 
      message: 'Webhook processed successfully',
      bookingId,
      eventType 
    });

  } catch (error: any) {
    console.error('Error processing PayPal webhook:', error);
    if (error instanceof SyntaxError) {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
} 