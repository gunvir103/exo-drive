import { createSupabaseServiceRoleClient } from '@/lib/supabase/server'

interface ContractData {
  // Customer Info
  customer_full_name: string
  customer_email: string
  customer_phone: string
  
  // Vehicle Info
  vehicle_make_model: string
  vehicle_year: string
  vehicle_vin: string
  vehicle_plate: string
  vehicle_color: string
  
  // Rental Terms
  rental_start_date: string
  rental_start_time: string
  rental_end_date: string
  rental_end_time: string
  pickup_location: string
  return_location: string
  
  // Financial
  daily_rate: string
  total_rental_days: number
  subtotal: string
  taxes_fees: string
  total_amount: string
  security_deposit: string
}

export class ContractGenerationService {
  private supabase = createSupabaseServiceRoleClient()
  private docusealApiUrl = process.env.DOCUSEAL_INSTANCE_URL || 'https://api.docuseal.com'
  private docusealApiToken = process.env.DOCUSEAL_API_TOKEN!
  private templateId = process.env.DOCUSEAL_TEMPLATE_ID!

  async generateContractFromBooking(bookingId: string): Promise<{
    success: boolean
    submissionId?: string
    signingUrl?: string
    error?: string
  }> {
    try {
      // 1. Fetch booking with all related data
      const { data: booking, error: bookingError } = await this.supabase
        .from('bookings')
        .select(`
          *,
          customers (*),
          cars (
            *,
            car_specifications (*),
            car_pricing (*)
          )
        `)
        .eq('id', bookingId)
        .single()

      if (bookingError || !booking) {
        console.error('Failed to fetch booking:', bookingError)
        return { success: false, error: 'Booking not found' }
      }

      // 2. Map booking data to contract fields
      const contractData = this.mapBookingToContractData(booking)

      // 3. Create DocuSeal submission
      const submission = await this.createDocuSealSubmission(
        contractData,
        booking.customers.email,
        booking.customers.full_name || 'Customer',
        booking.customers.phone,
        bookingId
      )

      if (!submission.success) {
        return submission
      }

      // 4. Update booking with contract info
      const { error: updateError } = await this.supabase
        .from('bookings')
        .update({
          contract_status: 'sent',
          contract_submission_id: submission.submissionId,
          contract_signing_url: submission.signingUrl,
          updated_at: new Date().toISOString()
        })
        .eq('id', bookingId)

      if (updateError) {
        console.error('Failed to update booking with contract info:', updateError)
      }

      // 5. Create booking event
      await this.createBookingEvent(bookingId, 'contract_sent', {
        submission_id: submission.submissionId,
        template_id: this.templateId
      })

      return submission

    } catch (error) {
      console.error('Contract generation error:', error)
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }
    }
  }

  private mapBookingToContractData(booking: any): ContractData {
    const car = booking.cars
    const customer = booking.customers
    const pricing = car.car_pricing[0] || {}
    
    // Calculate rental days
    const startDate = new Date(booking.start_date)
    const endDate = new Date(booking.end_date)
    const rentalDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1

    // Format currency
    const formatCurrency = (amount: number) => `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}`

    // Calculate totals
    const dailyRate = pricing.daily_rate || 0
    const subtotal = dailyRate * rentalDays
    const taxRate = 0.10 // 10% tax
    const taxes = subtotal * taxRate
    const total = subtotal + taxes
    const securityDeposit = pricing.security_deposit || 5000

    return {
      // Customer Info
      customer_full_name: customer.full_name || '',
      customer_email: customer.email,
      customer_phone: customer.phone || '',
      
      // Vehicle Info
      vehicle_make_model: car.name,
      vehicle_year: car.year?.toString() || '',
      vehicle_vin: car.vin || 'TBD',
      vehicle_plate: car.license_plate || 'TBD',
      vehicle_color: car.color || '',
      
      // Rental Terms
      rental_start_date: startDate.toLocaleDateString('en-US'),
      rental_start_time: '10:00 AM',
      rental_end_date: endDate.toLocaleDateString('en-US'),
      rental_end_time: '10:00 AM',
      pickup_location: booking.pickup_location || 'Main Office - 1234 Luxury Drive, Washington DC',
      return_location: booking.return_location || 'Same as pickup',
      
      // Financial
      daily_rate: formatCurrency(dailyRate),
      total_rental_days: rentalDays,
      subtotal: formatCurrency(subtotal),
      taxes_fees: formatCurrency(taxes),
      total_amount: formatCurrency(total),
      security_deposit: formatCurrency(securityDeposit)
    }
  }

  private async createDocuSealSubmission(
    contractData: ContractData,
    customerEmail: string,
    customerName: string,
    customerPhone: string | null,
    bookingId: string
  ): Promise<{
    success: boolean
    submissionId?: string
    signingUrl?: string
    error?: string
  }> {
    try {
      const response = await fetch(`${this.docusealApiUrl}/api/submissions`, {
        method: 'POST',
        headers: {
          'X-Auth-Token': this.docusealApiToken,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          template_id: parseInt(this.templateId),
          send_email: true,
          send_sms: false,
          order: 'random',
          completed_redirect_url: `${process.env.NEXT_PUBLIC_BASE_URL}/booking/${bookingId}/contract-signed`,
          submitters: [{
            role: 'Customer',
            email: customerEmail,
            name: customerName,
            phone: customerPhone,
            values: contractData,
            metadata: {
              booking_id: bookingId,
              customer_email: customerEmail
            }
          }]
        })
      })

      if (!response.ok) {
        const error = await response.text()
        console.error('DocuSeal API error:', error)
        return { success: false, error: `DocuSeal API error: ${response.status}` }
      }

      const result = await response.json()
      const submitter = result[0] // DocuSeal returns array of submitters

      return {
        success: true,
        submissionId: submitter.submission_id?.toString(),
        signingUrl: submitter.embed_src || submitter.signing_url
      }

    } catch (error) {
      console.error('DocuSeal submission error:', error)
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to create submission' 
      }
    }
  }

  private async createBookingEvent(bookingId: string, eventType: string, details: any) {
    try {
      await this.supabase
        .from('booking_events')
        .insert({
          booking_id: bookingId,
          event_type: eventType,
          actor_type: 'system',
          actor_id: 'contract-service',
          summary_text: `Contract sent to customer for signature`,
          details
        })
    } catch (error) {
      console.error('Failed to create booking event:', error)
    }
  }
} 