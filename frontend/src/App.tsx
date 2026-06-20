import { ArrowUpDown, Fuel, Layers, MapPin, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { StationMap, type SearchPin } from "./StationMap";
import { fetchSamsaraTest, fetchStations, fetchTrucks, syncSamsara } from "./api";
import type { SamsaraTestResult, Station, Truck } from "./types";

type TruckFilter = "any" | "assigned" | "not_assigned" | "active" | "inactive";
type MapStyle = "black" | "terrain";
type SearchMode = "nearby" | "route";
type StationSort = "nearest" | "cheapest";

type GeoPoint = {
  label: string;
  latitude: number;
  longitude: number;
};

type MapSearchResult =
  | {
      mode: "nearby";
      center: GeoPoint;
      radiusMiles: number;
    }
  | {
      mode: "route";
      from: GeoPoint;
      to: GeoPoint;
      routePath: [number, number][];
      offRouteMiles: number;
    };

const DISPATCH_STORAGE_KEY = "emafuel-dispatch-assignments";

export function App() {
  const [stations, setStations] = useState<Station[]>([]);
  const [trucks, setTrucks] = useState<Truck[]>([]);
  const [selectedTruck, setSelectedTruck] = useState<Truck | null>(null);
  const [selectedStation, setSelectedStation] = useState<Station | null>(null);
  const [searchMode, setSearchMode] = useState<SearchMode>("nearby");
  const [nearbyLocation, setNearbyLocation] = useState("");
  const [nearbyMiles, setNearbyMiles] = useState("25");
  const [routeFrom, setRouteFrom] = useState("");
  const [routeTo, setRouteTo] = useState("");
  const [offRouteMiles, setOffRouteMiles] = useState("5");
  const [mapSearchResult, setMapSearchResult] = useState<MapSearchResult | null>(null);
  const [mapSearchError, setMapSearchError] = useState("");
  const [mapSearchBusy, setMapSearchBusy] = useState(false);
  const [stationSort, setStationSort] = useState<StationSort>("nearest");
  const [dispatchAssignments, setDispatchAssignments] = useState<Record<number, number>>(() => loadDispatchAssignments());
  const [dispatchRoutePath, setDispatchRoutePath] = useState<[number, number][]>([]);
  const [unitSearch, setUnitSearch] = useState("");
  const [fuelPercentCap, setFuelPercentCap] = useState("60");
  const [truckFilter, setTruckFilter] = useState<TruckFilter>("any");
  const [fuelSortDirection, setFuelSortDirection] = useState<"asc" | "desc">("asc");
  const [showMapTrucks, setShowMapTrucks] = useState(true);
  const [showMapLocations, setShowMapLocations] = useState(true);
  const [mapStyle, setMapStyle] = useState<MapStyle>("black");
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(true);
  const [samsaraStatus, setSamsaraStatus] = useState<SamsaraTestResult | null>(null);

  useEffect(() => {
    Promise.all([fetchStations(), fetchTrucks(), fetchSamsaraTest()])
      .then(async ([stationItems, truckItems, samsara]) => {
        let latestTrucks = truckItems;
        let latestSamsara = samsara;
        if (samsara.api_token_configured) {
          try {
            await syncSamsara();
            latestTrucks = await fetchTrucks();
            latestSamsara = await fetchSamsaraTest();
          } catch (error) {
            latestSamsara = {
              ...samsara,
              connection_status: "failed",
              latest_error: error instanceof Error ? error.message : "Samsara sync failed",
            };
          }
        }
        setStations(stationItems);
        setTrucks(latestTrucks);
        setSamsaraStatus(latestSamsara);
        setSelectedTruck(latestTrucks[0] ?? null);
      })
      .catch((error) => setLoadError(error instanceof Error ? error.message : "Unable to load dashboard data"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    window.localStorage.setItem(DISPATCH_STORAGE_KEY, JSON.stringify(dispatchAssignments));
  }, [dispatchAssignments]);

  const filteredTrucks = useMemo(() => {
    const needle = unitSearch.trim().toLowerCase();
    return trucks
      .filter((truck) => filterTruck(truck, fuelPercentCap, truckFilter))
      .filter((truck) => {
        if (!needle) return true;
        return [truck.unit_number, truck.driver?.name].filter(Boolean).join(" ").toLowerCase().includes(needle);
      })
      .sort((a, b) => {
        const diff = (a.fuel_percent ?? 999) - (b.fuel_percent ?? 999);
        return fuelSortDirection === "asc" ? diff : -diff;
      });
  }, [trucks, fuelPercentCap, truckFilter, fuelSortDirection, unitSearch]);

  const visibleStations = useMemo(() => {
    if (!mapSearchResult) return stations;
    if (mapSearchResult.mode === "nearby") {
      return stations.filter(
        (station) => distanceMiles(mapSearchResult.center, station) <= mapSearchResult.radiusMiles
      );
    }
    return stations.filter(
      (station) => distanceToPathMiles(station, mapSearchResult.routePath) <= mapSearchResult.offRouteMiles
    );
  }, [stations, mapSearchResult]);

  const stationSortOrigin = useMemo(() => {
    if (mapSearchResult?.mode === "nearby") return mapSearchResult.center;
    if (mapSearchResult?.mode === "route") return mapSearchResult.from;
    if (selectedTruck?.latitude != null && selectedTruck.longitude != null) return pointFromTruck(selectedTruck);
    return null;
  }, [mapSearchResult, selectedTruck]);

  const stationResults = useMemo(() => {
    return [...visibleStations].sort((a, b) => {
      if (stationSort === "cheapest") return stationPrice(a) - stationPrice(b);
      if (!stationSortOrigin) return stationPrice(a) - stationPrice(b);
      return distanceMiles(stationSortOrigin, a) - distanceMiles(stationSortOrigin, b);
    });
  }, [visibleStations, stationSort, stationSortOrigin]);

  useEffect(() => {
    if (stationSort === "nearest" && !stationSortOrigin) setStationSort("cheapest");
  }, [stationSort, stationSortOrigin]);

  const selectedDispatchStation = useMemo(() => {
    if (!selectedTruck) return null;
    const stationId = dispatchAssignments[selectedTruck.id];
    return stations.find((station) => station.id === stationId) ?? null;
  }, [dispatchAssignments, selectedTruck, stations]);

  const recommendedStation = useMemo(() => {
    if (selectedStation) return selectedStation;
    if (selectedDispatchStation) return selectedDispatchStation;
    if (!selectedTruck || selectedTruck.latitude == null || selectedTruck.longitude == null) return visibleStations[0] ?? null;
    return nearestStation(selectedTruck, visibleStations);
  }, [selectedDispatchStation, selectedStation, selectedTruck, visibleStations]);

  useEffect(() => {
    let cancelled = false;
    async function loadDispatchRoute() {
      if (!selectedTruck || !selectedDispatchStation || selectedTruck.latitude == null || selectedTruck.longitude == null) {
        setDispatchRoutePath([]);
        return;
      }
      const route = await fetchRoutePath(pointFromTruck(selectedTruck), {
        label: selectedDispatchStation.station_name,
        latitude: selectedDispatchStation.latitude,
        longitude: selectedDispatchStation.longitude,
      });
      if (!cancelled) setDispatchRoutePath(route);
    }
    void loadDispatchRoute();
    return () => {
      cancelled = true;
    };
  }, [selectedDispatchStation, selectedTruck]);

  const searchPins = useMemo<SearchPin[]>(() => {
    if (!mapSearchResult) return [];
    if (mapSearchResult.mode === "nearby") {
      return [
        {
          id: "nearby",
          label: mapSearchResult.center.label,
          latitude: mapSearchResult.center.latitude,
          longitude: mapSearchResult.center.longitude,
          tone: "from",
        },
      ];
    }
    return [
      {
        id: "from",
        label: mapSearchResult.from.label,
        latitude: mapSearchResult.from.latitude,
        longitude: mapSearchResult.from.longitude,
        tone: "from",
      },
      {
        id: "to",
        label: mapSearchResult.to.label,
        latitude: mapSearchResult.to.latitude,
        longitude: mapSearchResult.to.longitude,
        tone: "to",
      },
    ];
  }, [mapSearchResult]);

  const routePath = mapSearchResult?.mode === "route" ? mapSearchResult.routePath : [];
  const searchRadius =
    mapSearchResult?.mode === "nearby"
      ? {
          center: [mapSearchResult.center.latitude, mapSearchResult.center.longitude] as [number, number],
          miles: mapSearchResult.radiusMiles,
        }
      : null;

  const lowFuelCount = trucks.filter((truck) => (truck.fuel_percent ?? 101) < 50).length;
  const criticalFuelCount = trucks.filter((truck) => (truck.fuel_percent ?? 101) < 40).length;

  async function runMapSearch() {
    setMapSearchBusy(true);
    setMapSearchError("");
    try {
      if (searchMode === "nearby") {
        const radiusMiles = normalizeMiles(nearbyMiles, 25);
        const center = selectedTruck ? pointFromTruck(selectedTruck) : await geocodeLocation(nearbyLocation);
        setSelectedStation(null);
        setMapSearchResult({ mode: "nearby", center, radiusMiles });
        return;
      }
      const from = selectedTruck ? pointFromTruck(selectedTruck) : await geocodeLocation(routeFrom);
      const to = await geocodeLocation(routeTo);
      const routePath = await fetchRoutePath(from, to);
      setSelectedStation(null);
      setMapSearchResult({
        mode: "route",
        from,
        to,
        routePath,
        offRouteMiles: normalizeMiles(offRouteMiles, 5),
      });
    } catch (error) {
      setMapSearchError(error instanceof Error ? error.message : "Unable to complete map search.");
    } finally {
      setMapSearchBusy(false);
    }
  }

  return (
    <main className="app-shell h-screen overflow-hidden bg-[#0B1220] text-[#F9FAFB]">
      <header className="topbar flex h-[76px] items-center gap-4 border-b border-[#374151] bg-[#111827] px-5">
        <div className="brand-block flex min-w-[248px] items-center gap-3">
          <div className="brand-icon flex h-11 w-11 items-center justify-center rounded-lg bg-[#2563EB] text-white shadow-lg shadow-blue-950/40">
            <Fuel size={24} />
          </div>
          <div className="brand-copy">
            <h1 className="text-lg font-bold tracking-tight">Emafuel Dispatch</h1>
            <p className="text-xs font-medium text-[#D1D5DB]">Fleet fuel operations</p>
          </div>
        </div>

        <form
          className="route-search"
          onSubmit={(event) => {
            event.preventDefault();
            void runMapSearch();
          }}
        >
          <div className="search-mode-tabs">
            <button
              type="button"
              className={searchMode === "nearby" ? "is-active" : ""}
              onClick={() => setSearchMode("nearby")}
            >
              Search Nearby
            </button>
            <button
              type="button"
              className={searchMode === "route" ? "is-active" : ""}
              onClick={() => setSearchMode("route")}
            >
              Search Along Route
            </button>
          </div>

          {searchMode === "nearby" ? (
            <div className="search-input-grid search-input-grid-nearby">
              <label className="search-box route-field">
                <Search size={17} className="text-[#9CA3AF]" />
                <input
                  value={nearbyLocation}
                  onChange={(event) => setNearbyLocation(event.target.value)}
                  disabled={Boolean(selectedTruck)}
                  placeholder={selectedTruck ? `Using Unit ${selectedTruck.unit_number}` : "Location or coordinates"}
                />
              </label>
              <label className="distance-field">
                <span>Miles</span>
                <input
                  value={nearbyMiles}
                  onChange={(event) => setNearbyMiles(event.target.value)}
                  type="number"
                  min="1"
                  inputMode="numeric"
                />
              </label>
            </div>
          ) : (
            <div className="search-input-grid search-input-grid-route">
              <label className="search-box route-field">
                <Search size={17} className="text-[#9CA3AF]" />
                <input
                  value={routeFrom}
                  onChange={(event) => setRouteFrom(event.target.value)}
                  disabled={Boolean(selectedTruck)}
                  placeholder={selectedTruck ? `Using Unit ${selectedTruck.unit_number}` : "From"}
                />
              </label>
              <label className="search-box route-field">
                <Search size={17} className="text-[#9CA3AF]" />
                <input value={routeTo} onChange={(event) => setRouteTo(event.target.value)} placeholder="To" />
              </label>
              <label className="distance-field">
                <span>Off route</span>
                <input
                  value={offRouteMiles}
                  onChange={(event) => setOffRouteMiles(event.target.value)}
                  type="number"
                  min="1"
                  inputMode="numeric"
                />
              </label>
            </div>
          )}

          <button className="search-submit" type="submit" disabled={mapSearchBusy}>
            {mapSearchBusy ? "Searching" : "Go"}
          </button>
          <button
            className="search-clear"
            type="button"
            onClick={() => {
              setMapSearchResult(null);
              setMapSearchError("");
            }}
          >
            Clear
          </button>
          {mapSearchError ? <div className="search-error">{mapSearchError}</div> : null}
        </form>

        <div className="map-filter-tabs flex items-center gap-2">
          <span className="map-filter-label">
            <Layers size={15} />
            Map
          </span>
          <button
            className={showMapTrucks ? "is-active" : ""}
            onClick={() => setShowMapTrucks((current) => !current)}
          >
            Trucks
          </button>
          <button
            className={showMapLocations ? "is-active" : ""}
            onClick={() => setShowMapLocations((current) => !current)}
          >
            Stations
          </button>
          {(["black", "terrain"] as const).map((style) => (
            <button
              key={style}
              className={mapStyle === style ? "is-active" : ""}
              onClick={() => setMapStyle(style)}
            >
              {style === "black" ? "Black" : "Terrain"}
            </button>
          ))}
        </div>
      </header>

      <div className="workspace grid h-[calc(100vh-76px)] grid-cols-[20%_60%_20%]">
        <aside className="sidebar sidebar-left min-w-[280px] border-r border-[#374151] bg-[#111827]">
          <div className="metrics-strip border-b border-[#374151] p-4">
            <div className="metric-grid grid grid-cols-3 gap-2">
              <Metric label="Units" value={trucks.length.toString()} />
              <Metric label="Low" value={lowFuelCount.toString()} tone="yellow" />
              <Metric label="Critical" value={criticalFuelCount.toString()} tone="red" />
            </div>
          </div>

          <div className="unit-search-strip border-b border-[#374151]">
            <label className="unit-search-box">
              <Search size={16} />
              <input
                value={unitSearch}
                onChange={(event) => setUnitSearch(event.target.value)}
                placeholder="Search unit or driver"
              />
            </label>
            {unitSearch ? (
              <button className="unit-search-clear" onClick={() => setUnitSearch("")}>
                Clear
              </button>
            ) : null}
          </div>

          <div className="unit-filters border-b border-[#374151]">
            <label className="unit-filter-field">
              <span>Percent &gt;:</span>
              <input
                value={fuelPercentCap}
                onChange={(event) => setFuelPercentCap(event.target.value)}
                type="number"
                min="1"
                max="100"
                inputMode="numeric"
                placeholder="100"
              />
            </label>
            <label className="unit-filter-field">
              <span>Trucks</span>
              <select value={truckFilter} onChange={(event) => setTruckFilter(event.target.value as TruckFilter)}>
                <option value="any">Any</option>
                <option value="assigned">Assigned</option>
                <option value="not_assigned">Not assigned</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </label>
          </div>

          <div className="panel-heading flex items-center justify-between border-b border-[#374151] px-4 py-3">
            <div>
              <div className="text-sm font-bold">Units by Fuel</div>
              <div className="text-xs text-[#D1D5DB]">
                {fuelSortDirection === "asc" ? "Lowest fuel sorted first" : "Highest fuel sorted first"}
              </div>
            </div>
            <button
              className="reverse-button"
              onClick={() => setFuelSortDirection((direction) => (direction === "asc" ? "desc" : "asc"))}
            >
              <ArrowUpDown size={14} />
              Reverse
            </button>
          </div>

          <div className="truck-list h-[calc(100vh-221px)] overflow-auto p-3">
            {loadError ? <div className="error-card mb-3 rounded-lg border border-[#7F1D1D] bg-[#450A0A] p-3 text-sm">{loadError}</div> : null}
            {loading ? <div className="loading-card rounded-lg border border-[#374151] bg-[#1F2937] p-4 text-sm font-semibold">Loading live units...</div> : null}
            {filteredTrucks.length === 0 ? (
              <div className="empty-card rounded-lg border border-[#374151] bg-[#1F2937] p-4">
                <div className="text-sm font-bold text-[#F9FAFB]">No Samsara units loaded</div>
                <p className="mt-2 text-sm leading-5 text-[#D1D5DB]">
                  {samsaraStatus?.latest_error ??
                    "Configure SAMSARA_API_TOKEN in .env, run sync, and trucks will appear here sorted by fuel level."}
                </p>
                <div className="mt-3 rounded-md bg-[#0B1220] p-3 text-xs text-[#D1D5DB]">
                  Samsara: {samsaraStatus?.connection_status ?? "not checked"} · Vehicles: {samsaraStatus?.vehicle_count ?? 0}
                </div>
              </div>
            ) : (
              filteredTrucks.map((truck) => (
                <TruckCard
                  key={truck.id}
                  truck={truck}
                  dispatchedStation={stations.find((station) => station.id === dispatchAssignments[truck.id]) ?? null}
                  selected={selectedTruck?.id === truck.id}
                  onClick={() => {
                    setSelectedTruck((current) => (current?.id === truck.id ? null : truck));
                    setSelectedStation(null);
                    setMapSearchError("");
                  }}
                />
              ))
            )}
          </div>
        </aside>

        <section className="map-panel relative bg-[#0B1220]">
          <StationMap
            stations={visibleStations}
            trucks={trucks}
            selected={recommendedStation}
            focusedStation={selectedStation}
            selectedTruck={selectedTruck}
            showTrucks={showMapTrucks}
            showLocations={showMapLocations}
            mapStyle={mapStyle}
            searchPins={searchPins}
            routePath={routePath}
            dispatchRoutePath={dispatchRoutePath}
            searchRadius={searchRadius}
            onSelect={setSelectedStation}
          />
          <div className="map-legend absolute left-5 top-5 rounded-lg border border-[#374151] bg-[#111827]/95 px-4 py-3 shadow-2xl">
            <div className="flex items-center gap-2 text-sm font-bold">
              <MapPin size={17} className="text-[#22C55E]" />
              Live Dispatch Map
            </div>
            <p className="mt-1 text-xs font-medium text-[#D1D5DB]">
              Blue trucks · Green recommended · Gray stations
            </p>
          </div>
        </section>

        <aside className="sidebar details-panel min-w-[320px] border-l border-[#374151] bg-[#111827]">
          <div className="details-heading border-b border-[#374151] p-5">
            <div className="flex items-center gap-2 text-sm font-bold text-[#F9FAFB]">
              <MapPin size={18} className="text-[#22C55E]" />
              Station Results
            </div>
          </div>
          <StationResults
            stations={stationResults}
            selectedStation={recommendedStation}
            selectedTruck={selectedTruck}
            dispatchedStationId={selectedTruck ? dispatchAssignments[selectedTruck.id] : undefined}
            sortMode={stationSort}
            canSortNearest={Boolean(stationSortOrigin)}
            searchActive={Boolean(mapSearchResult)}
            onDispatch={(station) => {
              if (!selectedTruck) return;
              setDispatchAssignments((current) => ({ ...current, [selectedTruck.id]: station.id }));
              setSelectedStation(station);
            }}
            onResetDispatch={() => {
              if (!selectedTruck) return;
              setDispatchAssignments((current) => {
                const next = { ...current };
                delete next[selectedTruck.id];
                return next;
              });
              setSelectedStation(null);
            }}
            onSortChange={setStationSort}
            onSelect={setSelectedStation}
          />
        </aside>
      </div>
    </main>
  );
}

function TruckCard({
  truck,
  dispatchedStation,
  selected,
  onClick,
}: {
  truck: Truck;
  dispatchedStation: Station | null;
  selected: boolean;
  onClick: () => void;
}) {
  const fuel = truck.fuel_percent;
  const fuelClass = fuelColor(fuel);
  return (
    <button
      onClick={onClick}
      className={`truck-card mb-2 w-full rounded-lg border p-3 text-left transition ${
        selected ? "border-[#3B82F6] bg-[#1E3A8A]/50" : "border-[#374151] bg-[#1F2937] hover:border-[#6B7280]"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-extrabold text-[#F9FAFB]">Unit {truck.unit_number}</div>
          <div className="mt-1 text-xs font-medium text-[#D1D5DB]">Driver: {truck.driver?.name ?? "Unassigned"}</div>
          <div className="mt-1 text-xs text-[#9CA3AF]">
            {truck.current_city && truck.current_state ? `${truck.current_city}, ${truck.current_state}` : "Location pending"}
          </div>
        </div>
        <div className={`fuel-badge ${fuelClass} ${fuel != null && fuel < 20 ? "fuel-pulse" : ""}`}>
          {fuel == null ? "--" : `${Math.round(fuel)}%`}
        </div>
      </div>
      <div className="fuel-track mt-3 h-2 overflow-hidden rounded-full bg-[#0B1220]">
        <div className={`h-full ${fuelBarColor(fuel)}`} style={{ width: `${Math.max(3, Math.min(100, fuel ?? 0))}%` }} />
      </div>
      <div className="mt-2 text-xs font-semibold text-[#9CA3AF]">{truckStatus(truck)}</div>
      {dispatchedStation ? (
        <div className="truck-dispatch-destination">Dispatch: {dispatchedStation.station_name} · {dispatchedStation.site_code}</div>
      ) : null}
    </button>
  );
}

function StationResults({
  stations,
  selectedStation,
  selectedTruck,
  dispatchedStationId,
  sortMode,
  canSortNearest,
  searchActive,
  onDispatch,
  onResetDispatch,
  onSortChange,
  onSelect,
}: {
  stations: Station[];
  selectedStation: Station | null;
  selectedTruck: Truck | null;
  dispatchedStationId?: number;
  sortMode: StationSort;
  canSortNearest: boolean;
  searchActive: boolean;
  onDispatch: (station: Station) => void;
  onResetDispatch: () => void;
  onSortChange: (sort: StationSort) => void;
  onSelect: (station: Station) => void;
}) {
  return (
    <div className="station-results">
      <div className="station-results-summary">
        <div>
          <div className="station-results-kicker">{searchActive ? "Map Search" : "All Stations"}</div>
          <div className="station-results-count">{stations.length.toLocaleString()} stations</div>
        </div>
        <div className="station-results-context">
          {selectedTruck ? `Unit ${selectedTruck.unit_number}` : "No unit selected"}
        </div>
      </div>
      <div className="station-sort-bar">
        <button
          className={sortMode === "nearest" ? "is-active" : ""}
          disabled={!canSortNearest}
          onClick={() => onSortChange("nearest")}
        >
          Nearest
        </button>
        <button
          className={sortMode === "cheapest" ? "is-active" : ""}
          onClick={() => onSortChange("cheapest")}
        >
          Cheapest
        </button>
      </div>

      <div className="station-results-list">
        {stations.length === 0 ? (
          <div className="empty-card rounded-lg border border-[#374151] bg-[#1F2937] p-4">
            <div className="text-sm font-bold">No stations found</div>
            <p className="mt-2 text-sm leading-5 text-[#D1D5DB]">
              Adjust the search radius or off-route miles to include more stations.
            </p>
          </div>
        ) : (
          stations.map((station) => (
            <div
              key={station.id}
              className={`station-result-card ${selectedStation?.site_code === station.site_code ? "is-selected" : ""} ${
                dispatchedStationId === station.id ? "is-dispatched" : ""
              }`}
            >
              <button className="station-result-main" onClick={() => onSelect(station)}>
                <div className="station-result-topline">
                  <span>Site {station.site_code}</span>
                  <strong>${station.latest_price?.your_price ?? "--"}</strong>
                </div>
                <div className="station-result-name">{station.station_name}</div>
                <div className="station-result-address">{station.address}</div>
                <div className="station-result-address">
                  {station.city}, {station.state}
                </div>
                <div className="station-result-meta">
                  <span>{station.fuel_lane_count ?? "--"} lanes</span>
                  <span>{station.parking_spaces_count ?? "--"} parking</span>
                  <span>{station.shower_count ?? "--"} showers</span>
                </div>
              </button>
              <div className="station-result-actions">
                <button
                  className="station-dispatch-button"
                  disabled={!selectedTruck}
                  onClick={() => onDispatch(station)}
                >
                  {dispatchedStationId === station.id ? "Dispatched" : "Dispatch"}
                </button>
                {dispatchedStationId === station.id ? (
                  <button className="station-reset-button" onClick={onResetDispatch}>
                    Reset
                  </button>
                ) : null}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: "yellow" | "red" }) {
  const valueClass = tone === "red" ? "text-[#EF4444]" : tone === "yellow" ? "text-[#FACC15]" : "text-[#F9FAFB]";
  return (
    <div className="metric-card rounded-lg border border-[#374151] bg-[#0B1220] p-3">
      <div className="text-[11px] font-bold uppercase tracking-wide text-[#9CA3AF]">{label}</div>
      <div className={`mt-1 text-lg font-black ${valueClass}`}>{value}</div>
    </div>
  );
}

function filterTruck(truck: Truck, fuelPercentCap: string, truckFilter: TruckFilter) {
  const cap = Number(fuelPercentCap);
  if (Number.isFinite(cap) && cap > 0 && cap < 100) {
    if (truck.fuel_percent == null || truck.fuel_percent < 1 || truck.fuel_percent > cap) return false;
  }
  if (truckFilter === "assigned") return Boolean(truck.driver);
  if (truckFilter === "not_assigned") return !truck.driver;
  if (truckFilter === "active") return truck.active;
  if (truckFilter === "inactive") return !truck.active;
  return true;
}

function fuelColor(fuel: number | null) {
  if (fuel == null) return "fuel-gray";
  if (fuel < 40) return "fuel-red";
  if (fuel <= 60) return "fuel-yellow";
  return "fuel-green";
}

function fuelBarColor(fuel: number | null) {
  if (fuel == null) return "bg-[#6B7280]";
  if (fuel < 40) return "bg-[#EF4444]";
  if (fuel <= 60) return "bg-[#FACC15]";
  return "bg-[#22C55E]";
}

function truckStatus(truck: Truck) {
  if ((truck.fuel_percent ?? 101) < 40) return "Low Fuel";
  if ((truck.fuel_percent ?? 101) < 60) return "Watch";
  return "No Assignment";
}

function nearestStation(truck: Truck, stations: Station[]) {
  if (truck.latitude == null || truck.longitude == null) return stations[0] ?? null;
  return [...stations].sort((a, b) => distanceMiles(truck, a) - distanceMiles(truck, b))[0] ?? null;
}

function normalizeMiles(value: string, fallback: number) {
  const miles = Number(value);
  return Number.isFinite(miles) && miles > 0 ? miles : fallback;
}

function loadDispatchAssignments(): Record<number, number> {
  try {
    const stored = window.localStorage.getItem(DISPATCH_STORAGE_KEY);
    if (!stored) return {};
    const parsed = JSON.parse(stored) as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(parsed)
        .map(([truckId, stationId]) => [Number(truckId), Number(stationId)] as const)
        .filter(([truckId, stationId]) => Number.isFinite(truckId) && Number.isFinite(stationId))
    );
  } catch {
    return {};
  }
}

function stationPrice(station: Station) {
  const price = Number(station.latest_price?.your_price);
  return Number.isFinite(price) ? price : Number.POSITIVE_INFINITY;
}

function pointFromTruck(truck: Truck): GeoPoint {
  if (truck.latitude == null || truck.longitude == null) {
    throw new Error(`Unit ${truck.unit_number} does not have a GPS location yet.`);
  }
  return {
    label: `Unit ${truck.unit_number}`,
    latitude: truck.latitude,
    longitude: truck.longitude,
  };
}

async function geocodeLocation(value: string): Promise<GeoPoint> {
  const text = value.trim();
  if (!text) throw new Error("Enter a location or coordinates.");
  const coordinates = parseCoordinates(text);
  if (coordinates) return { label: text, latitude: coordinates[0], longitude: coordinates[1] };

  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "1");
  url.searchParams.set("countrycodes", "us");
  url.searchParams.set("q", text);
  const response = await fetch(url.toString());
  if (!response.ok) throw new Error("Location search failed.");
  const results = (await response.json()) as { display_name: string; lat: string; lon: string }[];
  const first = results[0];
  if (!first) throw new Error(`No location found for "${text}".`);
  return {
    label: first.display_name.split(",").slice(0, 3).join(","),
    latitude: Number(first.lat),
    longitude: Number(first.lon),
  };
}

function parseCoordinates(value: string): [number, number] | null {
  const match = value.match(/^\s*(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)\s*$/);
  if (!match) return null;
  const latitude = Number(match[1]);
  const longitude = Number(match[2]);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  return [latitude, longitude];
}

async function fetchRoutePath(from: GeoPoint, to: GeoPoint): Promise<[number, number][]> {
  const coords = `${from.longitude},${from.latitude};${to.longitude},${to.latitude}`;
  const url = `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`;
  const response = await fetch(url);
  if (!response.ok) return [[from.latitude, from.longitude], [to.latitude, to.longitude]];
  const payload = await response.json();
  const coordinates = payload?.routes?.[0]?.geometry?.coordinates as [number, number][] | undefined;
  if (!coordinates?.length) return [[from.latitude, from.longitude], [to.latitude, to.longitude]];
  return coordinates.map(([longitude, latitude]) => [latitude, longitude]);
}

function distanceMiles(
  a: { latitude: number | null; longitude: number | null },
  b: { latitude: number | null; longitude: number | null }
) {
  if (a.latitude == null || a.longitude == null || b.latitude == null || b.longitude == null) return Number.POSITIVE_INFINITY;
  const earthRadiusMiles = 3958.8;
  const dLat = toRadians(b.latitude - a.latitude);
  const dLng = toRadians(b.longitude - a.longitude);
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * earthRadiusMiles * Math.asin(Math.sqrt(h));
}

function distanceToPathMiles(station: Station, path: [number, number][]) {
  if (path.length === 0) return Number.POSITIVE_INFINITY;
  if (path.length === 1) return distanceMiles(station, { latitude: path[0][0], longitude: path[0][1] });
  let shortest = Number.POSITIVE_INFINITY;
  for (let index = 0; index < path.length - 1; index += 1) {
    shortest = Math.min(shortest, distanceToSegmentMiles(station, path[index], path[index + 1]));
  }
  return shortest;
}

function distanceToSegmentMiles(point: Station, start: [number, number], end: [number, number]) {
  const latMiles = 69;
  const lngMiles = 69 * Math.cos(toRadians(point.latitude));
  const px = point.longitude * lngMiles;
  const py = point.latitude * latMiles;
  const ax = start[1] * lngMiles;
  const ay = start[0] * latMiles;
  const bx = end[1] * lngMiles;
  const by = end[0] * latMiles;
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSquared));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}
