import type { Metadata } from "next";
import { Archivo, Martian_Mono } from "next/font/google";
import "./globals.css";

// Archivo is variable in width too: `wdth` lets headings run expanded
// (--font-stretch-display in globals.css).
const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
  axes: ["wdth"],
});

const martianMono = Martian_Mono({
  variable: "--font-martian-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Job Tracker",
  description: "Track job applications, their statuses and history.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${archivo.variable} ${martianMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-bg text-text">
        {children}
      </body>
    </html>
  );
}
