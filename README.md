# mad-courses

A web app for Madeira students to browse all offered courses, build a 4-year academic plan, and track graduation requirements. Built with HTML, CSS, and JavaScript.
- browse the full course catalog by department
- drag courses into grade year columns to build your plan
- mark courses as Interested, Taken Previously, or Asking About, syncs to your mini plan cards
- tracks blocks and credits per year with a live counter (goal is 18–21 blocks per year)
- distribution requirements checklist that updates as you add courses
- saves automatically to the browser so your plan is still there when you come back
- welcome page and tutorial
- print / save as PDF
- auto-populates required locked courses (Student Life, Design Thinking Lab, co-curriculum) based on what grade you entered Madeira

## sources

### html
https://developer.mozilla.org/en-US/docs/Web/HTML/Element/html

dialog element (used for popups so Chrome Translate can reach the text):
https://developer.mozilla.org/en-US/docs/Web/HTML/Element/dialog

### js

fetch() makes a network request to load the JSON file:
https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API

innerHTML — sets the HTML content of an element:
https://developer.mozilla.org/en-US/docs/Web/API/Element/innerHTML

appendChild — adds a child element to a parent:
https://developer.mozilla.org/en-US/docs/Web/API/Node/appendChild

dataset — lets you attach custom data to HTML elements (used for course IDs, grade keys, etc.):
https://developer.mozilla.org/en-US/docs/Web/API/HTMLElement/dataset

drag and drop API — dragstart, dragover, drop events:
https://developer.mozilla.org/en-US/docs/Web/API/HTML_Drag_and_Drop_API

localStorage — saves the plan in the browser between visits:
https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage

Set (javascript data structure) — used for planState, fast checks:
https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Set

### css

flex keyword — how the two-panel layout works:
https://developer.mozilla.org/en-US/docs/Web/CSS/flex

CSS grid — used for the course card layout:
https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_grid_layout

position: sticky, absolute, fixed:
https://developer.mozilla.org/en-US/docs/Web/CSS/position

CSS table padding bug — browsers ignore padding on table elements when border-collapse: collapse is set. have to wrap the table in a div and pad the div instead:
https://www.w3.org/TR/CSS22/tables.html

### data
Madeira Course Catalog 2025–2026 (PDF) — all course data, graduation requirements, D-block rules, co-curriculum descriptions. Used Claude AI to extract the data into JSON.

## notes to self

- the rotation years for Linear Algebra / Multivariable Calc / Differential Equations (2025, 2026, 2027) are placeholders. need to confirm the actual cycle with the math department
- check which d-blocks are counted as team and movement
- some d-block season assignments were entered manually and might have errors, worth a review
- localStorage is per-browser so a student's plan won't carry over if they switch browsers or clear their cache. could add an export/import feature or login later
