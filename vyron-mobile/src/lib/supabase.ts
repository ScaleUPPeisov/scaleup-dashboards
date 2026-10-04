import "react-native-url-polyfill/auto";
import "expo-sqlite/localStorage/install";
import { AppState, Platform } from "react-native";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim();
const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();

export const supabaseConfigured = Boolean(url && key);
export const supabase: SupabaseClient | null = supabaseConfigured
  ? createClient(url!, key!, {
      auth: {
        storage: localStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    })
  : null;

if (supabase && Platform.OS !== "web") {
  AppState.addEventListener("change", state => {
    if (state === "active") supabase?.auth.startAutoRefresh();
    else supabase?.auth.stopAutoRefresh();
  });
}
