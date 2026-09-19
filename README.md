# Nation Dynamics

Zbuduj kompletną, mobilną aplikację webową po polsku do zarządzania państwami i ekonomią w roleplayu państwowym (WhatsApp Country Roleplay).

Główne wymagania:
1. Interfejs i styl:
- Język polski, projekt mobile-first (bottom navigation na telefonach, responsywne karty, czytelne formatowanie dużych liczb z odstępami np. "1 500 000 000 000 KR").
- Nowoczesny, profesjonalny i elegancki styl geostrategiczny / dashboard rządowy (ciemny motyw, bez kiczowatego neonu czy arkuszowego CRUD).

2. Autoryzacja i role (Supabase Auth + RLS):
- Trzy role: PLAYER, ADMIN, MAIN_ADMIN.
- Bezpieczeństwo i walidacja po stronie bazy (funkcje PostgreSQL / RPC, transakcje atomowe). Gracz widzi wszystkie kraje, ale modyfikuje wyłącznie przypisany własny kraj.
- ADMIN edytuje parametry dowolnego kraju, zarządza regionami, historią i sklepem.
- MAIN_ADMIN zarządza również kontami i uprawnieniami administratorów.

3. Państwa i surowce:
- Startowe saldo: 1 500 000 000 000 KR (1,5 bln KR, typ NUMERIC/BIGINT).
- 5 surowców: Węgiel (coal), Ropa (oil), Miedź (copper), Żelazo (iron), Uran (uranium).
- Wojsko i obrona: OPL (obrona przeciwlotnicza, bez limitu slotów), Rakiety I-III w ekwipunku, Żołnierze (pakiety po 500 tys., +1 głos wojenny, max +6), Czołgi (pakiety po 50 szt., +1 głos wojenny, max +4).

4. Regiony i sloty:
- Każdy region ma 9 slotów.
- Zasada wytwórni surowców: w jednym regionie mogą stać wytwórnie tylko jednego surowca (max 3 sztuki na region).
- Fortyfikacje I-III (max 1 na region, zajmuje 1 slot).
- Fabryki I-V (zajmują po 1 slocie).
- OPL, rakiety, żołnierze i czołgi nie zajmują slotów w regionie.

5. Fabryki i wytwórnie:
- Fabryki I (150 mld KR, +20 mld KR/d), II (300 mld KR, +50 mld KR/d), III (600 mld KR, +80 mld KR/d), IV (1,5 bln KR, +150 mld KR/d, -50 węgla/d), V (3,5 bln KR, +250 mld KR/d, -100 węgla/d). Brak węgla = brak produkcji dla fabryki IV/V w danym cyklu.
- Wytwórnie węgla, ropy, miedzi, żelaza: koszt 300 mld KR, produkcja +100/dzień.
- Wytwórnia uranu: koszt 3 bln KR, produkcja +25/dzień.

6. Ekonomia dobowa i historia:
- Cykl dobowy (o godz. 20:00 lub wyzwalany ręcznie/automatycznie bez dublowania) przeliczający produkcję i zużycie węgla, rejestrujący logi audytowe/transakcyjne.
- Pełna historia transakcji i akcji administracyjnych.

7. Sklep (Shop):
- Karty produktów z kosztami KR i surowców, okno potwierdzenia z podsumowaniem i atomowym zakupem z walidacją po stronie serwera.

8. Podstrony i nawigacja:
- Pulpit gracza ("Moje państwo") z saldem, przychodem, kartami surowców, wojska i regionów.
- Przeglądarka państw ("Świat / Państwa") ze szczegółowym podglądem każdego kraju (tylko do odczytu dla obcych państw).
- Widok regionów z wizualizacją 9 slotów i blokadą błędnych kombinacji.
- Ranking państw sortowany według produkcji KR i wartości militarnej.
- Panel Administratora i Głównego Administratora do ręcznych korekt, zarządzania graczami i rolami.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://krajeinformatyka.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/aaff7254-ff04-4b16-9676-22ae61956297).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
