# ODRVA-import: gedeeltelijk uitgevoerd

Deze import is **niet compleet**. De inventaris bevat 338 unieke videolinks, terwijl het profiel 340 berichten vermeldt. Dat verschil moet nog worden gecontroleerd. Een link met hetzelfde video-ID onder twee accountnamen is één video.

- 18 receptbijschriften handmatig uitgewerkt: 11 nieuwe recepten, 7 bestaande recepten bijgewerkt. Bestaande ID’s blijven behouden.
- Voor deze 18 recepten zijn hoeveelheden en tijden uitsluitend uit de bijschriften overgenomen. De video’s zijn nog niet volledig bekeken.
- Geen ontbrekende hoeveelheden verzonnen. Bronporties zijn doorgaans onbekend. Alleen de mosselcurry noemt 4 personen en 1 kg mosselen.
- Onbekende hoeveelheden en bronporties verschijnen op de boodschappenlijst als ‘Hoeveelheid controleren’. Bekende bronhoeveelheden blijven zichtbaar. Ze worden niet als nul behandeld en niet automatisch vermenigvuldigd.
- Totale tijd onbekend: niet opnemen in de ≤25 minuten-filter. Deelduur staat in de details.
- Nog 320 inventarisregels inhoudelijk te controleren, waaronder promotionele/niet-kookberichten die nog moeten worden onderscheiden. Alle regels blijven in de audit staan.
- 18 oudere ODRVA-appversies zijn nog niet opnieuw aan de video gekoppeld of gecontroleerd. Hun eerdere notities over aangepaste appversies blijven behouden.

## Duplicaten

Vergeleken op video-ID, gerechtnaam en inhoud. Zes bestaande ODRVA-recepten bijgewerkt in plaats van opnieuw toegevoegd. De bestaande mosselcurry (ID 210) hergebruikt. Vergelijkbare algemene apprecepten met een andere bereidingswijze blijven afzonderlijke varianten. Geen nieuwe dubbele video-ID’s of recept-ID’s.

## Validatie

`node tests/odrva.cjs`: bronporties, ontbrekende hoeveelheden, behoud bronhoeveelheden, snel-filter, details, terug naar Mijn week, meer dan zeven gerechten, gemengde boodschappenlijst en unieke ID’s.

## Open werk

Alle video’s volledig bekijken; beeldtekst/genoemde hoeveelheden vergelijken met bijschriften; onbekende gerechten aanvullen; niet-kookvideo’s classificeren; het verschil tussen 338 links en 340 profielberichten controleren; resterende recepten toevoegen en opnieuw op duplicaten controleren.
