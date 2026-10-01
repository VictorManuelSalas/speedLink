import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { MONGO_MODELS } from './schemas';

/** Conexión a Mongo y modelos de bitácoras, disponibles en toda la API. */
@Global()
@Module({
  imports: [
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        uri: config.getOrThrow<string>('MONGO_URL'),
        // Los índices se crean al arrancar en desarrollo; en producción, con un script de despliegue.
        autoIndex: config.get('NODE_ENV') !== 'production',
      }),
    }),
    MongooseModule.forFeature(MONGO_MODELS),
  ],
  exports: [MongooseModule],
})
export class MongoModule {}
