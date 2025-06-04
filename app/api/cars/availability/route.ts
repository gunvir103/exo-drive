import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { z } from 'zod';

// Request schema for availability check
const availabilityRequestSchema = z.object({
  carId: z.string().uuid("Invalid car ID"),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Start date must be in YYYY-MM-DD format"),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "End date must be in YYYY-MM-DD format"),
});

export async function GET(request: NextRequest) {
  const supabase = createSupabaseServerClient(request.cookies as any);
  
  try {
    // Parse query parameters
    const searchParams = request.nextUrl.searchParams;
    const carId = searchParams.get('carId');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    // Validate input
    const validationResult = availabilityRequestSchema.safeParse({
      carId,
      startDate,
      endDate,
    });

    if (!validationResult.success) {
      return NextResponse.json(
        { error: 'Invalid request parameters', details: validationResult.error.flatten() },
        { status: 400 }
      );
    }

    const { carId: validCarId, startDate: validStartDate, endDate: validEndDate } = validationResult.data;

    // Validate date range
    const start = new Date(validStartDate);
    const end = new Date(validEndDate);
    
    if (start > end) {
      return NextResponse.json(
        { error: 'Start date must be before or equal to end date' },
        { status: 400 }
      );
    }

    // Query car_availability table for the date range
    const { data: availabilityData, error: availabilityError } = await supabase
      .from('car_availability')
      .select('date, status')
      .eq('car_id', validCarId)
      .gte('date', validStartDate)
      .lte('date', validEndDate)
      .order('date', { ascending: true });

    if (availabilityError) {
      console.error('Error fetching availability:', availabilityError);
      return NextResponse.json(
        { error: 'Failed to fetch availability data' },
        { status: 500 }
      );
    }

    // Create a map of dates to their availability status
    const availabilityMap = new Map<string, string>();
    if (availabilityData) {
      availabilityData.forEach(record => {
        availabilityMap.set(record.date, record.status);
      });
    }

    // Generate array of all dates in range with their availability
    const availability: Array<{
      date: string;
      available: boolean;
      status: string;
    }> = [];
    const currentDate = new Date(validStartDate);
    
    while (currentDate <= end) {
      const dateStr = currentDate.toISOString().split('T')[0];
      const status = availabilityMap.get(dateStr) || 'available';
      
      availability.push({
        date: dateStr,
        available: status === 'available',
        status: status
      });
      
      currentDate.setDate(currentDate.getDate() + 1);
    }

    // Also fetch any existing bookings that might overlap (for extra safety)
    const { data: bookings, error: bookingsError } = await supabase
      .from('bookings')
      .select('id, start_date, end_date, overall_status')
      .eq('car_id', validCarId)
      .gte('end_date', validStartDate)
      .lte('start_date', validEndDate)
      .not('overall_status', 'in', '["cancelled", "failed"]');

    if (bookingsError) {
      console.error('Error fetching bookings:', bookingsError);
      // Continue without booking data - availability table is the source of truth
    }

    // Mark dates as unavailable if they have active bookings
    if (bookings && bookings.length > 0) {
      bookings.forEach(booking => {
        const bookingStart = new Date(booking.start_date);
        const bookingEnd = new Date(booking.end_date);
        
        availability.forEach(day => {
          const dayDate = new Date(day.date);
          if (dayDate >= bookingStart && dayDate <= bookingEnd) {
            day.available = false;
            day.status = 'booked';
          }
        });
      });
    }

    return NextResponse.json({
      carId: validCarId,
      startDate: validStartDate,
      endDate: validEndDate,
      availability,
      summary: {
        totalDays: availability.length,
        availableDays: availability.filter(d => d.available).length,
        unavailableDays: availability.filter(d => !d.available).length
      }
    });

  } catch (error: any) {
    console.error('Error in availability endpoint:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
} 