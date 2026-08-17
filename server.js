const express = require('express');
const mongoose = require('mongoose');
require('dotenv').config();

const app = express();
app.use(express.json());

// 1. MongoDB Connection
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('MongoDB Connected Successfully!'))
  .catch(err => console.log('MongoDB Connection Error: ', err));

// 2. Database Schema (Keys के लिए स्ट्रक्चर)
const keySchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  expiry: { type: Date, required: true },
  maxDevices: { type: Number, default: 1 },
  devices: { type: [String], default: [] },
  status: { type: String, default: 'Active' } // Active, Banned, Expired
});

const LicenseKey = mongoose.model('LicenseKey', keySchema);

// Test Route
app.get('/', (req, res) => {
  res.send('Server is running and Connected to DB!');
});

// ==========================================
// API 1: Generate Key (की बनाने के लिए)
// ==========================================
app.post('/api/generate', async (req, res) => {
  try {
    const { key, hoursValid, maxDevices } = req.body;
    
    // Expiry time calculate करना (घंटों के हिसाब से)
    const expiryDate = new Date(Date.now() + (hoursValid || 24) * 60 * 60 * 1000);

    const newKey = new LicenseKey({
      key: key,
      expiry: expiryDate,
      maxDevices: maxDevices || 1,
      status: 'Active'
    });

    await newKey.save();
    res.json({ success: true, message: 'Key generated successfully!', data: newKey });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// API 2: Verify / Check Key (गेम या ऐप के लिए मुख्य चेकिंग)
// ==========================================
app.post('/api/verify', async (req, res) => {
  try {
    const { key, deviceId } = req.body;

    if (!key || !deviceId) {
      return res.status(400).json({ success: false, message: 'Key and DeviceID are required!' });
    }

    // डेटाबेस में की ढूँढें
    const foundKey = await LicenseKey.findOne({ key: key });

    if (!foundKey) {
      return res.json({ success: false, message: 'Invalid Key!' });
    }

    // Check 1: Ban Status Check
    if (foundKey.status === 'Banned') {
      return res.json({ success: false, message: 'This key has been Banned!' });
    }

    // Check 2: Expiry Date Check
    if (new Date() > new Date(foundKey.expiry)) {
      foundKey.status = 'Expired';
      await foundKey.save();
      return res.json({ success: false, message: 'Key has Expired!' });
    }

    // Check 3: Device ID Check & Limit Check
    if (foundKey.devices.includes(deviceId)) {
      return res.json({ success: true, message: 'Key Verified Successfully!' });
    }

    if (foundKey.devices.length >= foundKey.maxDevices) {
      return res.json({ success: false, message: 'Device limit reached for this key!' });
    }

    // नया डिवाइस सेव करो
    foundKey.devices.push(deviceId);
    await foundKey.save();

    res.json({ success: true, message: 'Device registered and Key Verified successfully!' });

  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// API 3: Ban Key (की को बैन करने के लिए)
// ==========================================
app.post('/api/ban', async (req, res) => {
  try {
    const { key } = req.body;
    const foundKey = await LicenseKey.findOne({ key: key });

    if (!foundKey) {
      return res.json({ success: false, message: 'Key not found!' });
    }

    foundKey.status = 'Banned';
    await foundKey.save();

    res.json({ success: true, message: 'Key successfully Banned!' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Server Start
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
