import GridShape from "@/components/common/GridShape";
import ThemeTogglerTwo from "@/components/common/ThemeTogglerTwo";

import { ThemeProvider } from "@/context/ThemeContext";
import Image from "next/image";
import Link from "next/link";
import React from "react";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative p-6 bg-white z-1 dark:bg-gray-900 sm:p-0">
      <ThemeProvider>
        <div className="relative flex lg:flex-row w-full h-screen justify-center flex-col  dark:bg-gray-900 sm:p-0">
          {children}
          <div className="lg:w-1/2 w-full h-full bg-white dark:bg-white/5 lg:grid items-center hidden">
            <div className="relative items-center justify-center  flex z-1">
              <div className="flex flex-col items-center w-4/5 max-w-lg">
                <Link href="/" className="block mb-4 w-full">
                  <Image
                    width={924}
                    height={192}
                    src="./images/logo/logo.svg"
                    alt="Logo"
                    className="w-full h-auto"
                  />
                </Link>
                <p className="text-center text-gray-600 italic font-bold dark:text-white/60">
                  Sistema de inteligência e monitoramento institucional dos gabinetes dos conselheiros do Tribunal de Contas do Estado do Acre.
                </p>
              </div>
            </div>
          </div>
          <div className="fixed bottom-6 right-6 z-50 hidden sm:block">
            <ThemeTogglerTwo />
          </div>
        </div>
      </ThemeProvider>
    </div>
  );
}
