import { Router } from 'express';
import * as repo from '../../mercado/mercado.repo.js';
import { emAlta, emQueda, maisValiosas } from '../../mercado/ranking.js';
import { obterTaxa } from '../../cambio/cambio.js';

/** A TCGdex serve a imagem em várias qualidades: a "low" em webp é a leve, boa para miniatura. */
const miniatura = (base) => (base ? `${base}/low.webp` : null);

const arredondar = (n) => Math.round(n * 10) / 10;

/**
 * Painel do mercado da página inicial: ABERTO (sem login), só leitura e sem dado de ninguém.
 * "Em alta", "em queda" e "mais valiosas" vêm da TCGdex (preços atualizados todo dia); "mais adicionadas" é dado
 * nosso, só agregado. Não existe "mais negociadas": nenhuma fonte gratuita traz volume de vendas, e o painel não
 * promete o que não sabe.
 */
export function rotasMercado() {
  const rotas = Router();

  rotas.get('/mercado/painel', async (req, res) => {
    const cambio = await obterTaxa().catch(() => null);
    const taxa = cambio?.usdBrl ?? null;
    const moeda = taxa ? 'BRL' : 'USD';
    const converter = (usd) => (usd === null || usd === undefined ? null : Math.round(usd * (taxa ?? 1) * 100) / 100);

    const linhas = repo.todas();
    const doMercado = ({ linha, variacao }) => ({
      id: linha.id,
      nome: linha.nome,
      colecao: linha.colecao,
      numero: linha.numero,
      raridade: linha.raridade,
      imagem: miniatura(linha.imagem),
      preco: converter(linha.preco_usd),
      variacaoPct: variacao === null ? null : arredondar(variacao * 100),
    });

    const adicionadas = repo.maisAdicionadas().map((c) => ({
      id: c.id, nome: c.nome, colecao: c.colecao, numero: c.numero, raridade: c.raridade,
      imagem: c.imagem, preco: converter(c.preco_usd), pessoas: c.pessoas,
    }));

    // Muda pouco ao longo do dia: o navegador e o servidor de borda podem guardar uns minutos.
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.json({
      moeda,
      atualizadoEm: repo.ultimaConsulta(),
      emAlta: emAlta(linhas).map(doMercado),
      emQueda: emQueda(linhas).map(doMercado),
      maisValiosas: maisValiosas(linhas).map(doMercado),
      maisAdicionadas: adicionadas,
    });
  });

  return rotas;
}
