const ALL_PLANETS = ["Corellia", "Dantooine", "Dathomir", "Endor", "Kashyyyk", "Lok", "Mustafar", "Naboo", "Rori", "Talus", "Tatooine", "Yavin"];

// Selection states used by filters and sorting
let currentSelectedId = 1; 
let currentSelectedLabel = "Resources";
let selectedResourceName = null;
let originalModalData = null;
let sortStack = [
	{ key: 'date_reported', direction: 'desc' }, 
	{ key: 'is_active', direction: 'desc' }
];
let rawResourceData = [];
let taxonomyData = [];
let taxonomyMap = {};
// config.js
let currentPage = 1;
let resultsPerPage = 50;
let filteredData = []; // To store data after filters but before pagination