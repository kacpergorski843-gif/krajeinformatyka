import { useState } from "react";

type CountryFlagProps = {
  flag: string | null | undefined;
  alt?: string;
  className?: string;
};

function isImageSource(value: string) {
  return /^(?:https?:\/\/|data:image\/|\/)/i.test(value);
}

export function CountryFlag({ flag, alt = "Flaga", className = "" }: CountryFlagProps) {
  const value = flag?.trim() ?? "";
  const [failed, setFailed] = useState(false);

  if (value && isImageSource(value) && !failed) {
    return (
      <img
        src={value}
        alt={alt}
        className={`inline-block object-cover ${className}`}
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <span className={`inline-flex items-center justify-center ${className}`} role={alt ? "img" : undefined} aria-label={alt || undefined}>
      {value || "🏳️"}
    </span>
  );
}
