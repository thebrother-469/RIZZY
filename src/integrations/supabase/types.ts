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
      auth_audit_logs: {
        Row: {
          created_at: string
          event_type: string
          id: string
          ip_hash: string | null
          metadata: Json
          request_id: string | null
          result: string
          trace_id: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          ip_hash?: string | null
          metadata?: Json
          request_id?: string | null
          result: string
          trace_id?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          ip_hash?: string | null
          metadata?: Json
          request_id?: string | null
          result?: string
          trace_id?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      badges: {
        Row: {
          badge_key: string
          earned_at: string
          id: string
          user_id: string
        }
        Insert: {
          badge_key: string
          earned_at?: string
          id?: string
          user_id: string
        }
        Update: {
          badge_key?: string
          earned_at?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      chats: {
        Row: {
          created_at: string
          id: string
          mode: Database["public"]["Enums"]["chat_mode"]
          scenario: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          mode?: Database["public"]["Enums"]["chat_mode"]
          scenario?: string | null
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          mode?: Database["public"]["Enums"]["chat_mode"]
          scenario?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      daily_mission_debug_events: {
        Row: {
          correlation_id: string
          created_at: string
          error_json: Json | null
          event_name: string
          id: string
          payload_json: Json
          severity: string
          subsystem: string
          success: boolean | null
          user_id: string | null
        }
        Insert: {
          correlation_id: string
          created_at?: string
          error_json?: Json | null
          event_name: string
          id?: string
          payload_json?: Json
          severity?: string
          subsystem?: string
          success?: boolean | null
          user_id?: string | null
        }
        Update: {
          correlation_id?: string
          created_at?: string
          error_json?: Json | null
          event_name?: string
          id?: string
          payload_json?: Json
          severity?: string
          subsystem?: string
          success?: boolean | null
          user_id?: string | null
        }
        Relationships: []
      }
      lemonsqueezy_webhook_events: {
        Row: {
          event_id: string
          event_name: string
          received_at: string
        }
        Insert: {
          event_id: string
          event_name: string
          received_at?: string
        }
        Update: {
          event_id?: string
          event_name?: string
          received_at?: string
        }
        Relationships: []
      }
      memories: {
        Row: {
          archived: boolean
          category: Database["public"]["Enums"]["memory_category"]
          coach_id: string | null
          content: string
          created_at: string
          id: string
          importance: number
          last_used_at: string | null
          pinned: boolean
          source: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          archived?: boolean
          category?: Database["public"]["Enums"]["memory_category"]
          coach_id?: string | null
          content: string
          created_at?: string
          id?: string
          importance?: number
          last_used_at?: string | null
          pinned?: boolean
          source?: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          archived?: boolean
          category?: Database["public"]["Enums"]["memory_category"]
          coach_id?: string | null
          content?: string
          created_at?: string
          id?: string
          importance?: number
          last_used_at?: string | null
          pinned?: boolean
          source?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      messages: {
        Row: {
          chat_id: string
          content: string
          created_at: string
          id: string
          image_url: string | null
          role: Database["public"]["Enums"]["msg_role"]
          user_id: string
        }
        Insert: {
          chat_id: string
          content: string
          created_at?: string
          id?: string
          image_url?: string | null
          role: Database["public"]["Enums"]["msg_role"]
          user_id: string
        }
        Update: {
          chat_id?: string
          content?: string
          created_at?: string
          id?: string
          image_url?: string | null
          role?: Database["public"]["Enums"]["msg_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_chat_id_fkey"
            columns: ["chat_id"]
            isOneToOne: false
            referencedRelation: "chats"
            referencedColumns: ["id"]
          },
        ]
      }
      missions: {
        Row: {
          assigned_date: string
          category: string | null
          coach_tip: string | null
          completed: boolean
          completed_at: string | null
          completion_action: string | null
          created_at: string
          description: string
          difficulty: string
          estimated_time: string | null
          generation_meta: Json | null
          id: string
          reflection: string | null
          skipped: boolean
          title: string
          user_id: string
          why_this_matters: string | null
        }
        Insert: {
          assigned_date?: string
          category?: string | null
          coach_tip?: string | null
          completed?: boolean
          completed_at?: string | null
          completion_action?: string | null
          created_at?: string
          description: string
          difficulty?: string
          estimated_time?: string | null
          generation_meta?: Json | null
          id?: string
          reflection?: string | null
          skipped?: boolean
          title: string
          user_id: string
          why_this_matters?: string | null
        }
        Update: {
          assigned_date?: string
          category?: string | null
          coach_tip?: string | null
          completed?: boolean
          completed_at?: string | null
          completion_action?: string | null
          created_at?: string
          description?: string
          difficulty?: string
          estimated_time?: string | null
          generation_meta?: Json | null
          id?: string
          reflection?: string | null
          skipped?: boolean
          title?: string
          user_id?: string
          why_this_matters?: string | null
        }
        Relationships: []
      }
      onboarding_debug_events: {
        Row: {
          correlation_id: string
          created_at: string
          error_json: Json | null
          event_name: string
          id: string
          payload_json: Json
          severity: string
          subsystem: string
          success: boolean | null
          user_id: string | null
        }
        Insert: {
          correlation_id: string
          created_at?: string
          error_json?: Json | null
          event_name: string
          id?: string
          payload_json?: Json
          severity?: string
          subsystem?: string
          success?: boolean | null
          user_id?: string | null
        }
        Update: {
          correlation_id?: string
          created_at?: string
          error_json?: Json | null
          event_name?: string
          id?: string
          payload_json?: Json
          severity?: string
          subsystem?: string
          success?: boolean | null
          user_id?: string | null
        }
        Relationships: []
      }
      paddle_webhook_events: {
        Row: {
          event_id: string
          event_type: string
          occurred_at: string | null
          received_at: string
        }
        Insert: {
          event_id: string
          event_type: string
          occurred_at?: string | null
          received_at?: string
        }
        Update: {
          event_id?: string
          event_type?: string
          occurred_at?: string | null
          received_at?: string
        }
        Relationships: []
      }
      profile_gen_usage: {
        Row: {
          count: number
          day: string
          updated_at: string
          user_id: string
        }
        Insert: {
          count?: number
          day: string
          updated_at?: string
          user_id: string
        }
        Update: {
          count?: number
          day?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          age_range: string | null
          coaching_style: string | null
          confidence_level: number | null
          created_at: string
          dating_experience: string | null
          display_name: string | null
          gender: string | null
          goals: string | null
          id: string
          interests: string[] | null
          memory_enabled: boolean
          onboarded_at: string | null
          plan: Database["public"]["Enums"]["plan_tier"]
          social_challenges: string[] | null
          strengths: string | null
          updated_at: string
          weaknesses: string | null
        }
        Insert: {
          age_range?: string | null
          coaching_style?: string | null
          confidence_level?: number | null
          created_at?: string
          dating_experience?: string | null
          display_name?: string | null
          gender?: string | null
          goals?: string | null
          id: string
          interests?: string[] | null
          memory_enabled?: boolean
          onboarded_at?: string | null
          plan?: Database["public"]["Enums"]["plan_tier"]
          social_challenges?: string[] | null
          strengths?: string | null
          updated_at?: string
          weaknesses?: string | null
        }
        Update: {
          age_range?: string | null
          coaching_style?: string | null
          confidence_level?: number | null
          created_at?: string
          dating_experience?: string | null
          display_name?: string | null
          gender?: string | null
          goals?: string | null
          id?: string
          interests?: string[] | null
          memory_enabled?: boolean
          onboarded_at?: string | null
          plan?: Database["public"]["Enums"]["plan_tier"]
          social_challenges?: string[] | null
          strengths?: string | null
          updated_at?: string
          weaknesses?: string | null
        }
        Relationships: []
      }
      streaks: {
        Row: {
          current_streak: number
          last_action_date: string | null
          longest_streak: number
          updated_at: string
          user_id: string
        }
        Insert: {
          current_streak?: number
          last_action_date?: string | null
          longest_streak?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          current_streak?: number
          last_action_date?: string | null
          longest_streak?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          cancel_at: string | null
          current_period_end: string | null
          lemonsqueezy_customer_id: string | null
          lemonsqueezy_subscription_id: string | null
          paddle_customer_id: string | null
          paddle_subscription_id: string | null
          plan: Database["public"]["Enums"]["plan_tier"]
          status: string | null
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          cancel_at?: string | null
          current_period_end?: string | null
          lemonsqueezy_customer_id?: string | null
          lemonsqueezy_subscription_id?: string | null
          paddle_customer_id?: string | null
          paddle_subscription_id?: string | null
          plan?: Database["public"]["Enums"]["plan_tier"]
          status?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          cancel_at?: string | null
          current_period_end?: string | null
          lemonsqueezy_customer_id?: string | null
          lemonsqueezy_subscription_id?: string | null
          paddle_customer_id?: string | null
          paddle_subscription_id?: string | null
          plan?: Database["public"]["Enums"]["plan_tier"]
          status?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      usage_daily: {
        Row: {
          day: string
          message_count: number
          user_id: string
        }
        Insert: {
          day?: string
          message_count?: number
          user_id: string
        }
        Update: {
          day?: string
          message_count?: number
          user_id?: string
        }
        Relationships: []
      }
      user_xp: {
        Row: {
          level: number
          total_xp: number
          updated_at: string
          user_id: string
          xp_into_level: number
        }
        Insert: {
          level?: number
          total_xp?: number
          updated_at?: string
          user_id: string
          xp_into_level?: number
        }
        Update: {
          level?: number
          total_xp?: number
          updated_at?: string
          user_id?: string
          xp_into_level?: number
        }
        Relationships: []
      }
      xp_events: {
        Row: {
          created_at: string
          event_type: string
          id: string
          meta: Json | null
          user_id: string
          xp_delta: number
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          meta?: Json | null
          user_id: string
          xp_delta: number
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          meta?: Json | null
          user_id?: string
          xp_delta?: number
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      award_badge: {
        Args: { _caller_id?: string; _key: string }
        Returns: Json
      }
      award_xp: {
        Args: { _caller_id?: string; _event_type: string; _meta?: Json }
        Returns: Json
      }
      complete_mission: {
        Args: { _caller_id?: string; _mission_id: string }
        Returns: Json
      }
      consume_profile_gen_quota: {
        Args: { _caller_id?: string; _cap: number }
        Returns: Json
      }
      get_profile_gen_usage_today: {
        Args: { _caller_id?: string }
        Returns: Json
      }
    }
    Enums: {
      chat_mode: "chat" | "roast" | "roleplay" | "photo"
      memory_category:
        | "goals"
        | "strengths"
        | "weaknesses"
        | "preferences"
        | "achievements"
        | "missions"
        | "conversation_style"
        | "relationships"
        | "coaching_notes"
        | "general"
      msg_role: "user" | "assistant" | "system"
      plan_tier: "free" | "pro" | "elite"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
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
      chat_mode: ["chat", "roast", "roleplay", "photo"],
      memory_category: [
        "goals",
        "strengths",
        "weaknesses",
        "preferences",
        "achievements",
        "missions",
        "conversation_style",
        "relationships",
        "coaching_notes",
        "general",
      ],
      msg_role: ["user", "assistant", "system"],
      plan_tier: ["free", "pro", "elite"],
    },
  },
} as const
