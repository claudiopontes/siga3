"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import React, { useState } from "react";

type LogoutButtonProps = {
  className?: string;
};

export default function LogoutButton({ className = "" }: LogoutButtonProps) {
  const router = useRouter();
  const [isLeaving, setIsLeaving] = useState(false);

  const handleLogout = async () => {
    setIsLeaving(true);
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/signin");
    router.refresh();
  };

  return (
    <button
      type="button"
      onClick={handleLogout}
      disabled={isLeaving}
      className={`inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 shadow-theme-xs transition hover:bg-gray-50 hover:text-gray-800 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-white/[0.03] ${className}`}
    >
      <LogOut className="h-4 w-4" />
      {isLeaving ? "Saindo..." : "Sair"}
    </button>
  );
}
