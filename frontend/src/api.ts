import type { SamsaraSyncResult, SamsaraTestResult, Station, Truck } from "./types";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "/api";

export async function fetchStations(): Promise<Station[]> {
  const response = await fetch(`${API_BASE}/stations?limit=5000`);
  if (!response.ok) throw new Error("Failed to load stations");
  const payload = await response.json();
  return payload.items;
}

export async function fetchTrucks(): Promise<Truck[]> {
  const response = await fetch(`${API_BASE}/trucks?limit=1000`);
  if (!response.ok) throw new Error("Failed to load trucks");
  const payload = await response.json();
  return payload.items;
}

export async function fetchSamsaraTest(): Promise<SamsaraTestResult> {
  const response = await fetch(`${API_BASE}/samsara/test`);
  if (!response.ok) throw new Error("Failed to test Samsara connection");
  return response.json();
}

export async function syncSamsara(): Promise<SamsaraSyncResult> {
  const response = await fetch(`${API_BASE}/samsara/sync`, { method: "POST" });
  if (!response.ok) throw new Error("Failed to sync Samsara");
  return response.json();
}
