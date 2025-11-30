// lib/sequence.ts
import { SupabaseClient } from "@supabase/supabase-js";

export async function fetchNextSequence(
  supabase: SupabaseClient,
  brandC: string,
  modelC: string
): Promise<string> {
  const compositePrefix = `${brandC}-${modelC}`;

  const { data, error } = await supabase
    .from("sequence_counters")
    .select("*")
    .eq("prefix", compositePrefix)
    .maybeSingle();

  if (error && error.code !== "PGRST116") {
    console.error("Error reading sequence_counters:", error);
    throw error;
  }

  let nextValue = 1;

  if (!data) {
    const { data: inserted, error: insertErr } = await supabase
      .from("sequence_counters")
      .insert({ prefix: compositePrefix, last_value: 1 })
      .select()
      .single();

    if (insertErr) {
      console.error("Error inserting new sequence prefix:", insertErr);
      throw insertErr;
    }
    nextValue = inserted.last_value || 1;
  } else {
    nextValue = (data.last_value || 0) + 1;
    const { error: updateErr } = await supabase
      .from("sequence_counters")
      .update({ last_value: nextValue })
      .eq("prefix", compositePrefix);

    if (updateErr) {
      console.error("Error updating sequence prefix:", updateErr);
      throw updateErr;
    }
  }

  return String(nextValue).padStart(3, "0");
}
