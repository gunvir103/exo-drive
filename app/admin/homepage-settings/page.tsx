"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { ArrowLeft, Save } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import Image from "next/image"
import { Skeleton } from "@/components/ui/skeleton"

interface Car {
  id: string
  name: string
  slug: string
  category: string
  primary_image_url?: string
}

export default function HomepageSettingsPage() {
  const [cars, setCars] = useState<Car[]>([])
  const [selectedCar, setSelectedCar] = useState<string>("")
  const [currentSettingId, setCurrentSettingId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const router = useRouter()
  const { toast } = useToast()
  const supabase = getSupabaseBrowserClient()

  // Load available cars and current setting
  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true)
      try {
        // Fetch all cars
        const { data: carsData, error: carsError } = await supabase
          .from("cars")
          .select("id, name, slug, category, primary_image_url: car_images(url)")
          .eq("available", true)
          .eq("hidden", false)
          .order("name");

        if (carsError) throw carsError;

        // Process cars data - extract primary image from the nested object
        const processedCars = carsData.map((car: any) => ({
          ...car,
          primary_image_url: Array.isArray(car.primary_image_url) && car.primary_image_url.length > 0 
            ? car.primary_image_url[0].url 
            : undefined
        }));
        
        setCars(processedCars);

        // Fetch current homepage setting
        const { data: settingData, error: settingError } = await supabase
          .from("homepage_settings")
          .select("*")
          .single();

        if (settingData) {
          setSelectedCar(settingData.featured_car_id || "");
          setCurrentSettingId(settingData.id);
        } else if (!settingError) {
          // If no settings exist, we'll create them on save
          setCurrentSettingId(null);
        }
      } catch (error) {
        console.error("Error fetching data:", error);
        toast({
          variant: "destructive",
          title: "Error loading data",
          description: "Could not load cars or homepage settings.",
        });
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [supabase, toast]);

  // Handle saving the settings
  const handleSave = async () => {
    setIsSaving(true);
    try {
      if (currentSettingId) {
        // Update existing settings
        const { error } = await supabase
          .from("homepage_settings")
          .update({
            featured_car_id: selectedCar,
            updated_at: new Date().toISOString(),
          })
          .eq("id", currentSettingId);

        if (error) throw error;
      } else {
        // Create new settings
        const { error } = await supabase
          .from("homepage_settings")
          .insert({
            featured_car_id: selectedCar,
          });

        if (error) throw error;
      }

      toast({
        title: "Settings saved",
        description: "Homepage settings have been updated successfully.",
      });

      // Refresh server components
      router.refresh();
    } catch (error) {
      console.error("Error saving settings:", error);
      toast({
        variant: "destructive",
        title: "Error saving settings",
        description: "Could not save homepage settings.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Find the selected car details
  const selectedCarDetails = cars.find(car => car.id === selectedCar);

  return (
    <div className="space-y-6">
      <div className="flex items-center">
        <Button variant="ghost" onClick={() => router.back()} className="mr-4">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        <h1 className="text-2xl font-bold">Homepage Settings</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Featured Car Section</CardTitle>
          <CardDescription>Select which car to display in the homepage feature section</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-64 w-full" />
            </div>
          ) : (
            <div className="space-y-6">
              <div className="grid gap-3">
                <Label htmlFor="featuredCar">Featured Car</Label>
                <Select value={selectedCar} onValueChange={setSelectedCar}>
                  <SelectTrigger id="featuredCar">
                    <SelectValue placeholder="Select a car to feature" />
                  </SelectTrigger>
                  <SelectContent>
                    {cars.map((car) => (
                      <SelectItem key={car.id} value={car.id}>
                        {car.name} ({car.category})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedCarDetails && (
                <div className="mt-6">
                  <h3 className="text-lg font-medium mb-2">Preview</h3>
                  <div className="relative h-64 bg-muted rounded-md overflow-hidden">
                    <Image
                      src={selectedCarDetails.primary_image_url || "/placeholder.svg?text=Car+Image"}
                      alt={selectedCarDetails.name}
                      fill
                      className="object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
                    <div className="absolute bottom-0 left-0 right-0 p-6 text-white">
                      <h3 className="text-2xl font-bold mb-2">{selectedCarDetails.name}</h3>
                      <p className="mb-4 text-gray-200">
                        {selectedCarDetails.category} 
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
        <CardFooter className="flex justify-end">
          <Button onClick={handleSave} disabled={isLoading || isSaving}>
            {isSaving ? "Saving..." : "Save Settings"}
            {!isSaving && <Save className="ml-2 h-4 w-4" />}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
} 