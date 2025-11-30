import { createClient } from "@supabase/supabase-js";

export default async function TagsPage({ params }) {
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

  const imageUrl =
    item.image_placeholder_url ||
    "https://placehold.co/300x300?text=EMZLoveLuxury";

  return (
    <div className="bg-white min-h-screen p-10 text-black">
      <div className="grid grid-cols-2 gap-8">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="border p-4 flex flex-col items-center justify-center"
          >
            <img
              src={imageUrl}
              alt={item.full_slug}
              className="w-32 h-32 object-cover mb-2"
            />
            <p className="text-sm font-bold text-center">
              {item.brand} {item.model}
            </p>
            <p className="text-xs text-center">SKU: {item.item_number}</p>
            <p className="text-xs text-center">{item.full_slug}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
