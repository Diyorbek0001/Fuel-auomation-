import type {
  NotificationListResult,
  NotificationStatus,
  NotificationStreamEvent,
  SamsaraSyncResult,
  SamsaraTestResult,
  Station,
  Truck,
} from "./types";

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

export async function fetchNotifications(status?: NotificationStatus): Promise<NotificationListResult> {
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  const query = params.toString();
  const response = await fetch(`${API_BASE}/notifications${query ? `?${query}` : ""}`);
  if (!response.ok) throw new Error("Failed to load notifications");
  return response.json();
}

export async function fetchUnreadNotificationCount(): Promise<number> {
  const response = await fetch(`${API_BASE}/notifications/unread-count`);
  if (!response.ok) throw new Error("Failed to load unread notification count");
  const payload = await response.json();
  return payload.unread_count;
}

export async function markNotificationsRead(notificationIds: number[]): Promise<number> {
  const response = await fetch(`${API_BASE}/notifications/mark-read`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ notification_ids: notificationIds }),
  });
  if (!response.ok) throw new Error("Failed to mark notifications read");
  const payload = await response.json();
  return payload.unread_count;
}

export async function archiveNotifications(notificationIds: number[]): Promise<number> {
  const response = await fetch(`${API_BASE}/notifications/archive`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ notification_ids: notificationIds }),
  });
  if (!response.ok) throw new Error("Failed to archive notifications");
  const payload = await response.json();
  return payload.unread_count;
}

export function subscribeToNotifications(onEvent: (event: NotificationStreamEvent) => void): EventSource {
  const source = new EventSource(`${API_BASE}/notifications/stream`);
  source.addEventListener("notification", (event) => onEvent(JSON.parse(event.data)));
  source.addEventListener("unread_count", (event) => onEvent(JSON.parse(event.data)));
  return source;
}
