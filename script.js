let allCars = [];
let filteredCars = [];
let currentPage = 0;
const PAGE_SIZE = 50;
let currentSortField = 'price';
let currentSortOrder = 'asc';
let activeFilters = {
  year: [0, Infinity],
  mileage: [0, Infinity],
  make: new Set(),
  model: new Set(),
  body: new Set(),
  fuel: new Set(),
  location: new Set()
};

fetch('JSON_data/sold_cars.json')
  .then(res => res.text())
  .then(text => {
    allCars = text.trim().split('\n').map(line => JSON.parse(line));
    filteredCars = [...allCars];
    initFilters();
    applyFilters();
    setupSort();
    setupScrollObserver();
    setupBackToTop();
    console.log("Data loaded", allCars.length, "cars");
  })
  .catch(err => console.error("Failed to load data:", err));

function renderNextPage() {
  const start = currentPage * PAGE_SIZE;
  const end = start + PAGE_SIZE;
  const carsToRender = filteredCars.slice(start, end);
  const list = document.getElementById('car-list');

  carsToRender.forEach(car => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${car.year || 'N/A'}</td>
      <td>${car.make || ''}</td>
      <td>${car.model || ''}</td>
      <td>${car.variant || ''}</td>
      <td>${car['Body Type'] || ''}</td>
      <td>${car['Fuel Type'] || ''}</td>
      <td>${car['Indicated Odometer Reading'] || 'N/A'}</td>
      <td>${car.date || 'N/A'}</td>
      <td>$${car.price ? car.price.toLocaleString() : 'N/A'}</td>
      <td>${car['Location'] || 'N/A'}</td>
      <td>${car.bids || 0}</td>
      <td><a href="${car.url || '#'}" target="_blank">View</a></td>
    `;
    list.appendChild(row);
  });
  currentPage++;
}

function setupScrollObserver() {
  const observer = new IntersectionObserver(entries => {
    if (entries[0].isIntersecting && currentPage * PAGE_SIZE < filteredCars.length) {
      renderNextPage();
    }
  }, { threshold: 1.0 });
  observer.observe(document.getElementById('load-more-trigger'));
}

function setupBackToTop() {
  const btn = document.getElementById('backToTop');
  window.addEventListener('scroll', () => {
    btn.style.display = window.scrollY > 200 ? 'block' : 'none';
  });
  btn.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
}

function setupSort() {
  document.getElementById('sortField').addEventListener('change', e => {
    currentSortField = e.target.value;
    applyFilters();
  });
  document.getElementById('sortOrderToggle').addEventListener('click', () => {
    currentSortOrder = currentSortOrder === 'asc' ? 'desc' : 'asc';
    document.getElementById('sortOrderToggle').textContent = currentSortOrder === 'asc' ? '↑' : '↓';
    applyFilters();
  });
}

function applyFilters() {
  filteredCars = allCars.filter(car => {
    const mileage = parseInt((car['Indicated Odometer Reading'] || '').replace(/[^\d]/g, '')) || 0;
    const year = parseInt(car.year) || 0;

    const passes =
      year >= activeFilters.year[0] && year <= activeFilters.year[1] &&
      mileage >= activeFilters.mileage[0] && mileage <= activeFilters.mileage[1] &&
      (activeFilters.make.size === 0 || activeFilters.make.has(car.make)) &&
      (activeFilters.model.size === 0 || activeFilters.model.has(car.model)) &&
      (activeFilters.body.size === 0 || activeFilters.body.has(car['Body Type'])) &&
      (activeFilters.fuel.size === 0 || activeFilters.fuel.has(car['Fuel Type'])) &&
      (activeFilters.location.size === 0 || activeFilters.location.has(car['Location']));

    return passes;
  });

  filteredCars.sort((a, b) => {
    let valA = a[currentSortField] ?? '';
    let valB = b[currentSortField] ?? '';
    if (!isNaN(valA) && !isNaN(valB)) {
      valA = Number(valA);
      valB = Number(valB);
    } else {
      valA = String(valA).toLowerCase();
      valB = String(valB).toLowerCase();
    }
    if (valA < valB) return currentSortOrder === 'asc' ? -1 : 1;
    if (valA > valB) return currentSortOrder === 'asc' ? 1 : -1;
    return 0;
  });

  currentPage = 0;
  document.getElementById('car-list').innerHTML = '';
  renderNextPage();
}

function createCheckboxFilter(id, label, values, key, onChange = null) {
  const container = document.getElementById(id);
  container.innerHTML = `<strong>${label}</strong><br>`;
  const listDiv = document.createElement('div');
  listDiv.className = 'filter-list';

  values.forEach((val, index) => {
    const wrapper = document.createElement('div');
    wrapper.classList.add('filter-item');
    if (index >= 5) wrapper.classList.add('hidden');

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.value = val;
    checkbox.addEventListener('change', () => {
      activeFilters[key][checkbox.checked ? 'add' : 'delete'](val);
      if (onChange) onChange();
      applyFilters();
    });
    wrapper.appendChild(checkbox);
    wrapper.appendChild(document.createTextNode(' ' + val));
    listDiv.appendChild(wrapper);
  });

  container.appendChild(listDiv);

  if (values.length > 5) {
    const toggleBtn = document.createElement('button');
    toggleBtn.textContent = 'More';
    toggleBtn.className = 'more-btn';
    toggleBtn.style.marginTop = '5px';
    toggleBtn.style.background = '#eee';
    toggleBtn.style.border = 'none';
    toggleBtn.style.padding = '5px 10px';
    toggleBtn.style.borderRadius = '5px';
    toggleBtn.style.cursor = 'pointer';
    toggleBtn.style.fontSize = '12px';
    toggleBtn.style.color = '#333';

    toggleBtn.addEventListener('click', () => {
      const hiddenItems = listDiv.querySelectorAll('.hidden');
      hiddenItems.forEach(item => item.classList.toggle('hidden'));
      toggleBtn.textContent = toggleBtn.textContent === 'More' ? 'Less' : 'More';
    });
    container.appendChild(toggleBtn);
  }
}

function createRangeFilter(id, label, min, max, key) {
  const container = document.getElementById(id);
  container.innerHTML = `<strong>${label}</strong><br>`;
  const inputMin = document.createElement('input');
  const inputMax = document.createElement('input');
  inputMin.type = 'number';
  inputMax.type = 'number';
  inputMin.value = min;
  inputMax.value = max;
  inputMin.addEventListener('input', () => {
    activeFilters[key][0] = Number(inputMin.value);
    applyFilters();
  });
  inputMax.addEventListener('input', () => {
    activeFilters[key][1] = Number(inputMax.value);
    applyFilters();
  });
  container.appendChild(document.createTextNode('Min: '));
  container.appendChild(inputMin);
  container.appendChild(document.createElement('br'));
  container.appendChild(document.createTextNode('Max: '));
  container.appendChild(inputMax);
}

function initFilters() {
  const makes = [...new Set(allCars.map(c => c.make).filter(Boolean))].sort();
  createCheckboxFilter('filter-make', 'Make', makes, 'make', updateModelFilter);
  updateModelFilter(); // initialize model filter

  const bodies = [...new Set(allCars.map(c => c['Body Type']).filter(Boolean))].sort();
  const fuels = [...new Set(allCars.map(c => c['Fuel Type']).filter(Boolean))].sort();
  const locations = [...new Set(allCars.map(c => c['Location']).filter(Boolean))].sort();
  const years = allCars.map(c => parseInt(c.year)).filter(y => !isNaN(y));
  const mileages = allCars.map(c => parseInt((c['Indicated Odometer Reading'] || '').replace(/[^\d]/g, ''))).filter(m => !isNaN(m));

  createCheckboxFilter('filter-body', 'Body Type', bodies, 'body');
  createCheckboxFilter('filter-fuel', 'Fuel Type', fuels, 'fuel');
  createCheckboxFilter('filter-location', 'Location', locations, 'location');
  createRangeFilter('filter-year', 'Year', Math.min(...years), Math.max(...years), 'year');
  createRangeFilter('filter-mileage', 'Mileage', Math.min(...mileages), Math.max(...mileages), 'mileage');

  document.getElementById('resetFilters').addEventListener('click', () => {
    Object.keys(activeFilters).forEach(key => {
      if (Array.isArray(activeFilters[key])) activeFilters[key] = [0, Infinity];
      else activeFilters[key].clear();
    });
    initFilters();
    applyFilters();
  });
}

function updateModelFilter() {
  const selectedMakes = activeFilters.make;
  let relevantModels;

  if (selectedMakes.size === 0) {
    relevantModels = [...new Set(allCars.map(c => c.model).filter(Boolean))].sort();
  } else {
    relevantModels = [...new Set(
      allCars.filter(c => selectedMakes.has(c.make)).map(c => c.model).filter(Boolean)
    )].sort();
  }

  const newModelSet = new Set(relevantModels);
  for (const model of activeFilters.model) {
    if (!newModelSet.has(model)) {
      activeFilters.model.delete(model);
    }
  }

  createCheckboxFilter('filter-model', 'Model', relevantModels, 'model');
}
