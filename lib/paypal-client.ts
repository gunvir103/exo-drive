import { Client, Environment } from '@paypal/paypal-server-sdk';

const PAYPAL_API_BASE = process.env.PAYPAL_MODE === 'sandbox' 
    ? 'https://api-m.sandbox.paypal.com' 
    : 'https://api-m.paypal.com';

export async function getPayPalAccessToken(): Promise<string> {
    const clientId = process.env.PAYPAL_CLIENT_ID;
    const clientSecret = process.env.PAYPAL_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
        throw new Error('PayPal client ID or secret not found in environment variables.');
    }

    const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    
    const response = await fetch(`${PAYPAL_API_BASE}/v1/oauth2/token`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': `Basic ${auth}`
        },
        body: 'grant_type=client_credentials'
    });

    if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Failed to get PayPal access token: ${response.statusText} ${errorBody}`);
    }

    const data = await response.json();
    return data.access_token;
}

function getPayPalEnvironment(): Environment {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
  const isSandbox = process.env.PAYPAL_MODE === 'sandbox';

  if (!clientId || !clientSecret) {
    throw new Error('PayPal client ID or secret not found in environment variables.');
  }

  if (isSandbox) {
    return Environment.Sandbox;
  }
  return Environment.Production;
}

let payPalClientInstance: Client | null = null;

export function getPayPalClient(): Client {
    if (!payPalClientInstance) {
        const environment = getPayPalEnvironment();
        payPalClientInstance = new Client({
            clientCredentialsAuthCredentials: {
                oAuthClientId: process.env.PAYPAL_CLIENT_ID!,
                oAuthClientSecret: process.env.PAYPAL_CLIENT_SECRET!,
            },
            environment: environment,
        });
    }
    return payPalClientInstance;
} 