export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      academic_terms: {
        Row: {
          archived_at: string | null
          created_at: string
          ends_on: string | null
          id: string
          is_current: boolean
          owner_id: string
          semester: Database["public"]["Enums"]["semester_name"]
          starts_on: string | null
          updated_at: string
          year_name: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          ends_on?: string | null
          id?: string
          is_current?: boolean
          owner_id?: string
          semester: Database["public"]["Enums"]["semester_name"]
          starts_on?: string | null
          updated_at?: string
          year_name: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          ends_on?: string | null
          id?: string
          is_current?: boolean
          owner_id?: string
          semester?: Database["public"]["Enums"]["semester_name"]
          starts_on?: string | null
          updated_at?: string
          year_name?: string
        }
        Relationships: []
      }
      academic_years: {
        Row: {
          created_at: string
          id: string
          is_current: boolean
          name: string
          owner_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_current?: boolean
          name: string
          owner_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_current?: boolean
          name?: string
          owner_id?: string
        }
        Relationships: []
      }
      attendance_records: {
        Row: {
          check_in_at: string | null
          check_out_at: string | null
          created_at: string
          duration_minutes: number | null
          early_minutes: number
          id: string
          late_minutes: number
          scanned_by: string | null
          session_date: string
          session_id: string
          source: string
          status: Database["public"]["Enums"]["attendance_status"]
          student_id: string
          updated_at: string
        }
        Insert: {
          check_in_at?: string | null
          check_out_at?: string | null
          created_at?: string
          duration_minutes?: number | null
          early_minutes?: number
          id?: string
          late_minutes?: number
          scanned_by?: string | null
          session_date?: string
          session_id: string
          source?: string
          status?: Database["public"]["Enums"]["attendance_status"]
          student_id: string
          updated_at?: string
        }
        Update: {
          check_in_at?: string | null
          check_out_at?: string | null
          created_at?: string
          duration_minutes?: number | null
          early_minutes?: number
          id?: string
          late_minutes?: number
          scanned_by?: string | null
          session_date?: string
          session_id?: string
          source?: string
          status?: Database["public"]["Enums"]["attendance_status"]
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_records_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "attendance_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_records_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_sessions: {
        Row: {
          course_id: string
          created_at: string
          created_by: string | null
          ends_at: string | null
          grace_minutes: number
          id: string
          latitude: number | null
          longitude: number | null
          mode: string
          owner_id: string
          radius_m: number
          starts_at: string
          status: Database["public"]["Enums"]["session_status"]
          title: string | null
        }
        Insert: {
          course_id: string
          created_at?: string
          created_by?: string | null
          ends_at?: string | null
          grace_minutes?: number
          id?: string
          latitude?: number | null
          longitude?: number | null
          mode?: string
          owner_id: string
          radius_m?: number
          starts_at?: string
          status?: Database["public"]["Enums"]["session_status"]
          title?: string | null
        }
        Update: {
          course_id?: string
          created_at?: string
          created_by?: string | null
          ends_at?: string | null
          grace_minutes?: number
          id?: string
          latitude?: number | null
          longitude?: number | null
          mode?: string
          owner_id?: string
          radius_m?: number
          starts_at?: string
          status?: Database["public"]["Enums"]["session_status"]
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "attendance_sessions_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          created_at: string
          details: Json | null
          entity: string | null
          entity_id: string | null
          id: string
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json | null
          entity?: string | null
          entity_id?: string | null
          id?: string
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json | null
          entity?: string | null
          entity_id?: string | null
          id?: string
          user_id?: string | null
        }
        Relationships: []
      }
      class_levels: {
        Row: {
          created_at: string
          id: string
          name: string
          owner_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          owner_id?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          owner_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      course_registrations: {
        Row: {
          course_id: string
          created_at: string
          id: string
          student_id: string
        }
        Insert: {
          course_id: string
          created_at?: string
          id?: string
          student_id: string
        }
        Update: {
          course_id?: string
          created_at?: string
          id?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "course_registrations_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_registrations_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      courses: {
        Row: {
          academic_year_id: string | null
          archived: boolean
          code: string
          created_at: string
          credit_hours: number
          department_id: string | null
          id: string
          lecturer_id: string | null
          level: string
          owner_id: string
          semester: Database["public"]["Enums"]["semester_name"]
          term_id: string | null
          title: string
        }
        Insert: {
          academic_year_id?: string | null
          archived?: boolean
          code: string
          created_at?: string
          credit_hours?: number
          department_id?: string | null
          id?: string
          lecturer_id?: string | null
          level: string
          owner_id: string
          semester: Database["public"]["Enums"]["semester_name"]
          term_id?: string | null
          title: string
        }
        Update: {
          academic_year_id?: string | null
          archived?: boolean
          code?: string
          created_at?: string
          credit_hours?: number
          department_id?: string | null
          id?: string
          lecturer_id?: string | null
          level?: string
          owner_id?: string
          semester?: Database["public"]["Enums"]["semester_name"]
          term_id?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "courses_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "courses_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "courses_term_id_fkey"
            columns: ["term_id"]
            isOneToOne: false
            referencedRelation: "academic_terms"
            referencedColumns: ["id"]
          },
        ]
      }
      departments: {
        Row: {
          code: string
          created_at: string
          id: string
          name: string
          owner_id: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          name: string
          owner_id: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          name?: string
          owner_id?: string
        }
        Relationships: []
      }
      payment_events: {
        Row: {
          amount: number | null
          created_at: string
          currency: string | null
          event_type: string
          id: string
          owner_id: string | null
          provider: string
          raw: Json | null
          subscription_id: string | null
        }
        Insert: {
          amount?: number | null
          created_at?: string
          currency?: string | null
          event_type: string
          id?: string
          owner_id?: string | null
          provider: string
          raw?: Json | null
          subscription_id?: string | null
        }
        Update: {
          amount?: number | null
          created_at?: string
          currency?: string | null
          event_type?: string
          id?: string
          owner_id?: string | null
          provider?: string
          raw?: Json | null
          subscription_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_events_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string
          full_name: string
          id: string
        }
        Insert: {
          created_at?: string
          email: string
          full_name: string
          id: string
        }
        Update: {
          created_at?: string
          email?: string
          full_name?: string
          id?: string
        }
        Relationships: []
      }
      student_portal_links: {
        Row: {
          course_id: string
          created_at: string
          id: string
          is_active: boolean
          owner_id: string
          token: string
        }
        Insert: {
          course_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          owner_id: string
          token?: string
        }
        Update: {
          course_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          owner_id?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_portal_links_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      students: {
        Row: {
          academic_year_id: string | null
          created_at: string
          department_id: string | null
          email: string | null
          full_name: string
          id: string
          index_number: string
          level: string
          owner_id: string
          password_hash: string | null
          pin: string
          program: string | null
          qr_uuid: string
          status: string
          updated_at: string
        }
        Insert: {
          academic_year_id?: string | null
          created_at?: string
          department_id?: string | null
          email?: string | null
          full_name: string
          id?: string
          index_number: string
          level: string
          owner_id: string
          password_hash?: string | null
          pin: string
          program?: string | null
          qr_uuid?: string
          status?: string
          updated_at?: string
        }
        Update: {
          academic_year_id?: string | null
          created_at?: string
          department_id?: string | null
          email?: string | null
          full_name?: string
          id?: string
          index_number?: string
          level?: string
          owner_id?: string
          password_hash?: string | null
          pin?: string
          program?: string | null
          qr_uuid?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "students_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "students_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_plans: {
        Row: {
          code: string
          created_at: string
          description: string | null
          features: Json
          interval: string
          is_active: boolean
          name: string
          price_ghs: number
          price_usd: number
          sort_order: number
          trial_days: number
        }
        Insert: {
          code: string
          created_at?: string
          description?: string | null
          features?: Json
          interval: string
          is_active?: boolean
          name: string
          price_ghs?: number
          price_usd?: number
          sort_order?: number
          trial_days?: number
        }
        Update: {
          code?: string
          created_at?: string
          description?: string | null
          features?: Json
          interval?: string
          is_active?: boolean
          name?: string
          price_ghs?: number
          price_usd?: number
          sort_order?: number
          trial_days?: number
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          cancel_at_period_end: boolean
          created_at: string
          currency: string
          current_period_end: string | null
          id: string
          owner_id: string
          plan_code: string
          provider: string | null
          provider_customer: string | null
          provider_ref: string | null
          status: string
          trial_ends_at: string | null
          updated_at: string
        }
        Insert: {
          cancel_at_period_end?: boolean
          created_at?: string
          currency?: string
          current_period_end?: string | null
          id?: string
          owner_id: string
          plan_code: string
          provider?: string | null
          provider_customer?: string | null
          provider_ref?: string | null
          status: string
          trial_ends_at?: string | null
          updated_at?: string
        }
        Update: {
          cancel_at_period_end?: boolean
          created_at?: string
          currency?: string
          current_period_end?: string | null
          id?: string
          owner_id?: string
          plan_code?: string
          provider?: string | null
          provider_customer?: string | null
          provider_ref?: string | null
          status?: string
          trial_ends_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_plan_code_fkey"
            columns: ["plan_code"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["code"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
      is_staff: { Args: { _user_id: string }; Returns: boolean }
      my_subscription: {
        Args: never
        Returns: {
          cancel_at_period_end: boolean
          currency: string
          current_period_end: string
          days_remaining: number
          is_active: boolean
          plan_code: string
          provider: string
          status: string
          trial_ends_at: string
        }[]
      }
      portal_courses: {
        Args: { _token: string }
        Returns: {
          code: string
          id: string
          level: string
          title: string
        }[]
      }
      portal_lookup: {
        Args: { _email: string; _index: string; _token: string }
        Returns: {
          department: string
          full_name: string
          index_number: string
          level: string
          pin: string
          qr_uuid: string
        }[]
      }
      portal_options: {
        Args: { _token: string }
        Returns: {
          id: string
          kind: string
          name: string
        }[]
      }
      portal_register: {
        Args: {
          _department_id?: string
          _email: string
          _full_name: string
          _index: string
          _level: string
          _program?: string
          _token: string
        }
        Returns: {
          department: string
          existed: boolean
          full_name: string
          index_number: string
          level: string
          pin: string
          qr_uuid: string
        }[]
      }
      self_checkin: {
        Args: { _index: string; _pin: string; _session_id: string }
        Returns: {
          message: string
          ok: boolean
          student_name: string
        }[]
      }
      self_checkin_geo: {
        Args: {
          _index: string
          _lat: number
          _lng: number
          _session_id: string
        }
        Returns: {
          distance_m: number
          message: string
          ok: boolean
          student_name: string
        }[]
      }
      student_auth_status: {
        Args: { _index: string }
        Returns: {
          exists_: boolean
          has_email: boolean
          has_password: boolean
        }[]
      }
      student_courses: {
        Args: { _index: string; _password: string }
        Returns: {
          attended: number
          code: string
          course_id: string
          percentage: number
          sessions_total: number
          title: string
        }[]
      }
      student_history: {
        Args: { _index: string; _password: string }
        Returns: {
          checked_in: string
          course_code: string
          session_date: string
          session_title: string
          status: string
        }[]
      }
      student_login: {
        Args: { _index: string; _password: string }
        Returns: {
          full_name: string
          index_number: string
          level: string
          ok: boolean
          pin: string
          qr_uuid: string
        }[]
      }
      student_reset_password: {
        Args: { _email: string; _index: string; _password: string }
        Returns: {
          message: string
          ok: boolean
        }[]
      }
      student_set_password: {
        Args: { _email: string; _index: string; _password: string }
        Returns: {
          message: string
          ok: boolean
        }[]
      }
    }
    Enums: {
      app_role: "super_admin" | "admin" | "lecturer" | "teaching_assistant"
      attendance_status:
        | "IN_PROGRESS"
        | "PRESENT"
        | "ABSENT"
        | "LATE_ARRIVAL"
        | "LEFT_EARLY"
      semester_name: "First" | "Second"
      session_status: "OPEN" | "CLOSED"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["super_admin", "admin", "lecturer", "teaching_assistant"],
      attendance_status: [
        "IN_PROGRESS",
        "PRESENT",
        "ABSENT",
        "LATE_ARRIVAL",
        "LEFT_EARLY",
      ],
      semester_name: ["First", "Second"],
      session_status: ["OPEN", "CLOSED"],
    },
  },
} as const
