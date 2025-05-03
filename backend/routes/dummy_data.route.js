// dummy_data.route.js
import express from 'express';
import DummyData from '../models/dummy_data.model.js';

const router = express.Router();

// Get latest reading for all fields
router.get('/latest', async (req, res) => {
  try {
    // Get the absolute latest reading from the database
    const latestData = await DummyData.findOne()
      .sort({ timestamp: -1 })  // Sort by timestamp in descending order
      .lean();  // Convert to plain JavaScript object for better performance
    
    if (!latestData) {
      return res.json([]);
    }
    
    res.json([latestData]);  // Return as array to maintain compatibility
  } catch (error) {
    console.error('Error fetching latest data:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get list of unique fields
router.get('/fields', async (req, res) => {
    try {
      const fields = await DummyData.distinct('field_id');
      res.json(fields);
    } catch (error) {
      console.error('Error fetching fields:', error);
      res.status(500).json({ error: 'Server error' });
    }
  });
  

// Get historical data for a specific field
router.get('/historical/:fieldId', async (req, res) => {
  try {
    const { fieldId } = req.params;
    const { hours = 24 } = req.query; // default 24h if not specified
    
    const startTime = new Date();
    startTime.setHours(startTime.getHours() - parseInt(hours));
    
    const data = await DummyData.find({
      field_id: fieldId,
      timestamp: { $gte: startTime }
    }).sort({ timestamp: 1 });
    
    res.json(data);
  } catch (error) {
    console.error('Error fetching historical data:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
