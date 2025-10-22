
const express = require('express');
const router = express.Router();

// Define the callback function
const handlePost = (req, res) => {
  res.json({ message: 'POST request received' });
};

// Register the POST route
router.post('/analyze', handlePost);

module.exports = router;
