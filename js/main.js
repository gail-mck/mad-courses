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

// grade level of whatever card is currently being dragged
// dragover reads this to show the no-drop cursor before a drop fires
let draggingGradeLevels = []

// graduation requirements by entry grade (source: Madeira Course Catalog 2025-26, pp. 5-13)
// history totals include the 1 research credit (earned via US History or Research Seminar)
const REQUIREMENTS = {
  9:  { English: 12, Mathematics: 12, Science: 9, History: 9, 'World Languages': 9, Art: 3, 'Co-Curriculum': 3 },
  10: { English: 9,  Mathematics: 9,  Science: 6, History: 6, 'World Languages': 6, Art: 3, 'Co-Curriculum': 3 },
  11: { English: 6,  Mathematics: 6,  Science: 3, History: 3, 'World Languages': 3, Art: 3, 'Co-Curriculum': 2 },
}

// d-blocks that count as "team experiences" (source: catalog p. 16 — group/team-based activities)
const TEAM_DBLOCKS = new Set([
  'cross-country', 'field-hockey', 'soccer', 'volleyball', 'tennis-fall',
  'basketball', 'rock-climbing', 'swimming-diving', 'lacrosse', 'softball',
  'tennis-spring', 'track-field', 'riding',
  'dance', 'play', 'musical', 'theater-showcase',
  'student-publications-spectator', 'student-publications-gate', 'yearbook',
  'model-un', 'math-team', 'esports',
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

// returns the number of academic blocks a course counts for in a given grade year
// used by the per-grade counter and the distribution tracker
function getBlocksCount(courseId, grade) {
  const course = courseMap[courseId]
  if (!course) return 0
  // yearlong evening classes (Chorus, Orchestra, Stagecraft) earn 3 credits per year
  if (course.blocks === 'Yearlong') return 3
  if (course.blocks_min == null) return 0
  // for range courses use whatever the student picked, defaulting to the minimum
  if (course.blocks_min !== course.blocks_max) {
    return blocksSelectionMap[`${courseId}_${grade}`] || course.blocks_min
  }
  return course.blocks_min
}

// saves the entire plan (state, notes, statuses, block selections, entry grade) to localStorage
function savePlan() {
  const data = {
    entryGrade,
    plan: {
      9:  Array.from(planState[9]),
      10: Array.from(planState[10]),
      11: Array.from(planState[11]),
      12: Array.from(planState[12]),
    },
    notes:           notesMap,
    statuses:        statusMap,
    blocksSelection: blocksSelectionMap,
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

// recalculates and displays the academic block total for one grade column
// d_blocks and co_curriculum don't count toward the 18–21 academic block target
function updateGradeCounter(grade) {
  let total = 0
  planState[grade].forEach(courseId => {
    const course = courseMap[courseId]
    if (!course) return
    if (course.department === 'd_blocks' || course.department === 'co_curriculum') return
    total += getBlocksCount(courseId, grade)
  })
  const counter = document.getElementById(`counter-${grade}`)
  if (!counter) return
  const inRange = total >= 18 && total <= 21
  if (total === 0) {
    // nothing added yet — show neutral placeholder
    counter.textContent = '0/21 blocks'
    counter.className = 'block-counter'
  } else if (inRange) {
    counter.textContent = `${total}/21 blocks ✓`
    counter.className = 'block-counter good'
  } else {
    counter.textContent = `${total}/21 blocks ✗`
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
      const blocks = getBlocksCount(courseId, parseInt(grade))
      course.credits_toward.forEach(credit => {
        totals[credit] = (totals[credit] || 0) + blocks
      })
    })
  })

  // co-curriculum counts as one internship per course, not by block total
  const cocurriculumCount = Array.from(courseIdsInPlan)
    .filter(id => courseMap[id]?.department === 'co_curriculum').length

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
  function addRow(label, current, required) {
    const met = current >= required
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

  addRow('Co-Curriculum', cocurriculumCount, req['Co-Curriculum'])

  // student life is only required for students who entered in 9th grade
  if (entryGrade === 9) {
    addSubRow(`Student Life ${check(courseIdsInPlan.has('student-life'))}`)
  }

  // design thinking lab required for 9th grade entry and new 10th grade entry
  if (entryGrade <= 10) {
    addSubRow(`Design Thinking Lab ${check(courseIdsInPlan.has('design-thinking-lab'))}`)
  }
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

  // clicking the plan card opens the same modal as the catalog card
  // item.dataset.dragging guards against the click that fires at the end of a drag
  item.addEventListener('click', () => {
    if (item.dataset.dragging === 'true') {
      delete item.dataset.dragging
      return
    }
    openModal(course)
  })

  item.draggable = true
  item.dataset.courseId = courseId

  item.addEventListener('dragstart', (event) => {
    item.dataset.dragging = 'true'
    draggingGradeLevels = course.grade_levels
    event.dataTransfer.setData('plan-course', courseId)
    // read grade from the DOM so it's correct even after the card has been moved
    event.dataTransfer.setData('fromGrade', item.closest('.grade-column').dataset.grade)
    event.dataTransfer.effectAllowed = 'move'
  })

  // append to the correct grade column's drop-zone, then sort by department
  const column   = document.querySelector(`.grade-column[data-grade="${grade}"]`)
  const dropZone = column.querySelector('.drop-zone')
  dropZone.appendChild(item)
  sortDropZone(dropZone)
  updateCatalogCard(courseId)
  updateGradeCounter(grade)
  updateDistributionTracker()
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

    // card-row: grade badge (left), course name (center, flex:1), ⋮ button (right)
    // putting them all on one row removes the blank top gap from the old layout
    card.innerHTML = `
      <div class="card-row">
        <span class="grade-badge hidden"></span>
        <strong>${course.name}</strong>
        <button class="status-btn" title="Set status">⋮</button>
      </div>
      <p>${blockLabel}</p>
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

planToggle.addEventListener('click', () => {
  const isCollapsed = planEl.classList.toggle('collapsed')
  planToggle.textContent     = isCollapsed ? '‹' : '›'
  planToggle.title           = isCollapsed ? 'Open plan' : 'Close plan'
  document.getElementById('resize-handle').style.display = isCollapsed ? 'none' : ''

  // clear any inline flex styles set by the resize handle so the CSS classes take over cleanly
  if (isCollapsed) {
    planEl.style.flex = ''
    document.getElementById('catalog-wrapper').style.flex = ''
  }
})

// entry grade buttons: switch which graduation requirements are shown
document.querySelectorAll('.entry-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    entryGrade = parseInt(btn.dataset.entry)
    document.querySelectorAll('.entry-btn').forEach(b => b.classList.remove('active'))
    btn.classList.add('active')
    updateGradeVisibility()
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
    restorePlan()
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
      const planCard = document.querySelector(`.plan-card[data-course-id="${courseId}"]`)
      const dropZone = column.querySelector('.drop-zone')
      if (planCard) dropZone.appendChild(planCard)

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

  planState[grade].delete(courseId)

  // clean up any saved block selection for this course/grade combo
  delete blocksSelectionMap[`${courseId}_${grade}`]

  const planCard = document.querySelector(`.plan-card[data-course-id="${courseId}"]`)
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

  // update catalog cards so grade badges and selected styles clear too
  Object.keys(courseMap).forEach(id => updateCatalogCard(id))

  // refresh the counters and tracker
  ;[9, 10, 11, 12].forEach(updateGradeCounter)
  updateDistributionTracker()
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
