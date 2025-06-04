import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { z } from 'zod'
import crypto from 'crypto'

// DocuSeal webhook event types
const DOCUSEAL_EVENT_TYPES = {
  SUBMISSION_CREATED: 'submission.created',
  SUBMISSION_VIEWED: 'submission.viewed',
  SUBMISSION_COMPLETED: 'submission.completed',
  SUBMISSION_EXPIRED: 'submission.expired',
  SUBMISSION_ARCHIVED: 'submission.archived',
  TEMPLATE_CREATED: 'template.created',
  TEMPLATE_UPDATED: 'template.updated'
}

// DocuSeal webhook payload schema
const docusealWebhookSchema = z.object({
  event_type: z.string(),
  timestamp: z.number(),
  data: z.object({
    id: z.number(),
    submission_id: z.number().optional(),
    slug: z.string().optional(),
    source: z.string().optional(),
    submitters: z.array(z.object({
      id: z.number(),
      email: z.string().email(),
      slug: z.string(),
      sent_at: z.string().nullable(),
      viewed_at: z.string().nullable(),
      completed_at: z.string().nullable(),
      declined_at: z.string().nullable().optional(),
      name: z.string().optional(),
      phone: z.string().optional(),
      status: z.enum(['pending', 'sent', 'opened', 'completed', 'declined']).optional(),
      metadata: z.record(z.any()).optional()
    })).optional(),
    template: z.object({
      id: z.number(),
      name: z.string(),
      slug: z.string().optional(),
      folder_name: z.string().optional()
    }).optional(),
    created_at: z.string(),
    updated_at: z.string(),
    archived_at: z.string().nullable().optional(),
    completed_at: z.string().nullable().optional(),
    expire_at: z.string().nullable().optional(),
    documents: z.array(z.object({
      id: z.number(),
      name: z.string(),
      url: z.string()
    })).optional(),
    metadata: z.record(z.any()).optional()
  })
})

// Verify DocuSeal webhook signature
function verifyDocusealWebhook(
  request: NextRequest,
  body: string
): boolean {
  const signature = request.headers.get('x-docuseal-signature')
  if (!signature) {
    console.error('Missing DocuSeal signature header')
    return false
  }

  const secret = process.env.DOCUSEAL_WEBHOOK_SECRET
  if (!secret) {
    console.warn('DOCUSEAL_WEBHOOK_SECRET not set, skipping verification')
    return true // In development, allow unverified webhooks
  }

  // DocuSeal uses HMAC-SHA256 for webhook signatures
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(body)
    .digest('hex')

  return signature === expectedSignature
}

export async function POST(request: NextRequest) {
  const supabase = createSupabaseServerClient(request.cookies as any)
  
  try {
    // Get raw body for signature verification
    const rawBody = await request.text()
    
    // Verify webhook signature
    const isValid = verifyDocusealWebhook(request, rawBody)
    if (!isValid) {
      console.error('Invalid DocuSeal webhook signature')
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    }

    // Parse JSON body
    const body = JSON.parse(rawBody)

    // Validate webhook payload
    const validationResult = docusealWebhookSchema.safeParse(body)
    if (!validationResult.success) {
      console.error('Invalid DocuSeal webhook payload:', validationResult.error)
      return NextResponse.json(
        { error: 'Invalid payload', details: validationResult.error.flatten() },
        { status: 400 }
      )
    }

    const webhookData = validationResult.data
    const { event_type, data } = webhookData

    // Extract booking ID from metadata
    const bookingId = data.metadata?.booking_id || 
                     data.submitters?.[0]?.metadata?.booking_id
    
    if (!bookingId) {
      console.warn('No booking ID found in DocuSeal webhook:', webhookData)
      return NextResponse.json({ message: 'No booking ID found' }, { status: 200 })
    }

    // Get booking details
    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .select('*')
      .eq('id', bookingId)
      .single()

    if (bookingError || !booking) {
      console.error('Booking not found for DocuSeal webhook:', bookingId)
      return NextResponse.json({ message: 'Booking not found' }, { status: 200 })
    }

    // Handle different event types
    let updateData: any = {}
    let eventType = 'contract_webhook_received'
    let eventMetadata: any = {
      docuseal_event_type: event_type,
      docuseal_submission_id: data.submission_id || data.id,
      template_name: data.template?.name
    }

    switch (event_type) {
      case DOCUSEAL_EVENT_TYPES.SUBMISSION_CREATED:
        updateData.contract_status = 'sent'
        eventType = 'contract_sent'
        eventMetadata.sent_at = data.created_at
        
        // Store DocuSeal submission ID if not already stored
        if (!booking.docuseal_submission_id) {
          updateData.docuseal_submission_id = data.id.toString()
        }
        break

      case DOCUSEAL_EVENT_TYPES.SUBMISSION_VIEWED:
        if (booking.contract_status === 'sent') {
          updateData.contract_status = 'viewed'
        }
        eventType = 'contract_viewed'
        eventMetadata.viewed_at = data.submitters?.[0]?.viewed_at
        break

      case DOCUSEAL_EVENT_TYPES.SUBMISSION_COMPLETED:
        updateData.contract_status = 'signed'
        eventType = 'contract_signed'
        eventMetadata.signed_at = data.completed_at
        eventMetadata.documents = data.documents
        
        // Store signed document URL
        if (data.documents && data.documents.length > 0) {
          updateData.contract_document_url = data.documents[0].url
        }
        
        // If payment is authorized and contract is signed, mark as upcoming
        if (booking.payment_status === 'authorized' && 
            ['pending_contract', 'contract_pending_signature'].includes(booking.overall_status)) {
          updateData.overall_status = 'upcoming'
        }

        // Store signed contract as booking media
        if (data.documents) {
          for (const doc of data.documents) {
            await supabase.from('booking_media').insert({
              booking_id: bookingId,
              media_type: 'signed_contract',
              file_url: doc.url,
              file_name: doc.name,
              uploaded_at: new Date().toISOString(),
              uploaded_by_type: 'system',
              uploaded_by_id: 'docuseal-webhook',
              metadata: {
                docuseal_document_id: doc.id,
                docuseal_submission_id: data.id
              }
            })
          }
        }
        break

      case DOCUSEAL_EVENT_TYPES.SUBMISSION_EXPIRED:
        updateData.contract_status = 'expired'
        eventType = 'contract_expired'
        eventMetadata.expired_at = data.expire_at
        break

      case DOCUSEAL_EVENT_TYPES.SUBMISSION_ARCHIVED:
        eventType = 'contract_archived'
        eventMetadata.archived_at = data.archived_at
        break

            default:
        console.log('Unhandled DocuSeal event type:', event_type);
    }

    // Check if submitter declined
    const submitter = data.submitters?.[0]
    if (submitter?.declined_at && submitter.status === 'declined') {
      updateData.contract_status = 'declined'
      eventType = 'contract_declined'
      eventMetadata.declined_at = submitter.declined_at
      eventMetadata.declined_by = submitter.email
    }

    // Update booking if needed
    if (Object.keys(updateData).length > 0) {
      const { error: updateError } = await supabase
        .from('bookings')
        .update({
          ...updateData,
          updated_at: new Date().toISOString()
        })
        .eq('id', bookingId)

      if (updateError) {
        console.error('Error updating booking from DocuSeal webhook:', updateError)
      }
    }

    // Log the event
    await supabase.from('booking_events').insert({
      booking_id: bookingId,
      event_type: eventType,
      timestamp: new Date().toISOString(),
      actor_type: 'system',
      actor_id: 'docuseal-webhook',
      metadata: eventMetadata
    })

    return NextResponse.json({ 
      message: 'Webhook processed successfully',
      bookingId,
      eventType 
    })

  } catch (error: any) {
    console.error('Error processing DocuSeal webhook:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    )
  }
} 