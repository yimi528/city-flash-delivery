import { ValidationPipe } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { NestFactory } from '@nestjs/core'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import helmet from 'helmet'
import { AppModule } from './app.module'
import { validateProductionConfig } from './config/production-config'

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true })
  app.use(helmet({ contentSecurityPolicy: false }))
  const config = app.get(ConfigService)
  validateProductionConfig(config)
  const apiPrefix = config.get<string>('API_PREFIX') || 'api'
  const nodeEnv = config.get<string>('NODE_ENV') || 'development'
  const corsOrigins = (config.get<string>('CORS_ORIGINS') || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)

  if (nodeEnv === 'production' && corsOrigins.length === 0) {
    throw new Error('CORS_ORIGINS must be configured in production')
  }
  app.enableCors({
    origin: nodeEnv === 'production' ? corsOrigins : true,
    credentials: true,
  })
  app.setGlobalPrefix(apiPrefix)
  app.enableShutdownHooks()
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  )

  const enableSwagger = config.get<string>('ENABLE_SWAGGER') === 'true' || nodeEnv !== 'production'
  if (enableSwagger) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('City Flash Delivery API')
      .setDescription('Operations-first API for the city flash delivery MVP.')
      .setVersion('0.1.0')
      .addBearerAuth()
      .build()
    const document = SwaggerModule.createDocument(app, swaggerConfig)
    SwaggerModule.setup(`${apiPrefix}/docs`, app, document)
  }

  const port = Number(config.get<string>('PORT') || 3000)
  await app.listen(port, '0.0.0.0')
  // eslint-disable-next-line no-console
  console.log(`City Flash Nest API listening on 0.0.0.0:${port}/${apiPrefix}`)
}

void bootstrap()
