import type { FastifyInstance } from 'fastify';
import { db } from '../../db/index.js';
import { articles } from '../../db/schema/index.js';
import { eq, desc } from 'drizzle-orm';
import { slugify } from '../../utils/slugify.js';

export async function adminArticlesRoutes(app: FastifyInstance) {
  // GET / - list all articles (including unpublished)
  app.get('/', async (request, reply) => {
    try {
      const result = await db
        .select()
        .from(articles)
        .orderBy(desc(articles.createdAt));
      return reply.send(result);
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ message: 'Failed to fetch articles' });
    }
  });

  // POST / - create article
  app.post<{
    Body: {
      title: string;
      content: string;
      excerpt?: string;
      coverImageUrl?: string;
    };
  }>('/', async (request, reply) => {
    try {
      const { title, content, excerpt, coverImageUrl } = request.body ?? {};

      if (!title || !content) {
        return reply.status(400).send({ message: 'title and content required' });
      }

      const slug = slugify(title);

      const [article] = await db
        .insert(articles)
        .values({
          title,
          content,
          excerpt: excerpt ?? null,
          coverImageUrl: coverImageUrl ?? null,
          slug,
        })
        .returning();

      return reply.status(201).send(article);
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ message: 'Failed to create article' });
    }
  });

  // PUT /:id - update article
  app.put<{
    Params: { id: string };
    Body: {
      title?: string;
      content?: string;
      excerpt?: string;
      coverImageUrl?: string;
    };
  }>('/:id', async (request, reply) => {
    try {
      const id = parseInt(request.params.id, 10);
      if (isNaN(id)) {
        return reply.status(400).send({ message: 'Invalid article id' });
      }

      const body = request.body ?? {};
      const updateData: Record<string, unknown> = {
        updatedAt: new Date(),
      };
      if (body.title !== undefined) updateData.title = body.title;
      if (body.content !== undefined) updateData.content = body.content;
      if (body.excerpt !== undefined) updateData.excerpt = body.excerpt;
      if (body.coverImageUrl !== undefined)
        updateData.coverImageUrl = body.coverImageUrl;
      if (body.title !== undefined) updateData.slug = slugify(body.title);

      const [article] = await db
        .update(articles)
        .set(updateData)
        .where(eq(articles.id, id))
        .returning();

      if (!article) {
        return reply.status(404).send({ message: 'Article not found' });
      }

      return reply.send(article);
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ message: 'Failed to update article' });
    }
  });

  // DELETE /:id - delete article
  app.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    try {
      const id = parseInt(request.params.id, 10);
      if (isNaN(id)) {
        return reply.status(400).send({ message: 'Invalid article id' });
      }

      const deleted = await db
        .delete(articles)
        .where(eq(articles.id, id))
        .returning({ id: articles.id });

      if (deleted.length === 0) {
        return reply.status(404).send({ message: 'Article not found' });
      }

      return reply.send({ message: 'Article deleted' });
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ message: 'Failed to delete article' });
    }
  });

  // POST /:id/publish - set isPublished=true, publishedAt=now
  app.post<{ Params: { id: string } }>('/:id/publish', async (request, reply) => {
    try {
      const id = parseInt(request.params.id, 10);
      if (isNaN(id)) {
        return reply.status(400).send({ message: 'Invalid article id' });
      }

      const [article] = await db
        .update(articles)
        .set({
          isPublished: true,
          publishedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(articles.id, id))
        .returning();

      if (!article) {
        return reply.status(404).send({ message: 'Article not found' });
      }

      return reply.send(article);
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ message: 'Failed to publish article' });
    }
  });
}
