import { AuthForm } from "../auth-form";

export const metadata = { title: "Sign up · Tuitor" };

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ role?: string }> }) {
  const { role } = await searchParams;
  return <AuthForm mode="signup" defaultRole={role === "tutor" ? "tutor" : "student"} />;
}
