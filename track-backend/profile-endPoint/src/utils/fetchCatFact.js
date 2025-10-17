const axios = require('axios');

const fetchCatFact = async () => {
  try {
    // Set timeout to 5 seconds
    const response = await axios.get('https://catfact.ninja/fact', {
      timeout: 5000, // 5-second timeout
    });
    return response.data.fact;
  } catch (error) {
    console.error('Error fetching cat fact:', error.message);
    return null; // Return null to trigger fallback in the route
  }
};

module.exports = fetchCatFact;