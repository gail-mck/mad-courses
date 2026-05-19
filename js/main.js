fetch('data/courses.json')
    .then(response => response.json())
    .then(data => {

        // Turning the departments object into an array of arrays so we can loop over all of them at once
        Object.entries(data).forEach(([department, courses]) => {
            renderDepartment(department, courses)
        })
    })

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
    return 'varies'
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
    catalog.appendChild(header)
    
    const rule = document.createElement('hr')
    catalog.appendChild(rule)

    // looping over every course object in the array to add them as HTML elements
    courses.forEach(course => {
        const card = document.createElement('div')
        card.className = 'course-card'

        // Sets the HTML content inside the card, the text that will actually be on it
        card.innerHTML = `
          <strong>${course.name}</strong>
          <p>${formatBlocks(course.blocks)}</p>
          <p>Prereq: ${formatPrereqs(course.prereqs)}</p>
        `
        catalog.appendChild(card)
    })
}
