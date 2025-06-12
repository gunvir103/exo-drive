"use client"

import type { ReactNode } from "react"
import { ThemeProvider } from "@/components/theme-provider"
import { PayPalScriptProvider } from "@paypal/react-paypal-js"

const initialOptions = {
    "clientId": process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID || "sb", // Fallback to "sb" for sandbox testing if not set
    "currency": "USD",
    "intent": "capture",
};


export function Providers({ children }: { children: ReactNode }) {
  if (!process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID) {
    console.warn("NEXT_PUBLIC_PAYPAL_CLIENT_ID is not set. PayPal functionality will be limited or use a sandbox test account.");
  }
  return (
    <PayPalScriptProvider options={initialOptions}>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
        {children}
        </ThemeProvider>
    </PayPalScriptProvider>
  )
}

