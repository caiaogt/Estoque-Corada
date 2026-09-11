const gerarRelatorioBtn = document.getElementById('gerar-relatorio-btn');
const relatorioContainer = document.getElementById('relatorio-estoque');

function baixarImagem(canvas, nomeArquivo) {
  canvas.toBlob((blob) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = nomeArquivo;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  });
}

function montarRelatorio(estoque) {
  const dataFormatada = new Date().toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
  document.getElementById('relatorio-data').textContent = `Gerado em ${dataFormatada}`;

  const totalUnidades = estoque.reduce((sum, p) => sum + p.saldo, 0);
  const totalZerados = estoque.filter((p) => p.saldo <= 0).length;

  document.getElementById('relatorio-total-itens').textContent = estoque.length;
  document.getElementById('relatorio-total-unidades').textContent = totalUnidades;
  document.getElementById('relatorio-total-zerados').textContent = totalZerados;

  const ordenado = [...estoque].sort((a, b) => a.descricao.localeCompare(b.descricao, 'pt-BR'));

  const tbody = document.getElementById('relatorio-tbody');
  tbody.innerHTML = ordenado
    .map(
      (p) => `
        <tr class="${p.saldo <= 0 ? 'relatorio-zerado' : ''}">
          <td>${p.codigo}</td>
          <td>${p.descricao}</td>
          <td>${p.saldo}</td>
        </tr>
      `
    )
    .join('');
}

gerarRelatorioBtn.addEventListener('click', async () => {
  gerarRelatorioBtn.disabled = true;
  gerarRelatorioBtn.textContent = 'Gerando...';

  try {
    const estoque = await api('/estoque?ativo=1');
    montarRelatorio(estoque);

    // dá um instante pro navegador aplicar o layout antes de capturar
    await new Promise((r) => setTimeout(r, 50));

    const canvas = await html2canvas(relatorioContainer, {
      backgroundColor: '#ffffff',
      scale: 2,
    });

    const dataArquivo = new Date().toISOString().slice(0, 10);
    baixarImagem(canvas, `estoque-corada-${dataArquivo}.png`);
  } catch (err) {
    alert(`Erro ao gerar relatório: ${err.message}`);
  } finally {
    gerarRelatorioBtn.disabled = false;
    gerarRelatorioBtn.textContent = '📄 Gerar Relatório';
  }
});
