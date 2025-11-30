"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Head from "next/head";
import { supabase } from "../../../lib/supabaseClient"; // adjust path if needed

// Helper: safely resolve an image URL from your various shapes
function resolveImageUrl(img) {
  if (!img) return null;
  return img.url || img.image_url || img.src || null;
}

// Helper: format money with currency
function formatMoney(value, currency = "USD") {
  if (value === null || value === undefined || isNaN(Number(value))) return null;
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(Number(value));
  } catch {
    return `${currency} ${Number(value).toFixed(0)}`;
  }
}

// Helper: compute savings % from retail vs sale
function computeSavingsPercent(retail, sale) {
  if (
    retail === null ||
    retail === undefined ||
    sale === null ||
    sale === undefined
  )
    return null;
  const r = Number(retail);
  const s = Number(sale);
  if (!isFinite(r) || !isFinite(s) || r <= 0 || s <= 0 || s >= r) return null;
  return Math.round(((r - s) / r) * 100);
}

export default function ItemPage() {
  const params = useParams();
  const slugParam = Array.isArray(params?.slug) ? params.slug[0] : params?.slug;

  const [item, setItem] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (!slugParam) return;

    async function fetchItem() {
      setLoading(true);
      setLoadError("");
      try {
        // Try to match against full_slug, slug or item_number
        const { data, error } = await supabase
          .from("inventory_items")
          .select("*")
          .or(
            `full_slug.eq.${slugParam},slug.eq.${slugParam},item_number.eq.${slugParam}`
          )
          .maybeSingle();

        if (error) {
          console.error("Error loading item:", error);
          setLoadError("Could not load this item.");
        } else if (!data) {
          setLoadError("Item not found.");
        } else {
          setItem(data);
        }
      } catch (err) {
        console.error(err);
        setLoadError("Unexpected error loading this item.");
      } finally {
        setLoading(false);
      }
    }

    fetchItem();
  }, [slugParam]);

  // Basic derived values when we have an item
  const identity = item?.identity || {};
  const brand = item?.brand || identity.brand || "";
  const model = item?.model || identity.model || "";
  const style = item?.style || identity.style || "";
  const categoryPrimary = item?.category_primary || identity.category_primary || "";
  const color = item?.color || identity.color || "";
  const material = item?.material || identity.material || "";
  const hardware = item?.hardware || identity.hardware || "";
  const pattern = item?.pattern || identity.pattern || "";
  const yearRange = item?.year_range || identity.year_range || "";

  const images = Array.isArray(item?.images) ? item.images : [];
  const hasImages = images.length > 0;

  const heroUrl = hasImages ? resolveImageUrl(images[activeIndex] || images[0]) : null;
  const currency = item?.currency || identity.currency || "USD";

  // Pricing logic
  const retailPrice = item?.retail_price ?? null;
  const compLow = item?.comp_low ?? null;
  const compHigh = item?.comp_high ?? null;
  const emzSale = item?.emz_sale ?? item?.listing_price ?? null;

  const savingsPercent = computeSavingsPercent(retailPrice, emzSale);
  const formattedRetail = formatMoney(retailPrice, currency);
  const formattedCompLow = formatMoney(compLow, currency);
  const formattedCompHigh = formatMoney(compHigh, currency);
  const formattedEmzSale = formatMoney(emzSale, currency);

  const conditionGrade = item?.condition_grade || item?.condition || "";
  const conditionNotes = item?.condition_notes || "";

  const dimensions = {
    length: item?.length || "",
    height: item?.height || "",
    depth: item?.depth || "",
    strap_drop: item?.strap_drop || "",
  };

  const includedItems = Array.isArray(item?.included_items)
    ? item.included_items
    : [];

  // EMZCurator description
  const curatorNarrative =
    item?.description ||
    item?.ai_data?.narrative ||
    "EMZCurator description will appear here once generated from intake.";

  // SEO data
  const seo = item?.seo || {};
  const titleBase =
    seo.title ||
    `${brand || ""} ${model || ""}`.trim() ||
    "EMZLoveLuxury Item";
  const subtitlePieces = [];
  if (categoryPrimary) subtitlePieces.push(categoryPrimary);
  if (color) subtitlePieces.push(color);
  if (material) subtitlePieces.push(material);
  const subtitle = subtitlePieces.join(" · ");

  const metaTitle = `${titleBase} | EMZLoveLuxury`;
  const metaDescription =
    seo.description ||
    `${brand || ""} ${model || ""} ${categoryPrimary || ""} in ${color || ""} at EMZLoveLuxury. Professionally sourced, graded and described.`.trim();

  const itemNumber = item?.item_number || "";
  const fullSlug = item?.full_slug || slugParam || "";
  const canonicalUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/item/${encodeURIComponent(fullSlug)}`
      : `https://emzloveluxury.com/item/${encodeURIComponent(fullSlug)}`;

  // Basic CTA handler (for now just anchor or placeholder)
  function handleBuyClick() {
    // You can later wire this to Whatnot / cart / DM / checkout.
    const mailto = `mailto:sales@emzloveluxury.com?subject=Interested in ${encodeURIComponent(
      itemNumber || titleBase
    )}&body=Hi EMZLove, I am interested in this item: ${canonicalUrl}`;
    window.open(mailto, "_blank");
  }

  return (
    <>
      <Head>
        <title>{metaTitle}</title>
        <meta name="description" content={metaDescription} />
        {seo.keywords && Array.isArray(seo.keywords) && seo.keywords.length > 0 && (
          <meta name="keywords" content={seo.keywords.join(", ")} />
        )}
        <link rel="canonical" href={canonicalUrl} />

        {/* Open Graph */}
        <meta property="og:title" content={metaTitle} />
        <meta property="og:description" content={metaDescription} />
        {heroUrl && <meta property="og:image" content={heroUrl} />}
        <meta property="og:url" content={canonicalUrl} />
        <meta property="og:type" content="product" />
      </Head>

      <div
        style={{
          minHeight: "100vh",
          background:
            "radial-gradient(circle at top, #0f172a 0, #020617 45%, #000000 100%)",
          color: "#e5e7eb",
          padding: "20px 16px 32px 16px",
          fontFamily:
            "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
        }}
      >
        <div style={{ maxWidth: "1180px", margin: "0 auto" }}>
          {/* Loading / error states */}
          {loading && (
            <div
              style={{
                padding: "40px 0",
                textAlign: "center",
                color: "#9ca3af",
                fontSize: "14px",
              }}
            >
              Loading item…
            </div>
          )}
          {!loading && loadError && (
            <div
              style={{
                padding: "40px 0",
                textAlign: "center",
                color: "#fecaca",
                fontSize: "14px",
              }}
            >
              {loadError}
            </div>
          )}
          {!loading && !loadError && !item && (
            <div
              style={{
                padding: "40px 0",
                textAlign: "center",
                color: "#9ca3af",
                fontSize: "14px",
              }}
            >
              Item not found.
            </div>
          )}

          {!loading && item && (
            <>
              {/* Header strip */}
              <div
                style={{
                  marginBottom: "16px",
                  borderRadius: "999px",
                  border: "1px solid rgba(212,175,55,0.45)",
                  background:
                    "linear-gradient(135deg, #fef3c7, #f9fafb, #eff6ff)",
                  boxShadow:
                    "0 8px 22px rgba(15,23,42,0.10), 0 0 14px rgba(56,189,248,0.16)",
                  padding: "14px 20px",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: "16px",
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: "10px",
                      textTransform: "uppercase",
                      letterSpacing: "0.22em",
                      color: "#6b7280",
                      marginBottom: "4px",
                    }}
                  >
                    EMZLOVE LUXURY
                  </div>
                  <div
                    style={{
                      fontSize: "18px",
                      fontWeight: 700,
                      color: "#111827",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {brand && <span>{brand}</span>}{" "}
                    {model && <span>{model}</span>}{" "}
                    {!brand && !model && <span>EMZLove Item</span>}
                  </div>
                  {subtitle && (
                    <div
                      style={{
                        fontSize: "11px",
                        color: "#4b5563",
                        marginTop: "2px",
                      }}
                    >
                      {subtitle}
                    </div>
                  )}
                  {itemNumber && (
                    <div
                      style={{
                        fontSize: "11px",
                        color: "#6b7280",
                        marginTop: "4px",
                      }}
                    >
                      <strong>Item #</strong> {itemNumber}
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={handleBuyClick}
                  style={{
                    flexShrink: 0,
                    padding: "8px 18px",
                    fontSize: "12px",
                    borderRadius: "999px",
                    border: "1px solid #1d4ed8",
                    background:
                      "linear-gradient(90deg,#1d4ed8,#3b82f6,#0ea5e9)",
                    color: "#eff6ff",
                    fontWeight: 600,
                    cursor: "pointer",
                    boxShadow: "0 8px 20px rgba(37,99,235,0.6)",
                    textShadow: "0 0 6px rgba(15,23,42,0.8)",
                  }}
                >
                  Contact to Purchase
                </button>
              </div>

              {/* Main layout: left = images, right = details */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    "minmax(0, 480px) minmax(0, 1fr)",
                  gap: "18px",
                  alignItems: "flex-start",
                }}
              >
                {/* LEFT: IMAGES */}
                <section
                  style={{
                    background: "rgba(15,23,42,0.97)",
                    borderRadius: "16px",
                    border: "1px solid rgba(30,64,175,0.9)",
                    padding: "12px",
                    boxShadow: "0 0 30px rgba(37,99,235,0.5)",
                  }}
                >
                  <div
                    style={{
                      fontSize: "11px",
                      letterSpacing: "0.16em",
                      textTransform: "uppercase",
                      color: "#e5e7eb",
                      marginBottom: "6px",
                    }}
                  >
                    Photos
                  </div>
                  <div
                    style={{
                      height: "1px",
                      background:
                        "linear-gradient(to right, rgba(148,163,184,0.8), rgba(15,23,42,0))",
                      marginBottom: "10px",
                    }}
                  />
                  <div
                    style={{
                      position: "relative",
                      width: "100%",
                      aspectRatio: "4 / 3",
                      borderRadius: "18px",
                      overflow: "hidden",
                      backgroundImage: "url('/emz-heart-gold.png')",
                      backgroundSize: "cover",
                      backgroundPosition: "center",
                      backgroundRepeat: "no-repeat",
                      boxShadow: "0 18px 40px rgba(0,0,0,0.55)",
                      marginBottom: "8px",
                    }}
                  >
                    {heroUrl ? (
                      <img
                        src={heroUrl}
                        alt={model || brand || "Item photo"}
                        style={{
                          width: "100%",
                          height: "100%",
                          objectFit: "cover",
                        }}
                      />
                    ) : (
                      <div
                        style={{
                          width: "100%",
                          height: "100%",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: "11px",
                          color: "#6b7280",
                          background: "#020617",
                        }}
                      >
                        Photos coming soon.
                      </div>
                    )}
                  </div>

                  {images.length > 1 && (
                    <div
                      style={{
                        display: "flex",
                        flexWrap: "wrap",
                        gap: "6px",
                        marginTop: "4px",
                      }}
                    >
                      {images.map((img, idx) => {
                        const thumbUrl = resolveImageUrl(img);
                        if (!thumbUrl) return null;
                        const selected = idx === activeIndex;
                        return (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => setActiveIndex(idx)}
                            style={{
                              flex: "0 0 calc((100% - 24px) / 5)",
                              aspectRatio: "4 / 3",
                              borderRadius: "10px",
                              overflow: "hidden",
                              border: selected
                                ? "2px solid #facc15"
                                : "1px solid #020617",
                              padding: 0,
                              background: "#020617",
                              cursor: "pointer",
                            }}
                          >
                            <img
                              src={thumbUrl}
                              alt={`Photo ${idx + 1}`}
                              style={{
                                width: "100%",
                                height: "100%",
                                objectFit: "cover",
                              }}
                            />
                          </button>
                        );
                      })}
                    </div>
                  )}
                </section>

                {/* RIGHT: DETAILS & PRICING */}
                <section
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "12px",
                  }}
                >
                  {/* Pricing card */}
                  <div
                    style={{
                      background:
                        "radial-gradient(circle at top, rgba(56,189,248,0.4), rgba(15,23,42,1))",
                      borderRadius: "16px",
                      border: "1px solid rgba(56,189,248,0.9)",
                      padding: "12px",
                      boxShadow:
                        "0 0 30px rgba(56,189,248,0.45), 0 0 6px rgba(250,204,21,0.4)",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "flex-start",
                        gap: "10px",
                      }}
                    >
                      <div>
                        <div
                          style={{
                            fontSize: "11px",
                            textTransform: "uppercase",
                            letterSpacing: "0.16em",
                            color: "#e0f2fe",
                            marginBottom: "4px",
                          }}
                        >
                          Pricing Snapshot
                        </div>

                        {formattedEmzSale ? (
                          <div
                            style={{
                              fontSize: "20px",
                              fontWeight: 700,
                              color: "#fef9c3",
                              textShadow: "0 0 10px rgba(15,23,42,0.9)",
                            }}
                          >
                            {formattedEmzSale}
                            <span
                              style={{
                                fontSize: "10px",
                                marginLeft: "6px",
                                color: "#e5e7eb",
                                opacity: 0.8,
                              }}
                            >
                              EMZSale
                            </span>
                          </div>
                        ) : (
                          <div
                            style={{
                              fontSize: "13px",
                              color: "#e5e7eb",
                            }}
                          >
                            Contact EMZLove for current pricing.
                          </div>
                        )}

                        <div
                          style={{
                            marginTop: "6px",
                            fontSize: "11px",
                            color: "#e5e7eb",
                          }}
                        >
                          {formattedRetail && (
                            <div>
                              Retail (approx):{" "}
                              <span
                                style={{
                                  textDecoration: "line-through",
                                  opacity: 0.85,
                                }}
                              >
                                {formattedRetail}
                              </span>
                            </div>
                          )}
                          {(formattedCompLow || formattedCompHigh) && (
                            <div>
                              Comp Range:{" "}
                              {formattedCompLow && formattedCompHigh
                                ? `${formattedCompLow} – ${formattedCompHigh}`
                                : formattedCompLow || formattedCompHigh}
                            </div>
                          )}
                        </div>
                      </div>

                      {savingsPercent !== null && (
                        <div
                          style={{
                            padding: "6px 10px",
                            borderRadius: "999px",
                            border: "1px solid rgba(250,204,21,0.9)",
                            background: "rgba(22,163,74,0.25)",
                            color: "#bbf7d0",
                            fontSize: "11px",
                            fontWeight: 600,
                            textAlign: "right",
                            boxShadow:
                              "0 0 12px rgba(34,197,94,0.5), 0 0 2px rgba(250,204,21,0.8)",
                            minWidth: "140px",
                          }}
                        >
                          <div
                            style={{
                              fontSize: "10px",
                              textTransform: "uppercase",
                              letterSpacing: "0.14em",
                              color: "#fef3c7",
                              marginBottom: "2px",
                            }}
                          >
                            You Save
                          </div>
                          <div style={{ fontSize: "16px" }}>
                            {savingsPercent}% Off Retail
                          </div>
                        </div>
                      )}
                    </div>

                    <div
                      style={{
                        marginTop: "10px",
                        fontSize: "10px",
                        color: "#bfdbfe",
                      }}
                    >
                      Pricing is based on EMZCurator market scans and recent
                      resale comps. All items are individually graded by EMZLove
                      before listing.
                    </div>
                  </div>

                  {/* Quick facts */}
                  <div
                    style={{
                      background: "rgba(15,23,42,0.96)",
                      borderRadius: "16px",
                      border: "1px solid #1f2937",
                      padding: "12px",
                    }}
                  >
                    <div
                      style={{
                        fontSize: "11px",
                        textTransform: "uppercase",
                        letterSpacing: "0.16em",
                        color: "#93c5fd",
                        marginBottom: "8px",
                      }}
                    >
                      Quick Facts
                    </div>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns:
                          "repeat(2, minmax(0, 1fr))",
                        gap: "6px 16px",
                        fontSize: "11px",
                      }}
                    >
                      {brand && (
                        <div>
                          <span style={{ color: "#9ca3af" }}>Brand</span>
                          <br />
                          <span>{brand}</span>
                        </div>
                      )}
                      {model && (
                        <div>
                          <span style={{ color: "#9ca3af" }}>Model</span>
                          <br />
                          <span>{model}</span>
                        </div>
                      )}
                      {style && (
                        <div>
                          <span style={{ color: "#9ca3af" }}>Style</span>
                          <br />
                          <span>{style}</span>
                        </div>
                      )}
                      {categoryPrimary && (
                        <div>
                          <span style={{ color: "#9ca3af" }}>Category</span>
                          <br />
                          <span>{categoryPrimary}</span>
                        </div>
                      )}
                      {color && (
                        <div>
                          <span style={{ color: "#9ca3af" }}>Color</span>
                          <br />
                          <span>{color}</span>
                        </div>
                      )}
                      {material && (
                        <div>
                          <span style={{ color: "#9ca3af" }}>Material</span>
                          <br />
                          <span>{material}</span>
                        </div>
                      )}
                      {hardware && (
                        <div>
                          <span style={{ color: "#9ca3af" }}>Hardware</span>
                          <br />
                          <span>{hardware}</span>
                        </div>
                      )}
                      {pattern && (
                        <div>
                          <span style={{ color: "#9ca3af" }}>Pattern</span>
                          <br />
                          <span>{pattern}</span>
                        </div>
                      )}
                      {yearRange && (
                        <div>
                          <span style={{ color: "#9ca3af" }}>Era</span>
                          <br />
                          <span>{yearRange}</span>
                        </div>
                      )}
                      {itemNumber && (
                        <div>
                          <span style={{ color: "#9ca3af" }}>Item #</span>
                          <br />
                          <span>{itemNumber}</span>
                        </div>
                      )}
                    </div>

                    {/* Dimensions */}
                    {(dimensions.length ||
                      dimensions.height ||
                      dimensions.depth ||
                      dimensions.strap_drop) && (
                      <div
                        style={{
                          marginTop: "10px",
                          fontSize: "11px",
                        }}
                      >
                        <div
                          style={{
                            color: "#9ca3af",
                            marginBottom: "2px",
                          }}
                        >
                          Measurements (approx.)
                        </div>
                        <div>
                          {dimensions.length && <>L: {dimensions.length} </>}
                          {dimensions.height && <>· H: {dimensions.height} </>}
                          {dimensions.depth && <>· D: {dimensions.depth} </>}
                          {dimensions.strap_drop && (
                            <>· Strap Drop: {dimensions.strap_drop}</>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Condition */}
                    {(conditionGrade || conditionNotes) && (
                      <div
                        style={{
                          marginTop: "10px",
                          fontSize: "11px",
                        }}
                      >
                        <div
                          style={{
                            color: "#9ca3af",
                            marginBottom: "2px",
                          }}
                        >
                          Condition
                        </div>
                        {conditionGrade && (
                          <div>
                            <strong>{conditionGrade}</strong>
                          </div>
                        )}
                        {conditionNotes && (
                          <div
                            style={{
                              marginTop: "2px",
                              color: "#e5e7eb",
                            }}
                          >
                            {conditionNotes}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Inclusions */}
                    {includedItems.length > 0 && (
                      <div
                        style={{
                          marginTop: "10px",
                          fontSize: "11px",
                        }}
                      >
                        <div
                          style={{
                            color: "#9ca3af",
                            marginBottom: "2px",
                          }}
                        >
                          Inclusions
                        </div>
                        <ul
                          style={{
                            paddingLeft: "18px",
                            margin: 0,
                          }}
                        >
                          {includedItems.map((inc, idx) => (
                            <li key={idx}>{inc}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>

                  {/* EMZCurator narrative */}
                  <div
                    style={{
                      background: "rgba(15,23,42,0.96)",
                      borderRadius: "16px",
                      border: "1px solid #1f2937",
                      padding: "12px",
                    }}
                  >
                    <div
                      style={{
                        fontSize: "11px",
                        textTransform: "uppercase",
                        letterSpacing: "0.16em",
                        color: "#93c5fd",
                        marginBottom: "8px",
                      }}
                    >
                      EMZCurator Description
                    </div>
                    <div
                      style={{
                        fontSize: "12px",
                        lineHeight: 1.5,
                        whiteSpace: "pre-wrap",
                      }}
                    >
                      {curatorNarrative}
                    </div>
                  </div>
                </section>
              </div>

              {/* Footer note */}
              <div
                style={{
                  marginTop: "18px",
                  fontSize: "11px",
                  color: "#6b7280",
                  textAlign: "center",
                }}
              >
                All items are sourced and restored by EMZLoveLuxury, with
                condition grading performed by hand. For specific questions,
                photos or video, please contact us with the item number.
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
