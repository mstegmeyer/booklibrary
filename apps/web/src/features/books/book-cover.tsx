import type { ReactNode } from "react";
import { cn } from "../../lib/cn";

/** Cloth colours for books without a cover image. */
export const coverColors = [
  "#6e2f2a",
  "#8a5a1f",
  "#2e4a62",
  "#3f5e6b",
  "#2f4a3e",
  "#7b6a4a",
  "#5b3a5e",
  "#262626",
  "#a0522d",
  "#36514a",
  "#6b5b4b",
  "#9a6b1f",
  "#7a4458",
  "#1f4a5c",
  "#4a4a4a",
  "#6a4a2e",
];

export function coverColor(seed: string) {
  let hash = 0;
  for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return coverColors[Math.abs(hash) % coverColors.length];
}

const sizes = {
  grid: {
    box: "rounded-[2px_4px_4px_2px] px-2 pt-2.5 pb-2 pl-3 shadow-[inset_4px_0_0_rgba(0,0,0,0.16)] md:rounded-[3px_5px_5px_3px] md:px-3 md:pt-3.5 md:pb-3 md:pl-[18px] md:shadow-[inset_6px_0_0_rgba(0,0,0,0.16)]",
    title:
      "pr-3.5 text-[13px] leading-4 md:pr-5 md:text-base md:leading-5 [text-wrap:balance]",
    author: "hidden md:block text-[11px] leading-[14px]",
  },
  page: {
    box: "w-[108px] h-[162px] rounded-[2px_5px_5px_2px] px-2.5 pt-3 pb-2.5 pl-3.5 shadow-[inset_5px_0_0_rgba(0,0,0,0.16)] md:w-[180px] md:h-[270px] md:rounded-[3px_6px_6px_3px] md:px-4 md:pt-5 md:pb-4 md:pl-6 md:shadow-[inset_8px_0_0_rgba(0,0,0,0.16)]",
    title: "text-sm leading-[17px] md:text-[22px] md:leading-[27px]",
    author: "text-[11px] leading-[14px] md:text-xs md:leading-4",
  },
  small: {
    box: "w-16 h-24 rounded-[2px_4px_4px_2px] pt-2 pr-1.5 pb-1.5 pl-2.5 shadow-[inset_4px_0_0_rgba(0,0,0,0.16)]",
    title: "text-[11px] leading-[13px]",
    author: "hidden",
  },
  spine: {
    box: "w-7 h-[42px] rounded-[2px_3px_3px_2px] shadow-[inset_3px_0_0_rgba(0,0,0,0.16)]",
    title: "hidden",
    author: "hidden",
  },
};

/**
 * The cover image, or a cloth-coloured stand-in showing title and author.
 * Decorative: the title is always shown as text next to it.
 */
export function BookCover({
  id,
  title,
  authors,
  imageUrl,
  size,
  className,
  children,
}: {
  id: string;
  title: string;
  authors: string[];
  imageUrl: string | null;
  size: keyof typeof sizes;
  className?: string;
  /** Badges drawn on top of the cover. */
  children?: ReactNode;
}) {
  const style = sizes[size];
  return (
    <div
      className={cn(
        "relative flex shrink-0 flex-col justify-between overflow-hidden text-white",
        size === "grid" && "aspect-[2/3]",
        style.box,
        imageUrl && "p-0 md:p-0",
        className,
      )}
      style={{ background: coverColor(id) }}
    >
      {imageUrl ? (
        <img
          src={imageUrl}
          alt=""
          loading="lazy"
          className="absolute inset-0 size-full object-cover"
        />
      ) : (
        <>
          <span
            aria-hidden
            className={cn("font-semibold font-serif", style.title)}
          >
            {title}
          </span>
          <span
            aria-hidden
            className={cn(
              "font-medium uppercase tracking-[0.04em]",
              style.author,
            )}
          >
            {authors.join(", ")}
          </span>
        </>
      )}
      {children}
    </div>
  );
}
