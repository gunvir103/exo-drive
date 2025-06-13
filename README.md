# ExoDrive - Exotic Car Rental Platform

This document provides an overview of the ExoDrive project, a luxury and exotic car rental service with comprehensive booking management, automated contracts, and payment processing.

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Installation & Setup](#installation--setup)
- [Project Structure](#project-structure)
- [Backend Integration (Supabase)](#backend-integration-supabase)
- [Admin Dashboard](#admin-dashboard)
- [Homepage Settings](#homepage-settings)
- [Database Verification](#database-verification)
- [Crawler Configuration](#crawler-configuration)
- [Deployment](#deployment)

## Overview

exoDrive is a Next.js application designed to provide a modern, responsive interface for customers to browse and inquire about renting exotic cars. It includes a public-facing website and an administrative dashboard for managing the car fleet and related settings.

## Features

- **Public Website**:
  - Engaging homepage with featured cars and company information
  - Comprehensive fleet page with filtering and search capabilities
  - Detailed car pages showcasing specifications, images, and booking options
  - Complete booking flow with payment processing and contract automation
  - Secure customer booking pages with real-time status updates
  - Contact page for customer inquiries

- **Admin Dashboard**:
  - Secure login system for administrators
  - Complete booking management system with status tracking
  - Full car management capabilities (add, edit, delete, hide/unhide)
  - Real-time booking timeline with event tracking
  - PayPal payment processing and invoice management
  - Automated contract generation and signing workflow
  - Email notification system with delivery tracking
  - Configuration for homepage settings and other site parameters

- **Booking System**:
  - Automated availability checking with Redis-based conflict prevention
  - PayPal payment authorization and capture
  - Automated contract generation via DocuSeal
  - Real-time webhook processing for payment and contract events
  - Comprehensive dispute management with evidence collection

## Tech Stack

- **Framework**: Next.js 15 (App Router)
- **Package Manager**: Bun
- **Styling**: Tailwind CSS with custom gradient utilities
- **UI Components**: shadcn/ui
- **Animations**: Framer Motion
- **Authentication**: Supabase Auth (with email/password for admins)
- **Database**: Supabase (PostgreSQL)
- **Storage**: Supabase Storage (for car images, hero backgrounds)
- **Payment Processing**: PayPal SDK for payments and invoicing
- **Contract Management**: DocuSeal for automated rental agreements
- **Caching**: Redis (Upstash) for distributed locking and performance
- **Email Service**: Resend for transactional emails
- **Icons**: Lucide React

## Getting Started

### Prerequisites

- Node.js (version 18.x or later recommended, for Next.js compatibility)
- Bun (latest version recommended)

### Installation & Setup

1.  **Clone the repository**:
    ```bash
    git clone https://github.com/gunvir103/exodrive.git
    cd exodrive
    ```
2.  **Install dependencies** using Bun:
    ```bash
    bun install
    ```
3.  **Set up environment variables**:
    -   Copy the example environment file: `cp .env.example .env.local`
    -   Populate `.env.local` with your Supabase project URL, anon key, service role key, and any other required API keys (e.g., Resend for emails).
4.  **Run database migrations** (if setting up a new Supabase project or to ensure schema is up-to-date):
    ```bash
    bun run db:migrate
    ```
5.  **Run the development server**:
    ```bash
    bun dev
    ```
    The application should now be running on `http://localhost:3005` (or your configured port).

## Project Structure

(Brief explanation of key directories)

```
/app              # Next.js App Router: pages, layouts, API routes
  /(main)        # Routes for the public-facing website
  /admin          # Routes for the admin dashboard
  /api            # API backend routes
/components       # Shared React components (UI, specific features)
/lib              # Core logic, services, utilities, Supabase helpers
/public           # Static assets (images, fonts, etc.)
/scripts          # Utility scripts (e.g., database migrations, verification)
/supabase         # Supabase local development configuration and migrations
  /migrations     # SQL migration files
# ... other configuration files (next.config.mjs, tailwind.config.ts, etc.)
```

## Backend Integration (Supabase)

This project heavily relies on Supabase for its backend services:

- **Database**: PostgreSQL for storing car details, pricing, features, specifications, images, user data, and application settings.
- **Authentication**: Supabase Auth for managing admin user authentication.
- **Storage**: Supabase Storage for hosting car images (in the `vehicle-images` bucket) and other assets like hero backgrounds.
- **Row Level Security (RLS)**: Implemented to secure data access. Public users have read-only access to non-hidden car data, while authenticated admins have broader CRUD permissions (requires correct RLS policy setup in Supabase).
- **Database Functions (RPC)**: Used for atomic operations (e.g., `create_car_atomic`, `update_car_atomic`) to ensure data consistency across multiple tables.

For detailed schema information and RLS policy setup, refer to the SQL files in `supabase/migrations/` and your Supabase project dashboard.

## Admin Dashboard

The admin dashboard (`/admin`) allows authorized users to manage the car fleet and site settings.

- **Access Control**: Login is required. Access to administrative functions should be protected by role-based checks (ensure these are active in API routes and Supabase RLS policies).
- **Car Management**: Add, edit, and delete car listings, including details like pricing, descriptions, visibility, image uploads (with drag-and-drop reordering and primary image selection), features, and specifications.

## Homepage Settings

Dynamic configuration of the homepage's featured car section via the admin panel (`/admin/homepage-settings`).

1.  **Ensure Database Migrations are Run**: The necessary tables (`homepage_settings`, `hero_content`) are created by migrations.
    ```bash
    bun run db:migrate
    ```
2.  **Configure in Admin**: Navigate to "Homepage Settings" in the admin dashboard sidebar, select a car, and save.

## Database Verification

Includes tools to verify database configuration and integrity.

### Local Verification

Run the script locally:
```bash
bun run verify:db
```
This script connects to your Supabase database, verifies car data, tests RLS policies, and generates `db-verification-report.json`.

### GitHub Action Verification

A GitHub Action (`.github/workflows/verify-database.yml`) runs these checks automatically on pushes, pull requests, weekly, and manually. This ensures data integrity and RLS policy enforcement.

## Crawler Configuration

This project includes files to guide web crawlers:

- **`robots.txt`**: Provides rules for search engine crawlers (e.g., Googlebot). It allows general site indexing while disallowing access to `/admin/` and `/api/` paths. Remember to update the `Sitemap` directive in this file with your actual sitemap URL.
- **`llms.txt`**: Provides directives for AI crawlers, typically used to disallow content scraping for training LLMs.

## Deployment

(Placeholder: Add specific deployment instructions for your chosen platform, e.g., Vercel, Netlify, Docker.)

Considerations for deployment:
- Environment variable setup for production (Supabase keys, API keys).
- Automated CI/CD pipeline for builds, tests, and deployments.
- Database migration strategy for production environments.

