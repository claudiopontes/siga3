import SignInForm from "@/components/auth/SignInForm";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Entrar | Varadouro Digital Aquiry — TCE-AC",
  description: "Acesso ao Varadouro Digital Aquiry — Tribunal de Contas do Estado do Acre.",
};

export default function SignIn() {
  return <SignInForm />;
}
