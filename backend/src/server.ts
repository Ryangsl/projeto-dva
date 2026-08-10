import { app } from './app.js';
import { env } from './config/env.js';
import { testConnection } from './config/database.js';

async function bootstrap(): Promise<void> {
  try {
    await testConnection();
    console.log('✔ Conexão com MySQL estabelecida.');
  } catch (err) {
    console.error('✖ Não foi possível conectar ao MySQL. Verifique o .env e o banco.', err);
    process.exit(1);
  }

  app.listen(env.port, () => {
    console.log(`✔ API DVA rodando em http://localhost:${env.port}/api`);
  });
}

bootstrap();
