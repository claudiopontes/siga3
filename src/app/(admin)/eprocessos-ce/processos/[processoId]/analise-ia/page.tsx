import { redirect } from "next/navigation";

interface Props {
  params: Promise<{ processoId: string }>;
}

// Redireciona para a rota de API que serve o HTML do relatório de análise IA
export default async function AnaliseIaPage({ params }: Props) {
  const { processoId } = await params;
  redirect(`/api/ia/relatorio-processo/${processoId}`);
}
