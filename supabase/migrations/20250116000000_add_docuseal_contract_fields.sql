-- Add DocuSeal contract fields to bookings table
-- This migration adds the necessary fields for tracking DocuSeal contract integration

-- Add contract-related columns to bookings table
ALTER TABLE public.bookings 
ADD COLUMN IF NOT EXISTS contract_document_id TEXT,
ADD COLUMN IF NOT EXISTS contract_submission_id TEXT,
ADD COLUMN IF NOT EXISTS contract_signing_url TEXT,
ADD COLUMN IF NOT EXISTS contract_signed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS contract_template_version INTEGER DEFAULT 1;

-- Add comments for documentation
COMMENT ON COLUMN public.bookings.contract_document_id IS 'DocuSeal document ID for the signed contract';
COMMENT ON COLUMN public.bookings.contract_submission_id IS 'DocuSeal submission ID for tracking the signing process';
COMMENT ON COLUMN public.bookings.contract_signing_url IS 'Secure URL for customer to sign the contract';
COMMENT ON COLUMN public.bookings.contract_signed_at IS 'Timestamp when the contract was fully signed';
COMMENT ON COLUMN public.bookings.contract_template_version IS 'Version of the contract template used';

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_bookings_contract_submission_id 
ON public.bookings(contract_submission_id) 
WHERE contract_submission_id IS NOT NULL;

-- Create index for contract status queries
CREATE INDEX IF NOT EXISTS idx_bookings_contract_signed_at 
ON public.bookings(contract_signed_at) 
WHERE contract_signed_at IS NOT NULL; 