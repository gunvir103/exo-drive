import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { z } from 'zod';

// Schema for status update request
const statusUpdateSchema = z.object({
  status: z.enum([
    'pending_customer_action',
    'pending_payment',
    'pending_contract',
    'contract_pending_signature',
    'upcoming',
    'active',
    'post_rental',
    'completed',
    'cancelled',
    'failed',
    'disputed'
  ]),
  reason: z.string().optional(),
  notes: z.string().optional()
});

// Define allowed status transitions
const allowedTransitions: Record<string, string[]> = {
  pending_customer_action: ['pending_payment', 'cancelled'],
  pending_payment: ['pending_contract', 'cancelled', 'failed'],
  pending_contract: ['contract_pending_signature', 'cancelled'],
  contract_pending_signature: ['upcoming', 'pending_contract', 'cancelled'],
  upcoming: ['active', 'cancelled'],
  active: ['post_rental', 'disputed'],
  post_rental: ['completed', 'disputed'],
  completed: ['disputed'],
  cancelled: [],
  failed: [],
  disputed: ['completed', 'cancelled']
};

export async function PATCH(
  request: NextRequest,
  { params }: { params: { bookingId: string } }
) {
  const supabase = createSupabaseServerClient(request.cookies as any);
  
  try {
    // Check admin authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { bookingId } = params;
    const body = await request.json();

    // Validate request
    const validationResult = statusUpdateSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        { error: 'Invalid request payload', details: validationResult.error.flatten() },
        { status: 400 }
      );
    }

    const { status: newStatus, reason, notes } = validationResult.data;

    // Get current booking status
    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .select('overall_status, car_id, start_date, end_date, payment_status, contract_status')
      .eq('id', bookingId)
      .single();

    if (bookingError || !booking) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
    }

    const currentStatus = booking.overall_status;

    // Check if transition is allowed
    const allowedNextStatuses = allowedTransitions[currentStatus] || [];
    if (!allowedNextStatuses.includes(newStatus)) {
      return NextResponse.json(
        { 
          error: 'Invalid status transition',
          details: `Cannot transition from ${currentStatus} to ${newStatus}`,
          allowedTransitions: allowedNextStatuses
        },
        { status: 400 }
      );
    }

    // Prepare update data
    const updateData: any = {
      overall_status: newStatus,
      updated_at: new Date().toISOString()
    };

    // Add notes if provided
    if (notes) {
      updateData.admin_notes = notes;
    }

    // Handle specific status transitions
    switch (newStatus) {
      case 'active':
        // When activating, ensure car availability is marked as booked
        await supabase
          .from('car_availability')
          .update({ status: 'booked' })
          .eq('car_id', booking.car_id)
          .gte('date', booking.start_date)
          .lte('date', booking.end_date);
        break;

      case 'cancelled':
        // Free up car availability
        await supabase
          .from('car_availability')
          .update({ status: 'available' })
          .eq('booking_id', bookingId);
        break;

      case 'completed':
        // Mark as completed and free up availability for future dates
        const today = new Date().toISOString().split('T')[0];
        await supabase
          .from('car_availability')
          .update({ status: 'available' })
          .eq('booking_id', bookingId)
          .gt('date', today);
        break;

      case 'disputed':
        // Create a dispute record if not exists
        const { data: existingDispute } = await supabase
          .from('disputes')
          .select('id')
          .eq('booking_id', bookingId)
          .single();

        if (!existingDispute) {
          await supabase.from('disputes').insert({
            booking_id: bookingId,
            dispute_status: 'open',
            reason: reason || 'Status changed to disputed',
            created_at: new Date().toISOString()
          });
        }
        break;
    }

    // Update booking status
    const { data: updatedBooking, error: updateError } = await supabase
      .from('bookings')
      .update(updateData)
      .eq('id', bookingId)
      .select()
      .single();

    if (updateError) {
      console.error('Error updating booking status:', updateError);
      return NextResponse.json(
        { error: 'Failed to update booking status', details: updateError.message },
        { status: 500 }
      );
    }

    // Log the status change event
    await supabase.from('booking_events').insert({
      booking_id: bookingId,
      event_type: 'booking_status_changed',
      timestamp: new Date().toISOString(),
      actor_type: 'admin',
      actor_id: user.id,
      metadata: {
        from_status: currentStatus,
        to_status: newStatus,
        reason,
        admin_email: user.email
      }
    });

    // Send notifications based on status change
    if (newStatus === 'cancelled') {
      // TODO: Send cancellation email to customer
      await supabase.from('booking_events').insert({
        booking_id: bookingId,
        event_type: 'cancellation_notification_queued',
        timestamp: new Date().toISOString(),
        actor_type: 'system',
        metadata: { reason }
      });
    }

    return NextResponse.json({
      message: 'Booking status updated successfully',
      booking: {
        id: bookingId,
        overall_status: updatedBooking.overall_status,
        previous_status: currentStatus
      }
    });

  } catch (error: any) {
    console.error('Error updating booking status:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
} 