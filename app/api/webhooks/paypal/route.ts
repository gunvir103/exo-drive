import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { z } from 'zod';
import crypto from 'crypto';

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
  resource_type: z.string(),
  summary: z.string().optional(),
  resource: z.object({
    id: z.string(),
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
  }).passthrough(), // Allow additional fields
  create_time: z.string(),
  event_version: z.string()
});

// Verify PayPal webhook signature
async function verifyPayPalWebhook(
  request: NextRequest,
  body: any
): Promise<boolean> {
  // Get headers required for verification
  const transmissionId = request.headers.get('paypal-transmission-id');
  const transmissionTime = request.headers.get('paypal-transmission-time');
  const certUrl = request.headers.get('paypal-cert-url');
  const authAlgo = request.headers.get('paypal-auth-algo');
  const transmissionSig = request.headers.get('paypal-transmission-sig');
  
  if (!transmissionId || !transmissionTime || !certUrl || !authAlgo || !transmissionSig) {
    console.error('Missing PayPal webhook headers');
    return false;
  }

  // In production, you should verify the webhook signature
  // This requires calling PayPal's webhook verification endpoint
  // For now, we'll check if webhook ID is present
  const webhookId = process.env.PAYPAL_WEBHOOK_ID;
  if (!webhookId) {
    console.warn('PAYPAL_WEBHOOK_ID not set, skipping verification');
    return true; // In development, allow unverified webhooks
  }

  // TODO: Implement actual PayPal webhook verification
  // This would involve calling PayPal's verification endpoint
  // https://api-m.paypal.com/v1/notifications/verify-webhook-signature
  
  return true;
}

export async function POST(request: NextRequest) {
  const supabase = createSupabaseServerClient(request.cookies as any);
  
  try {
    // Parse request body
    const body = await request.json();
    
    // Verify webhook signature
    const isValid = await verifyPayPalWebhook(request, body);
    if (!isValid) {
      console.error('Invalid PayPal webhook signature');
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

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
        updateData.payment_status = 'failed';
        eventType = 'payment_authorization_voided';
        break;

      case PAYPAL_EVENT_TYPES.PAYMENT_CAPTURE_COMPLETED:
        updateData.payment_status = 'paid';
        eventType = 'payment_captured';
        eventMetadata.amount = resource.amount?.value;
        eventMetadata.currency = resource.amount?.currency_code;
        
        // If payment is captured and contract is signed, mark as active
        if (booking.contract_status === 'signed' && booking.overall_status === 'upcoming') {
          updateData.overall_status = 'active';
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
        
        // Store invoice ID if not already stored
        if (!booking.paypal_invoice_id) {
          updateData.paypal_invoice_id = resource.id;
        }
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
    await supabase.from('booking_events').insert({
      booking_id: bookingId,
      event_type: eventType,
      timestamp: new Date().toISOString(),
      actor_type: 'system',
      actor_id: 'paypal-webhook',
      metadata: eventMetadata
    });

    // Update payment record if exists
    if (booking.payment_id && updateData.payment_status) {
      await supabase
        .from('payments')
        .update({
          status: updateData.payment_status,
          gateway_response: {
            paypal_event_id: webhookData.id,
            paypal_resource_id: resource.id,
            last_updated: new Date().toISOString()
          },
          updated_at: new Date().toISOString()
        })
        .eq('id', booking.payment_id);
    }

    return NextResponse.json({ 
      message: 'Webhook processed successfully',
      bookingId,
      eventType 
    });

  } catch (error: any) {
    console.error('Error processing PayPal webhook:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
} 