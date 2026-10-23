# Where Lull's numbers come from

Lull shows two kinds of age guidance: **total daily sleep** and **awake (wake)
windows**. They have different evidentiary weight, and the app treats them that way.

## Total daily sleep — consensus recommendations
- American Academy of Sleep Medicine consensus statement, endorsed by the AAP:
  infants 4–12 months 12–16 h per 24 h (including naps); 1–2 years 11–14 h.
  <https://aasm.org/resources/pdf/pediatricsleepdurationconsensus.pdf>
- National Sleep Foundation: newborns 0–3 months 14–17 h.
  <https://www.sleepfoundation.org/how-sleep-works/how-much-sleep-do-we-really-need>
- AAP healthy-sleep guidance: <https://www.healthychildren.org/English/healthy-living/sleep/>

## Wake windows — expert practice, not an official standard
There is **no AAP or AASM wake-window chart**. The ranges in `js/science.js` are
the consensus of pediatric sleep practitioners, cross-checked across:
- Sleep Foundation, "Newborn wake windows":
  <https://www.sleepfoundation.org/baby-sleep/newborn-wake-windows>
- The Baby Sleep Site, wake windows by age:
  <https://www.babysleepsite.com/schedules/wake-windows-by-age-baby-sleep-better/>
- Sleep.com, wake windows by age:
  <https://www.sleep.com/sleep-health/newborn-wake-windows>

Because of that, the app:
- always shows a **range**, never a single magic minute;
- labels a prediction **Age-based** until it has the baby's own data, then
  **Learning** and **Learned**;
- states in the Patterns screen and Settings that these are consensus ranges and
  not medical advice.

## Nap length and night-sleep split
Nap-length fallbacks per age band are from the same sources. For charts, "night"
is defined as 19:00–07:00 and a sleep that crosses that line is **split**
proportionally rather than being guessed into one bucket (see `js/stats.js`).

## Deliberately not in the app
- No sleep-training programme, schedule to follow, or "your baby should…" advice.
- No developmental scoring. The only percentiles are growth (weight, length,
  head) against the WHO tables below.
- No claims about safe sleep practice; that belongs with a health visitor,
  midwife or doctor.

## Growth curves
WHO Child Growth Standards (2006), birth to 24 months: weight-for-age,
length-for-age and head-circumference-for-age, girls and boys. The LMS tables in
`docs/who/` are the CSV files CDC republishes at
<https://www.cdc.gov/growthcharts/who-data-files.htm>. The weight tables were
cross-checked against the LMS values printed by Merck Manuals' WHO calculator.
`tools/build_who.py` turns them into `js/who.js`, and `tests/growth.test.mjs`
checks that Lull's percentiles reproduce WHO's own published percentile values.
Between whole months L, M and S are interpolated linearly. A national chart
(e.g. the one a Danish health visitor uses) can differ slightly from WHO.
