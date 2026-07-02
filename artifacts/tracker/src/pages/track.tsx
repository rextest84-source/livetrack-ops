import { useEffect, useState, useRef } from "react";
import { useParams, Link } from "wouter";
import { 
  useGetPackage, 
  useGetPackageRoute, 
  useGetPackageViewers, 
  useGetPackageHistory,
  getPackageQueryKey,
  getPackageViewersQueryKey,
  getPackageHistoryQueryKey,
} from "@workspace/api-client-react";
import { TrackingMap } from "@/components/TrackingMap";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Eye, ArrowLeft, Package as PackageIcon, MapPin, Activity, CheckCircle2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { TrackingEvent } from "@workspace/api-zod/src/generated/types"; // Fallback type if needed or just use any

export default function Track() {
  const { trackingId } = useParams<{ trackingId: string }>();
  const queryClient = useQueryClient();

  // Queries
  const { data: pkgData, isLoading: isLoadingPkg } = useGetPackage(trackingId, {
    query: { refetchInterval: 30000 }
  });
  
  const { data: routeData } = useGetPackageRoute(trackingId);
  
  const { data: viewersData } = useGetPackageViewers(trackingId, {
    query: { refetchInterval: 5000 }
  });
  
  const { data: historyData } = useGetPackageHistory(trackingId);

  // Local state for SSE overrides
  const [livePkg, setLivePkg] = useState(pkgData);
  const [liveViewers, setLiveViewers] = useState(viewersData?.viewers || 0);
  const [liveHistory, setLiveHistory] = useState<any[]>(historyData || []);
  const [pulseViewers, setPulseViewers] = useState(false);

  // Sync initial data
  useEffect(() => { if (pkgData) setLivePkg(prev => ({ ...pkgData, ...prev })); }, [pkgData]);
  useEffect(() => { if (viewersData) setLiveViewers(viewersData.viewers); }, [viewersData]);
  useEffect(() => { if (historyData) setLiveHistory(historyData); }, [historyData]);

  // SSE Connection
  useEffect(() => {
    if (!trackingId) return;
    
    const es = new EventSource(`/api/packages/${trackingId}/stream`);
    
    es.addEventListener('location', (e) => { 
      const { lat, lng, progressPct, currentLocationName } = JSON.parse(e.data);
      setLivePkg(prev => prev ? { 
        ...prev, 
        currentLat: lat, 
        currentLng: lng, 
        progressPct, 
        currentLocationName 
      } : prev);
    });
    
    es.addEventListener('viewers', (e) => { 
      const { viewers } = JSON.parse(e.data);
      setLiveViewers(viewers);
      setPulseViewers(true);
      setTimeout(() => setPulseViewers(false), 1000);
    });
    
    es.addEventListener('status', (e) => { 
      const { status } = JSON.parse(e.data);
      setLivePkg(prev => prev ? { ...prev, status } : prev);
    });
    
    es.addEventListener('event', (e) => { 
      const event = JSON.parse(e.data);
      setLiveHistory(prev => [event, ...prev]);
    });

    return () => {
      es.close();
    };
  }, [trackingId]);

  if (isLoadingPkg && !livePkg) {
    return <div className="min-h-[100dvh] flex items-center justify-center bg-background"><Activity className="w-8 h-8 text-primary animate-spin" /></div>;
  }

  if (!livePkg) {
    return <div className="min-h-[100dvh] flex items-center justify-center text-destructive">Package not found.</div>;
  }

  return (
    <div className="min-h-[100dvh] w-full flex flex-col md:flex-row bg-background font-mono overflow-hidden">
      
      {/* Map Area (Left) */}
      <div className="relative flex-1 min-h-[50dvh] md:min-h-screen z-0">
        <TrackingMap 
          currentLat={livePkg.currentLat} 
          currentLng={livePkg.currentLng} 
          route={routeData} 
        />
        
        {/* Top Bar Overlay */}
        <div className="absolute top-4 left-4 right-4 flex justify-between items-start z-10 pointer-events-none">
          <Link href="/" className="pointer-events-auto bg-card/80 backdrop-blur-md hover:bg-card border border-primary/20 text-foreground px-4 py-2 rounded-md flex items-center gap-2 transition-colors font-bold uppercase text-sm">
            <ArrowLeft className="w-4 h-4" /> Back to Ops
          </Link>
          
          {/* Live Viewers Badge */}
          <div className={`pointer-events-auto bg-card/80 backdrop-blur-md border ${pulseViewers ? 'border-primary shadow-[0_0_15px_rgba(var(--primary),0.5)]' : 'border-primary/30'} text-primary px-4 py-2 rounded-full flex items-center gap-2 transition-all duration-300 font-bold text-sm`}>
            <Eye className="w-4 h-4 animate-pulse" />
            <span>{liveViewers} WATCHING</span>
          </div>
        </div>

        {/* Status Overlay Overlay */}
        <div className="absolute bottom-4 left-4 right-4 md:right-auto md:w-96 z-10 pointer-events-none">
          <Card className="bg-card/90 backdrop-blur-xl border-primary/30 shadow-2xl pointer-events-auto">
            <CardContent className="p-4 space-y-4">
              <div className="flex justify-between items-center">
                <div className="text-muted-foreground text-xs uppercase tracking-wider">Tracking ID</div>
                <div className="text-primary text-xs uppercase tracking-wider font-bold">Signal Active</div>
              </div>
              <div className="text-2xl font-bold text-foreground">{livePkg.trackingId}</div>
              
              <div className="space-y-2">
                <div className="flex justify-between text-xs text-muted-foreground uppercase">
                  <span>{livePkg.origin}</span>
                  <span>{livePkg.destination}</span>
                </div>
                <div className="h-2 w-full bg-secondary rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-primary transition-all duration-1000 ease-out" 
                    style={{ width: `${livePkg.progressPct}%` }}
                  />
                </div>
                <div className="flex justify-between text-xs font-bold">
                  <span className="text-primary">{Math.round(livePkg.progressPct)}%</span>
                  <span className="text-muted-foreground">{livePkg.status}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Sidebar Area (Right) */}
      <div className="w-full md:w-[400px] lg:w-[450px] bg-card border-l border-primary/20 flex flex-col h-[50dvh] md:h-screen z-10 shadow-2xl">
        
        <div className="p-6 border-b border-primary/10 bg-background/50">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-primary/10 rounded-md border border-primary/20">
              <PackageIcon className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-bold uppercase tracking-tight">Cargo Details</h2>
              <p className="text-xs text-muted-foreground uppercase">{livePkg.carrier}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground uppercase">Est. Delivery</div>
              <div className="text-sm font-bold">{new Date(livePkg.estimatedDelivery).toLocaleDateString()}</div>
            </div>
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground uppercase">Weight</div>
              <div className="text-sm font-bold">{livePkg.weightLbs} LBS</div>
            </div>
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground uppercase">Signature</div>
              <div className="text-sm font-bold">{livePkg.signatureRequired ? 'REQUIRED' : 'NOT REQUIRED'}</div>
            </div>
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground uppercase">Current Loc</div>
              <div className="text-sm font-bold text-primary truncate" title={livePkg.currentLocationName}>
                {livePkg.currentLocationName || 'IN TRANSIT'}
              </div>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 bg-card">
          <h3 className="text-sm font-bold text-muted-foreground uppercase mb-6 tracking-widest flex items-center gap-2">
            <Activity className="w-4 h-4" /> Telemetry Log
          </h3>
          
          <div className="relative border-l-2 border-primary/20 ml-3 space-y-8">
            {liveHistory.map((event, i) => (
              <div key={event.id} className="relative pl-6 animate-in slide-in-from-top-4 fade-in duration-500">
                <div className={`absolute -left-[9px] top-1 w-4 h-4 rounded-full border-2 border-card ${i === 0 ? 'bg-primary animate-pulse' : 'bg-secondary'}`} />
                <div className="space-y-1">
                  <div className="text-xs text-muted-foreground uppercase font-bold flex justify-between">
                    <span>{event.location}</span>
                    <span>{new Date(event.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                  </div>
                  <div className={`text-sm ${i === 0 ? 'text-foreground font-bold' : 'text-muted-foreground'}`}>
                    {event.message}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
        
      </div>
    </div>
  );
}
