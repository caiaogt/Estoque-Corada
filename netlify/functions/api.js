const serverless = require('serverless-http');
const app = require('../../app');
const { prontidao } = require('../../db');

const handlerExpress = serverless(app);

// O netlify.toml redireciona /api/* pra /.netlify/functions/api/:splat, mas as rotas
// do Express foram escritas esperando o caminho original (/api/produtos, etc). Aqui a
// gente devolve o prefixo /api antes de passar a requisição pro Express.
module.exports.handler = async (event, context) => {
  await prontidao;
  event.path = event.path.replace('/.netlify/functions/api', '/api');
  return handlerExpress(event, context);
};
