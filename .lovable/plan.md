# COUNTRY RP — UPDATE v2.0

Wszystkie obecne państwa, gracze, regiony, budynki i historia zostają nietknięte. Zmiany są dodatkowe.

## 1. Rakiety i obrona OPL

Nowy ekran "Arsenał" (w dolnej nawigacji) z przyciskiem **WYSTRZEL RAKIETĘ** i kreatorem w kilku krokach:

1. Wybór rakiety z ekwipunku (I / II / III) — widoczna liczba posiadanych sztuk.
2. Wybór obcego państwa (własne zablokowane).
3. Wybór regionu celu.
4. Wybór celu: Rakieta I — 1 budynek, Rakieta II — 2 budynki, Rakieta III — "wszystkie fabryki" albo "wszystkie wytwórnie surowców" w regionie.
5. Ekran potwierdzenia z podsumowaniem: cel, liczba budynków, OPL obrońcy, ostrzeżenie o nieodwracalności.

Zasady rozstrzygania (progowo, bez losowości):
- Rakieta I przechwycona, gdy obrońca ma co najmniej 1 OPL.
- Rakieta II — co najmniej 2 OPL.
- Rakieta III — co najmniej 10 OPL.
- OPL nigdy się nie zużywa; rakieta zużywa się zawsze — także po przechwyceniu.
- Po nieudanej obronie wybrane budynki są usuwane, sloty zwolnione i można je odbudować za pełną cenę.

Historia:
- Nowy dziennik operacji rakietowych: atakujący, obrońca, region, typ rakiety, wynik (PRZECHWYCONA / CEL ZNISZCZONY), lista zniszczonych budynków, data.
- Wpis pojawia się w historii obu państw — obrońca widzi u siebie informację o ataku i stracie.
- Każdy gracz może strzelać od razu, bez zgody administratora.

## 2. Naprawa zakupu wielu sztuk

- Pole ilości: domyślnie 1, swobodne wpisywanie dowolnej liczby (9, 20, 99, 100), walidacja minimum 1.
- Koszt KR i każdego surowca przeliczany na żywo (cena × ilość).
- Wiersz każdego wymaganego surowca pokazuje stan wobec potrzeby, np. `MIEDŹ 0 / 750` na czerwono przy braku.
- Przycisk zakupu zablokowany przy niedoborze KR lub surowców, z listą braków; ta sama walidacja obowiązuje po stronie serwera, więc obejście z przeglądarki jest niemożliwe.

## 3. Sklep zarządzany przez administratora

- Ceny, surowce, efekty i limity pozostają w jednej centralnej tabeli — interfejs i walidacja czerpią wyłącznie z niej, żadnych cen wpisanych na sztywno w ekranach.
- Nowa zakładka "Sklep" w panelu administratora: dodawanie produktu, edycja ceny KR, kosztów surowców, przychodu, produkcji i limitów, ukrywanie produktu bez usuwania danych (wyłączony produkt znika ze sklepu, ale zostaje w historii).
- Weryfikacja i wyrównanie wartości bazowych do specyfikacji: Fabryki I–V (150 mld / 300 mld / 600 mld / 1,5 bln z 50 węgla / 3,5 bln z 100 węgla), wytwórnie (300 mld, +100/doba; uran 3 bln, +25/doba; max 3 na region, jeden typ w regionie), OPL (1 bln + dokładnie 750 miedzi, 0 żelaza), Rakiety (1,5 bln + 1200 ropy / 2,5 bln + 2400 ropy / 10 bln + 500 uranu), Żołnierze (1 bln + 1000 ropy, +1 głos, max 6), Czołgi (1 bln + 1000 żelaza, +1 głos, max 4, razem max 10 głosów), Fortyfikacje I–III (1 bln/200 żelaza, 2,5 bln/400 żelaza, 5 bln/700 żelaza, max 1 na region).

## 4. Przebudowany panel krajów dla administratora

- Lista krajów z wyszukiwarką, filtrowaniem (np. z graczem / bez gracza) i sortowaniem (nazwa, skarbiec, przychód, wartość militarna).
- Karta kraju z zakładkami: Informacje, Finanse, Zasoby, Wojsko, Regiony, Historia.
- Korekty przyciskami +/- oraz wpisaniem wartości; akcje destrukcyjne (usunięcie regionu, wyburzenie, duże odjęcie) za modalem potwierdzenia.
- Pełny dziennik zmian administracyjnych: kto, jaki kraj, jaka operacja, wartość przed i po, data i godzina.
- Ręczne uruchomienie cyklu dobowego za potwierdzeniem, obok licznik odliczający do 20:00 czasu polskiego.
- Filtr ukrywający puste wpisy (0 KR) w dziennikach.

## 5. Redesign: sci-fi military HUD

- Paleta granatowa (#080F1C, #0D1728, #14233A, aktywne #1B2D48) z matowym złotem (#B89B5E, #D4AF37, najważniejsze #F0C75E); sukces #22C55E, koszt/błąd #DC4545, info #38BDF8, szary #475569 dla zer i pustych slotów.
- Subtelne tło taktyczne: siatka współrzędnych, okręgi radarowe, zarys mapy, linie geodezyjne — bez neonu.
- Karty z technicznymi narożnikami HUD, spójne ikony line art, wojskowa hierarchia typograficzna.
- "Moje państwo": kompaktowy dashboard, poziomy pasek zasobów, regiony tylko jako krótki widget z przejściem do ekranu Regiony.
- "Regiony": zwarta lista wierszowa z licznikiem slotów; budowa przez dolną szufladę zamiast siatki 3×3 pustych kafelków.
- Jeden globalny format liczb (tys., mln, mld, bln KR) w całej aplikacji, spójna dolna nawigacja, aplikacja instalowalna na telefonie jako pełnoekranowa (manifest PWA).

## Szczegóły techniczne

- Migracja: tabela `missile_strikes` (attacker_country_id, defender_country_id, region_id, missile_code, result, destroyed jsonb, created_at) + grants i polityki RLS (odczyt dla uczestników i adminów).
- RPC `launch_missile(p_attacker_country_id, p_target_region_id, p_missile_code, p_target_slot_ids, p_mode)` — SECURITY DEFINER, atomowo: `assert_can_manage` na atakującym, blokada ataku na własny kraj, weryfikacja stanu rakiet, `FOR UPDATE` na krajach, próg OPL, dekrement rakiety, usunięcie slotów, wpisy w `missile_strikes` i `transactions` obu krajów.
- Rozszerzenie `purchase_unit`: precyzyjne komunikaty niedoborów (`brak KR`, `brak miedzi: 0/750`) zwracane w `jsonb` zamiast ogólnego błędu; limit qty 1–100 zachowany.
- RPC administracyjne: `admin_upsert_shop_item`, `admin_toggle_shop_item` (MAIN_ADMIN/ADMIN); `admin_adjust_country` loguje `old`/`new` w `admin_actions.details`.
- `shopQuery` przestaje filtrować `active` w panelu admina (osobny `adminShopQuery`), sklep gracza nadal tylko `active = true`.
- Tokeny kolorów w `src/styles.css` przeliczone na oklch; nowe warstwy tła i utility `hud-frame`; komponenty (`AppShell`, `stat.tsx`, wszystkie ekrany) korzystają wyłącznie z tokenów semantycznych.
- Nowy `src/routes/_authenticated/arsenal.tsx`, `public/manifest.webmanifest` + link w `__root.tsx`.
- `src/lib/format.ts`: jeden `fmtKR`/`fmtNum` z progami tys./mln/mld/bln, używany wszędzie.
