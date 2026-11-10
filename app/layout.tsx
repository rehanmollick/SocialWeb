import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "SocialWeb — Your people, in perspective",
  description:
    "A personal relationship map. Remember who matters, find the right people, and follow through.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
