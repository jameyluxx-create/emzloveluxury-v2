// app/layout.js
import "./globals.css";

export const metadata = {
  title: "EMZLove Luxury Intake",
  description: "Intake & curation for EMZLove Luxury inventory.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">
        <main className="min-h-screen">{children}</main>
      </body>
    </html>
  );
}
