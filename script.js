document.addEventListener('DOMContentLoaded', () => {
  const pageSize = 20;
  let allCars = [], currentData = [], displayCount = 0;
  let currentSortKey = null, currentSortDir = 'asc';

  // 1. Load and parse newline-delimited JSON
  fetch('JSON_data/sold_cars.json')
    .then(res => res.text())
    .then(text => {
      text.trim().split('\n').forEach(line => {
        try {
          const obj = JSON.parse(line);
          const car = {};

          // Combine a few edge-case make+model into brand
          if ((obj.make === 'Mercedes' && obj.model === 'Benz') ||
              (obj.make === 'Land'     && obj.model === 'Rover') ||
              (obj.make === 'Alfa'     && obj.model === 'Romeo') ||
              (obj.make === 'Great'    && obj.model === 'Wall')) {
            car.brand = `${obj.make} ${obj.model}`;
          } else {
            car.brand = obj.make;
          }

          car.make         = obj.make;
          car.model        = obj.model;
          car.variant      = obj.variant || '';
          car.body         = obj['Body Type'] === '?' ? '' : obj['Body Type'];
          car.location     = obj.Location === '?' ? '' : obj.Location;
          car.year         = obj.year || 0;

          let odo = obj['Indicated Odometer Reading'];
          if (typeof odo === 'string') odo = odo.replace(/,/g, '');
          car.odometer     = parseInt(odo, 10) || 0;

          car.date         = obj.date || '';
          car.bids         = obj.bids || 0;

          let eng = obj['Engine Capacity'];
          if (typeof eng === 'string') eng = (eng === '?' ? '' : eng);
          car.engine       = parseFloat(eng) || 0;

          car.fuel         = obj['Fuel Type'] === '?' ? '' : obj['Fuel Type'];
          car.transmission = obj.Transmission ? obj.Transmission.toLowerCase() : '';
          car.price        = obj.price || 0;

          const v = (obj.variant || '').toLowerCase();
          car.category     = v.includes('motorcycle') ? 'Motorcycle' : 'Vehicle';

          car.url          = obj.url || '#';
          allCars.push(car);
        } catch (e) {
          console.error('JSON parse error:', e);
        }
      });

      initFilters();
      updateResults();
      document.getElementById('loading').style.display = 'none';
      document.getElementById('results-table').style.display = 'table';
      document.getElementById('load-more').style.display = displayCount < currentData.length ? 'block' : 'none';
    });

  // 2. Build filters and wire events
  function initFilters() {
    const locSet = new Set(), bodySet = new Set(),
          brandSet = new Set(), fuelSet = new Set(),
          modelsByBrand = {};

    allCars.forEach(c => {
      if (c.location) locSet.add(c.location);
      if (c.body)     bodySet.add(c.body);
      if (c.brand) {
        brandSet.add(c.brand);
        modelsByBrand[c.brand] = modelsByBrand[c.brand] || new Set();
        if (c.model && c.model !== '?' && !c.brand.endsWith(c.model)) {
          modelsByBrand[c.brand].add(c.model);
        }
      }
      if (c.fuel) fuelSet.add(c.fuel);
    });

    const inject = (id, arr) =>
      document.getElementById(id).innerHTML =
        Array.from(arr).sort()
          .map(v => `<label><input type="checkbox" value="${v}" id="${id}-${v.replace(/\s+/g,'-')}"> ${v}</label>`)
          .join('');

    inject('filter-location', locSet);
    inject('filter-body',     bodySet);
    inject('filter-make',     brandSet);
    inject('filter-fuel',     fuelSet);

    document.querySelectorAll('.filter-header').forEach(h =>
      h.addEventListener('click', () => h.parentElement.classList.toggle('collapsed'))
    );

    const doUpdate = () => {
      updateModelOptions(modelsByBrand);
      updateResults();
    };
    document.getElementById('filter-make').addEventListener('change', doUpdate);
    document.getElementById('filter-model').addEventListener('change', updateResults);
    ['filter-location','filter-body','filter-fuel'].forEach(id =>
      document.getElementById(id).addEventListener('change', updateResults)
    );
    ['category-vehicle','category-motorcycle','trans-auto','trans-manual']
      .forEach(id => document.getElementById(id).addEventListener('change', updateResults));
    ['price-min','price-max','year-min','year-max','odom-min','odom-max','engine-min','engine-max']
      .forEach(id => document.getElementById(id).addEventListener('input', updateResults));
    document.getElementById('load-more').addEventListener('click', loadMore);

    document.querySelectorAll('#results-table thead th').forEach(th => {
      th.addEventListener('click', () => {
        const key = th.dataset.key;
        if (!key) return;
        if (currentSortKey === key) {
          currentSortDir = currentSortDir === 'asc' ? 'desc' : 'asc';
        } else {
          currentSortKey = key;
          currentSortDir = 'asc';
        }
        document.querySelectorAll('#results-table thead th')
          .forEach(h => h.classList.remove('sorted-asc','sorted-desc'));
        th.classList.add(currentSortDir === 'asc' ? 'sorted-asc' : 'sorted-desc');
        updateResults();
      });
    });

    // Delegate view-link clicks
    document.body.addEventListener('click', e => {
      if (e.target.matches('.view-link')) {
        e.preventDefault();
        openImageModal(e.target.dataset.url);
      }
    });
  }

  // 3. Populate Model options based on Make selection
  function updateModelOptions(mBB) {
    const sel = Array.from(document.querySelectorAll('#filter-make input:checked'))
                     .map(cb => cb.value);
    const cont = document.getElementById('filter-model');
    cont.innerHTML = '';
    if (!sel.length) return;
    const s = new Set();
    sel.forEach(b => (mBB[b] || []).forEach(m => s.add(m)));
    cont.innerHTML = Array.from(s).sort().map(m =>
      `<label><input type="checkbox" value="${m}" id="filter-model-${m.replace(/\s+/g,'-')}"> ${m}</label>`
    ).join('');
  }

  // 4. Filter, sort, and render results
  function updateResults() {
    const catV = document.getElementById('category-vehicle').checked;
    const catM = document.getElementById('category-motorcycle').checked;
    const locs = new Set(Array.from(document.querySelectorAll('#filter-location input:checked')).map(cb => cb.value));
    const bods = new Set(Array.from(document.querySelectorAll('#filter-body input:checked')).map(cb => cb.value));
    const brs  = new Set(Array.from(document.querySelectorAll('#filter-make input:checked')).map(cb => cb.value));
    const mds  = new Set(Array.from(document.querySelectorAll('#filter-model input:checked')).map(cb => cb.value));
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
    const fus  = new Set(Array.from(document.querySelectorAll('#filter-fuel input:checked')).map(cb => cb.value));

    currentData = allCars.filter(c => {
      if (catV && !catM && c.category !== 'Vehicle') return false;
      if (catM && !catV && c.category !== 'Motorcycle') return false;
      if (c.price < pmin || c.price > pmax) return false;
      if (c.year  < ymin || c.year  > ymax) return false;
      if (locs.size && !locs.has(c.location)) return false;
      if (bods.size && !bods.has(c.body)) return false;
      if (brs.size  && !brs.has(c.brand)) return false;
      if (mds.size  && !mds.has(c.model)) return false;
      if (fa && fm) { /* no filter */ }
      else if (fa)   { if (!/auto|cvt|direct/.test(c.transmission)) return false; }
      else if (fm)   { if (!/man/.test(c.transmission)) return false; }
      if (c.odometer < omin || c.odometer > omax) return false;
      if (c.engine   < emin || c.engine   > emax) return false;
      if (fus.size && !fus.has(c.fuel)) return false;
      return true;
    });

    if (currentSortKey) {
      currentData.sort((a, b) => {
        let A = a[currentSortKey], B = b[currentSortKey];
        if (typeof A === 'string') { A = A.toLowerCase(); B = B.toLowerCase(); }
        if (A < B) return currentSortDir === 'asc' ? -1 : 1;
        if (A > B) return currentSortDir === 'asc' ? 1 : -1;
        return 0;
      });
    }

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

  // 5. Paginate results
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
        <td><a href="#" class="view-link" data-url="${c.url}">View</a></td>
      `;
      tbody.appendChild(row);
    }
    displayCount = end;
    document.getElementById('load-more').style.display = displayCount < currentData.length ? 'block' : 'none';
  }

  // 6. Open modal & fetch images via Codetabs proxy
  async function openImageModal(pageUrl) {
    const proxy = 'https://api.codetabs.com/v1/proxy?quest=';
    try {
      const res  = await fetch(proxy + encodeURIComponent(pageUrl));
      const html = await res.text();
      const doc  = new DOMParser().parseFromString(html, 'text/html');
      const slide = doc.querySelector('ul.slides');
      if (!slide) {
        alert('No image gallery found.');
        return;
      }
      let urls = [];
      slide.querySelectorAll('li a').forEach(a => {
        const img = a.querySelector('img');
        const src = img?.getAttribute('data-origin') || a.href;
        if (src) urls.push(src);
      });
      urls = [...new Set(urls)];
      const bigImgs = [];
      await Promise.all(urls.map(u => new Promise(r => {
        const i = new Image();
        i.onload = () => {
          if (i.naturalWidth >= 400 && i.naturalHeight >= 400) bigImgs.push(u);
          r();
        };
        i.onerror = () => r();
        i.src = u;
      })));
      showModalGallery(bigImgs);
    } catch (err) {
      console.error('Error loading gallery:', err);
      alert('Could not load images (CORS proxy failed).');
    }
  }

  let modalImages = [], currentIndex = 0;
  function showModalGallery(images) {
    if (!images.length) {
      alert('No images ≥400×400 found.');
      return;
    }
    modalImages = images;
    currentIndex = 0;
    const modal   = document.getElementById('image-modal');
    const img     = document.getElementById('modal-img');
    const prev    = document.getElementById('prev-btn');
    const next    = document.getElementById('next-btn');
    const closeB  = document.querySelector('.modal-close');
    img.src = modalImages[0];
    modal.style.display = 'flex';
    prev.onclick = () => {
      currentIndex = (currentIndex - 1 + modalImages.length) % modalImages.length;
      img.src = modalImages[currentIndex];
    };
    next.onclick = () => {
      currentIndex = (currentIndex + 1) % modalImages.length;
      img.src = modalImages[currentIndex];
    };
    closeB.onclick = () => { modal.style.display = 'none'; };
  }
});
