"use client";

import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/format/cn";
import {
  IMAGE_ADAPTIVE_PX,
  IMAGE_ADAPTIVE_QUALITY,
  IMAGE_THUMB_PX,
  IMAGE_THUMB_QUALITY,
} from "@/lib/images/remote";
import { displayableLogoUrl } from "@/lib/images/logo";
import { useQuality } from "@/lib/quality/QualityProvider";
import type { QualityImages } from "@/lib/quality/types";
import Image, { type ImageLoaderProps } from "next/image";
import { useState } from "react";

const BOX = {
  sm: "size-5 text-xs",
  md: "size-8 text-sm",
  lg: "size-12 text-md",
} as const;

const ADAPTIVE_SIZES = {
  sm: "20px",
  md: "(max-width: 640px) 32px, (max-width: 1024px) 40px, 48px",
  lg: "(max-width: 640px) 40px, (max-width: 1024px) 48px, 64px",
} as const;

function thumbLoader({ src, quality }: ImageLoaderProps): string {
  const q = quality ?? IMAGE_THUMB_QUALITY;
  return `/_next/image?url=${encodeURIComponent(src)}&w=${IMAGE_THUMB_PX}&q=${q}`;
}

export type SmartImageSize = keyof typeof BOX;

export type SmartImageProps = {
  src?: string | null;
  name: string;
  alt?: string;
  /** Если не передали — берём из режима страницы. */
  images?: QualityImages;
  size?: SmartImageSize;
  className?: string;
};

/**
 * Картинка по матрице качества.
 * adaptive — webp/avif, srcset, lazy, ширина/высота (CLS).
 * thumb — один маленький размер.
 * none — буквенный аватар, без тега img (Закон 4).
 */
export function SmartImage({
  src,
  name,
  alt,
  images,
  size = "md",
  className,
}: SmartImageProps) {
  const { features } = useQuality();
  const mode = images ?? features.images;
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const url = failed ? null : displayableLogoUrl(src);
  const box = BOX[size];
  const label = alt ?? name;

  const fallback = (
    <Avatar name={name} size="sm" className="size-full min-h-0 min-w-0" />
  );

  if (mode === "none" || url == null) {
    return (
      <span className={cn("inline-flex shrink-0 overflow-hidden rounded-pill", box, className)}>
        {fallback}
      </span>
    );
  }

  const thumb = mode === "thumb";
  const px = thumb ? IMAGE_THUMB_PX : IMAGE_ADAPTIVE_PX;

  return (
    <span className={cn("relative inline-flex shrink-0 overflow-hidden rounded-pill", box, className)}>
      {loaded ? null : fallback}
      <Image
        src={url}
        alt={label}
        width={px}
        height={px}
        sizes={thumb ? `${IMAGE_THUMB_PX}px` : ADAPTIVE_SIZES[size]}
        quality={thumb ? IMAGE_THUMB_QUALITY : IMAGE_ADAPTIVE_QUALITY}
        loader={thumb ? thumbLoader : undefined}
        loading="lazy"
        decoding="async"
        onLoad={() => setLoaded(true)}
        onError={() => setFailed(true)}
        className={cn(
          "absolute inset-0 size-full object-cover",
          loaded ? "opacity-100" : "opacity-0",
        )}
      />
    </span>
  );
}