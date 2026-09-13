// As rotas agora são assíncronas (Postgres). O Express 4 não captura sozinho um erro
// que "estoura" dentro de uma função async — sem isso, um erro de banco derrubava o
// processo inteiro (unhandledRejection) em vez de só devolver um 500 pra aquela requisição.
module.exports = function wrap(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};
