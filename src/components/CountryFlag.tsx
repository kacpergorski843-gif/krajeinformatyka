import type { ImgHTMLAttributes } from "react";

type CountryFlagProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "src" | "alt"> & {
  flag: string | null | undefined;
  alt?: string;
};

export function CountryFlag({ flag, alt = "Flaga", className = "", ...props }: CountryFlagProps) {
  const value = flag?.trim() ?? "";
  if (/^https?:\/\//i.test(value)) {
    return <img src={value} alt={alt} className={`inline-block object-cover ${className}`} {...props} />;
  }
  return <span className={className} {...props}>{value}</span>;
}
