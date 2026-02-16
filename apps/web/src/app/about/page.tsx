import type { Metadata } from 'next';
import { PageHeader } from '@/components/ui/page-header';

export const metadata: Metadata = { title: 'About LBSS' };

export default function AboutPage() {
  return (
    <div>
      <PageHeader title="About LBSS" description="The governing body for baseball and softball in Latvia" />
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        <div className="max-w-3xl space-y-8">
          <section>
            <p className="text-base leading-relaxed text-text-muted">
              Latvijas Beisbola Softbola Savieniba (LBSS) is the official governing body for baseball and softball in Latvia.
              We organize and oversee the Latvijas Beisbola Liga, manage national team programs, and work to grow the sport across the country.
            </p>
          </section>

          <section>
            <h2 className="font-heading text-lg font-bold mb-3">Our Mission</h2>
            <p className="text-base leading-relaxed text-text-muted">
              LBSS promotes and develops baseball and softball across Latvia, organizing leagues, tournaments,
              and national team competitions. We are committed to providing a professional platform for athletes
              and fans to engage with the sport at the highest level.
            </p>
          </section>

          <section>
            <h2 className="font-heading text-lg font-bold mb-3">History</h2>
            <p className="text-base leading-relaxed text-text-muted">
              The federation was established to unify and grow the sport of baseball in Latvia.
              Over the years, LBSS has developed a competitive league structure, youth development programs,
              and international representation.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
