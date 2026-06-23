export default function Placeholder({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="mx-auto max-w-5xl px-8 py-8">
      <header className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight text-neutral-900">
          {title}
        </h1>
        <p className="mt-1 text-sm text-neutral-500">{description}</p>
      </header>
      <div className="rounded-xl border border-dashed border-neutral-300 bg-white px-8 py-16 text-center text-sm text-neutral-500">
        Раздел в разработке.
      </div>
    </div>
  );
}
