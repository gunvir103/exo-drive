import Image from "next/image"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Award, Car, CheckCircle, MapPin, Shield, Star, Users } from "lucide-react"

export default function AboutPage() {
  return (
    <div className="container py-10">
      <section className="mb-16">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
          <div>
            <h1 className="text-4xl font-bold mb-4">About exoDrive</h1>
            <p className="text-lg text-muted-foreground mb-6">
              Bringing luxury and exotic car experiences to the DMV area
            </p>
            <p className="mb-4">
              At exoDrive, we believe that everyone deserves to experience the thrill and luxury of driving an exotic
              car. Our mission is to make these extraordinary vehicles accessible to enthusiasts and those seeking a
              special experience in the Washington DC, Maryland, and Virginia area.
            </p>
            <p className="mb-6">
            Founded by Brendon Pham, exoDrive operates through a strategic partnership with a network of experienced investors. 
            This collaboration enables us to maintain a diverse fleet of luxury vehicles while ensuring efficient distribution 
            across the DMV area. Our innovative business model combines local expertise with investor resources to deliver convenient 
            access to exotic cars, making premium automotive experiences more accessible to our community.
            </p>
            <Button asChild>
              <Link href="/fleet">Explore Our Fleet</Link>
            </Button>
          </div>
          <div className="space-y-4">
            <div className="relative h-[400px] w-full rounded-lg overflow-hidden">
              <Image 
                src="https://instagram.fagc1-2.fna.fbcdn.net/v/t51.29350-15/402144109_1775700636181511_2072409935470541041_n.jpg?stp=dst-jpg_e35_tt6&efg=eyJ2ZW5jb2RlX3RhZyI6IkNBUk9VU0VMX0lURU0uaW1hZ2VfdXJsZ2VuLjE0NDB4MTgwMC5zZHIuZjI5MzUwLmRlZmF1bHRfaW1hZ2UifQ&_nc_ht=instagram.fagc1-2.fna.fbcdn.net&_nc_cat=111&_nc_oc=Q6cZ2QHqOQqjin2ht2kf_pPHRMZqgxpW98wd3EnanWZksfXqw682aUI72ViS1lqPworqgRU&_nc_ohc=_qX0SToNlKIQ7kNvwHJ1GyK&_nc_gid=S3Ydat4DKc6Bg9xa8QkdPg&edm=APoiHPcBAAAA&ccb=7-5&ig_cache_key=MzIzNzE0NjA1Njk2OTY3NzQ1Mg%3D%3D.3-ccb7-5&oh=00_AfN2VXN0L3H36O-15sReokLZUgJ6ivjrLvzySyv38-j38w&oe=68540CCB&_nc_sid=22de04" 
                alt="Brendon Pham" 
                fill 
                className="object-cover object-[50%_55%]" 
              />
            </div>
            <div className="text-center">
              <h3 className="text-xl font-bold">Brendon Pham</h3>
              <p className="text-primary font-medium">Founder & CEO</p>
            </div>
          </div>
        </div>
      </section>

      <section className="mb-16">
        <div className="text-center mb-10">
          <h2 className="text-3xl font-bold mb-4">Why Choose exoDrive</h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            We're committed to providing an exceptional experience from start to finish.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {[
            {
              icon: Car,
              title: "Premium Fleet",
              description:
                "Our collection features the latest models from top luxury and exotic car manufacturers, meticulously maintained to ensure peak performance.",
            },
            {
              icon: Shield,
              title: "Seamless Experience",
              description:
                "From booking to return, we've streamlined the process to make your exotic car rental experience as smooth and enjoyable as possible.",
            },
            {
              icon: CheckCircle,
              title: "Personalized Service",
              description:
                "We are fully dedicated to providing personalized service tailored to your specific needs and preferences.",
            },
          ].map((feature, i) => (
            <Card key={i}>
              <CardContent className="p-6 text-center">
                <div className="flex justify-center mb-4">
                  <div className="p-3 rounded-full bg-primary/10">
                    <feature.icon className="h-8 w-8 text-primary" />
                  </div>
                </div>
                <h3 className="text-xl font-bold mb-2">{feature.title}</h3>
                <p className="text-muted-foreground">{feature.description}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section>
        <div className="text-center py-16 bg-primary-foreground text-primary rounded-lg">
          <h2 className="text-3xl font-bold mb-4">Have a Question?</h2>
          <p className="text-xl mb-8 max-w-2xl mx-auto">
            Feel free to reach out with any inquiries.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <Button size="lg" variant="outline" className="bg-primary/10" asChild>
              <Link href="/contact">Contact Us</Link>
            </Button>
          </div>
        </div>
      </section>
    </div>
  )
}

