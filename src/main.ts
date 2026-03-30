// ============================================================
// src/main.ts
// ============================================================
import { NestFactory, Reflector } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import compression from 'compression';
import { AppModule } from './app.module';
import { PrismaService } from './prisma/prisma.service';
 
async function bootstrap() {
  const logger = new Logger('Bootstrap');
 
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log', 'debug'],
    bufferLogs: true,
  });
 
  const config = app.get(ConfigService);
  const port = config.get<number>('app.port') ?? 3000;
  const prefix = config.get<string>('app.apiPrefix') ?? 'api/v1';
 
  // ── Security ─────────────────────────────────────────────
  app.use(helmet({
    crossOriginEmbedderPolicy: false,
    contentSecurityPolicy: false,
  }));
 
  // ── Compression ──────────────────────────────────────────
  app.use(compression());
 
  // ── CORS ─────────────────────────────────────────────────
  const nodeEnv = config.get<string>('app.nodeEnv') ?? 'development';
  const rawOrigins = String(process.env.CORS_ORIGINS ?? process.env.FRONTEND_URL ?? '').trim();
  const allowList = rawOrigins
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  if (nodeEnv !== 'production') {
    app.enableCors({
      origin: true,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    });
  } else {
    const defaultAllow = ['https://property360.com', ...allowList];
    app.enableCors({
      origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        if (defaultAllow.includes(origin)) return callback(null, true);
        return callback(new Error(`CORS blocked for origin: ${origin}`), false);
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    });
  }
 
  // ── Global Prefix ────────────────────────────────────────
  app.setGlobalPrefix(prefix);
 
  // ── Validation ───────────────────────────────────────────
  // Using class-validator with whitelist to strip unknown properties
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,          // strip unknown properties
      forbidNonWhitelisted: false, // don't throw on unknown (just strip)
      transform: true,          // auto-transform query params to correct types
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );
 
  // ── Prisma shutdown hooks ────────────────────────────────
  const prismaService = app.get(PrismaService);
  await prismaService.enableShutdownHooks(app);
 
  // ── Swagger (dev only) ───────────────────────────────────
  if (config.get('app.nodeEnv') !== 'production') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Property 360 CRM API')
      .setDescription('Backend API for Property 360 degree CRM')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
 
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup(`${prefix}/docs`, app, document, {
      swaggerOptions: {
        persistAuthorization: true,
        defaultModelsExpandDepth: -1,
      },
    });
 
    logger.log(`📚 Swagger docs: http://localhost:${port}/${prefix}/docs`);
  }
 
  await app.listen(port);
  logger.log(`🚀 Property 360 API running on port ${port}`);
  logger.log(`   Prefix: /${prefix}`);
  logger.log(`   Env: ${config.get('app.nodeEnv')}`);
}
 
bootstrap().catch((err) => {
  console.error('Failed to start:', err);
  process.exit(1);
});
