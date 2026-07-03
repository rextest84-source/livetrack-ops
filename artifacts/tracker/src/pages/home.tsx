import { useState } from "react";
import { useLocation } from "wouter";
import { useListPackages } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Search, Package as PackageIcon, Activity, MapPin, Clock } from "lucide-react";
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
    <div className="min-h-[100dvh] w-full bg-background flex flex-col items-center p-4 sm:p-12 font-mono">
      <div className="w-full max-w-4xl flex flex-col gap-8 sm:gap-12 mt-8 sm:mt-24">
        
        {/* Header */}
        <div className="flex flex-col items-center text-center space-y-3 sm:space-y-4">
          <div className="flex items-center gap-2 sm:gap-3 text-primary mb-2 sm:mb-4">
            <Activity className="w-6 h-6 sm:w-10 sm:h-10 animate-pulse shrink-0" />
            <h1 className="text-xl sm:text-4xl font-bold tracking-tight uppercase whitespace-nowrap">LIVETRACK<span className="text-foreground">_OPS</span></h1>
          </div>
          <p className="text-muted-foreground text-sm sm:text-lg max-w-lg font-sans px-2">
            Real-time global logistics monitoring. Enter a tracking identifier to access live telemetry.
          </p>
        </div>

        {/* Search */}
        <Card className="border-primary/20 bg-card/50 backdrop-blur-sm overflow-hidden">
          <CardContent className="p-2">
            <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-2 relative">
              <div className="relative flex-1">
                <div className="absolute inset-y-0 left-3 sm:left-4 flex items-center pointer-events-none">
                  <Search className="h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground" />
                </div>
                <Input
                  type="text"
                  placeholder="ENTER TRACKING ID..."
                  className="pl-10 sm:pl-12 py-4 sm:py-6 text-sm sm:text-lg bg-background/50 border-primary/20 focus-visible:ring-primary uppercase font-mono h-12 sm:h-16 rounded-md w-full"
                  value={searchId}
                  onChange={(e) => setSearchId(e.target.value)}
                  data-testid="input-search"
                />
              </div>
              <Button type="submit" size="lg" className="h-12 sm:h-16 px-6 sm:px-8 text-sm sm:text-lg font-bold shrink-0" data-testid="button-search">
                TRACK
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Demo Packages List */}
        <div className="space-y-4 sm:space-y-6 w-full max-w-2xl mx-auto">
          <div className="flex items-center justify-between border-b border-border pb-2">
            <h2 className="text-xs sm:text-sm text-muted-foreground uppercase tracking-wider font-bold">Active Transmissions</h2>
            <div className="flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5 sm:h-3 sm:w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 sm:h-3 sm:w-3 bg-primary"></span>
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
                  <CardContent className="p-3 sm:p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4">
                    <div className="flex items-start gap-3 sm:gap-4 min-w-0">
                      <div className="bg-primary/10 p-2 sm:p-3 rounded-md mt-1 group-hover:bg-primary/20 transition-colors shrink-0">
                        <PackageIcon className="w-5 h-5 sm:w-6 sm:h-6 text-primary" />
                      </div>
                      <div className="space-y-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm sm:text-lg font-bold break-all">{pkg.trackingId}</span>
                          <span className="text-[10px] sm:text-xs px-2 py-0.5 rounded-full bg-accent/20 text-accent font-bold uppercase border border-accent/20 shrink-0">
                            {pkg.status}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-1 text-xs sm:text-sm text-muted-foreground">
                          <div className="flex items-center gap-1 flex-wrap">
                            <MapPin className="w-3 h-3 shrink-0" />
                            <span>{pkg.origin}</span>
                            <span className="mx-1">→</span>
                            <span>{pkg.destination}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-xs sm:text-sm shrink-0">
                      <Clock className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-muted-foreground" />
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
