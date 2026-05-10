"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

type EnteOption = { id_ente: number; nome_ente: string };

export default function DespesaSubtitle() {
  const searchParams = useSearchParams();
  const anoInicio = searchParams.get("anoInicio");
  const anoFim    = searchParams.get("anoFim");
  const ente      = searchParams.get("ente");

  const [entesMap, setEntesMap] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    fetch("/api/despesa/entes")
      .then((r) => r.json())
      .then((data: EnteOption[]) => {
        if (!Array.isArray(data)) return;
        setEntesMap(new Map(data.map((e) => [String(e.id_ente), e.nome_ente])));
      })
      .catch(() => void 0);
  }, []);

  if (!anoInicio && !anoFim) return null;

  const periodo = anoFim && anoFim !== anoInicio ? `${anoInicio}–${anoFim}` : (anoInicio ?? "");
  const enteNome = ente ? (entesMap.get(ente) ?? "...") : "Todos os entes";

  return (
    <span className="truncate text-xs text-gray-400 dark:text-gray-500">
      {periodo} · {enteNome}
    </span>
  );
}
