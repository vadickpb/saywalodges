export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: {
          extensions?: Json;
          operationName?: string;
          query?: string;
          variables?: Json;
        };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      amenities: {
        Row: {
          desc_en: string;
          desc_es: string;
          icon: string;
          id: string;
          org_id: string;
          property_id: string;
          sort_order: number;
          title_en: string;
          title_es: string;
        };
        ComputedFields: never;
        Insert: {
          desc_en?: string;
          desc_es?: string;
          icon?: string;
          id?: string;
          org_id: string;
          property_id: string;
          sort_order?: number;
          title_en: string;
          title_es: string;
        };
        Update: {
          desc_en?: string;
          desc_es?: string;
          icon?: string;
          id?: string;
          org_id?: string;
          property_id?: string;
          sort_order?: number;
          title_en?: string;
          title_es?: string;
        };
        Relationships: [
          {
            foreignKeyName: "amenities_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "amenities_property_id_org_id_fkey";
            columns: ["property_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "properties";
            referencedColumns: ["id", "org_id"];
          },
        ];
      };
      distances: {
        Row: {
          icon: string;
          id: string;
          org_id: string;
          place_en: string;
          place_es: string;
          property_id: string;
          sort_order: number;
          time_en: string;
          time_es: string;
        };
        ComputedFields: never;
        Insert: {
          icon?: string;
          id?: string;
          org_id: string;
          place_en: string;
          place_es: string;
          property_id: string;
          sort_order?: number;
          time_en: string;
          time_es: string;
        };
        Update: {
          icon?: string;
          id?: string;
          org_id?: string;
          place_en?: string;
          place_es?: string;
          property_id?: string;
          sort_order?: number;
          time_en?: string;
          time_es?: string;
        };
        Relationships: [
          {
            foreignKeyName: "distances_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "distances_property_id_org_id_fkey";
            columns: ["property_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "properties";
            referencedColumns: ["id", "org_id"];
          },
        ];
      };
      fees: {
        Row: {
          amount_cents: number;
          created_at: string;
          id: string;
          kind: Database["public"]["Enums"]["fee_kind"];
          name: string;
          org_id: string;
          property_id: string;
          unit_id: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          amount_cents: number;
          created_at?: string;
          id?: string;
          kind: Database["public"]["Enums"]["fee_kind"];
          name: string;
          org_id: string;
          property_id: string;
          unit_id: string;
          updated_at?: string;
        };
        Update: {
          amount_cents?: number;
          created_at?: string;
          id?: string;
          kind?: Database["public"]["Enums"]["fee_kind"];
          name?: string;
          org_id?: string;
          property_id?: string;
          unit_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "fees_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "fees_unit_scope_fkey";
            columns: ["unit_id", "property_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "units";
            referencedColumns: ["id", "property_id", "org_id"];
          },
        ];
      };
      finance_categories: {
        Row: {
          archived: boolean;
          created_at: string;
          id: string;
          kind: Database["public"]["Enums"]["finance_kind"];
          name: string;
          org_id: string;
          sort_order: number;
          system_key: string | null;
        };
        ComputedFields: never;
        Insert: {
          archived?: boolean;
          created_at?: string;
          id?: string;
          kind: Database["public"]["Enums"]["finance_kind"];
          name: string;
          org_id: string;
          sort_order?: number;
          system_key?: string | null;
        };
        Update: {
          archived?: boolean;
          created_at?: string;
          id?: string;
          kind?: Database["public"]["Enums"]["finance_kind"];
          name?: string;
          org_id?: string;
          sort_order?: number;
          system_key?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "finance_categories_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      finance_entries: {
        Row: {
          amount_cents: number;
          amount_pen_cents: number | null;
          category_id: string;
          channel: Database["public"]["Enums"]["finance_channel"] | null;
          counterparty: string | null;
          created_at: string;
          created_by: string | null;
          currency: Database["public"]["Enums"]["currency_code"];
          external_ref: string | null;
          fx_rate_pen: number | null;
          guests: number | null;
          id: string;
          kind: Database["public"]["Enums"]["finance_kind"];
          note: string | null;
          occurred_on: string;
          org_id: string;
          payment_method:
            Database["public"]["Enums"]["finance_payment_method"] | null;
          receipt_path: string | null;
          related_entry_id: string | null;
          source: Database["public"]["Enums"]["finance_source"];
          stay_end: string | null;
          stay_start: string | null;
          unit_id: string | null;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          amount_cents: number;
          amount_pen_cents?: never;
          category_id: string;
          channel?: Database["public"]["Enums"]["finance_channel"] | null;
          counterparty?: string | null;
          created_at?: string;
          created_by?: string | null;
          currency: Database["public"]["Enums"]["currency_code"];
          external_ref?: string | null;
          fx_rate_pen?: number | null;
          guests?: number | null;
          id?: string;
          kind: Database["public"]["Enums"]["finance_kind"];
          note?: string | null;
          occurred_on: string;
          org_id: string;
          payment_method?:
            Database["public"]["Enums"]["finance_payment_method"] | null;
          receipt_path?: string | null;
          related_entry_id?: string | null;
          source?: Database["public"]["Enums"]["finance_source"];
          stay_end?: string | null;
          stay_start?: string | null;
          unit_id?: string | null;
          updated_at?: string;
        };
        Update: {
          amount_cents?: number;
          amount_pen_cents?: never;
          category_id?: string;
          channel?: Database["public"]["Enums"]["finance_channel"] | null;
          counterparty?: string | null;
          created_at?: string;
          created_by?: string | null;
          currency?: Database["public"]["Enums"]["currency_code"];
          external_ref?: string | null;
          fx_rate_pen?: number | null;
          guests?: number | null;
          id?: string;
          kind?: Database["public"]["Enums"]["finance_kind"];
          note?: string | null;
          occurred_on?: string;
          org_id?: string;
          payment_method?:
            Database["public"]["Enums"]["finance_payment_method"] | null;
          receipt_path?: string | null;
          related_entry_id?: string | null;
          source?: Database["public"]["Enums"]["finance_source"];
          stay_end?: string | null;
          stay_start?: string | null;
          unit_id?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "finance_entries_category_fkey";
            columns: ["category_id", "org_id", "kind"];
            isOneToOne: false;
            referencedRelation: "finance_categories";
            referencedColumns: ["id", "org_id", "kind"];
          },
          {
            foreignKeyName: "finance_entries_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "finance_entries_related_fkey";
            columns: ["related_entry_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "finance_entries";
            referencedColumns: ["id", "org_id"];
          },
          {
            foreignKeyName: "finance_entries_unit_fkey";
            columns: ["unit_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "units";
            referencedColumns: ["id", "org_id"];
          },
        ];
      };
      memberships: {
        Row: {
          created_at: string;
          org_id: string;
          role: Database["public"]["Enums"]["membership_role"];
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          org_id: string;
          role?: Database["public"]["Enums"]["membership_role"];
          user_id: string;
        };
        Update: {
          created_at?: string;
          org_id?: string;
          role?: Database["public"]["Enums"]["membership_role"];
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "memberships_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      organizations: {
        Row: {
          created_at: string;
          id: string;
          name: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          id?: string;
          name: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
        };
        Relationships: [];
      };
      photos: {
        Row: {
          id: string;
          org_id: string;
          property_id: string;
          role: Database["public"]["Enums"]["photo_role"];
          sort_order: number;
          space_id: string | null;
          storage_path: string;
        };
        ComputedFields: never;
        Insert: {
          id?: string;
          org_id: string;
          property_id: string;
          role: Database["public"]["Enums"]["photo_role"];
          sort_order?: number;
          space_id?: string | null;
          storage_path: string;
        };
        Update: {
          id?: string;
          org_id?: string;
          property_id?: string;
          role?: Database["public"]["Enums"]["photo_role"];
          sort_order?: number;
          space_id?: string | null;
          storage_path?: string;
        };
        Relationships: [
          {
            foreignKeyName: "photos_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "photos_property_id_org_id_fkey";
            columns: ["property_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "properties";
            referencedColumns: ["id", "org_id"];
          },
          {
            foreignKeyName: "photos_space_id_property_id_fkey";
            columns: ["space_id", "property_id"];
            isOneToOne: false;
            referencedRelation: "spaces";
            referencedColumns: ["id", "property_id"];
          },
        ];
      };
      properties: {
        Row: {
          address_country: string;
          address_locality: string;
          address_region: string;
          airbnb_url: string;
          content: NonNullable<Json>;
          created_at: string;
          currency: Database["public"]["Enums"]["currency_code"];
          custom_domain: string | null;
          email: string;
          id: string;
          latitude: number | null;
          logo_path: string | null;
          longitude: number | null;
          maps_url: string;
          meta_description_en: string;
          meta_description_es: string;
          meta_keywords_en: string[];
          meta_keywords_es: string[];
          meta_title_en: string;
          meta_title_es: string;
          name: string;
          org_id: string;
          pets_allowed: boolean;
          price_range: string;
          published: boolean;
          site_url: string;
          slug: string;
          star_rating: number | null;
          subdomain: string;
          theme: NonNullable<Json>;
          whatsapp_message_en: string;
          whatsapp_message_es: string;
          whatsapp_number: string;
        };
        ComputedFields: never;
        Insert: {
          address_country?: string;
          address_locality?: string;
          address_region?: string;
          airbnb_url?: string;
          content?: NonNullable<Json>;
          created_at?: string;
          currency?: Database["public"]["Enums"]["currency_code"];
          custom_domain?: string | null;
          email?: string;
          id?: string;
          latitude?: number | null;
          logo_path?: string | null;
          longitude?: number | null;
          maps_url?: string;
          meta_description_en?: string;
          meta_description_es?: string;
          meta_keywords_en?: string[];
          meta_keywords_es?: string[];
          meta_title_en?: string;
          meta_title_es?: string;
          name: string;
          org_id: string;
          pets_allowed?: boolean;
          price_range?: string;
          published?: boolean;
          site_url?: string;
          slug: string;
          star_rating?: number | null;
          subdomain: string;
          theme?: NonNullable<Json>;
          whatsapp_message_en?: string;
          whatsapp_message_es?: string;
          whatsapp_number: string;
        };
        Update: {
          address_country?: string;
          address_locality?: string;
          address_region?: string;
          airbnb_url?: string;
          content?: NonNullable<Json>;
          created_at?: string;
          currency?: Database["public"]["Enums"]["currency_code"];
          custom_domain?: string | null;
          email?: string;
          id?: string;
          latitude?: number | null;
          logo_path?: string | null;
          longitude?: number | null;
          maps_url?: string;
          meta_description_en?: string;
          meta_description_es?: string;
          meta_keywords_en?: string[];
          meta_keywords_es?: string[];
          meta_title_en?: string;
          meta_title_es?: string;
          name?: string;
          org_id?: string;
          pets_allowed?: boolean;
          price_range?: string;
          published?: boolean;
          site_url?: string;
          slug?: string;
          star_rating?: number | null;
          subdomain?: string;
          theme?: NonNullable<Json>;
          whatsapp_message_en?: string;
          whatsapp_message_es?: string;
          whatsapp_number?: string;
        };
        Relationships: [
          {
            foreignKeyName: "properties_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: true;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      rate_tiers: {
        Row: {
          from_en: string;
          from_es: string;
          id: string;
          org_id: string;
          period_en: string;
          period_es: string;
          property_id: string;
          season_en: string;
          season_es: string;
          sort_order: number;
          tag_en: string;
          tag_es: string;
        };
        ComputedFields: never;
        Insert: {
          from_en: string;
          from_es: string;
          id?: string;
          org_id: string;
          period_en?: string;
          period_es?: string;
          property_id: string;
          season_en: string;
          season_es: string;
          sort_order?: number;
          tag_en?: string;
          tag_es?: string;
        };
        Update: {
          from_en?: string;
          from_es?: string;
          id?: string;
          org_id?: string;
          period_en?: string;
          period_es?: string;
          property_id?: string;
          season_en?: string;
          season_es?: string;
          sort_order?: number;
          tag_en?: string;
          tag_es?: string;
        };
        Relationships: [
          {
            foreignKeyName: "rate_tiers_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "rate_tiers_property_id_org_id_fkey";
            columns: ["property_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "properties";
            referencedColumns: ["id", "org_id"];
          },
        ];
      };
      seasons: {
        Row: {
          created_at: string;
          end_date: string;
          id: string;
          name: string;
          org_id: string;
          priority: number;
          property_id: string;
          start_date: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          end_date: string;
          id?: string;
          name: string;
          org_id: string;
          priority?: number;
          property_id: string;
          start_date: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          end_date?: string;
          id?: string;
          name?: string;
          org_id?: string;
          priority?: number;
          property_id?: string;
          start_date?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "seasons_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "seasons_property_org_fkey";
            columns: ["property_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "properties";
            referencedColumns: ["id", "org_id"];
          },
        ];
      };
      spaces: {
        Row: {
          badge_en: string | null;
          badge_es: string | null;
          capacity: string | null;
          category: Database["public"]["Enums"]["space_category"];
          desc_en: string;
          desc_es: string;
          icon: string;
          id: string;
          key: string;
          label_en: string;
          label_es: string;
          org_id: string;
          property_id: string;
          sort_order: number;
        };
        ComputedFields: never;
        Insert: {
          badge_en?: string | null;
          badge_es?: string | null;
          capacity?: string | null;
          category: Database["public"]["Enums"]["space_category"];
          desc_en?: string;
          desc_es?: string;
          icon?: string;
          id?: string;
          key: string;
          label_en: string;
          label_es: string;
          org_id: string;
          property_id: string;
          sort_order?: number;
        };
        Update: {
          badge_en?: string | null;
          badge_es?: string | null;
          capacity?: string | null;
          category?: Database["public"]["Enums"]["space_category"];
          desc_en?: string;
          desc_es?: string;
          icon?: string;
          id?: string;
          key?: string;
          label_en?: string;
          label_es?: string;
          org_id?: string;
          property_id?: string;
          sort_order?: number;
        };
        Relationships: [
          {
            foreignKeyName: "spaces_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "spaces_property_id_org_id_fkey";
            columns: ["property_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "properties";
            referencedColumns: ["id", "org_id"];
          },
        ];
      };
      unit_rates: {
        Row: {
          created_at: string;
          extra_guest_cents: number;
          id: string;
          min_nights: number;
          nightly_cents: number;
          org_id: string;
          property_id: string;
          season_id: string | null;
          unit_id: string;
          updated_at: string;
          weekend_nightly_cents: number | null;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          extra_guest_cents?: number;
          id?: string;
          min_nights?: number;
          nightly_cents: number;
          org_id: string;
          property_id: string;
          season_id?: string | null;
          unit_id: string;
          updated_at?: string;
          weekend_nightly_cents?: number | null;
        };
        Update: {
          created_at?: string;
          extra_guest_cents?: number;
          id?: string;
          min_nights?: number;
          nightly_cents?: number;
          org_id?: string;
          property_id?: string;
          season_id?: string | null;
          unit_id?: string;
          updated_at?: string;
          weekend_nightly_cents?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "unit_rates_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "unit_rates_season_scope_fkey";
            columns: ["season_id", "property_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "seasons";
            referencedColumns: ["id", "property_id", "org_id"];
          },
          {
            foreignKeyName: "unit_rates_unit_scope_fkey";
            columns: ["unit_id", "property_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "units";
            referencedColumns: ["id", "property_id", "org_id"];
          },
        ];
      };
      units: {
        Row: {
          active: boolean;
          cleaning_cost_cents: number | null;
          created_at: string;
          id: string;
          included_guests: number;
          kind: Database["public"]["Enums"]["unit_kind"];
          max_guests: number;
          name: string;
          org_id: string;
          property_id: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          active?: boolean;
          cleaning_cost_cents?: number | null;
          created_at?: string;
          id?: string;
          included_guests: number;
          kind: Database["public"]["Enums"]["unit_kind"];
          max_guests: number;
          name: string;
          org_id: string;
          property_id: string;
          updated_at?: string;
        };
        Update: {
          active?: boolean;
          cleaning_cost_cents?: number | null;
          created_at?: string;
          id?: string;
          included_guests?: number;
          kind?: Database["public"]["Enums"]["unit_kind"];
          max_guests?: number;
          name?: string;
          org_id?: string;
          property_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "units_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "units_property_org_fkey";
            columns: ["property_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "properties";
            referencedColumns: ["id", "org_id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      reorder_amenities: {
        Args: { p_ids: string[]; p_property_id: string };
        Returns: number;
      };
      reorder_distances: {
        Args: { p_ids: string[]; p_property_id: string };
        Returns: number;
      };
      reorder_photos: {
        Args: { p_ids: string[]; p_property_id: string; p_space_id?: string };
        Returns: number;
      };
      reorder_spaces: {
        Args: { p_ids: string[]; p_property_id: string };
        Returns: number;
      };
      set_hero_photo: {
        Args: { p_photo_id: string; p_property_id: string };
        Returns: number;
      };
    };
    Enums: {
      currency_code: "PEN" | "USD";
      fee_kind: "per_stay" | "per_night" | "per_guest";
      finance_channel: "direct" | "airbnb" | "booking" | "other";
      finance_kind: "income" | "expense";
      finance_payment_method:
        "cash" | "bank_transfer" | "yape_plin" | "card" | "platform" | "other";
      finance_source: "manual" | "booking" | "ical";
      membership_role: "owner" | "staff";
      photo_role: "hero" | "gallery" | "room";
      space_category: "pool" | "rooms" | "common" | "outdoor";
      unit_kind: "entire_place" | "room";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<
  keyof Database,
  "public"
>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      currency_code: ["PEN", "USD"],
      fee_kind: ["per_stay", "per_night", "per_guest"],
      finance_channel: ["direct", "airbnb", "booking", "other"],
      finance_kind: ["income", "expense"],
      finance_payment_method: [
        "cash",
        "bank_transfer",
        "yape_plin",
        "card",
        "platform",
        "other",
      ],
      finance_source: ["manual", "booking", "ical"],
      membership_role: ["owner", "staff"],
      photo_role: ["hero", "gallery", "room"],
      space_category: ["pool", "rooms", "common", "outdoor"],
      unit_kind: ["entire_place", "room"],
    },
  },
} as const;
