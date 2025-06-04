import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { z } from 'zod';
import crypto from 'crypto';

// Resend webhook event types
const RESEND_EVENT_TYPES = {
  EMAIL_SENT: 'email.sent',
  EMAIL_DELIVERED: 'email.delivered',
  EMAIL_DELIVERY_FAILED: 'email.delivery_failed',
  EMAIL_OPENED: 'email.opened',
  EMAIL_CLICKED: 'email.clicked',
  EMAIL_BOUNCED: 'email.bounced',
  EMAIL_COMPLAINED: 'email.complained'
};

// Resend webhook payload schema
const resendWebhookSchema = z.object({
  type: z.string(),
  created_at: z.string(),
  data: z.object({
    email_id: z.string(),
    from: z.string().email(),
    to: z.union([z.string().email(), z.array(z.string().email())]),
    subject: z.string(),
    created_at: z.string(),
    delivered_at: z.string().optional(),
    opened_at: z.string().optional(),
    clicked_at: z.string().optional(),
    bounced_at: z.string().optional(),
    complained_at: z.string().optional(),
    tags: z.object({
      booking_id: z.string().optional(),
      email_type: z.string().optional()
    }).optional(),
    click: z.object({
      link: z.string(),
      timestamp: z.string()
    }).optional(),
    bounce: z.object({
      type: z.enum(['hard', 'soft']),
      message: z.string()
    }).optional()
  })
});

// Verify Resend webhook signature
function verifyResendWebhook(
  request: NextRequest,
  body: string
): boolean {
  const signature = request.headers.get('resend-signature');
  if (!signature) {
    console.error('Missing Resend signature header');
    return false;
  }

  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) {
    console.warn('RESEND_WEBHOOK_SECRET not set, skipping verification');
    return true; // In development, allow unverified webhooks
  }

  // Resend uses HMAC-SHA256 for webhook signatures
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(body)
    .digest('base64');

  return signature === expectedSignature;
}

export async function POST(request: NextRequest) {
  const supabase = createSupabaseServerClient(request.cookies as any);
  
  try {
    // Get raw body for signature verification
    const rawBody = await request.text();
    
    // Verify webhook signature
    const isValid = verifyResendWebhook(request, rawBody);
    if (!isValid) {
      console.error('Invalid Resend webhook signature');
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    // Parse JSON body
    const body = JSON.parse(rawBody);

    // Validate webhook payload
    const validationResult = resendWebhookSchema.safeParse(body);
    if (!validationResult.success) {
      console.error('Invalid Resend webhook payload:', validationResult.error);
      return NextResponse.json(
        { error: 'Invalid payload', details: validationResult.error.flatten() },
        { status: 400 }
      );
    }

    const webhookData = validationResult.data;
    const { type, data } = webhookData;

    // Extract booking ID from tags
    const bookingId = data.tags?.booking_id;
    const emailType = data.tags?.email_type || 'unknown';
    
    if (!bookingId) {
      console.warn('No booking ID found in Resend webhook:', webhookData);
      // Still log to inbox_emails table if available
      await logEmailEvent(supabase, webhookData);
      return NextResponse.json({ message: 'No booking ID found' }, { status: 200 });
    }

    // Get booking details
    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .select('id, customer_id')
      .eq('id', bookingId)
      .single();

    if (bookingError || !booking) {
      console.error('Booking not found for Resend webhook:', bookingId);
      // Still log to inbox_emails table
      await logEmailEvent(supabase, webhookData);
      return NextResponse.json({ message: 'Booking not found' }, { status: 200 });
    }

    // Handle different event types
    let eventType = 'email_status_update';
    let eventMetadata: any = {
      resend_event_type: type,
      resend_email_id: data.email_id,
      email_type: emailType,
      recipient: Array.isArray(data.to) ? data.to[0] : data.to,
      subject: data.subject
    };

    switch (type) {
      case RESEND_EVENT_TYPES.EMAIL_SENT:
        eventType = 'email_sent';
        eventMetadata.sent_at = data.created_at;
        break;

      case RESEND_EVENT_TYPES.EMAIL_DELIVERED:
        eventType = 'email_delivered';
        eventMetadata.delivered_at = data.delivered_at;
        break;

      case RESEND_EVENT_TYPES.EMAIL_DELIVERY_FAILED:
        eventType = 'email_delivery_failed';
        break;

      case RESEND_EVENT_TYPES.EMAIL_OPENED:
        eventType = 'email_opened';
        eventMetadata.opened_at = data.opened_at;
        break;

      case RESEND_EVENT_TYPES.EMAIL_CLICKED:
        eventType = 'email_clicked';
        eventMetadata.clicked_at = data.clicked_at;
        eventMetadata.clicked_link = data.click?.link;
        break;

      case RESEND_EVENT_TYPES.EMAIL_BOUNCED:
        eventType = 'email_bounced';
        eventMetadata.bounced_at = data.bounced_at;
        eventMetadata.bounce_type = data.bounce?.type;
        eventMetadata.bounce_message = data.bounce?.message;
        break;

      case RESEND_EVENT_TYPES.EMAIL_COMPLAINED:
        eventType = 'email_complained';
        eventMetadata.complained_at = data.complained_at;
        break;

      default:
        console.log('Unhandled Resend event type:', type);
    }

    // Log the event to booking_events
    await supabase.from('booking_events').insert({
      booking_id: bookingId,
      event_type: eventType,
      timestamp: new Date().toISOString(),
      actor_type: 'system',
      actor_id: 'resend-webhook',
      metadata: eventMetadata
    });

    // Log to inbox_emails table
    await logEmailEvent(supabase, webhookData, bookingId);

    // Handle specific email types
    if (type === RESEND_EVENT_TYPES.EMAIL_DELIVERED && emailType === 'booking_confirmation') {
      // Update booking to indicate confirmation email was delivered
      await supabase
        .from('bookings')
        .update({
          confirmation_email_sent_at: data.delivered_at,
          updated_at: new Date().toISOString()
        })
        .eq('id', bookingId);
    }

    return NextResponse.json({ 
      message: 'Webhook processed successfully',
      bookingId,
      eventType 
    });

  } catch (error: any) {
    console.error('Error processing Resend webhook:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}

// Helper function to log email events to inbox_emails table
async function logEmailEvent(
  supabase: any,
  webhookData: any,
  bookingId?: string
) {
  try {
    const { type, data } = webhookData;
    
    // Map Resend event type to inbox email status
    const statusMap: Record<string, string> = {
      [RESEND_EVENT_TYPES.EMAIL_SENT]: 'sent',
      [RESEND_EVENT_TYPES.EMAIL_DELIVERED]: 'delivered',
      [RESEND_EVENT_TYPES.EMAIL_DELIVERY_FAILED]: 'failed',
      [RESEND_EVENT_TYPES.EMAIL_OPENED]: 'opened',
      [RESEND_EVENT_TYPES.EMAIL_CLICKED]: 'clicked',
      [RESEND_EVENT_TYPES.EMAIL_BOUNCED]: 'bounced',
      [RESEND_EVENT_TYPES.EMAIL_COMPLAINED]: 'complained'
    };

    const status = statusMap[type] || 'unknown';

    await supabase.from('inbox_emails').insert({
      resend_id: data.email_id,
      from_email: data.from,
      to_email: Array.isArray(data.to) ? data.to[0] : data.to,
      subject: data.subject,
      status: status,
      email_type: data.tags?.email_type || 'transactional',
      booking_id: bookingId,
      metadata: {
        resend_event: type,
        delivered_at: data.delivered_at,
        opened_at: data.opened_at,
        clicked_at: data.clicked_at,
        bounced_at: data.bounced_at,
        complained_at: data.complained_at,
        bounce_details: data.bounce,
        click_details: data.click
      },
      created_at: data.created_at,
      updated_at: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error logging email event to inbox_emails:', error);
    // Don't throw - this is a non-critical operation
  }
} 