export default function PrintCard({ item }) {
  const imageUrl =
    item.image_placeholder_url ||
    "https://placehold.co/400x400?text=EMZLoveLuxury";

  return (
    <div className="w-[8.5in] h-[11in] p-8 flex flex-col gap-6 border mx-auto bg-white text-black">
      <header className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">EMZLove Luxury</h1>
          <p className="text-sm">Intake / Listing Card</p>
        </div>
        <div className="text-right text-sm">
          <p>SKU: {item.item_number}</p>
          <p>Slug: {item.full_slug}</p>
        </div>
      </header>

      <div className="flex gap-6">
        <img
          src={imageUrl}
          alt={item.full_slug}
          className="w-60 h-60 object-cover border"
        />
        <div className="flex-1 space-y-2 text-sm">
          <p>
            <span className="font-semibold">Brand:</span> {item.brand}
          </p>
          <p>
            <span className="font-semibold">Model:</span> {item.model}
          </p>
          <p>
            <span className="font-semibold">Grade:</span> {item.grade}
          </p>
          <p>
            <span className="font-semibold">Status:</span> {item.status}
          </p>

          <div className="mt-4">
            <p className="font-semibold mb-1">Key Attributes:</p>
            <ul className="list-disc ml-5">
              {Object.entries(item.identity || {}).map(([key, val]) => (
                <li key={key}>
                  <span className="capitalize">{key}:</span> {val || "-"}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      <section className="text-sm">
        <h2 className="font-semibold mb-1">SEO Bullets</h2>
        <ul className="list-disc ml-5">
          {(item.seo?.bullets || []).map((b, i) => (
            <li key={i}>{b}</li>
          ))}
        </ul>
      </section>

      <section className="text-sm">
        <h2 className="font-semibold mb-1">Description</h2>
        <p>{item.seo?.description || "-"}</p>
      </section>

      <footer className="mt-auto text-xs flex justify-between items-end">
        <div>
          <p>Keywords: {(item.search_keywords || []).join(", ")}</p>
        </div>
        <div className="text-right">
          <p>www.emzloveluxury.com</p>
        </div>
      </footer>
    </div>
  );
}
