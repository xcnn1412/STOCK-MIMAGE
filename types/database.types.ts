
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
        Row: {
          id: string
          action: string
          action_type: string | null
          details: Json
          user_id: string | null
          target_user_id: string | null
          ip_address: string | null
          user_agent: string | null
          location: string | null
          latitude: number | null
          longitude: number | null
          login_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          action?: string
          action_type?: string | null
          details?: Json
          user_id?: string | null
          target_user_id?: string | null
          ip_address?: string | null
          user_agent?: string | null
          location?: string | null
          latitude?: number | null
          longitude?: number | null
          login_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          action?: string
          action_type?: string | null
          details?: Json
          user_id?: string | null
          target_user_id?: string | null
          ip_address?: string | null
          user_agent?: string | null
          location?: string | null
          latitude?: number | null
          longitude?: number | null
          login_at?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_logs_target_user_id_fkey"
            columns: ["target_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          }
        ]
      }
      events: {
        Row: {
          id: string
          name: string
          location: string | null
          staff: string | null
          event_date: string
          status: string | null
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          location?: string | null
          staff?: string | null
          event_date?: string
          status?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          location?: string | null
          staff?: string | null
          event_date?: string
          status?: string | null
          created_at?: string
        }
        Relationships: []
      }
      event_closures: {
        Row: {
          id: string
          event_name: string
          event_date: string | null
          event_location: string | null
          closed_by: string
          closed_at: string
          kits_snapshot: Json
          notes: string | null
          image_urls: Json | null
          created_at: string
        }
        Insert: {
          id?: string
          event_name: string
          event_date?: string | null
          event_location?: string | null
          closed_by: string
          closed_at?: string
          kits_snapshot?: Json
          notes?: string | null
          image_urls?: Json | null
          created_at?: string
        }
        Update: {
          id?: string
          event_name?: string
          event_date?: string | null
          event_location?: string | null
          closed_by?: string
          closed_at?: string
          kits_snapshot?: Json
          notes?: string | null
          image_urls?: Json | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_closures_closed_by_fkey"
            columns: ["closed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          }
        ]
      }
      items: {
        Row: {
          id: string
          name: string
          serial_number: string | null
          description: string | null
          status: string
          image_url: string | null
          category: string | null
          quantity: number
          price: number | null
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          serial_number?: string | null
          description?: string | null
          status?: string
          image_url?: string | null
          category?: string | null
          quantity?: number
          price?: number | null
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          serial_number?: string | null
          description?: string | null
          status?: string
          image_url?: string | null
          category?: string | null
          quantity?: number
          price?: number | null
          created_at?: string
        }
        Relationships: []
      }
      kits: {
        Row: {
          id: string
          name: string
          description: string | null
          event_id: string | null
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          description?: string | null
          event_id?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          description?: string | null
          event_id?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "kits_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          }
        ]
      }
      kit_contents: {
        Row: {
          id: string
          kit_id: string
          item_id: string
          quantity: number
        }
        Insert: {
          id?: string
          kit_id: string
          item_id: string
          quantity?: number
        }
        Update: {
          id?: string
          kit_id?: string
          item_id?: string
          quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "kit_contents_kit_id_fkey"
            columns: ["kit_id"]
            isOneToOne: false
            referencedRelation: "kits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kit_contents_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          }
        ]
      }
      kit_templates: {
        Row: {
          id: string
          name: string
          description: string | null
          type: string | null
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          description?: string | null
          type?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          description?: string | null
          type?: string | null
          created_at?: string
        }
        Relationships: []
      }
      kit_template_contents: {
        Row: {
          id: string
          template_id: string
          item_name: string
          quantity: number
          status: string | null
          notes: string | null
        }
        Insert: {
          id?: string
          template_id: string
          item_name: string
          quantity?: number
          status?: string | null
          notes?: string | null
        }
        Update: {
          id?: string
          template_id?: string
          item_name?: string
          quantity?: number
          status?: string | null
          notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "kit_template_contents_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "kit_templates"
            referencedColumns: ["id"]
          }
        ]
      }
      profiles: {
        Row: {
          id: string
          phone_number: string | null
          phone: string | null
          pin: string | null
          full_name: string | null
          selfie_url: string | null
          display_name: string | null
          role: string
          allowed_modules: Json | null
          department: string | null
          is_approved: boolean
          active_session_id: string | null
          latest_login_at: string | null
          latest_login_photo_url: string | null
          last_login_at: string | null
          last_login_selfie_url: string | null
          created_at: string
        }
        Insert: {
          id?: string
          phone_number?: string | null
          phone?: string | null
          pin?: string | null
          full_name?: string | null
          selfie_url?: string | null
          display_name?: string | null
          role?: string
          allowed_modules?: Json | null
          department?: string | null
          is_approved?: boolean
          active_session_id?: string | null
          latest_login_at?: string | null
          latest_login_photo_url?: string | null
          last_login_at?: string | null
          last_login_selfie_url?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          phone_number?: string | null
          phone?: string | null
          pin?: string | null
          full_name?: string | null
          selfie_url?: string | null
          display_name?: string | null
          role?: string
          allowed_modules?: Json | null
          department?: string | null
          is_approved?: boolean
          active_session_id?: string | null
          latest_login_at?: string | null
          latest_login_photo_url?: string | null
          last_login_at?: string | null
          last_login_selfie_url?: string | null
          created_at?: string
        }
        Relationships: []
      }
      login_logs: {
        Row: {
          id: string
          user_id: string
          active_session_id: string | null
          latitude: number | null
          longitude: number | null
          selfie_url: string | null
          login_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          active_session_id?: string | null
          latitude?: number | null
          longitude?: number | null
          selfie_url?: string | null
          login_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          active_session_id?: string | null
          latitude?: number | null
          longitude?: number | null
          selfie_url?: string | null
          login_at?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "login_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          }
        ]
      }
      event_logs: {
        Row: {
          id: string
          event_id: string | null
          item_id: string | null
          kit_id: string | null
          user_id: string | null
          action: string | null
          condition: string | null
          note: string | null
          created_at: string
        }
        Insert: {
          id?: string
          event_id?: string | null
          item_id?: string | null
          kit_id?: string | null
          user_id?: string | null
          action?: string | null
          condition?: string | null
          note?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          event_id?: string | null
          item_id?: string | null
          kit_id?: string | null
          user_id?: string | null
          action?: string | null
          condition?: string | null
          note?: string | null
          created_at?: string
        }
        Relationships: []
      }
      kpi_templates: {
        Row: {
          id: string
          name: string
          mode: string
          config: Json
          default_target: number
          target_unit: string
          description: string | null
          created_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          mode: string
          config?: Json
          default_target?: number
          target_unit?: string
          description?: string | null
          created_by?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          mode?: string
          config?: Json
          default_target?: number
          target_unit?: string
          description?: string | null
          created_by?: string | null
          created_at?: string
        }
        Relationships: []
      }
      kpi_assignments: {
        Row: {
          id: string
          template_id: string | null
          assigned_to: string
          custom_name: string | null
          custom_mode: string | null
          custom_config: Json | null
          target: number
          target_unit: string
          cycle: string
          period_start: string
          period_end: string
          status: string
          monthly_targets: Json | null
          created_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          template_id?: string | null
          assigned_to: string
          custom_name?: string | null
          custom_mode?: string | null
          custom_config?: Json | null
          target?: number
          target_unit?: string
          cycle?: string
          period_start: string
          period_end: string
          status?: string
          monthly_targets?: Json | null
          created_by?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          template_id?: string | null
          assigned_to?: string
          custom_name?: string | null
          custom_mode?: string | null
          custom_config?: Json | null
          target?: number
          target_unit?: string
          cycle?: string
          period_start?: string
          period_end?: string
          status?: string
          monthly_targets?: Json | null
          created_by?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "kpi_assignments_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "kpi_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kpi_assignments_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          }
        ]
      }
      kpi_evaluations: {
        Row: {
          id: string
          assignment_id: string
          score: number | null
          actual_value: number | null
          difference: number | null
          achievement_pct: number | null
          comment: string | null
          evaluation_date: string
          period_label: string | null
          evaluated_by: string
          created_at: string
        }
        Insert: {
          id?: string
          assignment_id: string
          score?: number | null
          actual_value?: number | null
          difference?: number | null
          achievement_pct?: number | null
          comment?: string | null
          evaluation_date: string
          period_label?: string | null
          evaluated_by: string
          created_at?: string
        }
        Update: {
          id?: string
          assignment_id?: string
          score?: number | null
          actual_value?: number | null
          difference?: number | null
          achievement_pct?: number | null
          comment?: string | null
          evaluation_date?: string
          period_label?: string | null
          evaluated_by?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "kpi_evaluations_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "kpi_assignments"
            referencedColumns: ["id"]
          }
        ]
      }
      job_cost_events: {
        Row: {
          id: string
          source_event_id: string | null
          event_name: string
          event_date: string | null
          event_location: string | null
          staff: string | null
          seller: string | null
          revenue: number
          revenue_vat_mode: string
          revenue_wht_rate: number
          status: string
          notes: string | null
          imported_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          source_event_id?: string | null
          event_name: string
          event_date?: string | null
          event_location?: string | null
          staff?: string | null
          seller?: string | null
          revenue?: number
          revenue_vat_mode?: string
          revenue_wht_rate?: number
          status?: string
          notes?: string | null
          imported_by?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          source_event_id?: string | null
          event_name?: string
          event_date?: string | null
          event_location?: string | null
          staff?: string | null
          seller?: string | null
          revenue?: number
          revenue_vat_mode?: string
          revenue_wht_rate?: number
          status?: string
          notes?: string | null
          imported_by?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_cost_events_imported_by_fkey"
            columns: ["imported_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          }
        ]
      }
      job_cost_items: {
        Row: {
          id: string
          job_event_id: string
          category: string
          description: string | null
          amount: number
          unit_price: number
          unit: string
          quantity: number
          include_vat: boolean
          vat_mode: string
          withholding_tax_rate: number
          cost_date: string | null
          recorded_by: string | null
          notes: string | null
          created_at: string
        }
        Insert: {
          id?: string
          job_event_id: string
          category: string
          description?: string | null
          amount?: number
          unit_price?: number
          unit?: string
          quantity?: number
          include_vat?: boolean
          vat_mode?: string
          withholding_tax_rate?: number
          cost_date?: string | null
          recorded_by?: string | null
          notes?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          job_event_id?: string
          category?: string
          description?: string | null
          amount?: number
          unit_price?: number
          unit?: string
          quantity?: number
          include_vat?: boolean
          vat_mode?: string
          withholding_tax_rate?: number
          cost_date?: string | null
          recorded_by?: string | null
          notes?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_cost_items_job_event_id_fkey"
            columns: ["job_event_id"]
            isOneToOne: false
            referencedRelation: "job_cost_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_cost_items_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          }
        ]
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

// ============================================================================
// Application-level types (used in components/views, not by Supabase client)
// ============================================================================

// Helper to extract Row types from Database
type Tables = Database['public']['Tables']

export type Event = Tables['events']['Row'] & {
  kits?: Kit[]
}

export type Kit = Tables['kits']['Row'] & {
  event?: Event | null
  events?: Event | null
  kit_contents?: KitContent[]
}

export type Item = Tables['items']['Row'] & {
  kit_contents?: KitContent[]
}

export type KitContent = Tables['kit_contents']['Row'] & {
  items?: Item
  kits?: Kit
}

export type Profile = Tables['profiles']['Row'] & {
  allowed_modules?: string[] | Json | null
}

export type ActivityLog = Tables['activity_logs']['Row'] & {
  profiles?: Pick<Profile, 'display_name' | 'phone_number'>
  user?: Pick<Profile, 'full_name' | 'role'> | null
  target?: Pick<Profile, 'full_name'> | null
}

export type LoginLog = Tables['login_logs']['Row']

export type EventClosure = Tables['event_closures']['Row'] & {
  profiles?: Pick<Profile, 'display_name' | 'phone_number' | 'full_name'>
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

export type KitTemplate = Tables['kit_templates']['Row'] & {
  kit_template_contents?: KitTemplateContent[]
}

export type KitTemplateContent = Tables['kit_template_contents']['Row']

export type KpiTemplate = Tables['kpi_templates']['Row']
export type KpiAssignment = Tables['kpi_assignments']['Row'] & {
  kpi_templates?: KpiTemplate | null
  profiles?: Pick<Profile, 'id' | 'full_name' | 'department'> | null
}
export type KpiEvaluation = Tables['kpi_evaluations']['Row'] & {
  kpi_assignments?: KpiAssignment | null
}

export type JobCostEvent = Tables['job_cost_events']['Row'] & {
  job_cost_items?: JobCostItem[]
  importer?: Pick<Profile, 'id' | 'full_name' | 'department'> | null
}
export type JobCostItem = Tables['job_cost_items']['Row'] & {
  recorder?: Pick<Profile, 'id' | 'full_name'> | null
}

// ============================================================================
// Action State Types (for Server Actions)
// ============================================================================

export interface ActionState {
  error: string
  success?: boolean | string
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
