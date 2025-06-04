import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { z } from 'zod';

// Query parameters schema
const listBookingsSchema = z.object({
  status: z.enum(['all', 'active', 'upcoming', 'completed', 'cancelled', 'pending_payment']).optional(),
  search: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  sortBy: z.enum(['created_at', 'start_date', 'end_date', 'total_price']).default('created_at'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export async function GET(request: NextRequest) {
  const supabase = createSupabaseServerClient(request.cookies as any);
  
  try {
    // Check admin authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // TODO: Verify user has admin role
    // For now, we'll assume authenticated users are admins

    // Parse and validate query parameters
    const searchParams = Object.fromEntries(request.nextUrl.searchParams);
    const params = listBookingsSchema.parse(searchParams);

    // Build the query
    let query = supabase
      .from('bookings')
      .select(`
        *,
        customer:customers!bookings_customer_id_fkey (
          id,
          first_name,
          last_name,
          email,
          phone
        ),
        car:cars!bookings_car_id_fkey (
          id,
          name,
          slug,
          model,
          price_per_day,
          main_image_url
        ),
        payments (
          id,
          amount,
          status,
          payment_method,
          created_at
        ),
        booking_events (
          id,
          event_type,
          timestamp,
          actor_type,
          metadata
        )
      `)
      .order(params.sortBy, { ascending: params.sortOrder === 'asc' });

    // Apply filters
    if (params.status && params.status !== 'all') {
      const statusMap: Record<string, string[]> = {
        active: ['active'],
        upcoming: ['upcoming', 'pending_contract', 'contract_pending_signature'],
        completed: ['completed', 'post_rental'],
        cancelled: ['cancelled'],
        pending_payment: ['pending_payment', 'pending_customer_action']
      };
      
      const statuses = statusMap[params.status];
      if (statuses) {
        query = query.in('overall_status', statuses);
      }
    }

    // Apply date filters
    if (params.startDate) {
      query = query.gte('start_date', params.startDate);
    }
    if (params.endDate) {
      query = query.lte('end_date', params.endDate);
    }

    // Apply search filter
    if (params.search) {
      const searchTerm = `%${params.search}%`;
      query = query.or(`
        id.ilike.${searchTerm},
        customer.email.ilike.${searchTerm},
        customer.first_name.ilike.${searchTerm},
        customer.last_name.ilike.${searchTerm},
        car.name.ilike.${searchTerm}
      `);
    }

    // Apply pagination
    const from = (params.page - 1) * params.limit;
    const to = from + params.limit - 1;
    query = query.range(from, to);

    // Execute query
    const { data: bookings, error: queryError, count } = await query;

    if (queryError) {
      console.error('Error fetching bookings:', queryError);
      return NextResponse.json(
        { error: 'Failed to fetch bookings', details: queryError.message },
        { status: 500 }
      );
    }

    // Format the response
    const formattedBookings = bookings?.map(booking => ({
      id: booking.id,
      carId: booking.car_id,
      car: booking.car ? {
        id: booking.car.id,
        name: booking.car.name,
        slug: booking.car.slug,
        model: booking.car.model,
        pricePerDay: booking.car.price_per_day,
        mainImageUrl: booking.car.main_image_url
      } : null,
      customer: booking.customer ? {
        id: booking.customer.id,
        fullName: `${booking.customer.first_name} ${booking.customer.last_name}`.trim(),
        email: booking.customer.email,
        phone: booking.customer.phone
      } : null,
      startDate: booking.start_date,
      endDate: booking.end_date,
      totalPrice: booking.total_price,
      currency: booking.currency,
      overallStatus: booking.overall_status,
      paymentStatus: booking.payment_status,
      contractStatus: booking.contract_status,
      createdAt: booking.created_at,
      updatedAt: booking.updated_at,
      bookingDays: booking.booking_days,
      securityDepositAmount: booking.security_deposit_amount,
      pickupLocation: booking.pickup_location,
      dropoffLocation: booking.dropoff_location,
      notes: booking.notes,
      payments: booking.payments || [],
      recentEvents: booking.booking_events?.slice(0, 3) || []
    })) || [];

    // Calculate total pages
    const totalPages = count ? Math.ceil(count / params.limit) : 0;

    return NextResponse.json({
      bookings: formattedBookings,
      pagination: {
        page: params.page,
        limit: params.limit,
        total: count || 0,
        totalPages
      }
    });

  } catch (error: any) {
    console.error('Error in admin bookings endpoint:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}

// Create new booking (admin)
export async function POST(request: NextRequest) {
  const supabase = createSupabaseServerClient(request.cookies as any);
  
  try {
    // Check admin authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    
    // Validation schema for admin booking creation
    const createBookingSchema = z.object({
      carId: z.string().uuid(),
      customerId: z.string().uuid().optional(),
      customerDetails: z.object({
        firstName: z.string().min(1),
        lastName: z.string().min(1),
        email: z.string().email(),
        phone: z.string().optional()
      }).optional(),
      startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      totalPrice: z.number().positive(),
      currency: z.string().length(3).default('USD'),
      securityDepositAmount: z.number().nonnegative(),
      notes: z.string().optional(),
      skipAvailabilityCheck: z.boolean().default(false),
      initialStatus: z.enum(['pending_payment', 'upcoming', 'active']).default('pending_payment')
    });

    const validationResult = createBookingSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        { error: 'Invalid request payload', details: validationResult.error.flatten() },
        { status: 400 }
      );
    }

    const data = validationResult.data;

    // Calculate booking days
    const bookingDays = Math.ceil(
      (new Date(data.endDate).getTime() - new Date(data.startDate).getTime()) / 
      (1000 * 60 * 60 * 24)
    ) + 1;

    // Generate secure token
    const crypto = await import('crypto');
    const secureTokenValue = crypto.randomBytes(48).toString('hex');
    const tokenExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(); // 30 days

    // Prepare edge function payload
    const edgeFunctionPayload = {
      carId: data.carId,
      startDate: data.startDate,
      endDate: data.endDate,
      customerDetails: data.customerDetails || {
        firstName: '',
        lastName: '',
        email: '',
        phone: ''
      },
      customerId: data.customerId,
      totalPrice: data.totalPrice,
      currency: data.currency,
      securityDepositAmount: data.securityDepositAmount,
      secureTokenValue,
      tokenExpiresAt,
      bookingDays,
      initialOverallStatus: data.initialStatus,
      initialPaymentStatus: data.initialStatus === 'active' ? 'paid' : 'pending',
      initialContractStatus: data.initialStatus === 'active' ? 'signed' : 'not_sent',
      skipAvailabilityCheck: data.skipAvailabilityCheck,
      notes: data.notes,
      createdByAdmin: true,
      adminId: user.id
    };

    // Call edge function
    const { data: functionResponse, error: functionError } = await supabase.functions.invoke(
      'create-booking-transaction',
      { body: edgeFunctionPayload }
    );

    if (functionError || !functionResponse?.success) {
      console.error('Edge function error:', functionError || functionResponse);
      return NextResponse.json(
        { 
          error: 'Failed to create booking', 
          details: functionError?.message || functionResponse?.error || 'Unknown error'
        },
        { status: 500 }
      );
    }

    // Log admin action
    if (functionResponse.bookingId) {
      await supabase.from('booking_events').insert({
        booking_id: functionResponse.bookingId,
        event_type: 'admin_created_booking',
        timestamp: new Date().toISOString(),
        actor_type: 'admin',
        actor_id: user.id,
        metadata: {
          admin_email: user.email,
          initial_status: data.initialStatus
        }
      });
    }

    return NextResponse.json({
      message: 'Booking created successfully',
      bookingId: functionResponse.bookingId,
      customerId: functionResponse.customerId,
      bookingUrl: `${process.env.NEXT_PUBLIC_BASE_URL}/booking/${secureTokenValue}`
    }, { status: 201 });

  } catch (error: any) {
    console.error('Error creating admin booking:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
} 