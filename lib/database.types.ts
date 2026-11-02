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
      bookings: {
        Row: {
          cancel_reason: string | null;
          cancelled_at: string | null;
          check_in: string;
          check_out: string;
          confirmed_at: string | null;
          created_at: string;
          currency: Database["public"]["Enums"]["currency_code"];
          deposit_cents: number;
          expires_at: string | null;
          guest_id: string;
          guests: number;
          id: string;
          org_id: string;
          property_id: string;
          public_token: string;
          quote_id: string;
          status: Database["public"]["Enums"]["booking_status"];
          total_cents: number;
          unit_id: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          cancel_reason?: string | null;
          cancelled_at?: string | null;
          check_in: string;
          check_out: string;
          confirmed_at?: string | null;
          created_at?: string;
          currency: Database["public"]["Enums"]["currency_code"];
          deposit_cents: number;
          expires_at?: string | null;
          guest_id: string;
          guests: number;
          id?: string;
          org_id: string;
          property_id: string;
          public_token?: string;
          quote_id: string;
          status?: Database["public"]["Enums"]["booking_status"];
          total_cents: number;
          unit_id: string;
          updated_at?: string;
        };
        Update: {
          cancel_reason?: string | null;
          cancelled_at?: string | null;
          check_in?: string;
          check_out?: string;
          confirmed_at?: string | null;
          created_at?: string;
          currency?: Database["public"]["Enums"]["currency_code"];
          deposit_cents?: number;
          expires_at?: string | null;
          guest_id?: string;
          guests?: number;
          id?: string;
          org_id?: string;
          property_id?: string;
          public_token?: string;
          quote_id?: string;
          status?: Database["public"]["Enums"]["booking_status"];
          total_cents?: number;
          unit_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "bookings_guest_fkey";
            columns: ["guest_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "guests";
            referencedColumns: ["id", "org_id"];
          },
          {
            foreignKeyName: "bookings_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "bookings_quote_fkey";
            columns: ["quote_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "quotes";
            referencedColumns: ["id", "org_id"];
          },
          {
            foreignKeyName: "bookings_unit_scope_fkey";
            columns: ["unit_id", "property_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "units";
            referencedColumns: ["id", "property_id", "org_id"];
          },
        ];
      };
      calendar_blocks: {
        Row: {
          booking_id: string | null;
          created_at: string;
          expires_at: string | null;
          external_uid: string | null;
          feed_id: string | null;
          id: string;
          note: string | null;
          org_id: string;
          period: unknown;
          property_id: string;
          source: Database["public"]["Enums"]["calendar_block_source"];
          unit_id: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          booking_id?: string | null;
          created_at?: string;
          expires_at?: string | null;
          external_uid?: string | null;
          feed_id?: string | null;
          id?: string;
          note?: string | null;
          org_id: string;
          period: unknown;
          property_id: string;
          source: Database["public"]["Enums"]["calendar_block_source"];
          unit_id: string;
          updated_at?: string;
        };
        Update: {
          booking_id?: string | null;
          created_at?: string;
          expires_at?: string | null;
          external_uid?: string | null;
          feed_id?: string | null;
          id?: string;
          note?: string | null;
          org_id?: string;
          period?: unknown;
          property_id?: string;
          source?: Database["public"]["Enums"]["calendar_block_source"];
          unit_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "calendar_blocks_feed_fkey";
            columns: ["feed_id", "unit_id"];
            isOneToOne: false;
            referencedRelation: "ical_feeds";
            referencedColumns: ["id", "unit_id"];
          },
          {
            foreignKeyName: "calendar_blocks_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "calendar_blocks_unit_org_fkey";
            columns: ["unit_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "units";
            referencedColumns: ["id", "org_id"];
          },
          {
            foreignKeyName: "calendar_blocks_unit_property_fkey";
            columns: ["unit_id", "property_id"];
            isOneToOne: false;
            referencedRelation: "units";
            referencedColumns: ["id", "property_id"];
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
      finance_recurring: {
        Row: {
          active: boolean;
          category_id: string;
          counterparty: string | null;
          created_at: string;
          currency: Database["public"]["Enums"]["currency_code"];
          day_of_month: number;
          estimated_cents: number;
          id: string;
          kind: Database["public"]["Enums"]["finance_kind"];
          name: string;
          org_id: string;
          payment_method:
            Database["public"]["Enums"]["finance_payment_method"] | null;
          starts_month: string;
          unit_id: string | null;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          active?: boolean;
          category_id: string;
          counterparty?: string | null;
          created_at?: string;
          currency: Database["public"]["Enums"]["currency_code"];
          day_of_month: number;
          estimated_cents: number;
          id?: string;
          kind?: Database["public"]["Enums"]["finance_kind"];
          name: string;
          org_id: string;
          payment_method?:
            Database["public"]["Enums"]["finance_payment_method"] | null;
          starts_month?: string;
          unit_id?: string | null;
          updated_at?: string;
        };
        Update: {
          active?: boolean;
          category_id?: string;
          counterparty?: string | null;
          created_at?: string;
          currency?: Database["public"]["Enums"]["currency_code"];
          day_of_month?: number;
          estimated_cents?: number;
          id?: string;
          kind?: Database["public"]["Enums"]["finance_kind"];
          name?: string;
          org_id?: string;
          payment_method?:
            Database["public"]["Enums"]["finance_payment_method"] | null;
          starts_month?: string;
          unit_id?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "finance_recurring_category_fkey";
            columns: ["category_id", "org_id", "kind"];
            isOneToOne: false;
            referencedRelation: "finance_categories";
            referencedColumns: ["id", "org_id", "kind"];
          },
          {
            foreignKeyName: "finance_recurring_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "finance_recurring_unit_fkey";
            columns: ["unit_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "units";
            referencedColumns: ["id", "org_id"];
          },
        ];
      };
      finance_recurring_runs: {
        Row: {
          created_at: string;
          entry_id: string;
          month: string;
          org_id: string;
          recurring_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          entry_id: string;
          month: string;
          org_id: string;
          recurring_id: string;
        };
        Update: {
          created_at?: string;
          entry_id?: string;
          month?: string;
          org_id?: string;
          recurring_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "finance_recurring_runs_entry_fkey";
            columns: ["entry_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "finance_entries";
            referencedColumns: ["id", "org_id"];
          },
          {
            foreignKeyName: "finance_recurring_runs_recurring_fkey";
            columns: ["recurring_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "finance_recurring";
            referencedColumns: ["id", "org_id"];
          },
        ];
      };
      finance_unit_settings: {
        Row: {
          cleaning_cost_cents: number | null;
          org_id: string;
          unit_id: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          cleaning_cost_cents?: number | null;
          org_id: string;
          unit_id: string;
          updated_at?: string;
        };
        Update: {
          cleaning_cost_cents?: number | null;
          org_id?: string;
          unit_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "finance_unit_settings_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "finance_unit_settings_unit_fkey";
            columns: ["unit_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "units";
            referencedColumns: ["id", "org_id"];
          },
        ];
      };
      guests: {
        Row: {
          created_at: string;
          email: string;
          id: string;
          name: string;
          org_id: string;
          phone: string | null;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          email: string;
          id?: string;
          name: string;
          org_id: string;
          phone?: string | null;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          email?: string;
          id?: string;
          name?: string;
          org_id?: string;
          phone?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "guests_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      ical_alerts: {
        Row: {
          claim_id: string;
          claimed_at: string;
          dedupe_key: string;
          feed_id: string;
          id: string;
          kind: string;
          org_id: string;
          sent_at: string | null;
        };
        ComputedFields: never;
        Insert: {
          claim_id: string;
          claimed_at?: string;
          dedupe_key: string;
          feed_id: string;
          id?: string;
          kind: string;
          org_id: string;
          sent_at?: string | null;
        };
        Update: {
          claim_id?: string;
          claimed_at?: string;
          dedupe_key?: string;
          feed_id?: string;
          id?: string;
          kind?: string;
          org_id?: string;
          sent_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "ical_alerts_feed_id_org_id_fkey";
            columns: ["feed_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "ical_feeds";
            referencedColumns: ["id", "org_id"];
          },
          {
            foreignKeyName: "ical_alerts_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      ical_feeds: {
        Row: {
          channel: Database["public"]["Enums"]["ical_channel"];
          created_at: string;
          export_token: string;
          failing_since: string | null;
          id: string;
          import_url: string | null;
          last_attempt_at: string | null;
          last_error: string | null;
          last_synced_at: string | null;
          org_id: string;
          sync_started_at: string | null;
          sync_token: string | null;
          unit_id: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          channel: Database["public"]["Enums"]["ical_channel"];
          created_at?: string;
          export_token?: string;
          failing_since?: string | null;
          id?: string;
          import_url?: string | null;
          last_attempt_at?: string | null;
          last_error?: string | null;
          last_synced_at?: string | null;
          org_id: string;
          sync_started_at?: string | null;
          sync_token?: string | null;
          unit_id: string;
          updated_at?: string;
        };
        Update: {
          channel?: Database["public"]["Enums"]["ical_channel"];
          created_at?: string;
          export_token?: string;
          failing_since?: string | null;
          id?: string;
          import_url?: string | null;
          last_attempt_at?: string | null;
          last_error?: string | null;
          last_synced_at?: string | null;
          org_id?: string;
          sync_started_at?: string | null;
          sync_token?: string | null;
          unit_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "ical_feeds_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ical_feeds_unit_fkey";
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
      payments: {
        Row: {
          amount_cents: number;
          booking_id: string;
          created_at: string;
          currency: Database["public"]["Enums"]["currency_code"];
          id: string;
          method: Database["public"]["Enums"]["payment_method"];
          org_id: string;
          reference: string | null;
          reject_reason: string | null;
          reviewed_at: string | null;
          reviewed_by: string | null;
          status: Database["public"]["Enums"]["payment_status"];
          updated_at: string;
          voucher_path: string | null;
        };
        ComputedFields: never;
        Insert: {
          amount_cents: number;
          booking_id: string;
          created_at?: string;
          currency: Database["public"]["Enums"]["currency_code"];
          id?: string;
          method: Database["public"]["Enums"]["payment_method"];
          org_id: string;
          reference?: string | null;
          reject_reason?: string | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          status?: Database["public"]["Enums"]["payment_status"];
          updated_at?: string;
          voucher_path?: string | null;
        };
        Update: {
          amount_cents?: number;
          booking_id?: string;
          created_at?: string;
          currency?: Database["public"]["Enums"]["currency_code"];
          id?: string;
          method?: Database["public"]["Enums"]["payment_method"];
          org_id?: string;
          reference?: string | null;
          reject_reason?: string | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          status?: Database["public"]["Enums"]["payment_status"];
          updated_at?: string;
          voucher_path?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "payments_booking_fkey";
            columns: ["booking_id", "org_id", "currency"];
            isOneToOne: false;
            referencedRelation: "bookings";
            referencedColumns: ["id", "org_id", "currency"];
          },
          {
            foreignKeyName: "payments_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
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
          booking_hold_minutes: number;
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
          booking_hold_minutes?: number;
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
          booking_hold_minutes?: number;
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
      property_payment_accounts: {
        Row: {
          account_number: string | null;
          active: boolean;
          bank_name: string | null;
          cci: string | null;
          created_at: string;
          currency: Database["public"]["Enums"]["currency_code"];
          holder_name: string;
          id: string;
          instructions: string | null;
          kind: Database["public"]["Enums"]["payment_account_kind"];
          org_id: string;
          phone: string | null;
          property_id: string;
          sort_order: number;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          account_number?: string | null;
          active?: boolean;
          bank_name?: string | null;
          cci?: string | null;
          created_at?: string;
          currency?: Database["public"]["Enums"]["currency_code"];
          holder_name: string;
          id?: string;
          instructions?: string | null;
          kind: Database["public"]["Enums"]["payment_account_kind"];
          org_id: string;
          phone?: string | null;
          property_id: string;
          sort_order?: number;
          updated_at?: string;
        };
        Update: {
          account_number?: string | null;
          active?: boolean;
          bank_name?: string | null;
          cci?: string | null;
          created_at?: string;
          currency?: Database["public"]["Enums"]["currency_code"];
          holder_name?: string;
          id?: string;
          instructions?: string | null;
          kind?: Database["public"]["Enums"]["payment_account_kind"];
          org_id?: string;
          phone?: string | null;
          property_id?: string;
          sort_order?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "property_payment_accounts_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "property_payment_accounts_property_fkey";
            columns: ["property_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "properties";
            referencedColumns: ["id", "org_id"];
          },
        ];
      };
      quotes: {
        Row: {
          breakdown: NonNullable<Json>;
          check_in: string;
          check_out: string;
          created_at: string;
          created_by: string | null;
          currency: Database["public"]["Enums"]["currency_code"];
          deposit_cents: number;
          expires_at: string;
          guests: number;
          id: string;
          org_id: string;
          property_id: string;
          token: string;
          total_cents: number;
          unit_id: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          breakdown?: NonNullable<Json>;
          check_in: string;
          check_out: string;
          created_at?: string;
          created_by?: string | null;
          currency: Database["public"]["Enums"]["currency_code"];
          deposit_cents: number;
          expires_at: string;
          guests: number;
          id?: string;
          org_id: string;
          property_id: string;
          token: string;
          total_cents: number;
          unit_id: string;
          updated_at?: string;
        };
        Update: {
          breakdown?: NonNullable<Json>;
          check_in?: string;
          check_out?: string;
          created_at?: string;
          created_by?: string | null;
          currency?: Database["public"]["Enums"]["currency_code"];
          deposit_cents?: number;
          expires_at?: string;
          guests?: number;
          id?: string;
          org_id?: string;
          property_id?: string;
          token?: string;
          total_cents?: number;
          unit_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "quotes_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "quotes_unit_scope_fkey";
            columns: ["unit_id", "property_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "units";
            referencedColumns: ["id", "property_id", "org_id"];
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
      sync_conflicts: {
        Row: {
          blocking_sources: Database["public"]["Enums"]["calendar_block_source"][];
          created_at: string;
          external_uid: string;
          feed_id: string;
          id: string;
          org_id: string;
          period: unknown;
        };
        ComputedFields: never;
        Insert: {
          blocking_sources: Database["public"]["Enums"]["calendar_block_source"][];
          created_at?: string;
          external_uid: string;
          feed_id: string;
          id?: string;
          org_id: string;
          period: unknown;
        };
        Update: {
          blocking_sources?: Database["public"]["Enums"]["calendar_block_source"][];
          created_at?: string;
          external_uid?: string;
          feed_id?: string;
          id?: string;
          org_id?: string;
          period?: unknown;
        };
        Relationships: [
          {
            foreignKeyName: "sync_conflicts_feed_id_org_id_fkey";
            columns: ["feed_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "ical_feeds";
            referencedColumns: ["id", "org_id"];
          },
          {
            foreignKeyName: "sync_conflicts_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
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
      begin_ical_sync: {
        Args: { p_feed_id: string; p_org_id: string };
        Returns: Json;
      };
      cancel_booking: {
        Args: { p_booking_id: string; p_org_id: string; p_reason?: string };
        Returns: Json;
      };
      complete_ical_rental: {
        Args: {
          p_amount_cents: number;
          p_block_id: string;
          p_cleaning_cents?: number;
          p_currency: Database["public"]["Enums"]["currency_code"];
          p_fx_rate_pen?: number;
          p_guests?: number;
          p_occurred_on: string;
          p_org_id: string;
        };
        Returns: Json;
      };
      confirm_payment: {
        Args: { p_fx_rate_pen?: number; p_org_id: string; p_payment_id: string };
        Returns: Json;
      };
      confirm_recurring_expense: {
        Args: {
          p_amount_cents: number;
          p_currency: Database["public"]["Enums"]["currency_code"];
          p_fx_rate_pen?: number;
          p_month: string;
          p_occurred_on?: string;
          p_org_id: string;
          p_recurring_id: string;
        };
        Returns: {
          out_created: boolean;
          out_entry_id: string;
        }[];
      };
      create_booking_from_quote: {
        Args: {
          p_guest_email: string;
          p_guest_name: string;
          p_guest_phone?: string;
          p_token: string;
        };
        Returns: Json;
      };
      create_manual_calendar_block: {
        Args: {
          p_end: string;
          p_note?: string;
          p_org_id: string;
          p_start: string;
          p_unit_id: string;
        };
        Returns: string;
      };
      create_rental_entries: {
        Args: {
          p_amount_cents: number;
          p_channel: Database["public"]["Enums"]["finance_channel"];
          p_cleaning_cents?: number;
          p_commission_cents?: number;
          p_currency: Database["public"]["Enums"]["currency_code"];
          p_fx_rate_pen?: number;
          p_guest_name?: string;
          p_guests?: number;
          p_note?: string;
          p_occurred_on: string;
          p_org_id: string;
          p_payment_method?: Database["public"]["Enums"]["finance_payment_method"];
          p_receipt_path?: string;
          p_stay_end: string;
          p_stay_start: string;
          p_unit_id: string;
        };
        Returns: string;
      };
      cron_begin_ical_sync: { Args: { p_feed_id: string }; Returns: Json };
      cron_claim_ical_alert: {
        Args: { p_feed_id: string; p_kind: string };
        Returns: Json;
      };
      cron_finish_ical_sync: {
        Args: {
          p_error?: string;
          p_events: Json;
          p_feed_id: string;
          p_token: string;
        };
        Returns: boolean;
      };
      cron_list_due_ical_feeds: {
        Args: { p_limit?: number };
        Returns: { feed_id: string }[];
      };
      cron_settle_ical_alert: {
        Args: { p_claim_id: string; p_delivered: boolean; p_feed_id: string };
        Returns: undefined;
      };
      delete_finance_entry: {
        Args: { p_entry_id: string; p_org_id: string };
        Returns: string[];
      };
      delete_manual_calendar_block: {
        Args: { p_block_id: string; p_org_id: string };
        Returns: undefined;
      };
      expire_holds: { Args: Record<PropertyKey, never>; Returns: number };
      finish_ical_sync: {
        Args: {
          p_error?: string;
          p_events: Json;
          p_feed_id: string;
          p_org_id: string;
          p_token: string;
        };
        Returns: boolean;
      };
      get_booking_status: {
        Args: { p_host: string; p_token: string };
        Returns: Json;
      };
      get_ical_export: { Args: { p_token: string }; Returns: Json };
      get_public_unit_availability: {
        Args: {
          p_from: string;
          p_property_id: string;
          p_to: string;
          p_unit_id: string;
        };
        Returns: {
          end_date: string;
          start_date: string;
        }[];
      };
      list_ical_rentals_to_complete: {
        Args: { p_org_id: string };
        Returns: {
          block_id: string;
          channel: string;
          currency: Database["public"]["Enums"]["currency_code"];
          stay_end: string;
          stay_start: string;
          suggested_cleaning_cents: number;
          unit_id: string;
          unit_name: string;
        }[];
      };
      regenerate_ical_token: {
        Args: { p_feed_id: string; p_org_id: string };
        Returns: string;
      };
      reject_payment: {
        Args: { p_org_id: string; p_payment_id: string; p_reason?: string };
        Returns: Json;
      };
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
      booking_status: "pending_payment" | "confirmed" | "cancelled" | "expired";
      calendar_block_source: "booking" | "ical" | "manual";
      currency_code: "PEN" | "USD";
      fee_kind: "per_stay" | "per_night" | "per_guest";
      finance_channel: "direct" | "airbnb" | "booking" | "other";
      finance_kind: "income" | "expense";
      finance_payment_method:
        "cash" | "bank_transfer" | "yape_plin" | "card" | "platform" | "other";
      finance_source: "manual" | "booking" | "ical";
      ical_channel: "airbnb" | "booking" | "vrbo" | "other";
      membership_role: "owner" | "staff";
      payment_account_kind: "yape" | "plin" | "bank_account";
      payment_method:
        "yape" | "plin" | "bank_transfer" | "mercado_pago" | "cash";
      payment_status: "pending_review" | "approved" | "rejected";
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
      booking_status: ["pending_payment", "confirmed", "cancelled", "expired"],
      calendar_block_source: ["booking", "ical", "manual"],
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
      ical_channel: ["airbnb", "booking", "vrbo", "other"],
      membership_role: ["owner", "staff"],
      payment_account_kind: ["yape", "plin", "bank_account"],
      payment_method: ["yape", "plin", "bank_transfer", "mercado_pago", "cash"],
      payment_status: ["pending_review", "approved", "rejected"],
      photo_role: ["hero", "gallery", "room"],
      space_category: ["pool", "rooms", "common", "outdoor"],
      unit_kind: ["entire_place", "room"],
    },
  },
} as const;
