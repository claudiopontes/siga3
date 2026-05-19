"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from "react";

const STORAGE_KEY = "aquiry:botao-pos";
const STORAGE_VERSION = 1;
const MARGIN_TOP_PX = 80;
const MARGIN_BOTTOM_PX = 80;
const BUTTON_HEIGHT_PX = 72;
const RIGHT_PX = 20;
const BOTTOM_PADRAO_PX = 20;
const DRAG_THRESHOLD_PX = 5;
const KEYBOARD_STEP_PX = 40;
const MOBILE_BREAKPOINT_PX = 640;
const SUPRIMIR_CLIQUE_MS = 80;

interface PosicaoSalva {
  topPct: number;
  version: number;
  atualizadoEm: string;
}

function obterAlturaViewport(): number {
  if (typeof window === "undefined") return 800;
  return window.innerHeight;
}

function ehMobile(): boolean {
  if (typeof window === "undefined") return false;
  return window.innerWidth < MOBILE_BREAKPOINT_PX;
}

function topPxPadrao(): number {
  const vh = obterAlturaViewport();
  return Math.max(MARGIN_TOP_PX, vh - BOTTOM_PADRAO_PX - BUTTON_HEIGHT_PX);
}

function clampTopPx(topPx: number): number {
  const vh = obterAlturaViewport();
  const max = vh - MARGIN_BOTTOM_PX - BUTTON_HEIGHT_PX;
  const min = MARGIN_TOP_PX;
  if (!Number.isFinite(topPx)) return Math.max(min, max > min ? max : min);
  if (max <= min) return min;
  return Math.min(Math.max(topPx, min), max);
}

function carregarPosicao(): number | null {
  if (typeof window === "undefined") return null;
  try {
    const bruto = localStorage.getItem(STORAGE_KEY);
    if (!bruto) return null;
    const parsed: unknown = JSON.parse(bruto);
    if (!parsed || typeof parsed !== "object") return null;
    const obj = parsed as Record<string, unknown>;
    if (obj.version !== STORAGE_VERSION) return null;
    const topPct = obj.topPct;
    if (typeof topPct !== "number" || !Number.isFinite(topPct)) return null;
    if (topPct < 0 || topPct > 100) return null;
    const vh = obterAlturaViewport();
    return clampTopPx((topPct / 100) * vh);
  } catch {
    return null;
  }
}

function salvarPosicao(topPx: number) {
  if (typeof window === "undefined") return;
  try {
    const vh = obterAlturaViewport();
    if (vh <= 0) return;
    const topPct = (topPx / vh) * 100;
    const payload: PosicaoSalva = {
      topPct,
      version: STORAGE_VERSION,
      atualizadoEm: new Date().toISOString(),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // localStorage indisponível — preferência apenas na sessão atual
  }
}

export interface UsePosicaoBotaoAquiryRetorno {
  estiloBotao: CSSProperties;
  mobile: boolean;
  arrastando: boolean;
  onPointerDown: (e: ReactPointerEvent<HTMLElement>) => void;
  onKeyDown: (e: ReactKeyboardEvent<HTMLElement>) => void;
  resetarPosicao: () => void;
  consumiuArrasto: () => boolean;
}

export function usePosicaoBotaoAquiry(): UsePosicaoBotaoAquiryRetorno {
  const [mobile, setMobile] = useState<boolean>(false);
  const [topPx, setTopPx] = useState<number | null>(null);
  const [arrastando, setArrastando] = useState(false);

  const elementoArrastoRef = useRef<HTMLElement | null>(null);
  const inicioYRef = useRef(0);
  const inicioTopRef = useRef(0);
  const ultrapassouLimiarRef = useRef(false);
  const rafRef = useRef<number | null>(null);
  const consumiuArrastoRef = useRef(false);
  const suprimirTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Inicialização client-side: leitura de window/localStorage só após mount
  // para evitar hydration mismatch entre SSR e cliente.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMobile(ehMobile());
    const restaurado = carregarPosicao();
    setTopPx(restaurado !== null ? restaurado : topPxPadrao());
  }, []);

  // Reage a redimensionamento da viewport
  useEffect(() => {
    function onResize() {
      const novoMobile = ehMobile();
      setMobile(novoMobile);
      setTopPx((atual) => (atual === null ? atual : clampTopPx(atual)));
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const handlersRef = useRef<{
    move: (e: PointerEvent) => void;
    up: (e: PointerEvent) => void;
  } | null>(null);

  useEffect(() => {
    function move(e: PointerEvent) {
      const delta = e.clientY - inicioYRef.current;
      if (!ultrapassouLimiarRef.current && Math.abs(delta) >= DRAG_THRESHOLD_PX) {
        ultrapassouLimiarRef.current = true;
        setArrastando(true);
      }
      if (!ultrapassouLimiarRef.current) return;
      const novoTop = clampTopPx(inicioTopRef.current + delta);
      if (rafRef.current !== null) return;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        const el = elementoArrastoRef.current;
        if (el) {
          el.style.top = `${novoTop}px`;
          el.style.bottom = "auto";
        }
      });
    }

    function up(e: PointerEvent) {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      if (ultrapassouLimiarRef.current) {
        const delta = e.clientY - inicioYRef.current;
        const novoTop = clampTopPx(inicioTopRef.current + delta);
        setTopPx(novoTop);
        salvarPosicao(novoTop);
        consumiuArrastoRef.current = true;
        if (suprimirTimerRef.current) clearTimeout(suprimirTimerRef.current);
        suprimirTimerRef.current = setTimeout(() => {
          consumiuArrastoRef.current = false;
        }, SUPRIMIR_CLIQUE_MS);
      }
      setArrastando(false);
      ultrapassouLimiarRef.current = false;
      elementoArrastoRef.current = null;
    }

    handlersRef.current = { move, up };

    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      if (suprimirTimerRef.current) clearTimeout(suprimirTimerRef.current);
    };
  }, []);

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      if (mobile) return;
      if (e.pointerType === "mouse" && e.button !== 0) return;
      if (topPx === null) return;
      const handlers = handlersRef.current;
      if (!handlers) return;
      elementoArrastoRef.current = e.currentTarget;
      inicioYRef.current = e.clientY;
      inicioTopRef.current = topPx;
      ultrapassouLimiarRef.current = false;
      window.addEventListener("pointermove", handlers.move);
      window.addEventListener("pointerup", handlers.up);
      window.addEventListener("pointercancel", handlers.up);
    },
    [mobile, topPx],
  );

  const onKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLElement>) => {
      if (mobile) return;
      if (!e.altKey) return;
      if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
      e.preventDefault();
      const delta = e.key === "ArrowUp" ? -KEYBOARD_STEP_PX : KEYBOARD_STEP_PX;
      setTopPx((atual) => {
        const base = atual ?? topPxPadrao();
        const novo = clampTopPx(base + delta);
        salvarPosicao(novo);
        return novo;
      });
    },
    [mobile],
  );

  const resetarPosicao = useCallback(() => {
    if (typeof window !== "undefined") {
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {
        // ignora
      }
    }
    setTopPx(topPxPadrao());
  }, []);

  const consumiuArrasto = useCallback(() => consumiuArrastoRef.current, []);

  const estiloBotao: CSSProperties =
    mobile || topPx === null
      ? { position: "fixed", right: `${RIGHT_PX}px`, bottom: `${BOTTOM_PADRAO_PX}px` }
      : { position: "fixed", right: `${RIGHT_PX}px`, top: `${topPx}px` };

  return {
    estiloBotao,
    mobile,
    arrastando,
    onPointerDown,
    onKeyDown,
    resetarPosicao,
    consumiuArrasto,
  };
}
