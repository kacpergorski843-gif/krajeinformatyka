type CountryFlagProps = {
  flag: string | null | undefined;
  alt?: string;
  className?: string;
};

export function CountryFlag({ flag, alt = "Flaga", className = "" }: CountryFlagProps) {
  const value = flag?.trim() ?? "";
  if (/^https?:\/\//i.test(value)) {
    return <img src={value} alt={alt} className={`inline-block object-cover ${className}`} />;
  }
  return <span className={className}>{value}</span>;
}
