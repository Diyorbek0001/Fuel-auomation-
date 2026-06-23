import type {
  NotificationListResult,
  NotificationStatus,
  NotificationStreamEvent,
  SamsaraSyncResult,
  SamsaraTestResult,
  Station,
  Truck,
  TruckStreamEvent,
  User,
  UserCreateInput,
  UserUpdateInput,
} from "./types";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "/api";
let authToken = window.localStorage.getItem("fuel-auth-token") ?? "";

export function setAuthToken(token: string) {
  authToken = token;
  if (token) window.localStorage.setItem("fuel-auth-token", token);
  else window.localStorage.removeItem("fuel-auth-token");
}

export function getAuthToken() {
  return authToken;
}

function authHeaders(extra?: HeadersInit): HeadersInit {
  return {
    ...(extra ?? {}),
    ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
  };
}

async function parseError(response: Response, fallback: string) {
  try {
    const payload = await response.json();
    return payload.detail ?? fallback;
  } catch {
    return fallback;
  }
}

export async function login(username: string, password: string): Promise<User> {
  const response = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!response.ok) throw new Error(await parseError(response, "Login failed"));
  const payload = await response.json();
  setAuthToken(payload.token);
  return payload.user;
}

export async function logout(): Promise<void> {
  await fetch(`${API_BASE}/auth/logout`, { method: "POST", headers: authHeaders() });
  setAuthToken("");
}

export async function fetchCurrentUser(): Promise<User> {
  const response = await fetch(`${API_BASE}/auth/me`, { headers: authHeaders() });
  if (!response.ok) throw new Error(await parseError(response, "Session expired"));
  return response.json();
}

export async function fetchUsers(): Promise<User[]> {
  const response = await fetch(`${API_BASE}/auth/users`, { headers: authHeaders() });
  if (!response.ok) throw new Error(await parseError(response, "Failed to load users"));
  const payload = await response.json();
  return payload.items;
}

export async function createUser(payload: UserCreateInput): Promise<User> {
  const response = await fetch(`${API_BASE}/auth/users`, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(await parseError(response, "Failed to create user"));
  return response.json();
}

export async function updateUser(userId: number, payload: UserUpdateInput): Promise<User> {
  const response = await fetch(`${API_BASE}/auth/users/${userId}`, {
    method: "PATCH",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(await parseError(response, "Failed to update user"));
  return response.json();
}

export async function fetchStations(): Promise<Station[]> {
  const response = await fetch(`${API_BASE}/stations?limit=5000`, { headers: authHeaders() });
  if (!response.ok) throw new Error("Failed to load stations");
  const payload = await response.json();
  return payload.items;
}

export async function fetchTrucks(): Promise<Truck[]> {
  const response = await fetch(`${API_BASE}/trucks?limit=1000`, { headers: authHeaders() });
  if (!response.ok) throw new Error("Failed to load trucks");
  const payload = await response.json();
  return payload.items;
}

export async function fetchSamsaraTest(): Promise<SamsaraTestResult> {
  const response = await fetch(`${API_BASE}/samsara/test`, { headers: authHeaders() });
  if (!response.ok) throw new Error("Failed to test Samsara connection");
  return response.json();
}

export async function syncSamsara(): Promise<SamsaraSyncResult> {
  const response = await fetch(`${API_BASE}/samsara/sync`, { method: "POST", headers: authHeaders() });
  if (!response.ok) throw new Error("Failed to sync Samsara");
  return response.json();
}

export async function assignDispatch(truckId: number, stationId: number): Promise<void> {
  const response = await fetch(`${API_BASE}/dispatches/assign`, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ truck_id: truckId, station_id: stationId }),
  });
  if (!response.ok) throw new Error(await parseError(response, "Failed to assign dispatch"));
}

export async function cancelDispatch(truckId: number): Promise<void> {
  const response = await fetch(`${API_BASE}/dispatches/cancel`, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ truck_id: truckId }),
  });
  if (!response.ok) throw new Error(await parseError(response, "Failed to cancel dispatch"));
}

export async function setTruckActive(truckId: number, active: boolean): Promise<void> {
  const response = await fetch(`${API_BASE}/trucks/${truckId}/active?active=${active ? "true" : "false"}`, {
    method: "PATCH",
    headers: authHeaders(),
  });
  if (!response.ok) throw new Error(await parseError(response, "Failed to update unit status"));
}

export async function fetchNotifications(status?: NotificationStatus): Promise<NotificationListResult> {
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  const query = params.toString();
  const response = await fetch(`${API_BASE}/notifications${query ? `?${query}` : ""}`, { headers: authHeaders() });
  if (!response.ok) throw new Error("Failed to load notifications");
  return response.json();
}

export async function fetchUnreadNotificationCount(): Promise<number> {
  const response = await fetch(`${API_BASE}/notifications/unread-count`, { headers: authHeaders() });
  if (!response.ok) throw new Error("Failed to load unread notification count");
  const payload = await response.json();
  return payload.unread_count;
}

export async function markNotificationsRead(notificationIds: number[]): Promise<number> {
  const response = await fetch(`${API_BASE}/notifications/mark-read`, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ notification_ids: notificationIds }),
  });
  if (!response.ok) throw new Error("Failed to mark notifications read");
  const payload = await response.json();
  return payload.unread_count;
}

export async function archiveNotifications(notificationIds: number[]): Promise<number> {
  const response = await fetch(`${API_BASE}/notifications/archive`, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ notification_ids: notificationIds }),
  });
  if (!response.ok) throw new Error("Failed to archive notifications");
  const payload = await response.json();
  return payload.unread_count;
}

export function subscribeToNotifications(onEvent: (event: NotificationStreamEvent) => void): EventSource {
  const source = new EventSource(`${API_BASE}/notifications/stream?token=${encodeURIComponent(authToken)}`);
  source.addEventListener("notification", (event) => onEvent(JSON.parse(event.data)));
  source.addEventListener("unread_count", (event) => onEvent(JSON.parse(event.data)));
  return source;
}

export function subscribeToTruckUpdates(onEvent: (event: TruckStreamEvent) => void): EventSource {
  const source = new EventSource(`${API_BASE}/trucks/stream?token=${encodeURIComponent(authToken)}`);
  source.addEventListener("truck_update", (event) => onEvent(JSON.parse(event.data)));
  return source;
}
