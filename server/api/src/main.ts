import { ValidationPipe } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { NestFactory } from '@nestjs/core'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import { AppModule } from './app.module'

async function bootstrap() {
  const app = await NestFactory.create(AppModule)
  const config = app.get(ConfigService)
  const apiPrefix = config.get<string>('API_PREFIX') || 'api'

  app.enableCors()
  app.setGlobalPrefix(apiPrefix)
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  )

  const swaggerConfig = new DocumentBuilder()
    .setTitle('City Flash Delivery API')
    .setDescription('Operations-first API for the city flash delivery MVP.')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build()
  const document = SwaggerModule.createDocument(app, swaggerConfig)
  SwaggerModule.setup(`${apiPrefix}/docs`, app, document)

  const port = Number(config.get<string>('PORT') || 3000)
  await app.listen(port)
  // eslint-disable-next-line no-console
  console.log(`City Flash Nest API listening on http://127.0.0.1:${port}/${apiPrefix}`)
}

void bootstrap()
