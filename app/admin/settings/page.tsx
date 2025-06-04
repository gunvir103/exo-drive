import { SelectItem } from "@/components/ui/select"
import { SelectContent } from "@/components/ui/select"
import { SelectValue } from "@/components/ui/select"
import { SelectTrigger } from "@/components/ui/select"
import { Select } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"

export default function AdminSettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-muted-foreground">Manage your application settings and preferences.</p>
      </div>

      <Tabs defaultValue="general">
        <TabsList>
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="integrations">Integrations</TabsTrigger>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
          <TabsTrigger value="users">Users</TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="space-y-6 mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Business Information</CardTitle>
              <CardDescription>Update your business details and contact information.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="company-name">Company Name</Label>
                  <Input id="company-name" defaultValue="exoDrive" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email Address</Label>
                  <Input id="email" type="email" defaultValue="info@exodrive.com" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone Number</Label>
                  <Input id="phone" defaultValue="(202) 555-0123" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="address">Address</Label>
                  <Input id="address" defaultValue="1234 Luxury Drive, Washington DC" />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="about">About</Label>
                <Textarea
                  id="about"
                  rows={4}
                  defaultValue="exoDrive offers luxury and exotic car rentals in the DC, Maryland, and Virginia area."
                />
              </div>
              <Button>Save Changes</Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Website Settings</CardTitle>
              <CardDescription>Configure your website appearance and behavior.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="maintenance-mode">Maintenance Mode</Label>
                    <p className="text-sm text-muted-foreground">Put your website in maintenance mode</p>
                  </div>
                  <Switch id="maintenance-mode" />
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="booking-enabled">Enable Bookings</Label>
                    <p className="text-sm text-muted-foreground">Allow customers to make new bookings</p>
                  </div>
                  <Switch id="booking-enabled" defaultChecked />
                </div>
                <Separator />
                <div className="space-y-2">
                  <Label htmlFor="homepage-title">Homepage Title</Label>
                  <Input id="homepage-title" defaultValue="Drive Your Dream Car Today" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="homepage-subtitle">Homepage Subtitle</Label>
                  <Input
                    id="homepage-subtitle"
                    defaultValue="Experience the thrill of driving the world's most exotic cars in the DMV area."
                  />
                </div>
                <Button>Save Changes</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="integrations" className="space-y-6 mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Stripe Integration</CardTitle>
              <CardDescription>Configure your Stripe payment and identity verification settings.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="stripe-public-key">Stripe Public Key</Label>
                  <Input id="stripe-public-key" defaultValue="pk_test_..." type="password" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="stripe-secret-key">Stripe Secret Key</Label>
                  <Input id="stripe-secret-key" defaultValue="sk_test_..." type="password" />
                </div>
              </div>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="stripe-test-mode">Test Mode</Label>
                  <p className="text-sm text-muted-foreground">Use Stripe test environment</p>
                </div>
                <Switch id="stripe-test-mode" defaultChecked />
              </div>
              <Button>Save Changes</Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>DocuSeal Integration</CardTitle>
              <CardDescription>Configure your self-hosted DocuSeal settings for digital contracts.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="docuseal-instance-url">DocuSeal Instance URL</Label>
                <Input id="docuseal-instance-url" defaultValue="https://docuseal.exodrive.com" placeholder="https://docuseal.yourdomain.com" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="docuseal-api-key">API Token</Label>
                <Input id="docuseal-api-key" defaultValue="..." type="password" placeholder="docuseal_api_..." />
              </div>
              <div className="space-y-2">
                <Label htmlFor="docuseal-template-id">Rental Agreement Template ID</Label>
                <Input id="docuseal-template-id" defaultValue="..." placeholder="template_rental_v1" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="docuseal-webhook-secret">Webhook Secret</Label>
                <Input id="docuseal-webhook-secret" defaultValue="..." type="password" placeholder="webhook_secret_..." />
              </div>
              <div className="space-y-2">
                <Label htmlFor="docuseal-webhook">Webhook URL</Label>
                <Input
                  id="docuseal-webhook"
                  defaultValue="https://exodrive.com/api/webhooks/docuseal"
                  readOnly
                />
              </div>
              <Button>Save Changes</Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>SendGrid Integration</CardTitle>
              <CardDescription>Configure your SendGrid settings for email notifications.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="sendgrid-api-key">API Key</Label>
                <Input id="sendgrid-api-key" defaultValue="..." type="password" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sendgrid-from-email">From Email</Label>
                <Input id="sendgrid-from-email" defaultValue="notifications@exodrive.com" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sendgrid-from-name">From Name</Label>
                <Input id="sendgrid-from-name" defaultValue="exoDrive Rentals" />
              </div>
              <Button>Save Changes</Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="notifications" className="space-y-6 mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Email Notifications</CardTitle>
              <CardDescription>Configure which emails are sent to customers.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="email-booking-confirmation">Booking Confirmation</Label>
                    <p className="text-sm text-muted-foreground">Send email when a booking is confirmed</p>
                  </div>
                  <Switch id="email-booking-confirmation" defaultChecked />
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="email-contract">Contract Signing</Label>
                    <p className="text-sm text-muted-foreground">Send email when a contract is ready to sign</p>
                  </div>
                  <Switch id="email-contract" defaultChecked />
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="email-payment">Payment Pre-authorization</Label>
                    <p className="text-sm text-muted-foreground">Send email when payment is pre-authorized</p>
                  </div>
                  <Switch id="email-payment" defaultChecked />
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="email-reminder">Pickup Reminder</Label>
                    <p className="text-sm text-muted-foreground">Send reminder email 24 hours before pickup</p>
                  </div>
                  <Switch id="email-reminder" defaultChecked />
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="email-completion">Rental Completion</Label>
                    <p className="text-sm text-muted-foreground">Send email when rental is completed</p>
                  </div>
                  <Switch id="email-completion" defaultChecked />
                </div>
                <Button>Save Changes</Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Admin Notifications</CardTitle>
              <CardDescription>Configure which notifications are sent to administrators.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="admin-new-booking">New Booking</Label>
                    <p className="text-sm text-muted-foreground">Notify when a new booking is created</p>
                  </div>
                  <Switch id="admin-new-booking" defaultChecked />
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="admin-contract-signed">Contract Signed</Label>
                    <p className="text-sm text-muted-foreground">Notify when a contract is signed</p>
                  </div>
                  <Switch id="admin-contract-signed" defaultChecked />
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="admin-upcoming-pickup">Upcoming Pickup</Label>
                    <p className="text-sm text-muted-foreground">Notify 24 hours before a scheduled pickup</p>
                  </div>
                  <Switch id="admin-upcoming-pickup" defaultChecked />
                </div>
                <Button>Save Changes</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="users" className="space-y-6 mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Admin Users</CardTitle>
              <CardDescription>Manage administrator accounts for the dashboard.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-4">
                {[
                  {
                    name: "Admin User",
                    email: "admin@exodrive.com",
                    role: "Owner",
                    lastLogin: "Today at 9:42 AM",
                  },
                  {
                    name: "Jane Smith",
                    email: "jane@exodrive.com",
                    role: "Admin",
                    lastLogin: "Yesterday at 3:15 PM",
                  },
                  {
                    name: "Mike Johnson",
                    email: "mike@exodrive.com",
                    role: "Manager",
                    lastLogin: "Mar 12, 2024 at 10:30 AM",
                  },
                ].map((user, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">{user.name}</p>
                      <p className="text-sm text-muted-foreground">{user.email}</p>
                      <p className="text-xs text-muted-foreground">Last login: {user.lastLogin}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="text-sm font-medium">{user.role}</div>
                      <Button variant="outline" size="sm">
                        Edit
                      </Button>
                    </div>
                  </div>
                ))}
                <Separator />
                <Button>Add New User</Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Security Settings</CardTitle>
              <CardDescription>Configure security settings for admin users.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="two-factor">Two-Factor Authentication</Label>
                    <p className="text-sm text-muted-foreground">Require 2FA for all admin users</p>
                  </div>
                  <Switch id="two-factor" defaultChecked />
                </div>
                <Separator />
                <div className="space-y-2">
                  <Label htmlFor="session-timeout">Session Timeout (minutes)</Label>
                  <Input id="session-timeout" type="number" defaultValue="60" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password-policy">Password Policy</Label>
                  <Select defaultValue="strong">
                    <SelectTrigger id="password-policy">
                      <SelectValue placeholder="Select policy" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="basic">Basic (8+ characters)</SelectItem>
                      <SelectItem value="medium">Medium (8+ chars, mixed case)</SelectItem>
                      <SelectItem value="strong">Strong (8+ chars, mixed case, numbers, symbols)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button>Save Changes</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}

