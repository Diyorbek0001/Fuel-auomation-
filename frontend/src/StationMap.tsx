import L from "leaflet";
import "leaflet.markercluster";
import { useEffect, useRef, useState } from "react";
import { MapContainer, TileLayer, useMap } from "react-leaflet";
import type { Station, Truck } from "./types";

const USA_BOUNDS = L.latLngBounds([24.4, -124.9], [49.4, -66.9]);

export type SearchPin = {
  id: string;
  label: string;
  latitude: number;
  longitude: number;
  tone: "search" | "from" | "to";
};

type Props = {
  stations: Station[];
  trucks: Truck[];
  selected: Station | null;
  focusedStation: Station | null;
  selectedTruck: Truck | null;
  showTrucks: boolean;
  showLocations: boolean;
  mapStyle: "dark" | "light";
  searchPins: SearchPin[];
  routePath: [number, number][];
  dispatchRoutePath: [number, number][];
  searchRadius: { center: [number, number]; miles: number } | null;
  canDispatch: boolean;
  onSelect: (station: Station) => void;
  onDispatch: (station: Station) => void;
  onCopy: (station: Station) => void;
};

const MAP_TILES = {
  dark: {
    attribution: "&copy; OpenStreetMap contributors &copy; CARTO",
    url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
  },
  light: {
    attribution: "&copy; OpenStreetMap contributors &copy; CARTO",
    url: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
  },
};

export function StationMap({
  stations,
  trucks,
  selected,
  focusedStation,
  selectedTruck,
  showTrucks,
  showLocations,
  mapStyle,
  searchPins,
  routePath,
  dispatchRoutePath,
  searchRadius,
  canDispatch,
  onSelect,
  onDispatch,
  onCopy,
}: Props) {
  const tiles = MAP_TILES[mapStyle];

  return (
    <MapContainer
      className="dispatch-map"
      center={[39, -96]}
      zoom={4}
      minZoom={3}
      maxZoom={14}
      maxBounds={USA_BOUNDS.pad(0.25)}
      scrollWheelZoom
      zoomControl={false}
      attributionControl
    >
      <TileLayer
        key={mapStyle}
        attribution={tiles.attribution}
        url={tiles.url}
      />
      <MapControls />
      <FitStations stations={showLocations ? stations : []} />
      <SearchOverlay pins={searchPins} routePath={routePath} searchRadius={searchRadius} />
      <SelectedFocus focusedStation={focusedStation} selectedTruck={selectedTruck} />
      <DispatchRouteOverlay routePath={dispatchRoutePath} />
      {showTrucks || selectedTruck ? (
        <TruckLayer trucks={showTrucks ? trucks : selectedTruck ? [selectedTruck] : []} selectedTruck={selectedTruck} />
      ) : null}
      {showLocations ? (
        <ClusteredStationLayer
          stations={stations}
          trucks={trucks}
          selected={selected}
          focusedStation={focusedStation}
          selectedTruck={selectedTruck}
          showTrucks={showTrucks}
          showLocations={showLocations}
          mapStyle={mapStyle}
          searchPins={searchPins}
          routePath={routePath}
          dispatchRoutePath={dispatchRoutePath}
          searchRadius={searchRadius}
          canDispatch={canDispatch}
          onSelect={onSelect}
          onDispatch={onDispatch}
          onCopy={onCopy}
        />
      ) : null}
    </MapContainer>
  );
}

function MapControls() {
  const map = useMap();

  useEffect(() => {
    const zoomControl = L.control.zoom({ position: "topright" }).addTo(map);
    return () => {
      zoomControl.remove();
    };
  }, [map]);

  return null;
}

function FitStations({ stations }: { stations: Station[] }) {
  const map = useMap();
  const fittedRef = useRef(false);

  useEffect(() => {
    if (fittedRef.current || stations.length === 0) return;
    const bounds = L.latLngBounds(stations.map((station) => [station.latitude, station.longitude]));
    map.fitBounds(bounds, { padding: [36, 36], maxZoom: 5 });
    fittedRef.current = true;
  }, [map, stations]);

  return null;
}

function SearchOverlay({
  pins,
  routePath,
  searchRadius,
}: {
  pins: SearchPin[];
  routePath: [number, number][];
  searchRadius: { center: [number, number]; miles: number } | null;
}) {
  const map = useMap();
  const layerRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    layerRef.current?.removeFrom(map);
    const layer = L.layerGroup();

    if (routePath.length > 1) {
      L.polyline(routePath, {
        color: "#38bdf8",
        weight: 4,
        opacity: 0.9,
        dashArray: "8 8",
      }).addTo(layer);
    }

    if (searchRadius) {
      L.circle(searchRadius.center, {
        radius: searchRadius.miles * 1609.344,
        color: "#2dd47f",
        fillColor: "#2dd47f",
        fillOpacity: 0.06,
        opacity: 0.55,
        weight: 2,
      }).addTo(layer);
    }

    pins.forEach((pin) => {
      L.marker([pin.latitude, pin.longitude], {
        icon: searchPinIcon(pin.tone),
        title: pin.label,
        zIndexOffset: 1200,
      }).bindPopup(`
        <div class="truck-popup-card">
          <div class="fuel-popup-kicker">${pin.tone === "from" ? "A" : pin.tone === "to" ? "B" : "Search"}</div>
          <div class="fuel-popup-title">${escapeHtml(pin.label)}</div>
        </div>
      `, { className: "dispatch-popup", minWidth: 220 }).addTo(layer);
    });

    layer.addTo(map);
    layerRef.current = layer;

    const boundsItems: [number, number][] = [
      ...pins.map((pin) => [pin.latitude, pin.longitude] as [number, number]),
      ...routePath,
    ];
    if (searchRadius) boundsItems.push(searchRadius.center);
    if (boundsItems.length > 1) {
      map.fitBounds(L.latLngBounds(boundsItems), { padding: [56, 56], maxZoom: 10 });
    } else if (boundsItems.length === 1) {
      map.flyTo(boundsItems[0], Math.max(map.getZoom(), 8), { duration: 0.75 });
    }

    return () => {
      layer.removeFrom(map);
      layerRef.current = null;
    };
  }, [map, pins, routePath, searchRadius]);

  return null;
}

function SelectedFocus({ focusedStation, selectedTruck }: { focusedStation: Station | null; selectedTruck: Truck | null }) {
  const map = useMap();

  useEffect(() => {
    if (focusedStation) {
      map.flyTo([focusedStation.latitude, focusedStation.longitude], Math.max(map.getZoom(), 8), {
        duration: 0.75,
      });
      return;
    }
    if (selectedTruck?.latitude != null && selectedTruck.longitude != null) {
      map.flyTo([selectedTruck.latitude, selectedTruck.longitude], Math.max(map.getZoom(), 7), {
        duration: 0.75,
      });
      return;
    }
  }, [map, focusedStation, selectedTruck]);

  return null;
}

function DispatchRouteOverlay({ routePath }: { routePath: [number, number][] }) {
  const map = useMap();
  const layerRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    layerRef.current?.removeFrom(map);
    const layer = L.layerGroup();
    if (routePath.length > 1) {
      L.polyline(routePath, {
        color: "#2dd47f",
        weight: 5,
        opacity: 0.9,
      }).addTo(layer);
      map.fitBounds(L.latLngBounds(routePath), { padding: [64, 64], maxZoom: 9 });
    }
    layer.addTo(map);
    layerRef.current = layer;
    return () => {
      layer.removeFrom(map);
      layerRef.current = null;
    };
  }, [map, routePath]);

  return null;
}

function TruckLayer({ trucks, selectedTruck }: { trucks: Truck[]; selectedTruck: Truck | null }) {
  const map = useMap();
  const layerRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    layerRef.current?.removeFrom(map);
    const layer = L.layerGroup();
    trucks
      .filter((truck) => truck.latitude != null && truck.longitude != null)
      .forEach((truck) => {
        const marker = L.marker([truck.latitude as number, truck.longitude as number], {
          icon: truckIcon(selectedTruck?.id === truck.id),
          title: `Unit ${truck.unit_number}`,
          zIndexOffset: selectedTruck?.id === truck.id ? 1000 : 900,
        }).bindPopup(`
          <div class="truck-popup-card">
            <div class="fuel-popup-kicker">Truck</div>
            <div class="fuel-popup-title">Unit ${escapeHtml(truck.unit_number)}</div>
            <div class="fuel-popup-address">${escapeHtml(truck.driver?.name ?? "Unassigned driver")}</div>
            <div class="fuel-popup-address">Fuel: ${truck.fuel_percent == null ? "--" : `${Math.round(truck.fuel_percent)}%`}</div>
          </div>
        `, { className: "dispatch-popup", minWidth: 220 });
        marker.addTo(layer);
      });
    layer.addTo(map);
    layerRef.current = layer;
    return () => {
      layer.removeFrom(map);
      layerRef.current = null;
    };
  }, [map, selectedTruck, trucks]);

  return null;
}

function ClusteredStationLayer({ stations, selected, selectedTruck, canDispatch, onSelect, onDispatch, onCopy }: Props) {
  const map = useMap();
  const clusterRef = useRef<L.MarkerClusterGroup | null>(null);
  const markersBySite = useRef<Map<string, L.Marker>>(new Map());
  const onSelectRef = useRef(onSelect);
  const onDispatchRef = useRef(onDispatch);
  const onCopyRef = useRef(onCopy);
  const [zoom, setZoom] = useState(map.getZoom());

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    onDispatchRef.current = onDispatch;
  }, [onDispatch]);

  useEffect(() => {
    onCopyRef.current = onCopy;
  }, [onCopy]);

  useEffect(() => {
    const handleZoom = () => setZoom(map.getZoom());
    map.on("zoomend", handleZoom);
    return () => {
      map.off("zoomend", handleZoom);
    };
  }, [map]);

  useEffect(() => {
    const cluster = L.markerClusterGroup({
      chunkedLoading: true,
      showCoverageOnHover: false,
      spiderfyOnMaxZoom: true,
      disableClusteringAtZoom: 8,
      maxClusterRadius: 48,
      iconCreateFunction: (clusterInstance) => {
        const count = clusterInstance.getChildCount();
        const size = count >= 100 ? "large" : count >= 25 ? "medium" : "small";
        return L.divIcon({
          html: `<span>${count}</span>`,
          className: `fuel-cluster fuel-cluster-${size}`,
          iconSize: L.point(size === "large" ? 28 : size === "medium" ? 26 : 24, size === "large" ? 28 : size === "medium" ? 26 : 24),
        });
      },
    });
    clusterRef.current = cluster;
    map.addLayer(cluster);
    return () => {
      map.removeLayer(cluster);
      clusterRef.current = null;
      markersBySite.current.clear();
    };
  }, [map]);

  useEffect(() => {
    const cluster = clusterRef.current;
    if (!cluster) return;
    cluster.clearLayers();
    markersBySite.current.clear();

    stations.forEach((station) => {
      const marker = L.marker([station.latitude, station.longitude], {
        icon: stationIcon(station, station.site_code === selected?.site_code, zoom),
        title: `${station.site_code} ${station.station_name}`,
      });
      marker.bindPopup(popupHtml(station, Boolean(selectedTruck), canDispatch), {
        className: "dispatch-popup",
        minWidth: 270,
        maxWidth: 320,
      });
      marker.on("click", () => onSelectRef.current(station));
      marker.on("popupopen", () => {
        const dispatchButton = document.querySelector<HTMLButtonElement>(`[data-dispatch-site="${station.site_code}"]`);
        const copyButton = document.querySelector<HTMLButtonElement>(`[data-copy-site="${station.site_code}"]`);
        dispatchButton?.addEventListener(
          "click",
          () => {
            if (selectedTruck && canDispatch) {
              onDispatchRef.current(station);
              return;
            }
            onSelectRef.current(station);
          },
          { once: true }
        );
        copyButton?.addEventListener("click", () => {
          onCopyRef.current(station);
          copyButton.textContent = "Copied";
        });
      });
      markersBySite.current.set(station.site_code, marker);
      cluster.addLayer(marker);
    });
  }, [stations, selected, selectedTruck, canDispatch, zoom]);

  return null;
}

function stationIcon(station: Station, selected: boolean, zoom: number) {
  if (zoom >= 11) {
    return L.divIcon({
      className: selected ? "fuel-price-marker fuel-price-marker-selected" : "fuel-price-marker",
      html: `<span>$${escapeHtml(shortPrice(station))}</span>`,
      iconSize: [54, 22],
      iconAnchor: [27, 11],
    });
  }
  return L.divIcon({
    className: selected ? "fuel-marker fuel-marker-selected" : "fuel-marker",
    html: `<span></span>`,
    iconSize: selected ? [22, 22] : [18, 18],
    iconAnchor: selected ? [11, 11] : [9, 9],
  });
}

function shortPrice(station: Station) {
  const value = station.latest_price?.your_price;
  if (!value) return "--";
  return Number(value).toFixed(2);
}

function truckIcon(selected = false) {
  return L.divIcon({
    className: selected ? "truck-marker truck-marker-selected" : "truck-marker",
    html: `<span>●</span>`,
    iconSize: selected ? [34, 34] : [26, 26],
    iconAnchor: selected ? [17, 17] : [13, 13],
  });
}

function searchPinIcon(tone: SearchPin["tone"]) {
  return L.divIcon({
    className: `search-pin search-pin-${tone}`,
    html: `<span>${tone === "to" ? "B" : "A"}</span>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  });
}

function popupHtml(station: Station, hasSelectedTruck: boolean, canDispatch: boolean) {
  const price = station.latest_price?.your_price ? `$${station.latest_price.your_price}` : "No price";
  const dispatchLabel = canDispatch ? "Dispatch" : hasSelectedTruck ? "View Only" : "Select Unit";
  const dispatchDisabled = canDispatch ? "" : " disabled";
  return `
    <div class="fuel-popup-card">
      <div class="fuel-popup-kicker">Site ${escapeHtml(station.site_code)}</div>
      <div class="fuel-popup-title">${escapeHtml(station.station_name)}</div>
      <div class="fuel-popup-address">${escapeHtml(station.address)}</div>
      <div class="fuel-popup-address">${escapeHtml(station.city)}, ${escapeHtml(station.state)}</div>
      <div class="fuel-popup-grid">
        <div><span>Your Price</span><strong>${escapeHtml(price)}</strong></div>
        <div><span>Fuel Lanes</span><strong>${station.fuel_lane_count ?? "--"}</strong></div>
        <div><span>Parking</span><strong>${station.parking_spaces_count ?? "--"}</strong></div>
      </div>
      <div class="fuel-popup-actions">
        <button class="fuel-popup-button" data-dispatch-site="${escapeHtml(station.site_code)}"${dispatchDisabled}>
          ${dispatchLabel}
        </button>
        <button class="fuel-popup-button fuel-popup-copy-button" data-copy-site="${escapeHtml(station.site_code)}">Copy</button>
      </div>
    </div>
  `;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
