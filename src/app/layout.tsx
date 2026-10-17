import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { dashboardPath, getCurrentProfile } from "@/lib/auth";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Tuitor · Learn languages with tutors and an AI coach",
  description: "Book 1-on-1 lessons with expert language tutors, then keep practising with an AI coach that remembers every lesson.",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const profile = await getCurrentProfile();

  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} min-h-screen font-sans antialiased`}>
        <header className="border-b border-border">
          <nav className="mx-auto flex max-w-6xl items-center gap-6 px-4 py-3">
            <Link href="/" className="text-lg font-bold tracking-tight">
              Tuitor<span className="text-brand">.</span>
            </Link>
            <Link href="/tutors" className="text-sm font-medium hover:text-brand">
              Find tutors
            </Link>
            {!profile && (
              <Link href="/signup?role=tutor" className="hidden text-sm font-medium hover:text-brand sm:block">
                Become a tutor
              </Link>
            )}
            <div className="ml-auto flex items-center gap-3">
              {profile ? (
                <>
                  <Link href={dashboardPath(profile.role)} className="text-sm font-medium hover:text-brand">
                    Dashboard
                  </Link>
                  <form action="/auth/signout" method="post">
                    <button className="btn-secondary py-1.5">Log out</button>
                  </form>
                </>
              ) : (
                <>
                  <Link href="/login" className="text-sm font-medium hover:text-brand">
                    Log in
                  </Link>
                  <Link href="/signup" className="btn-primary py-1.5">
                    Sign up
                  </Link>
                </>
              )}
            </div>
          </nav>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
