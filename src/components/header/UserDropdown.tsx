"use client";

import { LogOut, UserRound } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import React, { useEffect, useState } from "react";
import { Dropdown } from "../ui/dropdown/Dropdown";
import { DropdownItem } from "../ui/dropdown/DropdownItem";

type AuthUser = {
  username: string;
  displayName?: string;
  email?: string;
  photoUrl?: string;
  photoPosition?: string;
};

function getInitials(name: string) {
  const parts = name.split(/\s+/).filter(Boolean);

  if (parts.length === 0) {
    return "VD";
  }

  return parts
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

function Avatar({
  name,
  photoUrl,
  photoPosition = "center center",
}: {
  name: string;
  photoUrl?: string;
  photoPosition?: string;
}) {
  return (
    <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full border border-gray-200 bg-brand-50 text-sm font-semibold text-brand-700 dark:border-gray-800 dark:bg-brand-500/10 dark:text-brand-300">
      {photoUrl ? (
        <Image
          src={photoUrl}
          alt={name}
          width={44}
          height={44}
          unoptimized
          className="h-full w-full object-cover"
          style={{ objectPosition: photoPosition }}
        />
      ) : (
        getInitials(name)
      )}
    </span>
  );
}

export default function UserDropdown() {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [user, setUser] = useState<AuthUser | null>(null);

  function toggleDropdown(e: React.MouseEvent<HTMLButtonElement, MouseEvent>) {
    e.stopPropagation();
    setIsOpen((prev) => !prev);
  }

  function closeDropdown() {
    setIsOpen(false);
  }

  useEffect(() => {
    fetch("/api/auth/me")
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { user?: AuthUser } | null) => setUser(data?.user ?? null))
      .catch(() => setUser(null));
  }, []);

  useEffect(() => {
    const handlePhotoUpdate = (event: Event) => {
      const detail = (event as CustomEvent<{ photoUrl?: string; photoPosition?: string }>).detail;
      setUser((current) => (current ? { ...current, ...detail } : current));
    };

    window.addEventListener("profile-photo-updated", handlePhotoUpdate);

    return () => window.removeEventListener("profile-photo-updated", handlePhotoUpdate);
  }, []);

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    closeDropdown();
    router.replace("/signin");
    router.refresh();
  };

  const displayName = user?.displayName ?? user?.username ?? "Usuário";
  const email = user?.email ?? `${user?.username ?? "usuario"}@tceac.local`;

  return (
    <div className="relative">
      <button
        onClick={toggleDropdown}
        className="flex items-center text-gray-700 dark:text-gray-400 dropdown-toggle"
        aria-label="Abrir menu do usuário"
      >
        <Avatar
          name={displayName}
          photoUrl={user?.photoUrl}
          photoPosition={user?.photoPosition}
        />
      </button>

      <Dropdown
        isOpen={isOpen}
        onClose={closeDropdown}
        className="absolute right-0 mt-[17px] flex w-[260px] flex-col rounded-2xl border border-gray-200 bg-white p-3 shadow-theme-lg dark:border-gray-800 dark:bg-gray-dark"
      >
        <div>
          <span className="block font-medium text-gray-700 text-theme-sm dark:text-gray-400">
            {displayName}
          </span>
          <span className="mt-0.5 block text-theme-xs text-gray-500 dark:text-gray-400">
            {email}
          </span>
        </div>

        <ul className="flex flex-col gap-1 pt-4 pb-3 border-b border-gray-200 dark:border-gray-800">
          <li>
            <DropdownItem
              onItemClick={closeDropdown}
              tag="a"
              href="/profile"
              className="flex items-center gap-3 px-3 py-2 font-medium text-gray-700 rounded-lg group text-theme-sm hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-gray-300"
            >
              <UserRound className="h-5 w-5 text-gray-500 group-hover:text-gray-700 dark:text-gray-400 dark:group-hover:text-gray-300" />
              Editar perfil
            </DropdownItem>
          </li>
        </ul>

        <button
          onClick={handleLogout}
          className="flex items-center gap-3 px-3 py-2 mt-3 font-medium text-gray-700 rounded-lg group text-theme-sm hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-gray-300"
        >
          <LogOut className="h-5 w-5 text-gray-500 group-hover:text-gray-700 dark:text-gray-400 dark:group-hover:text-gray-300" />
          Sair
        </button>
      </Dropdown>
    </div>
  );
}
