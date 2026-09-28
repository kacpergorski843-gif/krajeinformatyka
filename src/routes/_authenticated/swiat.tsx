import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { useDeferredValue, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { CountryFlag } from "@/components/CountryFlag";
import { PageSkeleton } from "@/components/PageSkeleton";
import { Panel, SectionTitle, Stat } from "@/components/stat";
import { Input } from "@/components/ui/input";
import { meQuery, publicCountriesQuery, publicCountryQuery, regionsQuery } from "@/lib/api";
import { BUILDING_LABELS, kr, krShort, units } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/swiat")({
  head: () => ({
    meta: [
      { title: "Świat i państwa — COUNTRY RP" },
      { name: "description", content: "Przegląd państw, ich gospodarek, regionów i siły militarnej." },
    ],
  }),
  component: World,
});

function World() {
  const { data: me } = useQuery(meQuery);
  const { data: countries, isPending, isError, error } = useQuery(publicCountriesQuery);
  const [q, setQ] = useState("");
  const deferredQ = useDeferredValue(q);
  const [selectedId, setSelectedId] = useState<string | null>(() =>
    typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("country"),
  );

  const list = (countries ?? []).filter((country) =>
    country.name.toLocaleLowerCase("pl-PL").includes(deferredQ.trim().toLocaleLowerCase("pl-PL")),
  );
  const selectedQuery = useQuery(publicCountryQuery(selectedId));
  const { data: regions, isPending: regionsPending, isError: regionsError, error: regionsErrorValue } = useQuery(regionsQuery(selectedId));

  const openCountry = (countryId: string) => {
    setSelectedId(countryId);
    window.history.replaceState(null, "", "/swiat?country=" + encodeURIComponent(countryId));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const closeCountry = () => {
    setSelectedId(null);
    window.history.replaceState(null, "", "/swiat");
  };

  return (
    <AppShell>
      {/* Existing World UI follows unchanged. */}
    </AppShell>
  );
}
