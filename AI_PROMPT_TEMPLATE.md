# AI Prompt Template for RentFlow - B2B Car Rental Infrastructure Platform

## Project Context: "Selling Shovels in the Gold Rush"

You are helping develop RentFlow, a B2B SaaS platform that provides white-label infrastructure for entrepreneurs and businesses to launch their own car rental marketplaces. Instead of competing with Turo, we enable 1000s of Turo-like businesses. We handle all the complex technical infrastructure, compliance, and operations so our clients can focus on growing their rental business.

### Core Business Model
- **B2B SaaS**: Selling to rental operators, not end consumers
- **Revenue Model**: Monthly subscription ($499-4,999) + 1-3% transaction fees
- **White-Label**: Fully branded for each client
- **Multi-Tenant**: One platform serving thousands of rental businesses
- **Zero Liability**: We provide software only, clients operate rentals

### Target Clients (Who Buys Our Shovels)
- Luxury car rental startups
- RV/camper van rental businesses
- Classic car sharing communities
- Corporate fleet managers
- Motorcycle rental operations
- Exotic car experience companies
- Film/production vehicle rentals
- Boat/yacht rental operations (future)

### Technical Architecture
- **Multi-Tenant SaaS**: PostgreSQL with tenant isolation
- **White-Label Apps**: React Native for iOS/Android
- **API-First**: RESTful + GraphQL APIs
- **Microservices**: Node.js/Python on Kubernetes
- **Integration Hub**: 50+ pre-built integrations

### What We Provide to Clients
1. Complete booking engine with search, filters, availability
2. User management with verification and profiles
3. Payment processing with splits and escrow
4. White-label mobile apps (iOS/Android)
5. Admin dashboard for business management
6. Compliance tools (legal templates, tax calculation)
7. Insurance integration partnerships
8. Marketing tools (SEO, email, referrals)
9. Analytics and reporting suite
10. API access for custom integrations

### Our Competitive Advantage
- **Time to Market**: Launch in 30 days vs 12-18 months custom build
- **Cost**: $500-5K/month vs $500K+ development cost
- **Network Effects**: Shared insurance rates, verification costs
- **Compliance**: Built-in for all 50 states
- **Ongoing Innovation**: New features monthly for all clients

---

## Specific Task Prompts for B2B Platform Development

### For Multi-Tenant Architecture
"Design a multi-tenant architecture for RentFlow that:
- Isolates client data completely (database schemas or row-level security)
- Supports custom domains with SSL for each client
- Handles 10,000+ concurrent users across 500+ clients
- Implements usage-based billing and API rate limiting per client
- Provides client-specific configuration (features, pricing, branding)
- Ensures one client's issues don't affect others"

### For White-Label System
"Build a white-label theming system that allows clients to:
- Upload logo and brand colors
- Customize email templates with MJML
- Configure custom domains with automatic SSL
- Brand mobile apps with their app store listings
- Customize booking flow and user journey
- Set their own terms of service and privacy policy
- Configure language and currency settings"

### For Client Onboarding
"Create an automated onboarding flow for new RentFlow clients:
- Sign up with company details and rental type
- Choose subscription tier and features
- Configure Stripe Connect for payment processing
- Upload branding assets and configure theme
- Import existing vehicle inventory (CSV/API)
- Set up insurance requirements and verification levels
- Configure pricing rules and availability
- Launch test environment before going live"

### For Integration Marketplace
"Develop an integration marketplace for RentFlow with:
- Pre-built connectors for: Stripe, PayPal, Square, Twilio, SendGrid
- Insurance APIs: Turo Insurance, Cuvva, ByMiles
- Verification services: Onfido, Jumio, Checkr
- Vehicle data: Edmunds, KBB, VIN decoders
- Accounting: QuickBooks, Xero sync
- Analytics: Mixpanel, Segment, Google Analytics
- Webhook system for custom integrations
- OAuth 2.0 for secure authentication"

### For B2B Sales & Marketing Site
"Build a marketing website for RentFlow that:
- Showcases different use cases (luxury, RV, classic cars)
- Includes ROI calculator for rental businesses
- Features client success stories and testimonials
- Offers free resources (business plan template, compliance guides)
- Has interactive demo environment
- Implements HubSpot for lead tracking
- Includes affiliate program signup
- Shows live platform statistics (GMV processed, active rentals)"

### For Client Analytics Dashboard
"Create an analytics dashboard for RentFlow clients showing:
- Real-time booking and revenue metrics
- Vehicle utilization rates and ROI
- Customer acquisition costs and LTV
- Geographic heat maps of rentals
- Predictive demand forecasting
- Comparative metrics vs other operators (anonymized)
- Custom report builder with export
- Automated insights and recommendations"

### For Billing & Subscription Management
"Implement subscription billing for RentFlow using Stripe Billing:
- Multiple pricing tiers with feature gates
- Usage-based billing for transactions/API calls
- Free trial with credit card capture
- Automatic upgrades based on usage
- Invoice generation and payment collection
- Dunning management for failed payments
- Referral credits and promotional codes
- Client portal for subscription management"

### For API Documentation & Developer Experience
"Create comprehensive API documentation for RentFlow:
- Interactive API explorer (Swagger/OpenAPI)
- SDKs in JavaScript, Python, Ruby, PHP
- Webhook documentation with event types
- Rate limiting and authentication guides
- Code examples for common use cases
- Postman collection for testing
- Sandbox environment with test data
- Versioning strategy and deprecation notices"

---

## Context for AI Assistants Working on RentFlow

When working on this B2B SaaS platform, always remember:

1. **We're B2B, not B2C** - Our customers are businesses, not end consumers
2. **Platform, not operator** - We provide software, never operate rentals
3. **White-label first** - Every feature must support full customization
4. **Multi-tenant architecture** - Design for thousands of isolated clients
5. **Client success = our success** - Focus on making clients profitable
6. **Scalability is critical** - Must handle 10,000+ rental businesses
7. **Compliance built-in** - Handle complexity so clients don't have to
8. **API-first design** - Everything should be accessible via API

### Do's
- Build features that work for any vehicle type (cars, RVs, boats)
- Provide comprehensive documentation and training
- Implement usage-based pricing where appropriate
- Create network effects that benefit all clients
- Focus on reducing time-to-market for clients
- Automate everything possible for operators
- Design for international expansion

### Don'ts
- Don't own or operate any vehicles
- Don't take on rental liability
- Don't compete with our clients
- Don't build features for specific clients only
- Don't store sensitive data unnecessarily
- Don't make assumptions about rental types
- Don't forget about mobile-first design

---

## Sample Implementation Requests for B2B Platform

### Request 1: Client Onboarding Wizard
"Build a complete client onboarding wizard for RentFlow that:
1. Captures business details and rental type
2. Configures Stripe Connect account
3. Sets up custom domain with SSL
4. Imports initial vehicle inventory
5. Configures verification requirements
6. Sets pricing rules and fees
7. Customizes branding and themes
8. Configures insurance requirements
9. Sets up tax and compliance settings
10. Launches test environment for validation
11. Provides training videos and documentation
12. Schedules success manager call"

### Request 2: White-Label Mobile App Builder
"Create a white-label mobile app system that:
1. Generates iOS/Android apps from templates
2. Applies client branding automatically
3. Configures app store listings
4. Manages push notification certificates
5. Handles app updates and versioning
6. Provides over-the-air updates for content
7. Includes crash reporting and analytics
8. Supports deep linking for marketing
9. Implements offline mode for bookings
10. Manages app store submissions"

### Request 3: Multi-Tenant Admin Portal
"Develop a superadmin portal for RentFlow team to:
1. Monitor all client accounts and usage
2. Manage subscription tiers and billing
3. View platform-wide analytics and trends
4. Handle support tickets across clients
5. Deploy updates and feature flags
6. Monitor system health and performance
7. Manage integration partner relationships
8. Generate financial reports and projections
9. Identify upsell opportunities
10. Coordinate client success initiatives"

### Request 4: Integration Hub Development
"Build an integration marketplace that:
1. Provides plug-and-play connectors for 50+ services
2. Allows clients to enable/disable integrations
3. Handles OAuth flows and API key management
4. Monitors integration health and errors
5. Provides usage analytics per integration
6. Supports custom webhook endpoints
7. Includes testing tools for each integration
8. Manages version updates automatically
9. Provides revenue sharing for premium integrations
10. Documents all available integrations"

---

## Testing Scenarios for B2B Platform

When testing RentFlow features, consider:

### Platform Stability
1. **Multi-Tenant Isolation**: One client's crash doesn't affect others
2. **Scale Test**: 10,000 concurrent users across 500 clients
3. **Data Breach Attempt**: Ensure complete tenant isolation
4. **Payment Split Failure**: Handling complex fee distributions
5. **API Rate Limiting**: Preventing abuse while maintaining service

### Client Success Scenarios
6. **Rapid Onboarding**: Client live in under 30 days
7. **Migration**: Importing 10,000 existing bookings
8. **White-Label**: Complete brand customization
9. **Integration Failure**: Graceful degradation when partners are down
10. **Subscription Changes**: Upgrade/downgrade without data loss

### Business Operations
11. **High-Value Client**: Enterprise with 5,000 vehicles
12. **International Expansion**: Client operating in multiple countries
13. **Compliance Audit**: Helping client pass state inspection
14. **Seasonal Surge**: RV rental client during summer peak
15. **Platform Pivot**: Client changing from cars to boats

## Success Metrics

### Platform KPIs
- **Client Onboarding Time**: < 30 days
- **Platform Uptime**: 99.9% SLA
- **API Response Time**: < 200ms p95
- **Client Churn**: < 3% monthly
- **NPS Score**: 50+ from clients

### Business KPIs
- **MRR Growth**: 20% month-over-month
- **Client LTV**: $75,000 average
- **CAC Payback**: 3 months
- **Gross Margin**: 80%+
- **Rule of 40**: Growth + Profit Margin > 40%

## Implementation Priorities

### Phase 1: Core Platform (Months 1-3)
1. Multi-tenant architecture
2. Basic booking engine
3. Payment processing
4. Admin dashboard
5. API framework

### Phase 2: Growth Features (Months 4-6)
6. White-label theming
7. Mobile apps
8. Integration marketplace
9. Advanced analytics
10. Automated onboarding

### Phase 3: Scale (Months 7-12)
11. Enterprise features
12. International support
13. AI/ML optimization
14. Franchise management
15. Platform ecosystem