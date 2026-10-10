let currentCategory = 'all';

function filterCategory(category, event) {
    currentCategory = category;
    const buttons = document.querySelectorAll('.filter-btn');
    buttons.forEach(btn => btn.classList.remove('active'));
    if(event && event.target) {
        event.target.classList.add('active');
    }
    applyFilters();
}

function searchProducts() {
    applyFilters();
}

function applyFilters() {
    const query = document.getElementById('searchInput').value.toLowerCase().trim();
    const cards = document.querySelectorAll('.product-card');

    cards.forEach(card => {
        const category = card.getAttribute('data-category');
        const name = card.getAttribute('data-name');
        
        const matchesCategory = (currentCategory === 'all' || category === currentCategory);
        const matchesSearch = name.includes(query);

        if (matchesCategory && matchesSearch) {
            card.style.display = 'block';
        } else {
            card.style.display = 'none';
        }
    });
}