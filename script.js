document.addEventListener('DOMContentLoaded', () => {
  const pageSize = 100;
  let allCars = [];
  let currentData = [];
  let displayCount = 0;
  let currentSortKey = null;
  let currentSortDir = 'asc';

  // 1) Fetch newline-delimited JSON
  fetch('JSON_data/sold_cars.json')
    .then(res => res.text())
    .then(text => {
      text.trim().split('\n').forEach(line => {
        try {
          const obj = JSON.parse(line);
          const car = {};

          // Combine “Make + Model” into brand for a few edge cases
          if ((obj.make === 'Mercedes' && obj.model === 'Benz') ||
              (obj.make === 'Land'     && obj.model === 'Rover') ||
              (obj.make === 'Alfa'     && obj.model === 'Romeo') ||
              (obj.make === 'Great'    && obj.model === 'Wall')) {
            car.brand = `${obj.make} ${obj.model}`;
          } else {
            car.brand = obj.make;
          }

          car.make = obj.make;
          car.model = obj.model;
          car.variant = obj.variant || '';
          car.body = obj['Body Type'] === '?' ? '' : obj['Body Type'];
          car.location = obj.Location === '?' ? '' : obj.Location;
          car.year = obj.year || 0;

          let odo = obj['Indicated Odometer Reading'];
          if (typeof odo === 'string') odo = odo.replace(/,/g, '');
          car.odometer = parseInt(odo) || 0;

          car.date = obj.date || '';
          car.bids = obj.bids || 0;

          let eng = obj['Engine Capacity'];
          if (typeof eng === 'string') eng = (eng === '?' ? '' : eng);
          car.engine = parseFloat(eng) || 0;

          car.fuel = obj['Fuel Type'] === '?' ? '' : obj['Fuel Type'];
          car.transmission = obj.Transmission ? obj.Transmission.toLowerCase() : '';
          car.price = obj.price || 0;

          // Category for sidebar
          const v = (obj.variant || '').toLowerCase();
          car.category = v.includes('motorcycle') ? 'Motorcycle' : 'Vehicle';

          car.url = obj.url || '#';
          allCars.push(car);
        } catch (e) {
          console.error('JSON parse error:', e);
        }
      });

      initFilters();
      updateResults();
      document.getElementById('loading').style.display = 'none';
      document.getElementById('results-table').style.display = 'table';
      document.getElementById('load-more').style.display =
        displayCount < currentData.length ? 'block' : 'none';
    });

  // 2) Build and wire up all filter controls
  function initFilters() {
    // Collect sets
    const locSet   = new Set(),
          bodySet  = new Set(),
          brandSet = new Set(),
          fuelSet  = new Set(),
          modelsByBrand = {};

    allCars.forEach(c => {
      if (c.location)   locSet.add(c.location);
      if (c.body)       bodySet.add(c.body);
      if (c.brand) {
        brandSet.add(c.brand);
        modelsByBrand[c.brand] = modelsByBrand[c.brand] || new Set();
        if (c.model && c.model !== '?' && !c.brand.endsWith(c.model)) {
          modelsByBrand[c.brand].add(c.model);
        }
      }
      if (c.fuel)       fuelSet.add(c.fuel);
    });

    // Helper to inject checkboxes
    const inject = (id, items) => {
      document.getElementById(id).innerHTML =
        items.map(val => {
          const safe = val.replace(/\s+/g,'-');
          return `<label><input type="checkbox" value="${val}" id="${id}-${safe}"> ${val}</label>`;
        }).join('');
    };

    inject('filter-location', Array.from(locSet).sort());
    inject('filter-body',     Array.from(bodySet).sort());
    inject('filter-make',     Array.from(brandSet).sort());
    inject('filter-fuel',     Array.from(fuelSet).sort());

    // Collapsible groups
    document.querySelectorAll('.filter-header').forEach(h => {
      h.addEventListener('click', () => {
        h.parentElement.classList.toggle('collapsed');
      });
    });

    // Wiring filter events
    const doUpdate = () => {
      updateModelOptions(modelsByBrand);
      updateResults();
    };
    document.getElementById('filter-make').addEventListener('change', doUpdate);
    document.getElementById('filter-model').addEventListener('change', updateResults);
    document.getElementById('filter-location').addEventListener('change', updateResults);
    document.getElementById('filter-body').addEventListener('change', updateResults);
    document.getElementById('filter-fuel').addEventListener('change', updateResults);
    document.getElementById('category-vehicle').addEventListener('change', updateResults);
    document.getElementById('category-motorcycle').addEventListener('change', updateResults);
    document.getElementById('trans-auto').addEventListener('change', updateResults);
    document.getElementById('trans-manual').addEventListener('change', updateResults);

    ['price-min','price-max','year-min','year-max','odom-min','odom-max','engine-min','engine-max']
      .forEach(id => document.getElementById(id).addEventListener('input', updateResults));

    // Sort on header click
    document.querySelectorAll('#results-table thead th').forEach(th => {
      th.addEventListener('click', () => {
        const key = th.dataset.key;
        if (!key) return;
        if (currentSortKey === key) {
          currentSortDir = (currentSortDir === 'asc' ? 'desc' : 'asc');
        } else {
          currentSortKey = key;
          currentSortDir = 'asc';
        }
        document.querySelectorAll('#results-table thead th')
          .forEach(h => h.classList.remove('sorted-asc','sorted-desc'));
        th.classList.add(currentSortDir==='asc'?'sorted-asc':'sorted-desc');
        updateResults();
      });
    });

    document.getElementById('load-more').addEventListener('click', loadMore);
  }

  // 3) Populate Model options based on chosen Make(s)
  function updateModelOptions(modelsByBrand) {
    const selMakes = Array.from(
      document.querySelectorAll('#filter-make input:checked')
    ).map(cb => cb.value);
    const cont = document.getElementById('filter-model');
    cont.innerHTML = '';
    if (!selMakes.length) return;
    const models = new Set();
    selMakes.forEach(mk => (modelsByBrand[mk]||[]).forEach(md => models.add(md)));
    cont.innerHTML = Array.from(models).sort().map(md => {
      const safe = md.replace(/\s+/g,'-');
      return `<label><input type="checkbox" value="${md}" id="filter-model-${safe}"> ${md}</label>`;
    }).join('');
  }

  // 4) Main filter + sort + paginate logic
  function updateResults() {
    // Read filters...
    const catV = document.getElementById('category-vehicle').checked;
    const catM = document.getElementById('category-motorcycle').checked;
    const locs = new Set(Array.from(document.querySelectorAll('#filter-location input:checked'))
                         .map(cb => cb.value));
    const bods = new Set(Array.from(document.querySelectorAll('#filter-body input:checked'))
                         .map(cb => cb.value));
    const brs  = new Set(Array.from(document.querySelectorAll('#filter-make input:checked'))
                         .map(cb => cb.value));
    const mds  = new Set(Array.from(document.querySelectorAll('#filter-model input:checked'))
                         .map(cb => cb.value));
    const fa   = document.getElementById('trans-auto').checked;
    const fm   = document.getElementById('trans-manual').checked;
    const pmin = parseFloat(document.getElementById('price-min').value) || -Infinity;
    const pmax = parseFloat(document.getElementById('price-max').value) || Infinity;
    const ymin = parseInt(document.getElementById('year-min').value) || -Infinity;
    const ymax = parseInt(document.getElementById('year-max').value) || Infinity;
    const omin = parseInt(document.getElementById('odom-min').value) || -Infinity;
    const omax = parseInt(document.getElementById('odom-max').value) || Infinity;
    const emin = parseFloat(document.getElementById('engine-min').value) || -Infinity;
    const emax = parseFloat(document.getElementById('engine-max').value) || Infinity;
    const fus  = new Set(Array.from(document.querySelectorAll('#filter-fuel input:checked'))
                         .map(cb => cb.value));

    currentData = allCars.filter(c => {
      if (catV && !catM && c.category!=='Vehicle') return false;
      if (catM && !catV && c.category!=='Motorcycle') return false;
      if (c.price < pmin || c.price > pmax)            return false;
      if (c.year  < ymin || c.year  > ymax)            return false;
      if (locs.size && !locs.has(c.location))          return false;
      if (bods.size && !bods.has(c.body))              return false;
      if (brs.size  && !brs.has(c.brand))              return false;
      if (mds.size  && !mds.has(c.model))              return false;
      if (fa&&fm) { /* no filter */ }
      else if (fa)   { if (!/auto|cvt|direct/.test(c.transmission)) return false; }
      else if (fm)   { if (!/man/.test(c.transmission))             return false; }
      if (c.odometer < omin || c.odometer > omax)    return false;
      if (c.engine   < emin || c.engine   > emax)    return false;
      if (fus.size && !fus.has(c.fuel))              return false;
      return true;
    });

    // Sort
    if (currentSortKey) {
      currentData.sort((a,b) => {
        let A = a[currentSortKey], B = b[currentSortKey];
        if (typeof A==='string') { A=A.toLowerCase(); B=B.toLowerCase(); }
        if (A<B) return currentSortDir==='asc' ? -1 : 1;
        if (A>B) return currentSortDir==='asc' ? 1 : -1;
        return 0;
      });
    }

    // Render first page
    const tbody = document.querySelector('#results-table tbody');
    tbody.innerHTML = '';
    displayCount = 0;
    if (!currentData.length) {
      document.getElementById('no-results').style.display = 'block';
      document.getElementById('load-more').style.display = 'none';
      return;
    }
    document.getElementById('no-results').style.display = 'none';
    loadMore();
  }

  // 5) Load next “page” onto the table
  function loadMore() {
    const tbody = document.querySelector('#results-table tbody');
    const start = displayCount;
    const end   = Math.min(displayCount + pageSize, currentData.length);
    for (let i = start; i < end; i++) {
      const c = currentData[i];
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${c.year}</td>
        <td>${c.brand}</td>
        <td>${c.model}</td>
        <td>${c.variant}</td>
        <td>${c.body}</td>
        <td>${c.location}</td>
        <td>${c.odometer.toLocaleString()}</td>
        <td>${c.date}</td>
        <td>${c.price.toLocaleString()}</td>
        <td>${c.bids}</td>
        <td><a href="${c.url}" target="_blank">View</a></td>
      `;
      tbody.appendChild(row);
    }
    displayCount = end;
    document.getElementById('load-more').style.display =
      displayCount < currentData.length ? 'block' : 'none';
  }
});
