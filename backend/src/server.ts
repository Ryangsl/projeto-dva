import { app } from './app.js';
import { env } from './config/env.js';
import { testConnection } from './config/database.js';
import { iniciarRetentionJob } from './jobs/retention.js';

async function bootstrap(): Promise<void> {
  try {
    await testConnection();
    console.log('✔ Conexão com MySQL estabelecida.');
  } catch (err) {
    console.error('✖ Não foi possível conectar ao MySQL. Verifique o .env e o banco.', err);
    process.exit(1);
  }

  // Limpeza automática dos dados de monitoramento (retenção de 60 dias).
  iniciarRetentionJob();

  app.listen(env.port, () => {
    console.log(`✔ API PROCAR rodando em http://localhost:${env.port}/api`);
  });
}

bootstrap();
