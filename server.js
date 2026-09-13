const app = require('./app');
const { prontidao } = require('./db');

const PORT = process.env.PORT || 3000;

prontidao
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Servidor rodando em http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Não foi possível iniciar o servidor (banco de dados):', err);
    process.exit(1);
  });
