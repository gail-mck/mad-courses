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

const departmentNames = {
  mathematics: 'Mathematics',
  english:     'English',
  science:     'Science',
  history:     'History',
  language:    'World Languages',
  art:         'Art',
  other:       'Design Thinking & Other Courses',
  d_blocks:    'D-Blocks',
  co_curriculum: 'Co-Curriculum',
}

// same order as the nav bar, used to sort plan cards by department
const deptOrder = [
  'mathematics', 'english', 'science', 'history',
  'language', 'art', 'other', 'd_blocks', 'co_curriculum',
]

// short department names for the mini-card
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

// When the blocks variable has letters
function formatBlocks(blocks) {
  if (!blocks) return '—'
  if (blocks.includes('per') || blocks.includes('mod')) {
    return '—'
  }
  if (blocks === 'Yearlong') {
    return 'Yearlong'
  }
  if (blocks === '1') {
    return '1 block'
  }
  else {
    return `${blocks} blocks`
  }
}

// Truncate long pre-reqs
function formatPrereqs(prereqs) {
  if (prereqs.length > 60) {
    return prereqs.slice(0, 60) + '...'
  }
  return prereqs
}

// saves the entire plan (state, notes, statuses) to localStorage so it stays between sessions
function savePlan() {
  const data = {
    plan: {
      9:  Array.from(planState[9]),
      10: Array.from(planState[10]),
      11: Array.from(planState[11]),
      12: Array.from(planState[12]),
    },
    notes:    notesMap,
    statuses: statusMap,
  }
  localStorage.setItem('madeiraPlan', JSON.stringify(data))
}

// re-renders the grade badge, selected border, and status icon on a catalog card
// called any time planState or statusMap changes for this course
function updateCatalogCard(courseId) {
  const card = document.querySelector(`.course-card[data-course-id="${courseId}"]`)
  if (!card) return

  // find ALL grades this course is currently in (e.g. chorus added to multiple years)
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
  if (gradesIn.length > 0) {
    card.classList.add('course-card--selected')
  } else {
    card.classList.remove('course-card--selected')
  }

  // green tint when marked as taken previously
  const status = statusMap[courseId]
  if (status === 'taken') {
    card.classList.add('course-card--taken')
  } else {
    card.classList.remove('course-card--taken')
  }

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
}

// sorts plan cards inside a drop-zone by department, matching the nav bar order
function sortDropZone(dropZone) {
  const cards = Array.from(dropZone.children)
  cards.sort((a, b) => {
    const deptA = courseMap[a.dataset.courseId].department
    const deptB = courseMap[b.dataset.courseId].department
    return deptOrder.indexOf(deptA) - deptOrder.indexOf(deptB)
  })
  // re-appending in sorted order physically moves the elements
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

// checks if the student has any prereqs for this course and warns them if not
function checkPrereqs(course, targetGrade) {
  if (!course.prereq_ids || course.prereq_ids.length === 0) return

  const hasPrereq = course.prereq_ids.some(prereqId => {
    // counts as having it if they marked it "taken previously"
    if (statusMap[prereqId] === 'taken') return true
    // also counts if it's in the plan for an earlier grade
    for (const [g, set] of Object.entries(planState)) {
      if (parseInt(g) < targetGrade && set.has(prereqId)) return true
    }
    return false
  })

  if (!hasPrereq) {
    showToast(`Heads up: "${course.name}" may require: ${course.prereqs}`)
  }
}

// builds a mini plan card and adds it to the correct grade column
// savedNote lets us restore a note from localStorage on page load
function addCourseToGrade(course, grade, savedNote = '') {
  const courseId = course.id

  planState[grade].add(courseId)

  // build the block display for mini-cards — use range if min and max differ
  let blocksDisplay
  if (course.department === 'd_blocks') {
    blocksDisplay = course.season
  } else if (course.department === 'co_curriculum') {
    blocksDisplay = 'Offered', course.mods_offered.join(', ')
  } else {
    blocksDisplay = course.blocks_min != null
      ? (course.blocks_min === course.blocks_max ? String(course.blocks_min) : `${course.blocks_min}–${course.blocks_max}`)
      : (course.blocks || '—')
  }

  // || means use the regular name if there isn't a short name, error handling
  const dept = deptShortNames[course.department] || course.department

  const item = document.createElement('li')
  item.className = 'plan-card'
  item.innerHTML = `
    <strong>${course.name}</strong>
    <span>${blocksDisplay} · ${dept}</span>
    <button class="note-btn" title="Add a note">✎</button>
    <input type="text" class="note-input hidden" placeholder="e.g. over the summer, ask Ms. Mahoney...">
    <span class="note-text hidden"></span>
  `

  const noteBtn  = item.querySelector('.note-btn')
  const noteInput = item.querySelector('.note-input')
  const noteText  = item.querySelector('.note-text')

  // if restoring from localStorage, show the saved note right away
  if (savedNote) {
    noteText.textContent = savedNote
    noteText.classList.remove('hidden')
  }

  // note button: click to open/close the input, blur/enter to save
  noteBtn.addEventListener('click', (e) => {
    e.stopPropagation()
    noteInput.classList.toggle('hidden')
    if (!noteInput.classList.contains('hidden')) {
      // pre-fill with existing note so you can edit it
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

  // clicking away saves the note and persists it
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
    // flag so the click that fires after dragend doesn't open the modal
    item.dataset.dragging = 'true'
    event.dataTransfer.setData('plan-course', courseId)
    // read grade from the DOM so it's correct even after the card has been moved
    event.dataTransfer.setData('fromGrade', item.closest('.grade-column').dataset.grade)
    event.dataTransfer.effectAllowed = 'move'
  })

  // append to the correct grade column's drop-zone, then sort by department
  const column = document.querySelector(`.grade-column[data-grade="${grade}"]`)
  const dropZone = column.querySelector('.drop-zone')
  dropZone.appendChild(item)
  sortDropZone(dropZone)
  updateCatalogCard(courseId)
}

// reads localStorage and rebuilds the plan after the course catalog has loaded
function restorePlan() {
  const saved = localStorage.getItem('madeiraPlan')
  if (!saved) return
  const data = JSON.parse(saved)

  // restore statuses first so updateCatalogCard works correctly when cards are added
  if (data.statuses) {
    Object.assign(statusMap, data.statuses)
  }

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
}

function renderDepartment(department, courses) {
    const catalog = document.getElementById('catalog')

    // create a header for this department
    const header = document.createElement('h2')
    header.textContent = departmentNames[department]
    // each department section gets an id so i can scroll to it
    header.id = `dept-${department}`
    catalog.appendChild(header)

    // add a horizontal line to separate
    const rule = document.createElement('hr')
    catalog.appendChild(rule)

    // grid to all cards for this department
    const grid = document.createElement('div')
    grid.className = 'course-grid'
    catalog.appendChild(grid)

    // looping over every course object in the array to add them as HTML elements
    courses.forEach(course => {
        const card = document.createElement('div')
        // store course in lookup with id as key
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
          blockLabel = formatBlocks(course.blocks)
        }

        // card-row holds the grade badge (left) and ⋮ status button (right)
        // the status-dropdown starts hidden and toggles open on ⋮ click
        card.innerHTML = `
          <div class="card-row">
            <span class="grade-badge hidden"></span>
            <button class="status-btn" title="Set status">⋮</button>
          </div>
          <strong>${course.name}</strong>
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
        const statusBtn = card.querySelector('.status-btn')
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
            if (btn.dataset.status === 'none') {
              delete statusMap[course.id]
            } else {
              statusMap[course.id] = btn.dataset.status
            }
            updateCatalogCard(course.id)
            statusDropdown.classList.add('hidden')
            savePlan()
          })
        })

        card.setAttribute('draggable', 'true')

        // dragstart the moment the user starts dragging
        card.addEventListener('dragstart', (event) => {
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
    ]);
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

fetch('data/courses.json')
    .then(response => response.json())
    .then(data => {

        // turning the departments object into an list of lists so I can loop over all of them at once
        Object.entries(data).forEach(([department, courses]) => {
            renderDepartment(department, courses)
        })

        // restore any saved plan from localStorage after the catalog is fully built
        restorePlan()
    })

const gradeColumns = document.querySelectorAll('.grade-column')

gradeColumns.forEach(column => {

  // dragover to allow drop anywhere in the column (catalog cards and plan cards both ok)
  column.addEventListener('dragover', (event) => {
    if (event.dataTransfer.types.includes('course') || event.dataTransfer.types.includes('plan-course')) {
      event.preventDefault()
    }
  })

  column.addEventListener('drop', (event) => {
    event.preventDefault()

    // moving a plan card from one grade column to another
    if (event.dataTransfer.types.includes('plan-course')) {
      const courseId = event.dataTransfer.getData('plan-course')
      const fromGrade = parseInt(event.dataTransfer.getData('fromGrade'))
      const toGrade = parseInt(column.dataset.grade)

      // dropped on the same column, nothing to do
      if (fromGrade === toGrade) return
      // already in this grade, don't add a duplicate
      if (planState[toGrade].has(courseId)) return

      planState[fromGrade].delete(courseId)
      planState[toGrade].add(courseId)

      // move the existing card element so notes are preserved
      const planCard = document.querySelector(`.plan-card[data-course-id="${courseId}"]`)
      const dropZone = column.querySelector('.drop-zone')
      if (planCard) dropZone.appendChild(planCard)

      // update grade badge on the catalog card and sort the column
      updateCatalogCard(courseId)
      sortDropZone(dropZone)
      savePlan()
      return
    }

    const courseId = event.dataTransfer.getData('courseId')
    const course = courseMap[courseId]

    // grade is the number stored on the grade-column div in HTML
    const grade = parseInt(column.dataset.grade)

    // if this course is already in this year, do nothing
    if (planState[grade].has(courseId)) return

    // warn if none of the prereqs are in the plan or marked as taken
    checkPrereqs(course, grade)

    // build and add the mini card, update the catalog card, save
    addCourseToGrade(course, grade)
    savePlan()
  })
})

const catalogWrapper = document.getElementById('catalog-wrapper')

catalogWrapper.addEventListener('dragover', (event) => {
  if (event.dataTransfer.types.includes('plan-course')) {
    event.preventDefault()
  }
})

catalogWrapper.addEventListener('drop', (event) => {
  if (!event.dataTransfer.types.includes('plan-course')) return
  event.preventDefault()

  const courseId = event.dataTransfer.getData('plan-course')
  const grade = parseInt(event.dataTransfer.getData('fromGrade'))

  planState[grade].delete(courseId)

  const planCard = document.querySelector(`.plan-card[data-course-id="${courseId}"]`)
  if (planCard) planCard.remove()

  // remove grade badge and selected state from the catalog card
  updateCatalogCard(courseId)
  savePlan()
})

// input event every time the user types a character
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
    const id = `dept-${button.dataset.dept}`
    document.getElementById(id).scrollIntoView({ behavior: 'smooth' })
  })
})

// print button opens the browser's print dialog (choose "Save as PDF" there)
document.getElementById('print-btn').addEventListener('click', () => {
  window.print()
})

// drag the resize handle to adjust how wide the catalog vs plan panels are
const resizeHandle = document.getElementById('resize-handle')
const appEl = document.getElementById('app')

resizeHandle.addEventListener('mousedown', (e) => {
  e.preventDefault()
  resizeHandle.classList.add('dragging')
  document.addEventListener('mousemove', onResize)
  document.addEventListener('mouseup', stopResize)
})

function onResize(e) {
  const appRect = appEl.getBoundingClientRect()
  let newWidth = e.clientX - appRect.left
  // limits: catalog at least 320px wide, plan at least 260px wide
  const minCatalog = 320
  const minPlan = 260
  const maxCatalog = appRect.width - minPlan - 5
  newWidth = Math.max(minCatalog, Math.min(maxCatalog, newWidth))
  catalogWrapper.style.flex = `0 0 ${newWidth}px`
}

function stopResize() {
  resizeHandle.classList.remove('dragging')
  document.removeEventListener('mousemove', onResize)
  document.removeEventListener('mouseup', stopResize)
}
