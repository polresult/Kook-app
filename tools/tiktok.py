"""TikTok-kookfilmpjes analyseren en als recept in Kook zetten.

Gebruik (vanuit de projectmap):
  python tools/tiktok.py setup              # eenmalig: eigen omgeving met yt-dlp, ffmpeg, spraakherkenning
  python tools/tiktok.py pending            # links die in de app zijn doorgegeven en nog niet verwerkt zijn
  python tools/tiktok.py fetch URL [URL..]  # video ophalen: bijschrift, beelden, gesproken tekst
  python tools/tiktok.py add recept.json [..]   # recept + foto in index.html, versie omhoog
  python tools/tiktok.py skip URL "reden"   # link afwijzen (geen recept); de app toont de reden

Werkwijze per filmpje:
  1. fetch zet alles in .tiktok-work/<video-id>/: caption.txt (bijschrift), transcript.txt
     (gesproken tekst met tijden), sheet_*.jpg (overzicht van beelden met tijden), analysis.json.
  2. Lees bijschrift en transcript, bekijk de overzichtsbeelden (tekst in beeld, ingrediënten,
     hoeveelheden) en schrijf het recept in eigen woorden als recept.json (voorbeeld hieronder).
     Kies bij "frame" de seconde waarop het gerecht het mooist in beeld is, zonder handen.
  3. add zet het recept in index.html, maakt photos/tiktok-<id>.webp, rekent de voedingswaarden
     uit en verhoogt de versie. Daarna: tests draaien, committen, pushen.

recept.json:
  {"url": "https://www.tiktok.com/@naam/video/123", "via": "<doorgegeven link, als die anders was>",
   "name": "...", "type": "Vlees|Vis|Vegetarisch", "course": "voor|hoofd|na|basis", "basic": "Sauzen|Dressings & olie|Dips & smeersels|Deeg & brood|Pasta|Ingelegd & conserven|Zoet & ontbijt" (alleen bij basisrecepten), "time": 25,
   "emoji": "🍝", "cuisine": "Italiaans", "basePersons": 2, "portionsEstimated": true,
   "ingredients": [["pasta", 200, "g"], ["zout", null, ""]], "estimatedIngredients": ["pasta"],
   "steps": ["...", "..."], "frame": 31.5, "crop": [0, 0.1, 1, 0.9]}
  "crop" is optioneel: [links, boven, rechts, onder] als deel van het beeld (0..1).
  "estimatedIngredients": namen waarvan de hoeveelheid niet in het filmpje staat maar geschat is.
"""
import json, os, re, subprocess, sys, datetime, urllib.request

os.environ.setdefault('HF_HUB_DISABLE_SYMLINKS_WARNING', '1')

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
INDEX = os.path.join(ROOT, 'index.html')
WORK = os.path.join(ROOT, '.tiktok-work')
VENV = os.path.join(os.path.dirname(os.path.abspath(__file__)), '.venv-tiktok')
VENV_PY = os.path.join(VENV, 'Scripts' if os.name == 'nt' else 'bin', 'python.exe' if os.name == 'nt' else 'python')
BATCH = os.path.join(ROOT, 'TIKTOK-BATCH.json')
LIVE = 'https://kook.up.railway.app'
FIRST_ID = 3000  # TikTok-recepten krijgen id's vanaf 3000
PACKAGES = ['yt-dlp[default,curl-cffi]', 'imageio-ffmpeg', 'pillow', 'faster-whisper']
TYPES = {'Vlees', 'Vis', 'Vegetarisch'}
COURSES = {'voor', 'hoofd', 'na', 'basis'}

def out(*a):
    sys.stdout.write(' '.join(str(x) for x in a) + '\n')

def video_id(url):
    m = re.search(r'/(?:video|photo)/(\d+)', url or '')
    return m.group(1) if m else ''

# ---------- omgeving ----------
def setup():
    if not os.path.exists(VENV_PY):
        subprocess.check_call([sys.executable, '-m', 'venv', VENV])
    subprocess.check_call([VENV_PY, '-m', 'pip', 'install', '-q', '--upgrade'] + PACKAGES)
    out('klaar: omgeving staat in', VENV)

def ensure_env():
    """Draai verder in de eigen omgeving als de pakketten hier ontbreken."""
    try:
        import yt_dlp, imageio_ffmpeg, PIL  # noqa: F401
        return
    except ImportError:
        pass
    if os.path.exists(VENV_PY) and os.path.normcase(sys.executable) != os.path.normcase(VENV_PY):
        sys.exit(subprocess.call([VENV_PY, os.path.abspath(__file__)] + sys.argv[1:]))
    sys.exit('Pakketten ontbreken. Draai eerst: python tools/tiktok.py setup')

def ffmpeg():
    import imageio_ffmpeg
    return imageio_ffmpeg.get_ffmpeg_exe()

# ---------- index.html ----------
def read_index():
    h = open(INDEX, encoding='utf-8', newline='').read()
    m = re.search(r'const R=(\[.*?\]);', h, re.S)
    return h, m, json.loads(m.group(1))

def write_recipes(h, m, R):
    new = 'const R=' + json.dumps(R, ensure_ascii=False, separators=(',', ':')) + ';'
    return h[:m.start()] + new + h[m.end():]

def read_skips(h):
    m = re.search(r'const TT_SKIP=(\{.*?\});', h)
    return json.loads(m.group(1)) if m else {}

def bump_version(h):
    m = re.search(r'Kook versie (\d+)\.(\d+)\.(\d+)', h)
    old = '.'.join(m.groups())
    new = f'{m.group(1)}.{m.group(2)}.{int(m.group(3)) + 1}'
    h = h.replace('Kook versie ' + old, 'Kook versie ' + new)
    for name, pat in (('sw.js', 'kook-app-v%s'), ('package.json', '"version": "%s"')):
        p = os.path.join(ROOT, name)
        s = open(p, encoding='utf-8', newline='').read()
        if pat % old not in s:
            sys.exit(f'{name}: versie {old} niet gevonden')
        open(p, 'w', encoding='utf-8', newline='').write(s.replace(pat % old, pat % new))
    return h, new

# ---------- pending ----------
def pending():
    req = urllib.request.Request(LIVE + '/api/inbox/pending' + ('?key=' + os.environ['KOOK_INBOX_KEY'] if os.environ.get('KOOK_INBOX_KEY') else ''))
    items = json.load(urllib.request.urlopen(req, timeout=30)).get('items', [])
    h, _, R = read_index()
    done = {video_id(r.get('sourceUrl')) for r in R if r.get('source') == 'TikTok'} | {r.get('via') for r in R if r.get('via')}
    skips = read_skips(h)
    todo = [it for it in items if not ((it.get('videoId') and it['videoId'] in done) or it['url'] in done
                                       or it.get('videoId') in skips or it['url'] in skips)]
    out(f'{len(items)} doorgegeven, {len(todo)} nog te verwerken')
    for it in todo:
        out(' ', it['url'], ('(@' + it['handle'] + ')') if it.get('handle') else '')
    return todo

# ---------- fetch ----------
class _Quiet:
    def debug(self, msg): pass
    def warning(self, msg): pass
    def error(self, msg): pass

def fmt_t(sec):
    return f'{int(sec // 60):02d}:{int(sec % 60):02d}'

def contact_sheets(frames, step, folder):
    from PIL import Image, ImageDraw, ImageFont
    try:
        font = ImageFont.truetype('arial.ttf', 22)
    except OSError:
        font = ImageFont.load_default()
    cols, rows, sheets = 6, 2, []
    for s in range(0, len(frames), cols * rows):
        chunk = frames[s:s + cols * rows]
        ims = [Image.open(f).convert('RGB') for f in chunk]
        w, hh = ims[0].size
        sheet = Image.new('RGB', (cols * w, ((len(chunk) + cols - 1) // cols) * hh), 'white')
        d = ImageDraw.Draw(sheet)
        for k, im in enumerate(ims):
            x, y = (k % cols) * w, (k // cols) * hh
            sheet.paste(im, (x, y))
            label = fmt_t((s + k) * step) + f' ({(s + k) * step:.0f}s)'
            d.rectangle([x, y, x + 150, y + 30], fill='black')
            d.text((x + 5, y + 3), label, fill='white', font=font)
        p = os.path.join(folder, f'sheet_{len(sheets) + 1}.jpg')
        sheet.save(p, quality=85)
        sheets.append(p)
    return sheets

def transcribe(wav, model_name):
    try:
        from faster_whisper import WhisperModel
    except ImportError:
        return None, None
    import wave
    import numpy as np
    # zelf inlezen (16 kHz mono wav van ffmpeg), zodat de audiodecoder van faster-whisper niet nodig is
    with wave.open(wav, 'rb') as w:
        audio = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32) / 32768.0
    if not len(audio):
        return [], None
    model = WhisperModel(model_name, device='cpu', compute_type='int8')
    segments, info = model.transcribe(audio, vad_filter=True)
    lines = [f'[{fmt_t(s.start)}] {s.text.strip()}' for s in segments]
    return lines, info.language

def fetch(url, model_name='small'):
    import yt_dlp
    # Ophalen en downloaden in één sessie. De h265-varianten geven vaak 403; h264 werkt wel,
    # dus probeer die eerst en val terug op de andere.
    info, last = None, None
    for fmt in ('b[vcodec^=h264]', 'download', 'b'):
        opts = {'quiet': True, 'no_warnings': True, 'noprogress': True, 'format': fmt, 'logger': _Quiet(),
                'outtmpl': os.path.join(WORK, '%(id)s', 'video.mp4')}
        try:
            with yt_dlp.YoutubeDL(opts) as ydl:
                info = ydl.extract_info(url, download=True)
            break
        except yt_dlp.utils.DownloadError as e:
            last = e
    if info is None:
        raise last
    vid = str(info['id'])
    folder = os.path.join(WORK, vid)
    os.makedirs(os.path.join(folder, 'frames'), exist_ok=True)
    video = os.path.join(folder, 'video.mp4')
    caption = (info.get('description') or info.get('title') or '').strip()
    open(os.path.join(folder, 'caption.txt'), 'w', encoding='utf-8').write(caption + '\n')
    duration = float(info.get('duration') or 0)
    # hooguit 48 beelden, minstens om de seconde
    step = max(1.0, round(duration / 48 + 0.49)) if duration else 2.0
    for f in os.listdir(os.path.join(folder, 'frames')):
        os.remove(os.path.join(folder, 'frames', f))
    subprocess.run([ffmpeg(), '-loglevel', 'error', '-y', '-i', video, '-vf', f'fps=1/{step},scale=300:-2',
                    os.path.join(folder, 'frames', 'f_%04d.jpg')], check=True)
    frames = sorted(os.path.join(folder, 'frames', f) for f in os.listdir(os.path.join(folder, 'frames')))
    sheets = contact_sheets(frames, step, folder)
    wav = os.path.join(folder, 'audio.wav')
    has_audio = subprocess.run([ffmpeg(), '-loglevel', 'error', '-y', '-i', video, '-vn', '-ac', '1', '-ar', '16000', wav]).returncode == 0
    lines, lang = transcribe(wav, model_name) if has_audio and os.path.exists(wav) else (None, None)
    if lines is not None:
        open(os.path.join(folder, 'transcript.txt'), 'w', encoding='utf-8').write('\n'.join(lines) + '\n')
    handle = info.get('uploader') or ''
    analysis = {
        'url': f'https://www.tiktok.com/@{handle}/video/{vid}' if handle else (info.get('webpage_url') or url),
        'via': url, 'videoId': vid, 'creator': '@' + handle if handle else '', 'duration': duration,
        'frameStep': step, 'sheets': [os.path.relpath(s, ROOT) for s in sheets],
        'language': lang, 'transcript': lines is not None, 'fetchedAt': datetime.date.today().isoformat(),
    }
    json.dump(analysis, open(os.path.join(folder, 'analysis.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    out(f'{vid}  {analysis["creator"]}  {duration:.0f}s  beelden om de {step:.0f}s  taal: {lang or "onbekend"}')
    out('  map:', os.path.relpath(folder, ROOT))
    out('  bijschrift:', len(caption), 'tekens;', 'gesproken tekst:', (str(len(lines)) + ' regels') if lines is not None else 'niet beschikbaar')
    return analysis

# ---------- add ----------
def check_recipe(r, path):
    def need(cond, msg):
        if not cond:
            sys.exit(f'{path}: {msg}')
    need(video_id(r.get('url')), 'url moet een TikTok-videolink met id zijn')
    need(isinstance(r.get('name'), str) and r['name'].strip(), 'name ontbreekt')
    need(r.get('type') in TYPES, 'type moet Vlees, Vis of Vegetarisch zijn')
    need(r.get('course', 'hoofd') in COURSES, 'course moet voor, hoofd, na of basis zijn')
    need(isinstance(r.get('basePersons'), int) and r['basePersons'] > 0, 'basePersons ontbreekt')
    need(isinstance(r.get('ingredients'), list) and len(r['ingredients']) >= 2, 'ingredients ontbreekt')
    for x in r['ingredients']:
        need(isinstance(x, list) and len(x) == 3 and isinstance(x[0], str), f'ingrediënt moet [naam, hoeveelheid, eenheid] zijn: {x}')
    need(isinstance(r.get('steps'), list) and len(r['steps']) >= 2, 'steps ontbreekt')
    need(isinstance(r.get('frame'), (int, float)), 'frame (seconde voor de foto) ontbreekt')

def make_photo(vid, second, crop, dest):
    from PIL import Image
    video = os.path.join(WORK, vid, 'video.mp4')
    if not os.path.exists(video):
        sys.exit(f'video ontbreekt, draai eerst: python tools/tiktok.py fetch <url> ({vid})')
    png = os.path.join(WORK, vid, 'photo.png')
    subprocess.run([ffmpeg(), '-loglevel', 'error', '-y', '-ss', str(second), '-i', video, '-frames:v', '1', png], check=True)
    im = Image.open(png).convert('RGB')
    if crop:
        w, hh = im.size
        im = im.crop((int(crop[0] * w), int(crop[1] * hh), int(crop[2] * w), int(crop[3] * hh)))
    if im.width > 900:
        im = im.resize((900, round(im.height * 900 / im.width)))
    im.save(dest, 'WEBP', quality=82)

def add(paths, bump=True):
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    import nutri
    h, m, R = read_index()
    table = nutri.load_table()
    batch = json.load(open(BATCH, encoding='utf-8')) if os.path.exists(BATCH) else {'recipes': []}
    next_id = max([FIRST_ID - 1] + [r['id'] for r in R]) + 1
    added = []
    for path in paths:
        src = json.load(open(path, encoding='utf-8'))
        check_recipe(src, path)
        vid = video_id(src['url'])
        if any(r.get('source') == 'TikTok' and video_id(r.get('sourceUrl')) == vid for r in R):
            out(f'{path}: dit filmpje staat al in de app, overgeslagen')
            continue
        rid, next_id = next_id, next_id + 1
        photo = f'photos/tiktok-{rid}.webp'
        make_photo(vid, src['frame'], src.get('crop'), os.path.join(ROOT, photo))
        handle = re.search(r'/@([^/]+)/', src['url'])
        r = {'id': rid, 'name': src['name'].strip(), 'type': src['type'], 'time': src.get('time'),
             'emoji': src.get('emoji') or '🍽️', 'cuisine': src.get('cuisine') or '', 'source': 'TikTok',
             'sourceUrl': src['url'], 'creator': src.get('creator') or ('@' + handle.group(1) if handle else ''),
             'basePersons': src['basePersons'], 'ingredients': src['ingredients'], 'steps': src['steps'],
             'photo': photo, 'screenshotTimeSeconds': src['frame']}
        for k in ('course', 'basic', 'season', 'timeNote', 'portionsEstimated', 'estimatedIngredients', 'via'):
            if src.get(k) not in (None, '', []) and not (k == 'course' and src[k] == 'hoofd') and not (k == 'via' and src[k] == src['url']):
                r[k] = src[k]
        _, _, missing = nutri.portion(r, table)
        if missing:
            out(f'  let op: geen voedingswaarden, ontbreekt in tools/nutri_table.json: {", ".join(sorted(set(missing)))}')
        R.append(r)
        batch['recipes'].append({'id': rid, 'name': r['name'], 'sourceUrl': r['sourceUrl'], 'creator': r['creator'],
                                 'photo': photo, 'frameSeconds': src['frame'], 'addedAt': datetime.date.today().isoformat()})
        added.append(r)
        out(f'toegevoegd: {rid} {r["name"]} ({r["creator"]})')
    if not added:
        return
    h = write_recipes(h, m, R)
    version = None
    if bump:
        h, version = bump_version(h)
    open(INDEX, 'w', encoding='utf-8', newline='').write(h)
    batch['count'] = len(batch['recipes'])
    json.dump(batch, open(BATCH, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    res = subprocess.run([sys.executable, '-X', 'utf8', '-I', os.path.join(ROOT, 'tools', 'nutri.py')], capture_output=True, text=True, encoding='utf-8', errors='replace')
    out('voedingswaarden:', ((res.stdout or '').splitlines() or ['mislukt: ' + (res.stderr or '')[-200:]])[0])
    out(f'{len(added)} recept(en) toegevoegd' + (f', versie {version}' if version else '') + '. Nu: tests draaien, committen en pushen.')

# ---------- skip ----------
def skip(url, reason):
    h, _, _ = read_index()
    skips = read_skips(h)
    skips[video_id(url) or url] = reason
    new = 'const TT_SKIP=' + json.dumps(skips, ensure_ascii=False, separators=(',', ':')) + ';'
    if not re.search(r'const TT_SKIP=\{.*?\};', h):
        sys.exit('const TT_SKIP ontbreekt in index.html')
    h = re.sub(r'const TT_SKIP=\{.*?\};', lambda _: new, h, count=1)
    open(INDEX, 'w', encoding='utf-8', newline='').write(h)
    out('afgewezen:', url, '-', reason, '(versie nog niet verhoogd)')

def main():
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    args = sys.argv[1:]
    cmd = args[0] if args else ''
    if cmd == 'setup':
        return setup()
    if cmd == 'pending':
        return pending()
    if cmd == 'skip' and len(args) == 3:
        return skip(args[1], args[2])
    if cmd == 'fetch' and len(args) > 1:
        ensure_env()
        model = 'small'
        urls = [a for a in args[1:] if not a.startswith('--model=')]
        for a in args[1:]:
            if a.startswith('--model='):
                model = a.split('=', 1)[1]
        failed = 0
        for u in urls:
            try:
                fetch(u, model)
            except Exception as e:  # één kapotte link mag de rest niet tegenhouden
                failed += 1
                out(f'MISLUKT {u}: {str(e)[:300]}')
        return sys.exit(1 if failed else 0)
    if cmd == 'add' and len(args) > 1:
        ensure_env()
        return add([a for a in args[1:] if a != '--no-bump'], bump='--no-bump' not in args)
    sys.exit(__doc__)

if __name__ == '__main__':
    main()
