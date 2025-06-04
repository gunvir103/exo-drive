# DocuSeal Integration PRD – Exodrive

> **Status:** Final Review · Last updated {{DATE}}
> 
> This document provides the production-ready requirements for integrating self-hosted DocuSeal into Exodrive's car rental booking system, based on comprehensive analysis of existing documentation and official DocuSeal capabilities.

---

## Executive Summary

This PRD finalizes the plan to integrate DocuSeal as the primary e-signature solution for Exodrive's rental agreements. The integration will **automatically generate and send contracts** when customers complete bookings through the website, eliminating manual contract creation and ensuring 100% contract coverage for all rentals.

### Key Decisions
- **Provider:** Self-hosted DocuSeal (not Dropbox Sign)
- **Deployment:** Docker container on dedicated infrastructure
- **Priority:** Automatic contract generation for customer bookings
- **Timeline:** 27-day implementation (6 phases)

---

## 1. Business Requirements

### 1.1 Primary Objectives
1. **Zero Manual Contract Creation** - Every booking automatically generates a contract
2. **Customer Self-Service** - Contracts sent within 5-10 minutes of booking
3. **Dispute Protection** - Signed PDFs automatically linked to bookings for evidence
4. **Real-time Visibility** - Contract status updates in admin dashboard within 15 seconds

### 1.2 Success Metrics
| Metric | Current | Target | Measurement |
|--------|---------|--------|-------------|
| Contract Generation Time | 30+ min manual | < 30 sec automated | API response time |
| Customer Signing Rate | N/A | > 85% within 24h | DocuSeal analytics |
| Admin Workload | 100% manual | < 5% manual intervention | Booking/contract ratio |
| Dispute Evidence Readiness | Manual collection | 100% auto-linked | DB query |
| Contract Coverage | ~60% of bookings | 100% of bookings | Bookings with contracts |

### 1.3 Out of Scope
- Multi-language contracts (Phase 2)
- Contract amendments/modifications
- Integration with other e-signature providers
- Customer portal for viewing past contracts

---

## 2. Technical Architecture

### 2.1 System Overview
```
┌─────────────────────┐
│  Customer Books Car │
└──────────┬──────────┘
           │
     ┌─────▼─────────────────────┐
     │  Booking API              │
     │  Creates Booking Record   │
     └─────────┬─────────────────┘
               │
     ┌─────────▼─────────────────┐
     │  Contract Service         │
     │  Aggregates Booking Data  │
     └─────────┬─────────────────┘
               │
     ┌─────────▼─────────────────┐
     │  DocuSeal API             │
     │  Creates Submission       │
     └─────────┬─────────────────┘
               │
     ┌─────────▼─────────────────┐
     │  Customer Email           │
     │  Signing Link Delivered   │
     └─────────┬─────────────────┘
               │
     ┌─────────▼─────────────────┐
     │  DocuSeal Webhook         │
     │  Status Updates           │
     └─────────┬─────────────────┘
               │
     ┌─────────▼─────────────────┐
     │  Booking Status           │
     │  Updated in Real-time     │
     └─────────────────────────────┘
```

### 2.2 DocuSeal Integration Points

#### 2.2.1 Self-Hosted Deployment
```yaml
# docker-compose.yml
services:
  docuseal:
    image: docuseal/docuseal:latest
    environment:
      - DATABASE_URL=postgresql://user:pass@db:5432/docuseal
      - SECRET_KEY_BASE=${DOCUSEAL_SECRET}
      - DOCUSEAL_DOMAIN=docuseal.exodrive.com
    volumes:
      - docuseal-data:/data
    ports:
      - "3000:3000"
```

#### 2.2.2 API Integration
Based on official DocuSeal API documentation:

**Authentication:**
```typescript
headers: {
  'X-Auth-Token': process.env.DOCUSEAL_API_TOKEN
}
```

**Create Submission (Contract):**
```typescript
POST https://docuseal.exodrive.com/api/submissions
{
  "template_id": 1000001,
  "send_email": true,
  "send_sms": false,
  "order": "random",
  "completed_redirect_url": "https://exodrive.com/booking/[token]/contract-signed",
  "submitters": [{
    "role": "Customer",
    "email": "john.doe@example.com",
    "name": "John Doe",
    "phone": "+1234567890",
    "values": {
      "rental_start_date": "2024-03-15",
      "rental_end_date": "2024-03-17",
      "car_make_model": "Lamborghini Huracán",
      "daily_rate": "$1,200",
      "total_amount": "$3,600",
      "security_deposit": "$5,000"
    },
    "metadata": {
      "booking_id": "book_abc123",
      "customer_id": "cust_xyz789"
    }
  }]
}
```

#### 2.2.3 Webhook Events
DocuSeal will send POST requests to `/api/webhooks/docuseal`:

```typescript
// Event types from official docs
type DocuSealWebhookEvent = 
  | 'form.viewed'     // Customer opened the contract
  | 'form.started'    // Customer began filling
  | 'form.completed'  // Contract signed
  | 'form.declined'   // Customer declined to sign

// Webhook payload structure
interface WebhookPayload {
  event_type: DocuSealWebhookEvent;
  timestamp: string;
  data: {
    id: number;
    submission_id: number;
    email: string;
    status: 'completed' | 'declined' | 'opened' | 'sent';
    completed_at?: string;
    declined_at?: string;
    documents?: Array<{
      name: string;
      url: string;
    }>;
    metadata: {
      booking_id: string;
      customer_id: string;
    };
  };
}
```

### 2.3 Database Schema (Existing)
The current database already supports contract management:

```sql
-- Existing enums
contract_status_enum: 
  'not_sent' | 'sent' | 'viewed' | 'signed' | 'declined' | 'voided'

booking_event_type_enum includes:
  'contract_sent' | 'contract_viewed' | 'contract_signed' | 
  'contract_declined' | 'status_changed_contract'

-- Existing columns
bookings.contract_status (default: 'not_sent')

-- New columns needed
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS:
  - contract_document_id TEXT
  - contract_submission_id TEXT  -- DocuSeal submission ID
  - contract_signing_url TEXT
  - contract_signed_at TIMESTAMPTZ
  - contract_template_version INTEGER
```

---

## 3. Implementation Plan

### 3.1 Phase 1: Foundation (Days 1-3)
- [ ] Deploy self-hosted DocuSeal instance
- [ ] Configure environment variables and secrets
- [ ] Create rental agreement template in DocuSeal
- [ ] Add missing database columns via migration
- [ ] Update TypeScript types from schema

### 3.2 Phase 2: Customer Booking Integration (Days 4-8) **[PRIORITY]**
- [ ] Create `/api/bookings/[id]/contract/generate` endpoint
- [ ] Implement `ContractGenerationService`:
  ```typescript
  class ContractGenerationService {
    async generateFromBooking(bookingId: string) {
      // 1. Fetch booking with relations
      // 2. Map to DocuSeal template values
      // 3. Create submission via API
      // 4. Update booking with contract IDs
      // 5. Create booking_event record
    }
  }
  ```
- [ ] Auto-trigger after booking creation in `/api/bookings`
- [ ] Add contract status to booking success response
- [ ] Update booking confirmation page UI

### 3.3 Phase 3: Webhook & Status Tracking (Days 9-12)
- [ ] Implement `/api/webhooks/docuseal` with signature verification
- [ ] Create idempotent webhook processor
- [ ] Map DocuSeal events to booking_events
- [ ] Update contract_status based on events
- [ ] Add real-time status to customer booking page

### 3.4 Phase 4: Admin Dashboard (Days 13-17)
- [ ] Add contract status section to booking details
- [ ] Implement manual contract actions:
  - Send/Resend contract
  - View signing link
  - Download signed PDF
  - Void contract
- [ ] Add contract events to booking timeline
- [ ] Create contract analytics dashboard

### 3.5 Phase 5: Storage & Evidence (Days 18-22)
- [ ] Configure Supabase Storage for signed PDFs
- [ ] Implement automatic PDF download after signing
- [ ] Link contracts to booking_media table
- [ ] Create dispute evidence aggregation service
- [ ] Test PayPal dispute integration

### 3.6 Phase 6: Testing & Launch (Days 23-27)
- [ ] Unit tests for all services
- [ ] Integration tests for complete flow
- [ ] Load testing for concurrent bookings
- [ ] Security audit (webhook verification, access control)
- [ ] Production deployment and monitoring

---

## 4. API Specifications

### 4.1 Contract Generation
```typescript
// POST /api/bookings/[id]/contract/generate
interface GenerateContractRequest {
  sendImmediately?: boolean;  // Default: true
  customMessage?: string;
  triggeredBy: 'customer_booking' | 'admin_manual';
}

interface GenerateContractResponse {
  success: boolean;
  submissionId: string;
  contractId: string;
  signingUrl: string;
  expiresAt: string;
  error?: string;
}
```

### 4.2 Webhook Handler
```typescript
// POST /api/webhooks/docuseal
// Headers: X-DocuSeal-Signature: sha256=...

// Verification
const signature = request.headers.get('X-DocuSeal-Signature');
const payload = await request.text();
const expectedSig = crypto
  .createHmac('sha256', process.env.DOCUSEAL_WEBHOOK_SECRET)
  .update(payload)
  .digest('hex');

if (`sha256=${expectedSig}` !== signature) {
  return new Response('Unauthorized', { status: 401 });
}
```

### 4.3 Admin Contract Management
```typescript
// GET /api/admin/bookings/[id]/contract
interface ContractDetails {
  status: ContractStatus;
  submissionId: string;
  documentId?: string;
  signingUrl?: string;
  signedAt?: string;
  signedDocumentUrl?: string;
  events: ContractEvent[];
}

// POST /api/admin/bookings/[id]/contract/void
interface VoidContractRequest {
  reason: string;
}
```

---

## 5. Security & Compliance

### 5.1 Security Measures
1. **Webhook Verification** - HMAC-SHA256 signature validation
2. **API Authentication** - Secure token storage in environment variables
3. **Access Control** - RLS policies for contract data
4. **Data Encryption** - TLS for all API communications
5. **Token Security** - Short-lived signing URLs (72 hours)

### 5.2 GDPR Compliance
1. **Data Minimization** - Only essential data sent to DocuSeal
2. **Right to Deletion** - Anonymization workflow for contracts
3. **Data Portability** - PDF download capability
4. **Consent Tracking** - Explicit consent before sending contracts

### 5.3 Legal Compliance
1. **E-signature Validity** - ESIGN Act & UETA compliant
2. **Audit Trail** - Complete signing history preserved
3. **Document Retention** - 7-year policy for signed contracts
4. **Dispute Evidence** - Tamper-evident PDFs with certificates

---

## 6. Monitoring & Analytics

### 6.1 Key Metrics Dashboard
```typescript
interface ContractMetrics {
  // Volume metrics
  contractsSentToday: number;
  contractsSignedToday: number;
  pendingContracts: number;
  
  // Performance metrics
  avgGenerationTime: number; // seconds
  avgTimeToSign: number; // hours
  signatureCompletionRate: number; // percentage
  
  // Status distribution
  statusBreakdown: Record<ContractStatus, number>;
  
  // Trends
  dailyVolume: Array<{date: string; sent: number; signed: number}>;
}
```

### 6.2 Alerting Rules
| Alert | Condition | Action |
|-------|-----------|--------|
| Generation Failure | > 3 failures in 5 min | Page on-call engineer |
| Webhook Downtime | No webhooks for 30 min | Check DocuSeal health |
| Low Completion Rate | < 70% daily completion | Review template/process |
| Signing Delays | > 10 contracts pending 48h+ | Send admin notification |

### 6.3 Performance SLAs
- Contract generation: p95 < 5 seconds
- Webhook processing: p95 < 2 seconds
- PDF storage: p95 < 10 seconds
- Dashboard updates: < 500ms

---

## 7. Migration Strategy

### 7.1 Pre-Launch Checklist
- [ ] DocuSeal instance health check
- [ ] Template testing with real data
- [ ] Webhook endpoint verification
- [ ] Database migrations applied
- [ ] Environment variables configured
- [ ] Admin UI components ready
- [ ] Customer notification emails tested

### 7.2 Rollout Plan
1. **Soft Launch (Day 1-3)**
   - Enable for internal test bookings only
   - Monitor all metrics closely
   - Fix any critical issues

2. **Gradual Rollout (Day 4-7)**
   - Enable for 10% of new bookings
   - Gather customer feedback
   - Refine email templates

3. **Full Launch (Day 8+)**
   - Enable for all new bookings
   - Backfill recent bookings (optional)
   - Disable manual contract process

### 7.3 Rollback Plan
- Feature flag: `ENABLE_DOCUSEAL_CONTRACTS`
- Fallback to manual process if critical issues
- Preserve all contract data for recovery

---

## 8. Cost Analysis

### 8.1 Self-Hosted DocuSeal
- **Infrastructure**: ~$50/month (dedicated VPS)
- **Storage**: ~$10/month (Supabase Storage)
- **Maintenance**: 2-4 hours/month
- **Total**: ~$60/month + labor

### 8.2 ROI Calculation
- **Time Saved**: 30 min/booking × 100 bookings/month = 50 hours
- **Labor Cost Saved**: 50 hours × $30/hour = $1,500/month
- **Net Benefit**: $1,440/month
- **Payback Period**: < 1 month

---

## 9. Risks & Mitigation

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| DocuSeal downtime | High | Low | Health monitoring, manual fallback |
| Customer adoption resistance | Medium | Low | Clear instructions, support docs |
| Template errors | Medium | Medium | Thorough testing, version control |
| Webhook delivery issues | Medium | Medium | Retry logic, manual reconciliation |
| GDPR compliance concerns | High | Low | Legal review, clear privacy policy |

---

## 10. Future Enhancements

### Phase 2 (Q2 2024)
- Multi-language contract templates
- Contract amendments for booking changes
- Mobile app integration
- Advanced analytics dashboard

### Phase 3 (Q3 2024)
- AI-powered contract optimization
- Integration with insurance providers
- Blockchain-based verification
- Customer contract portal

---

## 11. Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| {{DATE}} | Choose DocuSeal over Dropbox Sign | Self-hosting, cost, API flexibility |
| {{DATE}} | Prioritize customer booking flow | Highest volume, immediate ROI |
| {{DATE}} | Use webhook events for status | Real-time updates, reduced polling |
| {{DATE}} | Store PDFs in Supabase | Integrated RLS, cost-effective |

---

## 12. Action Items

### Immediate (This Week)
1. **Update Admin Settings UI** - Change "Dropbox Sign" to "DocuSeal"
2. **Provision DocuSeal Server** - Set up Docker host
3. **Create Rental Template** - Design in DocuSeal UI
4. **Security Review** - Validate webhook verification approach

### Next Sprint
1. **Implement Core Services** - Contract generation, webhook handler
2. **Update Booking Flow** - Auto-trigger on creation
3. **Admin UI Components** - Contract status, actions
4. **Testing Suite** - Unit and integration tests

---

## Appendix A: Configuration

### Environment Variables
```bash
# DocuSeal Configuration
DOCUSEAL_INSTANCE_URL=https://docuseal.exodrive.com
DOCUSEAL_API_TOKEN=docuseal_api_xxxxx
DOCUSEAL_WEBHOOK_SECRET=webhook_secret_xxxxx
DOCUSEAL_TEMPLATE_ID=template_rental_agreement_v1

# Feature Flags
ENABLE_DOCUSEAL_CONTRACTS=true
CONTRACT_GENERATION_DELAY_MS=5000
CONTRACT_EXPIRY_HOURS=72

# Monitoring
SENTRY_DSN=https://xxxxx@sentry.io/xxxxx
CONTRACT_METRICS_ENABLED=true
```

### DocuSeal Template Fields
```yaml
template_name: "Exodrive Rental Agreement v1"
fields:
  # Customer Information
  - name: customer_full_name
    type: text
    required: true
  - name: customer_email
    type: text
    required: true
  - name: customer_phone
    type: phone
    required: true
  - name: driver_license_number
    type: text
    required: true
    
  # Vehicle Information
  - name: car_make_model
    type: text
    readonly: true
  - name: car_vin
    type: text
    readonly: true
  - name: car_plate
    type: text
    readonly: true
    
  # Rental Terms
  - name: rental_start_date
    type: date
    readonly: true
  - name: rental_end_date
    type: date
    readonly: true
  - name: pickup_location
    type: text
    readonly: true
  - name: dropoff_location
    type: text
    readonly: true
    
  # Pricing
  - name: daily_rate
    type: text
    readonly: true
  - name: total_days
    type: number
    readonly: true
  - name: rental_total
    type: text
    readonly: true
  - name: security_deposit
    type: text
    readonly: true
    
  # Signatures
  - name: customer_signature
    type: signature
    required: true
  - name: customer_signature_date
    type: date
    required: true
    
  # Terms Acceptance
  - name: accept_terms
    type: checkbox
    required: true
  - name: accept_damage_policy
    type: checkbox
    required: true
```

---

**End of Document**

*This PRD supersedes the draft docuseal.md and incorporates all findings from the technical review. Implementation should begin with Phase 2 (Customer Booking Integration) as the highest priority.* 