# UPDATE 3.0 — Nation Dynamics (bez panelu administratora)

Panel administratora pozostaje nietknięty. Istniejące państwa, konta i dane w bazie zostają zachowane — wszystkie zmiany w bazie są dodające (nic nie jest usuwane).

## 1. Naprawa wypłat dziennych o 20:00 (Europe/Warsaw)

Obecnie automatyczne rozliczenie startuje o 19:00 UTC, co odpowiada 20:00 tylko w czasie zimowym — latem wypłaty spadały o 21:00.

- Rozliczenie będzie sprawdzane raz na godzinę i wykonywane dokładnie wtedy, gdy w Polsce jest godzina 20 — poprawnie i zimą, i latem.
- Zabezpieczenie przed podwójną wypłatą per data zostaje (jedna wypłata na dobę, niezależnie od liczby prób).
- Działa w całości po stronie serwera — nikt nie musi mieć otwartej strony.
- Rozliczenie bez zmian merytorycznych: fabryki I–V, surowce (+100 węgiel/ropa/miedź/żelazo, +25 uran), zużycie węgla (50 dla fabryki IV, 100 dla V, brak produkcji IV/V bez węgla), wpis do historii.

## 2. OPL przypisane do regionu

- Każdy region ma własną liczbę OPL. Zakup OPL (1 T KR + 750 miedzi) wymaga wskazania regionu.
- Istniejące OPL państw zostają przeniesione do pierwszego regionu danego państwa, żeby nikt nic nie stracił.
- Widok państwa i regionów pokazuje OPL per region oraz sumę krajową.

## 3. Rakiety, obrona i salwy

- Obrona liczona wyłącznie z OPL atakowanego regionu: Rakieta I wymaga 1 OPL, II — 2 OPL, III — 10 OPL.
- Wystarczające OPL: przechwycenie i zużycie dokładnie wymaganej liczby OPL w tym regionie.
- Za małe OPL: żadne OPL nie jest zużywane, rakieta trafia i niszczy cele. Bez częściowego przechwycenia.
- Rakieta zużywa się zawsze.
- Tryb salwy: podanie liczby rakiet (np. 20), podsumowanie łącznego kosztu, a w backendzie każda rakieta rozpatrywana osobno wobec aktualnego stanu OPL (OPL topnieje w trakcie salwy).
- Nowy przebieg wystrzelenia: rakieta → państwo → region → cele → podsumowanie z wymaganym OPL → potwierdzenie → animowana sekwencja trajektorii HUD → wynik PRZECHWYCONA / TRAFIENIE.
- Wpis operacyjny u obrońcy i atakującego w profesjonalnym stylu RP, bez emoji.

## 4. Ranking publiczny

- Ranking dostępny bez logowania (osobny, publiczny adres), tylko do odczytu, bez tworzenia konta ani państwa.
- Dwie kategorie: Największe zarobki (dochód dzienny) oraz Potencjał głosów.
- Potencjał głosów = pakiety żołnierzy (500 tys.) + pakiety czołgów (50 szt.), bez limitu 10 w rankingu.
- Top 3 jako karty RANK 01 / RANK 02 / RANK 03, dalej lista.

## 5. Regiony i sloty

- Wskaźnik „SLOTY X / 9” z podziałem zajęte/wolne, wyróżnieniem fortyfikacji, fabryk i zakładów surowcowych oraz licznikiem OPL regionu.
- Zasady bez zmian: 9 slotów, max 1 fortyfikacja, max 3 zakłady jednego surowca, jeden typ surowca na region.

## 6. Historia operacji

- Domyślnie 10 ostatnich wpisów + „Pokaż pełną historię”.
- Grupowanie tygodniowe, łączenie powtórzeń („Fabryka I x4”), filtry: Wszystkie, Ekonomia, Budynki, Wojsko, Rakiety, OPL, Surowce, Administracja + zakres dat.

## 7. Strona główna, logowanie i wylogowanie

- Strona startowa dla niezalogowanych: „NOWY UŻYTKOWNIK? ZAREJESTRUJ SIĘ”, „MASZ JUŻ KONTO? ZALOGUJ SIĘ”, „RANKING”.
- „WYLOGUJ SIĘ” z okienkiem potwierdzenia, czyszczeniem stanu i przekierowaniem; strony chronione niedostępne po wylogowaniu.

## 8. Redesign UI (poza panelem admina)

- Sci-Fi Military HUD: głęboki granat, czyste złoto, jasny błękit jako informacja; półprzezroczyste panele, techniczne narożniki, subtelna siatka taktyczna.
- Zero emoji w interfejsie — wyłącznie spójne ikony line-art; nazwy państw jako zwykły tekst, bez flag emoji.
- Pełna responsywność mobile/tablet/desktop, brak poziomego przewijania strony.

## Szczegóły techniczne

- Migracja dodająca: `regions.aa_defense` (default 0) + backfill z `countries.aa_defense` do pierwszego regionu; `region_slots`/`countries` bez zmian struktury. `countries.aa_defense` zostaje w bazie (zgodność z panelem admina) i będzie utrzymywane jako suma OPL regionów.
- Nowe kolumny w `missile_strikes` na potrzeby salwy i OPL regionu (`region_aa`, `required_aa`, `salvo_index`) — dodawane jako nullable.
- `purchase_unit` rozszerzone o opcjonalny `p_region_id` dla OPL; `launch_missile` przeliczone na OPL regionu; nowe `launch_salvo(p_count)` wykonujące atomową pętlę.
- `run_daily_economy` bez zmian logiki; harmonogram `cron.job` przestawiony na `0 * * * *` z warunkiem `extract(hour from now() at time zone 'Europe/Warsaw') = 20` i istniejącą idempotencją po `run_date`.
- Publiczny ranking: nowa trasa `/ranking-publiczny` (SSR) czytająca `country_stats` przez politykę SELECT dla `anon`, z projekcją tylko bezpiecznych kolumn; dotychczasowy `/ranking` w aplikacji zostaje.
- Widok `country_stats` rozszerzony o `vote_potential` (bez limitu) i `region_aa_total`; istniejące kolumny zachowane, żeby panel admina działał bez zmian.
- Pliki frontendu: `src/routes/index.tsx`, `src/routes/auth.tsx`, `src/routes/_authenticated/{panstwo,regiony,arsenal,sklep,ranking,swiat,swiat.$id}.tsx`, `src/components/AppShell.tsx`, `src/lib/api.ts`, `src/lib/format.ts`, `src/styles.css`. `src/routes/_authenticated/admin.tsx` nie jest modyfikowany.
