const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);

const PASTA_TEMPLATES = path.join(__dirname, '..', 'data', 'zpl-templates');
const NOME_IMPRESSORA = 'ZDesigner ZT230-200dpi ZPL';
const VELOCIDADE_ZPL = '^PR3,3';
const OBSCURIDADE_ZPL = '~SD23';

function caminhoTemplate(codigoProduto) {
  return path.join(PASTA_TEMPLATES, `${codigoProduto}.prn`);
}

function existeTemplate(codigoProduto) {
  return fs.existsSync(caminhoTemplate(codigoProduto));
}

function formatarDataCurta(dataISO) {
  const [ano, mes, dia] = dataISO.split('-');
  return `${dia}/${mes}/${ano.slice(2)}`;
}

function montarZpl(codigoProduto, { dataFabricacao, dataValidade, quantidade }) {
  const template = fs.readFileSync(caminhoTemplate(codigoProduto), 'utf8');

  const fabCurta = formatarDataCurta(dataFabricacao);
  const valCurta = formatarDataCurta(dataValidade);

  let zpl = template.replace(
    /(\^FDFAB\.\/LOTE:\s*)\d{2}\/\d{2}\/\d{2}(\s*VAL:\s*)\d{2}\/\d{2}\/\d{2}/,
    `$1${fabCurta}$2${valCurta}`
  );

  zpl = zpl.replace(/\^PR[\d.]+(,[\d.]+)*/, VELOCIDADE_ZPL);
  zpl = zpl.replace(/~SD\d+/, OBSCURIDADE_ZPL);

  if (quantidade) {
    zpl = zpl.replace(/\^PQ\d+(,[\w.]*)*/, (match) => match.replace(/^\^PQ\d+/, `^PQ${quantidade}`));
  }

  return zpl;
}

async function listarJobsDaImpressora() {
  try {
    const { stdout } = await execFileAsync('powershell.exe', [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      `Get-PrintJob -PrinterName '${NOME_IMPRESSORA}' | Select-Object Id, JobStatus | ConvertTo-Json -Compress`,
    ]);
    const saida = stdout.trim();
    if (!saida) return [];
    const parsed = JSON.parse(saida);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    // Sem trabalhos na fila o cmdlet não retorna nada e pode "falhar" — trata como fila vazia.
    return [];
  }
}

function esperar(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// IMPORTANTE (limitação conhecida): aceitar o arquivo na fila de impressão do Windows não
// garante que a etiqueta saiu de verdade no papel. Erros de configuração (nome/permissão
// errados) aparecem na hora, e esses a gente pega no próprio envio (abaixo). Já "impressora
// desligada/desconectada/sem etiqueta" só aparece como erro na fila do Windows depois de
// 20 a 90 segundos — tempo inviável pra deixar a tela esperando. Por isso só fazemos uma
// checagem curta (pega falhas rápidas) e não bloqueamos o lançamento no estoque à espera
// de uma falha lenta; se a etiqueta não sair, dá pra desfazer depois em Histórico → Excluir.
async function confirmarImpressao(idsAntes, tentativas = 3, intervaloMs = 500) {
  for (let i = 0; i < tentativas; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await esperar(intervaloMs);
    // eslint-disable-next-line no-await-in-loop
    const jobsAtuais = await listarJobsDaImpressora();
    const novos = jobsAtuais.filter((j) => !idsAntes.includes(j.Id));
    const comErro = novos.find((j) => String(j.JobStatus).includes('Error'));
    if (comErro) {
      return {
        ok: false,
        motivo: `A etiqueta travou na fila de impressão (status: ${comErro.JobStatus}). Verifique se a Zebra está ligada, conectada e com etiqueta/ribbon.`,
      };
    }
  }
  return { ok: true };
}

async function enviarZplParaImpressora(zpl) {
  const arquivoTemp = path.join(os.tmpdir(), `etiqueta-${Date.now()}-${Math.random().toString(36).slice(2)}.prn`);
  fs.writeFileSync(arquivoTemp, zpl, 'utf8');

  const idsAntes = (await listarJobsDaImpressora()).map((j) => j.Id);
  const destino = `\\\\localhost\\${NOME_IMPRESSORA}`;

  try {
    await execFileAsync('cmd.exe', ['/c', 'copy', '/b', arquivoTemp, destino]);
  } catch (err) {
    throw new Error(`Não consegui enviar o arquivo para a fila de impressão: ${err.stderr || err.message}`);
  } finally {
    fs.unlink(arquivoTemp, () => {});
  }

  const resultado = await confirmarImpressao(idsAntes);
  if (!resultado.ok) throw new Error(resultado.motivo);
}

async function imprimirEtiquetaZebra(codigoProduto, quantidade, { dataFabricacao, dataValidade }) {
  if (!existeTemplate(codigoProduto)) return { impresso: false, motivo: 'sem-template' };

  const zpl = montarZpl(codigoProduto, { dataFabricacao, dataValidade, quantidade });
  await enviarZplParaImpressora(zpl);
  return { impresso: true };
}

module.exports = {
  existeTemplate,
  montarZpl,
  enviarZplParaImpressora,
  imprimirEtiquetaZebra,
  formatarDataCurta,
};
