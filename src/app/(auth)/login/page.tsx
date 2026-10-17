import { AuthForm } from "../auth-form";

export const metadata = { title: "Log in · Tuitor" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;
  return (
    <>
      {error && (
        <p role="alert" className="mx-auto mt-6 max-w-sm rounded-md bg-danger-soft p-3 text-sm text-danger">
          Sign-in failed. Please try again.
        </p>
      )}
      <AuthForm mode="login" next={next} />
    </>
  );
}
