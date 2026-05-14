import { Metadata } from "next";
import CredorDespesaDetalheClient from "@/components/despesa/CredorDespesaDetalheClient";

interface Props {
  params: Promise<{ cpfCnpj: string }>;
}

function formatDoc(digits: string): string {
  const d = digits.replace(/\D/g, "");
  if (d.length === 11) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  if (d.length === 14) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  return digits;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { cpfCnpj } = await params;
  return {
    title: `Credor ${formatDoc(cpfCnpj)} — Despesa Pública`,
  };
}

export default async function CredorDespesaPage({ params }: Props) {
  const { cpfCnpj } = await params;
  return <CredorDespesaDetalheClient cpfCnpj={cpfCnpj} />;
}
