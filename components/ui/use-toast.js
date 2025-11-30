"use client";

export function useToast() {
  function toast({ title, description, variant } = {}) {
    // Simple fallback: log + alert.
    console.log("[toast]", { title, description, variant });
    if (typeof window !== "undefined") {
      alert([title, description].filter(Boolean).join("\n\n"));
    }
  }

  return { toast };
}
