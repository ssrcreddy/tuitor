"use client";

import Link from "next/link";
import { useActionState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { TimezoneInput } from "@/components/timezone-input";
import { signIn, signInWithGoogle, signUp, type AuthState } from "./actions";

export function AuthForm({
  mode,
  next,
  defaultRole = "student",
}: {
  mode: "login" | "signup";
  next?: string;
  defaultRole?: "student" | "tutor";
}) {
  const [state, action] = useActionState<AuthState, FormData>(mode === "login" ? signIn : signUp, {});
  const isSignup = mode === "signup";

  return (
    <div className="mx-auto w-full max-w-sm px-4 py-16">
      <h1 className="text-2xl font-semibold">{isSignup ? "Create your account" : "Welcome back"}</h1>

      <form action={signInWithGoogle} className="mt-6">
        <input type="hidden" name="next" value={next ?? ""} />
        <button type="submit" className="btn-secondary w-full">
          Continue with Google
        </button>
      </form>

      <div className="my-6 flex items-center gap-3 text-xs text-muted">
        <span className="h-px flex-1 bg-border" /> or <span className="h-px flex-1 bg-border" />
      </div>

      <form action={action} className="space-y-4">
        <input type="hidden" name="next" value={next ?? ""} />
        {isSignup && (
          <>
            <TimezoneInput />
            <fieldset>
              <legend className="label">I want to</legend>
              <div className="grid grid-cols-2 gap-2">
                {(["student", "tutor"] as const).map((role) => (
                  <label key={role} className="choice">
                    <input type="radio" name="role" value={role} defaultChecked={role === defaultRole} />
                    {role === "student" ? "Learn a language" : "Teach a language"}
                  </label>
                ))}
              </div>
            </fieldset>
            <label className="block">
              <span className="label">Full name</span>
              <input name="full_name" required autoComplete="name" className="input" />
            </label>
          </>
        )}
        <label className="block">
          <span className="label">Email</span>
          <input name="email" type="email" required autoComplete="email" className="input" />
        </label>
        <label className="block">
          <span className="label">Password</span>
          <input
            name="password"
            type="password"
            required
            minLength={8}
            autoComplete={isSignup ? "new-password" : "current-password"}
            className="input"
          />
        </label>

        {state.error && (
          <p role="alert" className="text-sm text-danger">
            {state.error}
          </p>
        )}
        {state.message && (
          <p role="status" className="text-sm text-success">
            {state.message}
          </p>
        )}

        <SubmitButton className="w-full">{isSignup ? "Sign up" : "Log in"}</SubmitButton>
      </form>

      <p className="mt-6 text-sm text-muted">
        {isSignup ? (
          <>
            Already have an account?{" "}
            <Link href="/login" className="link">
              Log in
            </Link>
          </>
        ) : (
          <>
            New to Tuitor?{" "}
            <Link href="/signup" className="link">
              Create an account
            </Link>
          </>
        )}
      </p>
    </div>
  );
}
