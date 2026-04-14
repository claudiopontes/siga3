export type MunicipioDesmatamento = {
  nome: string;
  pct: number;         // % do território desmatado
  kmDesmatado: number; // km² desmatados
  areaTotal: number;   // km² total do município
};

export const desmatamentoPorCodigo: Record<string, MunicipioDesmatamento> = {
  "1200013": { nome: "Acrelândia",           pct: 54, kmDesmatado: 1820, areaTotal: 3367  },
  "1200054": { nome: "Assis Brasil",         pct: 11, kmDesmatado:  550, areaTotal: 4974  },
  "1200104": { nome: "Brasiléia",            pct: 24, kmDesmatado: 1380, areaTotal: 5743  },
  "1200138": { nome: "Bujari",               pct: 41, kmDesmatado:  870, areaTotal: 2113  },
  "1200179": { nome: "Capixaba",             pct: 36, kmDesmatado:  690, areaTotal: 1912  },
  "1200203": { nome: "Cruzeiro do Sul",      pct: 14, kmDesmatado: 1840, areaTotal: 8779  },
  "1200252": { nome: "Epitaciolândia",       pct: 19, kmDesmatado:  260, areaTotal: 1389  },
  "1200302": { nome: "Feijó",                pct:  8, kmDesmatado: 1640, areaTotal: 27973 },
  "1200328": { nome: "Jordão",               pct:  3, kmDesmatado:  220, areaTotal: 5295  },
  "1200336": { nome: "Mâncio Lima",          pct: 10, kmDesmatado:  770, areaTotal: 7963  },
  "1200344": { nome: "Manoel Urbano",        pct:  9, kmDesmatado: 1030, areaTotal: 10336 },
  "1200351": { nome: "Marechal Thaumaturgo", pct:  4, kmDesmatado:  410, areaTotal: 9409  },
  "1200385": { nome: "Plácido de Castro",    pct: 49, kmDesmatado: 1630, areaTotal: 3347  },
  "1200393": { nome: "Porto Acre",           pct: 39, kmDesmatado: 1160, areaTotal: 2963  },
  "1200407": { nome: "Porto Walter",         pct:  5, kmDesmatado:  300, areaTotal: 6117  },
  "1200401": { nome: "Rio Branco",           pct: 34, kmDesmatado: 3640, areaTotal: 9662  },
  "1200427": { nome: "Rodrigues Alves",      pct: 14, kmDesmatado:  500, areaTotal: 2611  },
  "1200435": { nome: "Santa Rosa do Purus",  pct:  3, kmDesmatado:  160, areaTotal: 6145  },
  "1200450": { nome: "Senador Guiomard",     pct: 44, kmDesmatado: 1310, areaTotal: 2976  },
  "1200500": { nome: "Sena Madureira",       pct: 11, kmDesmatado: 3050, areaTotal: 23695 },
  "1200609": { nome: "Tarauacá",             pct:  9, kmDesmatado: 1950, areaTotal: 21795 },
  "1200708": { nome: "Xapuri",               pct: 16, kmDesmatado:  840, areaTotal: 5347  },
};
