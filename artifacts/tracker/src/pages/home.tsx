import { useState } from "react";
import { useLocation } from "wouter";
import { useListPackages } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Search, Package as PackageIcon, Activity, MapPin, Clock, Eye, Layers, Crosshair, Navigation, Radio } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

export default function Home() {
  const [, setLocation] = useLocation();
  const [searchId, setSearchId] = useState("");
  const { data: packages, isLoading } = useListPackages();

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchId.trim()) {
      setLocation(`/track/${searchId.trim()}`);
    }
  };

  return (
    <div className="min-h-[100dvh] w-full bg-background flex flex-col items-center p-6 sm:p-12 font-mono">
      <div className="w-full max-w-4xl flex flex-col gap-12 mt-12 sm:mt-24">
        
        {/* Header */}
        <div className="flex flex-col items-center text-center space-y-4">
          <div className="flex items-center gap-3 text-primary mb-4">
            <Activity className="w-10 h-10 animate-pulse" />
            <h1 className="text-4xl font-bold tracking-tight uppercase">LIVETRACK<span className="text-foreground">_OPS</span></h1>
          </div>
          <p className="text-muted-foreground text-lg max-w-lg font-sans">
            Real-time global logistics monitoring. Enter a tracking identifier to access live telemetry.
          </p>
        </div>

        {/* Search */}
        <Card className="border-primary/20 bg-card/50 backdrop-blur-sm overflow-hidden">
          <CardContent className="p-2">
            <form onSubmit={handleSearch} className="flex gap-2 relative">
              <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
                <Search className="h-5 w-5 text-muted-foreground" />
              </div>
              <Input
                type="text"
                placeholder="ENTER TRACKING ID..."
                className="pl-12 py-6 text-lg bg-background/50 border-primary/20 focus-visible:ring-primary uppercase font-mono h-16 rounded-md"
                value={searchId}
                onChange={(e) => setSearchId(e.target.value)}
                data-testid="input-search"
              />
              <Button type="submit" size="lg" className="h-16 px-8 text-lg font-bold" data-testid="button-search">
                TRACK
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Demo Packages List */}
        <div className="space-y-6 w-full max-w-2xl mx-auto">
          <div className="flex items-center justify-between border-b border-border pb-2">
            <h2 className="text-sm text-muted-foreground uppercase tracking-wider font-bold">Active Transmissions</h2>
            <div className="flex items-center gap-2">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-primary"></span>
              </span>
              <span className="text-xs text-primary font-bold">{packages?.length || 0} LIVE</span>
            </div>
          </div>

          <div className="grid gap-4">
            {isLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-24 w-full bg-card rounded-lg" />
              ))
            ) : packages?.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">No active packages found.</div>
            ) : (
              packages?.map((pkg) => (
                <Card 
                  key={pkg.trackingId} 
                  className="group cursor-pointer hover:border-primary/50 transition-colors bg-card hover:bg-card/80"
                  onClick={() => setLocation(`/track/${pkg.trackingId}`)}
                  data-testid={`card-package-${pkg.trackingId}`}
                >
                  <CardContent className="p-4 sm:p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div className="flex items-start gap-4">
                      <div className="bg-primary/10 p-3 rounded-md mt-1 group-hover:bg-primary/20 transition-colors">
                        <PackageIcon className="w-6 h-6 text-primary" />
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-lg font-bold">{pkg.trackingId}</span>
                          <span className="text-xs px-2 py-0.5 rounded-full bg-accent/20 text-accent font-bold uppercase border border-accent/20">
                            {pkg.status}
                          </span>
                        </div>
                        <div className="flex items-center gap-4 text-sm text-muted-foreground">
                          <div className="flex items-center gap-1">
                            <MapPin className="w-3 h-3" />
                            <span>{pkg.origin}</span>
                            <span className="mx-1">→</span>
                            <span>{pkg.destination}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <Clock className="w-4 h-4 text-muted-foreground" />
                      <span>{new Date(pkg.estimatedDelivery).toLocaleDateString()}</span>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
