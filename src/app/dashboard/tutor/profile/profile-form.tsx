"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/submit-button";
import type { Database } from "@/lib/database.types";
import { LANGUAGES, PROFICIENCIES } from "@/lib/languages";
import { saveTutorProfile, type FormState } from "../actions";

type Tutor = Database["public"]["Tables"]["tutor_profiles"]["Row"];

export function ProfileForm({
  tutor,
  teaching,
}: {
  tutor: Tutor | null;
  teaching: { language: string; proficiency: string } | null;
}) {
  const [state, action] = useActionState<FormState, FormData>(saveTutorProfile, {});

  return (
    <form action={action} className="mt-8 space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="label">Language you teach</span>
          <select name="language" defaultValue={teaching?.language ?? "English"} className="input">
            {LANGUAGES.map((l) => (
              <option key={l}>{l}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="label">Your level</span>
          <select name="proficiency" defaultValue={teaching?.proficiency ?? "native"} className="input">
            {PROFICIENCIES.map((p) => (
              <option key={p} value={p}>
                {p === "native" ? "Native speaker" : p}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="block">
        <span className="label">Headline</span>
        <input
          name="headline"
          required
          maxLength={120}
          defaultValue={tutor?.headline}
          placeholder="e.g. IELTS & exam English with a certified teacher"
          className="input"
        />
      </label>

      <label className="block">
        <span className="label">About you</span>
        <textarea name="bio" required rows={6} maxLength={3000} defaultValue={tutor?.bio} className="input" />
      </label>

      <div className="grid gap-4 sm:grid-cols-3">
        <label className="block">
          <span className="label">Country code</span>
          <input name="country" required maxLength={2} defaultValue={tutor?.country ?? ""} placeholder="GB" className="input uppercase" />
        </label>
        <label className="block">
          <span className="label">Hourly rate (USD)</span>
          <input
            name="hourly_rate_cents"
            type="number"
            min={1}
            max={1000}
            step="0.5"
            required
            defaultValue={tutor ? tutor.hourly_rate_cents / 100 : 20}
            className="input"
          />
        </label>
        <label className="block">
          <span className="label">Trial lesson (USD)</span>
          <input
            name="trial_rate_cents"
            type="number"
            min={0}
            max={1000}
            step="0.5"
            required
            defaultValue={tutor ? tutor.trial_rate_cents / 100 : 5}
            className="input"
          />
        </label>
      </div>

      <label className="block">
        <span className="label">Intro video link (optional)</span>
        <input name="video_url" type="url" defaultValue={tutor?.video_url ?? ""} placeholder="https://youtube.com/…" className="input" />
      </label>

      <p className="text-sm text-muted">
        Tuitor keeps the trial lesson fee and a 20% commission on regular lessons.
      </p>

      {state.error && (
        <p role="alert" className="text-sm text-danger">
          {state.error}
        </p>
      )}
      {state.saved && (
        <p role="status" className="text-sm text-success">
          Saved.
        </p>
      )}
      <SubmitButton>{tutor ? "Save changes" : "Create profile"}</SubmitButton>
    </form>
  );
}
