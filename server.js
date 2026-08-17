const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname)));

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('MongoDB Connected Successfully!'))
  .catch(err => console.log('MongoDB Connection Error: ', err));

const keySchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  expiry: { type: Date, required: true },
  maxDevices: { type: Number, default: 1 },
  devices: { type: [String], default: [] },
  status: { type: String, default: 'Active' },
  createdBy: { type: String, default: 'Admin' }
});

const resellerSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  credits: { type: Number, default: 0 }
});

const LicenseKey = mongoose.model('LicenseKey', keySchema);
const Reseller = mongoose.model('Reseller', resellerSchema);

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// API: Generate Key (Admin)
app.post('/api/generate', async (req, res) => {
  try {
    const { key, hoursValid, maxDevices } = req.body;
    const expiryDate = new Date(Date.now() + (hoursValid || 24) * 60 * 60 * 1000);
    const newKey = new LicenseKey({ key, expiry: expiryDate, maxDevices: maxDevices || 1, status: 'Active', createdBy: 'Admin' });
    await newKey.save();
    res.json({ success: true, message: 'Key generated successfully!', data: newKey });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// API: Get All Keys (Admin)
app.get('/api/keys', async (req, res) => {
  try {
    const keys = await LicenseKey.find().sort({ _id: -1 });
    res.json({ success: true, data: keys });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// API: Delete Key
app.delete('/api/key/:id', async (req, res) => {
  try {
    await LicenseKey.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Key deleted successfully!' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// API: Add Reseller (Admin only creates/adds credits)
app.post('/api/add-reseller', async (req, res) => {
  try {
    const { username, credits } = req.body;
    if (!username) return res.status(400).json({ success: false, message: 'KEY required!' });

    let reseller = await Reseller.findOne({ username });
    if (reseller) {
      if (credits !== undefined && credits > 0) {
        reseller.credits += Number(credits);
        await reseller.save();
      }
    } else {
      reseller = new Reseller({ username, credits: Number(credits) || 0 });
      await reseller.save();
    }
    res.json({ success: true, message: 'Reseller ready!', data: reseller });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// API: Verify Reseller Login (Strictly checks database)
app.post('/api/verify-reseller', async (req, res) => {
  try {
    const { username } = req.body;
    const reseller = await Reseller.findOne({ username });
    if (!reseller) {
      return res.json({ success: false, message: 'Invalid Reseller Key/Username!' });
    }
    res.json({ success: true, data: reseller });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// API: Reseller Generate Key
app.post('/api/reseller-generate', async (req, res) => {
  try {
    const { resellerUsername, key, hoursValid, maxDevices } = req.body;
    
    const reseller = await Reseller.findOne({ username: resellerUsername });
    if (!reseller || reseller.credits <= 0) {
      return res.status(403).json({ success: false, message: 'No Credits Left or Invalid Key!' });
    }

    const expiryDate = new Date(Date.now() + (hoursValid || 24) * 60 * 60 * 1000);
    const newKey = new LicenseKey({ key, expiry: expiryDate, maxDevices: maxDevices || 1, status: 'Active', createdBy: resellerUsername });
    await newKey.save();

    reseller.credits -= 1; 
    await reseller.save();

    res.json({ success: true, message: 'Key Generated!', data: newKey, remainingCredits: reseller.credits });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// API: Verify Key
app.post('/api/verify', async (req, res) => {
  try {
    const { key, deviceId } = req.body;
    if (!key || !deviceId) return res.status(400).json({ success: false, message: 'Required fields missing!' });

    const foundKey = await LicenseKey.findOne({ key: key });
    if (!foundKey) return res.json({ success: false, message: 'Invalid Key!' });
    if (foundKey.status === 'Banned') return res.json({ success: false, message: 'Key is Banned!' });
    if (new Date() > new Date(foundKey.expiry)) {
      foundKey.status = 'Expired';
      await foundKey.save();
      return res.json({ success: false, message: 'Key has Expired!' });
    }

    if (foundKey.devices.includes(deviceId)) return res.json({ success: true, message: 'Key Verified!' });
    if (foundKey.devices.length >= foundKey.maxDevices) return res.json({ success: false, message: 'Device limit reached!' });

    foundKey.devices.push(deviceId);
    await foundKey.save();
    res.json({ success: true, message: 'Key Verified & Device registered!' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
