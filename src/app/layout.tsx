import type { Metadata } from "next";
import './globals.css';

export const metadata: Metadata = {
  title: "Haven - Decentralized Video Library",
  description: "Access your encrypted video collection from anywhere using your Web3 wallet",
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
