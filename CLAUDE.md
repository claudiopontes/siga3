# Gabinete Digital — Contexto do Projeto

## Visão Geral

Sistema web chamado **Gabinete Digital**, desenvolvido para uso interno no gabinete dos conselheiros do **Tribunal de Contas do Estado do Acre (TCE-AC)**.

- **Repositório:** `https://github.com/claudiopontes/gabinete-digital`
- **Base:** TailAdmin (template Next.js + Tailwind CSS)
- **Stack:** Next.js 15, TypeScript, Tailwind CSS, React-Leaflet

---

## Estrutura do Módulo Gabinete Digital

```
src/
├── app/
│   └── (admin)/
│       └── gabinete-digital/
│           ├── mapa/
│           │   └── page.tsx              # Mapa IDEB por município
│           └── seletor-municipio/
│               └── page.tsx              # Seletor de município (sem métricas)
│
└── components/
    └── Maps/
        ├── MapaAcre.tsx                  # Wrapper com dynamic import (sem SSR)
        ├── MapaAcreContent.tsx           # Mapa interativo com IDEB por município
        ├── SeletorMunicipio.tsx          # Mapa para seleção de município (sem métricas)
        └── SeletorMunicipioWrapper.tsx   # Wrapper com dynamic import (sem SSR)
```

---

## Rotas Disponíveis

| Página                | URL                                    |
|-----------------------|----------------------------------------|
| Dashboard             | `/`                                    |
| Mapa IDEB             | `/gabinete-digital/mapa`               |
| Seletor de Município  | `/gabinete-digital/seletor-municipio`  |

---

## Decisões Técnicas

- **Tile provider:** CartoDB Light (`basemaps.cartocdn.com/light_all`) — escolhido por ser gratuito, sem chave de API e adequado para uso institucional governamental. Não usar o OSM direto em produção (restrições de uso).
- **GeoJSON:** Limites municipais buscados da API do IBGE em tempo real (`servicodados.ibge.gov.br/api/v3/malhas/estados/12?intrarregiao=municipio`).
- **Seleção de município:** Feita por polígono real (GeoJSON), não por marcadores. Layers manipulados via `ref` para evitar re-render do GeoJSON a cada clique.
- **Foco automático:** O `MapContainer` recebe `focus()` ao montar (componente `InicializarMapa`) para evitar duplo clique na seleção.
- **Centralização do Acre:** Usada via `fitBounds` com os limites `[[-11.15, -73.95], [-7.10, -66.60]]`.

---

## Municípios do Acre (22)

Todos os 22 municípios estão mapeados com `codIBGE`, coordenadas, IDEB e população nos arquivos de componente. Os códigos IBGE iniciam com `12` (código do estado do Acre).

---

## Sidebar (AppSidebar.tsx)

O módulo **Gabinete Digital** aparece no menu principal com sub-itens:
- Mapa IDEB → `/gabinete-digital/mapa`
- Seletor de Município → `/gabinete-digital/seletor-municipio`

---

## Próximos Passos (a definir)

- [ ] Definir ações a executar após seleção de município no `SeletorMunicipio`
- [ ] Integrar dados reais do TCE-AC (substituir dados simulados de IDEB)
- [ ] Desenvolver demais funcionalidades do Gabinete Digital

---

## Padrões do Projeto

- Toda comunicação e comentários devem ser em **português do Brasil**
- Componentes de mapa sempre com `dynamic import` e `ssr: false` (Leaflet não suporta SSR)
- Páginas do módulo ficam em `src/app/(admin)/gabinete-digital/`
- Componentes do módulo ficam em `src/components/Maps/` (por ora)
