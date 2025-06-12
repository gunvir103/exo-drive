"use client"

import type React from "react"

import { useState, useEffect, useRef } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { format, differenceInDays, addDays, isBefore, isAfter, startOfToday } from "date-fns"
import { CalendarIcon, CheckCircle, Shield, Clock, CreditCard, Info } from "lucide-react"
import { cn } from "@/lib/utils"
import { useToast } from "@/hooks/use-toast"
import { motion, AnimatePresence } from "framer-motion"
import { Separator } from "@/components/ui/separator"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { usePayPalScriptReducer, PayPalButtons } from "@paypal/react-paypal-js";

type DateAvailability = {
  date: string;
  available: boolean;
}

type CarPricing = {
  base_price: number;
  deposit_amount?: number;
}
import { useMediaQuery } from "@/hooks/use-media-query"

interface BookingFormProps {
  carId: string
  pricing: CarPricing | null | undefined
  availability?: DateAvailability[]
}

export function CarBookingForm({ carId, pricing, availability = [] }: BookingFormProps) {
  const [startDate, setStartDate] = useState<Date>()
  const [endDate, setEndDate] = useState<Date>()
  const [isLoading, setIsLoading] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)
  const [step, setStep] = useState(1)
  const [showPayPalButtons, setShowPayPalButtons] = useState(false);
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    termsAccepted: false,
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const formRef = useRef<HTMLFormElement>(null)
  const bookingStartTimeRef = useRef<number>(Date.now())
  const { toast } = useToast()
  const isMobile = useMediaQuery("(max-width: 640px)")
  const [{ isPending }] = usePayPalScriptReducer();

  // Calculate rental days and total price safely
  const days = startDate && endDate ? Math.max(1, differenceInDays(endDate, startDate) + 1) : 0
  const basePrice = pricing?.base_price ?? 0;
  const deposit = pricing?.deposit_amount ?? Math.round(days * basePrice * 0.3); // Default deposit if not set
  const totalPrice = days * basePrice;

  // Get today (start of day) and max date
  const today = startOfToday(); 
  const maxDate = addDays(today, 90);

  // Function to check if a date is available (commented out or removed)
  // const isDateAvailable = (date: Date) => { ... }

  // Function to get date class names based on availability (can be kept if needed for styling booked dates)
  // const getDateClassName = (date: Date) => { ... }

  // Handle form input changes
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target
    setFormData((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }))

    // Clear error for this field if it exists
    if (errors[name]) {
      setErrors((prev) => {
        const newErrors = { ...prev }
        delete newErrors[name]
        return newErrors
      })
    }
  }

  // Validate form
  const validateForm = () => {
    const newErrors: Record<string, string> = {}

    if (!formData.firstName.trim()) {
      newErrors.firstName = "First name is required"
    }

    if (!formData.lastName.trim()) {
      newErrors.lastName = "Last name is required"
    }

    if (!formData.email.trim()) {
      newErrors.email = "Email is required"
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      newErrors.email = "Email is invalid"
    }

    if (!formData.phone.trim()) {
      newErrors.phone = "Phone number is required"
    }

    if (!formData.termsAccepted) {
      newErrors.termsAccepted = "You must accept the terms"
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleBooking = async (e: React.FormEvent) => {
    e.preventDefault()

    if (step === 2 && !validateForm()) {
      toast({
        title: "Form Error",
        description: "Please fill in all required fields correctly",
        variant: "destructive",
      })
      return
    }

    if (!startDate || !endDate) {
      toast({
        title: "Error",
        description: "Please select both pickup and return dates",
        variant: "destructive",
      })
      return
    }
    
    // If validation passes, show the PayPal buttons
    setShowPayPalButtons(true);
  }
  
  const createPayPalOrder = async (): Promise<string> => {
    const response = await fetch('/api/bookings/create-paypal-order', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ amount: totalPrice }),
    });
    const order = await response.json();
    if (!response.ok) {
        toast({
            title: "Error creating PayPal order",
            description: order.error || "There was an issue initiating the payment.",
            variant: "destructive",
        });
        throw new Error("Failed to create PayPal order");
    }
    return order.orderID;
  };

  const onPayPalApprove = async (data: any): Promise<void> => {
    setIsLoading(true);
    try {
        const bookingDetails = {
            carId,
            startDate: format(startDate!, "yyyy-MM-dd"),
            endDate: format(endDate!, "yyyy-MM-dd"),
            totalPrice,
            customer: {
                firstName: formData.firstName,
                lastName: formData.lastName,
                email: formData.email,
                phone: formData.phone,
            },
        };

        const response = await fetch('/api/bookings/capture-paypal-order', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ orderID: data.orderID, bookingDetails }),
        });

        const result = await response.json();

        if (response.ok && result.success) {
            toast({
                title: "Booking Confirmed!",
                description: "Your payment was successful and your booking is confirmed.",
            });
            setIsSuccess(true);
        } else {
            toast({
                title: "Booking Failed",
                description: result.details || "There was an error finalizing your booking after payment.",
                variant: "destructive",
            });
        }
    } catch (error) {
        console.error("Booking error:", error);
        toast({
            title: "Booking failed",
            description: "An unexpected error occurred. Please contact support.",
            variant: "destructive",
        });
    } finally {
        setIsLoading(false);
    }
  };

  useEffect(() => {
    import("@/lib/analytics/track-events").then(({ trackBookingStep }) => {
      trackBookingStep(
        carId,
        step,
        step === 1 ? "Date Selection" : "Personal Information"
      );
    });
  }, [step, carId]);

  // Track booking abandonment when component unmounts
  useEffect(() => {
    bookingStartTimeRef.current = Date.now();
    
    return () => {
      if ((startDate || endDate) && !isSuccess) {
        const timeSpent = Math.floor((Date.now() - bookingStartTimeRef.current) / 1000);
        
        import("@/lib/analytics/track-events").then(({ trackBookingAbandoned }) => {
          trackBookingAbandoned(
            carId,
            step,
            timeSpent
          );
        });
      }
      
      // Reset form state
      setStartDate(undefined)
      setEndDate(undefined)
      setStep(1)
      setIsSuccess(false)
    }
  }, [])

  if (isSuccess) {
    return (
      <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="text-center py-6">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", stiffness: 200, damping: 15 }}
          className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-green-100 mb-4"
        >
          <CheckCircle className="h-8 w-8 text-green-600" />
        </motion.div>
        <h3 className="text-xl font-bold mb-2">Booking Initiated!</h3>
        <p className="text-muted-foreground mb-6 text-sm">
          Your booking request has been received. You'll be redirected to complete your reservation.
        </p>
        <Button className="w-full bg-white text-black hover:bg-gray-100 rounded-full" disabled>
          Processing...
        </Button>
      </motion.div>
    )
  }

  return (
    <div className="space-y-4">
      <AnimatePresence mode="wait">
        {step === 1 && (
          <motion.div
            key="step1"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-4"
          >
            <div className="bg-muted/50 p-3 rounded-lg mb-4">
              <h3 className="font-medium flex items-center text-sm mb-1">
                <Info className="h-4 w-4 mr-1.5 text-primary" />
                Booking Information
              </h3>
              <p className="text-xs text-muted-foreground">
                Select your rental dates below. A {Math.round((deposit / totalPrice || 0.3) * 100)}% deposit is
                required to secure your booking.
              </p>
            </div>

            <div>
              <Label htmlFor="pickup-date" className="text-sm font-medium mb-1.5 flex items-center">
                <Clock className="h-4 w-4 mr-1.5 text-primary" />
                Pickup Date
              </Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    id="pickup-date"
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal text-sm",
                      !startDate && "text-muted-foreground",
                      startDate && "border-primary",
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {startDate ? format(startDate, "EEEE, MMMM d, yyyy") : "Select pickup date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start" side={isMobile ? "bottom" : "left"}>
                  <Calendar
                    mode="single"
                    selected={startDate}
                    onSelect={(date) => {
                      if (!date) return
                      // Ensure selected date is not in the past
                      if (isBefore(date, today)) return; 
                      setStartDate(date)
                      
                      // Handle end date logic
                      let newEndDate = endDate;
                      if (endDate && isBefore(endDate, date)) {
                        setEndDate(undefined)
                        newEndDate = undefined;
                      } else if (!endDate) {
                        const suggestedEndDate = addDays(date, 3);
                        setEndDate(suggestedEndDate)
                        newEndDate = suggestedEndDate;
                      }
                      
                      if (date && newEndDate) {
                        const rentalDays = Math.max(1, differenceInDays(newEndDate, date) + 1);
                        const price = rentalDays * (pricing?.base_price ?? 0);
                        
                        import("@/lib/analytics/track-events").then(({ trackDateSelection }) => {
                          trackDateSelection(
                            carId,
                            format(date, "yyyy-MM-dd"),
                            format(newEndDate, "yyyy-MM-dd"),
                            rentalDays,
                            price
                          );
                        });
                      }
                    }}
                    initialFocus
                    // Disable only past dates and dates beyond 90 days
                    disabled={(date) => isBefore(date, today) || isAfter(date, maxDate)} 
                    // Modifiers for booked styling can still be used if availability data exists
                    // modifiers={{ booked: (date) => !isDateAvailable(date) }} 
                    // modifiersClassNames={{ booked: "text-red-500 line-through" }}
                    className="rounded-md border"
                    // components={{
                    //   Day: (props) => {
                    //     const dateClassName = getDateClassName(props.date)
                    //     return <button {...props} className={cn(props.className, dateClassName)} />
                    //   },
                    // }}
                    showOutsideDays={true}
                    fixedWeeks={true}
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div>
              <Label htmlFor="return-date" className="text-sm font-medium mb-1.5 flex items-center">
                <Clock className="h-4 w-4 mr-1.5 text-primary" />
                Return Date
              </Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    id="return-date"
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal text-sm",
                      !endDate && "text-muted-foreground",
                      endDate && "border-primary",
                    )}
                    disabled={!startDate}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {endDate ? format(endDate, "EEEE, MMMM d, yyyy") : "Select return date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start" side={isMobile ? "bottom" : "left"}>
                  <Calendar
                    mode="single"
                    selected={endDate}
                    onSelect={(date) => {
                      setEndDate(date);
                      
                      if (startDate && date) {
                        const rentalDays = Math.max(1, differenceInDays(date, startDate) + 1);
                        const price = rentalDays * (pricing?.base_price ?? 0);
                        
                        import("@/lib/analytics/track-events").then(({ trackDateSelection }) => {
                          trackDateSelection(
                            carId,
                            format(startDate, "yyyy-MM-dd"),
                            format(date, "yyyy-MM-dd"),
                            rentalDays,
                            price
                          );
                        });
                      }
                    }}
                    initialFocus
                    // Disable dates before start date, or past dates, or beyond 90 days
                    disabled={(date) =>
                      !startDate || isBefore(date, startDate) || isBefore(date, today) || isAfter(date, maxDate) 
                    }
                    // Modifiers for booked styling can still be used if availability data exists
                    // modifiers={{ booked: (date) => !isDateAvailable(date) }} 
                    // modifiersClassNames={{ booked: "text-red-500 line-through" }}
                    className="rounded-md border"
                     // components={{
                    //   Day: (props) => {
                    //     const dateClassName = getDateClassName(props.date)
                    //     return <button {...props} className={cn(props.className, dateClassName)} />
                    //   },
                    // }}
                    showOutsideDays={true}
                    fixedWeeks={true}
                  />
                </PopoverContent>
              </Popover>
            </div>

            {days > 0 && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
                <div className="bg-muted rounded-lg p-3 space-y-2">
                  <div className="flex justify-between text-xs">
                    <span>Daily Rate:</span>
                    {/* Use basePrice safely */}
                    <span>${basePrice.toLocaleString()}/day</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span>Duration:</span>
                    <span> {days} day{days !== 1 ? "s" : ""} </span>
                  </div>
                  {/* Removed additional fees section as it depends on data not fetched */}
                  <Separator className="my-1" />
                  <div className="flex justify-between font-bold text-sm">
                    <span>Total Estimate:</span>
                    {/* Use totalPrice safely */}
                    <span> ${totalPrice.toLocaleString()} </span>
                  </div>
                   <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Security Deposit:</span>
                    {/* Use deposit safely */}
                    <span> ${deposit.toLocaleString()} </span>
                  </div>
                </div>
              </motion.div>
            )}

            <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} className="pt-2">
              <Button
                className="w-full bg-white text-black hover:bg-gray-100 rounded-full text-sm"
                size="lg"
                onClick={() => days > 0 && setStep(2)}
                disabled={!startDate || !endDate}
              >
                Continue to Details
              </Button>
            </motion.div>
          </motion.div>
        )}

        {step === 2 && (
          <motion.div
            key="step2"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className="space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-lg">Personal Information</h3>
              <Button variant="ghost" size="sm" onClick={() => setStep(1)} className="text-xs">
                Back to Dates
              </Button>
            </div>

            <form ref={formRef} onSubmit={handleBooking} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="firstName" className="text-xs">
                    First Name
                  </Label>
                  <Input
                    id="firstName"
                    name="firstName"
                    placeholder="John"
                    className={cn("text-sm h-9", errors.firstName && "border-red-500")}
                    value={formData.firstName}
                    onChange={handleInputChange}
                    autoComplete="given-name"
                  />
                  {errors.firstName && <p className="text-xs text-red-500">{errors.firstName}</p>}
                </div>
                <div className="space-y-1">
                  <Label htmlFor="lastName" className="text-xs">
                    Last Name
                  </Label>
                  <Input
                    id="lastName"
                    name="lastName"
                    placeholder="Doe"
                    className={cn("text-sm h-9", errors.lastName && "border-red-500")}
                    value={formData.lastName}
                    onChange={handleInputChange}
                    autoComplete="family-name"
                  />
                  {errors.lastName && <p className="text-xs text-red-500">{errors.lastName}</p>}
                </div>
              </div>

              <div className="space-y-1">
                <Label htmlFor="email" className="text-xs">
                  Email Address
                </Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="john.doe@example.com"
                  className={cn("text-sm h-9", errors.email && "border-red-500")}
                  value={formData.email}
                  onChange={handleInputChange}
                  autoComplete="email"
                />
                {errors.email && <p className="text-xs text-red-500">{errors.email}</p>}
              </div>

              <div className="space-y-1">
                <Label htmlFor="phone" className="text-xs">
                  Phone Number
                </Label>
                <Input
                  id="phone"
                  name="phone"
                  type="tel"
                  placeholder="(123) 456-7890"
                  className={cn("text-sm h-9", errors.phone && "border-red-500")}
                  value={formData.phone}
                  onChange={handleInputChange}
                  autoComplete="tel"
                  inputMode="tel"
                />
                {errors.phone && <p className="text-xs text-red-500">{errors.phone}</p>}
              </div>

              <div className="flex items-start space-x-2 pt-1">
                <Checkbox
                  id="termsAccepted"
                  name="termsAccepted"
                  checked={formData.termsAccepted}
                  onCheckedChange={(checked) => {
                    setFormData((prev) => ({
                      ...prev,
                      termsAccepted: checked === true,
                    }))
                    if (errors.termsAccepted) {
                      setErrors((prev) => {
                        const newErrors = { ...prev }
                        delete newErrors.termsAccepted
                        return newErrors
                      })
                    }
                  }}
                  className={errors.termsAccepted ? "border-red-500" : ""}
                />
                <div className="space-y-1">
                  <Label htmlFor="termsAccepted" className={cn("text-xs", errors.termsAccepted && "text-red-500")}>
                    I agree to the{" "}
                    <Link href="/policies" className="text-primary underline" target="_blank" rel="noopener noreferrer">
                      Terms &amp; Conditions
                    </Link>{" "}
                    and{" "}
                    <Link href="/policies" className="text-primary underline" target="_blank" rel="noopener noreferrer">
                      Privacy Policy
                    </Link>
                  </Label>
                  {errors.termsAccepted && <p className="text-xs text-red-500">{errors.termsAccepted}</p>}
                </div>
              </div>

              <Separator className="my-1" />

              <div className="bg-muted rounded-lg p-3 space-y-2">
                <h4 className="font-medium text-sm">Booking Summary</h4>

                <div className="flex justify-between items-center text-xs">
                  <div className="flex items-center">
                    <Clock className="h-3 w-3 mr-1.5 text-primary" />
                    <span>Pickup Date:</span>
                  </div>
                  <span className="font-medium">{startDate ? format(startDate, "MMM d, yyyy") : ""}</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <div className="flex items-center">
                    <Clock className="h-3 w-3 mr-1.5 text-primary" />
                    <span>Return Date:</span>
                  </div>
                  <span className="font-medium">{endDate ? format(endDate, "MMM d, yyyy") : ""}</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <div className="flex items-center">
                    <Shield className="h-3 w-3 mr-1.5 text-primary" />
                    <span>Duration:</span>
                  </div>
                  <span className="font-medium">
                    {days} day{days !== 1 ? "s" : ""}
                  </span>
                </div>
                <Separator />
                <div className="flex justify-between text-xs">
                  <span>Daily Rate:</span>
                  <span>${basePrice.toLocaleString()}/day</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span>Subtotal:</span>
                  <span>${totalPrice.toLocaleString()}</span>
                </div>
                {/* Removed additional fees section as it depends on data not fetched */}
                <div className="flex justify-between text-xs">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger className="flex items-center">
                        <span>Security Deposit (refundable):</span>
                        <Info className="h-3 w-3 ml-1 text-muted-foreground" />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="max-w-xs text-xs">
                          A refundable security deposit is required at pickup. This amount will be returned upon vehicle
                          return, subject to our terms and conditions.
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <span>${deposit.toLocaleString()}</span>
                </div>
                <div className="flex justify-between font-bold pt-1 border-t text-sm">
                  <span>Due Today:</span>
                  <span>${deposit.toLocaleString()}</span>
                </div>
              </div>

              <div className="flex gap-2 pt-1">
                <Button type="button" variant="outline" className="flex-1 text-xs h-9" onClick={() => setStep(1)}>
                  Back
                </Button>
                <motion.div className="flex-1" whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                  <Button
                    type="submit"
                    className="w-full bg-white text-black hover:bg-gray-100 rounded-full text-xs h-9"
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <span className="flex items-center">
                        <svg
                          className="animate-spin -ml-1 mr-2 h-3 w-3 text-black"
                          xmlns="http://www.w3.org/2000/svg"
                          fill="none"
                          viewBox="0 0 24 24"
                        >
                          <circle
                            className="opacity-25"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            strokeWidth="4"
                          ></circle>
                          <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                          ></path>
                        </svg>
                        Processing...
                      </span>
                    ) : (
                      <span className="flex items-center">
                        <CreditCard className="mr-2 h-3 w-3" />
                        Proceed to Payment
                      </span>
                    )}
                  </Button>
                </motion.div>
              </div>
            </form>

            {showPayPalButtons && (
              <>
                <Separator className="my-2" />
                {isPending && <div className="text-center text-sm text-muted-foreground">Loading payment options...</div>}
                <PayPalButtons
                    style={{ layout: "vertical", color: "blue", shape: "rect", label: "pay" }}
                    createOrder={createPayPalOrder}
                    onApprove={onPayPalApprove}
                    forceReRender={[totalPrice]} // Re-render buttons if the price changes
                />
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {step === 1 && (
        <div className="flex items-center justify-center space-x-2 pt-1">
          <Shield className="h-3 w-3 text-muted-foreground" />
          <p className="text-xs text-muted-foreground text-center">Secure booking with 100% refundable deposit</p>
        </div>
      )}
    </div>
  )
}

