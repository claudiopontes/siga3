import type { FonteInstitucional } from "../tipos";
import { fontesInstitucionais } from "./fontesInstitucionais";

// Fontes mínimas retornadas quando nenhuma correspondência é encontrada.
const IDS_FONTES_GERAIS = ["cf88-art37", "lce38-tceac", "ritceac"];

export function buscarFontesRelevantes(texto: string, limite = 5): FonteInstitucional[] {
  const textoNormalizado = texto.toLowerCase();

  const pontuadas = fontesInstitucionais
    .map((fonte) => {
      const pontuacao = fonte.temas.filter((tema) =>
        textoNormalizado.includes(tema.toLowerCase())
      ).length;
      return { fonte, pontuacao };
    })
    .filter(({ pontuacao }) => pontuacao > 0)
    .sort((a, b) => b.pontuacao - a.pontuacao)
    .slice(0, limite)
    .map(({ fonte }) => fonte);

  if (pontuadas.length === 0) {
    return fontesInstitucionais.filter((f) => IDS_FONTES_GERAIS.includes(f.id));
  }

  return pontuadas;
}
