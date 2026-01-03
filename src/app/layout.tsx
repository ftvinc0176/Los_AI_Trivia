import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Los_Trivia 1.0 - AI-Powered Trivia Game",
  description: "Premium AI-powered trivia game with single and multiplayer modes",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
