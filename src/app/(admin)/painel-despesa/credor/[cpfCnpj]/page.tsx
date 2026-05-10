import { Metadata } from "next";
import CredorDespesaDetalheClient from "@/components/despesa/CredorDespesaDetalheClient";

interface Props {
  params: Promise<{ cpfCnpj: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { cpfCnpj } = await params;
  return {
    title: `Credor ${cpfCnpj} — Despesa Pública`,
  };
}

export default async function CredorDespesaPage({ params }: Props) {
  const { cpfCnpj } = await params;
  return <CredorDespesaDetalheClient cpfCnpj={cpfCnpj} />;
}
