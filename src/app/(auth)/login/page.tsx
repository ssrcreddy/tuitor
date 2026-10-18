import { AuthForm } from "../auth-form";

export const metadata = { title: "Log in · Tuitor" };

const ERRORS: Record<string, string> = {
  link_expired:
    "That link has expired or was already used. If you've already confirmed your email, just log in below.",
  google: "Google sign-in isn't available right now. Please use your email and password.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string; notice?: string }>;
}) {
  const { next, error, notice } = await searchParams;
  return (
    <>
      {notice === "confirmed" && (
        <p role="status" className="mx-auto mt-6 max-w-sm rounded-md bg-success-soft p-3 text-sm text-success">
          Your email is confirmed. Log in to continue.
        </p>
      )}
      {error && (
        <p role="alert" className="mx-auto mt-6 max-w-sm rounded-md bg-danger-soft p-3 text-sm text-danger">
          {ERRORS[error] ?? "Sign-in failed. Please try again."}
        </p>
      )}
      <AuthForm mode="login" next={next} />
    </>
  );
}
