export function LoginPage() {
  return (
    <main className="bg-paper grid min-h-screen place-items-center p-6" data-testid="login-page">
      <section className="border-line bg-surface w-full max-w-sm border p-8">
        <h1 className="text-ink text-xl font-semibold">AthleteCore</h1>
        <p className="text-ink-soft mt-2 text-sm">
          La pantalla de autenticación se implementa en el módulo de auth. Esta base ya redirige aquí cuando no hay sesión.
        </p>
      </section>
    </main>
  );
}
