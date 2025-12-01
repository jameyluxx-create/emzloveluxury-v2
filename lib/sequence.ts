// lib/sequence.ts
import { SupabaseClient } from "@supabase/supabase-js";

export async function fetchNextSequence(
  supabase: SupabaseClient,
  brandCode: string,
  modelCode: string
): Promise<number> {
  const { data, error } = await supabase.rpc("next_sequence", {
    brand_code: brandCode,
    model_code: modelCode,
  });

  if (error) {
    console.error("next_sequence RPC error", error);
    throw new Error(error.message || "Failed to get next sequence");
  }

  if (typeof data !== "number") {
    throw new Error("Invalid response from next_sequence");
  }

  return data;
}
