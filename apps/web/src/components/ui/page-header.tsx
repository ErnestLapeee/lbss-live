interface PageHeaderProps {
  title: string;
  description?: string;
}

export function PageHeader({ title, description }: PageHeaderProps) {
  return (
    <div className="bg-[#3a3a3a] border-b border-black/30">
      <div className="mx-auto max-w-none px-4 sm:px-6 lg:px-10 py-5">
        <h1 className="text-xl font-bold text-white tracking-tight">{title}</h1>
        {/* Hide small helper text site-wide (keeps pages cleaner and avoids English hint text). */}
        {false && description && (
          <p className="mt-1 text-sm text-white/70 max-w-2xl">{description}</p>
        )}
      </div>
    </div>
  );
}
