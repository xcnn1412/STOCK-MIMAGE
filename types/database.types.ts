
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      activity_logs: {
        Row: ActivityLog
        Insert: Partial<ActivityLog>
        Update: Partial<ActivityLog>
      }
      events: {
        Row: Event
        Insert: Partial<Event>
        Update: Partial<Event>
      }
      event_closures: {
        Row: EventClosure
        Insert: Partial<EventClosure>
        Update: Partial<EventClosure>
      }
      items: {
        Row: Item
        Insert: Partial<Item>
        Update: Partial<Item>
      }
      kits: {
        Row: Kit
        Insert: Partial<Kit>
        Update: Partial<Kit>
      }
      kit_contents: {
        Row: KitContent
        Insert: Partial<KitContent>
        Update: Partial<KitContent>
      }
      kit_templates: {
        Row: KitTemplate
        Insert: Partial<KitTemplate>
        Update: Partial<KitTemplate>
      }
      kit_template_contents: {
        Row: KitTemplateContent
        Insert: Partial<KitTemplateContent>
        Update: Partial<KitTemplateContent>
      }
      profiles: {
        Row: Profile
        Insert: Partial<Profile>
        Update: Partial<Profile>
      }
      login_logs: {
        Row: LoginLog
        Insert: Partial<LoginLog>
        Update: Partial<LoginLog>
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
  }
}

// Database entity types for the Stock Management application
// These types reflect the Supabase database schema

// ============================================================================
// Core Entities
// ============================================================================

export interface Event {
  id: string
  name: string
  location: string | null
  staff: string | null
  event_date: string
  status?: 'pending' | 'in_progress' | 'completed' | 'cancelled'
  created_at?: string
  kits?: Kit[]
}

export interface Kit {
  id: string
  name: string
  description: string | null
  event_id: string | null
  created_at?: string
  event?: Event | null
  kit_contents?: KitContent[]
}

export interface Item {
  id: string
  name: string
  serial_number: string | null
  description: string | null
  status: 'available' | 'in_use' | 'maintenance' | 'lost' | 'damaged' | 'out_of_stock'
  image_url: string | null
  category: string | null
  quantity?: number
  price?: number | null
  created_at?: string
  kit_contents?: KitContent[]
}

export interface KitContent {
  id: string
  kit_id: string
  item_id: string
  quantity: number
  items?: Item
}

// ============================================================================
// User & Authentication
// ============================================================================

export interface Profile {
  id: string
  phone_number?: string
  phone?: string
  full_name?: string
  selfie_url?: string
  display_name?: string | null
  role: 'admin' | 'staff'
  is_approved: boolean
  active_session_id?: string | null
  latest_login_at?: string
  latest_login_photo_url?: string | null
  last_login_at?: string | null
  last_login_selfie_url?: string | null
  created_at?: string
}

// ============================================================================
// Activity & Logging
// ============================================================================

export interface ActivityLog {
  id: string
  action: string
  details: {
    login_at?: string
    latitude?: number | null
    longitude?: number | null
    [key: string]: unknown
  }
  user_id: string | null
  created_at: string
  location?: string
  profiles?: Pick<Profile, 'display_name' | 'phone_number'>
}

export interface LoginLog {
  id: string
  user_id: string
  active_session_id?: string | null
  latitude?: number | null
  longitude?: number | null
  selfie_url?: string | null
  created_at?: string
}

// ============================================================================
// Event Closures (Historical Snapshots)
// ============================================================================

export interface EventClosure {
  id: string
  event_name: string
  event_date: string | null
  event_location: string | null
  closed_by: string
  closed_at: string
  kits_snapshot: KitSnapshot[]
  notes?: string | null
  image_urls?: string[] | null
  profiles?: Pick<Profile, 'display_name' | 'phone_number' | 'full_name'>
  // Alias for frontend convenience if mapped, or direct relation
  closer?: Pick<Profile, 'display_name' | 'phone_number' | 'full_name'>
}

export interface KitSnapshot {
  kitId: string
  kitName: string
  items: ItemSnapshot[]
}

export interface ItemSnapshot {
  itemId: string
  itemName: string
  serialNumber: string | null
  status: string
  quantity: number
  imageUrl: string | null
}

// ============================================================================
// Kit Templates (Example Kits)
// ============================================================================

export interface KitTemplate {
  id: string
  name: string
  description: string | null
  type?: string
  created_at?: string
  kit_template_contents?: KitTemplateContent[]
}

export interface KitTemplateContent {
  id: string
  template_id: string
  item_name: string
  quantity: number
  status: 'ready' | 'in-progress' | 'pending'
  notes?: string | null
}

// ============================================================================
// Action State Types (for Server Actions)
// ============================================================================

export interface ActionState {
  error?: string
  success?: boolean
  message?: string
}

// ============================================================================
// Utility Types
// ============================================================================

/** Kit with its contents and nested item data */
export type KitWithContents = Kit & {
  kit_contents: (KitContent & { items: Item })[]
}

/** Event with assigned kits */
export type EventWithKits = Event & {
  kits: Kit[]
}

/** Item status for return processing */
export interface ItemStatusUpdate {
  itemId: string
  status: string
}

/** Items grouped by kit for return checklist */
export type ItemsByKit = Record<string, { 
  kitName: string
  items: (Item & { quantity?: number })[] 
}>
