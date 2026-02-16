interface PageHeaderProps {
  title: string;
  description?: string;
}

export function PageHeader({ title, description }: PageHeaderProps) {
  return (
    <div className="bg-primary">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="font-heading text-2xl sm:text-3xl font-bold text-white tracking-tight">{title}</h1>
        {description && (
          <p className="mt-1.5 text-sm text-white/50 max-w-2xl">{description}</p>
        )}
      </div>
    </div>
  );
}
