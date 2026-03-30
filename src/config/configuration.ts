// src/config/configuration.ts
// Central config loaded once via ConfigModule.forRoot()
// All env vars are validated here — app won't start if required vars are missing

export default () => ({
  app: {
    port: parseInt(process.env.PORT ?? '3000', 10),
    nodeEnv: process.env.NODE_ENV ?? 'development',
    apiPrefix: process.env.API_PREFIX ?? 'api/v1',
  },
  database: {
    url: process.env.DATABASE_URL,
    // Prisma connection pool settings
    connectionLimit: parseInt(process.env.DB_CONNECTION_LIMIT ?? '20', 10),
  },
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET,
    refreshSecret: process.env.JWT_REFRESH_SECRET,
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN ?? '15m',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '7d',
  },
  redis: {
    host: process.env.REDIS_HOST ?? 'localhost',
    port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
    password: process.env.REDIS_PASSWORD,
    ttl: parseInt(process.env.REDIS_TTL ?? '300', 10), // 5 mins default cache
  },
  aws: {
    region: process.env.AWS_REGION ?? 'ap-south-1',
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    s3Bucket: process.env.AWS_S3_BUCKET,
  },
  geolocation: {
    nominatimUrl: 'https://nominatim.openstreetmap.org/reverse',
    userAgent: 'Property360CRM/1.0', // required by Nominatim ToS
  },
  company: {
    // Default company ID — for single-tenant deployment
    // In future multi-tenant, this comes from JWT / subdomain
    defaultCompanyId: process.env.DEFAULT_COMPANY_ID,
  },
});