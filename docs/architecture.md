# Architektura aplikacji

## Cel

Dokument opisuje granice odpowiedzialności obecnego systemu. Porządkowanie
kodu nie może zmieniać zachowania gracza, wyglądu interfejsu ani reguł gry.

## Główny przepływ

1. **React + TanStack Router** renderuje istniejące ekrany i obsługuje nawigację.
2. **TanStack Query** zarządza cache'em i odświeżaniem danych.
3. **TanStack Start Server Functions** obsługują operacje wymagające serwera,
   sesji użytkownika lub klucza Service Role.
4. **Supabase Auth + RLS** identyfikuje użytkownika i egzekwuje dostęp do danych.
5. **PostgreSQL** pozostaje źródłem prawdy dla sald, zasobów, budynków,
   transferów, umów i rozliczeń. Operacje wieloetapowe muszą pozostać atomowe
   po stronie bazy.

## Granice odpowiedzialności

- Komponenty i route'y: prezentacja, stan widoku i wywołania warstwy danych.
- `src/lib/api.ts`: odczyty i mutacje używane przez interfejs oraz definicje
  typów odpowiedzi API.
- `src/lib/*.functions.ts`: funkcje serwerowe TanStack Start. Każda operacja
  administracyjna musi weryfikować rolę po stronie serwera; nie ufać danym
  przesłanym przez przeglądarkę.
- `src/integrations/supabase/`: konfiguracja klientów i middleware sesji.
  Klient Service Role może być używany wyłącznie w modułach serwerowych.
- `supabase/migrations/`: źródło prawdy dla zmian produkcyjnej bazy danych.
  Nie wdrażać migracji automatycznie z gałęzi roboczych.
- `drizzle/migrations/`: kopia utrzymywana dla istniejącego workflow, nie
  zastępuje produkcyjnych migracji Supabase.

## Procesy w tle

- Dobowe rozliczenie ekonomii jest uruchamiane przez harmonogram PostgreSQL
  (pg_cron) z kontrolą czasu `Europe/Warsaw`. Nie uruchamiać drugiego
  schedulera w procesie webowym, bo mogłoby to zdublować wypłaty.
- Przypomnienia i powiadomienia o atakach w `src/components/GameAlerts.tsx`
  są mechanizmem przeglądarkowym. Nie są źródłem prawdy i nie zastępują
  serwerowego rozliczenia.
- Synchronizacja otwartych sesji korzysta z Supabase Realtime. Layout
  `src/routes/_authenticated/route.tsx` subskrybuje zmiany tabel publicznych
  opublikowanych w `supabase_realtime` i unieważnia cache TanStack Query;
  widoki pochodne, takie jak `country_stats`, są ponownie pobierane po zmianie
  tabel źródłowych. Payload zdarzenia nie jest używany do prezentowania danych.
- Migracja `0073_publish_game_tables_realtime.sql` dodaje tabele aplikacji do
  publikacji Realtime. RLS nadal kontroluje, które zdarzenia użytkownik może
  otrzymać. Nowe tabele wymagają dopisania do migracji i listy subskrypcji.
- Polling TanStack Query pozostaje wyłącznie zabezpieczeniem na wypadek
  rozłączenia WebSocket lub braku zdarzenia (60 sekund); powrót do karty
  odświeża dane przez `refetchOnWindowFocus`.

## Niezmienniki przy refaktoryzacji

- Nie zmieniać tekstów, układu, klas CSS ani komponentów ekranów.
- Nie zmieniać sygnatur RPC, kształtu danych ani kluczy cache bez osobnej
  analizy wszystkich konsumentów.
- Nie zmieniać harmonogramów, stref czasowych ani limitów rozliczeń.
- Nie przenosić logiki finansowej/wojskowej z transakcji PostgreSQL do klienta.
- Nie zmieniać polityk RLS ani istniejących danych przez refaktoryzację kodu.
- Zachować dotychczasowe ścieżki importu, gdy moduł jest rozdzielany; używać
  re-eksportów kompatybilności, jeśli są potrzebne.

## Walidacja

Każda zmiana powinna przejść:

- `npm run typecheck`
- `npm run lint`
- `npm run build`

Workflow GitHub Actions uruchamia te kontrole dla pull requestów. Testy
reguł biznesowych i testy integracyjne bazy należy rozwijać osobno, bez
zmieniania zachowania produkcyjnego.
