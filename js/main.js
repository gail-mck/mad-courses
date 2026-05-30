// stores every course by id so i can look it up when a card is dropped
const courseMap = {}

// will track which course ids have been dropped into each grade year
const planState = {
  9:  new Set(),
  10: new Set(),
  11: new Set(),
  12: new Set(),
}

// tracks the status a student sets on a catalog card (interested / taken / asking)
const statusMap = {}

// tracks notes per course so they can be saved and restored
const notesMap = {}

// for range courses (e.g. Algebra II is 3–4 blocks) stores the user's chosen block count
// key is courseId_grade so the same course can have different counts in different years
const blocksSelectionMap = {}

// grade the student entered Madeira — changes which graduation requirements are shown
let entryGrade = 9

// tracks which distribution rows were already met so we only toast on the flip from unmet → met
const prevMetState = {}

// set to true while restoring a saved plan so we don't toast every requirement at once on load
let isRestoringPlan = false

// locked required courses that the student has intentionally removed (e.g. medical exemption)
// persisted to localStorage so the removal survives page reloads
const lockedOverrides = new Set()

// grade level of whatever card is currently being dragged
// dragover reads this to show the no-drop cursor before a drop fires
let draggingGradeLevels = []

// graduation requirements by entry grade (source: Madeira Course Catalog 2025-26, pp. 5-13)
// history totals include the 1 research credit (earned via US History or Research Seminar)
const REQUIREMENTS = {
  // co-curriculum: 3 required courses × 3 credits each = 9; 11th entry only needs 2 × 3 = 6
  9:  { English: 12, Mathematics: 12, Science: 9, History: 9, 'World Languages': 9, Art: 3, 'Co-Curriculum': 9 },
  10: { English: 9,  Mathematics: 9,  Science: 6, History: 6, 'World Languages': 6, Art: 3, 'Co-Curriculum': 9 },
  11: { English: 6,  Mathematics: 6,  Science: 3, History: 3, 'World Languages': 3, Art: 3, 'Co-Curriculum': 6 },
}

// d-blocks that count as "team experiences" (source: catalog p. 16 — group/team-based activities)
const TEAM_DBLOCKS = new Set([
  'cross-country', 'field-hockey', 'soccer', 'volleyball', 'tennis-fall',
  'basketball', 'rock-climbing', 'swimming-diving', 'lacrosse', 'softball',
  'tennis-spring', 'track-field', 'riding',
  'dance', 'play', 'musical', 'theater-showcase',
  'student-publications-spectator', 'student-publications-gate', 'yearbook',
  'model-un',
  'athletic-student-assistant', 'athletic-sports-information-assistant', 'athletic-training-assistant',
])

// d-blocks that count as "movement" (catalog p. 16 — endurance based non-stationary activity)
const MOVEMENT_DBLOCKS = new Set([
  'cross-country', 'field-hockey', 'soccer', 'volleyball', 'tennis-fall',
  'basketball', 'rock-climbing', 'swimming-diving', 'lacrosse', 'softball',
  'tennis-spring', 'track-field', 'riding',
  'dance',
  'intro-fitness-strength', 'advanced-weight-training', 'self-defense-karate',
  'swimming-conditioning', 'mad-aquatics', 'tennis-101', 'advanced-tennis',
  'nature-hikes',
])

const departmentNames = {
  mathematics:   'Mathematics',
  english:       'English',
  science:       'Science',
  history:       'History',
  language:      'World Languages',
  art:           'Art',
  other:         'Design Thinking & Other Courses',
  d_blocks:      'D-Blocks',
  co_curriculum: 'Co-Curriculum',
}

// same order as the nav bar — used to sort plan cards by department
const deptOrder = [
  'mathematics', 'english', 'science', 'history',
  'language', 'art', 'other', 'd_blocks', 'co_curriculum',
]

// short department names for the mini-card subtitle
const deptShortNames = {
  mathematics:   'Math',
  english:       'English',
  science:       'Science',
  history:       'History',
  language:      'Language',
  art:           'Art',
  other:         'Other',
  d_blocks:      'D-Block',
  co_curriculum: 'Co-Curriculum',
}

// when the blocks variable has letters (old string-based fallback)
function formatBlocks(blocks) {
  if (!blocks) return '—'
  if (blocks.includes('per') || blocks.includes('mod')) return '—'
  if (blocks === 'Yearlong') return 'Yearlong'
  if (blocks === '1') return '1 block'
  else return `${blocks} blocks`
}

// returns the number of schedule BLOCKS a course occupies in a given grade year
// yearlong evening courses (Chorus, Orchestra, Stagecraft, GYLB) count as credits but NOT blocks
// d_blocks and co_curriculum are excluded at the call site
function getBlocksCount(courseId, grade) {
  const course = courseMap[courseId]
  if (!course) return 0
  if (course.blocks === 'Yearlong') return 0  // evening courses don't occupy daytime blocks
  if (course.blocks_min == null) return 0
  // for range courses use whatever the student picked, defaulting to the minimum
  if (course.blocks_min !== course.blocks_max) {
    return blocksSelectionMap[`${courseId}_${grade}`] || course.blocks_min
  }
  return course.blocks_min
}

// returns the number of CREDITS a course earns — same as blocks except evening courses earn 3
// used for the distribution tracker and the minimum-credit check (≥ 18 credits/year)
function getCreditsCount(courseId, grade) {
  const course = courseMap[courseId]
  if (!course) return 0
  if (course.blocks === 'Yearlong') return 3  // evening courses earn 3 credits per year
  return getBlocksCount(courseId, grade)
}

// saves the entire plan (state, notes, statuses, block selections, entry grade) to localStorage
// locked required courses are excluded — they get re-added automatically on every load
function savePlan() {
  const data = {
    entryGrade,
    plan: {
      9:  Array.from(planState[9]).filter(id => !courseMap[id]?.locked),
      10: Array.from(planState[10]).filter(id => !courseMap[id]?.locked),
      11: Array.from(planState[11]).filter(id => !courseMap[id]?.locked),
      12: Array.from(planState[12]).filter(id => !courseMap[id]?.locked),
    },
    notes:           notesMap,
    statuses:        statusMap,
    blocksSelection: blocksSelectionMap,
    // save which locked courses the student intentionally removed
    lockedOverrides: Array.from(lockedOverrides),
  }
  localStorage.setItem('madeiraPlan', JSON.stringify(data))
}

// re-renders the grade badge, selected border, and status icon on a catalog card
// called any time planState or statusMap changes for this course
function updateCatalogCard(courseId) {
  const card = document.querySelector(`.course-card[data-course-id="${courseId}"]`)
  if (!card) return

  // find ALL grades this course is currently in (chorus added to multiple years shows all)
  const gradesIn = Object.entries(planState)
    .filter(([g, set]) => set.has(courseId))
    .map(([g]) => parseInt(g))
    .sort((a, b) => a - b)

  // grade badge: shows all years (e.g. "9th, 10th") when course is in the plan
  const badge = card.querySelector('.grade-badge')
  if (gradesIn.length > 0) {
    const labels = { 9: '9th', 10: '10th', 11: '11th', 12: '12th' }
    badge.textContent = gradesIn.map(g => labels[g]).join(', ')
    badge.classList.remove('hidden')
  } else {
    badge.classList.add('hidden')
  }

  // red highlight when course is in the plan
  if (gradesIn.length > 0) card.classList.add('course-card--selected')
  else card.classList.remove('course-card--selected')

  // green tint when marked as taken previously
  const status = statusMap[courseId]
  if (status === 'taken') card.classList.add('course-card--taken')
  else card.classList.remove('course-card--taken')

  // update the status button icon and color based on current status
  const statusBtn = card.querySelector('.status-btn')
  if (status === 'interested') {
    statusBtn.textContent = '★'
    statusBtn.style.color = '#f0b429'
  } else if (status === 'taken') {
    statusBtn.textContent = '✓'
    statusBtn.style.color = '#2e7d32'
  } else if (status === 'asking') {
    statusBtn.textContent = '?'
    statusBtn.style.color = '#e87722'
  } else {
    statusBtn.textContent = '⋮'
    statusBtn.style.color = '#888'
  }

  // sync the same status to the mini plan card if it's in the plan
  updatePlanCard(courseId)
}

// updates the status tag on a mini plan card to match the catalog card status
function updatePlanCard(courseId) {
  const card = document.querySelector(`.plan-card[data-course-id="${courseId}"]`)
  if (!card) return
  const tag = card.querySelector('.plan-status')
  if (!tag) return
  const status = statusMap[courseId]
  if (status === 'interested') {
    tag.textContent = '★ Interested'
    tag.style.color = '#f0b429'
    tag.classList.remove('hidden')
  } else if (status === 'taken') {
    tag.textContent = '✓ Taken previously'
    tag.style.color = '#2e7d32'
    tag.classList.remove('hidden')
  } else if (status === 'asking') {
    tag.textContent = '? Asking about'
    tag.style.color = '#e87722'
    tag.classList.remove('hidden')
  } else {
    tag.classList.add('hidden')
  }
}

// recalculates and displays block and credit totals for one grade column
// blocks = daytime schedule slots (max 21, excludes d_blocks only)
// credits = blocks + evening courses (min 18)
function updateGradeCounter(grade) {
  let blocks  = 0
  let credits = 0
  planState[grade].forEach(courseId => {
    const course = courseMap[courseId]
    if (!course) return
    if (course.department === 'd_blocks') return
    blocks  += getBlocksCount(courseId, grade)
    credits += getCreditsCount(courseId, grade)
  })
  const counter = document.getElementById(`counter-${grade}`)
  if (!counter) return

  // good = blocks within limit AND enough credits
  const blocksOk  = blocks <= 21
  const creditsOk = credits >= 18
  const allGood   = blocksOk && creditsOk

  if (credits === 0) {
    // nothing added yet — show neutral placeholder
    counter.textContent = '0 blocks · 0 credits'
    counter.className = 'block-counter'
  } else if (allGood) {
    counter.textContent = `${blocks} blocks · ${credits} credits ✓`
    counter.className = 'block-counter good'
  } else {
    counter.textContent = `${blocks} blocks · ${credits} credits ✗`
    counter.className = 'block-counter off'
  }
}

// rebuilds the distribution requirements checklist at the bottom of the plan
// called after every plan change so it always reflects the current state
function updateDistributionTracker() {
  const req = REQUIREMENTS[entryGrade]

  // sum up academic blocks per credits_toward category across all four grade years
  const totals = {}
  const courseIdsInPlan = new Set()

  Object.entries(planState).forEach(([grade, courseIds]) => {
    courseIds.forEach(courseId => {
      const course = courseMap[courseId]
      if (!course) return
      courseIdsInPlan.add(courseId)
      // use credits (not blocks) so evening courses still count toward graduation requirements
      const credits = getCreditsCount(courseId, parseInt(grade))
      course.credits_toward.forEach(credit => {
        totals[credit] = (totals[credit] || 0) + credits
      })
    })
  })

  // add courses marked "taken previously" to courseIdsInPlan so the boolean checks
  // (Bio ✓, Chem ✓, Physics ✓, Coding ✓) reflect them — but don't add to credit totals,
  // since the graduation requirements already account for time not at Madeira
  Object.entries(statusMap).forEach(([courseId, status]) => {
    if (status !== 'taken') return
    const course = courseMap[courseId]
    if (!course) return
    if (courseIdsInPlan.has(courseId)) return  // already counted via planState
    courseIdsInPlan.add(courseId)
  })

  // co-curriculum credits are counted by the standard credits loop above (3 per course)
  // no special case needed here anymore

  // science sub-requirements: must include biology, chemistry, and physics specifically
  const hasBio  = courseIdsInPlan.has('biology')   || courseIdsInPlan.has('ap-biology')
  const hasChem = courseIdsInPlan.has('chemistry')  || courseIdsInPlan.has('applied-chemistry') || courseIdsInPlan.has('ap-chemistry')
  const hasPhys = courseIdsInPlan.has('physics')    || courseIdsInPlan.has('applied-physics')   || courseIdsInPlan.has('ap-physics-c')

  // research credit: embedded in US History (4-block course), or earned via Research / Capstone Research Seminar
  const hasResearch = courseIdsInPlan.has('us-history') || courseIdsInPlan.has('research-seminar') || courseIdsInPlan.has('capstone-research-seminar')

  // coding credit: any course whose credits_toward includes 'Coding'
  const hasCoding = Array.from(courseIdsInPlan).some(id => courseMap[id]?.credits_toward.includes('Coding'))

  const tbody = document.querySelector('#dist-table tbody')
  tbody.innerHTML = ''

  // adds a main requirement row: category name | current/required | ✓ or ✗
  // also toasts when a row flips from unmet to met for the first time this session
  function addRow(label, current, required) {
    const met = current >= required
    const wasMet = prevMetState[label]
    // only toast when a requirement is newly met — not during the initial page-load restore
    if (met && !wasMet && !isRestoringPlan) showToast(`✓ ${label} requirement met!`)
    prevMetState[label] = met

    const tr = document.createElement('tr')
    tr.innerHTML = `
      <td>${label}</td>
      <td class="dist-count">${current}/${required}</td>
      <td class="${met ? 'dist-met' : 'dist-unmet'}">${met ? '✓' : '✗'}</td>
    `
    tbody.appendChild(tr)
  }

  // adds an indented sub-row (no count column, just a note or boolean check)
  function addSubRow(html) {
    const tr = document.createElement('tr')
    tr.innerHTML = `<td colspan="3" class="dist-sub">${html}</td>`
    tbody.appendChild(tr)
  }

  // returns a colored ✓ or ✗ span
  function check(met) {
    return `<span class="${met ? 'dist-met' : 'dist-unmet'}">${met ? '✓' : '✗'}</span>`
  }

  // same order as the catalog nav: Math → English → Science → History → World Languages → Art → D-Blocks → Co-Curriculum
  addRow('Mathematics',     totals['Mathematics']       || 0, req['Mathematics'])
  addSubRow(`Coding credit ${check(hasCoding)}`)
  addRow('English',         totals['English']           || 0, req['English'])
  addRow('Science',         totals['Science']           || 0, req['Science'])
  addSubRow(`Biology ${check(hasBio)} &nbsp; Chemistry ${check(hasChem)} &nbsp; Physics ${check(hasPhys)}`)
  addRow('History',         totals['History']           || 0, req['History'])
  addSubRow(`Research credit ${check(hasResearch)}`)
  addRow('World Languages', totals['World Languages']   || 0, req['World Languages'])
  addRow('Art',             totals['Art']               || 0, req['Art'])

  // d-block requirements — checked per grade year, not across all four years combined
  // 9th and 10th: 3 seasons required, at least 2 must be team/group experiences
  // 11th and 12th: 2 seasons required, at least 1 must be a movement activity
  const gradeLabel = { 9: '9th', 10: '10th', 11: '11th', 12: '12th' }
  const activeGrades = [9, 10, 11, 12].filter(g => g >= entryGrade)
  activeGrades.forEach(grade => {
    const dblockIds = Array.from(planState[grade]).filter(id => courseMap[id]?.department === 'd_blocks')
    const seasons = dblockIds.length
    const teamCount = dblockIds.filter(id => TEAM_DBLOCKS.has(id)).length
    const movCount  = dblockIds.filter(id => MOVEMENT_DBLOCKS.has(id)).length
    if (grade <= 10) {
      addRow(`${gradeLabel[grade]} D-Blocks`, seasons, 3)
      addSubRow(`Team/group experiences ${check(teamCount >= 2)} &nbsp; (${teamCount} of 2 required)`)
    } else {
      addRow(`${gradeLabel[grade]} D-Blocks`, seasons, 2)
      addSubRow(`Movement activity ${check(movCount >= 1)} &nbsp; (${movCount} of 1 required)`)
    }
  })

  addRow('Co-Curriculum', totals['Co-Curriculum'] || 0, req['Co-Curriculum'])

  // student life is only required for students who entered in 9th grade
  if (entryGrade === 9) {
    addSubRow(`Student Life ${check(courseIdsInPlan.has('student-life'))}`)
  }

  // design thinking lab required for 9th grade entry and new 10th grade entry
  if (entryGrade <= 10) {
    addSubRow(`Design Thinking Lab ${check(courseIdsInPlan.has('design-thinking-lab'))}`)
  }
}

// shows a simple info dialog when a student clicks a locked required course card
function showLockedAlert(courseName, grade) {
  const labels  = { 9: '9th', 10: '10th', 11: '11th', 12: '12th' }
  const dialog  = document.getElementById('locked-dialog')
  document.getElementById('locked-message').textContent =
    `All ${labels[grade]} grade students take ${courseName}. For questions specific to your situation, speak with the academic dean.`
  dialog.showModal()
  document.getElementById('locked-ok').onclick = () => dialog.close()
}

// shows the <dialog> with a message and calls onOk if the user clicks OK
// used instead of confirm() so Chrome Translate can reach the text
function showConfirm(message, onOk) {
  const dialog = document.getElementById('confirm-dialog')
  document.getElementById('confirm-message').textContent = message
  dialog.showModal()

  // reassign onclick each time so old handlers from previous dialogs don't stack up
  document.getElementById('confirm-ok').onclick = () => {
    dialog.close()
    onOk()
  }
  document.getElementById('confirm-cancel').onclick = () => {
    dialog.close()
  }
}

// sorts plan cards inside a drop-zone by department, matching the nav bar order
function sortDropZone(dropZone) {
  const cards = Array.from(dropZone.children)
  cards.sort((a, b) => {
    const deptA = courseMap[a.dataset.courseId].department
    const deptB = courseMap[b.dataset.courseId].department
    return deptOrder.indexOf(deptA) - deptOrder.indexOf(deptB)
  })
  // re-appending in sorted order physically moves the elements in the DOM
  cards.forEach(card => dropZone.appendChild(card))
}

// creates a brief popup at the bottom of the screen that disappears after 9 seconds
function showToast(message) {
  const toast = document.createElement('div')
  toast.className = 'toast'
  toast.textContent = message
  document.body.appendChild(toast)
  setTimeout(() => toast.remove(), 9000)
}

// checks if the student has any prereqs for this course
// if prereqs are missing, shows the confirm dialog — onProceed only runs if they click OK
// if prereqs are met (or there are none), onProceed runs immediately
function checkPrereqs(course, targetGrade, onProceed) {
  if (!course.prereq_ids || course.prereq_ids.length === 0) {
    onProceed()
    return
  }

  const hasPrereq = course.prereq_ids.some(prereqId => {
    // counts as having it if they marked it "taken previously"
    if (statusMap[prereqId] === 'taken') return true
    // also counts if it's planned for an earlier grade
    for (const [g, set] of Object.entries(planState)) {
      if (parseInt(g) < targetGrade && set.has(prereqId)) return true
    }
    return false
  })

  if (!hasPrereq) {
    showConfirm(
      `"${course.name}" may require:\n${course.prereqs}\n\nIf you have already taken the prerequisite, tap the three vertical dots (⋮) in the top right corner of a course card in the catalog to mark it as taken.\n\nAdd it to your plan anyway?`,
      onProceed
    )
  } else {
    onProceed()
  }
}

// builds a mini plan card and adds it to the correct grade column
// savedNote lets us restore a note from localStorage on page load
function addCourseToGrade(course, grade, savedNote = '') {
  const courseId = course.id
  planState[grade].add(courseId)

  // build the block display for the mini-card subtitle
  let blocksDisplay
  if (course.department === 'd_blocks') {
    blocksDisplay = course.season
  } else if (course.department === 'co_curriculum') {
    blocksDisplay = 'Offered'
  } else if (course.blocks === 'Yearlong') {
    blocksDisplay = 'Yearlong'
  } else if (course.blocks_min != null) {
    // for range courses show the saved selection or the minimum
    const selected = blocksSelectionMap[`${courseId}_${grade}`] || course.blocks_min
    blocksDisplay = String(selected)
  } else {
    blocksDisplay = '—'
  }

  const dept    = deptShortNames[course.department] || course.department
  const isRange = course.blocks_min != null && course.blocks_min !== course.blocks_max

  const item = document.createElement('li')
  item.className = 'plan-card'
  item.innerHTML = `
    <strong>${course.name}</strong>
    <span class="plan-subtitle">${blocksDisplay} · ${dept}</span>
    <button class="note-btn" title="Add a note">✎</button>
    <span class="plan-status hidden"></span>
    <input type="text" class="note-input hidden" placeholder="e.g. over the summer, ask Ms. Mahoney...">
    <span class="note-text hidden"></span>
  `

  // range courses get a small block picker so the student can choose how many blocks
  // e.g. Algebra II can be 3 or 4 blocks depending on placement
  if (isRange) {
    const picker = document.createElement('div')
    picker.className = 'block-picker'
    const label = document.createElement('span')
    label.className = 'block-picker-label'
    label.textContent = 'blocks:'
    picker.appendChild(label)

    const subtitle = item.querySelector('.plan-subtitle')
    const currentSel = blocksSelectionMap[`${courseId}_${grade}`] || course.blocks_min

    for (let b = course.blocks_min; b <= course.blocks_max; b++) {
      const btn = document.createElement('button')
      btn.className = 'block-pick-btn'
      btn.textContent = b
      if (b === currentSel) btn.classList.add('active')

      btn.addEventListener('click', (e) => {
        e.stopPropagation()
        blocksSelectionMap[`${courseId}_${grade}`] = b
        picker.querySelectorAll('.block-pick-btn').forEach(pb => pb.classList.remove('active'))
        btn.classList.add('active')
        // update the subtitle to show the newly selected block count
        subtitle.textContent = `${b} · ${dept}`
        updateGradeCounter(grade)
        updateDistributionTracker()
        savePlan()
      })

      picker.appendChild(btn)
    }
    item.appendChild(picker)
  }

  const noteBtn   = item.querySelector('.note-btn')
  const noteInput = item.querySelector('.note-input')
  const noteText  = item.querySelector('.note-text')

  // if restoring from localStorage, show the saved note right away
  if (savedNote) {
    noteText.textContent = savedNote
    noteText.classList.remove('hidden')
  }

  // note button: click to open/close the input
  noteBtn.addEventListener('click', (e) => {
    e.stopPropagation()
    noteInput.classList.toggle('hidden')
    if (!noteInput.classList.contains('hidden')) {
      noteInput.value = noteText.textContent
      noteInput.focus()
    }
  })

  // stop clicks on the note input from bubbling up and opening the modal
  noteInput.addEventListener('click', (e) => e.stopPropagation())

  // pressing Enter saves the note
  noteInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') noteInput.blur()
  })

  // clicking away saves the note and persists it to localStorage
  noteInput.addEventListener('blur', () => {
    const text = noteInput.value.trim()
    noteInput.classList.add('hidden')
    if (text) {
      noteText.textContent = text
      noteText.classList.remove('hidden')
      notesMap[courseId] = text
    } else {
      noteText.classList.add('hidden')
      delete notesMap[courseId]
    }
    savePlan()
  })

  item.dataset.courseId = courseId
  // compound key so we can find exactly this card (course + grade) without hitting a sibling grade's copy
  item.dataset.gradeKey = `${courseId}_${grade}`

  if (course.locked) {
    // locked required courses: draggable (so they can be removed if needed) but
    // can't be moved between grades — drag back to catalog triggers a confirm dialog
    item.classList.add('plan-card--locked')

    item.draggable = true
    item.addEventListener('dragstart', (event) => {
      item.dataset.dragging = 'true'
      draggingGradeLevels = course.grade_levels
      event.dataTransfer.setData('plan-course', courseId)
      event.dataTransfer.setData('fromGrade', item.closest('.grade-column').dataset.grade)
      event.dataTransfer.effectAllowed = 'move'
    })

    // click opens the course modal, same as regular courses
    // the drag guard prevents it firing at the end of a drag
    item.addEventListener('click', () => {
      if (item.dataset.dragging === 'true') {
        delete item.dataset.dragging
        return
      }
      openModal(course)
    })
  } else {
    // regular courses: draggable and open modal on click
    item.draggable = true

    item.addEventListener('dragstart', (event) => {
      item.dataset.dragging = 'true'
      draggingGradeLevels = course.grade_levels
      event.dataTransfer.setData('plan-course', courseId)
      // read grade from the DOM so it's correct even after the card has been moved
      event.dataTransfer.setData('fromGrade', item.closest('.grade-column').dataset.grade)
      event.dataTransfer.effectAllowed = 'move'
    })

    // clicking the plan card opens the same modal as the catalog card
    // item.dataset.dragging guards against the click that fires at the end of a drag
    item.addEventListener('click', () => {
      if (item.dataset.dragging === 'true') {
        delete item.dataset.dragging
        return
      }
      openModal(course)
    })
  }

  // append to the correct grade column's drop-zone, then sort by department
  const column   = document.querySelector(`.grade-column[data-grade="${grade}"]`)
  const dropZone = column.querySelector('.drop-zone')
  dropZone.appendChild(item)
  sortDropZone(dropZone)
  updateCatalogCard(courseId)
  updateGradeCounter(grade)
  updateDistributionTracker()
}

// adds the required locked courses for the current entry grade automatically
// called on page load and whenever the entry grade changes
// each course checks planState first so duplicates are never added
function autoPopulateRequired() {
  const required = []

  // student life and design thinking lab are only for students who started in 9th
  if (entryGrade <= 9) {
    required.push({ courseId: 'student-life',        grade: 9 })
    required.push({ courseId: 'design-thinking-lab', grade: 9 })
  }

  // design thinking lab is also required for students who entered in 10th
  if (entryGrade === 10) {
    required.push({ courseId: 'design-thinking-lab', grade: 10 })
  }

  // co-curriculum courses: add whichever years the student is here for
  if (entryGrade <= 10) required.push({ courseId: 'sophomore-co-curriculum', grade: 10 })
  if (entryGrade <= 11) required.push({ courseId: 'junior-co-curriculum',    grade: 11 })
  required.push({ courseId: 'senior-co-curriculum', grade: 12 })

  required.forEach(({ courseId, grade }) => {
    // skip if this course doesn't exist in the loaded data
    if (!courseMap[courseId]) return
    // skip if already in that grade
    if (planState[grade].has(courseId)) return
    // skip if the student intentionally removed this course (special circumstance)
    if (lockedOverrides.has(courseId)) return
    addCourseToGrade(courseMap[courseId], grade)
  })
}

// reads localStorage and rebuilds the plan after the course catalog has loaded
function restorePlan() {
  const saved = localStorage.getItem('madeiraPlan')
  if (!saved) return
  const data = JSON.parse(saved)

  // restore entry grade and reflect it on the selector buttons
  if (data.entryGrade) {
    entryGrade = data.entryGrade
    document.querySelectorAll('.entry-btn').forEach(btn => {
      btn.classList.toggle('active', parseInt(btn.dataset.entry) === entryGrade)
    })
    updateGradeVisibility()
  }

  // restore block selections before rebuilding cards so the pickers show the right value
  if (data.blocksSelection) Object.assign(blocksSelectionMap, data.blocksSelection)

  // restore any locked-course removals the student intentionally made
  if (data.lockedOverrides) data.lockedOverrides.forEach(id => lockedOverrides.add(id))

  // restore statuses first so updateCatalogCard works correctly when cards are added
  if (data.statuses) Object.assign(statusMap, data.statuses)

  // rebuild each plan card
  Object.entries(data.plan).forEach(([grade, courseIds]) => {
    courseIds.forEach(courseId => {
      const course = courseMap[courseId]
      if (!course) return
      addCourseToGrade(course, parseInt(grade), data.notes?.[courseId] || '')
    })
  })

  // apply any restored statuses visually to catalog cards
  Object.keys(statusMap).forEach(courseId => updateCatalogCard(courseId))

  // refresh tracker once everything is restored
  updateDistributionTracker()
}

function renderDepartment(department, courses) {
  const catalog = document.getElementById('catalog')

  // d-blocks are sorted by season so it's easier to scan: Fall → Winter → Spring → Year-round
  if (department === 'd_blocks') {
    const seasonOrder = ['Fall', 'Winter', 'Spring', 'Fall, Winter, Spring']
    courses = [...courses].sort((a, b) => {
      const ai = seasonOrder.findIndex(s => (a.season || '').includes(s.split(',')[0].trim()))
      const bi = seasonOrder.findIndex(s => (b.season || '').includes(s.split(',')[0].trim()))
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi)
    })
  }

  // create a header for this department
  const header = document.createElement('h2')
  header.textContent = departmentNames[department]
  // each department section gets an id so i can scroll to it
  header.id = `dept-${department}`
  catalog.appendChild(header)

  // add a horizontal line to separate departments
  const rule = document.createElement('hr')
  catalog.appendChild(rule)

  // grid to hold all cards for this department
  const grid = document.createElement('div')
  grid.className = 'course-grid'
  catalog.appendChild(grid)

  // looping over every course object in the array to add them as HTML elements
  courses.forEach(course => {
    const card = document.createElement('div')
    // store course in lookup map with id as key
    courseMap[course.id] = course
    card.dataset.courseId = course.id
    card.className = 'course-card'

    // d-blocks and co-curriculum have their own labels instead of block counts
    let blockLabel
    if (course.department === 'd_blocks') {
      blockLabel = course.season
    } else if (course.department === 'co_curriculum') {
      blockLabel = 'Mods ' + course.mods_offered.join(', ') + ' offered'
    } else {
      // use the min/max range if available (same as mini cards and the modal)
      blockLabel = course.blocks_min != null
        ? (course.blocks_min === course.blocks_max
            ? `${course.blocks_min} block${course.blocks_min === 1 ? '' : 's'}`
            : `${course.blocks_min}–${course.blocks_max} blocks`)
        : formatBlocks(course.blocks)
    }

    // small "Grades X, Y" note so students can see at a glance if a course fits their year
    // empty grade_levels means the course is open to everyone, so we skip the label
    let gradeLevelLabel = ''
    if (course.grade_levels && course.grade_levels.length > 0) {
      const gradeNums = course.grade_levels
      if (gradeNums.length === 1) {
        gradeLevelLabel = `<span class="card-grade-levels">Grade ${gradeNums[0]} only</span>`
      } else {
        gradeLevelLabel = `<span class="card-grade-levels">Grades ${gradeNums.join(', ')}</span>`
      }
    }

    // rotating math courses: show the next three school years so students can plan ahead
    // e.g. "Offered: 2025–26, 2028–29, 2031–32"
    let rotationLabel = ''
    if (course.rotation_cycle && course.rotation_year) {
      const y = course.rotation_year
      // format each as "YYYY–YY" (e.g. 2025–26)
      const fmt = yr => `${yr}–${String(yr + 1).slice(-2)}`
      rotationLabel = `<span class="card-rotation">Offered: ${fmt(y)}, ${fmt(y + 3)}, ${fmt(y + 6)}</span>`
    }

    // card-row: grade badge (left), course name (center, flex:1), ⋮ button (right)
    // putting them all on one row removes the blank top gap from the old layout
    card.innerHTML = `
      <div class="card-row">
        <span class="grade-badge hidden"></span>
        <strong>${course.name}</strong>
        <button class="status-btn" title="Set status">⋮</button>
      </div>
      <p>${blockLabel}</p>
      ${gradeLevelLabel}
      ${rotationLabel}
      <div class="status-dropdown hidden">
        <button data-status="interested">★ Interested</button>
        <button data-status="taken">✓ Taken Previously</button>
        <button data-status="asking">? Asking About</button>
        <button data-status="none">Remove status</button>
      </div>
    `

    card.addEventListener('click', () => openModal(course))

    // ⋮ button: toggles the dropdown, closes any others that are open
    const statusBtn      = card.querySelector('.status-btn')
    const statusDropdown = card.querySelector('.status-dropdown')

    statusBtn.addEventListener('click', (e) => {
      e.stopPropagation()
      document.querySelectorAll('.status-dropdown').forEach(d => {
        if (d !== statusDropdown) d.classList.add('hidden')
      })
      statusDropdown.classList.toggle('hidden')
    })

    // clicking a status option saves it, updates the card icon, and persists
    statusDropdown.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation()
        if (btn.dataset.status === 'none') delete statusMap[course.id]
        else statusMap[course.id] = btn.dataset.status
        updateCatalogCard(course.id)
        // refresh distribution tracker so "taken" courses immediately count toward requirements
        updateDistributionTracker()
        statusDropdown.classList.add('hidden')
        savePlan()
      })
    })

    card.setAttribute('draggable', 'true')

    // dragstart: set grade levels so dragover can show the no-drop cursor for wrong grades
    card.addEventListener('dragstart', (event) => {
      draggingGradeLevels = course.grade_levels
      event.dataTransfer.setData('courseId', course.id)
      event.dataTransfer.setData('course', 'true')
      event.dataTransfer.effectAllowed = 'copy'
    })

    grid.appendChild(card)
  })
}

function openModal(course) {
  document.getElementById('modal-name').textContent = course.name

  document.getElementById('modal-description').textContent = course.description || 'No description available.'

  const rows = []

  if (course.blocks_min != null) {
    rows.push(['Blocks', course.blocks_min === course.blocks_max
        ? `${course.blocks_min}`
        : `${course.blocks_min}–${course.blocks_max}`
    ])
  }

  rows.push(['Grade Levels', course.grade_levels.join(', ')])
  rows.push(['Prerequisites', course.prereqs])
  rows.push(['Credits Toward', course.credits_toward.join(', ')])

  if (course.modules && course.modules.length) {
    rows.push(['Modules', course.modules.map(m => m.name).join(', ')])
  }

  if (course.department === 'd_blocks' && course.season) {
    rows.push(['Season(s)', course.season])
  }

  if (course.department === 'co_curriculum' && course.mods_offered?.length) {
    rows.push(['Offered in Mods', course.mods_offered.join(', ')])
  }

  if (course.rotation_cycle && course.rotation_year) {
    const y = course.rotation_year
    const fmt = yr => `${yr}–${String(yr + 1).slice(-2)}`
    rows.push(['Offered', `${fmt(y)}, ${fmt(y + 3)}, ${fmt(y + 6)} (rotates every 3 years)`])
  }

  if (course.coreqs && course.coreqs !== 'None') {
    rows.push(['Co-requisites', course.coreqs])
  }
  if (course.notes) {
    rows.push(['Notes', course.notes])
  }

  const tbody = document.querySelector('#modal-stats tbody')
  tbody.innerHTML = ''
  rows.forEach(([label, value]) => {
    const tr = document.createElement('tr')
    tr.innerHTML = `<td>${label}</td><td>${value}</td>`
    tbody.appendChild(tr)
  })

  document.getElementById('modal-overlay').classList.remove('hidden')
}

document.getElementById('modal-close').addEventListener('click', () => {
  document.getElementById('modal-overlay').classList.add('hidden')
})

document.getElementById('modal-overlay').addEventListener('click', (e) => {
  if (e.target === document.getElementById('modal-overlay')) {
    document.getElementById('modal-overlay').classList.add('hidden')
  }
})

// clicking anywhere on the page closes any open status dropdown
document.addEventListener('click', () => {
  document.querySelectorAll('.status-dropdown').forEach(d => d.classList.add('hidden'))
})

// hides grade columns for years before the student arrived at Madeira
// also clears any courses that were in those hidden grade years so they don't count
function updateGradeVisibility() {
  document.querySelectorAll('.grade-column').forEach(col => {
    const grade = parseInt(col.dataset.grade)
    const shouldHide = grade < entryGrade
    col.classList.toggle('hidden', shouldHide)

    // remove courses from grades the student wasn't here for
    if (shouldHide && planState[grade].size > 0) {
      // snapshot the ids before we start clearing
      const courseIds = Array.from(planState[grade])

      // remove plan cards from the DOM and their block selections
      col.querySelectorAll('.plan-card').forEach(card => {
        delete blocksSelectionMap[`${card.dataset.courseId}_${grade}`]
        card.remove()
      })

      // clear state FIRST so updateCatalogCard reads the now-empty grade and removes the badge
      planState[grade].clear()
      courseIds.forEach(id => updateCatalogCard(id))
      updateGradeCounter(grade)
      savePlan()
    }
  })
}

// plan panel toggle — starts collapsed (set in HTML), opens on click
const planEl     = document.getElementById('plan')
const planToggle = document.getElementById('plan-toggle')

// hide the resize handle on load since the plan starts collapsed
document.getElementById('resize-handle').style.display = 'none'

// small bounce animation plays once on load to hint the strip is clickable
planEl.classList.add('plan-bounce')
planEl.addEventListener('animationend', () => planEl.classList.remove('plan-bounce'), { once: true })

// ? button pulses once on load so students notice there's a tutorial
const helpBtn = document.getElementById('help-btn')
helpBtn.classList.add('help-bounce')
helpBtn.addEventListener('animationend', () => helpBtn.classList.remove('help-bounce'), { once: true })

function togglePlan() {
  const isCollapsed = planEl.classList.toggle('collapsed')
  planToggle.textContent     = isCollapsed ? '‹' : '›'
  planToggle.title           = isCollapsed ? 'Open plan' : 'Close plan'
  document.getElementById('resize-handle').style.display = isCollapsed ? 'none' : ''

  // clear any inline flex styles set by the resize handle so the CSS classes take over cleanly
  if (isCollapsed) {
    planEl.style.flex = ''
    document.getElementById('catalog-wrapper').style.flex = ''
  }
}

// the toggle button opens/closes the plan
planToggle.addEventListener('click', togglePlan)

// clicking anywhere on the collapsed sidebar strip also opens the plan
// (the toggle button click is already handled above — stopPropagation isn't needed
//  because togglePlan is idempotent and the button click fires first)
planEl.addEventListener('click', (event) => {
  // only act when the plan is currently collapsed
  if (!planEl.classList.contains('collapsed')) return
  // avoid double-firing if the click was directly on the toggle button
  if (event.target === planToggle) return
  togglePlan()
})

// entry grade buttons: switch which graduation requirements are shown
document.querySelectorAll('.entry-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    entryGrade = parseInt(btn.dataset.entry)
    document.querySelectorAll('.entry-btn').forEach(b => b.classList.remove('active'))
    btn.classList.add('active')
    updateGradeVisibility()
    // re-add required courses for the new entry grade (e.g. design thinking lab moves to 10th)
    autoPopulateRequired()
    updateDistributionTracker()
    savePlan()
  })
})

fetch('data/courses.json')
  .then(response => response.json())
  .then(data => {
    // turning the departments object into a list of pairs so i can loop over all at once
    Object.entries(data).forEach(([department, courses]) => {
      renderDepartment(department, courses)
    })
    // restore any saved plan from localStorage after the catalog is fully built
    // suppress requirement-met toasts during the restore so you don't get flooded on page load
    isRestoringPlan = true
    restorePlan()
    // add required locked courses (they're never saved so they always need to be re-added)
    autoPopulateRequired()
    isRestoringPlan = false
  })

const gradeColumns = document.querySelectorAll('.grade-column')

gradeColumns.forEach(column => {

  // dragover: only call preventDefault (which enables the drop) if the grade is allowed
  column.addEventListener('dragover', (event) => {
    const grade = parseInt(column.dataset.grade)
    const gradeAllowed = draggingGradeLevels.length === 0 || draggingGradeLevels.includes(grade)
    if (gradeAllowed && (event.dataTransfer.types.includes('course') || event.dataTransfer.types.includes('plan-course'))) {
      event.preventDefault()
    }
  })

  column.addEventListener('drop', (event) => {
    event.preventDefault()

    const targetGrade = parseInt(column.dataset.grade)

    // moving a plan card from one grade column to another
    if (event.dataTransfer.types.includes('plan-course')) {
      const courseId   = event.dataTransfer.getData('plan-course')
      const fromGrade  = parseInt(event.dataTransfer.getData('fromGrade'))
      const toGrade    = targetGrade

      // dropped on the same column, nothing to do
      if (fromGrade === toGrade) return

      // locked required courses stay where they are — they can't be moved
      if (courseMap[courseId]?.locked) return

      // block the move if this grade isn't in the course's allowed grade_levels
      const movedCourse = courseMap[courseId]
      if (movedCourse.grade_levels.length > 0 && !movedCourse.grade_levels.includes(toGrade)) {
        const labels = { 9: '9th', 10: '10th', 11: '11th', 12: '12th' }
        showToast(`"${movedCourse.name}" is only offered in: ${movedCourse.grade_levels.map(g => labels[g]).join(', ')}`)
        return
      }

      // already in this grade, don't add a duplicate
      if (planState[toGrade].has(courseId)) return

      planState[fromGrade].delete(courseId)
      planState[toGrade].add(courseId)

      // move the existing DOM element so notes are preserved
      // use the compound grade key so we move exactly the fromGrade copy, not a sibling grade's card
      const planCard = document.querySelector(`.plan-card[data-grade-key="${courseId}_${fromGrade}"]`)
      const dropZone = column.querySelector('.drop-zone')
      if (planCard) {
        planCard.dataset.gradeKey = `${courseId}_${toGrade}`
        dropZone.appendChild(planCard)
      }

      // update grade badge on the catalog card and sort the new column
      updateCatalogCard(courseId)
      sortDropZone(dropZone)
      updateGradeCounter(fromGrade)
      updateGradeCounter(toGrade)
      updateDistributionTracker()
      savePlan()
      return
    }

    const courseId = event.dataTransfer.getData('courseId')
    const course   = courseMap[courseId]

    // block the drop if this grade isn't in the course's allowed grade_levels
    if (course.grade_levels.length > 0 && !course.grade_levels.includes(targetGrade)) {
      const labels = { 9: '9th', 10: '10th', 11: '11th', 12: '12th' }
      showToast(`"${course.name}" is only offered in: ${course.grade_levels.map(g => labels[g]).join(', ')}`)
      return
    }

    // if this course is already in this year, do nothing
    if (planState[targetGrade].has(courseId)) return

    // d-blocks: prevent dropping a season that's already covered in this grade year
    // season field is a comma-separated string like "Fall" or "Fall, Winter, Spring"
    if (course.department === 'd_blocks' && course.season) {
      const incomingSeasons = course.season.split(',').map(s => s.trim())
      const existingDblocks = Array.from(planState[targetGrade])
        .filter(id => courseMap[id]?.department === 'd_blocks' && courseMap[id]?.season)
      const existingSeasons = existingDblocks.flatMap(id => courseMap[id].season.split(',').map(s => s.trim()))
      const conflict = incomingSeasons.find(s => existingSeasons.includes(s))
      if (conflict) {
        const labels = { 9: '9th', 10: '10th', 11: '11th', 12: '12th' }
        showToast(`You already have a ${conflict} D-block in ${labels[targetGrade]} grade.`)
        return
      }
    }

    // show prereq warning if needed — the add only happens inside the callback
    checkPrereqs(course, targetGrade, () => {
      addCourseToGrade(course, targetGrade)
      savePlan()
    })
  })
})

const catalogWrapper = document.getElementById('catalog-wrapper')

catalogWrapper.addEventListener('dragover', (event) => {
  if (event.dataTransfer.types.includes('plan-course')) event.preventDefault()
})

catalogWrapper.addEventListener('drop', (event) => {
  if (!event.dataTransfer.types.includes('plan-course')) return
  event.preventDefault()

  const courseId = event.dataTransfer.getData('plan-course')
  const grade    = parseInt(event.dataTransfer.getData('fromGrade'))

  // locked required courses need a confirmation before removal
  // students with special circumstances (health, summer completion, etc.) can still remove them
  if (courseMap[courseId]?.locked) {
    const course = courseMap[courseId]
    showConfirm(
      `"${course.name}" is a required course for all students in ${course.grade_levels}th grade.\n\nFor questions, discuss with your academic dean.\n\nAre you sure you want to remove it from your plan?`,
      () => {
        // mark as overridden so autoPopulateRequired won't re-add it on next load
        lockedOverrides.add(courseId)
        planState[grade].delete(courseId)
        delete blocksSelectionMap[`${courseId}_${grade}`]
        const planCard = document.querySelector(`.plan-card[data-grade-key="${courseId}_${grade}"]`)
        if (planCard) planCard.remove()
        updateCatalogCard(courseId)
        updateGradeCounter(grade)
        updateDistributionTracker()
        savePlan()
      }
    )
    return
  }

  planState[grade].delete(courseId)

  // clean up any saved block selection for this course/grade combo
  delete blocksSelectionMap[`${courseId}_${grade}`]

  // use the compound grade key so only this grade's copy is removed, not all copies
  const planCard = document.querySelector(`.plan-card[data-grade-key="${courseId}_${grade}"]`)
  if (planCard) planCard.remove()

  // remove grade badge and selected state from the catalog card
  updateCatalogCard(courseId)
  updateGradeCounter(grade)
  updateDistributionTracker()
  savePlan()
})

// input event every time the user types a character in the search box
document.getElementById('search').addEventListener('input', (event) => {
  const query = event.target.value.toLowerCase()

  // loop over every course card and show/hide based on whether name matches
  document.querySelectorAll('.course-card').forEach(card => {
    const name = card.querySelector('strong').textContent.toLowerCase()
    card.style.display = name.includes(query) ? 'block' : 'none'
  })
})

// clicking a nav button scrolls to that department's header
document.querySelectorAll('#dept-nav button').forEach(button => {
  button.addEventListener('click', () => {
    document.getElementById(`dept-${button.dataset.dept}`).scrollIntoView({ behavior: 'smooth' })
  })
})

// print button opens the browser's print dialog (choose "Save as PDF" there)
document.getElementById('print-btn').addEventListener('click', () => {
  window.print()
})

// ? button and site title both open the tutorial overlay
function openHelp() {
  document.getElementById('help-overlay').classList.remove('hidden')
}
document.getElementById('help-btn').addEventListener('click', openHelp)
document.getElementById('site-title').addEventListener('click', openHelp)

document.getElementById('help-close').addEventListener('click', () => {
  document.getElementById('help-overlay').classList.add('hidden')
})

// clicking the dark backdrop behind the help box also closes it
document.getElementById('help-overlay').addEventListener('click', (e) => {
  if (e.target === document.getElementById('help-overlay')) {
    document.getElementById('help-overlay').classList.add('hidden')
  }
})

// if the page was opened via the "Get started" button on the landing page,
// the URL has #tutorial — open the help overlay automatically
if (window.location.hash === '#tutorial') {
  document.getElementById('help-overlay').classList.remove('hidden')
}

// distribution requirements toggle: click the header to show/hide the table
document.getElementById('dist-toggle').addEventListener('click', () => {
  const wrap  = document.getElementById('dist-table-wrap')
  const arrow = document.getElementById('dist-arrow')
  wrap.classList.toggle('hidden')
  // ▸ when collapsed, ▾ when expanded
  arrow.textContent = wrap.classList.contains('hidden') ? '▸' : '▾'
})

// clear button wipes the entire plan after a confirmation so you can't do it by accident
document.getElementById('clear-btn').addEventListener('click', () => {
  showConfirm('Clear your entire course plan? This cannot be undone.', () => {

  // remove every plan card from the DOM
  document.querySelectorAll('.plan-card').forEach(card => card.remove())

  // reset all state
  ;[9, 10, 11, 12].forEach(g => planState[g].clear())
  Object.keys(notesMap).forEach(k => delete notesMap[k])
  Object.keys(blocksSelectionMap).forEach(k => delete blocksSelectionMap[k])
  lockedOverrides.clear()

  // update catalog cards so grade badges and selected styles clear too
  Object.keys(courseMap).forEach(id => updateCatalogCard(id))

  // refresh the counters and tracker
  ;[9, 10, 11, 12].forEach(updateGradeCounter)
  updateDistributionTracker()

  // re-add required locked courses since they were just wiped
  autoPopulateRequired()

  savePlan()

  }) // end showConfirm callback
})

// drag the resize handle to adjust how wide the catalog vs plan panels are
const resizeHandle = document.getElementById('resize-handle')
const appEl        = document.getElementById('app')

resizeHandle.addEventListener('mousedown', (e) => {
  e.preventDefault()
  resizeHandle.classList.add('dragging')
  document.addEventListener('mousemove', onResize)
  document.addEventListener('mouseup', stopResize)
})

function onResize(e) {
  const appRect = appEl.getBoundingClientRect()
  let newWidth  = e.clientX - appRect.left
  // limits: catalog at least 320px wide, plan at least 260px wide
  const minCatalog = 320
  const minPlan    = 260
  const maxCatalog = appRect.width - minPlan - 5
  newWidth = Math.max(minCatalog, Math.min(maxCatalog, newWidth))
  catalogWrapper.style.flex = `0 0 ${newWidth}px`
}

function stopResize() {
  resizeHandle.classList.remove('dragging')
  document.removeEventListener('mousemove', onResize)
  document.removeEventListener('mouseup', stopResize)
}
