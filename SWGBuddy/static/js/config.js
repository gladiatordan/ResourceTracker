const ALL_PLANETS = ["Corellia", "Dantooine", "Dathomir", "Endor", "Kashyyyk", "Lok", "Mustafar", "Naboo", "Rori", "Talus", "Tatooine", "Yavin"];

// Global State
let currentSelectedLabel = "Resources"; // Default to Root
let selectedResourceName = null;      // For row highlighting

// Data Stores
let rawResourceData = [];       // Master list from DB
let filteredData = [];          // List after search/category filters
let LAST_SYNC_TIMESTAMP = 0;    // For delta updates
let pollingInterval = null;

// Pagination
let currentPage = 1;
let resultsPerPage = 50;


// Put these here so no more edits clobber them
// Helpers...
function formatStat(val, isRating=false) {
	if (val === null || val === undefined || val === 0 || val === "0") return "-";
	if (isRating) return (val * 100).toFixed(1) + '%';
	return val;
}

function formatDate(epoch) {
	if (!epoch) return "-";
	const d = new Date(epoch * 1000);
	return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
}
