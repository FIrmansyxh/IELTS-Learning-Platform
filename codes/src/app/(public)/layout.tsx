export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <main id="main" tabIndex={-1} className="mx-auto flex min-h-dvh w-full max-w-md items-center px-4 py-8 outline-none">
      <div className="w-full">{children}</div>
    </main>
  );
}
