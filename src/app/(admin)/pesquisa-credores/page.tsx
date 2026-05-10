import { Metadata } from "next";
import PesquisaCredoresClient from "@/components/despesa/PesquisaCredoresClient";

export const metadata: Metadata = {
  title: "Pesquisa de Credores — Despesa Pública",
};

export default function PesquisaCredoresPage() {
  return <PesquisaCredoresClient />;
}
