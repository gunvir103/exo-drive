import { handleSupabaseError } from "@/lib/supabase/client"
// No longer needed as we'll use the browser client in the form
// import { createSupabaseServerClient, createSupabaseServiceRoleClient } from "@/lib/supabase/server"
// import { cookies } from 'next/headers' // Not directly used in service logic now
import { BUCKET_NAMES } from "@/lib/supabase/storage-service"
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database.types' // Import generated types

// Type definitions based on the actual schema from list_tables
// Assuming standard foreign key 'car_id' and primary key 'id' (uuid)

// Base Car Type (from 'cars' table)
export type CarBase = Omit<Database['public']['Tables']['cars']['Row'], 'created_at' | 'updated_at'> & {
    createdAt?: string | null; // Keep original strings for now, convert later if needed
    updatedAt?: string | null;
};

// Related Data Types
export type CarPricing = Database['public']['Tables']['car_pricing']['Row'];
export type CarImage = Database['public']['Tables']['car_images']['Row'];
export type CarFeature = Database['public']['Tables']['car_features']['Row'];
export type CarSpecification = Database['public']['Tables']['car_specifications']['Row'];

// Composite Application Car Type
// Combines base car with related data
export type AppCar = CarBase & {
    pricing: CarPricing | null; // Assuming one-to-one pricing for simplicity, adjust if needed
    images: CarImage[];
    features: CarFeature[];
    specifications: CarSpecification[];
};

// Type for creating/updating (omit IDs generated by DB)
export type CarInsertData = Omit<Database['public']['Tables']['cars']['Insert'], 'id' | 'created_at' | 'updated_at'>;
export type PricingInsertData = Omit<Database['public']['Tables']['car_pricing']['Insert'], 'id' | 'car_id' | 'created_at' | 'updated_at'>;
export type ImageInsertData = Omit<Database['public']['Tables']['car_images']['Insert'], 'id' | 'car_id' | 'created_at'>;
export type FeatureInsertData = Omit<Database['public']['Tables']['car_features']['Insert'], 'id' | 'car_id' | 'created_at'>;
export type SpecificationInsertData = Omit<Database['public']['Tables']['car_specifications']['Insert'], 'id' | 'car_id' | 'created_at'>;

// Composite type for form submission / service input
// Remove fields not in cars.Insert/Update: make, model, year, engine, transmission, drivetrain
export type AppCarUpsert = {
    name: string; // Required for slug generation
    // make?: string | null; // Belongs in specs?
    // model?: string | null; // Belongs in specs?
    // year?: number | null; // Belongs in specs?
    category: string;
    description?: string | null; // Nullable string allowed
    short_description?: string | null; // Nullable string allowed
    // engine?: string | null; // Belongs in specs?
    // transmission?: string | null; // Belongs in specs?
    // drivetrain?: string | null; // Belongs in specs?
    available?: boolean | null; // Nullable boolean allowed
    featured?: boolean | null; // Nullable boolean allowed
    hidden?: boolean | null; // Nullable boolean allowed
    // Related data
    pricing: PricingInsertData;
    images: ImageInsertData[];
    features: FeatureInsertData[];
    specifications: SpecificationInsertData[];
};


// --- Helper Functions (Transformation logic removed as we use related tables directly) ---
// No longer needed as we fetch joined data or assemble it


// --- Service Object ---
export const carServiceSupabase = {
    /**
     * Get *base* car data by ID (Internal helper or basic fetch)
     * Fetches only from the 'cars' table.
     */
    _getBaseCarById: async (supabase: SupabaseClient, id: string): Promise<CarBase | null> => {
        try {
            const { data, error } = await supabase
                .from("cars")
                .select("*")
                .eq("id", id)
                .maybeSingle<CarBase>();

            if (error) throw error;
            return data;
        } catch (error) {
            if (error instanceof Error) {
                throw new Error(handleSupabaseError(error));
            }
            throw new Error("An unexpected error occurred fetching base car by ID");
        }
    },

    /**
     * Get *base* car data by Slug (Internal helper or basic fetch)
     * Fetches only from the 'cars' table.
     */
     _getBaseCarBySlug: async (supabase: SupabaseClient, slug: string): Promise<CarBase | null> => {
        try {
            const { data, error } = await supabase
                .from("cars")
                .select("*")
                .eq("slug", slug)
                .maybeSingle<CarBase>();

            if (error) throw error;
            return data;
        } catch (error) {
            if (error instanceof Error) {
                throw new Error(handleSupabaseError(error));
            }
            throw new Error("An unexpected error occurred fetching base car by slug");
        }
    },


    /**
     * Get a complete car with all related data by ID (Used by Edit Page, etc.)
     */
    getCarById: async (supabase: SupabaseClient, id: string): Promise<AppCar | null> => {
        try {
            // Fetch base car data
            const { data: carData, error: carError } = await supabase
                .from("cars")
                .select(`
                    *,
                    pricing:car_pricing(*),
                    images:car_images(*),
                    features:car_features(*),
                    specifications:car_specifications(*)
                `)
                .eq("id", id)
                .maybeSingle(); // Use maybeSingle to handle null case gracefully


            if (carError) throw carError;
            if (!carData) return null;

            // Supabase types might be slightly off for nested selects, cast carefully
            const typedCarData = carData as any; // Use any temporarily, refine if needed

            // Assemble the AppCar object
            const assembledCar: AppCar = {
                ...typedCarData, // Spread base car fields
                pricing: Array.isArray(typedCarData.pricing) ? typedCarData.pricing[0] || null : typedCarData.pricing || null, // Handle potential array/single object
                images: typedCarData.images || [],
                features: typedCarData.features || [],
                specifications: typedCarData.specifications || [],
                // Ensure boolean fields have defaults if null
                available: typedCarData.available ?? true,
                featured: typedCarData.featured ?? false,
                hidden: typedCarData.hidden ?? false,
            };

             // Sort images by sort_order if the field exists
             if (assembledCar.images.length > 0 && 'sort_order' in assembledCar.images[0]) {
                assembledCar.images.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
             }


            return assembledCar;
        } catch (error) {
            console.error("Error in getCarById:", error);
            if (error instanceof Error) {
                throw new Error(handleSupabaseError(error));
            }
            throw new Error("An unexpected error occurred fetching car by ID");
        }
    },


    /**
     * Get a complete car with all related data by Slug (Used by Public Fleet Page)
     */
    getCarBySlug: async (supabase: SupabaseClient, slug: string): Promise<AppCar | null> => {
        try {
            // Fetch base car data and related data using joins/selects
             const { data: carData, error: carError } = await supabase
                .from("cars")
                .select(`
                    *,
                    pricing:car_pricing(*),
                    images:car_images(*),
                    features:car_features(*),
                    specifications:car_specifications(*)
                `)
                .eq("slug", slug)
                .maybeSingle(); // Use maybeSingle


            if (carError) throw carError;
            if (!carData) return null;

            // Assemble the AppCar object (similar to getCarById)
             const typedCarData = carData as any;
             const assembledCar: AppCar = {
                ...typedCarData,
                pricing: Array.isArray(typedCarData.pricing) ? typedCarData.pricing[0] || null : typedCarData.pricing || null,
                images: typedCarData.images || [],
                features: typedCarData.features || [],
                specifications: typedCarData.specifications || [],
                available: typedCarData.available ?? true,
                featured: typedCarData.featured ?? false,
                hidden: typedCarData.hidden ?? false,
            };

             // Sort images by sort_order
             if (assembledCar.images.length > 0 && 'sort_order' in assembledCar.images[0]) {
                assembledCar.images.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
             }

            return assembledCar;
        } catch (error) {
            console.error("Error in getCarBySlug:", error);
            if (error instanceof Error) {
                throw new Error(handleSupabaseError(error));
            }
            throw new Error("An unexpected error occurred fetching car by slug");
        }
    },

    /**
     * Get base details for all cars (for Admin List)
     * Includes minimal related data (e.g., primary image URL, price)
     */
    getAllCarsForAdminList: async (supabase: SupabaseClient): Promise<any[]> => { // Return type depends on exact data needed
        try {
            // Select base car data and only essential related fields
            const { data, error } = await supabase
                .from("cars")
                .select(`
                    id,
                    slug,
                    name,
                    category,
                    available,
                    featured,
                    hidden,
                    created_at,
                    pricing:car_pricing(base_price),
                    images:car_images(url, is_primary, sort_order)
                `)
                .order("created_at", { ascending: false });

            if (error) {
                // Throw the specific Supabase error for better debugging upstream
                console.error("Error in getAllCarsForAdminList Query:", error);
                throw error; 
            }

            // Process data to get primary image and price
             return data.map((car: any) => {
                 const primaryImage = car.images?.sort((a:any,b:any) => (a.sort_order ?? 0) - (b.sort_order ?? 0)).find((img: any) => img.is_primary) || car.images?.[0];
                 const price = car.pricing?.[0]?.base_price ?? car.pricing?.base_price; // Handle array/object from select

                 return {
                    ...car,
                    images: undefined, // remove nested array
                    pricing: undefined, // remove nested array/object
                    primary_image_url: primaryImage?.url,
                    price_per_day: price // Rename for consistency if needed elsewhere
                 };
             });

        } catch (error) {
            console.error("Error in getAllCarsForAdminList:", error);
            if (error instanceof Error) {
                throw new Error(handleSupabaseError(error));
            }
            throw new Error("An unexpected error occurred fetching cars for admin list");
        }
    },


    /**
     * Get visible cars for the public fleet (Optimized fetch)
     * Includes necessary data for display (name, slug, price, primary image, category)
     */
    getVisibleCarsForFleet: async (supabase: SupabaseClient): Promise<any[]> => {
         try {
            const { data, error } = await supabase
                .from("cars")
                .select(`
                    id,
                    slug,
                    name,
                    category,
                    short_description,
                    featured,
                    pricing:car_pricing(base_price),
                    images:car_images(url, is_primary, sort_order)
                `)
                .eq("available", true)
                .eq("hidden", false)
                .order("featured", { ascending: false }) // Order by featured first
                .order("created_at", { ascending: false });

            if (error) {
                // Throw the specific Supabase error for better debugging upstream
                console.error("Error in getVisibleCarsForFleet Query:", error);
                throw error; 
            }

            // Process data (similar to admin list)
            return data.map((car: any) => {
                 const primaryImage = car.images?.sort((a:any,b:any) => (a.sort_order ?? 0) - (b.sort_order ?? 0)).find((img: any) => img.is_primary) || car.images?.[0];
                  const price = car.pricing?.[0]?.base_price ?? car.pricing?.base_price;

                  return {
                     id: car.id,
                     slug: car.slug,
                     name: car.name,
                     // make: car.make, // Removed - Not fetched
                     // model: car.model, // Removed - Not fetched
                     category: car.category,
                     shortDescription: car.short_description,
                     isFeatured: car.featured, // Rename for consistency
                     primaryImageUrl: primaryImage?.url,
                     pricePerDay: price // Rename for consistency
                 };
             });

        } catch (error) {
            console.error("Error in getVisibleCarsForFleet:", error);
            if (error instanceof Error) {
                throw new Error(handleSupabaseError(error));
            }
            throw new Error("An unexpected error occurred fetching visible cars for fleet");
        }
    },

     /**
     * Create a new car with related data.
     * IMPORTANT: This doesn't handle transactions. For production, wrap these in an RPC function (pg_transaction)
     * or handle potential partial failures gracefully.
     */
    createCar: async (
        supabase: SupabaseClient,
        carData: AppCarUpsert,
        userId?: string | null
    ): Promise<AppCar> => {
        // Add check for required name
        if (!carData.name) {
            throw new Error("Car name is required to create a car.");
        }
        // Use helper function
        const slug = generateSlug(carData.name);

        // 1. Insert base car data
        // Map fields ONLY present in cars.Insert type
        const baseCarPayload: CarInsertData & { slug: string; created_by?: string } = {
            name: carData.name,
            slug: slug, // Generated slug
            // make: carData.make, // Removed: Not in cars.Insert
            // model: carData.model, // Removed: Not in cars.Insert
            // year: carData.year, // Removed: Not in cars.Insert
            category: carData.category,
            description: carData.description ?? "", // Ensure non-null for insert if description is not nullable
            short_description: carData.short_description, // Nullable is fine
            // engine: carData.engine, // Removed: Not in cars.Insert
            // transmission: carData.transmission, // Removed: Not in cars.Insert
            // drivetrain: carData.drivetrain, // Removed: Not in cars.Insert
            available: carData.available ?? true,
            featured: carData.featured ?? false,
            hidden: carData.hidden ?? false,
            created_by: userId ?? undefined // Optional creator ID
        };

        const { data: newCar, error: carError } = await supabase
            .from("cars")
            .insert(baseCarPayload)
            .select("*")
            .single<CarBase>();

        if (carError || !newCar) {
            console.error("Error creating base car:", carError);
            throw carError || new Error("Failed to create car: No data returned.");
        }

        const carId = newCar.id;

        // --- Insert Related Data (handle errors individually or use transaction) ---
        let pricingResult: CarPricing | null = null;
        let imagesResult: CarImage[] = [];
        let featuresResult: CarFeature[] = [];
        let specsResult: CarSpecification[] = [];

        try {
            // 2. Insert Pricing
            if (carData.pricing) {
                const { data, error } = await supabase.from("car_pricing").insert({ ...carData.pricing, car_id: carId }).select().single<CarPricing>();
                if (error) throw new Error(`Pricing insert failed: ${error.message}`);
                pricingResult = data;
            }

            // 3. Insert Images
            if (carData.images && carData.images.length > 0) {
                const imagePayloads = carData.images.map(img => ({ ...img, car_id: carId }));
                const { data, error } = await supabase.from("car_images").insert(imagePayloads).select();
                if (error) throw new Error(`Images insert failed: ${error.message}`);
                imagesResult = data || [];
            }

            // 4. Insert Features
            if (carData.features && carData.features.length > 0) {
                const featurePayloads = carData.features.map(f => ({ ...f, car_id: carId }));
                const { data, error } = await supabase.from("car_features").insert(featurePayloads).select();
                 if (error) throw new Error(`Features insert failed: ${error.message}`);
                featuresResult = data || [];
            }

            // 5. Insert Specifications
            if (carData.specifications && carData.specifications.length > 0) {
                 const specPayloads = carData.specifications.map(s => ({ ...s, car_id: carId }));
                 const { data, error } = await supabase.from("car_specifications").insert(specPayloads).select();
                 if (error) throw new Error(`Specifications insert failed: ${error.message}`);
                 specsResult = data || [];
            }

             // Sort images after insert if needed
            if (imagesResult.length > 0 && 'sort_order' in imagesResult[0]) {
                imagesResult.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
             }


            // Assemble the final AppCar object
             return {
                 ...newCar,
                 pricing: pricingResult,
                 images: imagesResult,
                 features: featuresResult,
                 specifications: specsResult,
             };

        } catch (error) {
            // Basic cleanup attempt (consider more robust transaction/rollback)
            console.error("Error inserting related data, attempting cleanup for car:", carId, error);
             await supabase.from("cars").delete().eq("id", carId); // Delete the base car if related inserts fail
             if (error instanceof Error) {
                throw new Error(handleSupabaseError(error));
             }
             throw new Error("An unexpected error occurred creating related car data.");
        }
    },

     /**
     * Update a car and its related data.
     * IMPORTANT: Uses multiple DB calls. Consider transactions (RPC) for atomicity.
     * Handles updating, inserting, and deleting related items.
     */
    updateCar: async (
        supabase: SupabaseClient,
        carId: string,
        updates: Partial<AppCarUpsert> // Use the combined upsert type
    ): Promise<AppCar> => {

         // 1. Update base car data
         // Map fields ONLY present in cars.Update type
         const baseCarUpdatePayload: Partial<Database['public']['Tables']['cars']['Update']> = {};
         if (updates.name !== undefined) {
             baseCarUpdatePayload.name = updates.name;
             // Regenerate slug if name changes - use helper
             baseCarUpdatePayload.slug = generateSlug(updates.name);
         }
         // Check and assign other base fields, converting null to undefined for Update type
         if (updates.category !== undefined) baseCarUpdatePayload.category = updates.category;
         if (updates.description !== undefined) {
             baseCarUpdatePayload.description = updates.description === null ? undefined : updates.description;
         }
         if (updates.short_description !== undefined) {
             baseCarUpdatePayload.short_description = updates.short_description === null ? undefined : updates.short_description;
         }
         if (updates.available !== undefined) {
             baseCarUpdatePayload.available = updates.available === null ? undefined : updates.available;
         }
         if (updates.featured !== undefined) {
             baseCarUpdatePayload.featured = updates.featured === null ? undefined : updates.featured;
         }
         if (updates.hidden !== undefined) {
             baseCarUpdatePayload.hidden = updates.hidden === null ? undefined : updates.hidden;
         }


        if (Object.keys(baseCarUpdatePayload).length > 0) {
            const { error: updateError } = await supabase
                .from("cars")
                .update(baseCarUpdatePayload)
                .eq("id", carId);
            if (updateError) {
                 console.error("Error updating base car:", updateError);
                 throw updateError;
            }
        }

        // --- Update Related Data ---
        // This requires fetching existing, comparing, deleting, updating, inserting.

        try {
             // 2. Update Pricing (assuming one-to-one, using upsert)
            if (updates.pricing) {
                 const { error } = await supabase
                     .from("car_pricing")
                     .upsert({ ...updates.pricing, car_id: carId }, { onConflict: 'car_id' }); // Upsert based on car_id
                  if (error) throw new Error(`Pricing update/insert failed: ${error.message}`);
            }

            // 3. Update Images (More complex: delete removed, update existing, insert new)
            if (updates.images) {
                 // Get existing image IDs/Paths for comparison
                 const { data: existingImages, error: fetchErr } = await supabase.from("car_images").select("id, path").eq("car_id", carId);
                 if (fetchErr) throw new Error(`Failed to fetch existing images: ${fetchErr.message}`);

                 const existingImagePaths = new Set(existingImages?.map(img => img.path) || []);
                 const incomingImagePaths = new Set(updates.images.map(img => img.path));

                 // Identify images to delete (exist in DB but not in update payload)
                 const imagesToDelete = existingImages?.filter(img => img.path && !incomingImagePaths.has(img.path)) || [];

                 // Identify images to upsert (exist in update payload)
                 // We'll upsert all incoming images based on a unique constraint (e.g., car_id, path)
                 // Assumes a unique constraint `(car_id, path)` exists or needs to be added.
                 // Or upsert based on `id` if client provides existing IDs. Let's assume path is the key for now.
                 const imagesToUpsert = updates.images.map(img => ({
                     ...img,
                     car_id: carId,
                     // Ensure 'path' is included for onConflict
                 }));


                 // Perform deletions (storage first, then DB)
                 if (imagesToDelete.length > 0) {
                     const pathsToDelete = imagesToDelete.map(img => img.path).filter(Boolean) as string[];
                     const idsToDelete = imagesToDelete.map(img => img.id);

                     // Delete from Storage (handle potential errors)
                     if (pathsToDelete.length > 0) {
                        const { error: storageError } = await supabase.storage.from(BUCKET_NAMES.VEHICLE_IMAGES).remove(pathsToDelete);
                         if (storageError) console.error("Error deleting images from storage:", storageError); // Log but continue DB deletion
                     }
                     // Delete from DB
                     const { error: dbDeleteError } = await supabase.from("car_images").delete().in("id", idsToDelete);
                     if (dbDeleteError) throw new Error(`Failed to delete images from DB: ${dbDeleteError.message}`);
                 }

                 // Perform upserts (insert new or update existing based on path)
                 if (imagesToUpsert.length > 0) {
                     // Need a unique constraint on (car_id, path) for this to work reliably
                      const { error: upsertError } = await supabase.from("car_images").upsert(imagesToUpsert, { onConflict: 'car_id, path' }); // ADJUST onConflict based on schema
                      if (upsertError) throw new Error(`Failed to upsert images: ${upsertError.message}`);
                 }
            }

             // 4. Update Features (Delete all existing for car, then insert new) - Simpler approach
             if (updates.features) {
                 // Delete existing
                 const { error: deleteError } = await supabase.from("car_features").delete().eq("car_id", carId);
                  if (deleteError) throw new Error(`Failed to delete old features: ${deleteError.message}`);

                 // Insert new
                 if (updates.features.length > 0) {
                     const featurePayloads = updates.features.map(f => ({ ...f, car_id: carId }));
                     const { error: insertError } = await supabase.from("car_features").insert(featurePayloads);
                      if (insertError) throw new Error(`Failed to insert new features: ${insertError.message}`);
                 }
             }

            // 5. Update Specifications (Delete all existing for car, then insert new)
            if (updates.specifications) {
                 // Delete existing
                 const { error: deleteError } = await supabase.from("car_specifications").delete().eq("car_id", carId);
                 if (deleteError) throw new Error(`Failed to delete old specifications: ${deleteError.message}`);

                 // Insert new
                 if (updates.specifications.length > 0) {
                     const specPayloads = updates.specifications.map(s => ({ ...s, car_id: carId }));
                     const { error: insertError } = await supabase.from("car_specifications").insert(specPayloads);
                     if (insertError) throw new Error(`Failed to insert new specifications: ${insertError.message}`);
                 }
             }

        } catch (error) {
            console.error("Error updating related car data:", error);
            if (error instanceof Error) {
                throw new Error(handleSupabaseError(error));
            }
            throw new Error("An unexpected error occurred updating related car data.");
        }

         // Fetch the updated complete car data to return
         const updatedCar = await carServiceSupabase.getCarById(supabase, carId);
         if (!updatedCar) throw new Error(`Failed to fetch updated car ${carId} after update.`);
         return updatedCar;
    },

    /**
     * Delete a car and its related data and storage objects.
     * IMPORTANT: Use transactions (RPC) for atomicity in production.
     */
    deleteCar: async (supabase: SupabaseClient, carId: string): Promise<boolean> => {
        try {
            // 1. Get image paths to delete from storage
            const { data: images, error: imgError } = await supabase
                .from("car_images")
                .select("id, path") // Also select id for DB deletion
                .eq("car_id", carId);

             if (imgError) {
                 console.error("Failed to fetch images for deletion:", imgError);
                 // Decide whether to proceed with DB deletion or throw
                 throw imgError;
             }

             // Add null check before mapping
             const imagesToDelete = images || []; 
             const imagePathsToDelete = imagesToDelete.map(img => img.path).filter(Boolean) as string[];
             const imageIdsToDelete = imagesToDelete.map(img => img.id); // Get IDs for DB deletion


             // 2. Delete related data first (constraints might require this order)
             // Wrap in Promise.all for concurrency, but sequential might be safer without transactions
             await Promise.all([
                 supabase.from("car_pricing").delete().eq("car_id", carId),
                 supabase.from("car_features").delete().eq("car_id", carId),
                 supabase.from("car_specifications").delete().eq("car_id", carId),
                 supabase.from("car_images").delete().eq("car_id", carId), // Use `in` operator with IDs for safety if needed
                 // supabase.from("car_images").delete().in("id", imageIdsToDelete), // Alternative safer delete
                 // Add other related tables if needed (reviews, availability, etc.)
             ]).catch(error => {
                 console.error("Error deleting related car data:", error);
                 throw error; // Re-throw to stop the process
             });


             // 3. Delete the main car record
             const { error: carDeleteError } = await supabase.from("cars").delete().eq("id", carId);
             if (carDeleteError) {
                 console.error("Error deleting main car record:", carDeleteError);
                 throw carDeleteError;
             }

             // 4. Delete images from storage
             if (imagePathsToDelete.length > 0) {
                  const { error: storageError } = await supabase.storage.from(BUCKET_NAMES.VEHICLE_IMAGES).remove(imagePathsToDelete);
                  if (storageError) {
                      // Log error but consider deletion successful as DB records are gone
                      console.error("Error deleting images from storage after DB deletion:", storageError);
                  }
             }

            return true;
        } catch (error) {
            console.error(`Error deleting car ${carId}:`, error);
            if (error instanceof Error) {
                throw new Error(handleSupabaseError(error));
            }
            throw new Error("An unexpected error occurred deleting car");
        }
    },

     /**
      * Get unique categories for filtering (from visible cars)
      */
     getCategories: async (supabase: SupabaseClient): Promise<string[]> => {
         try {
             // Fetch distinct categories from visible cars
             // Using an RPC function might be more efficient if the table is large.
             const { data, error } = await supabase
                 .from("cars")
                 .select("category")
                 .eq("available", true)
                 .eq("hidden", false);

             if (error) throw error;
             if (!data) return [];

             const categories = data.map((item) => item.category as string);
             // Filter out null/empty, get unique, sort
             return Array.from(new Set(categories.filter(Boolean))).sort();
         } catch (error) {
             console.error("Error fetching categories:", error);
             if (error instanceof Error) {
                 throw new Error(handleSupabaseError(error));
             }
             throw new Error("An unexpected error occurred fetching categories");
         }
     },

     /**
      * Get related cars by category (for car detail page)
      */
     getRelatedCars: async (supabase: SupabaseClient, carId: string, limit = 3): Promise<any[]> => { // Return optimized list type
         try {
             // 1. Get the category of the current car
             const { data: currentCar, error: carError } = await supabase
                 .from("cars")
                 .select("category")
                 .eq("id", carId)
                 .maybeSingle();

             if (carError) {
                 console.error("Error fetching current car category for related cars:", carError);
                 throw carError; // Re-throw specific error
             }
             if (!currentCar?.category) return []; // No category or car not found

             // 2. Fetch related cars in the same category (optimized payload)
             const { data: relatedCars, error: relatedError } = await supabase
                 .from("cars")
                 .select(`
                     id,
                     slug,
                     name,
                     category,
                     pricing:car_pricing(base_price),
                     images:car_images(url, is_primary, sort_order)
                 `)
                 .eq("category", currentCar.category)
                 .neq("id", carId) // Exclude the current car
                 .eq("available", true)
                 .eq("hidden", false)
                 .limit(limit);

             if (relatedError) {
                 console.error("Error fetching related car details:", relatedError);
                 throw relatedError; // Re-throw specific error
             } 
             if (!relatedCars) return [];

             // Process data (similar to list views)
             return relatedCars.map((car: any) => {
                 const primaryImage = car.images?.sort((a:any,b:any) => (a.sort_order ?? 0) - (b.sort_order ?? 0)).find((img: any) => img.is_primary) || car.images?.[0];
                  const price = car.pricing?.[0]?.base_price ?? car.pricing?.base_price;
                  return {
                     id: car.id,
                     slug: car.slug,
                     name: car.name,
                     category: car.category,
                     primaryImageUrl: primaryImage?.url,
                     pricePerDay: price
                 };
             });

         } catch (error) {
             console.error("Error fetching related cars:", error);
             if (error instanceof Error) {
                 throw new Error(handleSupabaseError(error));
             }
             throw new Error("An unexpected error occurred fetching related cars");
         }
     },

}

// Helper function to generate slug (can be moved to utils)
function generateSlug(name: string): string {
    return name
        .toLowerCase()
        .replace(/\s+/g, '-')       // Replace spaces with -
        .replace(/[^\w-]+/g, '')    // Remove all non-word chars except -
        .replace(/--+/g, '-')       // Replace multiple - with single -
        .replace(/^-+/, '')          // Trim - from start of text
        .replace(/-+$/, '');         // Trim - from end of text
}

// Note: Assumed BUCKET_NAMES.VEHICLE_IMAGES exists and is correctly configured.
// Note: Assumed database types (`Database['public']['Tables']...`) are generated and accurate.
//       Run `npx supabase gen types typescript --project-id <your-project-id> --schema public > lib/types/database.types.ts` if needed.
// Note: Transactional integrity is NOT guaranteed by these separate calls. Use Supabase Edge Functions (RPC with pg_transaction) for atomic operations in production.

