# Nation Dynamics — przebudowa panelu administratora

## Zakres

Przebuduję wyłącznie panel administratora i współdzielone zabezpieczenia układu. Istniejące RPC, reguły gry, role, uprawnienia i dane pozostaną bez zmian.

## Układ panelu

- Dodam górny pasek dowodzenia z trzema KPI: liczba państw, liczba graczy i stan cyklu dobowego z odliczaniem do 20:00 czasu polskiego.
- Uporządkuję główną nawigację do pięciu sekcji: Państwa, Użytkownicy, Sklep / Produkty, Cykl dobowy oraz Historia / Audyt.
- Zarządzanie regionami przeniosę do dashboardu wybranego państwa, aby nie dublować nawigacji.
- Na telefonie zakładki będą przewijane wewnątrz własnego paska; na większych ekranach wykorzystają pełną szerokość.

## Państwa i dashboard kraju

- Lista państw otrzyma czytelny pasek wyszukiwania, filtr właściciela i sortowanie oraz zwarte wiersze z flagą, nazwą, skarbcem, liczbą regionów i statusem przypisania.
- Dashboard kraju będzie responsywnym, szerokim oknem z zakładkami: Informacje, Finanse, Zasoby, Wojsko, Regiony i Historia.
- Informacje pokażą właściciela i pozwolą administratorowi przypisać lub zmienić gracza poprzez istniejącą operację.
- Finanse i zasoby pokażą schemat „Aktualna → Zmiana +/- → Nowa wartość”, zamiast edycji nieopisanej wartości końcowej.
- Wojsko dostanie spójne ikony line-art dla OPL, żołnierzy, czołgów i rakiet.
- Regiony pokażą zajętość 9 slotów, obiekty, fortyfikacje i produkcję; dodawanie i usuwanie regionu pozostanie dostępne z potwierdzeniem operacji destrukcyjnej.
- Historia kraju połączy czytelny podgląd transakcji i operacji rakietowych związanych z tym państwem.

## Sklep, użytkownicy, cykl i audyt

- Sklep otrzyma filtry kategorii i widoczności, wyszukiwarkę, czytelne koszty i efekty oraz bezpieczny, jednokolumnowy formularz na telefonie.
- Użytkownicy otrzymają wyszukiwarkę, status roli i państwa; zmiana roli pozostanie ograniczona do MAIN_ADMIN.
- Cykl dobowy pokaże zbiorczy podgląd produkcji, ostatnie uruchomienie i odliczanie; ręczne uruchomienie zawsze otworzy szczegółowe potwierdzenie.
- Historia otrzyma filtry: Korekty, Budowa, Cykle, Wojsko i Rakiety, z domyślnym ukrywaniem wpisów 0 KR oraz kolorami przychodów i strat.

## Responsywność i styl HUD

- Usunę źródła poziomego przewijania całej strony przez `min-w-0`, elastyczne siatki i ograniczenia szerokości okien.
- Szerokie dane będą przewijać się wyłącznie wewnątrz własnych kart; formularze przejdą do jednej kolumny na telefonach.
- Ujednolicę okna potwierdzeń: bezpieczna szerokość względem ekranu, opis „co / komu / skutek” oraz wyraźne akcje Anuluj i Zatwierdź.
- Zachowam aktualny granatowo-mosiężny HUD, taktyczne tło i semantyczne kolory; dodam spójne stany ładowania, braku danych i błędu.
- Zweryfikuję widok na telefonie, tablecie i desktopie, w tym brak poziomego scrolla strony i poprawność wszystkich głównych operacji administratora.

## Szczegóły techniczne

- Główna przebudowa pozostanie w ekranie administratora, z małymi współdzielonymi poprawkami okien i globalnego zabezpieczenia overflow.
- Dane będą nadal pobierane z obecnych zapytań, a modyfikacje wykonywane wyłącznie przez istniejące RPC.
- Po każdej operacji pozostanie odświeżanie danych; nie zmienię schematu bazy ani zasad autoryzacji.
- Dodam unikalne metadane strony panelu administratora zgodne z obecnym systemem tras.
