# Ręczne stosowanie migracji Supabase bez sekretów GitHub

## Co robi workflow

Workflow „Validate Supabase migrations (no secrets)” wykonuje wyłącznie statyczne kontrole plików SQL: sprawdza nazwy i niepuste pliki migracji, wykrywa ponowne użycie numeru wersji przez dodawaną lub zmienianą migrację oraz ostrzega o kolizjach numerów istniejących już w repozytorium.

Nie loguje się do Supabase, nie odczytuje sekretów, nie wykonuje SQL i nie zmienia bazy produkcyjnej. Zielony wynik workflow **nie oznacza**, że migracje zostały zastosowane.

## Jak zastosować nową migrację

1. Zrób kopię zapasową bazy produkcyjnej i sprawdź SQL w pliku migracji.
2. Otwórz właściwy projekt w Supabase Dashboard, przejdź do SQL Editor i uruchom treść nowej migracji w odpowiedniej kolejności.
3. Zweryfikuj działanie zmiany w aplikacji i w bazie.
4. Samo uruchomienie SQL w SQL Editor nie aktualizuje rejestru migracji CLI (`supabase_migrations.schema_migrations`). Jeśli później korzystasz z Supabase CLI, zsynchronizuj historię zgodnie z dokumentacją polecenia `supabase migration repair --status applied <version>`, uruchomionego lokalnie na właściwie podłączonym projekcie.

Nie uruchamiaj `supabase db push` bez sprawdzenia planu migracji i historii produkcyjnej bazy.

## Ważne: istniejące kolizje wersji

W katalogu migracji występują już powtórzone prefiksy: `0052`, `0057`, `0058`, `0072` i `0073`.

Nie zmieniaj numerów tych plików automatycznie. Jeśli część z nich została już zastosowana w produkcji, zwykłe przemianowanie może spowodować ponowne wykonanie SQL albo rozjazd historii. Przed wznowieniem automatycznych wdrożeń trzeba porównać zawartość `supabase_migrations.schema_migrations` w produkcji z plikami repozytorium i przygotować kontrolowaną procedurę naprawy historii.

## Dlaczego nie ma automatycznego wdrożenia

Automatyczne wykonanie migracji na produkcji wymaga uwierzytelnienia i dostępu do bazy. Nie da się tego bezpiecznie zastąpić brakiem sekretów. Ten workflow celowo nie omija autoryzacji ani nie używa kluczy publicznych do operacji administracyjnych.
