import {
  Archive,
  ArrowUpDown,
  Bell,
  CheckCheck,
  Fuel,
  Layers,
  LogOut,
  MapPin,
  Search,
  Settings,
  Shield,
  Users,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { StationMap, type SearchPin } from "./StationMap";
import {
  assignDispatch,
  cancelDispatch,
  archiveNotifications,
  createUser,
  fetchNotifications,
  fetchCurrentUser,
  fetchSamsaraTest,
  fetchStations,
  fetchTrucks,
  fetchUsers,
  getAuthToken,
  login,
  logout,
  fetchUnreadNotificationCount,
  markNotificationsRead,
  setTruckActive,
  subscribeToNotifications,
  subscribeToTruckUpdates,
  updateUser,
} from "./api";
import type {
  NotificationEvent,
  NotificationStatus,
  SamsaraTestResult,
  Station,
  Truck,
  User,
  UserCreateInput,
  UserRole,
  UserUpdateInput,
} from "./types";

type TruckFilter = "any" | "dispatched" | "not_dispatched" | "active" | "inactive";
type MapStyle = "dark" | "light";
type AppTheme = "blue" | "coffee" | "charcoal" | "white" | "pitch";
type SearchMode = "nearby" | "route";
type StationSort = "nearest" | "cheapest";
type RightPanelView = "stations" | "dispatches";
type NotificationPreferenceKey = "fuel" | "fuelJump" | "dispatch" | "samsara" | "system";

type DashboardSettings = {
  theme: AppTheme;
  notifications: Record<NotificationPreferenceKey, boolean>;
};

type GeoPoint = {
  label: string;
  latitude: number;
  longitude: number;
};

type DispatchOrigin = GeoPoint & {
  capturedAt: string;
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
const DISPATCH_ORIGIN_STORAGE_KEY = "emafuel-dispatch-origins";
const TRUCK_ACTIVE_STORAGE_KEY = "emafuel-truck-active-overrides";
const DASHBOARD_SETTINGS_STORAGE_KEY = "emafuel-dashboard-settings";

const DEFAULT_DASHBOARD_SETTINGS: DashboardSettings = {
  theme: "pitch",
  notifications: {
    fuel: true,
    fuelJump: true,
    dispatch: true,
    samsara: true,
    system: true,
  },
};

const NOTIFICATION_SETTING_OPTIONS: {
  key: NotificationPreferenceKey;
  label: string;
  description: string;
}[] = [
  { key: "fuel", label: "Fuel threshold", description: "Low fuel and threshold alerts." },
  { key: "fuelJump", label: "Fuel jump", description: "Unexpected refill or fuel increase alerts." },
  { key: "dispatch", label: "Dispatch distance", description: "60/50 mile, arrived, and missed station alerts." },
  { key: "samsara", label: "Samsara live feed", description: "Samsara sync and live update warnings." },
  { key: "system", label: "System", description: "Everything else from the notification engine." },
];

const THEME_OPTIONS: {
  key: AppTheme;
  label: string;
  description: string;
}[] = [
  { key: "blue", label: "Original blue", description: "The first blue dispatch palette." },
  { key: "coffee", label: "Black coffee", description: "Warm dark palette for long shifts." },
  { key: "charcoal", label: "Black charcoal", description: "Cool graphite with clean green accents." },
  { key: "white", label: "White", description: "Bright UI with a light map." },
  { key: "pitch", label: "Pitch black", description: "Deep black map room style." },
];

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
  const [rightPanelView, setRightPanelView] = useState<RightPanelView>("stations");
  const [dispatchAssignments, setDispatchAssignments] = useState<Record<number, number>>(() => loadDispatchAssignments());
  const [dispatchOrigins, setDispatchOrigins] = useState<Record<number, DispatchOrigin>>(() => loadDispatchOrigins());
  const [truckActiveOverrides, setTruckActiveOverrides] = useState<Record<number, boolean>>(() => loadTruckActiveOverrides());
  const [dispatchRoutePath, setDispatchRoutePath] = useState<[number, number][]>([]);
  const [unitSearch, setUnitSearch] = useState("");
  const [fuelPercentCap, setFuelPercentCap] = useState("60");
  const [truckFilter, setTruckFilter] = useState<TruckFilter>("any");
  const [fuelSortDirection, setFuelSortDirection] = useState<"asc" | "desc">("asc");
  const [showMapTrucks, setShowMapTrucks] = useState(true);
  const [showMapLocations, setShowMapLocations] = useState(true);
  const [dashboardSettings, setDashboardSettings] = useState<DashboardSettings>(() => loadDashboardSettings());
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(true);
  const [samsaraStatus, setSamsaraStatus] = useState<SamsaraTestResult | null>(null);
  const [notifications, setNotifications] = useState<NotificationEvent[]>([]);
  const [notificationFilter, setNotificationFilter] = useState<"inbox" | NotificationStatus>("inbox");
  const [notificationModalOpen, setNotificationModalOpen] = useState(false);
  const [selectedNotificationIds, setSelectedNotificationIds] = useState<number[]>([]);
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);
  const [notificationToast, setNotificationToast] = useState<NotificationEvent | null>(null);
  const [notificationError, setNotificationError] = useState("");
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [loginError, setLoginError] = useState("");
  const [userManagementOpen, setUserManagementOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const canAdmin = currentUser?.role === "creator" || currentUser?.role === "admin";
  const canManageUsers = currentUser?.role === "creator";
  const mapStyle: MapStyle = dashboardSettings.theme === "white" ? "light" : "dark";

  useEffect(() => {
    if (!getAuthToken()) {
      setAuthLoading(false);
      return;
    }
    fetchCurrentUser()
      .then(setCurrentUser)
      .catch(() => setCurrentUser(null))
      .finally(() => setAuthLoading(false));
  }, []);

  useEffect(() => {
    if (!currentUser) return;
    setLoading(true);
    Promise.all([fetchStations(), fetchTrucks(), fetchSamsaraTest()])
      .then(([stationItems, truckItems, samsara]) => {
        setStations(stationItems);
        setTrucks(truckItems);
        setSamsaraStatus(samsara);
        setSelectedTruck(truckItems[0] ?? null);
      })
      .catch((error) => setLoadError(error instanceof Error ? error.message : "Unable to load dashboard data"))
      .finally(() => setLoading(false));
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser) return;
    const source = subscribeToTruckUpdates((event) => {
      setTrucks((current) => {
        const exists = current.some((truck) => truck.id === event.truck.id);
        const next = exists
          ? current.map((truck) => (truck.id === event.truck.id ? event.truck : truck))
          : [...current, event.truck];
        return next.filter((truck) => truck.active);
      });
      setSelectedTruck((current) => (current?.id === event.truck.id ? event.truck : current));
    });
    return () => source.close();
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser) return;
    fetchUnreadNotificationCount()
      .then(setUnreadNotificationCount)
      .catch(() => setNotificationError("Unable to load notification count"));
    fetchNotifications()
      .then((payload) => setNotifications(payload.items))
      .catch(() => setNotificationError("Unable to load notifications"));

    const source = subscribeToNotifications((event) => {
      setUnreadNotificationCount(event.unread_count);
      if (event.type === "notification") {
        setNotifications((current) => [event.notification, ...current.filter((item) => item.id !== event.notification.id)]);
        if (notificationAllowed(event.notification, dashboardSettings.notifications)) {
          setNotificationToast(event.notification);
        }
      }
    });
    return () => source.close();
  }, [currentUser, dashboardSettings.notifications]);

  useEffect(() => {
    if (!notificationToast) return;
    const timeout = window.setTimeout(() => setNotificationToast(null), 4500);
    return () => window.clearTimeout(timeout);
  }, [notificationToast]);

  useEffect(() => {
    if (!notificationModalOpen) return;
    const status = notificationFilter === "inbox" ? undefined : notificationFilter;
    fetchNotifications(status)
      .then((payload) => {
        setNotifications(payload.items);
        setSelectedNotificationIds([]);
      })
      .catch(() => setNotificationError("Unable to load notifications"));
  }, [notificationFilter, notificationModalOpen]);

  useEffect(() => {
    window.localStorage.setItem(DISPATCH_STORAGE_KEY, JSON.stringify(dispatchAssignments));
  }, [dispatchAssignments]);

  useEffect(() => {
    window.localStorage.setItem(DISPATCH_ORIGIN_STORAGE_KEY, JSON.stringify(dispatchOrigins));
  }, [dispatchOrigins]);

  useEffect(() => {
    window.localStorage.setItem(TRUCK_ACTIVE_STORAGE_KEY, JSON.stringify(truckActiveOverrides));
  }, [truckActiveOverrides]);

  useEffect(() => {
    window.localStorage.setItem(DASHBOARD_SETTINGS_STORAGE_KEY, JSON.stringify(dashboardSettings));
  }, [dashboardSettings]);

  const filteredTrucks = useMemo(() => {
    const needle = unitSearch.trim().toLowerCase();
    return trucks
      .filter((truck) => filterTruck(truck, fuelPercentCap, truckFilter, truckActiveOverrides))
      .filter((truck) => filterDispatchStatus(truck, truckFilter, dispatchAssignments))
      .filter((truck) => {
        if (!needle) return true;
        return [truck.unit_number, truck.driver?.name].filter(Boolean).join(" ").toLowerCase().includes(needle);
      })
      .sort((a, b) => {
        const diff = (a.fuel_percent ?? 999) - (b.fuel_percent ?? 999);
        return fuelSortDirection === "asc" ? diff : -diff;
      });
  }, [dispatchAssignments, truckActiveOverrides, trucks, fuelPercentCap, truckFilter, fuelSortDirection, unitSearch]);

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

  const currentDispatches = useMemo(() => {
    const items: { truck: Truck; station: Station; origin: DispatchOrigin | null }[] = [];
    Object.entries(dispatchAssignments).forEach(([truckId, stationId]) => {
      const numericTruckId = Number(truckId);
      const truck = trucks.find((item) => item.id === numericTruckId);
      const station = stations.find((item) => item.id === stationId);
      if (truck && station) items.push({ truck, station, origin: dispatchOrigins[numericTruckId] ?? null });
    });
    return items.sort((a, b) => a.truck.unit_number.localeCompare(b.truck.unit_number, undefined, { numeric: true }));
  }, [dispatchAssignments, dispatchOrigins, stations, trucks]);

  useEffect(() => {
    const missingOrigins = Object.keys(dispatchAssignments)
      .map(Number)
      .filter((truckId) => !dispatchOrigins[truckId]);
    if (missingOrigins.length === 0) return;

    const nextOrigins: Record<number, DispatchOrigin> = {};
    missingOrigins.forEach((truckId) => {
      const truck = trucks.find((item) => item.id === truckId);
      const origin = truck ? dispatchOriginFromTruck(truck) : null;
      if (origin) nextOrigins[truckId] = origin;
    });
    if (Object.keys(nextOrigins).length === 0) return;
    setDispatchOrigins((current) => ({ ...current, ...nextOrigins }));
  }, [dispatchAssignments, dispatchOrigins, trucks]);

  const recommendedStation = useMemo(() => {
    if (selectedStation) return selectedStation;
    if (selectedDispatchStation) return selectedDispatchStation;
    return null;
  }, [selectedDispatchStation, selectedStation]);

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

  function dispatchStation(station: Station) {
    if (!selectedTruck) return;
    if (!canAdmin) {
      setLoadError("Admin permission required");
      return;
    }
    setDispatchAssignments((current) => ({ ...current, [selectedTruck.id]: station.id }));
    const origin = dispatchOriginFromTruck(selectedTruck);
    if (origin) {
      setDispatchOrigins((current) => ({ ...current, [selectedTruck.id]: origin }));
    }
    setSelectedStation(station);
    void assignDispatch(selectedTruck.id, station.id).catch((error) => {
      setLoadError(error instanceof Error ? error.message : "Failed to assign dispatch");
    });
  }

  function copyStation(station: Station) {
    const message = stationCopyMessage(station, stationSortOrigin);
    void writeClipboardText(message);
  }

  async function handleLogin(username: string, password: string) {
    setLoginError("");
    try {
      const user = await login(username, password);
      setCurrentUser(user);
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : "Login failed");
    }
  }

  async function handleLogout() {
    await logout();
    setCurrentUser(null);
    setStations([]);
    setTrucks([]);
    setSelectedTruck(null);
    setSelectedStation(null);
    setNotifications([]);
    setUnreadNotificationCount(0);
  }

  async function toggleSelectedTruckActive() {
    if (!selectedTruck || !canAdmin) return;
    const nextActive = !effectiveTruckActive(selectedTruck, truckActiveOverrides);
    try {
      await setTruckActive(selectedTruck.id, nextActive);
      setTruckActiveOverrides((current) => ({ ...current, [selectedTruck.id]: nextActive }));
      setTrucks((current) =>
        current.map((truck) => (truck.id === selectedTruck.id ? { ...truck, active: nextActive } : truck))
      );
      setSelectedTruck((current) => (current ? { ...current, active: nextActive } : current));
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Failed to update unit status");
    }
  }

  const visibleNotifications = useMemo(() => {
    const enabledNotifications = notifications.filter((notification) =>
      notificationAllowed(notification, dashboardSettings.notifications)
    );
    if (notificationFilter === "inbox") return enabledNotifications.filter((notification) => notification.status !== "archived");
    return enabledNotifications.filter((notification) => notification.status === notificationFilter);
  }, [dashboardSettings.notifications, notificationFilter, notifications]);

  const displayedUnreadNotificationCount = useMemo(() => {
    return notifications.filter(
      (notification) => notification.status === "unread" && notificationAllowed(notification, dashboardSettings.notifications)
    ).length;
  }, [dashboardSettings.notifications, notifications]);

  if (authLoading) {
    return <AuthLoadingScreen />;
  }

  if (!currentUser) {
    return <LoginPage error={loginError} onLogin={handleLogin} />;
  }

  async function markSelectedNotificationsRead() {
    if (selectedNotificationIds.length === 0) return;
    const unreadCount = await markNotificationsRead(selectedNotificationIds);
    setUnreadNotificationCount(unreadCount);
    setNotifications((current) =>
      current.map((notification) =>
        selectedNotificationIds.includes(notification.id)
          ? { ...notification, status: "read", read_at: new Date().toISOString() }
          : notification
      )
    );
    setSelectedNotificationIds([]);
  }

  async function archiveSelectedNotifications() {
    if (selectedNotificationIds.length === 0) return;
    const unreadCount = await archiveNotifications(selectedNotificationIds);
    setUnreadNotificationCount(unreadCount);
    setNotifications((current) =>
      current.map((notification) =>
        selectedNotificationIds.includes(notification.id)
          ? { ...notification, status: "archived", archived_at: new Date().toISOString() }
          : notification
      )
    );
    setSelectedNotificationIds([]);
  }

  return (
    <main className={`app-shell theme-${dashboardSettings.theme} h-screen overflow-hidden bg-[#0B1220] text-[#F9FAFB]`}>
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

        <button className="notification-header-button" onClick={() => setNotificationModalOpen(true)}>
          {displayedUnreadNotificationCount > 0 ? (
            <span className="notification-header-badge">
              {displayedUnreadNotificationCount > 99 ? "99+" : displayedUnreadNotificationCount}
            </span>
          ) : null}
          <Bell size={17} />
          <span>Notifications</span>
        </button>

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
          <button className="settings-header-button" onClick={() => setSettingsOpen(true)}>
            <Settings size={15} />
            Settings
          </button>
        </div>

        <div className="account-cluster">
          <div className="account-pill">
            <Shield size={15} />
            <span>{currentUser.display_name || currentUser.username}</span>
            <strong>{currentUser.role}</strong>
          </div>
          {canManageUsers ? (
            <button className="account-action" onClick={() => setUserManagementOpen(true)}>
              <Users size={15} />
              Users
            </button>
          ) : null}
          <button className="account-action" onClick={() => void handleLogout()}>
            <LogOut size={15} />
            Logout
          </button>
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
                <option value="dispatched">Dispatched</option>
                <option value="not_dispatched">Not dispatched</option>
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
                  active={effectiveTruckActive(truck, truckActiveOverrides)}
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
            onDispatch={dispatchStation}
            onCopy={copyStation}
            canDispatch={canAdmin && Boolean(selectedTruck)}
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
              {rightPanelView === "stations" ? "Station Results" : "Current Dispatched"}
            </div>
          </div>
          <div className="right-panel-tabs">
            <button className={rightPanelView === "stations" ? "is-active" : ""} onClick={() => setRightPanelView("stations")}>
              Stations
            </button>
            <button className={rightPanelView === "dispatches" ? "is-active" : ""} onClick={() => setRightPanelView("dispatches")}>
              Current dispatched
            </button>
          </div>
          {rightPanelView === "stations" ? (
            <StationResults
              stations={stationResults}
              selectedStation={recommendedStation}
              selectedTruck={selectedTruck}
              selectedTruckActive={selectedTruck ? effectiveTruckActive(selectedTruck, truckActiveOverrides) : null}
              dispatchedStationId={selectedTruck ? dispatchAssignments[selectedTruck.id] : undefined}
              sortMode={stationSort}
              distanceOrigin={stationSortOrigin}
              canSortNearest={Boolean(stationSortOrigin)}
              searchActive={Boolean(mapSearchResult)}
              canDispatch={canAdmin}
              onDispatch={dispatchStation}
              onCopy={copyStation}
              onResetDispatch={() => {
                if (!selectedTruck || !canAdmin) return;
                const truckId = selectedTruck.id;
                setDispatchAssignments((current) => {
                  const next = { ...current };
                  delete next[truckId];
                  return next;
                });
                setDispatchOrigins((current) => {
                  const next = { ...current };
                  delete next[truckId];
                  return next;
                });
                setSelectedStation(null);
                void cancelDispatch(truckId).catch((error) => {
                  setLoadError(error instanceof Error ? error.message : "Failed to cancel dispatch");
                });
              }}
              onToggleTruckActive={() => void toggleSelectedTruckActive()}
              onSortChange={setStationSort}
              onSelect={setSelectedStation}
            />
          ) : (
            <CurrentDispatches
              dispatches={currentDispatches}
              onSelect={(truck, station) => {
                setSelectedTruck(truck);
                setSelectedStation(station);
              }}
            />
          )}
        </aside>
      </div>
      {notificationModalOpen ? (
        <NotificationModal
          notifications={visibleNotifications}
          filter={notificationFilter}
          selectedIds={selectedNotificationIds}
          error={notificationError}
          onClose={() => setNotificationModalOpen(false)}
          onFilterChange={setNotificationFilter}
          onSelectIds={setSelectedNotificationIds}
          onMarkRead={() => void markSelectedNotificationsRead()}
          onArchive={() => void archiveSelectedNotifications()}
        />
      ) : null}
      {notificationToast ? (
        <div className="notification-toast">
          <div className="notification-toast-kicker">New notification</div>
          <div className="notification-toast-title">{notificationToast.title}</div>
          <div className="notification-toast-message">{notificationToast.message}</div>
        </div>
      ) : null}
      {userManagementOpen ? <UserManagementModal currentUser={currentUser} onClose={() => setUserManagementOpen(false)} /> : null}
      {settingsOpen ? (
        <SettingsModal
          settings={dashboardSettings}
          onChange={setDashboardSettings}
          onClose={() => setSettingsOpen(false)}
        />
      ) : null}
    </main>
  );
}

function NotificationModal({
  notifications,
  filter,
  selectedIds,
  error,
  onClose,
  onFilterChange,
  onSelectIds,
  onMarkRead,
  onArchive,
}: {
  notifications: NotificationEvent[];
  filter: "inbox" | NotificationStatus;
  selectedIds: number[];
  error: string;
  onClose: () => void;
  onFilterChange: (filter: "inbox" | NotificationStatus) => void;
  onSelectIds: (ids: number[]) => void;
  onMarkRead: () => void;
  onArchive: () => void;
}) {
  const allSelected = notifications.length > 0 && notifications.every((notification) => selectedIds.includes(notification.id));

  function toggleNotification(notificationId: number) {
    onSelectIds(
      selectedIds.includes(notificationId)
        ? selectedIds.filter((id) => id !== notificationId)
        : [...selectedIds, notificationId]
    );
  }

  return (
    <div className="notification-modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="notification-modal" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
        <div className="notification-modal-header">
          <div>
            <h2>Notifications</h2>
            <p>{notifications.length.toLocaleString()} visible</p>
          </div>
          <button className="notification-close-button" onClick={onClose} aria-label="Close notifications">
            ×
          </button>
        </div>

        <div className="notification-action-bar">
          <label className="notification-select-all">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={() => onSelectIds(allSelected ? [] : notifications.map((notification) => notification.id))}
            />
            <span>Select</span>
          </label>
          <button disabled={selectedIds.length === 0} onClick={onMarkRead}>
            <CheckCheck size={15} />
            Mark as Read
          </button>
          <button disabled={selectedIds.length === 0} onClick={onArchive}>
            <Archive size={15} />
            Archive
          </button>
          <select value={filter} onChange={(event) => onFilterChange(event.target.value as "inbox" | NotificationStatus)}>
            <option value="inbox">Inbox</option>
            <option value="unread">Unread</option>
            <option value="read">Read</option>
            <option value="archived">Archived</option>
          </select>
        </div>

        {error ? <div className="notification-error">{error}</div> : null}

        <div className="notification-list">
          {notifications.length === 0 ? (
            <div className="notification-empty">No notifications found.</div>
          ) : (
            notifications.map((notification) => (
              <article
                key={notification.id}
                className={`notification-row ${notification.status === "unread" ? "is-unread" : ""}`}
              >
                <input
                  type="checkbox"
                  checked={selectedIds.includes(notification.id)}
                  onChange={() => toggleNotification(notification.id)}
                />
                <div className="notification-event-icon">{notificationEventIcon(notification.event_type)}</div>
                <div className="notification-row-body">
                  <div className="notification-row-topline">
                    <strong>{notification.title}</strong>
                    <time>{formatNotificationTime(notification.created_at)}</time>
                  </div>
                  <p>{notification.message}</p>
                  <div className="notification-row-meta">
                    <span>{notification.unit_number ? `Unit ${notification.unit_number}` : "System"}</span>
                    <span>{eventTypeLabel(notification.event_type)}</span>
                    <span className={`notification-status-pill is-${notification.status}`}>{notification.status}</span>
                  </div>
                </div>
              </article>
            ))
          )}
        </div>
      </section>
    </div>
  );
}

function SettingsModal({
  settings,
  onChange,
  onClose,
}: {
  settings: DashboardSettings;
  onChange: (settings: DashboardSettings) => void;
  onClose: () => void;
}) {
  function setTheme(theme: AppTheme) {
    onChange({ ...settings, theme });
  }

  function toggleNotification(key: NotificationPreferenceKey) {
    onChange({
      ...settings,
      notifications: {
        ...settings.notifications,
        [key]: !settings.notifications[key],
      },
    });
  }

  return (
    <div className="notification-modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="settings-modal" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
        <div className="notification-modal-header">
          <div>
            <h2>Settings</h2>
            <p>Notification cases and dashboard theme.</p>
          </div>
          <button className="notification-close-button" onClick={onClose} aria-label="Close settings">
            ×
          </button>
        </div>

        <div className="settings-content">
          <section className="settings-section">
            <div className="settings-section-heading">
              <h3>Notifications</h3>
              <p>Choose which alert cases appear in this dashboard.</p>
            </div>
            <div className="settings-toggle-grid">
              {NOTIFICATION_SETTING_OPTIONS.map((option) => (
                <label className="settings-toggle-row" key={option.key}>
                  <input
                    type="checkbox"
                    checked={settings.notifications[option.key]}
                    onChange={() => toggleNotification(option.key)}
                  />
                  <span>
                    <strong>{option.label}</strong>
                    <em>{option.description}</em>
                  </span>
                </label>
              ))}
            </div>
          </section>

          <section className="settings-section">
            <div className="settings-section-heading">
              <h3>Theme</h3>
              <p>White theme also switches the map to a light map.</p>
            </div>
            <div className="theme-choice-grid">
              {THEME_OPTIONS.map((option) => (
                <button
                  className={`theme-choice is-${option.key} ${settings.theme === option.key ? "is-selected" : ""}`}
                  key={option.key}
                  onClick={() => setTheme(option.key)}
                >
                  <span className="theme-swatch">
                    <i />
                    <i />
                    <i />
                  </span>
                  <strong>{option.label}</strong>
                  <em>{option.description}</em>
                </button>
              ))}
            </div>
          </section>
        </div>
      </section>
    </div>
  );
}

function AuthLoadingScreen() {
  return (
    <main className="login-screen">
      <section className="login-panel">
        <div className="login-brand-mark">
          <Fuel size={30} />
        </div>
        <h1>Emafuel Dispatch</h1>
        <p>Checking your session...</p>
      </section>
    </main>
  );
}

function LoginPage({
  error,
  onLogin,
}: {
  error: string;
  onLogin: (username: string, password: string) => Promise<void>;
}) {
  const [username, setUsername] = useState("David");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    try {
      await onLogin(username.trim(), password);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login-screen">
      <section className="login-panel">
        <div className="login-brand-mark">
          <Fuel size={30} />
        </div>
        <div className="login-copy">
          <span>Secure dashboard</span>
          <h1>Emafuel Dispatch</h1>
          <p>Sign in to manage live fuel dispatch, station data, and fleet alerts.</p>
        </div>
        <form className="login-form" onSubmit={(event) => void submit(event)}>
          <label>
            <span>Username</span>
            <input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" />
          </label>
          <label>
            <span>Password</span>
            <input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              autoComplete="current-password"
              autoFocus
            />
          </label>
          {error ? <div className="login-error">{error}</div> : null}
          <button type="submit" disabled={busy || !username.trim() || !password}>
            {busy ? "Signing in" : "Login"}
          </button>
        </form>
      </section>
    </main>
  );
}

function UserManagementModal({
  currentUser,
  onClose,
}: {
  currentUser: User;
  onClose: () => void;
}) {
  const emptyForm: UserCreateInput = {
    username: "",
    password: "",
    display_name: "",
    email: "",
    role: "viewer",
    active: true,
  };
  const [users, setUsers] = useState<User[]>([]);
  const [form, setForm] = useState<UserCreateInput>(emptyForm);
  const [drafts, setDrafts] = useState<Record<number, UserUpdateInput>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetchUsers()
      .then(setUsers)
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : "Failed to load users"));
  }, []);

  async function submitCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const created = await createUser({
        ...form,
        username: form.username.trim(),
        display_name: form.display_name?.trim() || null,
        email: form.email?.trim() || null,
      });
      setUsers((current) => [...current, created].sort((a, b) => a.username.localeCompare(b.username)));
      setForm(emptyForm);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Failed to create user");
    } finally {
      setBusy(false);
    }
  }

  async function saveUser(user: User) {
    const draft = drafts[user.id];
    if (!draft) return;
    setBusy(true);
    setError("");
    try {
      const updated = await updateUser(user.id, {
        ...draft,
        username: draft.username?.trim(),
        display_name: draft.display_name === undefined ? undefined : draft.display_name?.trim() || null,
        email: draft.email === undefined ? undefined : draft.email?.trim() || null,
        password: draft.password?.trim() || undefined,
      });
      setUsers((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setDrafts((current) => {
        const next = { ...current };
        delete next[user.id];
        return next;
      });
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to update user");
    } finally {
      setBusy(false);
    }
  }

  function setDraft(userId: number, patch: UserUpdateInput) {
    setDrafts((current) => ({ ...current, [userId]: { ...(current[userId] ?? {}), ...patch } }));
  }

  return (
    <div className="notification-modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="user-modal" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
        <div className="notification-modal-header">
          <div>
            <h2>User Management</h2>
            <p>Only creator can edit usernames, passwords, roles, and access.</p>
          </div>
          <button className="notification-close-button" onClick={onClose} aria-label="Close user management">
            ×
          </button>
        </div>
        {error ? <div className="notification-error">{error}</div> : null}
        <form className="user-create-form" onSubmit={(event) => void submitCreate(event)}>
          <input value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value })} placeholder="Username" />
          <input
            value={form.display_name ?? ""}
            onChange={(event) => setForm({ ...form, display_name: event.target.value })}
            placeholder="Display name"
          />
          <input value={form.email ?? ""} onChange={(event) => setForm({ ...form, email: event.target.value })} placeholder="Email" />
          <input
            value={form.password}
            onChange={(event) => setForm({ ...form, password: event.target.value })}
            placeholder="Password"
            type="password"
          />
          <select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value as UserRole })}>
            <option value="viewer">Viewer</option>
            <option value="admin">Admin</option>
          </select>
          <button disabled={busy || form.username.trim().length === 0 || form.password.length < 8}>Create User</button>
        </form>
        <div className="user-list">
          {users.map((user) => {
            const draft = drafts[user.id] ?? {};
            const isSelf = user.id === currentUser.id;
            return (
              <article className="user-row" key={user.id}>
                <input
                  value={draft.username ?? user.username}
                  onChange={(event) => setDraft(user.id, { username: event.target.value })}
                  aria-label="Username"
                />
                <input
                  value={draft.display_name ?? user.display_name ?? ""}
                  onChange={(event) => setDraft(user.id, { display_name: event.target.value })}
                  aria-label="Display name"
                />
                <input
                  value={draft.password ?? ""}
                  onChange={(event) => setDraft(user.id, { password: event.target.value })}
                  placeholder="New password"
                  type="password"
                  aria-label="New password"
                />
                <select
                  value={draft.role ?? user.role}
                  onChange={(event) => setDraft(user.id, { role: event.target.value as UserRole })}
                  disabled={user.role === "creator"}
                >
                  <option value="creator">Creator</option>
                  <option value="admin">Admin</option>
                  <option value="viewer">Viewer</option>
                </select>
                <label className="user-active-toggle">
                  <input
                    type="checkbox"
                    checked={draft.active ?? user.active}
                    disabled={isSelf}
                    onChange={(event) => setDraft(user.id, { active: event.target.checked })}
                  />
                  <span>{draft.active ?? user.active ? "Active" : "Inactive"}</span>
                </label>
                <button disabled={busy || !drafts[user.id]} onClick={() => void saveUser(user)}>
                  Save
                </button>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function TruckCard({
  truck,
  dispatchedStation,
  active,
  selected,
  onClick,
}: {
  truck: Truck;
  dispatchedStation: Station | null;
  active: boolean;
  selected: boolean;
  onClick: () => void;
}) {
  const fuel = truck.fuel_percent;
  const fuelClass = fuelColor(fuel);
  const freshness = truckFreshness(truck);
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
          {!active ? <div className="truck-inactive-label">Inactive</div> : null}
        </div>
        <div className={`fuel-badge ${fuelClass} ${fuel != null && fuel < 20 ? "fuel-pulse" : ""}`}>
          {fuel == null ? "--" : `${Math.round(fuel)}%`}
        </div>
      </div>
      <div className="fuel-track mt-3 h-2 overflow-hidden rounded-full bg-[#0B1220]">
        <div className={`h-full ${fuelBarColor(fuel)}`} style={{ width: `${Math.max(3, Math.min(100, fuel ?? 0))}%` }} />
      </div>
      <div className="truck-card-footer">
        <span>{truckStatus(truck)}</span>
        <span className={`truck-freshness is-${freshness.status}`}>{freshness.label}</span>
      </div>
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
  selectedTruckActive,
  dispatchedStationId,
  sortMode,
  distanceOrigin,
  canSortNearest,
  searchActive,
  canDispatch,
  onDispatch,
  onCopy,
  onResetDispatch,
  onToggleTruckActive,
  onSortChange,
  onSelect,
}: {
  stations: Station[];
  selectedStation: Station | null;
  selectedTruck: Truck | null;
  selectedTruckActive: boolean | null;
  dispatchedStationId?: number;
  sortMode: StationSort;
  distanceOrigin: GeoPoint | null;
  canSortNearest: boolean;
  searchActive: boolean;
  canDispatch: boolean;
  onDispatch: (station: Station) => void;
  onCopy: (station: Station) => void;
  onResetDispatch: () => void;
  onToggleTruckActive: () => void;
  onSortChange: (sort: StationSort) => void;
  onSelect: (station: Station) => void;
}) {
  const selectedCardRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    selectedCardRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
  }, [selectedStation?.site_code]);

  return (
    <div className="station-results">
      <div className="station-results-summary">
        <div>
          <div className="station-results-kicker">{searchActive ? "Map Search" : "All Stations"}</div>
          <div className="station-results-count">{stations.length.toLocaleString()} stations</div>
        </div>
        {selectedTruck ? (
          <div className="selected-unit-control">
            <div>
              <span>Unit</span>
              <strong>{selectedTruck.unit_number}</strong>
            </div>
            <button
              className={selectedTruckActive ? "is-active" : "is-inactive"}
              onClick={onToggleTruckActive}
              disabled={!canDispatch}
            >
              {selectedTruckActive ? "Deactivate" : "Activate"}
            </button>
          </div>
        ) : (
          <div className="station-results-context">No unit selected</div>
        )}
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
          stations.map((station) => {
            const isDispatched = dispatchedStationId === station.id;
            const distanceLabel = isDispatched ? stationDistanceLabel(station, distanceOrigin) : null;
            return (
              <div
                key={station.id}
                ref={selectedStation?.site_code === station.site_code ? selectedCardRef : null}
                className={`station-result-card ${selectedStation?.site_code === station.site_code ? "is-selected" : ""} ${
                  isDispatched ? "is-dispatched" : ""
                }`}
              >
                <button className="station-result-main" onClick={() => onSelect(station)}>
                  <div className="station-result-topline">
                    <span>Site {station.site_code}</span>
                    <div className="station-result-price-block">
                      <strong>${station.latest_price?.your_price ?? "--"}</strong>
                      {distanceLabel ? <em>{distanceLabel}</em> : null}
                    </div>
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
                    disabled={!selectedTruck || !canDispatch}
                    onClick={() => onDispatch(station)}
                  >
                    {isDispatched ? "Dispatched" : "Dispatch"}
                  </button>
                  <button className="station-copy-button" onClick={() => onCopy(station)}>
                    Copy
                  </button>
                  {isDispatched && canDispatch ? (
                    <button className="station-reset-button" onClick={onResetDispatch}>
                      Reset
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function CurrentDispatches({
  dispatches,
  onSelect,
}: {
  dispatches: { truck: Truck; station: Station; origin: DispatchOrigin | null }[];
  onSelect: (truck: Truck, station: Station) => void;
}) {
  const [copiedField, setCopiedField] = useState<string | null>(null);

  function copyDispatchField(key: string, value: string) {
    void writeClipboardText(value);
    setCopiedField(key);
    window.setTimeout(() => {
      setCopiedField((current) => (current === key ? null : current));
    }, 1200);
  }

  return (
    <div className="current-dispatches">
      <div className="current-dispatches-summary">
        <div>
          <div className="station-results-kicker">Assigned routes</div>
          <div className="station-results-count">{dispatches.length.toLocaleString()} dispatched</div>
        </div>
      </div>
      <div className="current-dispatches-list">
        {dispatches.length === 0 ? (
          <div className="empty-card rounded-lg border border-[#374151] bg-[#1F2937] p-4">
            <div className="text-sm font-bold">No current dispatches</div>
            <p className="mt-2 text-sm leading-5 text-[#D1D5DB]">
              Assigned units will appear here with their destination and miles remaining.
            </p>
          </div>
        ) : (
          dispatches.map(({ truck, station, origin }) => {
            const currentLocation = truckLocationLabel(truck) ?? "Current location pending";
            const originLabel = dispatchOriginLabel(origin);
            const destinationLabel = `${station.city}, ${station.state}`;
            return (
              <article
                className="current-dispatch-card"
                key={`${truck.id}-${station.id}`}
                onClick={() => onSelect(truck, station)}
              >
                <div className="current-dispatch-topline">
                  <strong>Unit {truck.unit_number}</strong>
                  <span>{truck.fuel_percent == null ? "--" : `${Math.round(truck.fuel_percent)}%`}</span>
                </div>
                <button
                  className="copyable-location current-dispatch-location"
                  onClick={(event) => {
                    event.stopPropagation();
                    copyDispatchField(`${truck.id}-current`, currentLocation);
                  }}
                >
                  {copiedField === `${truck.id}-current` ? "Copied" : currentLocation}
                </button>
                <div className="current-dispatch-route">
                  <button
                    className="copyable-location"
                    onClick={(event) => {
                      event.stopPropagation();
                      copyDispatchField(`${truck.id}-origin`, originLabel);
                    }}
                  >
                    {copiedField === `${truck.id}-origin` ? "Copied" : originLabel}
                  </button>
                  <em>---</em>
                  <button
                    className="copyable-location"
                    onClick={(event) => {
                      event.stopPropagation();
                      copyDispatchField(`${truck.id}-destination`, destinationLabel);
                    }}
                  >
                    {copiedField === `${truck.id}-destination` ? "Copied" : destinationLabel}
                  </button>
                </div>
                <div className="current-dispatch-destination">{station.station_name} · Site {station.site_code}</div>
                <div className="current-dispatch-miles">{stationDistanceLabel(station, pointFromTruckOrNull(truck)) ?? "Miles left unavailable"}</div>
              </article>
            );
          })
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

function notificationEventIcon(eventType: string) {
  if (eventType.includes("FUEL")) return "F";
  if (eventType.includes("DISPATCH")) return "D";
  if (eventType.includes("SAMSARA")) return "!";
  return "*";
}

function eventTypeLabel(eventType: string) {
  return eventType
    .split("_")
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(" ");
}

function formatNotificationTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function filterTruck(
  truck: Truck,
  fuelPercentCap: string,
  truckFilter: TruckFilter,
  truckActiveOverrides: Record<number, boolean>
) {
  const cap = Number(fuelPercentCap);
  if (Number.isFinite(cap) && cap > 0 && cap < 100) {
    if (truck.fuel_percent == null || truck.fuel_percent < 1 || truck.fuel_percent > cap) return false;
  }
  if (truckFilter === "active") return effectiveTruckActive(truck, truckActiveOverrides);
  if (truckFilter === "inactive") return !effectiveTruckActive(truck, truckActiveOverrides);
  return true;
}

function effectiveTruckActive(truck: Truck, truckActiveOverrides: Record<number, boolean>) {
  return truckActiveOverrides[truck.id] ?? truck.active;
}

function filterDispatchStatus(
  truck: Truck,
  truckFilter: TruckFilter,
  dispatchAssignments: Record<number, number>
) {
  if (truckFilter === "dispatched") return Boolean(dispatchAssignments[truck.id]);
  if (truckFilter === "not_dispatched") return !dispatchAssignments[truck.id];
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

function truckFreshness(truck: Truck) {
  const timestamp = truck.last_samsara_update_at ?? truck.last_samsara_sync_at;
  if (!timestamp) return { status: "offline", label: "Offline" };
  const ageMinutes = (Date.now() - new Date(timestamp).getTime()) / 60000;
  if (!Number.isFinite(ageMinutes) || ageMinutes >= 5) return { status: "offline", label: "Offline" };
  if (ageMinutes >= 2) return { status: "stale", label: "Stale" };
  return { status: "live", label: "Live" };
}

function nearestStation(truck: Truck, stations: Station[]) {
  if (truck.latitude == null || truck.longitude == null) return stations[0] ?? null;
  return [...stations].sort((a, b) => distanceMiles(truck, a) - distanceMiles(truck, b))[0] ?? null;
}

function normalizeMiles(value: string, fallback: number) {
  const miles = Number(value);
  return Number.isFinite(miles) && miles > 0 ? miles : fallback;
}

function stationCopyMessage(station: Station, origin: GeoPoint | null) {
  const distance = origin ? Math.round(distanceMiles(origin, station)) : null;
  const distanceLine = distance == null || !Number.isFinite(distance)
    ? "Distance unavailable"
    : `${distance} ${distance === 1 ? "mile" : "miles"} away`;
  return [
    `${station.station_name} ${station.site_code}`,
    "",
    `${station.address} ${station.city}, ${station.state}`,
    "",
    `https://www.google.com/maps/search/?api=1&query=${station.latitude},${station.longitude}`,
    "",
    `Price: ${stationPriceText(station)}`,
    "",
    distanceLine,
    "",
    "Driver Good day sir, We hope you are doing well.",
    "Please fill up from this station.",
  ].join("\n");
}

function stationDistanceLabel(station: Station, origin: GeoPoint | null) {
  if (!origin) return null;
  const distance = Math.round(distanceMiles(origin, station));
  if (!Number.isFinite(distance)) return null;
  return `${distance} ${distance === 1 ? "mile" : "miles"} away`;
}

function stationPriceText(station: Station) {
  const price = station.latest_price?.your_price ?? station.latest_price?.discount_price;
  if (!price) return "--";
  const numericPrice = Number(price);
  return Number.isFinite(numericPrice) ? `$${numericPrice.toFixed(2)}` : `$${price}`;
}

async function writeClipboardText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
  }
}

function dispatchOriginFromTruck(truck: Truck): DispatchOrigin | null {
  const point = pointFromTruckOrNull(truck);
  if (!point) return null;
  return {
    ...point,
    label: truckLocationLabel(truck) ?? point.label,
    capturedAt: new Date().toISOString(),
  };
}

function dispatchOriginLabel(origin: DispatchOrigin | null) {
  if (!origin) return "Dispatch origin pending";
  if (/^Unit\s+/i.test(origin.label)) {
    return `GPS ${formatCoordinate(origin.latitude)}, ${formatCoordinate(origin.longitude)}`;
  }
  return origin.label;
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

function loadDispatchOrigins(): Record<number, DispatchOrigin> {
  try {
    const stored = window.localStorage.getItem(DISPATCH_ORIGIN_STORAGE_KEY);
    if (!stored) return {};
    const parsed = JSON.parse(stored) as Record<string, Partial<DispatchOrigin>>;
    return Object.fromEntries(
      Object.entries(parsed)
        .map(([truckId, origin]) => [Number(truckId), origin] as const)
        .filter(
          ([truckId, origin]) =>
            Number.isFinite(truckId) &&
            typeof origin.label === "string" &&
            Number.isFinite(origin.latitude) &&
            Number.isFinite(origin.longitude)
        )
        .map(([truckId, origin]) => [
          truckId,
          {
            label: origin.label as string,
            latitude: origin.latitude as number,
            longitude: origin.longitude as number,
            capturedAt: typeof origin.capturedAt === "string" ? origin.capturedAt : new Date().toISOString(),
          },
        ])
    );
  } catch {
    return {};
  }
}

function loadTruckActiveOverrides(): Record<number, boolean> {
  try {
    const stored = window.localStorage.getItem(TRUCK_ACTIVE_STORAGE_KEY);
    if (!stored) return {};
    const parsed = JSON.parse(stored) as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(parsed)
        .map(([truckId, active]) => [Number(truckId), Boolean(active)] as const)
        .filter(([truckId]) => Number.isFinite(truckId))
    );
  } catch {
    return {};
  }
}

function loadDashboardSettings(): DashboardSettings {
  try {
    const stored = window.localStorage.getItem(DASHBOARD_SETTINGS_STORAGE_KEY);
    if (!stored) return DEFAULT_DASHBOARD_SETTINGS;
    const parsed = JSON.parse(stored) as Partial<DashboardSettings>;
    return {
      theme: parsed.theme && ["blue", "coffee", "charcoal", "white", "pitch"].includes(parsed.theme)
        ? parsed.theme
        : DEFAULT_DASHBOARD_SETTINGS.theme,
      notifications: {
        ...DEFAULT_DASHBOARD_SETTINGS.notifications,
        ...(parsed.notifications ?? {}),
      },
    };
  } catch {
    return DEFAULT_DASHBOARD_SETTINGS;
  }
}

function notificationAllowed(
  notification: NotificationEvent,
  preferences: DashboardSettings["notifications"]
) {
  const type = notification.event_type.toLowerCase();
  if (type.includes("fuel_jump") || type.includes("refuel") || type.includes("jump")) return preferences.fuelJump;
  if (type.includes("fuel")) return preferences.fuel;
  if (type.includes("dispatch") || type.includes("arrived") || type.includes("missed")) return preferences.dispatch;
  if (type.includes("samsara")) return preferences.samsara;
  return preferences.system;
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

function pointFromTruckOrNull(truck: Truck): GeoPoint | null {
  if (truck.latitude == null || truck.longitude == null) return null;
  return {
    label: truckLocationLabel(truck) ?? `GPS ${formatCoordinate(truck.latitude)}, ${formatCoordinate(truck.longitude)}`,
    latitude: truck.latitude,
    longitude: truck.longitude,
  };
}

function truckLocationLabel(truck: Truck) {
  if (truck.current_city && truck.current_state) return `${truck.current_city}, ${truck.current_state}`;
  if (truck.latitude != null && truck.longitude != null) {
    return `GPS ${formatCoordinate(truck.latitude)}, ${formatCoordinate(truck.longitude)}`;
  }
  return null;
}

function formatCoordinate(value: number) {
  return value.toFixed(4);
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
