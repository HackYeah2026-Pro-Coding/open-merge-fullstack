# Demo: flow na repo `fair-split`

Jedno repo z jednym bugiem, które przechodzi całą ścieżkę produktu: bounty → blokada środków → PR → AI review → merge → wypłata. Reszta dashboardu (inne repo i bounty) to tło, żeby aplikacja wyglądała na używaną.

**Historia:** funkcja `splitBill` dzieli rachunek między znajomych i gubi grosze (100 zł na troje to 3 × 33,33 = 99,99). Pierwsza poprawka programisty (`Math.ceil`) przechodzi CI, ale reviewerzy ją odrzucają, bo teraz suma jest za duża. Druga poprawka rozdaje resztę po groszu pierwszym osobom i jest zatwierdzona.

Wszystko robią komendy `pnpm demo:*` (kod w `apps/api/scripts/demo/`). Komenda `pnpm demo:status` zawsze pisze, co zrobić dalej.

## Co jest w tym folderze

| Plik | Do czego |
|---|---|
| `scenario.json` | nazwa repo, tytuł, etykiety i nagroda bounty, tytuł PR-a, nazwy tagów |
| `issue.md` | treść issue (wklejasz do formularza „New bounty") |
| `pull-request.md` | treść PR-a; `{{issueNumber}}` podstawia skrypt |
| `repo/base`, `repo/v1`, `repo/v2` | kod repo w trzech stanach: z bugiem (main), pierwsza poprawka, druga poprawka |
| `filler.json` | dodatkowe repo i bounty na dashboard |

## Prezentacja na żywo przed jury

Dwa repo z tym samym kodem i tym samym bugiem:

- **`fair-split`** jest świeże przy każdym take'u. Na żywo organizator dodaje je do aplikacji i tworzy bounty, a programista otwiera PR. AI review zaczyna się ładować.
- **`fair-split-twin`** (bliźniak) ma ten sam bounty i ten sam PR. PR otwieracie ręcznie przed pokazem, więc review jest gotowe, zanim zacznie się prezentacja. Nie czekacie na review na żywo, tylko przechodzicie do bliźniaka i na nim robicie merge i wypłatę.

### Jednorazowo

1. Tokeny w `.env`:
   - `DEMO_ADMIN_TOKEN`: classic PAT z `repo`, `workflow` i **`delete_repo`** (prepare usuwa i tworzy repo od nowa).
   - `DEMO_DEV_TOKEN`: classic PAT z `repo` konta programisty.
   - `GITHUB_TOKEN` (bot API) musi mieć dostęp do **wszystkich repo organizacji**. Odtworzone repo to nowe repo, więc token ograniczony do wybranych repo traci je przy każdym take'u. Bez tego „Add repository" go nie pokaże, a bounty skończy się błędem 403.
2. Webhooki **na organizacji** (na repo zniknęłyby razem z repo): `/api/review/webhook` i `/api/merge/webhook-handler`, event „Pull requests".
3. Konto programisty zalogowane w aplikacji przez GitHub, z podpiętym portfelem.
4. Opcjonalnie `pnpm demo:filler` (tło na dashboardzie).

### Przed każdym take'em (próba albo pokaz)

```bash
pnpm demo:prepare --yes
```

API musi działać, bo prepare tworzy bounty bliźniaka przez API. Komenda trwa około minuty. Tworzy oba repo i bounty bliźniaka oraz wypycha branch `fix/split-remainder` z poprawką do obu repo. PR-ów nie otwiera. Na końcu wypisuje linki:

- **Twin PR (open now)**: formularz PR-a bliźniaka z wypełnionym tytułem i opisem `Closes #1`.
- **Twin bounty**: strona bliźniaka w aplikacji. Otwórzcie ją w osobnej karcie.
- **Live PR (on stage)**: formularz PR-a na `fair-split`, dla programisty na scenie.

Potem, jeszcze przed pokazem:

1. Programista otwiera link **Twin PR**, zalogowany na GitHubie swoim kontem, i klika „Create pull request".
2. Czekacie kilka minut, aż strona **Twin bounty** pokaże werdykt Claude i Gemini. Jeśli review skończy się błędem, uruchomcie je ponownie przyciskiem na stronie bounty.

### Take

| # | Kto | Co robi | Co widać |
|---|---|---|---|
| 1 | organizator | Dashboard → **Add repository** → `fair-split` | repo w aplikacji |
| 2 | organizator | **New bounty** na `fair-split`: tytuł, etykiety i treść z `scenario.json` i `issue.md`, 50 OMT | issue #1 na GitHubie, środki zablokowane |
| 3 | | przełączenie na panel programisty | |
| 4 | programista | link **Live PR** → „Create pull request" | PR #2, w aplikacji „In review", review się ładuje |
| 5 | narrator | „Review trwa minutę, tu ten sam PR otwarty wcześniej": karta **Twin bounty** | gotowy werdykt Claude i Gemini, kryteria |
| 6 | organizator | **Merge** PR-a bliźniaka na GitHubie (otwartego przed pokazem) | PR scalony |
| 7 | | | status **Paid**, transakcja, saldo programisty rośnie |

Po próbie wróć do sekcji „Przed każdym take'em".

### Ważne

- **`demo:prepare` usuwa z GitHuba oba repo** (`fair-split` i `fair-split-twin`) razem z ich issues i PR-ami, także z PR-ami robionymi ręcznie.
- **Każdy take blokuje 50 OMT na bounty `fair-split`, którego nikt nie merguje.** Następny prepare kasuje ten bounty, a środki zostają w escrow (adresy w `demo/.orphaned-escrows.json`). Żeby ich nie tracić, po próbie zmerguj też live PR: nagroda trafi wtedy do programisty. Nagroda bliźniaka jest wypłacana przy merge w kroku 6.
- Kod obu repo to `repo/base` (main) i `repo/v2` (poprawka). `repo/v1` jest używane tylko w pełnym take'u poniżej.

## Pełny take na jednym repo

Ta wersja przechodzi wszystko na jednym repo, łącznie z odrzuconą pierwszą poprawką, i czeka na review na żywo.

### Jednorazowe przygotowanie

1. **Tokeny w `.env`** (wzór w `.env.example`):
   - `DEMO_ADMIN_TOKEN`: admin organizacji. Classic PAT z `repo` i `workflow` (repo ma workflow CI) albo fine-grained z Administration, Contents, Issues, Pull requests, Workflows (write).
   - `DEMO_DEV_TOKEN`: PAT konta „programisty", które dostanie wypłatę. Contents i Pull requests (write).
   - `GITHUB_TOKEN` (bot) już jest.
2. **API i web w trybie `http`**: `VITE_API_MODE=http`, API z działającym escrow (`SERVER_WALLET_KEYPAIR_B64` i reszta), portfel serwera ma OMT i SOL.
3. **Webhooki** (najlepiej na całą organizację, wtedy nie trzeba ich ustawiać po utworzeniu repo), event „Pull requests", secret = `GITHUB_WEBHOOK_SECRET`:
   - review: `<API_URL>/api/review/webhook`
   - merge: `<API_URL>/api/merge/webhook-handler` (obsługa wypłaty jest po stronie osoby od blockchaina)
   - lokalnie: `gh webhook forward` na oba adresy.
4. **Konto programisty**: zaloguj się w aplikacji przez GitHub tym kontem i podepnij portfel Phantom. Bez tego wypłata kończy się `no-account` albo `no-wallet`. Wiersze konta i portfela przetrwają każdy reset.
5. `pnpm demo:publish --yes`: tworzy repo `fair-split` w organizacji, wpisuje trzy stany kodu, ustawia tagi `demo-baseline`, `demo-fix-v1`, `demo-fix-v2` i zaprasza konto programisty. **Zaakceptuj zaproszenie** (`https://github.com/<org>/fair-split/invitations`, zalogowany jako programista).
6. `pnpm demo:filler`: dodaje 5 repo i 12 bounty w różnych stanach. Można powtarzać, nic się nie dubluje.
7. **Próba generalna** (raz, a potem po każdej zmianie w `repo/v1` albo `repo/v2`): przejdź cały take poniżej i sprawdź, czy pierwsza poprawka dostaje „Changes requested", a druga jest zielona. Modele nie są deterministyczne. Jeśli v1 zostanie zatwierdzone, pogorsz ją w `repo/v1/src/splitBill.js` i uruchom `pnpm demo:publish --yes` jeszcze raz.

### Za każdym razem (jeden take)

| # | Co robisz | Co widać |
|---|---|---|
| 0 | `pnpm demo:reset --yes` | kończy się „Ready." (kilkanaście sekund) |
| 1 | web: **New bounty**, tytuł, etykiety i treść z `scenario.json` i `issue.md`, nagroda 50 OMT. Zastępnik: `pnpm demo:bounty` | środki zablokowane, issue na GitHubie |
| 2 | `pnpm demo:pr`: tworzy branch `fix/split-remainder` z pierwszą poprawką i otwiera PR z `Closes #N`, jako konto programisty | PR na GitHubie, strona bounty: „In review" |
| 3 | czekasz | check na commicie: pending, potem **Changes requested** (Claude i Gemini) |
| 4 | `pnpm demo:fix` | czeka na koniec review pierwszej poprawki, pushuje drugą |
| 5 | czekasz | nowy review, check **zielony**, pill approve/approve |
| 6 | **Merge** na GitHubie. Zastępnik: `pnpm demo:merge` | PR scalony |
| 7 | czekasz | status **Paid**, transakcja w explorerze, saldo portfela programisty rośnie |

`pnpm demo:status` pokazuje w dowolnym momencie stan GitHuba i bazy oraz „Next: ...". Czasy zależą od CI i modeli: orientacyjnie CI to kilkadziesiąt sekund, a review minuta lub dwie na każdą poprawkę.

## Gdy coś nie działa

| Objaw | Co robić |
|---|---|
| Review nie startuje | GitHub → Settings → Webhooks → Recent deliveries: czy dotarło do API i jaka odpowiedź. PR musi mieć w opisie `Closes #N`. |
| Review kończy się błędem | na stronie bounty przycisk ponownego uruchomienia (tylko dla błędów) |
| Pierwsza poprawka dostała approve | demo traci moment „Changes requested"; pogorsz `repo/v1`, `demo:publish --yes`, `demo:reset --yes` |
| Brakuje czasu na review | `pnpm demo:fix --now` pushuje drugą poprawkę bez czekania |
| `demo:reset` pisze „not clean" | podaje, co zostało (np. issue, które GitHub odrzucił); napraw ręcznie i uruchom jeszcze raz |
| Po merge brak wypłaty | `demo:status`: jeśli „app sees open", aplikacja nie zapisała merge, więc sprawdź dostawę webhooka merge i logi |
| „A bounty already exists" | `pnpm demo:reset --yes` |

## Dodawanie i zmiana treści

- **Nowy mockowy bounty:** dopisz obiekt do `filler.json` i uruchom `pnpm demo:filler`.

  ```json
  { "repo": "tiny-todo", "title": "Show a progress bar per list", "problem": "...", "expected": "...",
    "criteria": ["...", "..."], "reward": 40, "labels": ["feature"],
    "state": "in_review", "author": "devon-ray", "ageDays": 3 }
  ```

  Stany: `open`, `in_review`, `in_review_split` (reviewerzy się nie zgadzają), `payout_held` (autor bez portfela), `paid` (autor z portfelem), `closed`. Autorzy i walidacja są w `filler.json`, błędy (np. nieznany autor) wypisuje `pnpm demo:filler`.
- **Inna treść issue lub nagroda:** `scenario.json` i `issue.md`. Treść nie może zawierać obrazków ani list zadań (`- [ ]`): wbudowany renderer Markdown w aplikacji ich nie obsługuje.
- **Inny kod w repo:** pliki w `repo/base|v1|v2`, potem `pnpm demo:publish --yes` i `pnpm demo:reset --yes`. Testy w `pnpm test` pilnują, że baseline i v1 mają zielone CI, a v2 spełnia kryteria z issue.

## Ograniczenia

- **Bounty z `filler.json` nie mają escrow na chainie.** Kafelki „Locked" i „Paid" na dashboardzie sumują też te kwoty, a „paid" nie ma linku do transakcji. W prezentacji nazywajcie to danymi przykładowymi.
- **Każdy take przenosi 50 OMT** z portfela serwera na portfel programisty plus rent za escrow. Odsyłajcie tokeny z portfela programisty na serwer.
- **Take przerwany przed wypłatą:** reset kasuje wiersz bounty, a tokeny zostają zablokowane w escrow. Adresy trafiają do `demo/.orphaned-escrows.json` (plik ignorowany przez git). API nie ma jeszcze `cancel`, więc zwrot wymaga programu escrow.
- Numery issue i PR rosną z każdym take'em, a zamknięte PR-y zostają w zakładce Pull requests repo (GitHub nie pozwala ich usunąć).
- Komendy po stronie GitHuba (`publish`, `reset`, `pr`, `fix`, `merge`) są pokryte testami z atrapą GitHuba, ale pierwszy raz uruchomisz je na prawdziwym GitHubie.
