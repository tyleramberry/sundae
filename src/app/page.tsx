export default function Home() {
  return (
    <div className="flex flex-col flex-1 items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex flex-1 w-full max-w-3xl flex-col items-center justify-center gap-8 px-6 py-32 text-center sm:px-16">
        <span className="text-sm font-medium uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
          Sundae
        </span>
        <h1 className="max-w-xl text-4xl font-semibold leading-tight tracking-tight text-black dark:text-zinc-50 sm:text-5xl">
          Set the vision. Sundae handles the busywork.
        </h1>
        <p className="max-w-lg text-lg leading-8 text-zinc-600 dark:text-zinc-400">
          Sundae is an AI-guided weekly planning app. You define your roles
          and priorities — Sundae runs a short guided session each week,
          surfaces what matters most, and proposes calendar blocks on your
          Google Calendar. Nothing gets scheduled until you confirm it.
        </p>
        <div className="flex flex-col gap-3 text-sm text-zinc-500 dark:text-zinc-400 sm:flex-row sm:gap-6">
          <a href="/privacy" className="underline hover:text-zinc-950 dark:hover:text-zinc-50">
            Privacy Policy
          </a>
          <a href="/terms" className="underline hover:text-zinc-950 dark:hover:text-zinc-50">
            Terms of Service
          </a>
        </div>
      </main>
    </div>
  );
}
