import type { FastifyInstance } from 'fastify';
import { db } from '../../db/index.js';
import { articles } from '../../db/schema/index.js';
import { eq, desc } from 'drizzle-orm';

export async function articlesRoutes(app: FastifyInstance) {
  // GET / - list published articles, ordered by publishedAt desc
  app.get('/', async (request, reply) => {
    try {
      const result = await db
        .select()
        .from(articles)
        .where(eq(articles.isPublished, true))
        .orderBy(desc(articles.publishedAt));
      return reply.send(result);
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ message: 'Failed to fetch articles' });
    }
  });

  // GET /:slug - get single article by slug (only if published)
  app.get<{ Params: { slug: string } }>('/:slug', async (request, reply) => {
    try {
      const [article] = await db
        .select()
        .from(articles)
        .where(eq(articles.slug, request.params.slug))
        .limit(1);

      if (!article || !article.isPublished) {
        return reply.status(404).send({ message: 'Article not found' });
      }

      return reply.send(article);
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ message: 'Failed to fetch article' });
    }
  });
}
