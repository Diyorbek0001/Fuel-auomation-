export type StationPrice = {
  fuel_type: string;
  retail_price: string | null;
  discount_price: string | null;
  your_price: string;
  effective_date: string;
};

export type Station = {
  id: number;
  site_code: string;
  store_number: string;
  brand: string;
  station_name: string;
  address: string;
  city: string;
  state: string;
  zip: string | null;
  latitude: number;
  longitude: number;
  phone: string | null;
  parking_spaces_count: number | null;
  fuel_lane_count: number | null;
  shower_count: number | null;
  amenities: string | null;
  restaurants: string | null;
  latest_price: StationPrice | null;
};

export type DriverSummary = {
  id: number;
  name: string;
};

export type Truck = {
  id: number;
  unit_number: string;
  fuel_percent: number | null;
  latitude: number | null;
  longitude: number | null;
  odometer_miles: number | null;
  current_city: string | null;
  current_state: string | null;
  destination: string | null;
  active: boolean;
  samsara_account_name: string | null;
  driver: DriverSummary | null;
};

export type SamsaraTestResult = {
  api_token_configured: boolean;
  connection_status: string;
  vehicle_count: number;
  sample_vehicle_names: string[];
  latest_error: string | null;
};

export type SamsaraSyncResult = {
  synced_accounts: number;
  vehicles_read: number;
  vehicles_updated: number;
};

export type NotificationStatus = "unread" | "read" | "archived";

export type NotificationEvent = {
  id: number;
  truck_id: number;
  dispatch_id: number | null;
  event_type: string;
  title: string;
  message: string;
  status: NotificationStatus;
  read_at: string | null;
  archived_at: string | null;
  created_at: string;
  sent_at: string | null;
  payload_json: Record<string, unknown>;
  unit_number: string | null;
};

export type NotificationListResult = {
  total: number;
  items: NotificationEvent[];
};

export type NotificationStreamEvent =
  | {
      type: "notification";
      notification: NotificationEvent;
      unread_count: number;
    }
  | {
      type: "unread_count";
      unread_count: number;
    };
