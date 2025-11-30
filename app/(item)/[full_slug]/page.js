import { createClient } from "@supabase/supabase-js";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";

export default async function ItemPage({ params }) {
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
    "https://placehold.co/600x600?text=No+Image";

  return (
    <div className="container mx-auto py-10 max-w-5xl">
      <h1 className="text-3xl font-bold mb-6">
        {item.brand} {item.model}
      </h1>

      <img
        src={imageUrl}
        alt={item.full_slug}
        className="w-72 h-72 object-cover rounded mb-10 border"
      />

      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Item Overview</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-6">
          <div>
            <p className="text-sm text-muted-foreground">Brand</p>
            <p>{item.brand}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Model</p>
            <p>{item.model}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">SKU</p>
            <p>{item.item_number}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Slug</p>
            <p>{item.full_slug}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Grade</p>
            <p>{item.grade}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Status</p>
            <p>{item.status}</p>
          </div>
        </CardContent>
      </Card>

      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Identity</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-6">
          {Object.entries(item.identity || {}).map(([key, val]) => (
            <div key={key}>
              <p className="text-sm text-muted-foreground capitalize">
                {key}
              </p>
              <p>{val || "-"}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="mb-8">
        <CardHeader>
          <CardTitle>SEO Data</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="text-sm text-muted-foreground">Title</p>
            <p>{item.seo?.title || "-"}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Subtitle</p>
            <p>{item.seo?.subtitle || "-"}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Bullets</p>
            <ul className="list-disc ml-6">
              {(item.seo?.bullets || []).map((b, i) => (
                <li key={i}>{b}</li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Description</p>
            <p>{item.seo?.description || "-"}</p>
          </div>
        </CardContent>
      </Card>

      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Keywords & Notes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="text-sm text-muted-foreground">Keywords</p>
            <p>{(item.search_keywords || []).join(", ")}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Notes</p>
            <p>{item.notes || "-"}</p>
          </div>
        </CardContent>
      </Card>

      <div className="flex gap-4 mt-10">
        <a
          href={`/print-card/${item.full_slug}`}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded"
        >
          Print Card
        </a>
        <a
          href={`/tags/${item.full_slug}`}
          className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded"
        >
          Tags
        </a>
      </div>
    </div>
  );
}
