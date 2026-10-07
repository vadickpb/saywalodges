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
          property_id?: string;
          sort_order?: number;
          title_en?: string;
          title_es?: string;
        };
        Relationships: [
          {
            foreignKeyName: "amenities_property_id_fkey";
            columns: ["property_id"];
            isOneToOne: false;
            referencedRelation: "properties";
            referencedColumns: ["id"];
          },
        ];
      };
      distances: {
        Row: {
          icon: string;
          id: string;
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
          place_en?: string;
          place_es?: string;
          property_id?: string;
          sort_order?: number;
          time_en?: string;
          time_es?: string;
        };
        Relationships: [
          {
            foreignKeyName: "distances_property_id_fkey";
            columns: ["property_id"];
            isOneToOne: false;
            referencedRelation: "properties";
            referencedColumns: ["id"];
          },
        ];
      };
      photos: {
        Row: {
          id: string;
          property_id: string;
          role: Database["public"]["Enums"]["photo_role"];
          room_id: string | null;
          sort_order: number;
          storage_path: string;
        };
        ComputedFields: never;
        Insert: {
          id?: string;
          property_id: string;
          role: Database["public"]["Enums"]["photo_role"];
          room_id?: string | null;
          sort_order?: number;
          storage_path: string;
        };
        Update: {
          id?: string;
          property_id?: string;
          role?: Database["public"]["Enums"]["photo_role"];
          room_id?: string | null;
          sort_order?: number;
          storage_path?: string;
        };
        Relationships: [
          {
            foreignKeyName: "photos_property_id_fkey";
            columns: ["property_id"];
            isOneToOne: false;
            referencedRelation: "properties";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "photos_room_id_fkey";
            columns: ["room_id"];
            isOneToOne: false;
            referencedRelation: "rooms";
            referencedColumns: ["id"];
          },
        ];
      };
      properties: {
        Row: {
          address_country: string;
          address_locality: string;
          address_region: string;
          airbnb_url: string;
          created_at: string;
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
          pets_allowed: boolean;
          price_range: string;
          site_url: string;
          slug: string;
          star_rating: number | null;
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
          created_at?: string;
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
          pets_allowed?: boolean;
          price_range?: string;
          site_url?: string;
          slug: string;
          star_rating?: number | null;
          whatsapp_message_en?: string;
          whatsapp_message_es?: string;
          whatsapp_number: string;
        };
        Update: {
          address_country?: string;
          address_locality?: string;
          address_region?: string;
          airbnb_url?: string;
          created_at?: string;
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
          pets_allowed?: boolean;
          price_range?: string;
          site_url?: string;
          slug?: string;
          star_rating?: number | null;
          whatsapp_message_en?: string;
          whatsapp_message_es?: string;
          whatsapp_number?: string;
        };
        Relationships: [];
      };
      rate_tiers: {
        Row: {
          from_en: string;
          from_es: string;
          id: string;
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
            foreignKeyName: "rate_tiers_property_id_fkey";
            columns: ["property_id"];
            isOneToOne: false;
            referencedRelation: "properties";
            referencedColumns: ["id"];
          },
        ];
      };
      rooms: {
        Row: {
          badge_en: string | null;
          badge_es: string | null;
          capacity: string | null;
          category: Database["public"]["Enums"]["room_category"];
          desc_en: string;
          desc_es: string;
          icon: string;
          id: string;
          key: string;
          label_en: string;
          label_es: string;
          property_id: string;
          sort_order: number;
        };
        ComputedFields: never;
        Insert: {
          badge_en?: string | null;
          badge_es?: string | null;
          capacity?: string | null;
          category: Database["public"]["Enums"]["room_category"];
          desc_en?: string;
          desc_es?: string;
          icon?: string;
          id?: string;
          key: string;
          label_en: string;
          label_es: string;
          property_id: string;
          sort_order?: number;
        };
        Update: {
          badge_en?: string | null;
          badge_es?: string | null;
          capacity?: string | null;
          category?: Database["public"]["Enums"]["room_category"];
          desc_en?: string;
          desc_es?: string;
          icon?: string;
          id?: string;
          key?: string;
          label_en?: string;
          label_es?: string;
          property_id?: string;
          sort_order?: number;
        };
        Relationships: [
          {
            foreignKeyName: "rooms_property_id_fkey";
            columns: ["property_id"];
            isOneToOne: false;
            referencedRelation: "properties";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      photo_role: "hero" | "gallery" | "room";
      room_category: "pool" | "rooms" | "common" | "outdoor";
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
      photo_role: ["hero", "gallery", "room"],
      room_category: ["pool", "rooms", "common", "outdoor"],
    },
  },
} as const;
