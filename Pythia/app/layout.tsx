import "./globals.css";
import { IBM_Plex_Sans } from "next/font/google";

const plex = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export const metadata = {
  title: "Bulk RNA-seq Analysis",
  description: "DESeq2 + GO/KEGG SaaS web app",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <body className={`${plex.className} h-full bg-base-950 text-base-100`}>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 bg-accent-600 text-white px-3 py-2 rounded-md"
        >
          Skip to main content
        </a>
        {children}
      </body>
    </html>
  );
}
