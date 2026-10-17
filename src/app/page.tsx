import Link from "next/link";

const LANGUAGES = ["English", "Spanish", "French", "German", "Italian", "Japanese", "Chinese (Mandarin)", "Portuguese", "Hindi"];

const STEPS = [
  { title: "Find your tutor", body: "Filter by language, price and availability. Watch intros and read real reviews." },
  { title: "Book a trial lesson", body: "Meet your tutor in our video classroom, at a time that suits you." },
  { title: "Practise with your AI coach", body: "After every lesson, get a summary, corrections and homework, then keep practising between lessons." },
];

export default function Home() {
  return (
    <div className="mx-auto max-w-6xl px-4">
      <section className="py-16 sm:py-24">
        <h1 className="max-w-3xl text-4xl font-bold tracking-tight sm:text-6xl">
          Learn faster with a great tutor <span className="text-brand">and an AI coach</span> that remembers every lesson.
        </h1>
        <p className="mt-6 max-w-2xl text-lg text-muted">
          1-on-1 video lessons with expert language tutors, plus personalised practice between lessons.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/tutors" className="btn-primary px-6 py-3 text-base">
            Find a tutor
          </Link>
          <Link href="/signup?role=tutor" className="btn-secondary px-6 py-3 text-base">
            Teach on Tuitor
          </Link>
        </div>
      </section>

      <section aria-labelledby="languages" className="pb-16">
        <h2 id="languages" className="text-lg font-semibold">
          What do you want to learn?
        </h2>
        <ul className="mt-4 flex flex-wrap gap-2">
          {LANGUAGES.map((lang) => (
            <li key={lang}>
              <Link href={`/tutors?language=${encodeURIComponent(lang)}`} className="btn-secondary rounded-full">
                {lang}
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="how" className="border-t border-border py-16">
        <h2 id="how" className="text-2xl font-semibold">
          How it works
        </h2>
        <ol className="mt-8 grid gap-6 sm:grid-cols-3">
          {STEPS.map((step, i) => (
            <li key={step.title} className="card">
              <span className="text-sm font-semibold text-brand">Step {i + 1}</span>
              <h3 className="mt-2 font-semibold">{step.title}</h3>
              <p className="mt-2 text-sm text-muted">{step.body}</p>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
