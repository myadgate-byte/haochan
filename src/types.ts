import { Timestamp } from 'firebase/firestore';

export type ReservationStatus = 'pending' | 'confirmed' | 'cancelled' | 'completed' | 'noshow';
export type TableType = 'hall' | 'window' | 'private_room';

// Validation constants synchronized verbatim with firebase-blueprint.json & firestore.rules
export const VALIDATION_RULES = {
  ID_MAX_LENGTH: 128,
  ID_PATTERN: /^[a-zA-Z0-9_\-]+$/,
  NAME_MIN_LENGTH: 1,
  NAME_MAX_LENGTH: 60,
  EMAIL_MIN_LENGTH: 3,
  EMAIL_MAX_LENGTH: 120,
  PHONE_MIN_LENGTH: 7,
  PHONE_MAX_LENGTH: 30,
  PHONE_PATTERN: /^[0-9\-+() ]+$/,
  DATE_LENGTH: 10,
  DATE_PATTERN: /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/,
  TIME_LENGTH: 5,
  TIME_PATTERN: /^[0-9]{2}:[0-9]{2}$/,
  PARTY_MIN: 1,
  PARTY_MAX: 12,
  PRESELECTED_MENU_MAX_LENGTH: 120,
  NOTES_MAX_LENGTH: 300,
  ADMIN_MEMO_MAX_LENGTH: 300,
  ADDRESS_MAX_LENGTH: 150,
  OPEN_HOURS_MAX_LENGTH: 120,
  REGULAR_CLOSED_MAX_LENGTH: 40,
  NOTICE_MAX_LENGTH: 300,
} as const;

export interface UserProfile {
  uid: string;
  name: string;
  email: string;
  phone: string;
  createdAt: Timestamp | string;
  updatedAt: Timestamp | string;
}

export interface Reservation {
  id: string;
  userId: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  partySize: number;
  tableType: TableType;
  preselectedMenu: string;
  notes: string;
  adminMemo: string;
  status: ReservationStatus;
  createdAt?: Timestamp | string;
  updatedAt?: Timestamp | string;
  isSimulation?: boolean;
}

export interface StoreSettings {
  maxSeatsPerSlot: number;
  maxTablesPerSlot: number;
  maxPartySize: number;
  availableSlots: string[];
  closedDates: string[];
  blockedSlotKeys: string[]; // format: YYYY-MM-DD_HH:MM
  regularClosedDay: string;
  openHoursText: string;
  phone: string;
  address: string;
  notice: string;
  updatedAt?: Timestamp | string;
}

export interface DailyAvailability {
  date: string;
  totalActiveBookings: number;
  totalActiveGuests: number;
  slotSummary: string; // JSON or compact key:count pairs up to 600 chars
  updatedAt?: Timestamp | string;
}

export type MenuCategory = 'all' | 'signature' | 'course' | 'meal' | 'pairing';

export interface MenuItem {
  id: string;
  name: string;
  subtitle: string;
  category: Exclude<MenuCategory, 'all'>;
  categoryLabel: string;
  price: number;
  servingInfo: string;
  description: string;
  ingredients: string;
  chefNote: string;
  spicyLevel: 0 | 1 | 2;
  isSignature?: boolean;
  imageUrl: string;
  artworkVariant: 'guobaorou' | 'dongporou' | 'jjamppong' | 'dimsum' | 'course' | 'mabo';
}

export interface DiningSpace {
  id: TableType;
  name: string;
  capacityText: string;
  subtitle: string;
  description: string;
  features: string[];
  recommendedFor: string;
  imageUrl: string;
}
