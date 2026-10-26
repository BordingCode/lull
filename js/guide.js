// ===== Lull — the sleep guide (content only; app.js draws it) =====
// Danish Health Authority (Sundhedsstyrelsen, "SST") advice first, then the
// AAP, NHS and WHO, then research. The research notes behind every line, with
// page numbers and the places Danish advice differs, are in
// docs/guide-research.md. Rules for editing:
//   - every topic lists its sources; add one before adding a claim
//   - no fixed "regression" ages, no hormone claims, no exact sleep-cycle
//     minutes, no schedules to follow — the research doesn't support them
//   - where Denmark and the US/UK disagree, give the Danish advice and say so
// Text is trusted HTML (written here, never user input).

export const CHECKED = 'October 2026';

const S = {
  vd:       { name: 'Sundhedsstyrelsen: Forebyg vuggedød (2023)', url: 'https://www.sst.dk/-/media/Udgivelser/2022/Vuggedød/0222-Forebyg-vuggedoed_til-foraeldre.ashx' },
  vdProf:   { name: 'Sundhedsstyrelsen: Forebyg vuggedød, for professionals (2023)', url: 'https://www.sst.dk/-/media/Udgivelser/2022/Vuggedød/0222-Forebyg-vuggedoed_Sundhedspersonale.ashx' },
  sb:       { name: 'Sundhedsstyrelsen: Sunde børn', url: 'https://www.sst.dk/-/media/Udgivelser/2019/SundeBoern_2019.ashx' },
  sl:       { name: 'Sundhedsstyrelsen: Anbefalinger for søvnlængde (2024)', url: 'https://www.sst.dk/-/media/Udgivelser/2024/Soevn/Anbefalinger-for-soevnlaengde.ashx' },
  seler:    { name: 'Sundhedsstyrelsen: Soveseler (2019)', url: 'https://www.sst.dk/-/media/Udgivelser/2019/Hygiejne-dagtilbud/Anvendelse-af-soveseler-i-dagtilbud_27062019.ashx' },
  akut:     { name: 'Sundhedsstyrelsen: Akut syge spædbørn', url: 'https://www.sst.dk/media/bqmfkfff/akut_syge-d-pdf.pdf' },
  feber:    { name: 'sundhed.dk: Feber hos børn', url: 'https://www.sundhed.dk/borger/patienthaandbogen/boern/sygdomme/infektioner/feber-hos-boern/' },
  nhsFever: { name: 'NHS: Fever in children', url: 'https://www.nhs.uk/conditions/fever-in-children/' },
  nhsMening:{ name: 'NHS: Meningitis', url: 'https://www.nhs.uk/conditions/meningitis/' },
  aap:      { name: 'AAP: A parent\'s guide to safe sleep', url: 'https://www.healthychildren.org/English/ages-stages/baby/sleep/Pages/a-parents-guide-to-safe-sleep.aspx' },
  aap22:    { name: 'AAP safe sleep policy (2022)', url: 'https://doi.org/10.1542/peds.2022-057990' },
  aapApnea: { name: 'AAP: Breathing pauses in babies', url: 'https://www.healthychildren.org/English/ages-stages/baby/sleep/pages/Sleep-Apnea-Detection.aspx' },
  nhsSids:  { name: 'NHS: Reduce the risk of SIDS', url: 'https://www.nhs.uk/baby/caring-for-a-newborn/reduce-the-risk-of-sudden-infant-death-syndrome/' },
  nhsSleep: { name: 'NHS: Helping your baby to sleep', url: 'https://www.nhs.uk/baby/caring-for-a-newborn/helping-your-baby-to-sleep/' },
  lullaby:  { name: 'Lullaby Trust: Room temperature', url: 'https://www.lullabytrust.org.uk/baby-safety/safer-sleep-information/room-temperature/' },
  who:      { name: 'WHO (2019)', url: 'https://www.who.int/news/item/24-04-2019-to-grow-up-healthy-children-need-to-sit-less-and-play-more' },
  hugh:     { name: 'Hugh et al. 2014 (white-noise machines)', url: 'https://pubmed.ncbi.nlm.nih.gov/24590753/' },
  galland:  { name: 'Galland et al. 2012 (normal sleep ranges)', url: 'https://pubmed.ncbi.nlm.nih.gov/21784676/' },
  henderson:{ name: 'Henderson et al. 2010', url: 'https://pubmed.ncbi.nlm.nih.gov/20974775/' },
  pennestri:{ name: 'Pennestri et al. 2018', url: 'https://pubmed.ncbi.nlm.nih.gov/30420470/' },
  brown:    { name: 'Brown & Harries 2015', url: 'https://pubmed.ncbi.nlm.nih.gov/25973527/' },
  weiss:    { name: 'Weissbluth 1995 (naps)', url: 'https://pubmed.ncbi.nlm.nih.gov/7792496/' },
  mindell09:{ name: 'Mindell et al. 2009 (bedtime routine trial)', url: 'https://pubmed.ncbi.nlm.nih.gov/19480226/' },
  mindell15:{ name: 'Mindell et al. 2015 (routines, 13 countries)', url: 'https://pubmed.ncbi.nlm.nih.gov/25325483/' },
  mindell06:{ name: 'Mindell et al. 2006 (review)', url: 'https://pubmed.ncbi.nlm.nih.gov/17068979/' },
  gradisar: { name: 'Gradisar et al. 2016', url: 'https://pubmed.ncbi.nlm.nih.gov/27221288/' },
  price:    { name: 'Price et al. 2012 (5-year follow-up)', url: 'https://pubmed.ncbi.nlm.nih.gov/22966034/' },
  douglas:  { name: 'Douglas & Hill 2013 (under 6 months)', url: 'https://pubmed.ncbi.nlm.nih.gov/24042081/' },
  macknin:  { name: 'Macknin et al. 2000 (teething)', url: 'https://pubmed.ncbi.nlm.nih.gov/10742315/' },
  tourula:  { name: 'Tourula et al. 2010 (outdoor naps)', url: 'https://pubmed.ncbi.nlm.nih.gov/20377534/' },
  harrison: { name: 'Harrison 2004 (daylight)', url: 'https://pubmed.ncbi.nlm.nih.gov/15560769/' },
  grigg:    { name: 'Grigg-Damberger 2016', url: 'https://pubmed.ncbi.nlm.nih.gov/26951412/' },
  pease:    { name: 'Pease et al. 2016 (swaddling)', url: 'https://pubmed.ncbi.nlm.nih.gov/27244847/' },
  liaw:     { name: 'Liaw et al. 2019 (sitting devices)', url: 'https://pubmed.ncbi.nlm.nih.gov/31110162/' },
  canapari: { name: 'Dr Craig Canapari: Wake windows', url: 'https://drcraigcanapari.com/wake-windows' },
  eu:       { name: 'EU summer-time directive', url: 'https://eur-lex.europa.eu/eli/dir/2000/84/oj' },
};

// One entry per age band in science.js BANDS, same order. `total` is the
// Danish Health Authority's recommended sleep per 24 h for that age.
export const AGES = [
  { // 0–4 weeks
    total: '14–17 h',
    summary: 'Newborns sleep in short stretches of 2–4 hours round the clock, and have no day and night yet. Sleep simply follows hunger and fullness — there is nothing to schedule.',
    points: [
      'Feeds come often: at least 8 in 24 hours early on. Once your baby is gaining weight you no longer need to wake them for night feeds.',
      'Some newborns sleep around 16 hours, others nearer 20. Both can be normal.',
      'Sleep often starts in active (REM) sleep, with twitches, noises and fluttering eyes. That is normal at this age.',
    ],
  },
  { // 4–8 weeks
    total: '14–17 h',
    summary: 'Between about 6 weeks and 2 months most babies start telling day from night and sleeping a bit more at night.',
    points: [
      'Stretches of about 3 hours at a time are typical.',
      'Help the body clock along: daylight and normal household sounds by day, dim and quiet at night.',
    ],
  },
  { // 8–12 weeks
    total: '14–17 h',
    summary: 'A 24-hour rhythm is forming. Night sleep grows fastest between 1 and 4 months.',
    points: [
      'By 3 months, about half of babies sleep 8 hours straight or from midnight to 5 — so the other half don\'t, and that is normal too.',
    ],
  },
  { // 12–16 weeks
    total: '14–17 h',
    summary: 'Sleep is maturing towards a more adult-like pattern. Many babies sleep differently for a while around now — it is development, not a step backwards.',
    points: [
      'From about 3–4 months, Sundhedsstyrelsen suggests slowly starting to separate the last feed from falling asleep.',
      'Swaddled? Stop when your baby shows signs of trying to roll.',
    ],
  },
  { // 16–20 weeks
    total: '12–15 h',
    summary: 'Usually 3–4 daytime sleeps, and often a night stretch of 4–5 hours. The rhythm gets steadier.',
    points: [
      'In Danish advice, "sleeping through" at this age means about 5 hours — not the whole night. Breastfed babies often have slightly shorter stretches.',
      'From about 4–5 months: after the bedtime routine, put your baby in bed and stay beside them until they sleep, with a hand on the tummy or a pick-up if they get upset.',
    ],
  },
  { // 20–24 weeks
    total: '12–15 h',
    summary: 'Most babies now nap about three times a day and have a longer stretch at night. Big differences between babies are normal.',
    points: [
      'Night sleep gathers into one main period between about 6 and 9 months — it is still building now.',
    ],
  },
  { // 6–8 months
    total: '12–15 h',
    summary: 'Naps usually move from three towards two during this half-year. Night sleep is becoming one main period.',
    points: [
      'Most babies of 6–12 months still wake at least once a night, and between a quarter and over half don\'t yet sleep 6–8 hours in one go. That is not linked to any problem with development.',
      'Sundhedsstyrelsen says you can try dropping the middle-of-the-night feed from about 6 months, as the baby no longer needs it physically. It is an option, not a deadline — go at your own pace.',
    ],
  },
  { // 8–10 months
    total: '12–15 h',
    summary: 'Two naps a day is typical by 9–12 months. Crawling, standing and being apart from you are big things, and sleep can be unsettled for a while.',
    points: [
      'Night waking is still common at this age, whether a baby is breastfed or bottle-fed.',
      'Practising new skills (like getting down from standing) in the daytime can help at night.',
    ],
  },
  { // 10–12 months
    total: '12–15 h',
    summary: 'Usually two naps. Near the first birthday some babies manage about 6 hours straight at night.',
    points: [
      'A short refusal of the second nap does not have to mean your baby is ready for one nap.',
    ],
  },
  { // 12–18 months
    total: '11–14 h',
    summary: 'One or two naps. From about 1½ years most children have one nap, usually after lunch.',
    points: [
      'Restless periods at night are common, for example when teeth come through, after illness or when daycare starts. They usually pass.',
    ],
  },
  { // 18–24 months
    total: '11–14 h',
    summary: 'Usually one nap a day.',
    points: [
      'A child who seems rested and cheerful in the daytime is getting enough sleep, whatever the clock says.',
    ],
  },
  { // 2 years+
    total: '11–14 h',
    summary: 'One nap for most two-year-olds. Most children stop napping somewhere between 3 and 5 years (from 3 years the guide is 10–13 hours).',
    points: [
      'When the nap goes, your child needs more night sleep — move bedtime earlier.',
    ],
  },
];

export const GROUPS = [
  { id: 'safe', title: 'Safe sleep' },
  { id: 'room', title: 'Sleep environment' },
  { id: 'settle', title: 'Settling and routines' },
  { id: 'problems', title: 'Common sleep worries' },
  { id: 'health', title: 'When to get help' },
];

export const TOPICS = [
  /* ---------------- safe sleep ---------------- */
  {
    id: 'safe-basics', group: 'safe', icon: '🛏️', title: 'The safe-sleep basics',
    intro: 'Since Denmark started these three rules in 1991, cot deaths fell from about 120 a year to about 5 or fewer.',
    tryTitle: 'Every sleep',
    tryThis: [
      '<b>On the back.</b> Lying on the tummy or side raises the risk of cot death a lot. Babies who spit up turn their heads by reflex, and lying on the back does not raise the risk of choking. Once your baby rolls over by themselves — including in their sleep — you can leave them on their tummy.',
      '<b>No smoke.</b> No nicotine in pregnancy (snus included) and no tobacco smoke around the baby after birth. Airing out or the cooker hood doesn\'t remove smoke toxins — smoke outside.',
      '<b>Not too hot.</b> Your baby should never be sweaty when asleep: feel the neck or the front of the chest.',
      '<b>A firm mattress</b> that reaches the edges of the bed, with no pillow, toys, cloth nappies or loose blankets. Place the baby near the foot end of the bed. Cot bars no more than 7 cm apart.',
      '<b>A light baby duvet</b> that fits the bed and your baby can kick off. No junior duvet in the first year. (US and UK advice prefer a sleeping bag instead of a duvet; Danish advice uses a light baby duvet.)',
    ],
    avoid: [
      'Pillows, wedges or positioners, including ones sold against a flat head.',
      'Lambskin as an indoor sleep surface.',
      'Weighted sleeping bags, swaddles or blankets, and anything sloping (US advice: no incline over 10°).',
    ],
    sources: [S.vd, S.vdProf, S.sb, S.aap],
  },
  {
    id: 'safe-where', group: 'safe', icon: '🏠', title: 'Where your baby sleeps',
    normal: [
      'The safest place is your baby\'s <b>own bed in your room</b>. Danish advice says especially for the first 6 months and preferably the whole first year (US/UK: at least 6 months).',
    ],
    tryTitle: 'If your baby sleeps in your bed',
    tryThis: [
      'Sundhedsstyrelsen advises against it, but if you do it: baby lies <b>beside one parent and next to their own cot, never between the parents</b>, and can\'t fall into a gap.',
      'Own thin baby duvet, and as much free space as in their own cot. The bed is at least 140 cm wide (180 cm if a parent is overweight), with firm mattresses pushed close together — one big mattress is best.',
      'No siblings or pets in the bed. After a feed, put your baby back in their own place.',
      'Risk is highest in the first 4 months, if a parent smokes or used nicotine in pregnancy, and if your baby was born early, had a low birth weight or is a twin or triplet. (The AAP in the US says to avoid bed-sharing altogether.)',
    ],
    avoidTitle: 'Never',
    avoid: [
      'Sleep with your baby on a sofa, armchair, sofa bed, daybed or waterbed.',
      'Share a bed if you are very tired, ill, have drunk alcohol or taken medicine or drugs that make you drowsy.',
    ],
    sources: [S.vd, S.vdProf, S.sb, S.aap, S.nhsSids],
  },
  {
    id: 'safe-pram', group: 'safe', icon: '🌳', title: 'Naps outside in the pram',
    intro: 'A very Danish habit, and fine once your baby has started gaining weight after birth and is otherwise thriving. In one Finnish study, outdoor winter naps lasted longer than indoor ones.',
    tryThis: [
      'Dress for the weather and <b>feel the neck or chest several times</b> during the nap.',
      '<b>Summer:</b> light clothes, pram in the shade (move it when the shade moves), an insect net. <b>Don\'t cover the opening with a cloth nappy</b> — it blocks the air and the pram heats up.',
      '<b>Winter:</b> insulate the bottom and sides, warm clothes and duvet, out of the wind. Not below −10 °C or in freezing fog or misty weather.',
      '<b>Rain:</b> park under a roof with the rain cover off. Only use an approved, well-fitting rain cover while walking.',
      'Coming indoors (a shop, the hall): loosen the duvet and take outdoor clothes off, even if your baby is asleep.',
      '<b>Check regularly</b>, more often in wind, cold or if your baby seems ill, unusually floppy or restless. If you use a harness, it must be a sleep harness to EN 13210, fastened tight to the pram — but no harness is completely safe.',
    ],
    sources: [S.sb, S.seler, S.tourula],
  },
  {
    id: 'safe-devices', group: 'safe', icon: '🚗', title: 'Car seats, bouncers, slings and swaddling',
    tryThis: [
      'Use the car seat for travel only. If your baby falls asleep in a car seat, bouncer, swing or sling, move them onto a firm, flat surface on their back when you arrive.',
      'In a sling: tight, baby in view, close enough to kiss, chin off the chest, back supported.',
      'Swaddling doesn\'t prevent cot death. If you swaddle: always on the back, not too tight around the hips, and <b>stop when your baby shows signs of trying to roll</b> (often around 3–4 months, sometimes earlier). Never swaddle when bed-sharing.',
    ],
    normal: [
      'In US data, most sleep deaths in sitting devices happened in car seats that were not being used as intended — often at home.',
    ],
    sources: [S.vd, S.vdProf, S.aap, S.nhsSids, S.pease, S.liaw],
  },
  {
    id: 'safe-dummy', group: 'safe', icon: '🍼', title: 'Dummies (pacifiers)',
    normal: [
      'Sundhedsstyrelsen does not recommend a dummy against cot death: there may be a protective effect, but the evidence is not strong. (The AAP in the US says to offer one at sleep times; the NHS says to "consider" it.)',
      'As a comfort, you can consider one once breastfeeding is going well. With breastfeeding problems, limit or skip it.',
    ],
    avoid: [
      'Never hang a dummy round the neck or clip it to clothes during sleep.',
    ],
    sources: [S.vdProf, S.sb, S.aap, S.nhsSids],
  },

  /* ---------------- environment ---------------- */
  {
    id: 'room-temp', group: 'room', icon: '🌡️', title: 'Room temperature and clothes',
    tryThis: [
      '<b>18–20 °C</b> where your baby sleeps, and no warmer than 20 °C (Danish advice; the UK says 16–20 °C). If you open a window, keep your baby out of the draught.',
      'Air the room before bedtime.',
      'Don\'t overdress for the night: breathable cotton or wool, nothing with cords, a light duvet your baby can kick off. No hat indoors.',
      'A baby with a fever: light clothes and just a sheet.',
      'The neck or chest tells you more than hands and feet, which are often cool.',
    ],
    sources: [S.vd, S.sb, S.lullaby, S.aap],
  },
  {
    id: 'room-light', group: 'room', icon: '🌗', title: 'Light and darkness',
    tryThis: [
      'Daylight during the day helps the body clock — babies who got more afternoon light slept better at night.',
      'Dim the lights before bedtime. At night use as little light as possible; Sundhedsstyrelsen suggests a red bulb, which is less stimulating.',
    ],
    sources: [S.sb, S.harrison, S.nhsSleep],
  },
  {
    id: 'room-noise', group: 'room', icon: '🔊', title: 'White noise',
    normal: [
      'A soft, even hum calms many babies — Sundhedsstyrelsen mentions it too. There is no good evidence that it improves sleep in the long run, and it does nothing against cot death.',
    ],
    tryThis: [
      '<b>Keep it quiet and far from the bed</b> — not on the cot rail or in the cot. In a test, every sleep-sound machine was too loud at full volume 30 cm away, and some were loud enough to risk hearing damage over a night.',
      'Use a timer rather than running it all night. Lull\'s sounds (Night tab) have a fade-out timer for this.',
    ],
    sources: [S.sb, S.hugh],
  },

  /* ---------------- settling ---------------- */
  {
    id: 'settle-routine', group: 'settle', icon: '🌙', title: 'A bedtime routine',
    intro: 'The best-tested, gentlest thing you can do. In a trial, two weeks of a steady nightly routine meant babies fell asleep faster and woke less — and their mothers felt better too. The more nights with a routine, the better.',
    tryThis: [
      'Keep it short and cosy: Sundhedsstyrelsen suggests <b>10–15 minutes</b>, for example nappy, pyjamas, a story and the same song every night.',
      'Turn light, sound and play down well before bed. No wild games right before sleep.',
      'A short version before naps works too.',
      'Put your baby down tired, but not over-tired, fed, calm and secure.',
    ],
    sources: [S.sb, S.mindell09, S.mindell15],
  },
  {
    id: 'settle-gentle', group: 'settle', icon: '🤲', title: 'Helping your baby fall asleep',
    normal: [
      'Crying doesn\'t mean your baby is spoiled — they have something to tell you.',
      'Before about 6 months, sleep "training" programmes haven\'t been shown to help, and may mean more crying and earlier weaning. Respond, comfort and feed as needed.',
    ],
    tryTitle: 'The Danish approach (from about 4–5 months)',
    tryThis: [
      'After the routine, put your baby in bed, sit beside them and say you\'ll stay until they\'re asleep.',
      'If they get upset: a calm hand on the tummy, gentle rocking, or pick them up until calm and lay them down again. <b>Stay in the room</b>.',
      'Comfort in steps: try your voice first, then a hand on your baby in the bed, and pick them up if they need it.',
      'Some families sit with a hand to hold until the baby sleeps; others leave after the routine. Choose what suits your family and child.',
    ],
    avoidTitle: 'Good to know',
    avoid: [
      'Methods with timed check-ins ("controlled comforting") have been studied in babies from 6 months: they helped sleep, and there was no sign of harm to attachment, stress or behaviour years later. They are not part of Sundhedsstyrelsen\'s advice, which keeps you in the room.',
      '<b>Never shake a baby.</b> If the crying gets too much, lay your baby safely in the cot, leave the room, breathe, and come back when you are calm.',
    ],
    sources: [S.sb, S.douglas, S.gradisar, S.price, S.mindell06],
  },
  {
    id: 'settle-night-feeds', group: 'settle', icon: '🌜', title: 'Night feeds',
    normal: [
      'Night feeds are normal for many months. At 6–12 months, most babies still wake at least once and many still have a milk feed — breastfed or bottle-fed alike.',
    ],
    tryThis: [
      'From about 3–4 months you can slowly separate the feed from falling asleep, so your baby isn\'t always fed to sleep.',
      'Sundhedsstyrelsen says you can try dropping the middle-of-the-night feed from about 6 months. Ideas: the other parent does the night wake-ups for a while.',
      'Calm daytime feeds help: a distracted baby may make up the milk at night.',
      'A big last meal or cereal in the bottle doesn\'t help sleep and can upset the tummy.',
    ],
    sources: [S.sb, S.brown, S.nhsSleep],
  },

  /* ---------------- problems ---------------- */
  {
    id: 'p-night-waking', group: 'problems', icon: '🌙', title: 'Waking a lot at night',
    normal: [
      'Waking at night is normal for babies — even many one-year-olds wake once or more. At 6–12 months, between a quarter and over half of babies don\'t sleep 6–8 hours in a row, and they develop just as well.',
      'In Danish advice, "sleeping through" in the first year usually just means 5–6 hours.',
    ],
    tryThis: [
      'A steady bedtime routine (see Settling and routines).',
      'The same rhythm on weekdays, weekends and holidays.',
      'During teething, illness or starting daycare: comfort, but keep the routine.',
      'Parents moving about in the same room or bed can wake a baby.',
    ],
    ask: [
      'Your baby snores a lot, has breathing pauses, or seems ill or in pain.',
      'They aren\'t gaining weight well.',
      'The nights are wearing you down — that alone is a good reason to call your health visitor.',
    ],
    sources: [S.sb, S.pennestri, S.brown, S.galland],
  },
  {
    id: 'p-naps', group: 'problems', icon: '😤', title: 'Fights naps or naps are short',
    normal: [
      'How much babies sleep in the day varies a lot, and seems to be partly just who they are.',
      'There is no official "too short" for a nap. The "45-minute sleep cycle" often quoted online has no solid source.',
    ],
    tryThis: [
      'Check the basics: fed, dry nappy, comfortable clothes, room around 18–20 °C.',
      'Watch for sleepy signs (yawning, rubbing eyes, staring, fussing) and use a short version of the bedtime routine.',
      'A nap outside in the pram can be longer.',
      'Nap strikes come and go — don\'t panic about one bad day.',
    ],
    ask: [
      'Sleep stays hard for weeks, or your baby seems unusually sleepy or hard to wake.',
    ],
    sources: [S.sb, S.galland, S.weiss, S.tourula, S.canapari],
  },
  {
    id: 'p-early', group: 'problems', icon: '🌅', title: 'Waking very early',
    normal: [
      'There is no research on fixing early waking in babies, so be wary of "fix it" schedules.',
    ],
    tryThis: [
      'What helps the body clock in general: daylight in the day, dim evenings, a dark room in the morning, and a steady daily rhythm.',
      'Keep the first wake-up of the day calm and dim if it\'s still night-time to you.',
    ],
    sources: [S.sb, S.harrison],
  },
  {
    id: 'p-bedtime', group: 'problems', icon: '🧸', title: 'Bedtime takes ages',
    tryThis: [
      'A consistent routine and wind-down are the best-supported help for bedtime struggles in young children.',
      '<b>Bedtime fading:</b> for a while, put your child down at the time they actually fall asleep, then move bedtime earlier by small steps. In a trial it cut the time to fall asleep, with no sign of stress.',
      'No wild play right before bed.',
    ],
    sources: [S.sb, S.mindell06, S.gradisar],
  },
  {
    id: 'p-naps-drop', group: 'problems', icon: '📉', title: 'Dropping a nap',
    normal: [
      '<b>3 → 2 naps:</b> somewhere between 6 and 12 months. Two naps are usually settled by 9–12 months.',
      '<b>2 → 1 nap:</b> often from about 1½ years (15–24 months).',
      '<b>1 → no nap:</b> most children between 3 and 5 years.',
    ],
    tryThis: [
      'Expect a few in-between weeks with some one-nap and some two-nap days.',
      'When a nap goes, move bedtime a bit earlier.',
    ],
    sources: [S.sb, S.sl, S.weiss],
  },
  {
    id: 'p-regressions', group: 'problems', icon: '🔁', title: '"Sleep regressions"',
    normal: [
      'Apps and blogs often list regressions at fixed ages (4, 8, 12, 18 months). <b>Research doesn\'t back fixed regression ages.</b>',
      'What is real: sleep matures a lot in the first months (a day-night rhythm at 1–3 months, night sleep gathering into one block at 6–9 months), so changes around 3–4 months are common. That is development, not going backwards.',
      'Sleep also gets bumpy around teething, illness, starting daycare, moving house and new skills. These phases are common and usually pass.',
      'Teething: symptoms cluster in about the 8 days around a tooth coming through — not weeks.',
    ],
    tryThis: [
      'Keep the routine, comfort as needed, and avoid starting habits you won\'t want to keep.',
    ],
    sources: [S.sl, S.sb, S.henderson, S.grigg, S.macknin],
  },
  {
    id: 'p-overtired', group: 'problems', icon: '🥱', title: 'Overtiredness',
    normal: [
      'A very tired baby can find it harder to settle, which is why Danish advice says to put babies down "tired, but not over-tired".',
      'The popular claim that being overtired floods babies with the stress hormone cortisol is not proven. In the best trial, cortisol actually went slightly down when sleep improved.',
    ],
    tryThis: [
      'Watch your baby\'s own sleepy signs first. Awake times by age (top of this page) are a rule of thumb, not a target.',
    ],
    sources: [S.sb, S.gradisar, S.canapari],
  },
  {
    id: 'p-daynight', group: 'problems', icon: '🔄', title: 'Day and night mixed up (newborns)',
    normal: [
      'Newborns have no day and night yet. Most start telling them apart between about 6 weeks and 2 months.',
    ],
    tryThis: [
      'Days: daylight, play and normal household noise.',
      'Nights: as little light as possible, no talking or play during feeds, and only change the nappy if it\'s dirty or very wet.',
    ],
    sources: [S.sb, S.nhsSleep, S.harrison],
  },
  {
    id: 'p-dst', group: 'problems', icon: '🕐', title: 'Clocks changing (summer/winter time)',
    normal: [
      'Denmark changes the clocks on the last Sunday of March and the last Sunday of October. There is no research on babies and clock changes, so these are practical tips, not proven ones.',
    ],
    tryThis: [
      'Shift bedtime 10–15 minutes a day over the days around the change, or switch the whole day at once and use morning daylight to help.',
      'Keep the rest of the daily rhythm the same.',
    ],
    sources: [S.eu, S.sb],
  },

  /* ---------------- health ---------------- */
  {
    id: 'h-urgent', group: 'health', icon: '🚑', title: 'Call 112',
    tryTitle: 'Call 112 straight away if your baby',
    tryThis: [
      'stops breathing for more than 20 seconds, or turns pale, blue or grey',
      'is struggling to breathe — grunting, breathing very fast, or the tummy or ribs sucking in with each breath',
      'becomes floppy or stiff, is very drowsy and hard to wake, or is hard to make contact with',
      'has a seizure, a stiff neck, or a rash that doesn\'t fade when you press a glass against it',
    ],
    normal: [
      'Don\'t wait for a rash: not every seriously ill baby gets one. A baby who seems very ill is reason enough.',
      'Short pauses in breathing followed by a few quick breaths ("periodic breathing") are normal in young babies and usually gone by about 6 months.',
    ],
    sources: [S.aapApnea, S.nhsFever, S.nhsMening],
  },
  {
    id: 'h-doctor', group: 'health', icon: '🩺', title: 'Contact your doctor or health visitor',
    tryTitle: 'Call a doctor if',
    tryThis: [
      'a baby <b>under 3 months has a fever</b> (38 °C or more) — even a moderate rise can be serious at this age',
      'your baby is under 6 months and you are worried — young babies are hard to judge, so call rather than wait',
      'your baby has jaundice and is very sleepy and has to be woken for feeds',
    ],
    ask: [
      'snoring is frequent, or breathing at night seems hard',
      'sleep stays hard for a long time',
      'there are long bouts of crying — pain or illness should be ruled out first',
      'jaundice lasts more than 2 weeks',
      'the head looks flat or uneven',
      'weight gain or feeding worries you',
    ],
    avoidTitle: 'Good to know',
    avoid: [
      'Don\'t give painkillers without a doctor\'s advice — they can hide symptoms.',
    ],
    sources: [S.akut, S.feber, S.sb, S.vd, S.aapApnea],
  },
];
