# Rental Agreement PDF Automation Guide

## Overview
This guide explains how to prepare and automate your rental agreement PDF for use with DocuSeal, enabling automatic contract generation when customers book vehicles.

## PDF Preparation Methods

### Method 1: Text Field Tags (Recommended)
The easiest way is to use text tags directly in your PDF. DocuSeal will automatically detect and replace these tags.

#### Basic Tag Format
```
{{Field Name;role=Customer;type=text}}
```

#### Common Field Types for Rental Agreement

**Customer Information:**
```
{{customer_full_name;role=Customer;type=text;required=true}}
{{customer_email;role=Customer;type=text;required=true}}
{{customer_phone;role=Customer;type=phone;required=true}}
{{driver_license_number;role=Customer;type=text;required=true}}
{{customer_address;role=Customer;type=text;required=true}}
```

**Vehicle Details (Auto-filled from booking):**
```
{{vehicle_make_model;role=Customer;type=text;readonly=true}}
{{vehicle_year;role=Customer;type=text;readonly=true}}
{{vehicle_vin;role=Customer;type=text;readonly=true}}
{{vehicle_plate;role=Customer;type=text;readonly=true}}
{{vehicle_color;role=Customer;type=text;readonly=true}}
```

**Rental Terms (Auto-filled):**
```
{{rental_start_date;role=Customer;type=date;readonly=true}}
{{rental_end_date;role=Customer;type=date;readonly=true}}
{{pickup_location;role=Customer;type=text;readonly=true}}
{{return_location;role=Customer;type=text;readonly=true}}
```

**Financial Details (Auto-filled):**
```
{{daily_rate;role=Customer;type=text;readonly=true}}
{{total_rental_days;role=Customer;type=number;readonly=true}}
{{subtotal;role=Customer;type=text;readonly=true}}
{{taxes_fees;role=Customer;type=text;readonly=true}}
{{total_amount;role=Customer;type=text;readonly=true}}
{{security_deposit;role=Customer;type=text;readonly=true}}
```

**Signatures and Acceptance:**
```
{{customer_signature;role=Customer;type=signature;required=true}}
{{customer_signature_date;role=Customer;type=date;required=true}}
{{accept_terms;role=Customer;type=checkbox;required=true}}
{{accept_damage_policy;role=Customer;type=checkbox;required=true}}
```

### Method 2: DocuSeal Form Builder
1. Upload your PDF to DocuSeal
2. Use the visual form builder to add fields
3. Set field properties (required, readonly, etc.)
4. Map field names to match our contract data structure

### Method 3: API Field Positioning
For existing PDFs without tags, specify exact field positions:

```typescript
{
  name: "customer_signature",
  type: "signature",
  required: true,
  areas: [{
    x: 0.15,      // 15% from left
    y: 0.85,      // 85% from top
    w: 0.35,      // 35% width
    h: 0.05,      // 5% height
    page: 3       // Page number
  }]
}
```

## Rental Agreement Structure

### Page 1: Agreement Header
- Company logo and contact information
- Agreement number: `RENTAL-{{booking_id}}`
- Date of agreement: `{{current_date}}`

### Page 2-3: Terms and Conditions
- Rental period and rates
- Vehicle condition acknowledgment
- Insurance requirements
- Damage and liability terms
- Payment terms

### Page 4: Vehicle Condition Report
- Pre-existing damage checklist
- Fuel level indicator
- Mileage recording
- Photos attachment reference

### Page 5: Signatures
- Customer signature and date
- Terms acceptance checkboxes
- Company representative (pre-signed or automated)

## Implementation Checklist

### 1. PDF Preparation
- [ ] Add text tags to PDF using Adobe Acrobat or similar
- [ ] Ensure consistent field naming
- [ ] Mark readonly fields for auto-filled data
- [ ] Set required fields appropriately

### 2. DocuSeal Template Setup
- [ ] Upload prepared PDF to DocuSeal
- [ ] Verify all fields are detected
- [ ] Test with sample data
- [ ] Configure signing order (if multiple signers)

### 3. Data Mapping
Ensure your contract service sends these fields:

```typescript
const contractFields = {
  // From booking
  booking_id: booking.id,
  booking_date: new Date().toLocaleDateString(),
  
  // From customer
  customer_full_name: customer.full_name,
  customer_email: customer.email,
  customer_phone: customer.phone,
  customer_address: customer.address || '',
  driver_license_number: customer.driver_license || '',
  
  // From vehicle
  vehicle_make_model: `${car.make} ${car.model}`,
  vehicle_year: car.year,
  vehicle_vin: car.vin,
  vehicle_plate: car.license_plate,
  vehicle_color: car.color,
  vehicle_mileage: car.current_mileage || '',
  
  // Rental details
  rental_start_date: formatDate(booking.start_date),
  rental_start_time: booking.pickup_time || '10:00 AM',
  rental_end_date: formatDate(booking.end_date),
  rental_end_time: booking.return_time || '10:00 AM',
  pickup_location: booking.pickup_location,
  return_location: booking.return_location,
  
  // Financial
  daily_rate: formatCurrency(pricing.daily_rate),
  total_rental_days: calculateDays(booking.start_date, booking.end_date),
  subtotal: formatCurrency(subtotal),
  taxes_fees: formatCurrency(taxes),
  total_amount: formatCurrency(total),
  security_deposit: formatCurrency(deposit),
  payment_method: 'Credit Card on File',
  
  // Company details
  company_name: 'Exodrive Luxury Rentals',
  company_address: '1234 Luxury Drive, Washington DC 20001',
  company_phone: '(202) 555-0123',
  company_email: 'info@exodrive.com'
}
```

### 4. Special Considerations

#### Multi-page Forms
- Use consistent naming across pages
- DocuSeal will handle page navigation

#### Conditional Fields
```
{{insurance_opted;role=Customer;type=checkbox}}
{{insurance_details;role=Customer;type=text;showif=insurance_opted}}
```

#### File Attachments
```
{{driver_license_upload;role=Customer;type=file;required=true}}
{{insurance_card_upload;role=Customer;type=file;showif=insurance_opted}}
```

#### Calculations
DocuSeal supports formula fields:
```
{{total_with_insurance;type=formula;formula=total_amount+insurance_cost}}
```

## Testing Your Template

### 1. Create Test Booking
```bash
# Use test data
{
  "customer_email": "test@example.com",
  "vehicle_make_model": "Ferrari 488",
  "rental_start_date": "2024-03-01",
  "total_amount": "$3,600.00"
}
```

### 2. Verify Field Population
- All readonly fields should be pre-filled
- Required fields should be highlighted
- Signature areas should be clearly marked

### 3. Test Signing Flow
- Mobile responsiveness
- Field validation
- Error messages
- Completion redirect

## Common Issues and Solutions

### Issue: Fields Not Detected
**Solution:** Ensure tags use exact format with semicolons, not commas

### Issue: Signature Too Small
**Solution:** Increase field height to at least 0.08 (8% of page height)

### Issue: Date Format Issues
**Solution:** Use consistent format: MM/DD/YYYY or configure in DocuSeal

### Issue: Currency Display
**Solution:** Format as string with currency symbol: "$1,200.00"

## Security Best Practices

1. **Never expose sensitive data in field names**
2. **Use readonly for all auto-filled financial data**
3. **Implement field validation patterns:**
   ```
   {{phone;role=Customer;type=phone;pattern=^\+?1?\d{10,14}$}}
   ```

4. **Set appropriate field visibility:**
   ```
   {{internal_notes;role=Admin;type=text;hidden=true}}
   ```

## Next Steps

1. **Prepare your PDF** with field tags
2. **Upload to DocuSeal** and create template
3. **Test with real booking data**
4. **Configure webhooks** for status updates
5. **Go live** with automatic contract generation

## Sample Integration Code

```typescript
// In your booking API after successful booking creation
if (bookingCreated) {
  // Trigger contract generation
  const contractService = new ContractGenerationService()
  const result = await contractService.generateContractFromBooking(booking.id)
  
  if (result.success) {
    console.log('Contract sent:', result.signingUrl)
    // Optionally notify customer
    await sendContractReadyEmail(customer.email, result.signingUrl)
  } else {
    // Log error but don't fail the booking
    console.error('Contract generation failed:', result.error)
    // Queue for retry or manual intervention
  }
}
```

---

This guide provides everything needed to automate your rental agreement with DocuSeal. The key is proper field naming and mapping between your booking data and the PDF template. 