import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "JobPilot",
  description: "A focused workspace for your job search.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body style={{ margin: 0, minHeight: "100vh", background: "#0b1220" }}>{children}</body>
    </html>
  );
}
