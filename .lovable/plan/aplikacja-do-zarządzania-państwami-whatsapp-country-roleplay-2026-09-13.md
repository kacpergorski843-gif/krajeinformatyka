# Aplikacja do zarządzania państwami (WhatsApp Country Roleplay)

Mobilna aplikacja po polsku w ciemnym, "sztabowym" stylu: pulpit własnego państwa, przeglądarka świata, regiony ze slotami, sklep, ranking oraz panele administracyjne.

## Co powstanie

**Wygląd i nawigacja**
- Ciemny motyw geostrategiczny (grafit, stal, akcent chłodnej zieleni/bursztynu), duże liczby z odstępami: `1 500 000 000 000 KR`.
- Dolna nawigacja na telefonie, boczna na większych ekranach: Moje państwo, Świat, Regiony, Sklep, Ranking, Panel (widoczny tylko dla adminów).

**Konta i role**
- Logowanie e-mailem i hasłem.
- Trzy poziomy: gracz, administrator, główny administrator.
- Gracz widzi wszystkie państwa, ale zmienia tylko swoje. Administrator edytuje dowolne państwo, regiony, historię i sklep. Główny administrator dodatkowo nadaje i odbiera uprawnienia.
- Wszystkie zakupy i korekty przechodzą przez sprawdzenie po stronie serwera — nie da się ich obejść z telefonu.

**Państwa**
- Start: 1 500 000 000 000 KR.
- Surowce: węgiel, ropa, miedź, żelazo, uran.
- Wojsko: OPL (bez limitu), rakiety I–III w ekwipunku, żołnierze (paczki 500 tys., +1 głos wojenny, maks. +6), czołgi (paczki 50 szt., +1 głos wojenny, maks. +4).

**Regiony i sloty**
- 9 slotów w regionie, pokazanych jako siatka kafelków z podpowiedzią, co można postawić.
- W jednym regionie tylko jeden rodzaj wytwórni surowca, maks. 3 sztuki.
- Fortyfikacja I–III: maks. 1 na region, zajmuje slot. Fabryki I–V: 1 slot każda.
- OPL, rakiety, żołnierze i czołgi nie zajmują slotów.

**Fabryki i wytwórnie**
- Fabryki: I 150 mld / +20 mld dziennie; II 300 mld / +50 mld; III 600 mld / +80 mld; IV 1,5 bln / +150 mld i −50 węgla; V 3,5 bln / +250 mld i −100 węgla.
- Brak węgla w danym cyklu = fabryki IV i V nie produkują.
- Wytwórnie węgla, ropy, miedzi, żelaza: 300 mld, +100 dziennie. Uran: 3 bln, +25 dziennie.

**Cykl dobowy i historia**
- Rozliczenie o 20:00 (raz na dobę, bez podwójnego naliczenia) oraz przycisk ręcznego uruchomienia dla administratora.
- Pełna historia: przychody, zakupy, korekty administracyjne — z datą, kwotą i autorem.

**Sklep**
- Karty produktów z ceną w KR i surowcach, okno potwierdzenia z podsumowaniem, zakup wykonywany w jednej niepodzielnej operacji.

**Ranking**
- Sortowanie po dziennej produkcji KR oraz po wartości militarnej.

## Szczegóły techniczne

- Lovable Cloud: tabele `profiles`, `user_roles` (osobna tabela ról + funkcja `has_role`), `countries`, `regions`, `region_slots`, `country_military`, `shop_items`, `transactions`, `admin_actions`, `economy_runs`.
- RLS: odczyt państw dla zalogowanych, zapis wyłącznie przez funkcje `SECURITY DEFINER` (`purchase_item`, `build_in_slot`, `run_daily_economy`, `admin_adjust_country`, `set_user_role`) z walidacją limitów slotów, kombinacji wytwórni, salda i surowców w transakcji.
- `run_daily_economy` idempotentna po dacie cyklu w `economy_runs`; wyzwalana przez pg_cron o 20:00 Europe/Warsaw oraz ręcznie przez admina.
- Kwoty jako `NUMERIC(30,0)`, po stronie klienta obsługiwane jako string/BigInt, formatowane wąskimi spacjami.
- Trasy TanStack: `/auth`, `/_authenticated/panstwo`, `/swiat`, `/swiat/$id`, `/_authenticated/regiony`, `/_authenticated/sklep`, `/ranking`, `/_authenticated/admin`, `/_authenticated/admin/uprawnienia`.
- Dane startowe (państwa demo, pozycje sklepu, regiony) w migracji jako INSERT.

## Kolejność pracy

1. Cloud + schemat, RLS, funkcje RPC, dane startowe.
2. Motyw, układ z nawigacją, logowanie i role.
3. Pulpit, świat, szczegóły państwa.
4. Regiony ze slotami i budowaniem.
5. Sklep z potwierdzeniem zakupu.
6. Ranking, historia, panele administracyjne, cykl dobowy.
