import Fastify, { type FastifyInstance } from 'fastify';
import pino from 'pino';

const logger = pino({
  transport: process.env.NODE_ENV === 'production' ? undefined : { target: 'pino-pretty' },
  level: process.env.LOG_LEVEL ?? 'info',
});

export interface ServerOpts {
  host?: string;
  port?: number;
}

export async function startServer(opts: ServerOpts = {}): Promise<FastifyInstance> {
  const app = Fastify({ loggerInstance: logger });
  app.get('/health', async () => ({ ok: true }));
  const host = opts.host ?? process.env.HOST ?? '0.0.0.0';
  const port = opts.port ?? Number(process.env.PORT ?? 4000);
  if (port > 0) await app.listen({ host, port });
  return app;
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  startServer().catch((err) => {
    logger.error(err);
    process.exit(1);
  });
}
