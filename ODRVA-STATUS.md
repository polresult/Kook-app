# ODRVA — status

## Huidige foto- en boodschappencontrole — 5 oktober 2026

De app bevat 351 recepten, waarvan 102 ODRVA-recepten. 101 hebben een gerechtfoto uit de oorspronkelijke video; 26 eerder ontbrekende beelden zijn toegevoegd. De oorspronkelijke Instagram-links zijn teruggevonden voor macaroni met ham en broccoli, burrata met tomaat en ansjovis, spelttagliatelle met herfsttruffel en groene asperges met roodbaars. De exacte bron van recept 268, spaghetti met olijven, kappertjes en witte wijn, blijft open. Een vergelijkbare Instagram-video met tomaat, ansjovis en chili is gecontroleerd en afgewezen als een ander recept.

Alle 101 beelden zijn visueel gecontroleerd op handen en vingers, inclusief beeldranden. 73 beelden zijn geretoucheerd om mensen/vingers en ongewenste video-ondertitels weg te halen. Het oorspronkelijke gerecht blijft de basis; het zijn bewerkte videoframes, geen ongewijzigde screenshots. De overige 28 beelden behouden hun oorspronkelijke opname. Op de opgeschoonde foto's wisselt een app-overlay tussen All organic., Naturally., Pure flavour., Made with love., Simple & fresh. en geen tekst. Bron, frametijd, eventuele LinkedIn-kopie als opnamebron en retoucheerstatus staan in ODRVA-SCREENSHOTS.json en ODRVA-PHOTO-AUDIT.json.

De boodschappenlijst laat water, pastawater en overige kook-/uitlekvochten weg. Sap en rasp van citroen/limoen worden samengevoegd tot de benodigde vrucht, met naar boven afgeronde aantallen op de boodschappenlijst. Sap en rasp binnen één recept gebruiken hetzelfde fruit en worden niet dubbel geteld. Omrekening uit milliliters sap blijft expliciet geschat. Kruiden in grammen blijven grammen.

Cache en zichtbare versie: 4.4.0. De oudere notities hieronder beschrijven eerdere batches.

De drie afgekeurde beelden (300, 266 en 271) zijn verder bewerkt tot close-ups van het gerecht met minder achtergrond en zonder storend bestek. Alle 101 foto-bestanden laden correct in de browser. De drie regressiecontroles slagen. Een product met zowel een bekende als een onbekende hoeveelheid krijgt één boodschappenregel met een melding voor het onbekende extra deel.

Laatste selectie: 50 afzonderlijke kookvideo-bijschriften. 41 nieuwe recepten, 9 bestaande bijgewerkt zonder dubbele invoer. Totaal app: 326 recepten.

Ontbrekende hoeveelheden zijn op verzoek praktisch geschat; bronhoeveelheden blijven apart bewaard. Alleen drie recepten noemen het aantal personen expliciet (2 of 4); de overige gebruiken een als aanname gemarkeerde versie voor 2 personen. Receptdetails en boodschappenlijst tonen schattingen. Bekende deelduren staan vermeld; onbekende totale tijden zijn niet verzonnen.

Op 5 oktober 2026 is de browser gecontroleerd: Instagram werkt en de oorspronkelijke video's zijn zonder aanmelding toegankelijk. Alle 50 recepten hebben nu een visueel gecontroleerd screenshot van het gerecht uit hun oorspronkelijke Instagram-video. Bronlinks, bestandspaden en exacte frametijdstippen staan in ODRVA-SCREENSHOTS.json. De screenshots worden getoond in receptkaarten en receptdetails via de bestaande gedeelde fotofunctie. Er zijn geen vervangende stockfoto's toegevoegd.

De Instagram-bijschriften blijven de basis voor de recepttekst. Het bijschrift van “Bruine bonen met gehakt op aardappelpuree” is opnieuw gecontroleerd: ingrediëntenvolgorde, mosterd, aardappelpuree en circa 20 minuten in de pan zijn al verwerkt. De screenshotcontrole is geen volledige inhoudelijke controle van alle videoinstructies; videoReviewed blijft daarom false. De eerdere volledige inventarisatie is niet voltooid.

Controle: bestaande regressiecontrole voor portieomrekening, onbekende hoeveelheden, bronhoeveelheden, filters, receptdetails, weeknavigatie, boodschappenlijst en unieke ID's geslaagd. Alle 50 screenshotbestanden en hun koppelingen gecontroleerd; alle geselecteerde beelden visueel bekeken. In de browser zijn alle 50 receptdetails geopend: elk screenshot laadt succesvol vanaf het juiste bestand. Toevoegen aan Mijn week is ook gecontroleerd. De serviceworker-cacheversie is verhoogd naar v4.3.2.

Publicatie: de GitHub-code is bijgewerkt; publicatie naar de bestaande Netlify-site is niet bevestigd.

Extra batch: 25 nieuwe unieke recepten met oorspronkelijke Instagram-bijschriften en gerechtbeelden toegevoegd (ODRVA-BATCH-25.json). Totaal app: 351 recepten; totaal ODRVA-screenshots: 75. Geselecteerde beelden inhoudelijk bekeken; volledige videocontrole blijft open. Aanvullende zichtbare ingrediënten verwerkt. Cacheversie v4.3.3.
Controle extra batch: beide regressiecontroles geslaagd; alle 25 nieuwe receptdetails geopend en gerechtbeelden succesvol geladen.
