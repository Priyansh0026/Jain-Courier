// Default config of supported courier partners with detection rules
const DEFAULT_COURIER_PARTNERS = [
  {
    id: 'delhivery',
    name: 'Delhivery',
    logo: '🚚',
    color: '#E35E20',
    regex: /^[1-4]\d{11}$/,
    placeholder: 'e.g. 129384729102'
  },
  {
    id: 'dtdc',
    name: 'DTDC',
    logo: '✈️',
    color: '#0033A0',
    regex: /^[A-Z]\d{8}$/i,
    placeholder: 'e.g. D58392019'
  },
  {
    id: 'bluedart',
    name: 'Blue Dart',
    logo: '📦',
    color: '#FFCC00',
    regex: /^\d{11}$/,
    placeholder: 'e.g. 30294857283'
  },
  {
    id: 'speedpost',
    name: 'Speed Post',
    logo: '✉️',
    color: '#EF3E36',
    regex: /^[A-Z]{2}\d{9}[A-Z]{2}$/i,
    placeholder: 'e.g. EM987654321IN'
  },
  {
    id: 'fedex',
    name: 'FedEx',
    logo: '💨',
    color: '#4D148C',
    regex: /^\d{12}$/,
    placeholder: 'e.g. 783928192038'
  },
  {
    id: 'dhl',
    name: 'DHL Express',
    logo: '🌍',
    color: '#D40511',
    regex: /^\d{10}$/,
    placeholder: 'e.g. 9283746501'
  }
];

let COURIER_PARTNERS = [];

// Initialize courier partners from localStorage or fallback to defaults
function initCourierPartners() {
  const stored = localStorage.getItem('jcms_couriers');
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      COURIER_PARTNERS = parsed.map(p => {
        // Re-hydrate regex string to RegExp object
        let regObj;
        if (typeof p.regex === 'string') {
          const match = p.regex.match(/^\/(.*?)\/([gimy]*)$/);
          if (match) {
            regObj = new RegExp(match[1], match[2]);
          } else {
            regObj = new RegExp(p.regex);
          }
        } else {
          regObj = p.regex;
        }
        return { ...p, regex: regObj };
      });
    } catch (e) {
      console.error('Failed to parse jcms_couriers from localStorage', e);
      COURIER_PARTNERS = [...DEFAULT_COURIER_PARTNERS];
    }
  } else {
    COURIER_PARTNERS = [...DEFAULT_COURIER_PARTNERS];
    saveCourierPartners();
  }
}

// Save active courier partners list to storage
function saveCourierPartners() {
  const serialized = COURIER_PARTNERS.map(p => ({
    ...p,
    regex: p.regex.toString() // Convert RegExp to regex string /pattern/flags
  }));
  localStorage.setItem('jcms_couriers', JSON.stringify(serialized));
}

// Detect courier brand from Tracking ID
function detectCourier(trackingId) {
  const cleanedId = trackingId.trim();
  for (const partner of COURIER_PARTNERS) {
    if (partner.regex && partner.regex.test(cleanedId)) {
      return partner.id;
    }
  }
  return 'other'; // Falls back if no rules match
}

// Initial mock data
const INITIAL_SCANS = [
  {
    id: 'TXN-93829',
    trackingId: '129384729102',
    courierId: 'delhivery',
    weight: 0.45,
    status: 'scanned',
    timestamp: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
    notes: 'Urgent Document Pack'
  },
  {
    id: 'TXN-93828',
    trackingId: 'D58392019',
    courierId: 'dtdc',
    weight: 1.20,
    status: 'scanned',
    timestamp: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
    notes: 'Fragile Box'
  },
  {
    id: 'TXN-93827',
    trackingId: '30294857283',
    courierId: 'bluedart',
    weight: 0.85,
    status: 'scanned',
    timestamp: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
    notes: ''
  }
];

// Automatically run initialization when script is loaded
initCourierPartners();

if (typeof module !== 'undefined') {
  module.exports = { COURIER_PARTNERS, detectCourier, INITIAL_SCANS, initCourierPartners, saveCourierPartners };
}
