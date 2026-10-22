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
      membership_role: "owner" | "staff";
      photo_role: "hero" | "gallery" | "room";
      space_category: "pool" | "rooms" | "common" | "outdoor";
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
      membership_role: ["owner", "staff"],
      photo_role: ["hero", "gallery", "room"],
      space_category: ["pool", "rooms", "common", "outdoor"],
    },
  },
} as const;
