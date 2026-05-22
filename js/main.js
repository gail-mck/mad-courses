
// stores every course by id so i can look it up when a card is dropped
const courseMap = {}

// will track which course ids have been dropped into each grade year
const planState = {
  9:  new Set(),
  10: new Set(),
  11: new Set(),
  12: new Set(),
}

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

// When the blocks variable has letters like "1 per season"
function formatBlocks(blocks) {
  if (blocks.includes('per') || blocks.includes('mod') || blocks === 'Yearlong') {
    return '-'
  }
  return `${blocks} block(s)`
}

// Truncate long pre-reqs
function formatPrereqs(prereqs) {
  if (prereqs.length > 60) {
    return prereqs.slice(0, 60) + '...'
  }
  return prereqs
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

        // Sets the HTML content inside the card, the text that will actually be on it
        card.innerHTML = `
          <strong>${course.name}</strong>
          <p>${formatBlocks(course.blocks)}</p>
          <p>Prereq: ${formatPrereqs(course.prereqs)}</p>
        `
        
        card.addEventListener('click', () => openModal(course))
        
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

fetch('data/courses.json')
    .then(response => response.json())
    .then(data => {

        // turning the departments object into an list of lists so I can loop over all of them at once
        Object.entries(data).forEach(([department, courses]) => {
            renderDepartment(department, courses)
        })
    })

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

const gradeColumns = document.querySelectorAll('.grade-column')

gradeColumns.forEach(column => {

  // dragover to allow drop anywhere in the column
  column.addEventListener('dragover', (event) => {
    if (event.dataTransfer.types.includes('course')) {
      event.preventDefault()
    }
  })

  column.addEventListener('drop', (event) => {
    event.preventDefault()

    const courseId = event.dataTransfer.getData('courseId')
    const course = courseMap[courseId]

    // grade is the number stored on the grade-column div in HTML
    const grade = parseInt(column.dataset.grade)

    // if this course is already in this year, do nothing
    if (planState[grade].has(courseId)) return

    // mark it as added
    planState[grade].add(courseId)

    // mark the original catalog card as selected
    const originalCard = document.querySelector(`[data-course-id="${courseId}"]`)
    if (originalCard) originalCard.classList.add('course-card--selected')

    // build the mini-card
    // ?? means use the left side if it exists, otherwise use the right side.
    const blocks = course.blocks_min || course.blocks
    // || means use the regular name if there isn't a short name, error handling
    const dept = deptShortNames[course.department] || course.department

    const item = document.createElement('li')
    item.className = 'plan-card'
    item.innerHTML = `
      <strong>${course.name}</strong>
      <span>${blocks} · ${dept}</span>
    `
    // make the plan-card draggable back to the catalog
    item.draggable = true
    item.dataset.courseId = courseId

    item.addEventListener('dragstart', (event) => {
      event.dataTransfer.setData('plan-course', courseId)
      event.dataTransfer.setData('fromGrade', String(grade))
      event.dataTransfer.effectAllowed = 'move'
    })
    // append to the drop-zone inside this column
    column.querySelector('.drop-zone').appendChild(item)
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

  const originalCard = document.querySelector(`[data-course-id="${courseId}"]`)
  if (originalCard) originalCard.classList.remove('course-card--selected')
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