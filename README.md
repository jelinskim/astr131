# Astr-131 Constellation Tracker

A site for learning / practicing materials covered in the planetarium sessions

## What it does

- **Quiz** - shows the stars-only image, you pick the constellation from a
  dropdown, submit, and the constellation line is revealed alongside a correct/incorrect status. 
  Click Next. Order is reshuffled every run. Filter the set by week, "through week N", 
  or "review my misses". Make a custom quiz of your favorites, or take one generated from constellations "in the red" that you consistently miss.
- **Atlas** - a searchable grid that shows all constellations and their details. Sort and filter options available.
- **Stats** - quizzes taken, accuracy, best streak, and a sortable per-constellation table that flags your most troublesome area(s). Along with a grid to show historical quiz metrics.

## Adding constellations

- More constellations will be added as they are covered in the planetarium sessions.

## Files

```
index.html      app shell + fonts + nav
styles.css      theme
app.js          all logic
data.js         to add/change constellations
images/         Stellarium screenshots go here
.nojekyll       tells GitHub Pages to serve files as-is
```

## Notes

- Stats are per-browser. Clearing browser data (or "Reset all data" on the Stats tab) wipes them.