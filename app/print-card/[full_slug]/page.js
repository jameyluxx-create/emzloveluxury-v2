import { createClient } from "@supabase/supabase-js";
import PrintCard from "@/components/print-card";

export default async function PrintCardPage({ params }) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );

  const { data: item, error } = await supabase
    .from("items")
    .select("*")
    .eq("full_slug", params.full_slug)
    .single();

  if (error || !item) {
    return (
      <div className="p-10 text-red-600">
        Item not found: {params.full_slug}
      </div>
    );
  }

  return (
    <div className="bg-neutral-200 min-h-screen py-10">
      <PrintCard item={item} />
    </div>
  );
}
