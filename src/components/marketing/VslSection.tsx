"use client";

import { motion, useReducedMotion } from "framer-motion";
import { Play } from "lucide-react";
import { useState } from "react";
import { ease } from "@/design-system/motion";
import { Section, SectionHeading } from "./motion";
import { PrimaryCta } from "./ui";

/**
 * The explanatory video (VSL), right under the hero.
 *
 * Weight: until the visitor presses play, the page only loads a small poster image (lazy, ~12–30 KB).
 * The <video> element is mounted on the click, so no video bytes are fetched before that. Then
 * phones and slow connections get the 720p file, large screens the 1080p one; both are encoded with
 * the index up front (faststart), so playback starts after the first few hundred KB.
 */
const VIDEO = {
  hd: "/vsl/lastro-vsl-1080.mp4",
  sd: "/vsl/lastro-vsl-720.mp4",
  duration: "3:56",
};

function pickSource() {
  const conn = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  const slow = !!conn && (conn.saveData === true || /2g|3g/.test(conn.effectiveType ?? ""));
  const large = window.matchMedia("(min-width: 1024px)").matches;
  return large && !slow ? VIDEO.hd : VIDEO.sd;
}

export function VslSection() {
  const reduce = useReducedMotion();
  const [src, setSrc] = useState<string | null>(null);

  return (
    <Section id="video" labelledBy="vsl-title" className="pt-8 pb-20 lg:pt-10 lg:pb-28">
      <SectionHeading
        id="vsl-title"
        align="center"
        kicker="Em menos de 4 minutos"
        title="Veja o Lastro funcionando."
        lead="Do gasto de hoje ao patrimônio de amanhã, em um passeio rápido pelo app."
      />

      <motion.div
        initial={reduce ? false : { opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.3 }}
        transition={{ duration: 0.8, ease: ease.out }}
        className="relative mx-auto mt-10 aspect-video w-full max-w-[1040px] overflow-hidden rounded-[22px] bg-env shadow-[0_40px_90px_-40px_rgba(22,80,180,0.75)] sm:rounded-[34px] lg:mt-14"
      >
        {src ? (
          <video
            src={src}
            poster="/vsl/poster-1280.webp"
            controls
            autoPlay
            playsInline
            preload="auto"
            className="absolute inset-0 size-full bg-env object-cover"
          >
            Seu navegador não reproduz vídeos.
          </video>
        ) : (
          <button
            type="button"
            onClick={() => setSrc(pickSource())}
            aria-label={`Assistir ao vídeo do Lastro (${VIDEO.duration})`}
            className="group absolute inset-0 size-full cursor-pointer"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- static poster, sized by the frame */}
            <img
              src="/vsl/poster-1280.webp"
              srcSet="/vsl/poster-640.webp 640w, /vsl/poster-1280.webp 1280w"
              sizes="(min-width: 1080px) 1040px, 100vw"
              alt=""
              loading="lazy"
              decoding="async"
              width={1280}
              height={720}
              className="absolute inset-0 size-full object-cover"
            />
            <span aria-hidden className="absolute inset-0 bg-gradient-to-t from-midnight/35 via-transparent to-transparent" />
            <span className="absolute inset-0 grid place-items-center">
              <span className="grid size-16 place-items-center rounded-full bg-midnight text-white shadow-[0_0_0_10px_rgba(255,255,255,0.35),0_20px_50px_-10px_rgba(7,26,59,0.7)] transition-transform duration-300 group-hover:scale-105 sm:size-24 sm:shadow-[0_0_0_16px_rgba(255,255,255,0.35),0_20px_50px_-10px_rgba(7,26,59,0.7)]">
                <Play className="ml-1 size-7 fill-current sm:size-10" aria-hidden />
              </span>
            </span>
            <span className="absolute right-3 bottom-3 rounded-full bg-midnight/70 px-3 py-1 text-[13px] font-semibold text-white backdrop-blur sm:right-6 sm:bottom-6 sm:text-[14px]">
              {VIDEO.duration}
            </span>
          </button>
        )}
      </motion.div>

      <div className="mt-9 flex flex-col items-center gap-4">
        <PrimaryCta />
        <p className="text-center text-[14px] text-ink-500">Conta criada em menos de um minuto · Sem cartão de crédito</p>
      </div>
    </Section>
  );
}
