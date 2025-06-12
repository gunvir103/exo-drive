import { NextResponse } from 'next/server';
import { getPayPalAccessToken } from '@/lib/paypal-client';

const PAYPAL_API_BASE = process.env.PAYPAL_MODE === 'sandbox' 
    ? 'https://api-m.sandbox.paypal.com' 
    : 'https://api-m.paypal.com';

export async function POST(request: Request) {
  try {
    const { amount } = await request.json();

    if (!amount || isNaN(Number(amount))) {
        return NextResponse.json({ error: 'Invalid amount provided' }, { status: 400 });
    }
    
    const accessToken = await getPayPalAccessToken();

    const response = await fetch(`${PAYPAL_API_BASE}/v2/checkout/orders`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
            'PayPal-Request-Id': `booking-${Date.now()}`, // Ensure unique request ID
        },
        body: JSON.stringify({
            intent: 'CAPTURE',
            purchase_units: [
                {
                    amount: {
                        currency_code: 'USD',
                        value: String(amount),
                    },
                },
            ],
        }),
    });

    const order = await response.json();

    if (!response.ok) {
        console.error('PayPal order creation failed:', order);
        return NextResponse.json({ error: 'Failed to create order', details: order }, { status: response.status });
    }

    return NextResponse.json({ orderID: order.id });
  } catch (error) {
    console.error('Failed to create PayPal order:', error);
    return NextResponse.json({ error: 'Failed to create order' }, { status: 500 });
  }
} 