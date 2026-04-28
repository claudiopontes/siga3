"use client";

const kpis = [
  {
    titulo: "Receita prevista",
    valor: "R$ 12,8 bi",
    detalhe: "Orçamento atualizado",
  },
  {
    titulo: "Receita realizada",
    valor: "R$ 9,4 bi",
    detalhe: "Valor arrecadado",
  },
  {
    titulo: "Execução da receita",
    valor: "73,4%",
    detalhe: "Realizado sobre previsto",
  },
  {
    titulo: "Órgãos arrecadadores",
    valor: "38",
    detalhe: "Com receita registrada",
  },
];

const categorias = [
  { nome: "Receitas correntes", valor: "R$ 8,1 bi", percentual: "86%" },
  { nome: "Receitas de capital", valor: "R$ 950 mi", percentual: "10%" },
  { nome: "Receitas intraorçamentárias", valor: "R$ 350 mi", percentual: "4%" },
];

const meses = [
  { mes: "Jan", realizado: "R$ 720 mi" },
  { mes: "Fev", realizado: "R$ 810 mi" },
  { mes: "Mar", realizado: "R$ 760 mi" },
  { mes: "Abr", realizado: "R$ 890 mi" },
  { mes: "Mai", realizado: "R$ 940 mi" },
  { mes: "Jun", realizado: "R$ 1,1 bi" },
];

export default function PainelReceitaPublicaClient() {
  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-4">
      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-950">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-600 dark:text-blue-400">
              Varadouro Digital
            </p>

            <h1 className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">
              Painel da Receita Pública
            </h1>

            <p className="mt-2 max-w-3xl text-sm text-gray-500 dark:text-gray-400">
              Visão inicial para acompanhamento da previsão, realização e execução das receitas públicas.
              Nesta primeira etapa, os dados são demonstrativos para validar layout, navegação e estrutura do painel.
            </p>
          </div>

          <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-800 dark:border-blue-900/60 dark:bg-blue-950/40 dark:text-blue-200">
            <p className="font-semibold">Fonte de dados</p>
            <p className="mt-1">Portal da Transparência — Execução da Receita</p>
            <p className="mt-1 text-xs opacity-80">Última atualização: demonstrativa</p>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {kpis.map((kpi) => (
          <div
            key={kpi.titulo}
            className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-950"
          >
            <p className="text-sm text-gray-500 dark:text-gray-400">{kpi.titulo}</p>
            <p className="mt-3 text-2xl font-bold text-gray-900 dark:text-white">
              {kpi.valor}
            </p>
            <p className="mt-2 text-xs text-gray-400 dark:text-gray-500">
              {kpi.detalhe}
            </p>
          </div>
        ))}
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm xl:col-span-2 dark:border-gray-800 dark:bg-gray-950">
          <div className="mb-4">
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">
              Evolução mensal da receita realizada
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Série demonstrativa para validação do painel.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            {meses.map((item) => (
              <div
                key={item.mes}
                className="rounded-xl border border-gray-100 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-900"
              >
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400">
                  {item.mes}
                </p>
                <p className="mt-2 text-lg font-semibold text-gray-900 dark:text-white">
                  {item.realizado}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-950">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">
            Receita por categoria
          </h2>

          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Distribuição demonstrativa.
          </p>

          <div className="mt-5 space-y-3">
            {categorias.map((categoria) => (
              <div
                key={categoria.nome}
                className="rounded-xl border border-gray-100 p-4 dark:border-gray-800"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-200">
                    {categoria.nome}
                  </p>
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">
                    {categoria.percentual}
                  </p>
                </div>

                <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                  {categoria.valor}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-dashed border-gray-300 bg-white p-5 text-sm text-gray-500 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-400">
        Próxima etapa: conectar este painel às tabelas agregadas no Supabase e substituir os dados demonstrativos por dados reais.
      </section>
    </div>
  );
}