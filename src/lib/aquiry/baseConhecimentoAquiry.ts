// Carregador simples (por palavras-chave) da base documental do Assistente
// Aquiry. Lê arquivos markdown versionados em src/data/aquiry/base-conhecimento.
// Sem RAG, sem embeddings — apenas regex sobre o texto da pergunta para
// selecionar até 3 documentos relevantes e cachear em memória.

import fs from "node:fs";
import path from "node:path";

export type TrechoBaseConhecimentoAquiry = {
  titulo: string;
  area: string;
  conteudo: string;
  caminho: string;
};

export type RespostaBaseConhecimentoAquiry = {
  encontrou: boolean;
  trechos: TrechoBaseConhecimentoAquiry[];
};

const MAX_TRECHOS = 3;
const MAX_CONTEUDO_CHARS = 1500;
const RAIZ_BASE = path.join(
  process.cwd(),
  "src",
  "data",
  "aquiry",
  "base-conhecimento",
);

// Regras de descoberta: regex sobre a pergunta normalizada → caminhos relativos
// à raiz da base. Ordem importa — primeiras regras têm prioridade quando há
// múltiplos casamentos até o limite de MAX_TRECHOS.
const REGRAS_DESCOBERTA: Array<{ regex: RegExp; docs: string[] }> = [
  {
    regex: /educa[cç][aã]o|\bsiope\b|\bfnde\b|\bfundeb\b|\bmde\b|\bensino\b|\binep\b/,
    docs: ["fontes/siope-fnde.md"],
  },
  {
    regex: /\bsaude\b|\bdatasus\b|\bsiops\b|\bsim\b|\bsinasc\b|\bsus\b|imuniza|cnes/,
    docs: ["fontes/datasus-siops-saude.md"],
  },
  {
    regex:
      /\bsiconfi\b|\brreo\b|\brgf\b|\btesouro\b|fiscal|lrf|responsabilidade\s+fiscal/,
    docs: [
      "fontes/siconfi-tesouro.md",
      "normas/lei-responsabilidade-fiscal.md",
    ],
  },
  {
    regex:
      /\bcontratos?\b|licita[cç]|fornecedor|14\.?133|\bcompras\.?\s*gov\b|transparencia|pncp/,
    docs: [
      "normas/lei-14133-licitacoes-contratos.md",
      "fontes/compras-transparencia.md",
    ],
  },
  {
    regex:
      /\brisco\b|materialidade|onde\s+(devo\s+)?olhar|priorizar|prioridade|\burgente\b|relevancia/,
    docs: ["projeto/criterios-risco-materialidade.md"],
  },
  {
    regex:
      /constitucao|constitucional|controle\s+externo|jurisdicionad|glossario|empenho|liquida|tribunais?\s+de\s+contas/,
    docs: [
      "normas/constituicao-controle-externo.md",
      "projeto/glossario-controle-externo.md",
    ],
  },
  {
    regex: /aquiry|assistente|diretriz/,
    docs: ["projeto/diretrizes-assistente-aquiry.md"],
  },
];

function normalizar(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

// Extrai frontmatter YAML simples (apenas linhas chave: valor) e devolve título,
// área e corpo do documento.
function parseFrontmatter(raw: string): {
  titulo: string;
  area: string;
  corpo: string;
} {
  const match = /^---\s*\r?\n([\s\S]*?)\r?\n---\s*\r?\n([\s\S]*)$/.exec(raw);
  if (!match) return { titulo: "", area: "", corpo: raw };
  const fm = match[1];
  const corpo = match[2].trim();
  const tit = /^\s*titulo:\s*(.+?)\s*$/im.exec(fm);
  const area = /^\s*area:\s*(.+?)\s*$/im.exec(fm);
  return {
    titulo: tit?.[1]?.trim() ?? "",
    area: area?.[1]?.trim() ?? "",
    corpo,
  };
}

// Cache em memória — invalidado apenas em restart do processo.
type DocCache = {
  caminho: string;
  titulo: string;
  area: string;
  conteudo: string;
};
const cache = new Map<string, DocCache>();

function obterDoc(caminhoRelativo: string): DocCache | null {
  const cached = cache.get(caminhoRelativo);
  if (cached) return cached;
  try {
    const abs = path.join(RAIZ_BASE, caminhoRelativo);
    const raw = fs.readFileSync(abs, "utf-8");
    const { titulo, area, corpo } = parseFrontmatter(raw);
    const doc: DocCache = {
      caminho: caminhoRelativo,
      titulo: titulo || caminhoRelativo,
      area: area || "",
      conteudo: corpo.slice(0, MAX_CONTEUDO_CHARS),
    };
    cache.set(caminhoRelativo, doc);
    return doc;
  } catch (err) {
    console.warn(
      `[aquiry/baseConhecimento] não foi possível ler ${caminhoRelativo}: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
    return null;
  }
}

export function buscarBaseConhecimentoAquiry(
  pergunta: string,
): RespostaBaseConhecimentoAquiry {
  const p = normalizar(pergunta ?? "");
  if (!p) return { encontrou: false, trechos: [] };

  const selecionados: string[] = [];
  for (const { regex, docs } of REGRAS_DESCOBERTA) {
    if (!regex.test(p)) continue;
    for (const d of docs) {
      if (!selecionados.includes(d)) selecionados.push(d);
      if (selecionados.length >= MAX_TRECHOS) break;
    }
    if (selecionados.length >= MAX_TRECHOS) break;
  }

  if (selecionados.length === 0) return { encontrou: false, trechos: [] };

  const trechos: TrechoBaseConhecimentoAquiry[] = [];
  for (const caminho of selecionados) {
    const doc = obterDoc(caminho);
    if (doc) {
      trechos.push({
        titulo: doc.titulo,
        area: doc.area,
        conteudo: doc.conteudo,
        caminho,
      });
    }
  }

  return { encontrou: trechos.length > 0, trechos };
}
