"""Voedingswaarden per portie voor Kook.

Gebruik:
  python -I tools/nutri.py           # alle recepten in index.html bijwerken
  python -I tools/nutri.py --check   # alleen rapporteren, niets schrijven

Ingrediënten staan in tools/nutri_table.json als:
  naam: [kcal per 100 g, eiwit per 100 g, gram per stuk|null, gram per el|null]
Ontbrekende namen worden gerapporteerd; voeg die toe aan de tabel en draai opnieuw.
Per portie = totaal / basePersons (of 1 als het recept geen basePersons heeft),
omdat de hoeveelheden in een recept gelden voor het basisaantal personen.
"""
import json, re, sys, os

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
INDEX = os.path.join(ROOT, 'index.html')
TABLE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'nutri_table.json')

# standaardgewicht in gram per eenheid (gebruikt als de tabel niets specifieks heeft)
UNIT_G = {
    'g': 1, 'kg': 1000, 'ml': 1, 'l': 1000,
    'el': 15, 'tl': 5, 'teen': 5, 'snuf': 0.5, 'bosje': 20, 'handvol': 25,
    'takje': 1, 'cm': 5, 'plak': 25, 'snee': 30, 'sneden': 30, 'blad': 2,
    'stengel': 40, 'krop': 350, 'filet': 150, 'bol': 125, 'stronk': 150,
    'partje': 20, 'klontje': 10, 'lepel': 15, 'grote soeplepels': 15,
    'fles': 750, 'glas': 200, 'zak': 250, 'vel': 2, 'kleine': 100,
}
STUK_DEFAULT = 100  # als "stuk" en de tabel geen gewicht geeft
MAX_KCAL = 1800     # boven deze waarde per portie is de berekening onbetrouwbaar
MAX_PROT = 110
SMALL_G = 7.5       # vage hoeveelheid (naar smaak, een scheut)

def load_table():
    with open(TABLE, encoding='utf-8') as f:
        return json.load(f)

def grams(qty, unit, name, table):
    """Gram voor een hoeveelheid; None als het niet te bepalen is."""
    entry = table.get(name)
    if unit in ('g', 'kg', 'ml', 'l'):
        return qty * UNIT_G[unit]
    if unit == 'el' and entry and entry[3]:
        return qty * entry[3]
    if unit in ('stuk', '', 'citroen') or unit not in UNIT_G:
        per = entry[2] if entry and entry[2] else STUK_DEFAULT
        return qty * per
    return qty * UNIT_G[unit]

def portion(r, table):
    """(kcal, eiwit, ontbrekende namen) per portie, of None als er niets te berekenen is."""
    kcal = prot = 0.0
    missing = []
    for name, qty, unit in r['ingredients']:
        entry = table.get(name)
        if not entry:
            missing.append(name)
            continue
        try:
            q = float(str(qty).replace(',', '.'))
            g = grams(q, unit, name, table)
        except (ValueError, TypeError):
            g = SMALL_G  # 'naar smaak', 'een scheut', leeg: kleine hoeveelheid
        if g is None:
            missing.append(name + ' (eenheid?)')
            continue
        if ('frituur' in name or 'frituren' in name) and entry[0] >= 800:
            g *= 0.15  # frituurolie blijft grotendeels in de pan
        kcal += entry[0] * g / 100
        prot += entry[1] * g / 100
    persons = r.get('basePersons') or 1
    return kcal / persons, prot / persons, missing

def main():
    check = '--check' in sys.argv
    table = load_table()
    h = open(INDEX, encoding='utf-8').read()
    m = re.search(r'const R=(\[.*?\]);', h, re.S)
    R = json.loads(m.group(1))
    done = 0
    gaps = {}
    onbetrouwbaar = []
    for r in R:
        k, p, missing = portion(r, table)
        for n in missing:
            gaps[n] = gaps.get(n, 0) + 1
        if missing:
            r.pop('nutri', None)  # niet tonen als niet alles bekend is
            continue
        if k > MAX_KCAL or p > MAX_PROT:
            r.pop('nutri', None)  # onmogelijk hoog: liever niets tonen
            onbetrouwbaar.append((r['id'], r['name'][:50], int(k), int(p)))
            continue
        r['nutri'] = {'kcal': int(round(k / 5.0) * 5), 'prot': int(round(p))}
        done += 1
    print(f'recepten met voedingswaarden: {done} van {len(R)}')
    if onbetrouwbaar:
        print(f'onbetrouwbaar (niet getoond, {len(onbetrouwbaar)}):')
        for x in onbetrouwbaar: print('  ', x)
    if gaps:
        print(f'ontbrekende ingrediënten ({len(gaps)}):')
        for n, c in sorted(gaps.items(), key=lambda x: -x[1])[:50]:
            print(f'  {c:4d}x {n}')
    if check:
        return
    new = 'const R=' + json.dumps(R, ensure_ascii=False, separators=(',', ':')) + ';'
    h = h[:m.start()] + new + h[m.end():]
    with open(INDEX, 'w', encoding='utf-8') as f:
        f.write(h)
    print('index.html bijgewerkt')

if __name__ == '__main__':
    main()
