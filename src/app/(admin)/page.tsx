import type { Metadata } from "next";
import HomeClient from "@/components/home/HomeClient";

export const metadata: Metadata = {
  title: "Início | Varadouro Digital",
  description: "Varadouro Digital — TCE-AC",
};

export default function Home() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-1 sm:p-2">
      <HomeClient />
    </div>
  );
}
