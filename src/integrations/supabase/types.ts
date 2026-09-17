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
      admin_actions: {
        Row: {
          action: string
          actor_id: string | null
          country_id: string | null
          created_at: string
          details: Json
          id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          country_id?: string | null
          created_at?: string
          details?: Json
          id?: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          country_id?: string | null
          created_at?: string
          details?: Json
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_actions_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_actions_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "country_stats"
            referencedColumns: ["country_id"]
          },
          {
            foreignKeyName: "admin_actions_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "public_ranking"
            referencedColumns: ["country_id"]
          },
        ]
      }
      countries: {
        Row: {
          aa_defense: number
          balance: number
          coal: number
          copper: number
          created_at: string
          flag: string
          id: string
          iron: number
          missile_1: number
          missile_2: number
          missile_3: number
          name: string
          oil: number
          soldier_packs: number
          tank_packs: number
          uranium: number
        }
        Insert: {
          aa_defense?: number
          balance?: number
          coal?: number
          copper?: number
          created_at?: string
          flag?: string
          id?: string
          iron?: number
          missile_1?: number
          missile_2?: number
          missile_3?: number
          name: string
          oil?: number
          soldier_packs?: number
          tank_packs?: number
          uranium?: number
        }
        Update: {
          aa_defense?: number
          balance?: number
          coal?: number
          copper?: number
          created_at?: string
          flag?: string
          id?: string
          iron?: number
          missile_1?: number
          missile_2?: number
          missile_3?: number
          name?: string
          oil?: number
          soldier_packs?: number
          tank_packs?: number
          uranium?: number
        }
        Relationships: []
      }
      economy_runs: {
        Row: {
          id: string
          ran_at: string
          run_date: string
          summary: Json
          triggered_by: string | null
        }
        Insert: {
          id?: string
          ran_at?: string
          run_date: string
          summary?: Json
          triggered_by?: string | null
        }
        Update: {
          id?: string
          ran_at?: string
          run_date?: string
          summary?: Json
          triggered_by?: string | null
        }
        Relationships: []
      }
      missile_strikes: {
        Row: {
          aa_defense: number
          actor_id: string | null
          attacker_country_id: string | null
          created_at: string
          defender_country_id: string | null
          destroyed: Json
          id: string
          missile_code: string
          region_aa: number | null
          region_id: string | null
          region_name: string
          required_aa: number | null
          result: string
          salvo_index: number | null
        }
        Insert: {
          aa_defense?: number
          actor_id?: string | null
          attacker_country_id?: string | null
          created_at?: string
          defender_country_id?: string | null
          destroyed?: Json
          id?: string
          missile_code: string
          region_aa?: number | null
          region_id?: string | null
          region_name?: string
          required_aa?: number | null
          result: string
          salvo_index?: number | null
        }
        Update: {
          aa_defense?: number
          actor_id?: string | null
          attacker_country_id?: string | null
          created_at?: string
          defender_country_id?: string | null
          destroyed?: Json
          id?: string
          missile_code?: string
          region_aa?: number | null
          region_id?: string | null
          region_name?: string
          required_aa?: number | null
          result?: string
          salvo_index?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "missile_strikes_attacker_country_id_fkey"
            columns: ["attacker_country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "missile_strikes_attacker_country_id_fkey"
            columns: ["attacker_country_id"]
            isOneToOne: false
            referencedRelation: "country_stats"
            referencedColumns: ["country_id"]
          },
          {
            foreignKeyName: "missile_strikes_attacker_country_id_fkey"
            columns: ["attacker_country_id"]
            isOneToOne: false
            referencedRelation: "public_ranking"
            referencedColumns: ["country_id"]
          },
          {
            foreignKeyName: "missile_strikes_defender_country_id_fkey"
            columns: ["defender_country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "missile_strikes_defender_country_id_fkey"
            columns: ["defender_country_id"]
            isOneToOne: false
            referencedRelation: "country_stats"
            referencedColumns: ["country_id"]
          },
          {
            foreignKeyName: "missile_strikes_defender_country_id_fkey"
            columns: ["defender_country_id"]
            isOneToOne: false
            referencedRelation: "public_ranking"
            referencedColumns: ["country_id"]
          },
        ]
      }
      profiles: {
        Row: {
          country_id: string | null
          created_at: string
          display_name: string | null
          email: string | null
          id: string
          username: string | null
        }
        Insert: {
          country_id?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id: string
          username?: string | null
        }
        Update: {
          country_id?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          username?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "country_stats"
            referencedColumns: ["country_id"]
          },
          {
            foreignKeyName: "profiles_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "public_ranking"
            referencedColumns: ["country_id"]
          },
        ]
      }
      region_slots: {
        Row: {
          building: Database["public"]["Enums"]["building_type"]
          created_at: string
          id: string
          region_id: string
          slot_index: number
        }
        Insert: {
          building: Database["public"]["Enums"]["building_type"]
          created_at?: string
          id?: string
          region_id: string
          slot_index: number
        }
        Update: {
          building?: Database["public"]["Enums"]["building_type"]
          created_at?: string
          id?: string
          region_id?: string
          slot_index?: number
        }
        Relationships: [
          {
            foreignKeyName: "region_slots_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "regions"
            referencedColumns: ["id"]
          },
        ]
      }
      regions: {
        Row: {
          aa_defense: number
          country_id: string
          created_at: string
          id: string
          name: string
        }
        Insert: {
          aa_defense?: number
          country_id: string
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          aa_defense?: number
          country_id?: string
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "regions_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "regions_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "country_stats"
            referencedColumns: ["country_id"]
          },
          {
            foreignKeyName: "regions_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "public_ranking"
            referencedColumns: ["country_id"]
          },
        ]
      }
      shop_items: {
        Row: {
          active: boolean
          building: Database["public"]["Enums"]["building_type"] | null
          category: string
          code: string
          cost_coal: number
          cost_copper: number
          cost_iron: number
          cost_kr: number
          cost_oil: number
          cost_uranium: number
          description: string
          income_kr: number
          name: string
          produces: string | null
          produces_amount: number
          sort_order: number
          upkeep_coal: number
        }
        Insert: {
          active?: boolean
          building?: Database["public"]["Enums"]["building_type"] | null
          category: string
          code: string
          cost_coal?: number
          cost_copper?: number
          cost_iron?: number
          cost_kr?: number
          cost_oil?: number
          cost_uranium?: number
          description?: string
          income_kr?: number
          name: string
          produces?: string | null
          produces_amount?: number
          sort_order?: number
          upkeep_coal?: number
        }
        Update: {
          active?: boolean
          building?: Database["public"]["Enums"]["building_type"] | null
          category?: string
          code?: string
          cost_coal?: number
          cost_copper?: number
          cost_iron?: number
          cost_kr?: number
          cost_oil?: number
          cost_uranium?: number
          description?: string
          income_kr?: number
          name?: string
          produces?: string | null
          produces_amount?: number
          sort_order?: number
          upkeep_coal?: number
        }
        Relationships: []
      }
      transactions: {
        Row: {
          actor_id: string | null
          amount_kr: number
          country_id: string | null
          created_at: string
          details: Json
          id: string
          kind: string
          label: string
        }
        Insert: {
          actor_id?: string | null
          amount_kr?: number
          country_id?: string | null
          created_at?: string
          details?: Json
          id?: string
          kind: string
          label: string
        }
        Update: {
          actor_id?: string | null
          amount_kr?: number
          country_id?: string | null
          created_at?: string
          details?: Json
          id?: string
          kind?: string
          label?: string
        }
        Relationships: [
          {
            foreignKeyName: "transactions_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "country_stats"
            referencedColumns: ["country_id"]
          },
          {
            foreignKeyName: "transactions_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "public_ranking"
            referencedColumns: ["country_id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      country_stats: {
        Row: {
          aa_defense: number | null
          balance: number | null
          coal: number | null
          coal_prod: number | null
          coal_upkeep: number | null
          copper: number | null
          copper_prod: number | null
          country_id: string | null
          flag: string | null
          fort_votes: number | null
          forts: number | null
          gross_income: number | null
          iron: number | null
          iron_prod: number | null
          military_value: number | null
          missile_1: number | null
          missile_2: number | null
          missile_3: number | null
          name: string | null
          oil: number | null
          oil_prod: number | null
          region_aa_total: number | null
          regions_count: number | null
          soldier_packs: number | null
          tank_packs: number | null
          total_votes: number | null
          uranium: number | null
          uranium_prod: number | null
          vote_potential: number | null
          war_votes: number | null
        }
        Relationships: []
      }
      public_ranking: {
        Row: {
          country_id: string | null
          flag: string | null
          gross_income: number | null
          name: string | null
          regions_count: number | null
          soldier_packs: number | null
          tank_packs: number | null
          vote_potential: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      admin_adjust_country: {
        Args: { p_country_id: string; p_note?: string; p_patch: Json }
        Returns: Json
      }
      admin_assign_country: {
        Args: { p_country_id: string; p_user_id: string }
        Returns: Json
      }
      admin_create_country: {
        Args: { p_flag?: string; p_name: string }
        Returns: string
      }
      admin_create_region: {
        Args: { p_country_id: string; p_name: string }
        Returns: string
      }
      admin_delete_region: { Args: { p_region_id: string }; Returns: Json }
      admin_list_users: {
        Args: never
        Returns: {
          country_id: string
          country_name: string
          display_name: string
          email: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
        }[]
      }
      admin_toggle_shop_item: {
        Args: { p_active: boolean; p_code: string }
        Returns: Json
      }
      admin_upsert_shop_item: { Args: { p_item: Json }; Returns: string }
      assert_can_manage: { Args: { p_country_id: string }; Returns: undefined }
      build_in_slot: {
        Args: { p_item_code: string; p_region_id: string; p_slot_index: number }
        Returns: Json
      }
      charge_country: {
        Args: {
          p_country_id: string
          p_item: Database["public"]["Tables"]["shop_items"]["Row"]
          p_qty: number
        }
        Returns: undefined
      }
      claim_main_admin: { Args: never; Returns: Json }
      demolish_slot: { Args: { p_slot_id: string }; Returns: Json }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
      launch_missile: {
        Args: {
          p_country_id: string
          p_missile_code: string
          p_mode?: string
          p_region_id: string
          p_slot_ids?: string[]
        }
        Returns: Json
      }
      launch_salvo: {
        Args: {
          p_count?: number
          p_country_id: string
          p_missile_code: string
          p_mode?: string
          p_region_id: string
          p_slot_ids?: string[]
        }
        Returns: Json
      }
      my_country_id: { Args: never; Returns: string }
      purchase_aa: {
        Args: { p_country_id: string; p_qty?: number; p_region_id: string }
        Returns: Json
      }
      purchase_unit: {
        Args: { p_country_id: string; p_item_code: string; p_qty?: number }
        Returns: Json
      }
      run_daily_economy: { Args: { p_run_date?: string }; Returns: Json }
      set_user_role: {
        Args: {
          p_role: Database["public"]["Enums"]["app_role"]
          p_user_id: string
        }
        Returns: Json
      }
      username_taken: { Args: { p_username: string }; Returns: boolean }
    }
    Enums: {
      app_role: "PLAYER" | "ADMIN" | "MAIN_ADMIN"
      building_type:
        | "factory_1"
        | "factory_2"
        | "factory_3"
        | "factory_4"
        | "factory_5"
        | "mine_coal"
        | "mine_oil"
        | "mine_copper"
        | "mine_iron"
        | "mine_uranium"
        | "fort_1"
        | "fort_2"
        | "fort_3"
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
      app_role: ["PLAYER", "ADMIN", "MAIN_ADMIN"],
      building_type: [
        "factory_1",
        "factory_2",
        "factory_3",
        "factory_4",
        "factory_5",
        "mine_coal",
        "mine_oil",
        "mine_copper",
        "mine_iron",
        "mine_uranium",
        "fort_1",
        "fort_2",
        "fort_3",
      ],
    },
  },
} as const
