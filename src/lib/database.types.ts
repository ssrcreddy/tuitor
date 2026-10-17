
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "availability_exceptions": {
                  Row: {
                    "ends_at": string,"id": number,"note": string | null,"starts_at": string,"tutor_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "ends_at": string,"id"?: never,"note"?: string | null,"starts_at": string,"tutor_id": string
                  }
                  Update: {
                    "ends_at"?: string,"id"?: never,"note"?: string | null,"starts_at"?: string,"tutor_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "availability_exceptions_tutor_id_fkey"
      columns: ["tutor_id"]
isOneToOne: false
      referencedRelation: "tutor_profiles"
      referencedColumns: ["user_id"]
    }
                  ]
                },"availability_rules": {
                  Row: {
                    "end_time": string,"id": number,"start_time": string,"tutor_id": string,"weekday": number
                  }
                  ComputedFields: never
                  Insert: {
                    "end_time": string,"id"?: never,"start_time": string,"tutor_id": string,"weekday": number
                  }
                  Update: {
                    "end_time"?: string,"id"?: never,"start_time"?: string,"tutor_id"?: string,"weekday"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "availability_rules_tutor_id_fkey"
      columns: ["tutor_id"]
isOneToOne: false
      referencedRelation: "tutor_profiles"
      referencedColumns: ["user_id"]
    }
                  ]
                },"bookings": {
                  Row: {
                    "created_at": string,"currency": string,"daily_room_url": string | null,"ends_at": string,"hold_expires_at": string | null,"id": string,"package_id": string | null,"platform_fee_cents": number,"price_cents": number,"starts_at": string,"status": Database["public"]['Enums']["booking_status"],"student_id": string,"tutor_id": string,"type": Database["public"]['Enums']["booking_type"]
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"currency": string,"daily_room_url"?: string | null,"ends_at": string,"hold_expires_at"?: string | null,"id"?: string,"package_id"?: string | null,"platform_fee_cents": number,"price_cents": number,"starts_at": string,"status"?: Database["public"]['Enums']["booking_status"],"student_id": string,"tutor_id": string,"type": Database["public"]['Enums']["booking_type"]
                  }
                  Update: {
                    "created_at"?: string,"currency"?: string,"daily_room_url"?: string | null,"ends_at"?: string,"hold_expires_at"?: string | null,"id"?: string,"package_id"?: string | null,"platform_fee_cents"?: number,"price_cents"?: number,"starts_at"?: string,"status"?: Database["public"]['Enums']["booking_status"],"student_id"?: string,"tutor_id"?: string,"type"?: Database["public"]['Enums']["booking_type"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "bookings_package_fk"
      columns: ["package_id"]
isOneToOne: false
      referencedRelation: "packages"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "bookings_student_id_fkey"
      columns: ["student_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "bookings_tutor_id_fkey"
      columns: ["tutor_id"]
isOneToOne: false
      referencedRelation: "tutor_profiles"
      referencedColumns: ["user_id"]
    }
                  ]
                },"conversations": {
                  Row: {
                    "created_at": string,"id": string,"student_id": string,"tutor_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"student_id": string,"tutor_id": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"student_id"?: string,"tutor_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "conversations_student_id_fkey"
      columns: ["student_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "conversations_tutor_id_fkey"
      columns: ["tutor_id"]
isOneToOne: false
      referencedRelation: "tutor_profiles"
      referencedColumns: ["user_id"]
    }
                  ]
                },"lesson_reports": {
                  Row: {
                    "approved_at": string | null,"booking_id": string,"cefr_estimate": string | null,"corrections": NonNullable<Json>,"created_at": string,"generated_at": string | null,"homework": string,"summary": string,"transcript": string | null,"vocabulary": NonNullable<Json>
                  }
                  ComputedFields: never
                  Insert: {
                    "approved_at"?: string | null,"booking_id": string,"cefr_estimate"?: string | null,"corrections"?: NonNullable<Json>,"created_at"?: string,"generated_at"?: string | null,"homework"?: string,"summary"?: string,"transcript"?: string | null,"vocabulary"?: NonNullable<Json>
                  }
                  Update: {
                    "approved_at"?: string | null,"booking_id"?: string,"cefr_estimate"?: string | null,"corrections"?: NonNullable<Json>,"created_at"?: string,"generated_at"?: string | null,"homework"?: string,"summary"?: string,"transcript"?: string | null,"vocabulary"?: NonNullable<Json>
                  }
                  Relationships: [
                    {
      foreignKeyName: "lesson_reports_booking_id_fkey"
      columns: ["booking_id"]
isOneToOne: true
      referencedRelation: "bookings"
      referencedColumns: ["id"]
    }
                  ]
                },"messages": {
                  Row: {
                    "body": string,"conversation_id": string,"created_at": string,"id": number,"sender_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "body": string,"conversation_id": string,"created_at"?: string,"id"?: never,"sender_id": string
                  }
                  Update: {
                    "body"?: string,"conversation_id"?: string,"created_at"?: string,"id"?: never,"sender_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "messages_conversation_id_fkey"
      columns: ["conversation_id"]
isOneToOne: false
      referencedRelation: "conversations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "messages_sender_id_fkey"
      columns: ["sender_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"packages": {
                  Row: {
                    "created_at": string,"credits_total": number,"credits_used": number,"currency": string,"id": string,"price_cents": number,"student_id": string,"tutor_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"credits_total": number,"credits_used"?: number,"currency": string,"id"?: string,"price_cents": number,"student_id": string,"tutor_id": string
                  }
                  Update: {
                    "created_at"?: string,"credits_total"?: number,"credits_used"?: number,"currency"?: string,"id"?: string,"price_cents"?: number,"student_id"?: string,"tutor_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "packages_student_id_fkey"
      columns: ["student_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "packages_tutor_id_fkey"
      columns: ["tutor_id"]
isOneToOne: false
      referencedRelation: "tutor_profiles"
      referencedColumns: ["user_id"]
    }
                  ]
                },"payments": {
                  Row: {
                    "amount_cents": number,"booking_id": string | null,"created_at": string,"currency": string,"id": string,"package_id": string | null,"status": Database["public"]['Enums']["payment_status"],"stripe_checkout_session_id": string | null,"stripe_payment_intent_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "amount_cents": number,"booking_id"?: string | null,"created_at"?: string,"currency": string,"id"?: string,"package_id"?: string | null,"status"?: Database["public"]['Enums']["payment_status"],"stripe_checkout_session_id"?: string | null,"stripe_payment_intent_id"?: string | null
                  }
                  Update: {
                    "amount_cents"?: number,"booking_id"?: string | null,"created_at"?: string,"currency"?: string,"id"?: string,"package_id"?: string | null,"status"?: Database["public"]['Enums']["payment_status"],"stripe_checkout_session_id"?: string | null,"stripe_payment_intent_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "payments_booking_id_fkey"
      columns: ["booking_id"]
isOneToOne: false
      referencedRelation: "bookings"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payments_package_id_fkey"
      columns: ["package_id"]
isOneToOne: false
      referencedRelation: "packages"
      referencedColumns: ["id"]
    }
                  ]
                },"practice_messages": {
                  Row: {
                    "content": string,"created_at": string,"id": number,"role": string,"session_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "content": string,"created_at"?: string,"id"?: never,"role": string,"session_id": string
                  }
                  Update: {
                    "content"?: string,"created_at"?: string,"id"?: never,"role"?: string,"session_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "practice_messages_session_id_fkey"
      columns: ["session_id"]
isOneToOne: false
      referencedRelation: "practice_sessions"
      referencedColumns: ["id"]
    }
                  ]
                },"practice_sessions": {
                  Row: {
                    "created_at": string,"id": string,"language": string,"level": string | null,"student_id": string,"topic": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"language": string,"level"?: string | null,"student_id": string,"topic"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"language"?: string,"level"?: string | null,"student_id"?: string,"topic"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "practice_sessions_student_id_fkey"
      columns: ["student_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "avatar_url": string | null,"created_at": string,"full_name": string,"id": string,"role": Database["public"]['Enums']["user_role"],"timezone": string
                  }
                  ComputedFields: never
                  Insert: {
                    "avatar_url"?: string | null,"created_at"?: string,"full_name"?: string,"id": string,"role"?: Database["public"]['Enums']["user_role"],"timezone"?: string
                  }
                  Update: {
                    "avatar_url"?: string | null,"created_at"?: string,"full_name"?: string,"id"?: string,"role"?: Database["public"]['Enums']["user_role"],"timezone"?: string
                  }
                  Relationships: [
                    
                  ]
                },"reviews": {
                  Row: {
                    "body": string,"booking_id": string,"created_at": string,"rating": number,"reviewer_name": string,"student_id": string,"tutor_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "body"?: string,"booking_id": string,"created_at"?: string,"rating": number,"reviewer_name"?: string,"student_id": string,"tutor_id": string
                  }
                  Update: {
                    "body"?: string,"booking_id"?: string,"created_at"?: string,"rating"?: number,"reviewer_name"?: string,"student_id"?: string,"tutor_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "reviews_booking_id_fkey"
      columns: ["booking_id"]
isOneToOne: true
      referencedRelation: "bookings"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reviews_student_id_fkey"
      columns: ["student_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reviews_tutor_id_fkey"
      columns: ["tutor_id"]
isOneToOne: false
      referencedRelation: "tutor_profiles"
      referencedColumns: ["user_id"]
    }
                  ]
                },"tutor_languages": {
                  Row: {
                    "id": number,"language": string,"proficiency": string,"teaches": boolean,"tutor_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "id"?: never,"language": string,"proficiency": string,"teaches"?: boolean,"tutor_id": string
                  }
                  Update: {
                    "id"?: never,"language"?: string,"proficiency"?: string,"teaches"?: boolean,"tutor_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "tutor_languages_tutor_id_fkey"
      columns: ["tutor_id"]
isOneToOne: false
      referencedRelation: "tutor_profiles"
      referencedColumns: ["user_id"]
    }
                  ]
                },"tutor_profiles": {
                  Row: {
                    "bio": string,"country": string | null,"created_at": string,"currency": string,"headline": string,"hourly_rate_cents": number,"lessons_taught": number,"rating_avg": number,"review_count": number,"status": Database["public"]['Enums']["tutor_status"],"stripe_account_id": string | null,"trial_rate_cents": number,"updated_at": string,"user_id": string,"video_url": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "bio"?: string,"country"?: string | null,"created_at"?: string,"currency"?: string,"headline"?: string,"hourly_rate_cents"?: number,"lessons_taught"?: number,"rating_avg"?: number,"review_count"?: number,"status"?: Database["public"]['Enums']["tutor_status"],"stripe_account_id"?: string | null,"trial_rate_cents"?: number,"updated_at"?: string,"user_id": string,"video_url"?: string | null
                  }
                  Update: {
                    "bio"?: string,"country"?: string | null,"created_at"?: string,"currency"?: string,"headline"?: string,"hourly_rate_cents"?: number,"lessons_taught"?: number,"rating_avg"?: number,"review_count"?: number,"status"?: Database["public"]['Enums']["tutor_status"],"stripe_account_id"?: string | null,"trial_rate_cents"?: number,"updated_at"?: string,"user_id"?: string,"video_url"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "tutor_profiles_user_id_fkey"
      columns: ["user_id"]
isOneToOne: true
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
            "create_booking_hold":
{ Args: { "p_starts_at": string,"p_tutor_id": string,"p_type": Database["public"]['Enums']["booking_type"] }; Returns: {
              "created_at": string,
"currency": string,
"daily_room_url": string | null,
"ends_at": string,
"hold_expires_at": string | null,
"id": string,
"package_id": string | null,
"platform_fee_cents": number,
"price_cents": number,
"starts_at": string,
"status": Database["public"]['Enums']["booking_status"],
"student_id": string,
"tutor_id": string,
"type": Database["public"]['Enums']["booking_type"]
            }
                          SetofOptions: {
        from: "*"
        to: "bookings"
        isOneToOne: true
        isSetofReturn: false
      } },
"is_admin":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"lesson_minutes":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"platform_fee_cents":
{ Args: { "p_price": number,"p_type": Database["public"]['Enums']["booking_type"] }; Returns: number
                           },
"tutor_busy_times":
{ Args: { "p_from": string,"p_to": string,"p_tutor_id": string }; Returns: {
              "ends_at": string,"starts_at": string
            }[]
                           }
          }
          Enums: {
            "booking_status": "pending_payment"|"confirmed"|"completed"|"cancelled"|"no_show","booking_type": "trial"|"regular","payment_status": "pending"|"succeeded"|"refunded"|"failed","tutor_status": "pending"|"approved"|"rejected","user_role": "student"|"tutor"|"admin"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            "booking_status": ["pending_payment", "confirmed", "completed", "cancelled", "no_show"],"booking_type": ["trial", "regular"],"payment_status": ["pending", "succeeded", "refunded", "failed"],"tutor_status": ["pending", "approved", "rejected"],"user_role": ["student", "tutor", "admin"]
          }
        }
} as const
