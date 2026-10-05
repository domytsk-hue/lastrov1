"use client";

import { cn } from "@/lib/cn";

/** The person's photo, or their initial on a soft blue orb when there is none. */
export function Avatar({ name, photo, size = 44, className }: { name: string; photo?: string; size?: number; className?: string }) {
  return (
    <span
      className={cn(
        "grid shrink-0 place-items-center overflow-hidden rounded-full bg-gradient-to-br from-sky to-electric font-display font-semibold text-white shadow-[0_10px_24px_-10px_rgba(54,120,245,0.8)]",
        className,
      )}
      style={{ width: size, height: size, fontSize: size * 0.4 }}
      aria-hidden
    >
      {photo ? <img src={photo} alt="" className="size-full object-cover" draggable={false} /> : name.trim().charAt(0).toUpperCase()}
    </span>
  );
}
