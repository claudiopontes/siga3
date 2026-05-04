"use client";

import { Camera, Loader2 } from "lucide-react";
import Image from "next/image";
import React, { useState } from "react";

type ProfilePhotoUploaderProps = {
  displayName: string;
  initialPhotoUrl?: string;
  initialPhotoPosition?: string;
};

const photoPositions = [
  { value: "center center", label: "Centro" },
  { value: "center top", label: "Subir" },
  { value: "center bottom", label: "Descer" },
  { value: "left center", label: "Esquerda" },
  { value: "right center", label: "Direita" },
];

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

export default function ProfilePhotoUploader({
  displayName,
  initialPhotoUrl,
  initialPhotoPosition = "center center",
}: ProfilePhotoUploaderProps) {
  const [photoUrl, setPhotoUrl] = useState(initialPhotoUrl);
  const [photoPosition, setPhotoPosition] = useState(initialPhotoPosition);
  const [isUploading, setIsUploading] = useState(false);
  const [isSavingPosition, setIsSavingPosition] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error" | "">("");

  function notifyPhotoUpdated(nextPhotoUrl = photoUrl, nextPhotoPosition = photoPosition) {
    window.dispatchEvent(
      new CustomEvent("profile-photo-updated", {
        detail: { photoUrl: nextPhotoUrl, photoPosition: nextPhotoPosition },
      }),
    );
  }

  async function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    setIsUploading(true);
    setMessage("");
    setMessageType("");

    try {
      const formData = new FormData();
      formData.append("foto", file);

      const response = await fetch("/api/auth/photo", {
        method: "POST",
        body: formData,
      });
      const data = (await response.json()) as {
        photoUrl?: string;
        photoPosition?: string;
        message?: string;
      };

      if (!response.ok || !data.photoUrl) {
        throw new Error(data.message ?? "Não foi possível atualizar a foto.");
      }

      const nextPosition = data.photoPosition ?? "center center";
      setPhotoUrl(data.photoUrl);
      setPhotoPosition(nextPosition);
      notifyPhotoUpdated(data.photoUrl, nextPosition);
      setMessage("Foto atualizada com sucesso.");
      setMessageType("success");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível atualizar a foto.");
      setMessageType("error");
    } finally {
      setIsUploading(false);
      event.target.value = "";
    }
  }

  async function handlePositionChange(nextPosition: string) {
    setPhotoPosition(nextPosition);

    if (!photoUrl) {
      return;
    }

    setIsSavingPosition(true);
    setMessage("");
    setMessageType("");

    try {
      const response = await fetch("/api/auth/photo", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photoPosition: nextPosition }),
      });
      const data = (await response.json()) as { photoPosition?: string; message?: string };

      if (!response.ok) {
        throw new Error(data.message ?? "Não foi possível ajustar a foto.");
      }

      notifyPhotoUpdated(photoUrl, data.photoPosition ?? nextPosition);
      setMessage("Enquadramento atualizado.");
      setMessageType("success");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível ajustar a foto.");
      setMessageType("error");
    } finally {
      setIsSavingPosition(false);
    }
  }

  return (
    <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-center">
      <div className="relative">
        <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full border border-brand-100 bg-brand-50 text-xl font-semibold text-brand-700 dark:border-brand-500/20 dark:bg-brand-500/10 dark:text-brand-300">
          {photoUrl ? (
            <Image
              src={photoUrl}
              alt={displayName}
              width={80}
              height={80}
              unoptimized
              className="h-full w-full object-cover"
              style={{ objectPosition: photoPosition }}
            />
          ) : (
            getInitials(displayName)
          )}
        </div>
        <label className="absolute -bottom-1 -right-1 flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border border-gray-200 bg-white text-gray-600 shadow-theme-xs transition hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
          {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="sr-only"
            onChange={handleChange}
            disabled={isUploading}
          />
        </label>
      </div>
      <div className="text-center sm:text-left">
        <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
          Foto do perfil
        </p>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          JPG, PNG ou WebP até 4 MB.
        </p>
        {photoUrl && (
          <div className="mt-2 flex flex-wrap justify-center gap-1.5 sm:justify-start">
            {photoPositions.map((position) => (
              <button
                key={position.value}
                type="button"
                onClick={() => handlePositionChange(position.value)}
                disabled={isSavingPosition || photoPosition === position.value}
                className={`rounded-md border px-2 py-1 text-xs font-medium transition ${
                  photoPosition === position.value
                    ? "border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-300"
                    : "border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300"
                } disabled:cursor-default`}
              >
                {position.label}
              </button>
            ))}
          </div>
        )}
        {message && (
          <p
            className={`mt-1 text-xs font-medium ${
              messageType === "error"
                ? "text-error-600 dark:text-error-400"
                : "text-success-600 dark:text-success-400"
            }`}
          >
            {message}
          </p>
        )}
      </div>
    </div>
  );
}
