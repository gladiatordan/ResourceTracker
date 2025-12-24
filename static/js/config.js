const ALL_PLANETS = ["Corellia", "Dantooine", "Dathomir", "Endor", "Kashyyyk", "Lok", "Mustafar", "Naboo", "Rori", "Talus", "Tatooine", "Yavin"];

// Selection states used by filters and sorting
let currentSelectedId = 1; 
let currentSelectedLabel = "Resources";
let sortStack = [
	{ key: 'spawned_at', direction: 'asc' }, 
	{ key: 'is_active', direction: 'asc' }
];
let rawResourceData = [];
let taxonomyData = [];
let taxonomyMap = {};