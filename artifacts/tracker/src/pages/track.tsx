import { useEffect, useState } from "react";
import { useParams, Link } from "wouter";
import { 
  useGetPackage, 
  useGetPackageRoute, 
  useGetPackageViewers, 
  useGetPackageHistory,
} from "@workspace/api-client-react";
import { TrackingMap } from "@/components/TrackingMap";
import { MapModal } from "@/components/MapModal";
import { Card, CardContent } from "@/components/ui/card";
import { Eye, ArrowLeft, Package as PackageIcon, MapPin, Activity, Map } from "lucide-react";

export default function Track() {
  const { trackingId } = useParams<{ trackingId: string }>();

  // Queries
  const [usePolling, setUsePolling] = useState(false);

  const { data: pkgData, isLoading: isLoadingPkg } = useGetPackage(trackingId, {
    query: { refetchInterval: usePolling ? 2000 : 30000 }
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
  const [showMapModal, setShowMapModal] = useState(false);

  // Sync initial data
  useEffect(() => { if (pkgData) setLivePkg(prev => ({ ...pkgData, ...prev })); }, [pkgData]);
  useEffect(() => { if (viewersData) setLiveViewers(viewersData.viewers); }, [viewersData]);
  useEffect(() => { if (historyData) setLiveHistory(historyData); }, [historyData]);

  // SSE Connection (local dev); fall back to polling on Netlify/serverless
  useEffect(() => {
    if (!trackingId) return;
    
    const es = new EventSource(`/api/packages/${trackingId}/stream`);

    es.onerror = () => {
      es.close();
      setUsePolling(true);
    };
    
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
        <div className="absolute top-2 sm:top-4 left-2 sm:left-4 right-2 sm:right-4 flex justify-between items-start z-10 pointer-events-none gap-2">
          <Link href="/" className="pointer-events-auto bg-card/80 backdrop-blur-md hover:bg-card border border-primary/20 text-foreground px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-md flex items-center gap-1.5 sm:gap-2 transition-colors font-bold uppercase text-xs sm:text-sm shrink-0">
            <ArrowLeft className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> <span className="hidden xs:inline">Back to Ops</span>
          </Link>
          
          {/* Live Viewers Badge */}
          <div className={`pointer-events-auto bg-card/80 backdrop-blur-md border ${pulseViewers ? 'border-primary shadow-[0_0_15px_rgba(var(--primary),0.5)]' : 'border-primary/30'} text-primary px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-full flex items-center gap-1.5 sm:gap-2 transition-all duration-300 font-bold text-xs sm:text-sm shrink-0`}>
            <Eye className="w-3.5 h-3.5 sm:w-4 sm:h-4 animate-pulse" />
            <span>{liveViewers} WATCHING</span>
          </div>
        </div>

        {/* Status Overlay Overlay */}
        <div className="absolute bottom-2 sm:bottom-4 left-2 sm:left-4 right-2 sm:right-4 md:right-auto md:w-96 z-10 pointer-events-none">
          <Card className="bg-card/90 backdrop-blur-xl border-primary/30 shadow-2xl pointer-events-auto">
            <CardContent className="p-3 sm:p-4 space-y-3 sm:space-y-4">
              <div className="flex justify-between items-center">
                <div className="text-muted-foreground text-[10px] sm:text-xs uppercase tracking-wider">Tracking ID</div>
                <div className="text-primary text-[10px] sm:text-xs uppercase tracking-wider font-bold">Signal Active</div>
              </div>
              <div className="text-lg sm:text-2xl font-bold text-foreground break-all">{livePkg.trackingId}</div>
              
              <div className="space-y-2">
                <div className="flex justify-between text-[10px] sm:text-xs text-muted-foreground uppercase gap-2">
                  <span className="truncate">{livePkg.origin}</span>
                  <span className="truncate text-right">{livePkg.destination}</span>
                </div>
                <div className="h-1.5 sm:h-2 w-full bg-secondary rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-primary transition-all duration-1000 ease-out" 
                    style={{ width: `${livePkg.progressPct}%` }}
                  />
                </div>
                <div className="flex justify-between text-[10px] sm:text-xs font-bold">
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
        
        <div className="p-4 sm:p-6 border-b border-primary/10 bg-background/50">
          <div className="flex items-center gap-2 sm:gap-3 mb-4 sm:mb-6">
            <div className="p-1.5 sm:p-2 bg-primary/10 rounded-md border border-primary/20 shrink-0">
              <PackageIcon className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-base sm:text-lg font-bold uppercase tracking-tight">Cargo Details</h2>
              <p className="text-[10px] sm:text-xs text-muted-foreground uppercase truncate">{livePkg.carrier}</p>
            </div>
            <button
              onClick={() => setShowMapModal(true)}
              className="flex items-center gap-1.5 sm:gap-2 bg-primary/10 hover:bg-primary/20 border border-primary/40 hover:border-primary text-primary px-2 sm:px-3 py-1.5 sm:py-2 rounded-md text-[10px] sm:text-xs font-bold uppercase tracking-wider transition-all duration-200 shrink-0 group"
            >
              <Map className="w-3 h-3 sm:w-3.5 sm:h-3.5 group-hover:scale-110 transition-transform" />
              <span className="hidden xs:inline">Live Map</span>
              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:gap-4">
            <div className="space-y-1">
              <div className="text-[10px] sm:text-xs text-muted-foreground uppercase">Est. Delivery</div>
              <div className="text-xs sm:text-sm font-bold">{new Date(livePkg.estimatedDelivery).toLocaleDateString()}</div>
            </div>
            <div className="space-y-1">
              <div className="text-[10px] sm:text-xs text-muted-foreground uppercase">Weight</div>
              <div className="text-xs sm:text-sm font-bold">{livePkg.weightLbs} LBS</div>
            </div>
            <div className="space-y-1">
              <div className="text-[10px] sm:text-xs text-muted-foreground uppercase">Signature</div>
              <div className="text-xs sm:text-sm font-bold">{livePkg.signatureRequired ? 'REQUIRED' : 'NOT REQUIRED'}</div>
            </div>
            <div className="space-y-1">
              <div className="text-[10px] sm:text-xs text-muted-foreground uppercase">Current Loc</div>
              <div className="text-xs sm:text-sm font-bold text-primary truncate" title={livePkg.currentLocationName}>
                {livePkg.currentLocationName || 'IN TRANSIT'}
              </div>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-card">
          <h3 className="text-xs sm:text-sm font-bold text-muted-foreground uppercase mb-4 sm:mb-6 tracking-widest flex items-center gap-2">
            <Activity className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> Telemetry Log
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

      {/* Full-screen Live Map Modal */}
      {showMapModal && livePkg && (
        <MapModal
          trackingId={livePkg.trackingId}
          currentLat={livePkg.currentLat}
          currentLng={livePkg.currentLng}
          locationName={livePkg.currentLocationName || "In Transit"}
          progressPct={livePkg.progressPct}
          route={routeData}
          onClose={() => setShowMapModal(false)}
        />
      )}
    </div>
  );
}
