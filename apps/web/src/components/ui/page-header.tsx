interface PageHeaderProps {
  title: string;
  description?: string;
}

export function PageHeader({ title, description }: PageHeaderProps) {
  return (
    <div className="bg-white border-b border-[#ccc]">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-5">
        <h1 className="text-xl font-bold text-[#111] tracking-tight">{title}</h1>
        {description && (
          <p className="mt-1 text-sm text-[#666] max-w-2xl">{description}</p>
        )}
      </div>
    </div>
  );
}
