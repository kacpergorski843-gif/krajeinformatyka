# Zmiany bazy danych

Baza działa w Lovable Cloud. Tylko Lovable ma do niej dane dostępowe — nie istnieje token ani hasło, które można dodać do GitHub Secrets. Dlatego GitHub Actions **nie wdraża** migracji, tylko sprawdza poprawność plików.

## Jak wprowadzać zmiany bazy
- Poproś w czacie Lovable o zmianę (tabela, funkcja, trigger, RLS). Lovable od razu stosuje ją na bazie i zapisuje plik migracji w repozytorium.
- Jeśli plik migracji trafi przez Pull Request spoza Lovable, nie zostanie wykonany automatycznie. Napisz w czacie: „zastosuj migrację <nazwa pliku>”.

## Zasady bezpieczeństwa
- Nie uruchamiaj `supabase db push` — baza nie ma rejestru migracji CLI, więc CLI próbowałoby wykonać wszystkie pliki ponownie.
- Historyczne powtórzone numery (0052, 0057, 0058, 0072, 0073) są tylko ostrzeżeniem; nowe pliki muszą mieć unikalny numer.
- Zmiany kodu aplikacji synchronizują się automatycznie; publikacja przyciskiem „Publish” w Lovable.
