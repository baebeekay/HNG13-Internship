const express = require('express');
const router = express.Router();
const fetchCatFact = require('../utils/fetchCatFact');

router.get('/', async (req, res, next) => {
  try {
    // Fetch a random cat fact
    const catFact = await fetchCatFact();

    // Construct response
    const response = {
      status: 'success',
      user: {
        email: 'baebeekay6@gmail.com',
        name: 'Ndukwe Amarachi Kalu',
        stack: 'Node.js/Express', 
      },
      timestamp: new Date().toISOString(), // Current UTC time in ISO 8601
      fact: catFact || 'No cat fact available at this time.', // Fallback if API fails
    };

    // Set Content-Type and send response
    res.setHeader('Content-Type', 'application/json');
    res.status(200).json(response);
  } catch (error) {
    next(error); // Pass error to error-handling middleware
  }
});

module.exports = router;