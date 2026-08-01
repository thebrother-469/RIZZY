import type { Database as GeneratedDatabase, Json } from "./types";

type AnyRecord = Record<string, unknown>;

type Table<
  Row extends AnyRecord,
  Insert extends AnyRecord = Partial<Row>,
  Update extends AnyRecord = Partial<Row>,
> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: unknown[];
};

export type MemoryCategory =
  | "goals"
  | "strengths"
  | "weaknesses"
  | "preferences"
  | "achievements"
  | "missions"
  | "conversation_style"
  | "relationships"
  | "coaching_notes"
  | "general";

export type Database = Omit<GeneratedDatabase, "public"> & {
  public: {
    Tables: {
      profiles: Table<{
        id: string;
        email: string | null;
        username: string | null;
        full_name: string | null;
        avatar_url: string | null;
        plan: "free" | "pro" | "elite";
        onboarded_at: string | null;
        created_at: string;
        updated_at: string;
        [key: string]: unknown;
      }>;
      subscriptions: Table<{
        id: string;
        user_id: string;
        plan: "free" | "pro" | "elite";
        status: string | null;
        current_period_end: string | null;
        cancel_at: string | null;
        lemonsqueezy_customer_id: string | null;
        lemonsqueezy_subscription_id: string | null;
        created_at: string;
        updated_at: string;
        [key: string]: unknown;
      }>;
      chats: Table<{
        id: string;
        user_id: string;
        mode: string;
        title: string;
        scenario: string | null;
        created_at: string;
        updated_at: string;
        [key: string]: unknown;
      }>;
      messages: Table<{
        id: string;
        chat_id: string;
        role: "user" | "assistant" | "system";
        content: string;
        image_url: string | null;
        created_at: string;
        [key: string]: unknown;
      }>;
      missions: Table<{
        id: string;
        user_id: string;
        title: string;
        description: string;
        difficulty: string;
        category: string;
        xp_reward: number;
        completed: boolean;
        skipped: boolean | null;
        assigned_date: string;
        completed_at: string | null;
        created_at: string;
        updated_at: string;
        [key: string]: unknown;
      }>;
      streaks: Table<{
        user_id: string;
        current_streak: number;
        longest_streak: number;
        last_completed_date: string | null;
        updated_at: string;
        [key: string]: unknown;
      }>;
      usage_daily: Table<{
        user_id: string;
        day: string;
        coach_messages: number;
        [key: string]: unknown;
      }>;
      memories: Table<{
        id: string;
        user_id: string;
        title: string;
        content: string;
        category: MemoryCategory;
        importance: number;
        pinned: boolean;
        archived: boolean;
        source: string | null;
        coach_id: string | null;
        last_used_at: string | null;
        created_at: string;
        updated_at: string;
        [key: string]: unknown;
      }>;
      user_xp: Table<{
        user_id: string;
        total_xp: number;
        level: number;
        xp_into_level: number;
        updated_at: string;
        [key: string]: unknown;
      }>;
      xp_events: Table<{
        id: string;
        user_id: string;
        event_type: string;
        xp_delta: number;
        meta: Json | null;
        created_at: string;
        [key: string]: unknown;
      }>;
      badges: Table<{
        id: string;
        user_id: string;
        badge_key: string;
        earned_at: string;
        [key: string]: unknown;
      }>;
      paddle_webhook_events: Table<{
        id: string;
        event_id: string;
        event_name: string | null;
        created_at: string;
        [key: string]: unknown;
      }>;
      lemonsqueezy_webhook_events: Table<{
        id: string;
        event_id: string;
        event_name: string | null;
        created_at: string;
        [key: string]: unknown;
      }>;
    };
    Views: Record<string, never>;
    Functions: {
      award_xp: {
        Args: { _event_type: string; _meta?: Json | null; _caller_id?: string | null };
        Returns: Json;
      };
      award_badge: {
        Args: { _key: string; _caller_id?: string | null };
        Returns: Json;
      };
      complete_mission: {
        Args: { _mission_id: string; _caller_id?: string | null };
        Returns: Json;
      };
    };
    Enums: {
      memory_category: MemoryCategory;
    };
    CompositeTypes: Record<string, never>;
  };
};
