# Schermtijd Buddy

Een moderne, kindvriendelijke webapp om de schermtijd van Fay en Benjamin te beheren met een puntensysteem en spaarpot.

## Features
- Dagelijkse startbalans van 18 punten (1 punt = 5 minuten) met automatische dagreset.
- Punten verdienen (lezen, klusjes, rekenen, schaken, bonus) of verliezen (liegen, gemeen, respectloos, niet luisteren, pijn doen).
- Realtime progress bars met aparte visualisatie voor overschot (bonus) en spaarpot-jartje.
- Spaarpot: eindoverschot >18 gaat automatisch naar spaarpot bij dagreset; spaarpot kan tekort aanvullen tot 18.
- Logboek per kind met recente gebeurtenissen en tijdstempel.
- Lokaal opgeslagen in `localStorage`, geen server nodig.

## Snel starten
Open eenvoudig `index.html` in je browser (Edge/Chrome/Firefox).

Of start een eenvoudige server (optioneel):

```pwsh
# in deze map
python -m http.server 8000
# open daarna http://localhost:8000
```

## Gebruik
- Klik op de knoppen om punten toe te voegen/af te trekken.
- "Gebruik spaarpot": vult de dagbalans aan tot maximaal 18, zolang er spaarpunten zijn.
- "Dag reset": verplaatst het overschot (boven 18) naar de spaarpot en zet de dagbalans op 18.
- Logs: wissel tussen tabs voor Fay/Benjamin om hun recente acties te zien.

## Notities
- Negatieve punten gaan niet onder 0 voor een kindvriendelijke ervaring.
- Overschat gedurende de dag blijft zichtbaar als blauw (bonus) en gaat pas bij de dagelijkse reset naar de spaarpot.
- Data blijft lokaal in de browser. Verwijder alles met de knop "Wis data".
