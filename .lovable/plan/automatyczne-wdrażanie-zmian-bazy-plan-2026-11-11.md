# Automatyczne wdrażanie zmian bazy — plan

## Co sprawdziłem
- Baza projektu działa w Lovable Cloud. Dostęp do niej mam tylko przez narzędzia Lovable — nie mam tokenu dostępu ani hasła bazy i nie mogę ich uzyskać (w Lovable Cloud nie są udostępniane nikomu).
- Lovable nie ma dostępu do sekretów GitHub — nie mogę ustawić `SUPABASE_ACCESS_TOKEN` ani `SUPABASE_DB_PASSWORD`. Ty też nie możesz ich zdobyć dla tego projektu.
- W bazie nie istnieje rejestr migracji CLI (`supabase_migrations.schema_migrations`). Zmiany były stosowane przez Lovable, nie przez CLI. Dlatego `supabase db push` z GitHub uznałby wszystkie 46 plików za nowe i próbował wykonać je ponownie — to groziłoby uszkodzeniem danych.
- Pliki mają powtórzone numery (0052, 0057, 0058, 0072, 0073) i niestandardowe nazwy (np. `00751_...`), więc CLI i tak by je odrzuciło.

## Wniosek
Wdrażanie migracji z GitHub Actions do tej bazy nie jest możliwe ani bezpieczne. Najprostsza, w pełni automatyczna droga to ta, którą Lovable już zapewnia:
- Zmiany kodu: synchronizacja GitHub ↔ Lovable działa automatycznie; po publikacji (jedno kliknięcie „Publish" lub dalej automatycznie z podglądu) aplikacja jest aktualna.
- Zmiany bazy: proszę mnie w czacie o zmianę — stosuję ją od razu na bazie i zapisuję plik migracji do repozytorium. Bez kopiowania SQL.

## Co zrobię po akceptacji
1. Zmienię workflow `supabase-migrations.yml` na wyłącznie walidację (bez kroku wdrożenia, który i tak nie ma sekretów i byłby niebezpieczny). Zachowam plik i skrypt walidacji.
2. Walidator: istniejące kolizje numerów oznaczę jako ostrzeżenie (historyczne), błąd tylko dla nowych/zmienianych plików — żeby CI był zielony.
3. Zaktualizuję `docs/SUPABASE_MIGRATIONS_MANUAL.md`: jak wprowadzać zmiany bazy przez Lovable i co się stanie, gdy plik migracji przyjdzie z PR (Lovable go nie wykona sam — trzeba napisać w czacie „zastosuj migrację X").
4. Dopiszę regułę w `AGENTS.md`.

Żadne migracje nie zostaną uruchomione, nic nie zostanie usunięte.

## Jedyna czynność po Twojej stronie
Brak — nie musisz dodawać żadnych sekretów. Migracje z PR-ów tworzonych poza Lovable zgłaszaj w czacie jednym zdaniem.
