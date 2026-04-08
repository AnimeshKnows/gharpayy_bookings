import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/contexts/auth";
import {
  useCreateBooking,
  useApproveBooking,
  getListBookingsQueryKey,
  getGetBookingStatsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { ArrowLeft, Loader2, QrCode, MessageCircle, Zap } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const formSchema = z.object({
  tenantName: z.string().min(2, "Name is required"),
  tenantPhone: z.string().min(10, "Valid phone number required"),
  propertyName: z.string().min(2, "Property name is required"),
  roomNumber: z.string().optional(),
  actualRent: z.coerce.number().min(1, "Actual rent must be greater than 0"),
  discountedRent: z.coerce.number().min(1, "Discounted rent must be greater than 0"),
  deposit: z.coerce.number().min(0),
  maintenanceFee: z.coerce.number().min(0),
  tokenAmount: z.coerce.number().min(1, "Token amount must be greater than 0"),
  stayDurationMonths: z.coerce.number().min(1),
  noticePeriodMonths: z.coerce.number().min(0),
  upiId: z.string().optional(),
  adminPhone: z.string().optional(),
}).refine(data => data.discountedRent <= data.actualRent, {
  message: "Discounted rent cannot be higher than actual rent",
  path: ["discountedRent"],
});

type FormValues = z.infer<typeof formSchema>;

export default function NewBooking() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const createBooking = useCreateBooking();
  const approveBooking = useApproveBooking();
  const [activateNow, setActivateNow] = useState(false);
  const { teammate } = useAuth();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      tenantName: "",
      tenantPhone: "",
      propertyName: "",
      roomNumber: "",
      actualRent: 0,
      discountedRent: 0,
      deposit: 0,
      maintenanceFee: 0,
      tokenAmount: 0,
      stayDurationMonths: 11,
      noticePeriodMonths: 1,
      upiId: teammate?.zoneUpiId ?? "",
      adminPhone: teammate?.zoneAdminPhone ?? "",
    },
  });

  const onSubmit = (values: FormValues) => {
    const payload = {
      ...values,
      roomNumber: values.roomNumber || undefined,
      upiId: values.upiId || undefined,
      adminPhone: values.adminPhone || undefined,
      source: (activateNow ? "walkin" : "admin") as "admin" | "walkin",
    };

    createBooking.mutate({ data: payload }, {
      onSuccess: (data) => {
        queryClient.invalidateQueries({ queryKey: getListBookingsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetBookingStatsQueryKey() });

        if (activateNow) {
          // Walk-in flow: immediately activate, then navigate
          approveBooking.mutate({ id: data.id }, {
            onSuccess: () => {
              queryClient.invalidateQueries({ queryKey: getListBookingsQueryKey() });
              toast({
                title: "Booking created & offer activated!",
                description: "The 15-minute timer is running. Share the link with the tenant now.",
              });
              setLocation(`/bookings/${data.id}/admin`);
            },
            onError: () => {
              toast({
                title: "Booking created — activation failed",
                description: "Quotation was saved. Go to the detail page and activate manually.",
                variant: "destructive",
              });
              setLocation(`/bookings/${data.id}/admin`);
            },
          });
        } else {
          toast({
            title: "Quotation created",
            description: "Go to the booking page to activate the offer and share the link.",
          });
          setLocation(`/bookings/${data.id}/admin`);
        }
      },
      onError: () => {
        toast({
          title: "Error",
          description: "Failed to create booking. Please try again.",
          variant: "destructive",
        });
      },
    });
  };

  const isLoading = createBooking.isPending || approveBooking.isPending;

  return (
    <div className="min-h-[100dvh] bg-background pb-12">
      <header className="bg-card border-b sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 h-16 flex items-center gap-4">
          <Link href="/">
            <Button variant="ghost" size="icon" className="shrink-0 -ml-2">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <h1 className="text-xl font-semibold text-foreground">New Booking Quotation</h1>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">

            {/* Walk-in Mode Toggle */}
            <Card className={`shadow-sm border-2 transition-colors ${activateNow ? "border-amber-400 bg-amber-50/60" : "border-border"}`}>
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <div className={`mt-0.5 w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${activateNow ? "bg-amber-500 text-white" : "bg-muted text-muted-foreground"}`}>
                      <Zap className="w-4 h-4" />
                    </div>
                    <div>
                      <p className={`font-semibold text-sm ${activateNow ? "text-amber-900" : "text-foreground"}`}>
                        Walk-in / Instant Booking
                      </p>
                      <p className={`text-xs mt-0.5 ${activateNow ? "text-amber-800/80" : "text-muted-foreground"}`}>
                        {activateNow
                          ? "Offer will activate immediately after saving. The 15-minute timer starts the moment you click Create — share the payment link with the tenant on the spot."
                          : "Tenant is here in person or on the phone? Toggle this to skip the approval step — the offer goes live the instant you hit Create."
                        }
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={activateNow}
                    onCheckedChange={setActivateNow}
                    className="shrink-0 mt-0.5"
                  />
                </div>
              </CardContent>
            </Card>

            {/* Tenant Details */}
            <Card className="shadow-sm">
              <CardHeader>
                <CardTitle>Tenant Details</CardTitle>
                <CardDescription>Who are you sending this quotation to?</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-6 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="tenantName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Full Name</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. Rahul Sharma" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="tenantPhone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tenant Phone / WhatsApp</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. 9876543210" {...field} />
                      </FormControl>
                      <FormDescription>Include country code for WhatsApp (e.g. 919876543210).</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>

            {/* Property Details */}
            <Card className="shadow-sm">
              <CardHeader>
                <CardTitle>Property Details</CardTitle>
                <CardDescription>Which property and room are they pre-booking?</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-6 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="propertyName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Property Name</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. Ghar Residency Koramangala" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="roomNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Room Number (Optional)</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. 101-B" {...field} value={field.value || ""} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>

            {/* Payment Setup */}
            <Card className="shadow-sm border-primary/20">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <QrCode className="w-5 h-5 text-primary" />
                  Payment Setup
                </CardTitle>
                <CardDescription>Configure how the tenant will pay the token amount.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-6 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="upiId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Your UPI ID (Recommended)</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. yourname@upi or 9876543210@ybl" {...field} value={field.value || ""} />
                      </FormControl>
                      <FormDescription>Enables a scannable QR + PhonePe / GPay / Paytm deep links.</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="adminPhone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-1.5">
                        <MessageCircle className="w-3.5 h-3.5 text-[#25D366]" />
                        Your WhatsApp Number
                      </FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. 919876543210" {...field} value={field.value || ""} />
                      </FormControl>
                      <FormDescription>Tenants tap "I've Paid" to message you directly.</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>

            {/* Financials & Terms */}
            <Card className="shadow-sm">
              <CardHeader>
                <CardTitle>Financials & Terms</CardTitle>
                <CardDescription>Set the pricing to create urgency and lock them in.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-6 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="actualRent"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Standard Rent (₹ / month)</FormLabel>
                      <FormControl><Input type="number" {...field} /></FormControl>
                      <FormDescription>Shown as strikethrough to highlight savings.</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="discountedRent"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Offer Rent (₹ / month)</FormLabel>
                      <FormControl><Input type="number" {...field} /></FormControl>
                      <FormDescription>Special rate if they book within 15 minutes.</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="deposit"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Security Deposit (₹)</FormLabel>
                      <FormControl><Input type="number" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="maintenanceFee"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>One-time Maintenance (₹)</FormLabel>
                      <FormControl><Input type="number" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="tokenAmount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Token Payment (₹)</FormLabel>
                      <FormControl><Input type="number" {...field} /></FormControl>
                      <FormDescription>Adjusted against first month's rent.</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="col-span-full grid gap-6 sm:grid-cols-2 pt-4 border-t">
                  <FormField
                    control={form.control}
                    name="stayDurationMonths"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Lock-in Period (Months)</FormLabel>
                        <FormControl><Input type="number" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="noticePeriodMonths"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Notice Period (Months)</FormLabel>
                        <FormControl><Input type="number" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </CardContent>
            </Card>

            <div className="flex flex-col-reverse sm:flex-row justify-end gap-3">
              <Link href="/">
                <Button type="button" variant="outline" className="w-full sm:w-auto">Cancel</Button>
              </Link>
              <Button
                type="submit"
                disabled={isLoading}
                className={`w-full sm:w-auto min-w-[200px] gap-2 ${activateNow ? "bg-amber-500 hover:bg-amber-600 text-white" : ""}`}
              >
                {isLoading ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> {activateNow && approveBooking.isPending ? "Activating…" : "Saving…"}</>
                ) : activateNow ? (
                  <><Zap className="w-4 h-4" /> Create & Activate Now</>
                ) : (
                  "Create Quotation"
                )}
              </Button>
            </div>

          </form>
        </Form>
      </main>
    </div>
  );
}
